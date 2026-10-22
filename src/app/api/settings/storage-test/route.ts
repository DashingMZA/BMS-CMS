import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN } from "@/lib/authz";
import { storageConfigFromSettings, testStorage } from "@/lib/mediaStorage";

/**
 * The Media Storage tab's "Test connection" button.
 *
 * The tab posts the storage_* values currently in its form — including ones
 * not saved yet, which is the point: an admin can fill in S3 credentials,
 * test them, and only then save. The probe writes a one-line file to the
 * chosen driver and deletes it again (lib/mediaStorage → testStorage), so
 * a pass means the credentials can actually store media, not merely
 * authenticate. Administrators only, like every settings write: the request
 * body carries storage secrets.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k.startsWith("storage_")) values[k] = v == null ? "" : String(v);
    }
    const result = await testStorage(storageConfigFromSettings(values));
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch {
    return NextResponse.json({ ok: false, error: "The storage test could not run. Check the server log." }, { status: 500 });
  }
}
