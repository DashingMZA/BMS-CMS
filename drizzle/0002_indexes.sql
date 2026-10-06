-- Indexes the ORM schema does not describe.
--
-- Like the objects in 0001, these were added by hand as the CMS grew and were
-- never modelled in `schema.ts`, so `0000_init.sql` does not contain them. A
-- fresh install without them is not merely slower — the last one is a
-- correctness guarantee, not a performance one.

-- Every public query filters `deleted_at IS NULL` to exclude trashed
-- documents, which without an index means reading the whole table on every
-- page view.
CREATE INDEX IF NOT EXISTS "posts_deleted_at_idx" ON "posts" ("deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_deleted_at_idx" ON "pages" ("deleted_at");
--> statement-breakpoint

-- A comment thread is read as "this post's approved comments, oldest first".
CREATE INDEX IF NOT EXISTS "comments_post_status_created_idx"
  ON "comments" ("post_id", "status", "created_at");
--> statement-breakpoint

-- An author's public page lives at /author/<slug>, so two users sharing a slug
-- means one of them has an unreachable page. Partial, because `slug` is null
-- for every user without a public profile and those must not collide with each
-- other. This one is data integrity: without it the duplicate is possible, and
-- nothing in the application would notice until the second page 404ed.
CREATE UNIQUE INDEX IF NOT EXISTS "users_slug_key"
  ON "users" ("slug") WHERE "slug" IS NOT NULL;
