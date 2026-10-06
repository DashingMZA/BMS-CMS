-- Three objects the ORM schema cannot express, and that the CMS depends on.
--
-- `0000_init.sql` is generated from `src/lib/db/schema.ts`, so it contains
-- exactly what Drizzle can model. These three are written by hand because
-- Drizzle has no vocabulary for them — and without them a fresh install looks
-- fine right up until someone uses the search box, which returns nothing at all
-- because the column it queries does not exist.

-- Full-text search. A generated column, so it can never drift from the row it
-- describes: Postgres recomputes it on every write. The weights are what make
-- a title match outrank a body match (A > B > C).
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("search_text", '')), 'C')
  ) STORED;
--> statement-breakpoint

-- Without the index the search still works and simply scans every post, which
-- is invisible at ten posts and unusable at ten thousand.
CREATE INDEX IF NOT EXISTS "posts_search_tsv_idx" ON "posts" USING GIN ("search_tsv");
--> statement-breakpoint

-- A comment belongs to exactly one of a post or a page. The API checks this
-- too, and this is the guarantee: application checks are a usable error
-- message, a constraint is what makes the bad row impossible.
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_one_target";
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_one_target"
  CHECK (("post_id" IS NULL) <> ("page_id" IS NULL));
