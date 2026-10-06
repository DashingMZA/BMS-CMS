import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordProblem } from "@/lib/password";
import { readResetToken } from "@/lib/passwordReset";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/** Sets a new password for the account a valid reset token names. */
export async function POST(req: NextRequest) {
  if (rateLimited("reset", clientIp(req), { max: 10, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  let token = "";
  let password = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "");
    password = String(body?.password ?? "");
  } catch {
    // Treated as empty below.
  }

  const userId = await readResetToken(token, async (id) => {
    const u = await db.query.users.findFirst({ where: eq(users.id, id), columns: { password: true } });
    return u ? u.password : undefined;
  });
  if (!userId) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const hash = await bcrypt.hash(password, 12);
  await db.update(users).set({ password: hash }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
