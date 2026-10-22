import { db } from "@/lib/db";
import { media, posts, pages } from "@/lib/db/schema";
import { eq, like, or } from "drizzle-orm";
import { storeMediaFile } from "@/lib/mediaStorage";

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
 */
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
      const res = await fetch(row.url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Keep the original filename when it's safe; otherwise fall back to the id.
      const safe = (row.filename || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || `wp-${row.id}`;
      const stored = await storeMediaFile(`${Date.now()}-${row.id}-${safe}`, buf, res.headers.get("content-type") || "application/octet-stream");
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
