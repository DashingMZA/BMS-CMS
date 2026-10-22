import type { NextAuthConfig } from "next-auth";

export default {
  pages: { signIn: "/admin/login" },
  // Seven days without a visit and the session ends. NextAuth's default was
  // 30 days, renewed on every use — an admin who used the site weekly was
  // never signed out, and a stolen cookie stayed good until the password
  // changed. An absolute limit from sign-in is enforced in lib/auth.ts.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  // Strict, not NextAuth's Lax default: Lax sends the cookie on cross-site
  // top-level requests and treats sibling subdomains as the same site,
  // which on shared hosting is the CSRF hole lib/sameOrigin.ts closes at
  // the request level. Strict is safe here because sign-in is
  // credentials-only — there is no identity-provider redirect that needs
  // the cookie to survive a cross-site return. Its one visible cost: the
  // first page opened from an external link (an email, say) arrives
  // without the cookie and passes through the sign-in screen, which then
  // recognises the session.
  cookies: { sessionToken: { options: { sameSite: "strict" } } },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
