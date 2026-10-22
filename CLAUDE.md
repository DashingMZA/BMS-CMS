# CLAUDE.md — BMS-CMS

> **What this file is:** A complete map of the BMS-CMS project for any AI agent.
> Read this one file to understand what the project is, how it's organized,
> what every major page/component/function does, and how features connect.
>
> **For working rules** (how to push, what never to do, where to log work),
> see [`AGENTS.md`](./AGENTS.md). For the chronological work history,
> see [`MEMORY.md`](./MEMORY.md).

---

## 1. What is BMS-CMS?

**BMS CMS** (Blog Custom Content Management) is a WordPress-style blog CMS built with
Next.js 16. It powers content-heavy biography/blog sites (e.g. celebrtiy.com clones)
with:

- A **public site**: homepage, post pages, category/tag archives, search, author pages, paginated listings
- An **admin panel** (`/admin`): posts, pages, categories, tags, media, comments, menus, widgets, ads, SEO, tools (WordPress import/export), settings, users
- An **Ad Inserter-style ads system**: visual ad blocks with positions (before/after post, between posts, sidebar slots, etc.), alignment, and per-page-type targeting
- A **Customizer** (live preview): site identity, colors, typography, layouts (post/page/archive/search), header/footer builder, sidebar widgets
- **Block editor** (BlockNote) for posts/pages with custom blocks
- **i18n**: multi-language content (`en`, `fr`, etc.) with per-language URLs (`/en/...`, `/fr/...`)

**Owner:** Zaheer Ahmad · **Repo:** https://github.com/DashingMZA/BMS-CMS · **Branch:** `master`
**Version:** 1.9.63 · **Deployments:** manual only (never auto-deploy)

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4.0 (App Router, Turbopack in dev) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4 |
| Database | PostgreSQL via Drizzle ORM (`drizzle-orm` 0.45) + `@neondatabase/serverless` |
| Auth | NextAuth v5 (beta) + bcryptjs, TOTP 2FA via `otplib` |
| Editor | BlockNote 0.56 (`@blocknote/core/react/mantine`) over TipTap 3 + ProseMirror |
| Media | `sharp` (image processing); storage drivers in `lib/mediaStorage.ts` — local disk, Amazon S3, Cloudflare R2, GitHub repo, Vercel Blob (automatic fallback) |
| Email | `nodemailer` |
| WP interop | `fast-xml-parser` (WXR import), custom WXR export |
| Package manager | pnpm 12 (`pnpm-workspace.yaml` holds overrides/catalogs) |
| Node | >= 24 |

**Key conventions:**
- Route interception uses `src/proxy.ts` (NOT `src/middleware.ts`) — Next 16 convention.
- `pnpm dev` runs `next dev --turbopack`.
- Every directly-imported npm package must be a direct dependency (pnpm strictness).

---

## 3. Project structure

```
src/
├── app/
│   ├── (site)/[lang]/            # PUBLIC SITE (see §5)
│   │   ├── page.tsx              # Homepage (latest posts)
│   │   ├── page/[page]/page.tsx   # Homepage pagination
│   │   ├── [...path]/page.tsx     # Posts & static pages (catch-all)
│   │   ├── category/[slug]/page.tsx (+ /page/[page]/)
│   │   ├── tag/[slug]/page.tsx (+ /page/[page]/)
│   │   └── search/page.tsx
│   ├── (admin)/admin/            # ADMIN PANEL (see §6)
│   │   ├── (auth)/               # login, forgot, reset, setup
│   │   ├── (cms)/                # posts, pages, ads, customize, tools…
│   │   └── (customizer)/customize # Customizer UI shell
│   ├── (preview)/preview/        # Customizer live preview routes
│   ├── api/                      # REST API routes (see §7)
│   ├── site/[file]/route.ts      # Serves generated site CSS
│   ├── globals.css / site.css    # Base styles + ad styles
│   └── layout.tsx
├── components/
│   ├── frontend/                 # Public-site components (see §8)
│   ├── admin/                    # Admin UI components
│   │   └── customizer/           # Customizer panels
│   └── editor/                   # BlockNote editor + custom blocks
├── lib/
│   ├── db/schema.ts              # Drizzle schema — ALL tables (see §4)
│   ├── ads.ts                    # Ads system core (see §9)
│   ├── settings.ts               # getSiteSettings() + cache
│   ├── appearanceSettings.ts     # Customizer defaults + widget parsing
│   ├── siteCss.ts                # Generates the site stylesheet dynamically
│   ├── seo.ts / seoMeta.ts       # SEO templates, meta, JSON-LD
│   ├── permalinks.ts             # URL builders (postPath, categoryPath…)
│   ├── search.ts                 # Search query logic
│   └── …150 lib files total      # blocks, menus, media, auth, forms, etc.
├── proxy.ts                      # Next 16 route interception (auth gating)
└── instrumentation.ts
scripts/                          # db-migrate.mjs, smoke.mjs, make-upload.mjs
```

---

## 4. Database (Drizzle — `src/lib/db/schema.ts`)

PostgreSQL tables:

| Table | Purpose |
|---|---|
| `users` | Admin users (roles, 2FA, approval status) |
| `sessions` | Auth sessions |
| `posts` | Blog posts (status, language, content JSON blocks, SEO fields, featured image) |
| `pages` | Static pages (same block system as posts) |
| `categories` | Categories (multi-language, hierarchy, archive design JSON) |
| `tags` | Tags (multi-language) |
| `postTags` | Post↔tag join |
| `comments` | Comments (threaded, moderated) |
| `media` | Media library (files, metadata, title/alt/caption, blur preview) |
| `mediaFolders` | Media library folders (hierarchy via parentId) |
| `site_settings` | **Key-value store — almost all configuration lives here** (ads blocks, sidebar widgets, Customizer values, SEO, scripts) |
| `menus` / `nav_items` | Navigation menus |
| `revisions` | Post/page revision history |
| `redirects` | URL redirects |
| `not_found_log` | 404 monitor |
| `plugins` | Plugin registry |
| `error_log` | Error log viewer |
| `elements` | Reusable Elements (hooks: before/after content, header/footer; schedule + device targeting) |
| `form_submissions` | Form entries |

**Important:** there are almost no dedicated config tables. Ads (`ads_blocks`, `ads_txt`),
sidebar widgets (`sidebar_widgets`), Customizer values (`archive_layout`, `post_layout`,
colors, fonts…), header/footer scripts (`script_head`, `script_body_end`) are all rows
in `site_settings`, read via `getSiteSettings()` (cached, TTL).

---

## 5. Public site — routes & how pages render

All public routes live under `src/app/(site)/[lang]/` and are wrapped in
`SiteLayout` (header, footer, menus, global scripts/ads).

| Route | File | What it does |
|---|---|---|
| `/` , `/en` | `[lang]/page.tsx` | Homepage — latest posts via `BlogArchive` (`pageType="front"`, `pageKind="homepage"`) |
| `/page/2` | `[lang]/page/[page]/page.tsx` | Homepage pagination |
| `/my-post-slug` | `[lang]/[...path]/page.tsx` | **Catch-all:** resolves posts, pages, author pages, date archives. Renders via `ContentShell` (`kind="post"` or `"page"`) |
| `/category/x` | `[lang]/category/[slug]/page.tsx` | Category archive → `CategoryArchive` → `BlogArchive` (`pageKind="category"`) |
| `/tag/x` | `[lang]/tag/[slug]/page.tsx` | Tag archive → `BlogArchive` (`pageKind="archive"`) |
| `/search?q=` | `[lang]/search/page.tsx` | Search results → `SearchResults` + main `Sidebar` (`pageKind="search"`) |
| `/feed.xml` | `[lang]/feed.xml/route.ts` | RSS feed |

### Rendering pipeline (every content page)

```
Route → SiteLayout (header/footer/global ads)
       → ContentShell (layout shell: kind=page|post|archive)
           → .content-shell[data-kind][data-layout][data-style]
               → .content-grid
                   → article.content-article  (title, content, ads, comments…)
                   → aside.content-sidebar    (Sidebar — only when layout says so)
```

- **`ContentShell`** (`components/frontend/ContentShell.tsx`): decides layout from the document's
  `postLayout` or the site default (`post_layout` / `page_layout` / `archive_layout`).
  Archives treat `"normal"` as right-sidebar. Accepts `adPageKind` so sidebar ads
  target the real page type.
- **`BlogArchive`** (`components/frontend/BlogArchive.tsx`): post-card listings with
  pagination, category chips, before/after/between-posts ads, term (category/tag) styling.
- **`Sidebar`** (`components/frontend/Sidebar.tsx`): widgets (search / recent posts /
  categories / tags — from `sidebar_widgets` setting) + sidebar ad slots
  (Top / Middle / Bottom / After widget N). Takes `pageKind` for ad targeting.
- **`BlockRenderer`** (`components/frontend/BlockRenderer.tsx`): renders BlockNote/TipTap
  block JSON to HTML (the biggest component — all custom block types).
- **`SiteLayout`** (`components/frontend/SiteLayout.tsx`): header/nav, footer, Before/After
  menu ads, After footer ads, delay-loaded scripts, dark mode, sticky header.

### Sidebar visibility rule

A page shows the sidebar when its layout is `left-sidebar`/`right-sidebar`, or when the
layout is `default` and the site-wide setting for its kind is a sidebar layout.
For archives (`kind="archive"`), `"normal"` counts as right-sidebar. The generated
stylesheet (`src/lib/siteCss.ts`) mirrors this rule in CSS — React and CSS must agree.

---

## 6. Admin panel (`/admin`)

Login at `/admin/login` (NextAuth, optional TOTP 2FA). All `/admin/(cms)/*` routes are
admin-gated via `proxy.ts` + `authz.ts`.

| Section | Route | What it does |
|---|---|---|
| Dashboard | `/admin` | Overview widgets |
| Posts | `/admin/posts` | List, `/new`, `/[id]` edit (BlockNote editor), `/stale` |
| Pages | `/admin/pages` | Same pattern as posts |
| Categories / Tags | `/admin/categories`, `/admin/tags` | Taxonomy managers (+ per-category archive design) |
| Media | `/admin/media` | Media library: upload (`sharp` processing), folders, **bulk delete**, **bulk move**, 50/page pagination, title/alt/caption editing |
| Comments | `/admin/comments` | Moderation queue |
| Ads | `/admin/ads` | **Ad Blocks manager** (see §9) + ads.txt editor + header/footer scripts |
| Appearance → Customize | `/admin/customize` | **Customizer** with live preview: site identity, colors, fonts, layouts, header/footer builder, sidebar widgets, homepage sections |
| Navigation / Menus | `/admin/navigation` | Menu builder |
| Elements | `/admin/elements` | Reusable content blocks injected at hooks (before/after content, etc.) |
| Forms | `/admin/forms` | Form builder + submissions |
| SEO | `/admin/seo` | Titles/meta templates, sitemap, robots, redirections, 404 monitor |
| Tools | `/admin/tools` | **WordPress WXR import/export**, site export/import, backup |
| Settings | `/admin/settings` | Tabbed: General, **Media Storage** (upload driver — local / S3 / R2 / GitHub — with per-driver credentials and a connection test), Language & Region, Permalinks, Sitemap & robots.txt, Export/Import |
| Users | `/admin/users` | User management, roles, author pages |
| Plugins / Health / Speed / Errors / Links / Updates | misc | Plugin registry, site health, performance, error log, link manager, updates |

**Editor:** posts/pages use BlockNote (`components/editor/`). Content is stored as block JSON.
WordPress-imported posts store raw HTML in `htmlEmbed` blocks. `protectBlocks.ts` guards
special blocks (uses `@tiptap/core` + `prosemirror-state` directly — keep them as deps).

---

## 7. API routes (`src/app/api/`)

REST endpoints for the admin UI and public features. Notable:

- `api/auth/*` — NextAuth handlers, 2FA check, forgot/reset
- `api/posts`, `api/pages`, `api/categories`, `api/tags`, `api/comments`, `api/media` — CRUD
- `api/settings` — site settings read/write
- `api/export`, `api/backup` — site export
- `api/tools/import-wp`, `api/tools/export-wp` — WordPress WXR import/export
- `api/cache/purge`, `api/cron/publish`, `api/cron/purge` — maintenance
- `api/forms/*`, `api/elements/*`, `api/errors`, `api/fonts`

---

## 8. Key frontend components

| Component | Role |
|---|---|
| `SiteLayout.tsx` | Page frame: header, nav, footer, global ad slots, scripts |
| `ContentShell.tsx` | Layout shell for posts/pages/archives; sidebar rule; `adPageKind` prop |
| `BlogArchive.tsx` | Archive listings, cards, pagination, in-list ads |
| `CategoryArchive.tsx` | Wraps `BlogArchive` with category data |
| `SearchResults.tsx` | Search result listing |
| `Sidebar.tsx` | Widgets + sidebar ads; `pageKind` prop drives ad targeting |
| `AdSlot.tsx` | `AdBlocks` server component — renders ad blocks by position/slot/pageKind |
| `PostAfterContent.tsx` | Tags, share, author box, related posts, excerpt ads |
| `PostComments.tsx` | Comment list + form (no nested-`<li>` — parent owns the `<li>`) |
| `PostTitleBlock.tsx` | Title block with Before/After title ad hooks |
| `BlockRenderer.tsx` | Renders all block types from block JSON |
| `HeaderNav.tsx` / `NavList.tsx` / `OffCanvas.tsx` | Navigation |
| `Pagination.tsx` | Archive pagination |
| `ElementSlot.tsx` | Injects Elements at named hooks |
| `ScriptRunner.tsx` | Executes ad/script HTML safely (`data-bms-html`) |
| `SiteExtras.tsx` | Dark mode toggle, scroll animations, extras |

---

## 9. Ads system (Ad Inserter-style)

**Storage:** `site_settings` rows — `ads_blocks` (JSON array), `ads_txt` (served at `/ads.txt`),
`script_head` / `script_body_end` (same keys the Customizer's Custom Scripts edits).

**Core:** `src/lib/ads.ts`
- `AdBlock` type: `{ id, name, code, enabled, position, count, alignment, device, sidebarPosition, sidebarId, sticky, startAt, endAt, pages }`
  - `device`: `"auto"` (all screens) | `"desktop"` (≥768px) | `"mobile"` (≤767px)
  - `sidebarId`: `1` | `2` — which sidebar the block targets
  - `sticky`: sidebar-only CSS sticky
  - `startAt`/`endAt`: schedule window (ISO strings)
- `newAdBlock(i)` — defaults: all `pages` true, `sidebarPosition: "top"`, `sidebarId: 1`, `device: "auto"`
- `parseAdBlocks(raw)` — defensive parse; **missing page-kind keys keep default `true`** (never `!!undefined` → false); old blocks get `sticky: false`, `device: "auto"`, `sidebarId: 1`
- `isBlockLive(b)` — enabled + position ≠ disabled + non-empty code + **inside schedule window**
- `blocksFor(blocks, position, pageKind)` — filter by position + `pages[pageKind]`
- `sidebarBlocksFor(blocks, slot, pageKind)` — sidebar slots: `top` / `middle` / `bottom` / `custom` (After widget N)
- `injectContentAds(blocks, pageKind)` — structured blocks (paragraph N / image N)
- `injectHtmlAds(html, blocks, pageKind)` — WP-imported HTML (`<p>`/`<img>` counting; featured image excluded)
- `parseAdShortcode` / `findAdBlockByShortcode` — `[adinserter block="N"]` / `[adinserter name="…"]`
- `adAlignmentClass(alignment)` — left/center/right/float/no-wrap; media elements use auto-margins (Tailwind preflight makes `img` block-level, so `text-align` alone never centers them)
- `AD_PAGE_KINDS` — `posts` (Posts), `homepage` (Homepage), `category` (Category pages), `static` (Static pages), `search` (Search pages), `archive` (Tag / Archive pages)

**Page-kind wiring (must stay in sync):**
| Page | `pageKind` passed |
|---|---|
| Single post | `"posts"` |
| Homepage | `"homepage"` |
| Category archive | `"category"` |
| Tag archive | `"archive"` |
| Search | `"search"` |
| Static page | `"static"` |

`BlogArchive` receives `pageKind` and forwards it to `ContentShell` via the `adPageKind`
prop so **sidebar** ads target the same kind as content ads.

**Positions & intended placements:**
- `before_menu` / `after_menu` — around the site header
- `before_title` / `after_title` — around `PostTitleBlock` (posts/pages)
- `before_paragraph` / `after_paragraph` (+ `count` = N), `before_image` / `after_image` (+ N)
- `before_post` / `after_post` — post page: around content; front/archive: around the card list
- `between_posts` — after every 3rd card (front/archive); after related posts (single post)
- `before_excerpt` / `after_excerpt` — around prev/next nav (posts/pages) or pagination (front/archive); never inside archive cards
- `before_comments` / `between_comments` — comment section placement
- `sidebar` — slots Top / Middle (after middle widget) / Bottom / After widget N (dropdown lists only real configured widget numbers **for the selected sidebar**); **Sidebar 1/2 selector** per block; frontend filters by `sidebarId` so ads only render in their target sidebar
- `after_footer` — after `</footer>`
- Shortcodes render manually inside article paragraphs even when auto-position is Disabled
- **Device targeting:** `AdBlockView` adds `bms-ad-desktop` / `bms-ad-mobile` classes; `globals.css` hides desktop-only on ≤767px and mobile-only on ≥768px (`auto` shows everywhere)

**Admin UI:** `src/app/(admin)/admin/(cms)/ads/page.tsx` — block list with status badge
(green/red driven by the Insertion dropdown; Disabled = off), code editor, position/alignment/
targeting controls, Before/After menu+title+footer options, sidebar slot picker.

**Frontend rendering:** `AdBlocks` (`AdSlot.tsx`) → `AdBlockView`; scripts execute via
`ScriptRunner` (`data-bms-html`). Ad images are constrained by
`.bms-adblock img { max-width: 100%; height: auto; }`.

---

## 10. Settings & Customizer system

- `getSiteSettings()` (`lib/settings.ts`) — cached read of `site_settings`; invalidated on save.
- **Media storage** (`lib/mediaStorage.ts`): Settings → Media Storage picks the upload driver (`storage_driver`: `local` / `s3` / `r2` / `github`; empty = automatic — Vercel Blob if its token is set, else local disk). Per-driver credentials are `storage_*` keys (admin-only — stripped for non-admins). S3/R2 use hand-rolled SigV4 fetch (no SDK); GitHub commits each upload (Contents API ≤1 MB, Git data API above). Each media row records `storage` + `storage_key` (migration `0027`) so deletes go to the driver that holds the file. WP-import media pulls store through the same layer.
- `appearanceSettings.ts` — TypeScript types + **defaults** for every Customizer key
  (`post_layout`, `page_layout`, `archive_layout: "normal"`, `search_archive_layout: "normal"`,
  `sidebar_widgets` default: Search / Recent Posts / Categories, colors, fonts…).
- `parseSidebarWidgets(raw)` — parses `sidebar_widgets` JSON; frontend renders only IDs in
  `SIDEBAR_WIDGET_IDS` (`swidget1`–`swidget4`).
- `siteCss.ts` — generates the entire site stylesheet from settings (layout widths, sidebar
  visibility/order, colors, typography); served at `/site/[file]`.
- Customizer UI: `components/admin/customizer/*Panel.tsx` + live preview at `/preview/customizer`.

---

## 11. Auth & security

- NextAuth v5 (`api/auth/[...nextauth]`), credentials + bcryptjs.
- Optional TOTP 2FA (`otplib`, QR via `qrcode`) — enforced per user.
- `proxy.ts` gates `/admin/*` (auth + role via `authz.ts`).
- **Three roles** (`ROLES = ["admin", "editor", "author"]` in `authz.ts`):
  - `admin` — everything: users, settings, site structure
  - `editor` — all content (posts, pages, media, comments, etc.) but not users, settings, or site structure
  - `author` — their own posts only; no pages, no moderation, nothing structural
  - New users default to `editor`; the first account (via `/admin/setup`) is admin.
- Password reset via email (`nodemailer`); forgot/reset routes under `(auth)`.
- Secrets (`script_head`, tokens) are admin-only in settings reads.

### First-run setup

- `/admin/setup` — creates the first admin account on a fresh install (no login required; disabled once a user exists).
- `/admin/login` — normal login (all roles).

### Production server (`server.js`)

- `server.js` (repo root) is a plain-Node startup file for hosts that launch a Node app
  themselves (cPanel "Setup Node.js App" / Passenger / LiteSpeed, Plesk). It builds the
  Next.js app, wraps the request handler in an HTTP server, and listens — the same thing
  `next start` does, but as a requirable module.
- On a VPS with pm2/systemd, `pnpm run start` does the same job; `server.js` is not needed
  there (though `pm2 start server.js` also works).
- Deploy script: `pnpm run deploy` = `pnpm install && pnpm db:migrate && pnpm build` (see `package.json`).

### Plugin system

- **Full guide:** [`PLUGINS.md`](./PLUGINS.md). Samples in `plugins-samples/` (`bmi-calculator.zip`, `starter.zip`).
- Plugins are zip-uploaded via Admin → Plugins and extracted to `plugins/` on disk, next to the app.
- Each plugin is isolated (its CSS can't affect the site or vice versa), server-rendered, and can expose settings + shortcodes (e.g. `[bmi-calculator]`).
- **Vercel limitation:** Vercel's disk is read-only at runtime — uploaded plugins won't persist. Use plugins on VPS/cPanel hosts; on Vercel, bundle plugins into the deployment.

---

## 12. Conventions & gotchas (from MEMORY.md lessons)

- `src/proxy.ts` — never `src/middleware.ts`.
- Git Data API tree calls never delete — include old paths with `"sha": null` on renames/deletes.
- pnpm 12: no `"pnpm"` field; overrides/catalogs in `pnpm-workspace.yaml`.
- Keep `@tiptap/core` + `prosemirror-state` as direct deps.
- `parseAdBlocks`: missing `pages` keys → default `true`.
- Ad alignment for media: auto-margins, not `text-align`.
- Comment `<li>`: parent list owns it; `Comment` renders content only.
- Executable scripts: use Next.js `<Script>`, never raw JSX `<script>` (React warning).
- `[...path]` catch-all resolves posts/pages/authors — check it before adding new top-level routes.

---

## 13. Docs index

| File | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | **This file** — full project map for any agent |
| [`AGENTS.md`](./AGENTS.md) | Working rules: read MEMORY.md first, log every change, push/deploy rules |
| [`MEMORY.md`](./MEMORY.md) | Chronological work log with commits — the project's memory |
