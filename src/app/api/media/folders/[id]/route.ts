import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media, mediaFolders } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { FORBIDDEN, isAuthor } from "@/lib/authz";
import { eq } from "drizzle-orm";
import { deleteMediaRow } from "@/lib/mediaDelete";

/**
 * Rename/move (PATCH) or delete (DELETE) a media folder.
 * Deleting moves contained files to the deleted folder's parent (or root)
 * unless ?mode=delete, which deletes the files too — except any file that
 * is in use, which refuses exactly as it does from the media grid and is
 * moved to the parent instead, with the count reported to the caller.
 * Child folders always become top-level.
 *
 * Both verbs change the library's shared structure, so both are
 * admin/editor only (SEC-003).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const folderId = parseInt(id, 10);
    if (!Number.isFinite(folderId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const patch: { name?: string; parentId?: number | null } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
      if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
      patch.name = name;
    }

    if (body.parentId !== undefined) {
      if (body.parentId === null) {
        patch.parentId = null;
      } else {
        const parentId = parseInt(String(body.parentId), 10);
        if (!Number.isFinite(parentId) || parentId === folderId) {
          return NextResponse.json({ error: "Invalid parent folder" }, { status: 400 });
        }
        // Can't move a folder into its own descendant (would create a cycle).
        let cursor: number | null = parentId;
        const seen = new Set<number>();
        while (cursor !== null && !seen.has(cursor)) {
          seen.add(cursor);
          if (cursor === folderId) {
            return NextResponse.json({ error: "Cannot move a folder into itself" }, { status: 400 });
          }
          const row: { parentId: number | null } | undefined = await db.query.mediaFolders.findFirst({
            where: eq(mediaFolders.id, cursor),
            columns: { parentId: true },
          });
          cursor = row?.parentId ?? null;
        }
        const parent = await db.query.mediaFolders.findFirst({ where: eq(mediaFolders.id, parentId) });
        if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
        patch.parentId = parentId;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const [folder] = await db.update(mediaFolders).set(patch).where(eq(mediaFolders.id, folderId)).returning();
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ folder });
  } catch {
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const folderId = parseInt(id, 10);
    if (!Number.isFinite(folderId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const folder = await db.query.mediaFolders.findFirst({ where: eq(mediaFolders.id, folderId) });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ?mode=delete also deletes the folder's files; default moves them to the
    // deleted folder's parent (or root) so nothing is lost by accident.
    const mode = req.nextUrl.searchParams.get("mode");
    let keptFiles = 0;
    if (mode === "delete") {
      const rows = await db.query.media.findMany({
        where: eq(media.folderId, folderId),
        columns: { id: true },
      });
      for (const r of rows) {
        // No implicit force (SEC-003): this used to pass { force: true },
        // which deleted files other people's published posts were using,
        // with no warning. A file deleteMediaRow refuses — in use, or its
        // storage unreachable — survives, and is moved to the parent with
        // the default-mode files below; the count goes back to the caller.
        const res = await deleteMediaRow(r.id);
        if (!res.ok) keptFiles++;
      }
      if (keptFiles > 0) {
        await db.update(media).set({ folderId: folder.parentId }).where(eq(media.folderId, folderId));
      }
    } else {
      await db.update(media).set({ folderId: folder.parentId }).where(eq(media.folderId, folderId));
    }
    // Child folders become top-level.
    await db.update(mediaFolders).set({ parentId: null }).where(eq(mediaFolders.parentId, folderId));
    await db.delete(mediaFolders).where(eq(mediaFolders.id, folderId));

    return NextResponse.json({ success: true, ...(mode === "delete" ? { keptFiles } : {}) });
  } catch {
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
