-- Per-document writing direction. Null means "follow the language" — the
-- site's Direction setting for the default language, the script's own
-- direction otherwise. Set when one document is written against the grain of
-- its language, or when the language itself was recorded wrongly.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "direction" varchar(4);
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "direction" varchar(4);
