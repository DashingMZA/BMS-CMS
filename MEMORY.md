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

### 2026-10-15 — `2a82882` — Sidebar: default widget titles
Widgets with blank admin titles now fall back to type defaults (Search, Recent Posts, Categories, Tags, Archives, Recent Comments, Follow Us) instead of rendering as anonymous blocks. Search label is translated via uiText.

### 2026-10-15 — `4c23536` — Archive chip row: cap at N most-used tags/categories
The chip row rendered ALL tags (hundreds of pills burying posts on category/tag archives). Tags now ordered by post count desc; row capped at `archive_chips_limit` (default 30, configurable in Customizer → Archive → "Max chips"). Same cap applies to categories.

### 2026-10-15 — `3e02a6e` — Settings: per-tab dirty dots + warn once
Fixed the tab-switch loop: amber dot now marks the tab(s) that actually hold unsaved changes (via TAB_KEYS mapping), not the active tab. The unsaved-changes confirm appears once per dirty session — after OK, switching tabs freely no longer re-prompts. Save clears all dots and resets the warning.

### 2026-10-15 — `05af400` — Settings: tabbed layout
Settings page split into 5 tabs (General, Language & Region, Permalink Settings, Sitemap & robots.txt, Export/Import). Each tab has its own Save Settings button — all save the same changed-keys set, so any tab's button saves everything. Tab switch warns on unsaved changes; amber dot marks the dirty tab.

### 2026-10-15 — `797d11c` — Ads: "Footer" position renamed to "Before footer" (label only, id unchanged).

### 2026-10-15 — `9d1aad3` — Ads: reorder block fields
Field order now: Insertion → Sidebar # → Sidebar position (+ Sticky) → After widget → Alignment → Device → Schedule (optional). Same pattern for non-sidebar positions (Insertion → count → Alignment → Device → Schedule).

### 2026-10-15 — `dc4784e` — Docs: CLAUDE.md + AGENTS.md updated
CLAUDE.md: `mediaFolders` table added to DB map; Media admin row lists bulk delete/move, pagination, meta editing; Ads §9 updated with new AdBlock fields (device, sidebarId, sticky, startAt/endAt), Sidebar 2 filtering, and device-targeting CSS pattern. AGENTS.md: new §5 hard-won lessons (device targeting pattern, shared delete helper, bulk API shape, DB column checklist, folder-delete UX).

### 2026-10-15 — `4303604` — Ads: device targeting (auto/desktop/mobile)
`AdBlock` gains `device: "auto"|"desktop"|"mobile"` (default auto). Admin has a Device dropdown per block. Frontend `AdBlockView` adds `bms-ad-desktop`/`bms-ad-mobile` classes; globals.css hides desktop-only on ≤767px and mobile-only on ≥768px. Auto shows on all screens.

### 2026-10-15 — `348968b` — Ads: Sidebar 2 support for sidebar ad slots
`AdBlock` gains `sidebarId` (1|2). Admin shows a Sidebar 1/2 selector for all sidebar positions; "After widget N" counts the selected sidebar's real widgets (s2widget1-6 for Sidebar 2). Frontend `AdSlot` accepts `sidebarId` and filters; `Sidebar.tsx` passes its own sidebar number so top/middle/bottom/custom ads only render in their target sidebar.

### 2026-10-15 — `a8a5979` — Media library: bulk delete, pagination, folder choice, title/alt/caption
Bulk delete: new `DELETE /api/media` accepts `{ids, force}` with per-file in-use guard; selection bar has a red "Delete selected" button. Pagination: 50/page with Prev/Next (replaces load-more); API default limit 60→50. Folder delete: dialog asks "Move files to Unfiled" vs "Delete files too" (`?mode=delete`). Detail panel: editable Title (new `media.title` column, migration 0026), Alt text, Caption with Save. Shared `mediaDelete.ts`/`mediaUsage.ts` helpers; single delete refactored to use them.

### 2026-10-15 — `7323eb4` — P2/P3: scheduled ads, element device targeting, sidebar stack default
Scheduled ads: `AdBlock` gains `startAt`/`endAt`; `isBlockLive` respects the window; admin has datetime-local inputs. Element device targeting: migration `0025_element_device.sql` adds `device` column; ElementSlot adds `bms-el-desktop`/`bms-el-mobile` classes with CSS hiding per breakpoint; editor has a Device card. P3: `sidebar_mobile_layout` default changed to "stack".

### 2026-10-15 — `09d2107` — WP media auto-pull + footer mobile builder
Media auto-pull: new `downloadMedia` checkbox on WP import; `wpMediaPull.ts` downloads remote images to `public/uploads/`, updates media rows, and rewrites old URLs in post/page content. Footer mobile builder: 9 `footer_m_*` zone settings + `footer_mobile_enabled` toggle; FooterPanel has Desktop/Mobile device tabs with a chip-based zone editor; SiteLayout renders the mobile footer on ≤767px when enabled (CSS hides desktop footer there).

### 2026-10-15 — `7609a75` — WP import/export: category parents + language selector
Import: categories now wire `parentId` via a second pass (WP `category_parent` nicename → id), so hierarchies survive. Export: `wp:category_parent` now carries the parent's slug instead of empty. Import UI has a Language dropdown (en/ur/ar/es); the API accepts `language` (validated 2-letter) and `wxrToSiteExport` applies it to posts/pages/categories/tags instead of hardcoded "en".

### 2026-10-15 — `24c0e62` — Sticky ad contract tests
Added 2 contract tests to tests/ads.test.mjs: old blocks without `sticky` default to false; sticky class only applies to sidebar position. 6/6 pass. (User's `fcbac98` "/" commit added startup.log — no code impact.)

### 2026-10-15 — `508d701` — Fix lint errors/warnings
ShareButtons: moved the `react-hooks/set-state-in-effect` disable comment to the call site inside the effect (v7 plugin requires it there). Removed unused `label` prop (SidebarPanel) and unused imports `headers`, `newTabProps` (SiteLayout). `pnpm lint` clean.

### 2026-10-15 — `8bc13dd` — Sticky sidebar ad (CSS-only)
New per-block `sticky` flag for sidebar-positioned ad blocks. When on, the ad gets `position: sticky; bottom: 1rem` and stays visible while scrolling. Toggle in Admin → Ads → block → "Sticky — stay visible while scrolling". Old blocks default to non-sticky via parseAdBlocks.

### 2026-10-15 — `a408752` — Sidebar stack-below option for mobile/tablet
New `sidebar_mobile_layout` / `sidebar_tablet_layout` settings: "default" | "hide" | "stack". "Stack below content" shows the sidebar under the article in a single column on small screens (the gap the responsive review flagged). Old `sidebar_hide_*` booleans still honored as "hide" for saved sites. Customizer → Sidebar → "Responsive behavior" dropdowns per device.

### 2026-10-15 — `7e58b90` — Theme preset import/export in customizer
Export (Download icon) saves the current draft as `theme-preset-YYYY-MM-DD.json` ({name, exportedAt, settings}). Import (Upload icon) reads a preset file, applies only known CustomizerSettings keys, marks them changed, and prompts to Publish. Invalid files show an error. TSC/ESLint clean.

### 2026-10-15 — `080d959` — Full-page click-to-edit in customizer preview
New `ClickToEdit.tsx`: clicks in the preview iframe find the closest `[data-bms-slot]`/`[data-bms-row]`, prevent navigation, and postMessage the section/item to the Customizer parent, which opens the matching settings screen. Hover shows a dashed outline + pointer cursor. Works for header items/rows and footer items/rows. TSC/ESLint clean.

### 2026-10-15 — `482b60a` — Mega menu: nested columns with grandchildren
Mega menus now render true multi-column structure: each submenu item becomes a column heading, with its own sub-items (grandchildren) as the column links — icons, badges, descriptions supported at both levels. New `.hnav-mega-col`/`.hnav-mega-head` CSS. Admin navigation editor explains the column structure ("Each submenu item becomes a column heading"). Mobile stacks to one column (existing CSS). DB fields `mega_menu`/`mega_columns` and the admin checkbox already existed; the missing piece was nested rendering.

### 2026-10-15 — `b9a77d6` — Header mobile dock
New opt-in mobile header dock: a compact fixed top bar for ≤767px that replaces the normal header when enabled. Settings `header_mobile_dock` ("false" default) and `header_dock_items` (JSON, max 5 items with icon/label/href). New `MobileHeaderDock.tsx`; CSS hides the regular header and adds 56px body top padding on mobile. Configured in Customizer → Header → Mobile dock. Footer mobile dock already had its own "Show dock on mobile" enable/disable toggle (shipped in db2e82b) — both docks are opt-in.

### 2026-10-15 — `3192bbd` — PanelKit everywhere
HeaderPanel, FooterPanel, SidebarPanel now import shared controls from PanelKit instead of local duplicates: SidebarPanel's `inputCls`, HeaderPanel's `Switch`, FooterPanel's `Switch` (+ `defaultOn={false}` for opt-in settings `footer_toprow_enabled`/`footer_mobile_dock`). Visual behavior unchanged; TSC clean.

### 2026-10-15 — `db2e82b` — Footer mobile dock
New opt-in mobile dock: a fixed bottom navigation bar for ≤767px. Settings `footer_mobile_dock` ("false" default) and `footer_dock_items` (JSON, max 5 items with icon/label/href). New `MobileDock.tsx` component; CSS reserves 64px body padding on mobile so content isn't covered. Configured in Customizer → Footer → Mobile dock with add/remove/edit per item.

### 2026-10-15 — `88b7cc8` — Sidebar slot drag reorder
SidebarSlots in the Customizer are now draggable: drag a slot header to reorder widgets. The widgets move between slots (slot ids stay fixed, so saved configs and ad "after widget N" positions keep working). Works for both Sidebar 1 and Sidebar 2.

### 2026-10-15 — `b5578a1` — Device-specific sidebar hide
New `sidebar_hide_mobile` (≤767px) and `sidebar_hide_tablet` (≤1024px) settings. CSS hides `.content-sidebar` and collapses the grid to one column at those breakpoints. Toggles in Customizer → Sidebar → "Hide on devices".

### 2026-10-15 — `361014c` — Featured category flag
New `is_featured` boolean on categories (migration 0024). Toggle in CategoryEditor General tab, "Featured" badge in the admin category list, saved via `categorySettingsFrom`. Note: migration 0024 needs applying on the database.

### 2026-10-15 — `26aa684` — Per-category/tag sidebar choice
New `sidebar_choice` column on categories + tags (migration 0023). Values: default/sidebar1/sidebar2; default follows the Customizer's global `sidebar_choice`. ContentShell accepts a `sidebarId` override; BlogArchive passes the term's choice through. CategoryEditor + TagEditor UI added; `categorySettingsFrom` validates the value. Note: migration 0023 needs applying on the database.

### 2026-10-15 — `f56ffde` — Card style presets for search results
SearchResults now renders archive-card markup (`archive-card`, `archive-card-*` classes, `archive-items is-<style>` wrapper). searchCss emits the shared `archiveCardStyleCss` presets scoped to `.search-items`, so search honours the Card design setting. SearchPanel's boxed/unboxed Content Style replaced with the 6 card presets. Search keeps its own `data-search-el` ordering — no conflict with archive card ordering.

### 2026-10-15 — `ea85d27` — Archive card drag ordering + image position
New `archive_card_order` (JSON `{id, visible}[]`) and `archive_card_image_position` (above/below-content). BlogArchive card elements carry `data-card-el`; new `archiveCardOrderCss` in siteCss.ts reorders via CSS `order` (live in Customizer preview). Customizer → Archive → "Card elements" uses ElementList (drag + toggles). Image is structurally separate so it moves above/below the whole block; overlay card keeps its text-on-image design.

### 2026-10-15 — `7e2a45c` — Panel-local reading time toggle
New `post_reading_time` setting (default/show/hide) in the Single Post panel. `readingTimeFromWords` in siteExtras.ts honours it: show/hide override the global Reading time toggle, default follows it. Archive cards untouched.

### 2026-10-15 — `be9d4d7` — Post meta ordering
New `post_meta_order` setting (JSON `{id, visible}[]`). PostTitleBlock renders the meta row (date, author, reading-time) in the configured order with per-item visibility. Customizer → Single Post → "Meta order" uses ElementList (drag-reorder + toggles). `parsePostMetaOrder` + `POST_META_LABELS` in appearanceSettings.ts.

### 2026-10-15 — `fd65fa5` — Hero / title-band controls for posts and pages
New `HeroBlock` component (`src/components/frontend/HeroBlock.tsx`) with two layouts: `banner` (full-width featured image above the title) and `overlay` (title on top of the image with a dark scrim). New settings per kind: `{post,page}_hero_layout` (none/banner/overlay), `{post,page}_hero_height` (small/medium/large), `{post,page}_hero_overlay` (0–90 scrim opacity), `{post,page}_hero_title_color`, `{post,page}_feature_position` (above-title/below-title when no hero). Wired into `[...path]/page.tsx` for both post and page branches — the hero replaces the separate title block + featured image (no duplicate `<h1>`). Customizer UI in SinglePostPanel + PageLayoutPanel. Hero title-color CSS via new `heroCss()` in siteCss.ts.

### 2026-10-15 — `c2bc10a` — SVG social icons
New shared `SocialIcons` component with brand SVGs (Facebook, X, Instagram, LinkedIn, YouTube). Replaces text labels in header social item, footer social item, and sidebar social widget. currentColor fill inherits surrounding text color.
Fixed: new "tag"/"author" page types fell through to null in adPageKind, so menu/footer ads targeting "Tag / Archive pages" never showed on tag/author archives.
- New `sidebar2_widgets` setting + 6 slots (s2widget1-6)
- New `sidebar_choice` setting (sidebar1/sidebar2)
- Sidebar component accepts `sidebarId` prop
- Customizer: tabbed Sidebar 1 / Sidebar 2 editor + layout choice dropdown
- New "tag" and "author" page types in PAGE_TYPES
- ContentShell accepts `archiveKind` (category/tag/author); pageTypeFor uses it
- BlogArchive passes archiveKind through; tag pages pass archiveKind="tag"
- Elements and header rules now target tag/author archives correctly
Fixed: empty widget config hid top/middle/bottom sidebar ads too. Sidebar now renders when sidebar ads exist, even with zero widgets. "After widget N" UI already clear.
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
