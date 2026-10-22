import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { purgeCloudflarePaths } from "@/lib/revalidateSite";
import { WIDTHS as IMAGE_WIDTHS, QUALITIES as IMAGE_QUALITIES } from "@/lib/logoSrc";
import { isLocalUpload } from "@/lib/exportMedia";
import { deleteMediaFile } from "@/lib/mediaStorage";
import { usesOf } from "./mediaUsage";

/**
 * Delete one media row and its files. Shared by the single and bulk delete
 * endpoints so both follow the same steps: permission is checked by the
 * caller, usage is reported as a 409-style conflict unless force is set.
 */
export async function deleteMediaRow(
  numId: number,
  opts: { force?: boolean } = {}
): Promise<{ ok: true } | { ok: false; error: string; inUse?: string[] }> {
  const existing = await db.query.media.findFirst({
    where: eq(media.id, numId),
    columns: { url: true, filename: true, storage: true, storageKey: true },
  });
  if (!existing) return { ok: false, error: "Not found" };

  if (!opts.force) {
    const uses = await usesOf(existing.url);
    if (uses.length > 0) {
      return {
        ok: false,
        error: `Still used in ${uses.join(", ")}.`,
        inUse: uses,
      };
    }
  }

  // Files stored by a selectable driver (S3 / R2 / GitHub) are deleted from
  // that driver — the row remembers it, because the site's active driver may
  // have changed since the upload. A failed remote delete must not strand
  // the row: the admin is told, and can retry once the storage is reachable.
  if (existing.storage === "s3" || existing.storage === "r2" || existing.storage === "github") {
    try {
      await deleteMediaFile({
        driver: existing.storage,
        key: existing.storageKey,
        url: existing.url,
        filename: existing.filename,
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "The file could not be deleted from its storage.",
      };
    }
  } else if (isLocalUpload(existing.url)) {
    const file = path.join(process.cwd(), "public", "uploads", path.basename(existing.url));
    await unlink(file).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
    const name = path.basename(existing.url);
    const stem = name.replace(/\.[^.]+$/, "");
    await unlink(path.join(process.cwd(), "uploads-originals", name)).catch(() => undefined);
    const sizedDir = path.join(process.cwd(), "public", "uploads", "_sized");
    const sized = await readdir(sizedDir).catch(() => [] as string[]);
    for (const f of sized) {
      if (f.startsWith(`${stem}-`) && /^\d+w\.webp$/.test(f.slice(stem.length + 1)))
        await unlink(path.join(sizedDir, f)).catch(() => undefined);
    }
  } else if (existing.storage === "blob" || (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(existing.url))) {
    await deleteMediaFile({ driver: "blob", key: existing.storageKey, url: existing.url, filename: existing.filename }).catch(
      () => undefined
    );
  }

  await db.delete(media).where(eq(media.id, numId));

  if (existing.url.startsWith("/")) {
    const enc = encodeURIComponent(existing.url);
    const variants = IMAGE_WIDTHS.flatMap((w) =>
      IMAGE_QUALITIES.map((q) => `/_next/image?url=${enc}&w=${w}&q=${q}`)
    );
    purgeCloudflarePaths([existing.url, ...variants]);
  }
  return { ok: true };
}
