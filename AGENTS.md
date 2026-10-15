# AGENTS.md — BMS-CMS

Instructions for any AI agent working on this repository.

## 1. Read `MEMORY.md` first — always

`MEMORY.md` (repo root) is the **single source of truth** for this project.
It holds every task, fix, and change ever made here, with dates and push commits,
plus hard-won lessons (push mechanics, Next 16 conventions, pnpm quirks, ad-targeting rules).

- **Before starting any work:** read `MEMORY.md` completely.
- **Before pushing:** check it for related past fixes so you don't regress them.
- If `MEMORY.md` is missing or empty, treat the repo as unknown and be extra careful.

## 2. Record everything in `MEMORY.md` — even one word

After **every** completed task, update `MEMORY.md`:

- Add a dated entry under **Work log** (newest first): what changed, why, and the push commit hash.
- Update **Key files** / **intended placements** / **Open-verified** sections if the change affects them.
- Add a **lesson** under Hard-won lessons if you learned something reusable.
- **Even a single-word change gets an entry.** No exceptions. A one-line fix today is the regression someone hunts tomorrow.

Do this **before** you tell the user the work is done. Writing the entry is part of the task, not an afterthought.

## 3. Working rules for this repo

- **Branch:** `master`. Fetch and inspect remote immediately before every push — the user makes parallel changes.
- **Push:** only after fixes are complete, one clean commit per batch, pushed directly through linked GitHub access.
- **Never deploy.** Deployments are MANUAL ONLY (Vercel Ignored Build Step = "Don't build anything"). Keep **pushed**, **deployed**, and **user-verified** as three separate states.
- **Next 16+:** interception lives in `src/proxy.ts`, never `src/middleware.ts`.
- **Git Data API pushes:** the tree API never deletes. For renames/deletions, explicitly include the old path with `"sha": null`. Use `git diff --name-status` (not `--name-only`) to catch renames (R) and deletions (D).
- **pnpm strictness:** every directly-imported package must be a direct dependency in `package.json`.
- **Ads:** ad `pageKind` must match the real page (`homepage` / `category` / `archive` / `search` / `posts`). Sidebar ads go through `ContentShell`'s `adPageKind` prop. Missing keys in a saved block's `pages` object must default to `true`, never `false`.

## 4. Verification

- Run targeted `tsc --noEmit` and `eslint` on every changed file before committing.
- Inspect the complete diff before pushing.
- Never describe a batch as deployed or user-verified unless that separately happened. The user pulls and tests on localhost:3000 — pushed ≠ verified.
