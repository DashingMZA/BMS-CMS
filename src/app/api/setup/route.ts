import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { normalizeEmail, passwordProblem } from "@/lib/password";
import { secretMatches } from "@/lib/secretCompare";
import { rawQuery } from "@/lib/db/raw";

/** Claimed once, atomically, by whichever setup request gets there first. */
const CLAIM = "setup_claimed";

// One-time setup route to create the first admin user.
//
// Unauthenticated by necessity, and the account it creates owns the site, so
// between upload and the owner's first visit anyone who finds a fresh install
// could claim it. With SETUP_TOKEN in the environment, only someone who can
// read the server's environment can. Without it, it behaves as it always did.
export async function POST(req: NextRequest) {
  try {
    const existingUsers = await db.query.users.findMany({ limit: 1 });
    if (existingUsers.length > 0) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    const body = await req.json();
    const { name, email, password } = body;

    const setupToken = (process.env.SETUP_TOKEN ?? "").trim();
    if (setupToken && !secretMatches(setupToken, String(body.setupToken ?? "").trim(), 1)) {
      return NextResponse.json({ error: "That setup token is not the one this site was installed with." }, { status: 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    // This route is unauthenticated by necessity, and the account it creates
    // owns the whole site — so it is the last place to accept "a" as a password.
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const hashedPassword = await bcrypt.hash(password, 12);

    // The "no users yet" check above is a read, so two requests in the same
    // moment both passed it and both created an administrator. Claiming one
    // settings row with ON CONFLICT DO NOTHING is atomic: exactly one request
    // gets the row back.
    // A claim left behind with still no account (a crash between the two
    // writes, or every user deleted later) must not lock setup for good.
    await rawQuery(`DELETE FROM site_settings WHERE key = $1 AND value < $2`, [
      CLAIM,
      new Date(Date.now() - 10 * 60_000).toISOString(),
    ]);
    const claimed = await rawQuery<{ key: string }>(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [CLAIM, new Date().toISOString()]
    );
    if (claimed.length === 0) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    let user: { id: string };
    try {
      [user] = await db.insert(users).values({
        id: randomUUID(),
        name: name || "Admin",
        email: normalizedEmail,
        password: hashedPassword,
        role: "admin",
      }).returning();
    } catch (err) {
      // Release the claim, or a failed insert would lock setup forever.
      await rawQuery(`DELETE FROM site_settings WHERE key = $1`, [CLAIM]).catch(() => {});
      throw err;
    }

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
