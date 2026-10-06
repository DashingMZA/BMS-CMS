-- SEO fields, featured image, slug and category ride along with a revision.
-- Until this column existed a restore put the title and body back and left
-- the rest as they were — so undoing a bad SEO edit was the one thing the
-- history panel could not do.
ALTER TABLE "revisions" ADD COLUMN IF NOT EXISTS "meta" json;
