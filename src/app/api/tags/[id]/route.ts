import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { termSlug } from "@/lib/utils";
import { recordSlugChange, releaseRedirectFrom } from "@/lib/autoRedirect";
import { tagPath } from "@/lib/permalinks";
import { getSiteSettings } from "@/lib/settings";
import { numericId } from "@/lib/routeParams";
import { revalidatePublicSite } from "@/lib/revalidateSite";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure: an author files posts under terms, but
    // renaming or deleting one changes every URL it appears in.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();

    const existing = await db.query.tags.findFirst({
      where: eq(tags.id, numId),
      columns: { slug: true, language: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const slug = termSlug(String(body.slug || body.name || ""), "tag");
    // Slugs are unique per language. Without this check the unique index
    // threw, the catch-all answered 500, and the Tags screen — which did not
    // look at the answer — showed the edit as saved.
    const clash = await db.query.tags.findFirst({
      where: and(eq(tags.language, existing.language), eq(tags.slug, slug), ne(tags.id, numId)),
      columns: { id: true },
    });
    if (clash) {
      return NextResponse.json({ error: `Another tag in this language already uses the slug "${slug}".` }, { status: 409 });
    }

    const [tag] = await db.update(tags).set({
      name: body.name,
      slug,
      description: body.description,
    }).where(eq(tags.id, numId)).returning();

    // Posts, pages and categories keep their old address answering when the
    // slug changes; tags did not, so a renamed tag's archive became a 404
    // for every link and every search result pointing at it.
    const settings = await getSiteSettings();
    const cfPaths = tag ? [tagPath(tag.slug, tag.language, settings)] : [];
    if (tag) await releaseRedirectFrom(cfPaths[0]);
    if (tag && existing.slug !== tag.slug) {
      const from = tagPath(existing.slug, existing.language, settings);
      const to = tagPath(tag.slug, tag.language, settings);
      cfPaths.push(from);
      if (from !== to) await recordSlugChange(from, to);
    }

    // A tag's name and slug are on every post that carries it, and its
    // archive is a cached page — see lib/revalidateSite.ts. At Cloudflare
    // only the archive is dropped; the tag chip on posts refreshes with the
    // edge's normal expiry rather than by emptying the whole zone.
    revalidatePublicSite({ cloudflarePaths: cfPaths });
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure: an author files posts under terms, but
    // renaming or deleting one changes every URL it appears in.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const doomed = await db.query.tags.findFirst({ where: eq(tags.id, numId), columns: { slug: true, language: true } });
    // The join rows go with it: post_tags cascades on delete.
    await db.delete(tags).where(eq(tags.id, numId));
    revalidatePublicSite({ cloudflarePaths: doomed ? [tagPath(doomed.slug, doomed.language, await getSiteSettings())] : [] });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
