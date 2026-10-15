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

### 2026-10-15 — `dbfbbe1` — CLAUDE.md + AGENTS.md link
Created `CLAUDE.md`: full project map (what BMS-CMS is, tech stack, structure, all DB tables, every public route + rendering pipeline, all admin sections, API routes, key components, complete ads system reference with positions/targeting/pageKind wiring, settings/customizer, auth, conventions). Linked from `AGENTS.md` §0 so new agents read it first.

### 2026-10-15 — `e214044` — parseAdBlocks: missing page kinds default to true
Old ad blocks saved before the `homepage`/`category`/`search` page kinds existed had those keys missing from `pages`. `!!undefined` turned them `false`, hiding sidebar ads on homepage/category/tag archives even though the user never unchecked anything. Now only keys actually present in the saved block are overridden; missing keys keep the default `true`.

### 2026-10-14 — `56b8344` — Search page layout fix
`content-shell` on the search page was missing `mx-auto px-4` (ContentShell always has them) — content was stuck to the left edge. Added.

### 2026-10-14 — `19cd862` — Ad pageKind targeting for archives
- Homepage (`[lang]/page.tsx`): now passes `pageKind="homepage"` (was default `"archive"`)
- Category (`CategoryArchive.tsx`): now passes `pageKind="category"`
- Tag (`tag/[slug]/page.tsx`): now passes `pageKind="archive"` explicitly
- `ContentShell` gained an `adPageKind` prop; `BlogArchive` passes its `pageKind` through so the **sidebar** ads use the same targeting as the content ads (previously sidebar always got `"archive"`).

### 2026-10-14 — `a8f7206` — Sidebar on archives/search + responsive ad images
- Archive pages (homepage, category, tag) now show the right sidebar when `archive_layout` is `"normal"` (the default). Only explicit `fullwidth`/`narrow`/`wide` hides it. Changed in `ContentShell.tsx` + matching CSS in `siteCss.ts`.
- Search page now renders the main `Sidebar` (widgets + sidebar ads), following `search_archive_layout` (`"normal"` = right sidebar).
- Ad images constrained: `.bms-adblock img { max-width: 100%; height: auto; }` in `site.css` + `globals.css` (970×250 billboard was overflowing).

### 2026-10-14 — `38ea85a` — Restored `@tiptap/core` + `prosemirror-state` in package.json
pnpm had removed them (only transitive); `protectBlocks.ts` imports them directly.

### 2026-10-15 — `57298cf` — Remaining executable scripts via Next.js `<Script>`
`FACADE_SCRIPT` (video facade) and `prefetchScript(...)` moved from raw JSX `<script>` to `<Script>`. Kills the React "script tag while rendering" warning.

### 2026-10-15 — `a82b649` — delayLoader via Next.js `<Script strategy="afterInteractive">`

### 2026-10-15 — `fa4277b` — Comment `<li>` hydration fix
`Comment` rendered its own `<li>` inside a parent `<li>` → invalid nesting. Now only the parent list owns the `<li>`.

### 2026-10-15 — `819a735` — Before/After excerpt ads out of archive cards
Excerpt ads were rendering inside every post card on front/archive pages. Removed from cards; they now show only around prev/next nav (posts/pages) and around pagination (front/archive).

### 2026-10-15 — `7195744` — Ad alignment fix for images/video/iframes
Tailwind preflight sets `img { display:block }`, so `text-align:center` never centered them. Alignment now uses auto-margins on the media element itself.

### 2026-10-14 — `39cd1a9` — Ads v6
`before_excerpt` moved below the prev/next border line; new sidebar slot **After widget…** with a widget-number dropdown listing only real configured widgets; custom ads interleaved after their widget in `Sidebar.tsx`.

### 2026-10-14 — `3326782` — Ads v4
Block names auto-renumber on delete (only auto "Block N" names; user-renamed kept); new positions Before/After menu (around site header), Before/After title (around `PostTitleBlock`), After footer.

### 2026-10-14 — Ads v3 `de9fe0d`, v5 `1e7be2f` — placement refinements
Paragraph/image injection for WordPress-imported `htmlEmbed` content; post/archive/comment/sidebar placement fixes.

### 2026-10-14 — `07f1f8a` — Corrected stale Ads v2 push

### 2026-10-14 — `ae3fde3` — Tools → WordPress WXR import/export
Admin Tools menu (under Settings, admin-only): Import from WP (WXR upload → `SiteExport` → existing import pipeline; posts/pages/categories/tags/media/comments, Rank Math SEO, featured images, HTML Embed blocks) and Export for WP (WXR 1.2 download). Needs `fast-xml-parser` (`pnpm install`).

---

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

- Full production build success not established in this conversation.
- User pulls each batch and tests on localhost:3000 — pushed ≠ verified.
- No Vercel deployment performed during this work.
