// Who is allowed to do what.
//
// Every API route checked `session?.user?.id` — "are you logged in" — and
// nothing checked *which* user you are or what role you hold. With one
// administrator that reads as adequate. It is not: the Users screen creates
// editors, so the moment a second account exists an editor can
//
//   • PATCH `/api/users/<admin id>` and set the administrator's password,
//     because changing a password required no current password and no role;
//   • PATCH their own record with `{ role: "admin" }`, because `role` was
//     taken straight from the request body.
//
// Both are full takeovers, and neither needs anything but a valid session.

import type { Session } from "next-auth";

export interface SessionUser {
  id: string;
  role: string;
}

/** The signed-in user, or null. Never trusts a body field for identity. */
export function sessionUser(session: Session | null): SessionUser | null {
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return null;
  // An absent role is treated as the least privilege, not the most: a token
  // issued before roles existed must not be an administrator by omission.
  return { id: user.id, role: user.role ?? "editor" };
}

export function isAdmin(session: Session | null): boolean {
  return sessionUser(session)?.role === "admin";
}

/** Whether this session may act on `targetUserId` — themselves, or an admin. */
export function canManageUser(session: Session | null, targetUserId: string): boolean {
  const me = sessionUser(session);
  if (!me) return false;
  return me.id === targetUserId || me.role === "admin";
}

/**
 * The standard refusals, so every route says the same thing.
 *
 * 401 means "you are not signed in", 403 means "you are, and it is not yours".
 * Collapsing both into 401 tells an attacker a valid session was rejected,
 * which is the one thing worth distinguishing.
 */
export const UNAUTHORIZED = { error: "Unauthorized" } as const;
export const FORBIDDEN = { error: "You do not have permission to do that" } as const;

/**
 * Roles, from most to least privilege:
 *
 *   admin   everything
 *   editor  all content, but not users, settings or site structure
 *   author  their own posts only — no pages, no moderation, nothing of anyone
 *           else's; media and taxonomy for their own use
 *
 * "author" exists for a team of writers: a student can publish without being
 * able to touch anyone else's work.
 */
export const ROLES = ["admin", "editor", "author"] as const;
export type Role = (typeof ROLES)[number];

export function isValidRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function isAuthor(session: Session | null): boolean {
  return sessionUser(session)?.role === "author";
}

/** Whether this session may edit a document with the given author. */
export function canEditDocument(session: Session | null, authorId: string | null | undefined): boolean {
  const me = sessionUser(session);
  if (!me) return false;
  if (me.role === "admin" || me.role === "editor") return true;
  return !!authorId && authorId === me.id;
}
