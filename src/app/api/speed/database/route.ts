import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { previewCleanup, runCleanup } from "@/lib/maintenance";
import { recordError } from "@/lib/errorLog";
import { pruneAllRevisions } from "@/lib/revisions";

/** Actions: revisions (trim every document to the limit) · cleanup (trash, logs, sessions). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "revisions") {
      const removed = await pruneAllRevisions();
      return NextResponse.json({ ok: true, removed }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "cleanup") {
      const result = await runCleanup();
      return NextResponse.json({ ok: true, removed: result.total, detail: result.removed, preview: await previewCleanup() }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    // The detail goes to the error log, not the response (SEC-007): a raw
    // database message can name schema and host internals.
    await recordError({
      source: "route",
      path: "/api/speed/database",
      method: req.method,
      message: err instanceof Error ? err.message : "Failed.",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "The database action failed." }, { status: 500 });
  }
}
