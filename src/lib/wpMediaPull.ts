import { lookup } from "node:dns/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { media, posts, pages } from "@/lib/db/schema";
import { eq, like, or } from "drizzle-orm";
import { storeMediaFile } from "@/lib/mediaStorage";
import { RESTORABLE } from "@/lib/exportMedia";
import { isPrivateAddress } from "@/lib/privateAddress";
import { sanitizeSvg } from "@/lib/sanitizeSvg";

/**
 * Downloads remote media files into the site's storage during a WordPress
 * import.
 *
 * WordPress exports reference images by URL but never include the files.
 * When enabled, this fetches each remote image, stores it with the active
 * storage driver (Settings → Media Storage), points the media row at the
 * stored file, and rewrites the old URLs inside post/page content so
 * nothing 404s.
 *
 * Runs after importSite so the media rows already exist. Skips anything
 * already local, anything already held by a storage driver, anything that
 * fails to download, and dry runs.
 *
 * The URLs come from an uploaded export file, so they are chosen by
 * whoever wrote it, and at first this trusted them completely: any
 * extension was stored (an .html or .php under the site's own origin), an
 * SVG was stored raw, the body had no size limit, and the address was
 * never checked — http://169.254.169.254/… fetched as happily as a photo
 * (SEC-004). The fetch below now gets the same treatment the archive
 * restore path and the link checker already had: the restore path's
 * extension allowlist, SVGs through the sanitiser, the uploader's 10 MB
 * ceiling, and every resolved address public — re-checked on each
 * redirect hop, since a redirect is just a second, unvetted URL. (As
 * linkCheck notes, a name that changes its answer between the lookup and
 * the fetch — DNS rebinding — is not covered.)
 */

/** The uploader's ceiling (api/media), applied to a fetched body too. */
const MAX_BYTES = 10 * 1024 * 1024;

/** The content type a stored file claims, from its allowlisted extension. */
const TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

/** Every address the name resolves to must be public (lib/linkCheck's rule). */
async function resolvesPublic(hostname: string): Promise<boolean> {
  try {
    const host = hostname.replace(/^\[|\]$/g, "");
    const addrs = await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * Fetches one vetted URL, following redirects by hand so each hop is
 * vetted too, and reads the body with the size ceiling enforced as it
 * arrives rather than after an unbounded buffer has already landed.
 */
async function fetchPublicFile(start: string): Promise<Buffer> {
  let url = start;
  for (let hop = 0; hop <= 5; hop++) {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Not a web address");
    if (!(await resolvesPublic(u.hostname))) throw new Error("Address is not public");
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === 5) throw new Error("Too many redirects");
      url = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("File is larger than 10 MB");
    if (!res.body) throw new Error("Empty response");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("File is larger than 10 MB");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many redirects");
}

export async function pullRemoteMedia(): Promise<{ downloaded: number; failed: number }> {
  let downloaded = 0;
  let failed = 0;

  const rows = await db.query.media.findMany({
    where: or(like(media.url, "http://%"), like(media.url, "https://%")),
    columns: { id: true, url: true, filename: true, storage: true },
  });
  if (rows.length === 0) return { downloaded, failed };

  const urlMap = new Map<string, string>();

  for (const row of rows) {
    // Already in managed storage — pulling it again would duplicate it.
    if (row.storage === "s3" || row.storage === "r2" || row.storage === "github" || row.storage === "blob") continue;
    try {
      // The extension decides what the stored file will be served as, so
      // it is allowlisted before anything is fetched — taken from the
      // filename, falling back to the URL's own path.
      const safe = (row.filename || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || `wp-${row.id}`;
      const ext = path.extname(safe).toLowerCase() || path.extname(new URL(row.url).pathname).toLowerCase();
      if (!RESTORABLE.has(ext)) throw new Error("File type is not allowed");
      let buf = await fetchPublicFile(row.url);
      // An SVG is a document: the uploader sanitises it, the archive
      // restore sanitises it, and so does this. One that does not parse
      // as a single <svg> is not stored at all.
      if (ext === ".svg") {
        const clean = sanitizeSvg(buf.toString("utf8"));
        if (!clean) throw new Error("SVG did not parse");
        buf = Buffer.from(clean.svg, "utf8");
      }
      const stored = await storeMediaFile(`${Date.now()}-${row.id}-${safe}`, buf, TYPE_BY_EXT[ext] ?? "application/octet-stream");
      await db
        .update(media)
        .set({ url: stored.url, filename: stored.filename, storage: stored.driver, storageKey: stored.key })
        .where(eq(media.id, row.id));
      urlMap.set(row.url, stored.url);
      downloaded++;
    } catch {
      failed++;
    }
  }

  // Rewrite content references so posts/pages use the local files.
  if (urlMap.size > 0) {
    const rewrite = (html: string | null): string | null => {
      if (!html) return html;
      let out = html;
      for (const [oldUrl, newUrl] of urlMap) out = out.split(oldUrl).join(newUrl);
      return out;
    };
    const [allPosts, allPages] = await Promise.all([
      db.query.posts.findMany({ columns: { id: true, content: true } }),
      db.query.pages.findMany({ columns: { id: true, content: true } }),
    ]);
    for (const p of allPosts) {
      const next = rewrite(p.content as string | null);
      if (next && next !== p.content) await db.update(posts).set({ content: next }).where(eq(posts.id, p.id));
    }
    for (const pg of allPages) {
      const next = rewrite(pg.content as string | null);
      if (next && next !== pg.content) await db.update(pages).set({ content: next }).where(eq(pages.id, pg.id));
    }
  }

  return { downloaded, failed };
}
