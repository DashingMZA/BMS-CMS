import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { purgeCloudflarePaths } from "@/lib/revalidateSite";
import { WIDTHS as IMAGE_WIDTHS, QUALITIES as IMAGE_QUALITIES } from "@/lib/logoSrc";
import { isLocalUpload } from "@/lib/exportMedia";
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
    columns: { url: true, filename: true },
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

  if (isLocalUpload(existing.url)) {
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
  } else if (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(existing.url)) {
    const { del } = await import("@vercel/blob");
    await del(existing.url).catch(() => undefined);
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
