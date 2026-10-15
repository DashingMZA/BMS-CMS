import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media, mediaFolders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { numericId } from "@/lib/routeParams";
import { isAuthor, sessionUser, FORBIDDEN } from "@/lib/authz";
import { deleteMediaRow } from "@/lib/mediaDelete";

/**
 * Whether this session may change or remove this upload.
 *
 * Editors and administrators: any file. An author: only what they uploaded —
 * the same line WordPress draws, and the one that stops one writer from
 * deleting the hero image out of another writer's published post.
 */
function mayTouch(session: Session | null, uploadedById: string | null): boolean {
  if (!isAuthor(session)) return true;
  const me = sessionUser(session);
  return !!me && !!uploadedById && uploadedById === me.id;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.media.findFirst({ where: eq(media.id, numId), columns: { uploadedById: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!mayTouch(session, existing.uploadedById)) return NextResponse.json(FORBIDDEN, { status: 403 });
    const body = await req.json();

    // Coerced and capped. These went from the request body into the columns
    // untouched, and this is the only path that writes them — a non-string
    // reached the insert as whatever it was, and nothing bounded the length,
    // though `alt` is emitted into every `<img>` that uses this image and the
    // caption is shown under it. React escapes both at render, so the cost was
    // page weight and a 500 rather than injection. `undefined` is left alone
    // so a patch that sends one field does not blank the other.
    const text = (v: unknown, max: number) =>
      v === undefined ? undefined : v === null ? null : String(v).trim().slice(0, max);

    const [item] = await db.update(media).set({
      alt: text(body.alt, 300),
      caption: text(body.caption, 1000),
      title: text(body.title, 300),
      // Moving between folders: null = root, a number = that folder.
      // Validated against existing folders so a typo can't orphan a file.
      ...(body.folderId !== undefined
        ? {
            folderId:
              body.folderId === null
                ? null
                : (await db.query.mediaFolders.findFirst({
                    where: eq(mediaFolders.id, parseInt(String(body.folderId), 10)),
                    columns: { id: true },
                  }))
                  ? parseInt(String(body.folderId), 10)
                  : undefined,
          }
        : {}),
    }).where(eq(media.id, numId)).returning();

    return NextResponse.json({ media: item });
  } catch {
    return NextResponse.json({ error: "Failed to update media" }, { status: 500 });
  }
}

/**
 * Removes the upload — the row *and* the bytes.
 *
 * This used to delete only the database row. The file stayed in
 * `public/uploads` (or in Blob storage) forever: invisible in the library,
 * still served at its old URL, still counting against the disk. Deleting
 * from the library now means what it says. The row goes last, so a failure
 * to remove the file leaves the library honest rather than pointing at
 * nothing; a file that is already gone is not an error.
 */

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.media.findFirst({
      where: eq(media.id, numId),
      columns: { uploadedById: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!mayTouch(session, existing.uploadedById)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await deleteMediaRow(numId, { force });
    if (!result.ok) {
      if (result.inUse) {
        return NextResponse.json(
          { error: `This file is still used in ${result.inUse.join(", ")}. Deleting it leaves a broken image there.`, uses: result.inUse, code: "in_use" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}
