import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media, mediaFolders } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

/**
 * Rename/move (PATCH) or delete (DELETE) a media folder.
 * Deleting never deletes files: contained files move to the deleted folder's
 * parent (or root), and child folders become top-level.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const folderId = parseInt(id, 10);
    if (!Number.isFinite(folderId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const folder = await db.query.mediaFolders.findFirst({ where: eq(mediaFolders.id, folderId) });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Files move to the deleted folder's parent (or root) — never deleted.
    await db.update(media).set({ folderId: folder.parentId }).where(eq(media.folderId, folderId));
    // Child folders become top-level.
    await db.update(mediaFolders).set({ parentId: null }).where(eq(mediaFolders.parentId, folderId));
    await db.delete(mediaFolders).where(eq(mediaFolders.id, folderId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
