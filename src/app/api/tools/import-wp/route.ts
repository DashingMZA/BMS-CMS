import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { importSite, ImportError } from "@/lib/importSite";
import { parseWxr, wxrToSiteExport } from "@/lib/wordpress";
import { revalidatePublicSite } from "@/lib/revalidateSite";

/**
 * Imports a WordPress WXR `.xml` export file.
 *
 * Administrators only. The file is parsed to the BMS site-export shape and
 * handed to `importSite`, so it gets the same id-remapping, skip-if-exists
 * and dry-run behaviour as the JSON import. Accepts multipart (the file) or
 * JSON (`{ xml }`) — the admin screen sends multipart.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  let xml = "";
  let dryRun = false;
  let overwrite = false;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      dryRun = form.get("dryRun") === "true";
      overwrite = form.get("overwrite") === "true";
      const upload = form.get("file");
      if (!(upload instanceof File)) {
        return NextResponse.json({ error: "No .xml file was sent." }, { status: 400 });
      }
      xml = await upload.text();
    } else {
      const body = (await req.json()) as { xml?: string; dryRun?: boolean; overwrite?: boolean };
      xml = body.xml ?? "";
      dryRun = body.dryRun === true;
      overwrite = body.overwrite === true;
    }
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  if (!xml.trim()) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }
  // A cheap guard before the parser: a WXR file is an <rss> document with
  // the WordPress export namespace.
  if (!/<rss[\s>]/.test(xml.slice(0, 2000)) || !xml.includes("wordpress.org/export")) {
    return NextResponse.json(
      { error: "That does not look like a WordPress export (.xml) file." },
      { status: 400 }
    );
  }

  let siteExport;
  try {
    siteExport = wxrToSiteExport(parseWxr(xml));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not parse the WordPress file." },
      { status: 400 }
    );
  }

  try {
    const report = await importSite(siteExport, { dryRun, overwrite });
    if (!dryRun) revalidatePublicSite();
    report.notes.push(
      "Media files themselves are not in a WordPress export — copy the site's /wp-content/uploads/ directory across, or image URLs will 404."
    );
    return NextResponse.json(report);
  } catch (e) {
    if (e instanceof ImportError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[import-wp] failed", e);
    return NextResponse.json({ error: "The import failed partway through." }, { status: 500 });
  }
}
