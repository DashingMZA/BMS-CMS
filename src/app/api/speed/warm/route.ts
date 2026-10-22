import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { crawlBatch, warmPaths } from "@/lib/warmCache";
import { recordError } from "@/lib/errorLog";

/**
 * "Warm now": `batch` runs one crawler batch from wherever it stopped (and
 * ignores the pass interval); `home` fetches just the front page.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const settings = await getSiteSettings();
  try {
    if (body.mode === "home") {
      const r = await warmPaths(["/"], settings);
      return NextResponse.json({ fetched: r.fetched, failed: r.failed, ms: r.ms }, { headers: { "Cache-Control": "no-store" } });
    }
    const r = await crawlBatch(settings, { force: true });
    return NextResponse.json(
      { fetched: r.fetched, failed: r.failed, ms: r.ms, cursor: r.cursor, total: r.total, completedPass: r.completedPass },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // The detail goes to the error log, not the response (SEC-007): a raw
    // internal message can name schema and host internals.
    await recordError({
      source: "route",
      path: "/api/speed/warm",
      method: req.method,
      message: err instanceof Error ? err.message : "Warm-up failed.",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Warm-up failed." }, { status: 500 });
  }
}
