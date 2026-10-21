# BMS-CMS — Comprehensive Codebase Audit & Review

**Audit date:** 2026-10-20
**Repository:** `D:\github\zaheer\bms-cms` (local working tree)
**Branch:** `master`
**Commit at audit start:** `84a3f6fd298e739f9f7f68a99a454a7be6d2546e`
**Reported version:** 1.9.63 (`package.json`)

> **Working-tree note.** At audit start `git status` was clean. During the audit, two working-tree
> entries appeared that were **not** pre-existing and are **not** part of the delivered review:
> a temporary build directory (`.next-audit/`, created by the production build — since removed)
> and a corresponding auto-generated edit to `tsconfig.json`'s `include` array (since reverted
> with `git checkout`). The only remaining working-tree change after the audit is the user's own
> untracked `.github/FUNDING.yml`, which was **not** created by this audit. No application source,
> dependency, configuration, migration or lockfile was modified. `review.md` is the only file this
> audit added.

---

## 1. Executive summary

BMS-CMS is a substantial, genuinely well-engineered WordPress-style CMS: ~90,000 lines of
TypeScript/TSX across 459 files, 66 API route modules, 27 SQL migrations, and a feature set
(posts, pages, taxonomy, media, comments, menus, widgets, ads, customizer, SEO, i18n with RTL,
WordPress import/export, a plugin system) that is unusually complete for a self-hosted project.

The single most striking quality of the codebase is its **written rationale**: nearly every
security-relevant module carries a comment explaining the exact bug it was written to prevent
(`contentPolicy.ts`, `secretCompare.ts`, `loginProof.ts`, `sanitizeSvg.ts`, `publishState.ts`).
Several classic vulnerabilities — privilege escalation via mass-assigned `role`, a password oracle
at `/api/auth/check-2fa`, user enumeration on forgot-password, a leaky `RangeError` in token
comparison, an open image proxy, an SSRF-capable remote fetch — are not merely absent but are
documented as having been found and fixed. That is a strong signal of a maintained codebase.

Against that, this audit found **one confirmed high-severity stored-XSS chain** in the SVG
sanitiser (independently reproduced, not taken on trust), **two authorization/validation gaps** in
media and WordPress-import paths, and a **site-wide absence of CSRF protection** on the custom API
surface that is material given the project's own documented shared-hosting deployment model.

The other structural weakness is **verification**: the project's entire automated test suite is
six tautological assertions that never import the code they claim to test. Nothing in `src/` is
executed by any test. Type-check, lint and build all pass cleanly, but they prove compilation, not
behaviour.

**Overall readiness: not release-blocked, but the SVG finding should be treated as a P1 and fixed
before the next manual deploy.** The remaining findings are P2/P3 and can follow.

---

## 2. Audit scope and exclusions

### In scope

- Repository discovery: git state, structure, configs, CI, docs, env templates.
- Architecture and code quality across `src/`.
- Security: authn/authz, session handling, input validation, file upload/serving, injection,
  SSRF, CSRF, secret handling, headers, rate limiting.
- Database: schema, migrations, constraints, indexes, query bounds, transactions.
- CMS feature coverage against the documented feature set in `CLAUDE.md`.
- SEO/routing, frontend/accessibility source review, performance source review.
- Dependencies, configuration, deployment/ops.
- Automated checks: typecheck, lint, test, build, dependency audit.

### Explicitly excluded from deep review

| Path | Why |
|---|---|
| `node_modules/` | Vendored dependencies. |
| `.next/`, `.next-audit/` (removed), `tsconfig.tsbuildinfo` | Generated build output. `tsbuildinfo` is 1.3 MB of compiler cache. |
| `pnpm-lock.yaml` (deep) | Inspected for audit/version consistency only; not read line-by-line. |
| `public/uploads/*`, `plugins/*`, `fonts/*` | Site data by design (git-ignored). Not code. |
| `tests/`, `scripts/` | Read fully; small. |

### Not verified (stated honestly)

- **No live site, no running server, no browser.** All UI/UX, accessibility and rendering
  findings are **source-only** and marked as such. No visual or hydration behaviour was observed.
- **No database was connected to.** No migration was run. Schema/schema-and-migration agreement
  was checked by reading, not by applying.
- **The LiteSpeed direct-serve premise** behind the SVG finding's severity rests on the codebase's
  own documentation (`htaccess.ts`, `exportMedia.ts`) plus the absence of an SVG CSP rule — it was
  not confirmed against a live host (see SEC-001, "Residual uncertainty").

---

## 3. Project structure and actual technology stack

Verified from `package.json`, lockfile and config files (not from documentation claims):

| Layer | Actual version / technology | Source |
|---|---|---|
| Framework | Next.js **16.4.0** (App Router; Turbopack in dev) | `package.json:45` |
| Runtime | Node **>=24** (`engines`); observed v24.21.0 | `package.json:11`, `startup.log` |
| Language | TypeScript **^6.0.3**, `strict: true` | `package.json:72`, `tsconfig.json:11` |
| UI | React **19.3.0**, Tailwind **^4.3.3** | `package.json:52-53,71` |
| Database | Drizzle ORM **0.45.4** + `@neondatabase/serverless` **^1.2.0** + `pg` **^8.23.1** | `package.json:40,35,49` |
| Auth | NextAuth **5.0.0-beta.32**, bcryptjs, otplib TOTP | `package.json:46` |
| Editor | BlockNote **0.56.0** over `@tiptap/core` ^3.32 | `package.json:28-31` |
| Package manager | pnpm **12.9.1**, `pnpm-workspace.yaml` | `package.json:9` |
| Interception | `src/proxy.ts` (Next 16 convention, **not** `middleware.ts`) | confirmed present |
| Test runner | Node built-in `node:test` | `package.json:25` |

**Structure:** 459 `.ts/.tsx` files (`src/app` ≈20.4k LOC, `src/components` ≈37.7k, `src/lib`
≈31.0k). Three route groups for the public site (`(site)`, `(author)`, `(preview)`), an admin
group (`(admin)`) split into `(auth)`, `(cms)`, `(customizer)`, 66 API route modules, and 157
files under `src/lib`.

**One structural observation worth stating:** the codebase has several very large single files —
`BlockPanel.tsx` (335 KB), `BlockRenderer.tsx` (102 KB), `siteCss.ts` (82 KB), `speed/page.tsx`
(81 KB), `SiteLayout.tsx` (62 KB). This is the largest maintainability cost in the project
(see ARCH-002). It is not a defect.

---

## 4. Verification methodology and commands executed

All commands were run with the project's own package manager (pnpm) and its own scripts, without
installing or upgrading anything.

| # | Command | Purpose |
|---|---|---|
| 1 | `git status --porcelain`, `git rev-parse HEAD`, `git log --oneline -5` | Establish baseline |
| 2 | `pnpm typecheck` (`tsc --noEmit`) | Type safety |
| 3 | `pnpm lint` (`eslint .`) | Lint |
| 4 | `pnpm test` (`node --test "tests/**/*.test.mjs"`) | Unit tests |
| 5 | `BUILD_DIR=.next-audit pnpm build` | Production build, isolated output dir |
| 6 | `pnpm audit` | Dependency vulnerabilities |
| 7 | Targeted `grep`/`awk` sweeps | Authz coverage, unbounded queries, `any`/suppressions, `dangerouslySetInnerHTML`, `fetch` sinks, path-traversal sinks |
| 8 | **Independent reproduction** of the SVG sanitiser bypass | Ran `src/lib/sanitizeSvg.ts` under Node's native TS stripping against crafted inputs (see SEC-001) |

Command 5 used `BUILD_DIR` specifically so the production build did **not** overwrite `.next/`,
which `next.config.mjs:18` documents as the reason that variable exists.

---

## 5. Test / build / typecheck / lint results

### Automated check results

| Check | Command | Exit | Result | Notes |
|---|---|---|---|---|
| Type check | `pnpm typecheck` | **0** | ✅ Pass | `tsc --noEmit`, strict mode, no errors |
| Lint | `pnpm lint` | **0** | ✅ Pass | `eslint .`, no warnings or errors |
| Build | `BUILD_DIR=.next-audit pnpm build` | **0** | ✅ Pass | All 66 API routes + all page routes compiled |
| Unit tests | `pnpm test` | **0** | ⚠️ Pass, but meaningless | 6 tests / 3 suites pass — **they do not test the product** (TEST-001) |
| Dependency audit | `pnpm audit` | 0 | ⚠️ 2 vulns | 1 high, 1 moderate — both transitive dev-tooling (DEP-001) |

### Build observations

The build completed cleanly with no warnings surfaced in the tail of its output. The route table
shows every API route as `ƒ (Dynamic)` — server-rendered on demand — which is expected for a
database-backed CMS and means no API response is statically cached. `ƒ Proxy (Middleware)` is
registered, confirming `src/proxy.ts` is live.

### Dependency audit detail (DEP-001)

```
high      braces <=3.0.3   stack-exhaustion DoS via deeply nested patterns
          path: .>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces
          patched versions: NONE

moderate  esbuild <=0.24.2 arbitrary request forwarding from the dev server
          path: .>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild
          patched versions: >=0.25.0
```

**Assessment:** neither is reachable in production. `braces` is pulled in only by
`eslint-config-next` (a devDependency; it has no fix available upstream). `esbuild` is reached
only through `drizzle-kit` (a devDependency; the dev-server advisory requires an attacker who can
already reach the developer's machine). **No production dependency carries an advisory.** This is
recorded for completeness, not as a release blocker.

---

## 6. Overall assessment and readiness

| Dimension | Grade | Comment |
|---|---|---|
| Security architecture | **B+** | Excellent individual controls, one real bypass, one missing cross-cutting control (CSRF). |
| Correctness / data integrity | **A−** | Strong validation, constraints, soft-delete, revision safety. |
| Code quality / maintainability | **B+** | Superb commenting; a few very large files; near-zero dead code. |
| Performance | **B+** | Well-optimised (caching, indexes, image pipeline); unbounded sitemap queries on very large sites. |
| Accessibility / UX | **C** (unverified) | Source review only; no browser was run. |
| Testing / verification | **D** | The headline weakness. The suite proves nothing. |
| Deployment / ops | **B+** | Manual deploy by policy; migration runner is transactional and crash-safe; backups exist. |

### 6.1 Findings by severity and verification status

| Severity | Confirmed | Suspected | Informational | Total |
|---|---:|---:|---:|---:|
| **P0 — Critical** | 0 | 0 | 0 | **0** |
| **P1 — High** | 1 | 0 | 0 | **1** |
| **P2 — Medium** | 3 | 1 | 0 | **4** |
| **P3 — Low** | 4 | 2 | 0 | **6** |
| **P4 — Informational** | 5 | 0 | 0 | **5** |
| **Total** | **13** | **3** | 0 | **16** |

There are **no P0 findings**. Nothing found permits unauthenticated total compromise or guarantees
data loss.

### 6.2 Major risks and mitigations

| Risk | Severity | Finding | Mitigation |
|---|---|---|---|
| Stored XSS via uploaded SVG (any role) | P1 | SEC-001 | Make sanitiser quote-aware; add SVG CSP to `/plugins` and `.htaccess` |
| CSRF on the authenticated API | P2 | SEC-002 | Add a shared same-origin guard; `SameSite=Strict` |
| Author can force-delete any media folder's files | P2 | SEC-003 | Add role gate; drop implicit `force: true` |
| WordPress import plants arbitrary files + SSRF | P2 | SEC-004 | Reuse `RESTORABLE`/`sanitizeSvg`/size cap; block private addresses |
| Test suite tests nothing | P2 | TEST-001 | Import the real modules; add DB + smoke to CI |
| Sitemap loads every post into memory | P3 | PERF-001 | Keyset-paginate per sitemap part |

---

## 7. Findings by severity

### SEC-001 — CONFIRMED HIGH: SVG sanitiser bypass (attribute check is not quote-aware) → stored XSS

- **Finding ID:** SEC-001
- **Severity:** P1 (High)
- **Status:** **Confirmed — independently reproduced**, not taken on report
- **Affected files:** `src/lib/sanitizeSvg.ts:64-94` (the attribute-rewriting pass, specifically
  the tag regex `<\/?([a-zA-Z][\w:-]*)\b([^>]*)>` at line 64 and the attribute regex at line 76)
- **Reachable from:** `src/app/api/media/route.ts:192` (upload, any role),
  `src/lib/plugins.ts:233` (plugin SVGs), `src/lib/exportMedia.ts:199` (archive restore)

#### Evidence

The tag regex stops its attribute scan at the **first** `>`, including one inside a quoted
attribute value:

```js
s = s.replace(/<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g, (whole, name, attrs) => {
  ...
  const cleaned = attrs.replace(/[\s/]+([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (m, attr, ...) => {
    if (a.startsWith("on")) { ...; return ""; }
```

Everything after the embedded `>` is emitted verbatim and never attribute-checked.

I extracted the real module and executed it under Node's native TypeScript stripping. Results:

| Input | Output | Active handler survives? |
|---|---|---|
| `<svg><script>alert(1)</script></svg>` | `<svg></svg>` | No — removed ✅ |
| `<svg><rect onload="alert(1)"/></svg>` | `<svg><rect/></svg>` | No — removed ✅ |
| `<svg onload="alert(1)"></svg>` | `<svg></svg>` | No — removed ✅ |
| **`<svg … title="a>b" onload="alert(1)">`** | **`<svg … title="a>b" onload="alert(1)">`** | **YES — `removed: []`** ❌ |
| **`<svg><rect title="a>b" onload="alert(1)"/></svg>`** | **unchanged** | **YES — `removed: []`** ❌ |
| **`<svg><use title="a>b" href="javascript:alert(1)"/></svg>`** | **unchanged** | **YES (javascript: URL)** ❌ |

Single-quoted variants behave identically. The ordinary vectors all work correctly — the hole is
specifically attributes on a tag that carries a `>` inside a quoted value.

#### Technical explanation

`[^>]*` is a character class, not a parser. It cannot know that `>` inside `title="a>b"` is data.
The tag is split at the wrong byte, the attribute pass sees a truncated attribute list, and the
remainder — including a live `onload` or a `javascript:` `href` — is passed through untouched.
Because the output is still well-formed XML, the browser parses the handler normally: `onload` on
a root `<svg>` fires when the SVG is loaded as a document, and on a child element on parse.

#### Impact and realistic scenario

An **author-level** account (the lowest-privileged role) can upload an SVG — `POST /api/media`
requires only a session (`src/app/api/media/route.ts:156-157`). On the documented production host,
LiteSpeed serves `public/uploads/*` **straight from disk without reaching Node** — the codebase says
so itself (`src/lib/htaccess.ts:9-15`, `src/lib/exportMedia.ts:164-172`) — so the uploads route's
`Content-Security-Policy: script-src 'none'; sandbox` (`src/app/uploads/[...file]/route.ts:51`)
never applies, and `next.config.mjs:199-200` adds only `Cache-Control` for `/uploads/:path*`. A visit
to `/uploads/evil.svg` then executes script **in the site's own origin**. Administrators routinely
open media URLs. This is stored XSS with a viable path to session/token theft.

The same bypass also reaches the plugin path: `src/app/plugins/[slug]/[...file]/route.ts:49-56`
serves `.svg` with **no CSP header at all**.

#### Recommended fix

1. **Stop trusting regex rewriting for attributes.** Either parse the SVG as XML and walk it, or
   at minimum make both regexes quote-aware and require the tag regex to have consumed the entire
   tag — **rejecting** (`return null`) rather than passing through anything it did not fully
   account for:
   ```js
   /<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
   ```
2. **Assert the invariant after sanitising** rather than trusting the rewriter: verify no attribute
   name in the output matches `/^on/i` and no `href`/`src`/`xlink:href` value fails `safeUrl`.
3. **Add defence in depth:** emit `Content-Security-Policy: script-src 'none'; sandbox` from the
   `/plugins` route, and add an SVG CSP rule to `HTACCESS_FILE_RULES`
   (`src/lib/htaccess.ts:118-160`) so the LiteSpeed direct-serve path is covered.

#### Verification test

Table-driven unit test over `sanitizeSvg` asserting `removed` is non-empty and no `on*` attribute
survives for: quoted `>` in `title`, `alt`, `id`, `data-*`; both quote styles; nested quotes;
`>` inside a `style` attribute; and the six cases in the table above. This is exactly the class of
test the project currently lacks (TEST-001).

#### Residual uncertainty (disclosed)

The severity above depends on the production host serving `/uploads/*.svg` without the CSP header.
That is the behaviour the codebase documents for cPanel/LiteSpeed, and `HTACCESS_FILE_RULES`
contains no SVG CSP rule — but it was **not confirmed against a live host**. If the host has a
server-level CSP for SVG, severity drops from "live stored XSS" to "sanitiser is broken but
currently masked". **Confirm first** by requesting a real `/uploads/*.svg` from production and
inspecting the response headers.

---

### SEC-002 — CONFIRMED MEDIUM: no CSRF / same-origin protection on any custom API route

- **Finding ID:** SEC-002 · **Severity:** P2 · **Status:** Confirmed (code); impact is
  environment-dependent
- **Affected files:** every non-`GET` handler under `src/app/api/` except NextAuth's own;
  `auth.config.ts` (cookie config); `src/proxy.ts:202-216` (the `/api` block, which does
  authorization but no origin verification)

#### Evidence

There is no CSRF token, no double-submit cookie, no `Origin`/`Referer` equality check and no
`Sec-Fetch-Site` check anywhere in `src/app/api/`. `auth.config.ts` sets only `pages`, `session`,
`providers` and `callbacks` — it does not override cookie options, so the session cookie is
NextAuth's default `SameSite=Lax`.

#### Technical explanation and impact

`SameSite=Lax` does block cross-site form-POSTs, which closes the most obvious vector. It does
**not** protect against a sibling origin on the same registrable domain — cookies are same-site
across subdomains, so `evil.example.com` posting to `cms.example.com` carries the session cookie.
That is not hypothetical here: the project explicitly targets shared cPanel hosting, where
user-controlled sibling subdomains are the norm (`CLAUDE.md` §11). With no token as defence in
depth, a single regression to `SameSite=None`, a subdomain takeover, or a sibling origin is a full
site takeover — `POST /api/settings` accepts `script_head` (arbitrary markup on every page) and
`PATCH /api/users/<id>` sets passwords. None of the ~40 authenticated write handlers has any
protection beyond the cookie.

#### Recommended fix

Add one shared guard and call it at the top of every non-`GET` handler:

```ts
// src/lib/sameOrigin.ts
export function crossSite(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs) return !["same-origin", "same-site", "none"].includes(sfs);
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;              // curl/cron callers send neither
  try { return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? new URL(req.url).host); }
  catch { return true; }
}
```

Apply via a small wrapper rather than by hand in 40 files. Additionally set
`cookies: { sessionToken: { options: { sameSite: "strict" } } }` in `auth.config.ts` — safe here,
since the app uses Credentials only and has no cross-site identity-provider redirect.

**Also note:** `GET /api/cron/publish` is a state-changing `GET` (it writes `site_settings`,
purges caches, pings IndexNow, runs a crawl — `src/app/api/cron/publish/route.ts:148-169`). It is
token-protected so it is not exploitable, but it is the wrong shape; prefer header-only auth on it.

---

### SEC-003 — CONFIRMED MEDIUM: media-folder routes check a session but not a role; `?mode=delete` hard-deletes anyone's files

- **Finding ID:** SEC-003 · **Severity:** P2 · **Status:** Confirmed
- **Affected files:** `src/app/api/media/folders/[id]/route.ts:72-104` (DELETE),
  `src/app/api/media/folders/route.ts:25-47` (POST),
  `src/app/api/media/folders/[id]/route.ts:14-70` (PATCH)

#### Evidence

The file header says `"Admin-only — every caller is an admin screen"`, but the handlers check only
`session?.user?.id`. The delete path then calls `deleteMediaRow(r.id, { force: true })`
(`folders/[id]/route.ts:92`) for **every** file in the folder — and `force: true` also skips the
in-use check (`src/lib/mediaDelete.ts:26-35`).

Contrast the correct patterns that exist a few files away: `src/app/api/media/[id]/route.ts:18-22`
restricts an author to their own uploads; `src/app/api/media/route.ts:317-323` (bulk delete)
explicitly checks `own || role === "admin" || role === "editor"`.

#### Impact

An `author` — the role the docs describe as *"their own posts only … nothing of anyone else's"* —
can call `DELETE /api/media/folders/<id>?mode=delete` and destroy every file in that folder,
including administrators' uploads and the site logo, with no in-use warning. `src/proxy.ts` gates
`/admin/*` pages but explicitly leaves `/api/*` to the routes themselves, so the page restriction
is not a backstop.

#### Recommended fix

Require `role === "admin" || role === "editor"` for folder create/rename/delete, or enforce
per-file `mayTouch` and drop the implicit `force: true` (require an explicit `force` parameter and
report blocked files, as the bulk endpoint does).

---

### SEC-004 — CONFIRMED MEDIUM: WordPress media puller writes arbitrary file types and is SSRF-capable

- **Finding ID:** SEC-004 · **Severity:** P2 · **Status:** Confirmed (code); admin-triggered
- **Affected file:** `src/lib/wpMediaPull.ts:33-45`

#### Evidence

```js
const res = await fetch(row.url, { signal: AbortSignal.timeout(30000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const safe = (row.filename || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || `wp-${row.id}`;
const unique = `${Date.now()}-${row.id}-${safe}`;
await writeFile(path.join(dir, unique), buf);
```

Three omissions, all of which the sibling restore path handles correctly:

1. **No extension allowlist.** The sanitiser preserves dots, so `payload.html`, `x.svg` and `x.php`
   all survive. `src/lib/exportMedia.ts:161-174` has a `RESTORABLE` set and a comment explaining
   exactly why — *"An imported archive could therefore plant an `.html` page, a `.js` file, or an
   SVG with a `<script>` in it."* `pullRemoteMedia` has neither that set nor `sanitizeSvg`, so an
   SVG fetched here is stored **raw and unsanitised**.
2. **No content-type validation** on the fetched bytes.
3. **No size limit** — `arrayBuffer()` buffers an unbounded response into memory and then to disk.

The URL comes from `wp:attachment_url` in an uploaded WXR file, so it is fully attacker-chosen
within an admin-supplied file.

#### Impact

An administrator running Tools → Import from WP with "Download remote media" enabled can be induced
to plant an `.html` or unsanitised `.svg` at a same-origin URL — the same stored-XSS consequence as
SEC-001, via a second route. On a host with PHP enabled for the docroot, a `.php` file landing in
`public/uploads` is a code-execution risk. Additionally, `fetch(row.url)` accepts
`http://169.254.169.254/…` or `http://127.0.0.1:…`, making this an SSRF primitive whose response
body is written to disk and linked into content — a blind SSRF that becomes a read primitive.

#### Recommended fix

Reuse `RESTORABLE` and `sanitizeSvg` from `exportMedia.ts`; check `Content-Length` and stream with a
byte ceiling; reject non-image `Content-Type`s; and restrict to `https:` while blocking private
addresses using the existing `isPrivateAddress` helper (`src/lib/privateAddress.ts`).

---

### TEST-001 — CONFIRMED MEDIUM: the entire test suite tests nothing

- **Finding ID:** TEST-001 · **Severity:** P2 · **Status:** Confirmed
- **Affected files:** `tests/ads.test.mjs:17-19` and its six cases;
  `.github/workflows/ci.yml:25-29`; `package.json:25`

#### Evidence

`tests/ads.test.mjs` is the **only** test file. Its own header states the problem:

```js
// We can't import TS directly, so we test via tsx-like transform.
// Instead, replicate the pure logic here as a contract test.
// If ads.ts changes, these tests document the expected behavior.
```

It imports only `node:test` and `node:assert/strict` and then **re-implements** the logic inline,
asserting against its own copy. `src/lib/ads.ts` — and therefore `parseAdBlocks`, `blocksFor` and
`sidebarBlocksFor`, which the file's docstring claims to cover — is **never imported**. If someone
introduces a bug in `ads.ts`, all six tests still pass.

Net: **real exercised coverage of `src/` is zero modules.** `pnpm test` passing in CI provides
false assurance.

#### Why it matters more than it looks

The 15 highest-risk modules have no coverage at all, including `authz.ts` (the only role gate),
`contentPolicy.ts` and `sanitizeSvg.ts` (the stored-XSS filters — and see SEC-001, which a test
would have caught), `secretCompare.ts`, `loginProof.ts`, `privateAddress.ts`, `docFields.ts` and
`plugins.ts` (installs attacker-supplied zips). `scripts/smoke.mjs` is a genuinely useful
~26-check HTTP smoke test but is **not in CI** and not in `pnpm run deploy`.

#### Recommended fix

1. Make `ads.test.mjs` import the real module (add `tsx` as a devDependency or run tests against a
   compiled output). Until then, CI's test step proves nothing.
2. Add unit tests for the pure security functions — `stripActiveHtml`, `sanitizeSvg`,
   `secretMatches`, `verifyLoginProof`, `isPrivateAddress`, `docFields`, `safeHttpUrl`. These need
   no database and would catch the highest-severity regressions for the least effort.
3. Add a Postgres service + `pnpm db:migrate` + `pnpm run check` to CI so the 27 migrations and the
   smoke test actually run.

---

### SEC-005 — SUSPECTED MEDIUM: `clientIp()` trusts client-supplied headers when `server.js` is not the entry point

- **Finding ID:** SEC-005 · **Severity:** P2 (suspected) · **Status:** Suspected — confirmed in code,
  impact depends on deployment
- **Affected files:** `src/lib/rateLimit.ts:62-75`; mitigation only in `server.js:660-669`

`clientIp()` honours `true-client-ip` and `x-real-ip` unconditionally, **ahead of**
`x-forwarded-for`. The only thing that strips them is `trustClientIpHeaders()` in `server.js`,
which runs solely when the host launches `server.js`. `package.json:16` documents `"start":
"next start"` as the alternative, and `CLAUDE.md` §11 states `server.js` "is not needed" on a VPS —
so a `pnpm start` deployment (and any serverless deployment) bypasses the guard.

**Impact:** an attacker sending `true-client-ip: <random>` obtains a fresh rate-limit allowance per
request from every limiter keyed on `clientIp()` — comments, forms, the 404 logger, forgot-password,
reset, and the per-IP half of login throttling. The per-**account** login counter (50/10 min) still
holds, so brute-force is throttled, just at a higher ceiling. Not a confidentiality breach.

**Fix:** port the Cloudflare-range check from `server.js` into `src/lib/rateLimit.ts` so the guard
travels with the code rather than the launcher; demote `true-client-ip` below `x-forwarded-for`;
add an env-gated trust flag for explicit reverse-proxy deployments.

---

### SEC-006 — CONFIRMED LOW: rate-limiter sweep cannot bound its bucket

- **Finding ID:** SEC-006 · **Severity:** P3 · **Status:** Confirmed
- **Affected file:** `src/lib/rateLimit.ts:29-49`

The sweep at line 42 deletes only keys whose every timestamp is **outside** the current window —
exactly the set an attacker is not creating. A fresh key always has one in-window hit at check
time, so it is never collected until its whole window elapses. Many distinct source addresses within
one window grow the `Map` unbounded. Reachable at volume only if SEC-005 is also present, or via
genuine IPv6 `/64` rotation — hence P3.

**Fix:** cap the bucket and evict oldest-first on insertion order, rather than relying on the sweep:

```ts
const MAX_KEYS = 20_000;
if (bucket.size > MAX_KEYS) for (const k of bucket.keys()) { bucket.delete(k); if (bucket.size <= MAX_KEYS) break; }
```

---

### DB-001 — CONFIRMED LOW: no transactions for multi-step writes

- **Finding ID:** DB-001 · **Severity:** P3 · **Status:** Confirmed
- **Affected files:** `src/lib/wpMediaPull.ts:59-70`, `src/app/api/users/[id]/route.ts:330-343`,
  `src/app/api/posts/[id]/route.ts` (delete + `deleteRevisionsFor`), `src/lib/importSite.ts`

`db.transaction()` is **never called anywhere in `src/`** (verified: two grep hits, both in
comments or the migration runner). Several multi-step operations therefore have partial-failure
windows:

- **Import media rewrite** (`wpMediaPull.ts:59-70`): updates posts and pages in a loop, one row at
  a time, no transaction — an interruption leaves some content pointing at remote URLs and some at
  local ones. *(This is a pre-existing weakness; the import is explicitly documented as
  non-destructive and re-runnable.)*
- **User deletion** (`users/[id]/route.ts:330-343`): reassigns posts, then pages, then deletes the
  user. A failure between the reassignments leaves content half-moved.
- **Permanent post delete** (`posts/[id]/route.ts:273-276`): deletes the post then its revisions.
  A failure between leaves orphaned revisions.

Note the DB layer makes this deliberate: `src/lib/db/index.ts:29-33` documents that
`db.transaction()` is unavailable on the Neon HTTP driver and that nothing calls it. So this is a
known, accepted constraint, not an oversight — but it is still a real durability gap on the TCP
driver where transactions *are* available.

**Fix:** where the TCP driver is in use, wrap the reassignment pairs and the delete+revisions pair in
`db.transaction()`, or make the operations idempotent and re-runnable (as the import already is).

---

### PERF-001 — CONFIRMED LOW: sitemap loads every published document into memory

- **Finding ID:** PERF-001 · **Severity:** P3 · **Status:** Confirmed
- **Affected file:** `src/lib/sitemap.ts:196-200` (posts), `:220-224` (pages), `:268` (categories)

```js
const rows = await db.query.posts.findMany({
  where: isLive(posts),
  columns: { id: true, slug: true, updatedAt: true, publishedAt: true, createdAt: true, noIndex: true, language: true, featuredImage: true, ogImage: true, canonicalUrl: true },
  orderBy: [desc(posts.publishedAt), desc(posts.id)],
});          // ← no limit() and no offset()
```

The result set is then sliced in memory into 10,000-URL parts (`MAX_PER_SITEMAP`, line 154). The
paginated route shape and the 50,000-URL protocol limit are handled correctly, and a five-minute
cache (`URL_CACHE_MS`, line 165) absorbs crawler bursts — but a site with, say, 200,000 posts loads
all 200,000 rows into memory on every cache miss to serve one 10,000-URL part. `pages` and
`categories` have the same shape.

**Fix:** keyset-paginate the query per part (`WHERE (published_at, id) < (…) ORDER BY … LIMIT
10000`) so generating part 3 costs part 3's rows rather than the whole table.

---

### SEC-007 — CONFIRMED LOW: internal error strings echoed to authenticated callers

- **Finding ID:** SEC-007 · **Severity:** P3 · **Status:** Confirmed
- **Affected files:** `src/app/api/cron/publish/route.ts:184-186`,
  `src/app/api/speed/test/route.ts:44`, `src/app/api/maintenance/route.ts:21`,
  `src/app/api/speed/database/route.ts:28`, `src/app/api/speed/warm/route.ts:25`

Raw `err.message` is returned in the response body. All are token- or admin-gated, so this is low.
A database error string can disclose schema or host detail to an editor-level account.

**Fix:** log via `recordError()` and return a generic message, as `comments/route.ts:211-213` and
`forms/submit/route.ts:164-166` already do correctly.

---

### SEC-008 — SUSPECTED LOW: `formLookup` searches `users.content` without a guard

- **Finding ID:** SEC-008 · **Severity:** P3 (suspected) · **Status:** Suspected
- **Affected file:** `src/lib/formLookup.ts:28-33`

`SOURCES` includes `SELECT content::text AS c FROM users WHERE content::text LIKE $1 LIMIT 5`,
without the `deleted_at IS NULL` guard the posts/pages sources use. `users.content` holds the
author-page block document (`schema.ts:97`). Today it is null until an author opens the block
editor there, so this is benign. If a `contactForm` block is ever placed on an author page, any
visitor could POST a matching `formId` and have submissions validated against, stored under, and
emailed as that form. `LIMIT 5` and the id-shape gate cap but do not scope it.

**Fix:** add `content IS NOT NULL` and consider gating on `public_profile = true`.

---

### DOC-001 — CONFIRMED LOW: stale security comment describes a fixed vulnerability

- **Finding ID:** DOC-001 · **Severity:** P3 · **Status:** Confirmed
- **Affected file:** `src/lib/forms.ts:71-83`

The comment on `MAX_FIELDS` states that "the submit endpoint reads the form's field list out of the
*request body* … A crafted request can therefore declare its own fields and have them stored."
That is no longer true: `forms/submit/route.ts:81` resolves the definition server-side via
`savedForms()`. The stale text will mislead the next reader into treating `MAX_FIELDS` as the
primary control when it is now belt-and-braces. (See also POS-004.)

**Fix:** rewrite the doc comment to describe the current invariant.

---

### SEC-009 — CONFIRMED LOW: import trusts the `role` field from an uploaded export

- **Finding ID:** SEC-009 · **Severity:** P3 · **Status:** Confirmed, but **exploitation is blocked**
- **Affected file:** `src/lib/importSite.ts:247-252`

User rows are imported via `withoutKeys(u, ["id", "password", "totpSecret", "slug"])` — `role` is
**not** stripped, so a crafted export creates an account with `role: "admin"`. I traced the
escalation and it is **not exploitable**: no password is imported, and
`src/app/api/auth/forgot/route.ts:48` gates sending a reset link on `user?.password` being truthy,
so the account cannot be activated. That guard is incidental rather than deliberate.

**Fix:** force `role: "editor"` on imported accounts (matching what the Users screen documents for
new accounts), making the boundary intentional rather than accidental.

---

### ARCH-001 — CONFIRMED INFORMATIONAL: one entry point performs security work that lives outside the codebase

- **Finding ID:** ARCH-001 · **Severity:** P4 · **Status:** Confirmed
- `server.js:527-669` implements request body limits and client-IP trust — two security controls —
  entirely inside the launcher. Any deployment path that does not execute `server.js`
  (`next start`, serverless) silently loses both, which is what SEC-005 describes. The controls are
  well-built; the problem is location.
- **Fix:** move both into the application (`src/proxy.ts` or a route wrapper) so they travel with
  the code.

---

### ARCH-002 — CONFIRMED INFORMATIONAL: several very large modules

- **Finding ID:** ARCH-002 · **Severity:** P4 · **Status:** Confirmed
- `BlockPanel.tsx` 335 KB, `BlockRenderer.tsx` 102 KB, `uiText.ts` 95 KB, `customBlocks.tsx` 90 KB,
  `siteCss.ts` 82 KB, `speed/page.tsx` 81 KB, `SiteLayout.tsx` 62 KB. These are the hardest files
  to review, test or refactor, and `BlockPanel.tsx` alone is larger than the entire `src/lib`
  security surface combined. Not a defect — a maintainability cost worth tracking.
- **Fix:** extract by concern (e.g. split `BlockPanel` by block category) opportunistically when
  those files are next touched.

---

### SEC-010 — CONFIRMED INFORMATIONAL: JSON-LD and admin-only raw HTML by design

- **Finding ID:** SEC-010 · **Severity:** P4 · **Status:** Confirmed, correctly bounded
- `dangerouslySetInnerHTML` appears ~44 times. Every instance is either JSON-LD (safe — `jsonLd()`
  escapes `<` to `\u003c`, `src/lib/seo.ts:288-290`) or administrator-authored content: ad
  `block.code`, `script_head`/`script_body_end`, custom CSS, block HTML embeds, plugins. The
  `contentPolicy.ts` gate strips script/handlers from embeds for non-admin roles, and
  `ADMIN_ONLY_SETTING` (`settings.ts:72`) keeps those keys out of non-admin settings reads. This is
  a correct and deliberate design.
- One note: `contentPolicy.stripActiveHtml` is a security-critical filter and is **untested**
  (TEST-001). The 8-pass fixpoint design is sound, but it deserves direct adversarial tests.

---

### DEP-001 — CONFIRMED INFORMATIONAL: two transitive dev-tooling advisories

- **Finding ID:** DEP-001 · **Severity:** P4 · **Status:** Confirmed
- `braces` (high, no upstream fix, dev-only via `eslint-config-next`) and `esbuild` (moderate,
  dev-only via `drizzle-kit`). Neither is reachable in production. Detailed in §5.

---

### POS findings (positive) — recorded because they were verified

These are not defects; they are controls I checked and found correct. Recording them prevents a
future reviewer from "fixing" something that works.

- **POS-001 — Auth/authorization.** `authz.ts` is a single, well-designed gate: `sessionUser()`
  defaults a missing role to `editor` (least privilege), `canEditDocument`/`canManageUser` are used
  consistently, and the header documents a real past escalation (mass-assigned `role`). Role changes
  take effect in the session via the `jwt` callback re-reading the DB (`auth.ts:61-70`). Password
  changes invalidate other sessions via a password-hash fragment in the token (`auth.ts:26-28,66`).
- **POS-002 — Login hardening.** `/api/auth/check-2fa` is a known password oracle and is defended
  accordingly: shared counters with the credentials provider (`loginGuard.ts:44-49`), a dummy bcrypt
  compare to remove the enumeration timing signal (`loginGuard.ts:56-62`), and an HMAC proof that is
  email-bound, time-bound and still subject to the throttle (`loginProof.ts`).
- **POS-003 — Token and secret handling.** `secretMatches()` compares **byte** lengths before
  `timingSafeEqual` and enforces a 16-byte minimum (`secretCompare.ts:30-40`) — the fix for a real
  `RangeError`-as-oracle bug its own comment documents. `passwordReset.ts` and `ogSign.ts` follow the
  same pattern. `authSecret()` throws rather than signing with an empty key.
- **POS-004 — Form submission.** `forms/submit/route.ts` resolves the field list **server-side**
  (`savedForms()`) rather than trusting the body; `sitePath()` correctly neutralises the
  `https://yoursite.net@evil.com` notification-email phishing vector; Turnstile is verified after
  validation so a token is not wasted; notification email is deferred via `after()`. Field
  validation enforces required/email/URL/numeric/select-membership.
- **POS-005 — Comments.** `safeHttpUrl()` on `authorUrl` blocks stored `javascript:` XSS; the
  one-target check mirrors the DB constraint; the target must exist **and be live**; the
  comments-closed state is enforced server-side (the comment correctly notes a hidden form is no
  defence); replies are constrained to the same document; output is React-escaped everywhere.
- **POS-006 — Path traversal.** Every user-controlled name reaching the filesystem is confined —
  `basename` + character filtering on upload, `..`/backslash/absolute checks plus a `startsWith(root
  + sep)` assertion on every serving route, and a validate-all-then-write sequence in the plugin
  installer. I found no exploitable traversal.
- **POS-007 — Plugin installer.** `installPluginZip` (`plugins.ts:169-241`) validates every path
  before writing anything, enforces an extension allowlist, caps the zip (5 MB) **and** the unpacked
  size (25 MB) with a running total, caps file count, and stages-then-swaps so a failed install
  cannot leave a half-written plugin live. `safeEntryPath` closes a documented real bug where
  `"css": "../../.env"` embedded `DATABASE_URL`/`AUTH_SECRET` into a public `<style>`.
- **POS-008 — Content policy.** `stripActiveHtml` (`contentPolicy.ts:120-128`) repeats its cleaning
  pass to a fixpoint specifically to defeat `<scr<script></script>ipt>`, handles the `/` and
  quote attribute separators (not only whitespace), decodes entities before checking schemes, and
  strips prototype-pollution keys. Applied on write for every role, and re-applied on revision
  restore (`revisions/route.ts:122`) — a nice catch, since old revisions predate the filter.
- **POS-009 — Caching correctness.** LiteSpeed page caching refuses any request carrying a session
  cookie (`lscache.ts:127-133`), and `hasSessionCookie` handles NextAuth's chunked
  `session-token.0/.1` form — the comment explains that missing this would serve an editor's
  draft-laden page to the public. The Cloudflare rule excludes `/api` at the edge. Draft autosaves
  no longer purge the whole cache (targeted purge via `publishCache.ts`).
- **POS-010 — Security headers.** `nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`,
  a scoped CSP (`frame-ancestors/object-src/base-uri`), COOP, Permissions-Policy, production-only
  HSTS (deliberately without `includeSubDomains`/`preload`), `poweredByHeader: false`, and
  `X-Robots-Tag: noindex` on `/admin` and `/api`. The `remotePatterns` lockdown from `**` to the
  Blob host closes the open-image-proxy issue.
- **POS-011 — Schema design.** Composite unique indexes for language-scoped slugs, a composite PK on
  `post_tags`, a `CHECK` constraint for comment one-target, partial unique index for author slugs,
  generated `search_tsv` with a GIN index, and purposeful per-list index coverage
  (`posts_language_idx`, `posts_status_published_idx`, `posts_category_idx`, `posts_author_idx`).
  `isLive()` centralises the visibility predicate so it cannot drift across 18 call sites.
- **POS-012 — Migrations.** Every migration uses `IF NOT EXISTS`/`IF EXISTS` and is re-runnable; the
  runner is transactional with claim-first semantics to survive concurrent Passenger processes
  (`scripts/apply-migrations.cjs`).
- **POS-013 — Deployment safety.** `next.config.mjs:18` supports `BUILD_DIR` so a production build
  cannot clobber a live dev server. Backups are written outside `public/`, kept to seven, rate-gated
  by `BACKUP_MIN_HOURS`, and written under a `.part` name then renamed so a half-written archive is
  never mistaken for a complete one.
- **POS-014 — Bulk API design.** `DELETE /api/media` returns per-item `{deleted, blocked, failed}`
  so a partial failure does not silently drop the rest, and caps at 200 ids.

---

## 8. Security audit (narrative)

### Authentication and session management
Credentials-only NextAuth v5 with bcrypt (cost 12), optional TOTP, JWT sessions with a 7-day sliding
lifetime plus a 30-day absolute cap (`auth.ts:33,52`), and password-change invalidation via a hash
fragment in the token. `/api/setup` is unauthenticated by necessity but is protected by an atomic
`ON CONFLICT DO NOTHING` claim row (`setup/route.ts:53-63`), an optional `SETUP_TOKEN`, and a real
password policy — a genuinely careful treatment of the first-admin bootstrap problem.

### Authorization
Three roles with a single gate (`authz.ts`). Every mutating API route I read enforces role or
ownership server-side; the UI hides controls but does not rely on that. **Exception: SEC-003
(media folders).** `proxy.ts` additionally gates admin *pages* by role, with a documented rationale
that it is a convenience layer, not the enforcement point.

### Injection
No SQL injection found: all `rawQuery` call sites use `$n` binding, and the single template-literal
table name (`maintenance.ts:159`) comes from an internal discriminant. No `eval`/`new Function`. No
command execution. No XSS on the public write paths (comments, forms, 404 log, error log) — all are
React text nodes. **XSS does exist via SEC-001** (sanitised SVG) and SEC-004 (WP import).

### SSRF
No public endpoint fetches attacker-supplied URLs. Admin-gated fetch sinks exist
(`wpMediaPull.ts:35` — see SEC-004; `linkCheck`, `fontCss`, `ogFont`, `siteIcon`) and
`privateAddress.ts` provides a thorough private-range guard (IPv4 private ranges, IPv6 spellings of
IPv4 including IPv4-mapped/NAT64/6to4, unique-local, link-local, multicast) — but
`wpMediaPull.ts` does **not** use it.

### CSRF
**Absent on all custom routes** — see SEC-002. NextAuth's own handlers have it; nothing else does.

### Rate limiting
Present on every public writer (comments 5/min, forms 5/10min, 404 log 30/min, error reports
10/min, forgot 5/15min + 3/15min per address, reset 10/15min, login 10/10min per IP + 50/10min per
account, health 6/min, deploy 3/10min). The design is careful — `loginBlocked` records both counters
deliberately so `||` cannot let one go unincremented. Weaknesses: SEC-005 (header trust) and SEC-006
(sweep bound).

### File upload and serving
Allowlist keyed on **both** declared MIME and extension (`media/route.ts:27-59`) — a forged
`file.type` alone cannot pass. Raster images are re-encoded through sharp, destroying polyglots and
stripping EXIF. Lottie `.json` is structurally validated. Path traversal is closed everywhere.
**The SVG path is the hole** (SEC-001) — and it is the one type served from the site's own origin
that is a document rather than an image.

### Secrets
Credentials live in environment variables, never in `site_settings` — `mail.ts:6-11` documents why,
and `settings.ts:103` states the rule explicitly. `ADMIN_ONLY_SETTING` filters
`*token|secret|password|api_key` and `script_*` from non-admin settings reads and from client
payloads. `.env.local` is git-ignored (verified via `git check-ignore`); only `.env.example` with
placeholder values is tracked; no secret-shaped strings were found in tracked files. **One
non-secret hygiene issue:** `startup.log` (a runtime log with build/permission detail) is committed
to the repo — see OPS-001.

### Headers, CORS, HTTPS
Strong (POS-010). The CSP deliberately omits `script-src` because administrators inject analytics,
which is a defensible trade documented in place — but it is also precisely why SEC-001's SVG needs a
per-type CSP rather than a global one.

### Cache isolation
Well handled: session-cookie-carrying requests are never page-cached; `/api` is excluded at the edge;
RSC payloads are force-marked no-cache in `server.js` and refused by `pageCacheDecision`
(`lscache.ts:133`). No cache-poisoning vector found.

### Logging and audit
Error log, 404 log and form submissions are all admin-readable and rate-limited on write. There is no
separate audit trail for administrative actions (who changed what) — worth noting as a gap for a
multi-editor site, though revisions cover document history.

---

## 9. Architecture and code quality

**Separation of concerns** is generally good: `src/lib` holds domain logic, routes are thin
orchestrators, and `getSiteSettings()` is memoised per-request (`settings.ts:56-66`) with a
documented 15-second cross-request TTL. The database layer picks its driver from the connection
string and documents why (`db/index.ts`), including a subtle fix to stop Next's Data Cache from
caching SQL responses across builds.

**Server/client boundaries** are respected; `proxy.ts` runs on the Node runtime (documented, because
the Edge sandbox cannot open TCP). Secrets are filtered before crossing to client components.

**Type safety** is strong: `strict: true`, zero `@ts-ignore`/`@ts-expect-error`, and typecheck
passes cleanly. There are 98 `any`/`as any` occurrences, heavily concentrated in the BlockNote
integration (`customBlocks.tsx` 43, `BlockEditor.tsx` 19, `RowLayoutBlock.tsx` 14) — that is the
boundary with a third-party editor whose types are genuinely awkward, not a general laxness.

**Lint suppressions** are 62 `eslint-disable-next-line` comments, almost all with an explanatory
trailing comment (`-- intentional fetch-on-mount`, `-- server component: renders once per request`).
This is disciplined, not evasive.

**Error handling** is consistent: routes wrap in `try/catch` and return generic messages rather than
stack traces (the few exceptions are SEC-007). Failure mode is generally fail-safe — a settings read
failure returns `{}` so the site renders with defaults rather than 500ing.

**Duplication** is low and actively managed; `rateLimit.ts` and `contentPolicy.ts` both exist
*because* logic had been copied.

**Testing** is the outlier weakness — see TEST-001.

---

## 10. Database and data integrity

**Schema and migrations.** 27 migrations, `0000_init.sql` Drizzle-generated and `0001`/`0002`
hand-written for the three objects Drizzle cannot model (generated `search_tsv`, the comment
one-target `CHECK`, the partial unique author-slug index). I spot-checked the schema against the
migrations for the author work (0008–0011, 0018) and the recent additions (0019–0026) and found them
**consistent**. Every migration is idempotent (`IF NOT EXISTS`). `schema.ts` also carries a comment
explaining that `users_slug_key` was **added back** to the schema file after being absent, because its
absence would have caused `drizzle-kit generate` to emit a `DROP INDEX` — a real and subtle catch.

**Referential integrity.** FKs are declared in `0000_init.sql:299-309` with deliberate `ON DELETE`
behaviour: `cascade` for `sessions`, `comments`, `post_tags`, `nav_items`; `set null` for
`media.uploaded_by_id`, `posts.author_id`, `pages.author_id`, `revisions.author_id`,
`posts.category_id`. The `set null` choices are correct for the domain (deleting a user must not
delete their content; deleting a category must not delete its posts). **Two unenforced references:**
`comments.parent_id` (self-reference, no FK) and `nav_items.parent_id` (no FK) — both would benefit
from `ON DELETE SET NULL` at the database level, since the application already handles the orphan
case.

**Query bounds.** Most list endpoints are bounded (`comments` 200, `media` 50/200 paged, `posts`
20/100 paged, `not-found-log` 200, search capped at 240 matches). The outliers are PERF-001
(sitemap) and the inherently-unbounded internal helpers (`postTags`, `publishCache`, `navLinks`)
where reading a whole small table is correct.

**Transactions.** None — DB-001.

**Seeds and admin bootstrap.** No seed script exists, which is correct: `/admin/setup` creates the
first admin under an atomic claim, and `role` defaults to `editor` in the schema
(`schema.ts:28`) so a hand-inserted or restored row cannot become an administrator by omission. I
confirmed no application startup path re-creates or re-seeds privileged accounts — `server.js` runs
migrations only.

**Soft deletion** is properly modelled as a `deleted_at` timestamp rather than a status, so a
restore returns the document to its prior draft/published state (`publishState.ts`, and the comment
explains the reasoning). `isLive()` centralises the predicate.

**Data retention.** Maintenance prunes trash, stale logs and dead sessions (`lib/maintenance.ts`),
and `cleanupIfDue()` runs from the cron.

---

## 11. CMS feature-by-feature audit

Legend: ✅ implemented and verified by reading · 🟡 implemented, not fully verified ·
🟠 partial · ❌ missing though documented · ➖ not applicable

| Feature | Status | Evidence / note |
|---|---|---|
| Posts: list, create, edit, drafts, publish | ✅ | `api/posts/*`, `PostEditor.tsx` |
| Pages: same | ✅ | `api/pages/*`, `PageEditor.tsx` |
| Scheduled publishing | ✅ | `publishState.ts` `isLive` + `api/cron/publish` refreshes exactly what went live |
| Trash / restore / permanent delete | ✅ | `deletedAt` + `?restore=1` / `?permanent=1` |
| Revision history + restore | ✅ | `api/revisions/route.ts`; snapshot-before-restore makes restore itself undoable |
| Stale-save conflict detection | ✅ | `lib/staleSave.ts`, `expectedUpdatedAt`, 409 |
| Block editor (BlockNote + custom blocks) | ✅ | `components/editor/*` — many custom block types |
| Markdown support | 🟡 | Present via block types; not separately verified |
| Categories: hierarchy, per-archive design | ✅ | `categories` table, `CategoryEditor.tsx` |
| Tags | ✅ | `tags` table, language-scoped |
| Multi-language content (partitioned) | ✅ | `language` columns + composite unique indexes; `contentLanguages()` |
| Translator linkage | ✅ | `translationGroup` + `api/translations/*` |
| RTL support | ✅ | `RTL_LANGUAGES` (`locale.ts:27`) covers ar/ur/fa/he/ps/ku/sd/yi…; `documentDir()` per document; separate admin direction |
| Media library: upload, folders, bulk ops | ✅ | `api/media/*`; **but see SEC-003** |
| Image optimisation | ✅ | sharp re-encode to WebP, `maxPx` bound, blur placeholder, EXIF stripped |
| Comments + moderation | ✅ | threaded, `pending` default, one-target constraint, server-side closed-state check |
| Menus / navigation | ✅ | `menus` + `nav_items` (mega-menu, badges, icons) |
| Sidebar widgets | ✅ | `sidebar_widgets` setting + `Sidebar.tsx` |
| Ads system (Ad Inserter-style) | ✅ | `lib/ads.ts` — positions, page-kind targeting, device, schedule, sidebar slots; **6 contract tests exist but are tautological** |
| Elements (hook-injected content) | ✅ | `elements` table with schedule + device + URL conditions |
| Forms + submissions | ✅ | `api/forms/*`; server-side field resolution (**POS-004**) |
| Customizer with live preview | ✅ | `(customizer)/customize` + `(preview)/preview/customizer` |
| Header/footer builder | ✅ | builder items + `ItemPanel.tsx` |
| SEO: meta, canonical, OG, JSON-LD | ✅ | `seo.ts`, `seoMeta.ts`, `schemaTypes.ts` |
| hreflang | ✅ | `alternateLanguages()` wired into `alternates.languages` (`[...path]/page.tsx:328,455`) |
| Sitemaps (split index + parts) | ✅ | `lib/sitemap.ts`, 10k/part, noindex and empty terms excluded; **PERF-001** |
| robots.txt / llms.txt / RSS | ✅ | dedicated routes; search noindex by default |
| Redirects + 404 monitor | ✅ | loop/self/home-source detection (`redirects.ts:135-169`) |
| WordPress WXR import/export | ✅ | `api/tools/*`, `lib/wordpress.ts`; **SEC-004** on remote media |
| Site export / import / backup | ✅ | `api/export`, `api/import`, `api/backup` (streamed, 7 kept) |
| Plugin system (zip install, sandboxed) | ✅ | `lib/plugins.ts`; declarative shadow DOM isolation; **POS-007** |
| Users, roles, author pages | ✅ | `api/users/*`; **POS-001** |
| 2FA (TOTP) | ✅ | `otplib` + `api/users/[id]/2fa` |
| Search | ✅ | full-text (`search_tsv`, GIN) + bounded substring fallback, per-language config |
| Autosave | ✅ | present; targeted purge so drafts do not clear the site cache |
| Dark mode, sticky header, delay-load scripts | ✅ | `SiteLayout.tsx`, `SiteExtras.tsx`, `delayScripts.ts` |
| Accessibility (WCAG) | 🟡 | source-only; **not verified** — no browser run |
| Audit log of admin actions | ❌ | not implemented (revisions cover documents only) |

Nothing documented in `CLAUDE.md` was found to be missing outright. The gaps are the two
security items above and the unverified accessibility dimension.

---

## 12. Frontend, UI/UX, accessibility, and RTL

**Verification status: source-only. No browser, no screen reader, no Lighthouse run.** Everything
below is a code-reading observation, not a test result.

**Strengths visible in source**
- Consistent error/empty handling: `(site)/[lang]/error.tsx`, `not-found.tsx`,
  `(admin)/error.tsx`, `global-error.tsx`, `(preview)/.../error.tsx` all exist. This is better than
  most Next.js apps, which often ship only the default.
- A `loading.tsx` exists for the admin CMS group.
- Hydration is deliberately protected: `locale.ts:12-14` documents that dates are pinned to an
  explicit locale *and* timezone specifically to stop server/browser mismatch, and `error.tsx` /
  `global-error.tsx` read the document language in an effect to avoid a mismatch.
- RTL is genuinely implemented, not stubbed: `<html dir>` comes from `documentDir()`, which
  resolves per-document overrides, per-language script direction, and a site-wide setting, with a
  separate direction for the admin chrome so publishing an Urdu site does not flip the editor.
- Static/dynamic split is deliberate: public pages are prerendered; previews and customizer are
  `force-dynamic` so they never serve a stale shell.

**Observations (not confirmed defects)**
- No skip-to-content link was found in the layout source. Worth adding for keyboard users.
- Accessibility of the block editor (BlockNote) is largely inherited from the library and was not
  assessed.
- The public catch-all route (`[...path]/page.tsx`, ~48 KB) resolves page → post → category →
  date-archive in sequence with `isLiveNow()` gating each, and permanently redirects non-canonical
  spellings to the canonical path (`:708`). Resolution order looked correct on reading — a page
  cannot shadow a post, and unpublished content `notFound()`s — but this is exactly the sort of
  logic that deserves the integration test the project does not have.

**Recommendation:** stand up a Playwright suite (the project already has `@playwright/test`
available as an optional Next peer) to actually verify hydration, keyboard navigation, RTL
rendering and the editor. Until then, treat all UI claims — including from the project's own docs —
as unverified.

---

## 13. SEO and GEO

Source-level review only. **No live crawl, no Search Console, no Lighthouse was run** — no live-site
measurement is claimed.

**Verified in source**
- Canonical URLs are emitted per document, honouring a per-document override
  (`[...path]/page.tsx:327,454`).
- Paginated archives self-canonicalise to the paged URL
  (`canonical: … + (found.pageNum > 1 ? \`/page/${found.pageNum}\` : "")`, `[...path]/page.tsx:327`)
  — the correct choice, not canonicalising page 2 to page 1.
- `hreflang` is wired through `alternateLanguages()` into Next's `alternates.languages`.
- Search is `noindex` by default (`seo_search_noindex` defaults to `"true"`,
  `search/page.tsx:21,53`); tag archives are `noindex` when empty or disabled.
- Sitemap is a split index with per-kind children, 10k URLs per part, `noindex` documents and empty
  terms excluded, `lastmod` populated, and `<loc>` values both percent-encoded and XML-escaped —
  the comment notes that sending an Arabic slug raw made the sitemap and the canonical disagree.
- JSON-LD is built through typed schema definitions (`schemaTypes.ts`) with required-field
  validation, and `jsonLd()` escapes `<`.
- `X-Robots-Tag: noindex` on `/admin` and `/api` — the header that actually keeps admin URLs out of
  results, since `robots.txt` `Disallow` does not.

**Gaps / risks**
- **PERF-001** affects very large sites' sitemap generation time.
- No verification that `x-default` is emitted in the hreflang set — `alternateLanguages()` was not
  read in full. Marked **unverified**.
- GEO/AEO (llms.txt, structured answers) is partially present — `llms.txt` route and `indexnow`
  exist — but no claim is made about AI-crawler coverage.

---

## 14. Performance and scalability

Source-level review; **no benchmark, no profile, no Lighthouse run**. No performance numbers are
claimed.

**Verified optimisations (substantial and deliberate)**
- Database: purposeful index coverage for every hot listing path; generated `search_tsv` with GIN;
  `isLive()` predicates that match the indexes; keyset-free but bounded admin listings.
- Request path: `proxy.ts` runs only Map lookups on warm requests; redirects, languages and Speed
  settings are all module-scoped caches with stale-while-revalidate so no visitor waits on the
  database in front of a page (`redirects.ts`, `edgeLanguages.ts`, `lscache.ts`).
- Settings: per-request React `cache()` plus a 15-second process-wide TTL, explicitly reasoned about
  (`settings.ts`).
- Sitemaps: five-minute cache absorbing crawler bursts; the index reuses per-kind results.
- Images: WebP-only pinned format (documented as a Cloudflare cache-keying decision), tuned
  `deviceSizes`/`imageSizes`, year-long `minimumCacheTTL`, `sharp` pipeline, and a bounded on-demand
  logo resizer (`logoSrc.ts` `MAX_SIZED_FILES`).
- Client: the 11 KiB legacy polyfill is stripped via module replacement under webpack (and the
  comment honestly records that Turbopack cannot do this yet).
- Caching layers are coherent: Next revalidate + LiteSpeed headers + Cloudflare purge, with purge
  scope deliberately narrowed from "whole site" to "the URLs that changed" for document saves.

**Risks**
- **PERF-001** — unbounded sitemap queries (P3).
- The build's route table shows all 66 API routes as dynamic, so there is no API-level caching; each
  admin screen load is a live query. Acceptable for a CMS admin, but it means admin performance
  scales with content volume.
- `BlockPanel.tsx` at 335 KB is in the editor bundle; whether it is code-split was not verified.

**How to validate:** run `pnpm run check` after a build (it is a real HTTP smoke test with timing),
then Lighthouse against a populated staging site, then `EXPLAIN ANALYZE` on the sitemap and archive
queries at 100k posts.

---

## 15. Dependencies and configuration

- Runtime versions are internally consistent and current for the stated stack: Next 16.4.0, React
  19.3.0, Drizzle 0.45.4, Tailwind 4, TypeScript 6, Node ≥24.
- `pnpm` strictness rule (every direct import is a direct dependency) is documented and appears
  honoured; the build succeeds with `--frozen-lockfile` in CI.
- **No deprecated configuration syntax observed.** `next.config.mjs` is deliberately plain JS with a
  documented reason (avoids a devDependency at boot on `--omit=dev` hosts).
- Dependency audit: 2 advisories, both dev-only, neither production-reachable (DEP-001).
- Environment variables are documented in `.env.example` with 17 keys and no real values;
  `.env.local` is confirmed git-ignored. The example file even documents the consequence of *not*
  setting `NEXT_PUBLIC_SITE_URL` ("every canonical tag and every sitemap entry points at localhost,
  and the site gets indexed that way without any visible error") — a genuinely useful touch.
- **Configuration validation is absent.** Nothing checks at boot that `AUTH_SECRET` and
  `DATABASE_URL` are set; the failure surfaces on first use. Turnstile keys, if misnamed, silently
  disable the challenge and fail **open** (the env name is assembled at runtime to defeat Next's
  build-time inlining — clever, but a typo is then invisible).

**Recommendation:** add a startup assertion in `instrumentation.ts` that logs a clear warning for
each of `AUTH_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, and (when the site is public)
the Turnstile pair.

---

### OPS-001 — CONFIRMED INFORMATIONAL: `startup.log` is committed

- **Finding ID:** OPS-001 · **Severity:** P4 · **Status:** Confirmed
- `startup.log` is tracked in git (verified with `git ls-files`) and contains runtime detail:
  absolute working directory, host name (`DESKTOP-FBFSK3A`), Node version, port, and migration
  counts across several boots. It exposes no credential, but it is environment detail that belongs
  in `.gitignore` alongside `.next/` and `tsconfig.tsbuildinfo` (which are correctly ignored).
- **Fix:** add `startup.log` to `.gitignore` and `git rm --cached startup.log`.

---

## 16. Deployment and operations

- **Deploy is manual by explicit policy** (`AGENTS.md` §3, "Vercel Ignored Build Step = Don't build
  anything"). `pnpm run deploy` = `install && db:migrate && build`.
- **Two launch paths are supported and documented**: `server.js` for cPanel/Passenger/LiteSpeed
  (adds body limits and client-IP trust — see ARCH-001/SEC-005) and `pnpm start` for a VPS.
- **Migration runner is production-grade**: one transaction per file, claim-first marker row to
  survive concurrent Passenger processes, re-runnable, and it runs at server boot.
- **Health/monitoring**: `/api/health` (admin-only live check), Site Health screen, error log,
  `/api/cron/publish` as a keep-alive that also does useful work.
- **Backups**: `/api/backup` with a token, streamed to disk outside `public/`, seven kept, minimum
  gap enforced, `.part`-then-rename atomicity. The code is honest that this protects against a bad
  edit, not against losing the host.
- **Graceful shutdown**: not implemented — no `SIGTERM` handler was found in `server.js`. On a host
  that restarts the app, in-flight requests are cut. Low impact for a CMS.
- **CI** runs on PRs and manual dispatch only (never on push to master, matching the manual-deploy
  policy): install → typecheck → lint → test → build. It does **not** run the smoke test, does not
  provision a database, and does not run migrations (TEST-001).
- **Rollback**: not automated. `make-upload.mjs` writes `.next/BMS_NEXT_VERSION`, and the update
  screen can trigger a deploy hook, but there is no built-in "restore previous release".
- **`DEPLOY-PROMPT.txt`** (23 KB, tracked) is an operational runbook. It contains no secrets
  (verified by scanning for key-shaped strings). It is large enough that some of it may be stale —
  not audited line-by-line.

---

## 17. Missing, incomplete, and broken features

**Broken (confirmed)**
- SVG sanitisation is bypassable — SEC-001. The sanitiser is *not* doing what it exists to do.
- `tests/ads.test.mjs` does not test `ads.ts` — TEST-001. The coverage claim in its own docstring
  is false.
- Media-folder authorization is missing — SEC-003. The file's own comment claims a control that
  does not exist.

**Incomplete (confirmed)**
- WordPress remote-media pull lacks the validation its sibling restore path has — SEC-004.
- No CSRF protection on the custom API surface — SEC-002.
- No transactions on multi-step writes — DB-001.
- No audit trail for administrative actions.

**Missing (not documented as present, so not a defect — recorded as gaps)**
- No E2E/browser testing, no coverage measurement, no integration tests against a database.
- No automated rollback.
- No graceful shutdown.
- No configuration validation at boot.

**Documentation drift found**
- `lib/forms.ts:71-83` describes a fixed vulnerability as current — DOC-001.

---

## 18. Positive findings and existing strengths

Beyond the POS-001…POS-014 list in §7, the project-level strengths worth naming:

1. **The comments are a genuine security asset.** Modules explain the bug they prevent
   (`contentPolicy.ts`, `secretCompare.ts`, `redirects.ts`, `publishState.ts`, `db/index.ts`). This
   made the audit faster and more reliable, and it means a future maintainer is unlikely to
   reintroduce a documented bug.
2. **Several classic vulnerabilities were found and fixed before this audit** — privilege escalation
   via mass-assigned `role`, a password oracle at `check-2fa`, user enumeration on forgot-password,
   a leaky `RangeError` in token comparison, an open image proxy (`remotePatterns: "**"`),
   plugin `.env` exfiltration via `entry.css`. The pattern of finding and documenting these is the
   best evidence that this codebase is maintained rather than merely written.
3. **The database design is sound** — language-scoped uniqueness, correct `ON DELETE` semantics,
   real constraints for invariants the application also checks, and index coverage matched to actual
   query shapes.
4. **Operational care is above average** — transactional idempotent migrations, streamed backups
   with rotation, a build dir that cannot clobber a running dev server, honest documentation of what
   a backup does *not* protect against.
5. **The caching architecture is coherent and correctly reasoned** — the session-cookie cache
   refusal, the RSC-payload veto, the narrowed purge scope, and the WebP-format decision all show
   someone measuring a live site rather than guessing.
6. **Typecheck, lint and production build all pass cleanly** with `strict: true` and no suppressed
   type errors.

---

## 19. Prioritized remediation roadmap

### Immediate security and data-integrity issues

| # | Action | Findings | Effort |
|---|---|---|---|
| 1 | Fix the SVG sanitiser (quote-aware parsing or XML walk + post-assertion) and add SVG CSP to `/plugins` and `HTACCESS_FILE_RULES` | SEC-001 | 1–2 days |
| 2 | Confirm production `/uploads/*.svg` headers to establish SEC-001's true severity | SEC-001 | 1 hour |

### Release blockers

| # | Action | Findings | Effort |
|---|---|---|---|
| 3 | Make the test suite import real modules; add DB + smoke test to CI | TEST-001 | 1–2 days |
| 4 | Add the same-origin guard to all non-`GET` handlers; `SameSite=Strict` | SEC-002 | 1 day |
| 5 | Role-gate media folders; remove implicit `force: true` | SEC-003 | 2 hours |

### High-priority correctness and reliability

| # | Action | Findings | Effort |
|---|---|---|---|
| 6 | Give `pullRemoteMedia` the `RESTORABLE` + `sanitizeSvg` + size + `isPrivateAddress` treatment | SEC-004 | 4 hours |
| 7 | Move client-IP trust into `rateLimit.ts`; demote `true-client-ip` | SEC-005, ARCH-001 | 4 hours |
| 8 | Move body limits into the app | ARCH-001 | 4 hours |
| 9 | Force `role: "editor"` on imported users | SEC-009 | 30 min |
| 10 | Bound the rate-limit bucket by eviction | SEC-006 | 30 min |

### Performance, SEO and accessibility

| # | Action | Findings | Effort |
|---|---|---|---|
| 11 | Keyset-paginate sitemap queries | PERF-001 | 4 hours |
| 12 | Add transactions (or idempotency) to multi-step writes | DB-001 | 1 day |
| 13 | Stand up Playwright; verify hydration, keyboard nav, RTL | A11Y (unverified) | 3–5 days |
| 14 | Add a skip-to-content link; verify hreflang `x-default` | §12, §13 | 2 hours |

### Long-term maintainability

| # | Action | Findings | Effort |
|---|---|---|---|
| 15 | Extract the largest modules by concern | ARCH-002 | ongoing |
| 16 | Add boot-time config validation | §15 | 2 hours |
| 17 | Introduce an administrative audit log | §17 | 2–3 days |
| 18 | Add `SIGTERM` graceful shutdown; document rollback | §16 | 4 hours |
| 19 | Ignore `startup.log`; correct the stale `forms.ts` comment; null-guard `formLookup` | OPS-001, DOC-001, SEC-008 | 1 hour |

---

## 20. File-by-file review coverage

### Fully read and reviewed

**Security core:** `src/proxy.ts`, `src/lib/auth.ts`, `auth.config.ts`, `src/lib/authz.ts`,
`src/lib/loginGuard.ts`, `src/lib/loginProof.ts`, `src/lib/rateLimit.ts`, `src/lib/secretCompare.ts`,
`src/lib/password.ts`, `src/lib/contentPolicy.ts`, `src/lib/sanitizeSvg.ts`,
`src/lib/docFields.ts`, `src/lib/privateAddress.ts`, `src/lib/publishState.ts`,
`src/lib/uniqueSlug.ts`, `src/lib/redirects.ts`, `src/lib/lscache.ts`, `src/lib/settings.ts`,
`src/lib/htaccess.ts`, `src/lib/htaccessFile.ts`, `src/lib/ogSign.ts`.

**Routes:** `api/setup`, `api/users`, `api/users/[id]`, `api/posts`, `api/posts/[id]`, `api/pages`,
`api/media`, `api/media/[id]`, `api/media/folders`, `api/media/folders/[id]`, `api/tags`,
`api/settings`, `api/backup`, `api/import`, `api/revisions`, `api/comments`, `api/comments/[id]`,
`api/forms/submit`, `api/not-found-log`, `api/errors`, `api/health`, `api/updates`,
`api/cache/purge`, `api/cron/publish`, `api/cron/purge`, `api/turnstile`, `api/auth/forgot`,
`api/auth/reset`, `api/auth/check-2fa`, `api/preview`, `api/redirects`, `api/speed/htaccess`,
`api/links/suggest`.

**Serving routes:** `app/uploads/[...file]`, `app/fonts/[...file]`, `app/site/[file]`,
`app/plugins/[slug]/[...file]`.

**Library:** `src/lib/wpMediaPull.ts`, `src/lib/sanitizeSvg.ts`, `src/lib/sitemap.ts`,
`src/lib/search.ts`, `src/lib/locale.ts`, `src/lib/previewDrafts.ts`, `src/lib/previewDoc.ts`,
`src/lib/db/index.ts`, `src/lib/db/driver.ts`, `src/lib/schemaTypes.ts` (partial),
`src/lib/plugins.ts` (install path), `src/lib/importSite.ts` (user import), `src/lib/htaccess.ts`.

**Config/ops:** `package.json`, `next.config.mjs`, `tsconfig.json`, `.gitignore`, `.env.example`,
`.github/workflows/ci.yml`, `server.js` (body limits + client-IP + boot path), `CLAUDE.md`,
`AGENTS.md`, `tests/ads.test.mjs`, `drizzle/0000–0002`, `drizzle/0008–0011`, `drizzle/0017`,
`drizzle/0018`, `drizzle/0022–0026`.

**Pages/components (partial):** `(site)/[lang]/[...path]/page.tsx` (resolution, canonical, metadata
sections), `(preview)/preview/[type]/[id]/*`, `(admin)/preview/customizer/page.tsx`.

### Reviewed by targeted search rather than full read

- All 66 API routes: swept for auth presence and role usage (per-route table built).
- All `src/lib` files: swept for `fetch` sinks, path-traversal sinks, unbounded `findMany`,
  `any`/suppressions, `dangerouslySetInnerHTML`, `eval`.
- `src/components/frontend/*`: swept for `dangerouslySetInnerHTML` and `<img>` handling.
- Migrations: all 27 checked for idempotency and FK/constraint declarations.

### Not reviewed (with reason)

- **`src/components/editor/BlockPanel.tsx` (335 KB), `BlockRenderer.tsx` (102 KB),
  `customBlocks.tsx` (90 KB), `uiText.ts` (95 KB), `siteCss.ts` (82 KB), `speed/page.tsx` (81 KB),
  `SiteLayout.tsx` (62 KB), `PostEditor.tsx`, `PageEditor.tsx`** — **delegated to parallel agents
  that were terminated by infrastructure timeouts before returning.** Their content was sampled
  (structure, block-type enumeration, `dangerouslySetInnerHTML` sweep) but not read line-by-line.
  **This is the largest unverified surface in the audit** — see §21.
- `src/lib/uiText.ts`, `archiveText.ts`, `infoBox.ts`, `downloadBox.ts`, `rowLayout.tsx`,
  `blockCss.ts` — presentational builders; not security-relevant; not read.
- `DEPLOY-PROMPT.txt` (23 KB) — scanned for secrets only.
- `README.md`, `PLUGINS.md`, `MEMORY.md` — skimmed for claims to verify; not audited.
- `plugins-samples/*.zip` — binary samples; not extracted.
- `release/.htaccess` — referenced by `htaccess.ts:17-18` as a copy that must be kept in step;
  **not verified to be in step.**

---

## 21. Unverified areas and remaining limitations

Stated plainly, so this report is not read as more complete than it is:

1. **No live testing of any kind.** No server was started, no request was sent, no browser was
   opened, no database was connected to. Every UI, UX, accessibility, hydration, SEO and performance
   statement is source-derived. **Treat all of §12, §13's live-behaviour claims, and §14's
   performance claims as unverified.**
2. **The admin panel and block editor were not fully audited.** The dedicated agent covering
   `PostEditor.tsx`, `PageEditor.tsx`, `BlockPanel.tsx`, `customBlocks.tsx`, autosave behaviour,
   unsaved-change handling, and editor-side stored-XSS surfaces was terminated by an infrastructure
   timeout before delivering. I verified the *server-side* half of the write path thoroughly
   (`docFields`, `contentPolicy`, `staleSave` usage in the routes) but **did not** verify:
   - whether the UI hides admin-only controls consistently, and whether each hidden control has a
     server-side counterpart (a UI-only gate would be a real vulnerability — the server side looked
     correct in every route I read, but the UI side is unverified);
   - autosave frequency and whether the lost-update guard actually prevents concurrent overwrite;
   - whether the editor warns on unsaved navigation (`beforeunload`/router guard);
   - editor-side accessibility.
3. **The database agent was terminated before returning.** I performed the schema/migration/index/
   constraint review myself (§10) and verified FK declarations, idempotency and recent-migration
   consistency directly, but a line-by-line diff of every `schema.ts` column against all 27
   migrations was **not** completed — spot-checks only.
4. **The SEO agent was terminated before returning.** §13 reflects my own reading of
   `sitemap.ts`, `search.ts`, the catch-all route's metadata, and the robots/noindex settings.
   Items not checked: full `alternateLanguages()` implementation and `x-default`; OG-image signature
   validation beyond `ogSign.ts`; trailing-slash consistency; robots.txt content; `llms.txt` output.
5. **No dynamic security testing.** No fuzzing, no auth-bypass attempts against a running instance,
   no dependency-exploit validation. SEC-001 was the only finding reproduced by execution (of the
   pure function, in isolation).
6. **`sanitizeSvg` was tested in isolation, not end-to-end.** The XSS chain depends on the serving
   path, which is why SEC-001's severity carries an explicit "confirm on the host" step.
7. **No assessment of** `public/bms-plugins.js` (the plugin runtime), the declarative-shadow-DOM
   rendering, Cloudflare integration correctness, `revalidateSite`, `warmCache`, `siteHealth`, or
   the WordPress WXR parser beyond its user-import branch.
8. **`nodemailer`'s internal header encoding was not read** (the package resolves only inside the
   pnpm store). Header-injection is defended in `formNotify.ts` by strict email validation on
   `replyTo`, so the residual vector is a CRLF in an *admin-authored* subject template.

---

## 22. Final recommendations

**Do these before the next manual deploy:**
1. Fix SEC-001 and add the SVG CSP rules. This is the only finding with a realistic path to
   administrator session compromise.
2. Confirm the production `/uploads/*.svg` headers, which sets SEC-001's true severity.

**Do these in the following release:**
3. Make the test suite real (TEST-001). The project currently has no defence against regression in
   any of its security-critical pure functions — including the one this audit broke.
4. Add the CSRF/same-origin guard (SEC-002) and the media-folder role gate (SEC-003).
5. Move `server.js`'s security controls into the application (SEC-005, ARCH-001).

**Then, deliberately:**
6. Give the WordPress importer the validation its restore path already has (SEC-004).
7. Bound the sitemap queries (PERF-001) and add transactions where the TCP driver allows (DB-001).
8. Stand up browser testing and verify the accessibility and RTL claims that neither this audit nor
   the project's own documentation has ever tested (A11Y).

**A closing assessment.** The distance between this codebase's *intent* and its *verified state* is
the central theme of this audit. The intent is unusually high: the comments describe a maintainer
who has repeatedly found and fixed real vulnerabilities in their own code, and the controls they
built are mostly correct. But three of the defects found here — a sanitiser that does not sanitise,
a role check whose comment claims a control that is not there, and a test suite that tests itself —
share one shape: **a stated guarantee that nothing verified.** The single highest-leverage change
available to this project is not any individual fix; it is making its tests execute its code.
