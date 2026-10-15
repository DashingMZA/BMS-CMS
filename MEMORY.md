# BMS-CMS — Project Memory

> **This file is the single source of truth for all work done on this project.**
> Every task, fix, change — even a single word — gets recorded here with its date
> and push commit. Read this before starting work. Update it after finishing work.

---

## Repository

- **URL:** https://github.com/DashingMZA/BMS-CMS
- **Branch:** `master`
- **Deployments:** MANUAL ONLY — never auto-deploy. Vercel Ignored Build Step = "Don't build anything".
- **Push rule:** Push only after fixes are complete, one clean commit per batch.

## Hard-won lessons

- Next 16+: interception lives in `src/proxy.ts`, NOT `src/middleware.ts`.
- Pushing via Git Data API: the tree API only ADDS/UPDATES blobs. For renames/deletes you must explicitly include the old path with `"sha": null`, or the old file survives on remote.
- pnpm strictness: every directly-imported package must be a direct dependency in `package.json` (hit with `@tiptap/core` + `prosemirror-state`).
- pnpm 12 ignores the `"pnpm"` field in package.json; overrides live in `pnpm-workspace.yaml`.
- `parseAdBlocks` (2026-10-15): missing page-kind keys in saved ad blocks must keep default `true` — `!!undefined` flips them to `false` and silently hides ads on pages the user never unchecked.
- Ad `pageKind` must match the actual page: homepage → `"homepage"`, category → `"category"`, tag → `"archive"`, search → `"search"`, post → `"posts"`. Before the fix, all archives reported `"archive"`, so "Homepage"-targeted ads never showed on the homepage.

---

## Work log (newest first)

### 2026-10-15 — `b808096` — Elements: URL targeting + schedule
- New URL conditions (show/hide on path prefixes) in ElementConditions
- New `startAt`/`endAt` schedule columns + `inSchedule()` check
- Admin UI: URLs card + Schedule card on element edit page
- Migration `0022_element_schedule.sql`
"Text / HTML" split into explicit Text + Custom HTML options. HTML renders raw (admin-configured).
New `archive_chips_source` setting (categories/tags/both) + Customizer dropdown. Tag chips link to tag archives. CLAUDE.md paths verified correct (audit claim was wrong).
- New "Custom HTML" widget type (raw HTML, admin-configured)
- Sidebar slots 4 → 6 (footer parity)
- Note: the audit's "type drift" item was already fixed earlier (9 types now)
- Fixed label bug: "Category Pages Default Sidebar" → "Search Results Default Sidebar"
- New `search_excerpt_length` setting (words, 0 = hide) + Customizer control
- New `search_empty_title` / `search_empty_text` for the no-results state + Customizer controls
Tags now have the same per-term fields as categories: archive design (color, hover, header image, columns, card style, design JSON) + SEO (title, description, focus keyword, canonical, OG, robots flags). Migration `0021_tag_term_parity.sql`. New TagEditor + `/admin/tags/[id]` page. Tag archives respect design overrides and SEO fields.
New `sortOrder` column (migration `0020_category_sort.sql`), admin UI number input in the inline editor, API PATCH support. All category listings now order by sortOrder then name (admin, API, sidebar widget).
Same ShareButtons component reused. New `page_share_show` setting (default off) + Page Layout panel toggle. Renders below content on pages.
New `post_share_show` setting (default off) + Customizer toggle. ShareButtons component: X, Facebook, LinkedIn, WhatsApp, copy-link. Renders in PostAfterContent below tags.
Undo/redo buttons in the Customizer toolbar + Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts. 50-step history, no-op changes don't pollute it.
Archives (monthly post counts), Recent Comments (approved), Social Links (network+URL list). Type, rendering, data fetching, and Customizer config UI all added.
- `ADMIN_PAGE_SIZE`: 50 → 20 (posts/pages lists)
- Tags page: checkbox bulk delete + 20/page client pagination (was: all rows at once)
- Categories page: same bulk delete + 20/page pagination
Full folder system for the media library:
- Schema: new `media_folders` table (id, name, parentId for nesting) + `folderId` on `media` (migration `0019_media_folders.sql`)
- API: `GET/POST /api/media/folders`, `PATCH/DELETE /api/media/folders/[id]` (rename/move with cycle guard; delete moves files to parent, never deletes them); `GET /api/media?folderId=` filter; `POST /api/media` accepts `folderId`; `PATCH /api/media/[id]` accepts `folderId` (validated)
- UI: folder sidebar (All files / Unfiled / folders), create/rename/delete, upload into open folder, checkbox multi-select + bulk move to folder

### 2026-10-15 — `b5477a5` — Silence Turbopack filesystem-tracing warning
`src/lib/htaccessFile.ts` does dynamic `path.join(parent, name)` for shared-hosting (cPanel) domain detection. Added `/*turbopackIgnore: true*/` so the build doesn't trace the whole project.

### 2026-10-15 — FIRST VERIFIED PRODUCTION BUILD (user ran on Windows)
User ran the full pipeline on `D:\github\zaheer\bms-cms`:
- `pnpm install --frozen-lockfile` ✓
- `pnpm lint` ✓ (0 errors, 0 warnings — after the useRouter fix)
- `pnpm build` ✓ — 520 static pages, TypeScript clean, only 1 Turbopack warning (htaccessFile, now silenced)
- `node scripts/smoke.mjs` ✓ — **25/25 checks passed**
- `pnpm test` ✓ — 4/4 unit tests passed
This closes the long-standing "pushed ≠ verified" gap — the build is now proven on the user's machine.

### 2026-10-15 — `ea71834` — Test infra + pinned deps (audit follow-up)
- `tests/ads.test.mjs`: unit tests for ad targeting logic (Node built-in runner, no new deps) — covers the parseAdBlocks missing-key bug and blocksFor filtering. `pnpm test` runs them.
- Pinned critical deps exactly (no `^`): `next-auth@5.0.0-beta.32`, `@blocknote/*@0.56.0`, `drizzle-orm@0.45.4`, `next@16.4.0`.
- CI now runs `test` + `build` (was typecheck+lint only).

### 2026-10-15 — `9c452ed` — Log CLAUDE.md creation in MEMORY.md
Bookkeeping entry for the CLAUDE.md commit, per the AGENTS.md rule (log every change).

### 2026-10-15 — `3814c35` — CLAUDE.md + AGENTS.md link
Created `CLAUDE.md`: full project map (what BMS-CMS is, tech stack, structure, all DB tables, every public route + rendering pipeline, all admin sections, API routes, key components, complete ads system reference with positions/targeting/pageKind wiring, settings/customizer, auth, conventions). Linked from `AGENTS.md` §0 so new agents read it first.

### 2026-10-15 — `4dd1359` — MEMORY.md + AGENTS.md
Created repo-level `MEMORY.md` (project work log) and `AGENTS.md` (agent instructions: read MEMORY.md first, log every change even single-word, push/deploy rules).

### 2026-10-15 — `fa35498` — parseAdBlocks: missing page kinds default to true
Old ad blocks saved before the `homepage`/`category`/`search` page kinds existed had those keys missing from `pages`. `!!undefined` turned them `false`, hiding sidebar ads on homepage/category/tag archives even though the user never unchecked anything. Now only keys actually present in the saved block are overridden; missing keys keep the default `true`.

### 2026-10-14 — `819e3af` — Search page layout fix
`content-shell` on the search page was missing `mx-auto px-4` (ContentShell always has them) — content was stuck to the left edge. Added.

### 2026-10-14 — `8aa5595` — Ad pageKind targeting for archives
Homepage now passes `pageKind="homepage"` (was default `"archive"`), category passes `"category"`, tag passes `"archive"` explicitly. `ContentShell` gained an `adPageKind` prop; `BlogArchive` forwards its `pageKind` so sidebar ads target the same kind as content ads (previously sidebar always got `"archive"`).

### 2026-10-14 — `b6ff915` — Sidebar on archives/search + responsive ad images
Archive pages (homepage, category, tag) now show the right sidebar when `archive_layout` is `"normal"` (the default). Only explicit `fullwidth`/`narrow`/`wide` hides it. Changed in `ContentShell.tsx` + matching CSS in `siteCss.ts`. Search page now renders the main `Sidebar` (widgets + sidebar ads) following `search_archive_layout`. Ad images constrained: `.bms-adblock img { max-width: 100%; height: auto; }` (970×250 billboard was overflowing).

### 2026-10-14 — `440dca1` — Remaining executable scripts via Next.js `<Script>`
`FACADE_SCRIPT` (video facade) and `prefetchScript(...)` moved from raw JSX `<script>` to Next.js `<Script>`. Kills the React "script tag while rendering" warning on archive pages.

### 2026-10-14 — `12cb73e` — delayLoader via Next.js `<Script>`
The raw JSX `<script>` for delayLoader triggered React's "script tag while rendering" warning. Now loads via `<Script strategy="afterInteractive">` — warning gone, delay behavior unchanged.

### 2026-10-14 — `6b17334` — Comment `<li>` hydration fix
`Comment` rendered its own `<li>` inside a parent `<li>` → invalid nesting (`<li> cannot be a descendant of <li>`). Now only the parent list item owns the `<li>`; `Comment` renders content only.

### 2026-10-14 — `796a7d8` — Before/After excerpt ads out of archive cards
Excerpt ad blocks were rendering inside every post card on front/archive pages. Removed from cards; they now show only around prev/next navigation (posts/pages) and around pagination (front/archive).

### 2026-10-14 — `596b7c1` — Ad alignment fix for block-level media
Tailwind preflight sets `img` to `display:block`, so `text-align:center` never centered ad images — they stuck to the left. Center/left/right alignment now uses auto-margins on the image/video/iframe element itself.

### 2026-10-14 — `fb33927` — Ads v6
`before_excerpt` moved below the prev/next border line; new sidebar slot **After widget…** with a widget-number dropdown listing only real configured widgets; custom ads interleaved after their widget in `Sidebar.tsx`.

### 2026-10-14 — `d6ddc4c` — Ads v5: placement fixes
Post/archive/comment/sidebar placements; paragraph/image injection for WordPress-imported `htmlEmbed` content.

### 2026-10-14 — `33453ed` — Ads: auto-renumber + new positions
Block names auto-renumber on delete (only auto "Block N" names; user-renamed kept). New positions: Before/After menu (around site header in `SiteLayout`), Before/After title (around `PostTitleBlock` on posts+pages), After footer (after `</footer>`).

### 2026-10-14 — `ea2abaf` — Restored `@tiptap/core` + `prosemirror-state`
pnpm had removed them (only transitive); `src/components/editor/protectBlocks.ts` imports them directly. Declared as direct dependencies (pnpm strictness).

### 2026-10-14 — `b5585f9` — Tools → WordPress WXR import/export
New admin Tools menu (under Settings, admin-only): Import from WP (WXR `.xml` upload → parsed via `fast-xml-parser` → converted to SiteExport → existing import pipeline; posts/pages/categories/tags/media/comments, Rank Math SEO, featured images, HTML Embed blocks) and Export for WP (WXR 1.2 download readable by WordPress's own importer).

### 2026-10-14 — `2b4b8b6` — Ads v3
Status badges (green/red driven by Insertion dropdown; Disabled = off), Disabled position option, sidebar slots (Top/Middle/Bottom), shortcodes `[adinserter block="N"]` / `[adinserter name="…"]`, comment and excerpt positions.

### 2026-10-14 — `7004f92` — Ads v2
Ad Inserter-style blocks + Header/Footer tab (header & footer script editors).

### 2026-10-14 — `d85ab81` — Ads v1
ads.txt route (`/ads.txt` serving `ads_txt` setting) + admin Ads menu + initial ad placements. Stored in existing `siteSettings` (no migration).

### 2026-10-14 — `1e0cc1e` — Docs for Next 16 / Node 24
Updated docs for current versions.

### 2026-10-14 — `bff4728` — npm → pnpm sweep
Docs + upload script migrated from npm to pnpm.

### 2026-10-14 — `ec840c2` / `e6dc1de` / `9c0ef9e` — Tailwind configs to `.mts`
Renamed tailwind configs from `.ts` to `.mts` (silences Node MODULE_TYPELESS warning); removed stale `.ts` files (Git Data API lesson: old paths need explicit `"sha": null`).

### 2026-10-14 — `d3ea8aa` — Restore next-auth v5 beta
Code uses the v5 API; restored the beta dependency.

### 2026-10-14 — `b8a07ce` — Tailwind v4 syntax
Migrated stylesheets to Tailwind v4 syntax.

### 2026-10-14 — `8904071` — pnpm catalogs
Migrated pnpm overrides from deprecated `$` syntax to catalogs (`pnpm-workspace.yaml`).

### 2026-10-14 — `3e2c56c` — Fix pnpm dev startup errors

### 2026-10-14 — `4fd7c20` — updates

### 2026-10-14 — `e6668dc` — Fix all 67 eslint errors
react-hooks v7 rules cleanup.

### 2026-10-14 — `cb67fc8` — /
Root commit marker.

### 2026-10-14 — `371aed2` / `c404247` / `47cf0a2` — npm → pnpm
Migration commits from npm to pnpm.

### 2026-10-14 — `485a5b5` — Merge branch 'master'

### 2026-10-14 — `80e731c` — Remove src/middleware.ts
Superseded by `src/proxy.ts` (Next 16 convention).

### 2026-10-14 — `2b28c09` — Restore README.md and server.js
Restored from `bf45c66`.

### 2026-10-14 — `3e6a455` — Next 16: middleware.ts → proxy.ts
Plus package.json/lint toolchain fixes.

### 2026-10-14 — `bf45c66` — npm 2 pmpm
(Typo in original message.)

### 2026-10-14 — `e1cf2c7` / `0abfb12` — Package updates

### 2026-10-06 — `a0a6b50` — bms-cms
Initial commit.

## Ads system — intended placements (current)

- Before/After menu: around the site header
- Before/After title: around `PostTitleBlock` on posts/pages
- Before/After paragraph & image: structured blocks via `injectContentAds`; WP-imported `htmlEmbed` via `<p>`/`<img>` counting (featured image excluded)
- After post: below tags (post page); below all cards, above pagination (front/archive)
- Between posts: after every 3rd card (front/archive); after related posts (single post)
- Before/After excerpt: above/below prev-next nav (posts/pages); above/below pagination (front/archive); never inside archive cards
- Before comments: inside comment section, below heading/border, before first comment
- Between comments: single middle insertion (1 comment → above form; 2 → after 1st; 3–4 → after 2nd; 5–6 → after 3rd)
- Sidebar: Top / Middle (after middle widget) / Bottom / After widget N (real widget numbers only)
- Footer: After footer position exists
- Shortcodes `[adinserter block="N"]` / `[adinserter name="…"]` render manually in any article paragraph, even when auto-position is Disabled

## Key files

- `src/lib/ads.ts` — parsing, targeting, placement logic
- `src/components/frontend/AdSlot.tsx` — `AdBlocks` server component
- `src/components/frontend/Sidebar.tsx` — widgets + sidebar ad slots
- `src/components/frontend/ContentShell.tsx` — layout shell, `adPageKind` prop
- `src/components/frontend/BlogArchive.tsx` — archive rendering, passes `pageKind`
- `src/app/(admin)/admin/(cms)/ads/page.tsx` — Ads admin UI
- `src/lib/siteCss.ts` — generated site stylesheet (sidebar visibility rules)
- `src/lib/appearanceSettings.ts` — defaults (`archive_layout: "normal"`, sidebar widgets, etc.)

## Open / unverified

- ~~Full production build success not established.~~ **RESOLVED 2026-10-15:** user verified on Windows — `pnpm build` succeeds (520 pages), smoke 25/25, tests 4/4, lint clean.
- No Vercel deployment performed during this work.
- User pulls each batch and tests on localhost:3000.
