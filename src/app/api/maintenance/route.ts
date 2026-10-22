import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { previewCleanup, runCleanup } from "@/lib/maintenance";
import { recordError } from "@/lib/errorLog";

/** Database clean-up: GET previews, POST runs. Administrators only. */
export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await previewCleanup(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await runCleanup();
    return NextResponse.json({ ...result, preview: await previewCleanup() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // The detail goes to the error log, not the response (SEC-007): a raw
    // database message can name schema and host internals.
    await recordError({
      source: "route",
      path: "/api/maintenance",
      method: req.method,
      message: err instanceof Error ? err.message : "Clean-up failed.",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Clean-up failed." }, { status: 500 });
  }
}
