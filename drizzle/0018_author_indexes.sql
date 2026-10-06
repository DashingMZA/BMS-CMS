-- Author archives and each author's own post list filter on author_id, and
-- nothing indexed it: every such query read the whole posts table. Cheap now,
-- slower with every post. IF NOT EXISTS so a re-run is harmless.
CREATE INDEX IF NOT EXISTS "posts_author_idx" ON "posts" ("author_id", "published_at");
CREATE INDEX IF NOT EXISTS "pages_author_idx" ON "pages" ("author_id");
