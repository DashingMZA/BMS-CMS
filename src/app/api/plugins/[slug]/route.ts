import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { db } from "@/lib/db";
import { plugins } from "@/lib/db/schema";
import { invalidatePluginCache, uninstallPlugin, type PluginManifest } from "@/lib/plugins";

type Ctx = { params: Promise<{ slug: string }> };

/** Enable/disable, or save settings. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { slug } = await params;
  const row = await db.query.plugins.findFirst({ where: eq(plugins.slug, slug) });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const set: Partial<typeof plugins.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.enabled === "boolean") set.enabled = body.enabled;
  if (body.settings && typeof body.settings === "object") {
    // Only keys the manifest declares, coerced to the declared type.
    const manifest = JSON.parse(row.manifest) as PluginManifest;
    const clean: Record<string, unknown> = {};
    for (const s of manifest.settings ?? []) {
      if (!(s.key in body.settings)) continue;
      const v = body.settings[s.key];
      if (s.type === "toggle") clean[s.key] = !!v;
      else if (s.type === "number") clean[s.key] = Number.isFinite(Number(v)) ? Number(v) : 0;
      else if (s.type === "select") clean[s.key] = s.options?.some((o) => o.value === String(v)) ? String(v) : (s.default ?? "");
      else clean[s.key] = String(v ?? "").slice(0, 5000);
    }
    set.settings = JSON.stringify(clean);
  }
  await db.update(plugins).set(set).where(eq(plugins.slug, slug));
  invalidatePluginCache();
  return NextResponse.json({ ok: true });
}

/** Removes the plugin and its files. Content keeps its shortcodes as text. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { slug } = await params;
  await uninstallPlugin(slug);
  return NextResponse.json({ ok: true });
}
