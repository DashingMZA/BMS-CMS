/**
 * Same-origin guard for state-changing API requests (SEC-002).
 *
 * The API's only credential is the session cookie, and a cookie alone is
 * not CSRF protection. NextAuth's default SameSite=Lax stops a form POST
 * from an unrelated site, but cookies are same-*site* across subdomains —
 * and this CMS is built for shared cPanel hosting, where a neighbour's
 * subdomain is exactly the origin an attacker can get. `evil.example.com`
 * posting to `cms.example.com` carries the admin's cookie, and until now
 * nothing checked where the request came from: settings (including the
 * raw script fields), user passwords, everything accepted it.
 *
 * The rule, applied once in src/proxy.ts so every route — present and
 * future — is covered without forty copies:
 *
 * - Safe methods (GET/HEAD/OPTIONS) are never blocked; they must not
 *   change state. (The one state-changing GET, /api/cron/publish, is
 *   token-authenticated.)
 * - NextAuth's own routes (/api/auth/*) are exempt — it runs its own
 *   CSRF token flow.
 * - A browser always sends Sec-Fetch-Site and Origin on a POST. A
 *   cross-site fetch is refused outright; otherwise the Origin (Referer
 *   as fallback) must name this very host — which a sibling subdomain
 *   fails by definition.
 * - Callers that send neither header (cron's curl, server-to-server
 *   calls, the smoke script) are allowed: they hold no ambient cookie to
 *   ride on, and the routes they use authenticate themselves.
 *
 * As defence in depth the session cookie is also SameSite=Strict
 * (auth.config.ts) — safe here because sign-in is credentials-only, with
 * no cross-site identity-provider redirect to survive.
 */

/** Paths NextAuth serves itself; it has its own CSRF handling. */
const AUTH_ROUTES = /^\/api\/auth(?:\/|$)/;

export function crossSiteRequest(req: { method: string; url: string; headers: Headers }): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return true;
  }
  if (AUTH_ROUTES.test(pathname)) return false;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false; // not a browser request — no cookie to ride on
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true; // an Origin that does not parse is not one to trust
  }
  // The host the visitor used, which behind a proxy is the forwarded one —
  // the same value publicOrigin() in proxy.ts trusts for redirects.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return originHost !== host;
}
