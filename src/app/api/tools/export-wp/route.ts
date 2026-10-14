import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { buildWxrExport } from "@/lib/wpExport";

/**
 * Downloads the site's content as a WordPress WXR `.xml` file, readable by
 * WordPress's own importer (Tools → Import → WordPress).
 *
 * Administrators only, for the same reason the JSON export is: it carries
 * the site's whole content.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  const language = req.nextUrl.searchParams.get("language") || undefined;
  const xml = await buildWxrExport({ language });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="bms-wordpress-export-${stamp}.xml"`,
    },
  });
}
