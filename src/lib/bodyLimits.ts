// Per-route request body limits, enforced by the proxy (src/proxy.ts).
//
// These numbers mirror BODY_LIMITS in server.js — keep the two in step.
// The supervisor keeps its own copy because it is plain Node with no way
// to import this file, and it must refuse a body before the app exists.
//
// Why both (ARCH-001): the limits used to live only in the supervisor,
// so a host that starts the app without it — `next start`, a container,
// a platform — had no limit at all, and each route reads its whole body
// into memory. The proxy can enforce the *declared* size (a
// Content-Length over the limit is refused before any route runs). A
// body that declares nothing (chunked) cannot be counted here without
// consuming the stream the route needs; the supervisor still counts
// those byte by byte on hosts that run it.

const MB = 1024 * 1024;

const BODY_LIMITS: [RegExp, number][] = [
  // Admin uploads. Each route also checks the file itself; these only add
  // the multipart framing on top.
  [/^\/api\/import\/?$/, 1024 * MB], // a backup zip carries the media library
  [/^\/api\/media\/?$/, 12 * MB],
  [/^\/api\/(?:fonts|plugins)\/?$/, 6 * MB],
  [/^\/api\/preview\/?$/, 9 * MB],
  // Anyone on the internet can call these; none needs more than a form's worth.
  [/^\/api\/(?:comments|forms\/submit|errors|not-found-log|auth|setup)(?:\/|$)/, 256 * 1024],
];

const DEFAULT_BODY_LIMIT = 8 * MB; // documents, settings, menus — the admin's own saves

/** The largest body, in bytes, a request to this API path may declare. */
export function bodyLimitForPath(pathname: string): number {
  for (const [re, limit] of BODY_LIMITS) if (re.test(pathname)) return limit;
  return DEFAULT_BODY_LIMIT;
}
