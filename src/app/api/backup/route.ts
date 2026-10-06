import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { presentedToken, secretMatches } from "@/lib/secretCompare";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { buildExport } from "@/lib/exportSite";
import { bundleMediaStreaming, isLocalUpload } from "@/lib/exportMedia";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/**
 * A scheduled backup, for a cron job to call.
 *
 * Settings → Export needs a person at a keyboard; this does not. Given the
 * secret in BACKUP_TOKEN it writes one zip — the full content export plus
 * every local upload — into `backups/` next to the app, and keeps the newest
 * seven. On cPanel that is one line under Cron Jobs:
 *
 *     curl -s "https://example.com/api/backup?token=…" >/dev/null
 *
 * The folder is outside `public/`, so the archives are never served. They are
 * on the same disk as the site, which is protection against a bad edit and a
 * bad update, not against losing the host — download one now and then.
 *
 * Without BACKUP_TOKEN the route does nothing at all, and a wrong token is
 * indistinguishable from a missing one.
 */
/**
 * The shortest gap between two backups, in hours (BACKUP_MIN_HOURS, default 20).
 *
 * Only the newest seven are kept, so with no limit anyone holding the token
 * could run it seven times in a minute and every real backup would be gone,
 * replaced by copies of whatever the site looks like now. With a 20-hour gap
 * that takes most of a week — long enough to notice — and a daily cron is
 * never affected.
 */
const minGapMs = () => Math.max(0, Number(process.env.BACKUP_MIN_HOURS ?? 20) || 0) * 3600_000;

/** One backup at a time: two at once doubled the memory a large library needs. */
let running = false;

export async function GET(req: NextRequest) {
  const expected = (process.env.BACKUP_TOKEN ?? "").trim();
  const given = presentedToken(req, "x-backup-token");
  if (!secretMatches(expected, given)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (running) {
    return NextResponse.json({ error: "A backup is already running." }, { status: 429, headers: { "Retry-After": "600" } });
  }

  running = true;
  try {
    const dir0 = path.join(process.cwd(), "backups");
    const previous = (await readdir(dir0).catch(() => [] as string[])).filter((f) => /^backup-.*\.zip$/.test(f)).sort();
    const newest = previous[previous.length - 1];
    if (newest) {
      const age = Date.now() - (await stat(path.join(dir0, newest))).mtimeMs;
      if (age < minGapMs()) {
        const wait = Math.ceil((minGapMs() - age) / 60_000);
        return NextResponse.json(
          { error: `The last backup (${newest}) is recent. The next one can run in ${wait} minutes.`, file: `backups/${newest}` },
          { status: 429, headers: { "Retry-After": String(wait * 60), "Cache-Control": "no-store" } }
        );
      }
    }

    const settings = await getSiteSettings();
    const zip = new JSZip();

    const payload = await buildExport(settings, siteUrl(settings));
    // The name Import looks for. Backups used to write `site.json`, and
    // Import refused them as "not a site export" — no backup could be restored.
    zip.file("content.json", JSON.stringify(payload, null, 2));

    const rows = await db.select({ url: media.url }).from(media);
    const local = rows.map((r) => r.url).filter(isLocalUpload);
    const bundled = await bundleMediaStreaming(zip, local);

    const dir = path.join(process.cwd(), "backups");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup-${stamp}.zip`;
    // Streamed from the uploads to the file: the whole archive never exists
    // in memory at once (see bundleMediaStreaming). Written under a temporary
    // name and renamed at the end, so a backup that dies halfway is never
    // mistaken for a complete one — or counted among the seven kept.
    const partial = path.join(dir, `${filename}.part`);
    try {
      await pipeline(
        zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 6 } }),
        createWriteStream(partial)
      );
      await rename(partial, path.join(dir, filename));
    } catch (e) {
      await unlink(partial).catch(() => {});
      throw e;
    }

    // Keep the newest seven. A nightly cron otherwise fills the disk in a year.
    const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 7) || 7);
    const existing = (await readdir(dir)).filter((f) => /^backup-.*\.zip$/.test(f)).sort();
    const removed: string[] = [];
    for (const old of existing.slice(0, Math.max(0, existing.length - keep))) {
      await unlink(path.join(dir, old)).catch(() => {});
      removed.push(old);
    }

    const size = (await stat(path.join(dir, filename))).size;
    return NextResponse.json(
      {
        ok: true,
        file: `backups/${filename}`,
        bytes: size,
        counts: payload.counts,
        media: { included: bundled.included, missing: bundled.missing.length, remote: bundled.skippedRemote },
        removed,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backup failed." }, { status: 500 });
  } finally {
    running = false;
  }
}
