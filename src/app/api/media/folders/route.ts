import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaFolders } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { FORBIDDEN, isAuthor } from "@/lib/authz";
import { asc, eq } from "drizzle-orm";

/**
 * Media folders: list (GET) and create (POST).
 * Listing is any signed-in user — an author files their own uploads. The
 * structure itself is shared, so creating, renaming, moving and deleting
 * folders is admin/editor work (SEC-003): until this gate existed, any
 * author could delete a folder together with every file in it.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const folders = await db.query.mediaFolders.findMany({
      orderBy: [asc(mediaFolders.name)],
    });
    return NextResponse.json({ folders });
  } catch {
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

    let parentId: number | null = null;
    if (body.parentId != null) {
      parentId = parseInt(String(body.parentId), 10);
      if (!Number.isFinite(parentId)) return NextResponse.json({ error: "Invalid parent folder" }, { status: 400 });
      const parent = await db.query.mediaFolders.findFirst({ where: eq(mediaFolders.id, parentId) });
      if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }

    const [folder] = await db.insert(mediaFolders).values({ name, parentId }).returning();
    return NextResponse.json({ folder });
  } catch {
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
