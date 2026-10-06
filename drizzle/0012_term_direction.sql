-- Per-term text-direction override for the category and tag archives, the
-- same field posts, pages and authors carry (see 0007 and 0010). Null means
-- "follow the term's language".
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "direction" varchar(4);
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "direction" varchar(4);
