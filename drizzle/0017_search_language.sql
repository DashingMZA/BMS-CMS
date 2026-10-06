-- Full-text search in the post's own language, not always English.
--
-- 0001 built `search_tsv` with to_tsvector('english', …). Tokenising still
-- worked for every language (whitespace and punctuation), but there was no
-- stemming: Arabic "الكتاب" did not find "كتاب", French "chevaux" did not
-- find "cheval". The query in lib/search.ts used the same 'english' config
-- on purpose — a mismatch matches nothing — so both have to change together.
--
-- A generated column's expression cannot be ALTER-ed; drop and recreate.
-- The table is small (a CMS, not a corpus), so the rewrite is a restart.
-- cms_search_config() is the one list of languages; search.ts has the same
-- map and must stay in step.

CREATE OR REPLACE FUNCTION cms_search_config(lang text) RETURNS regconfig
LANGUAGE sql IMMUTABLE STRICT AS $fn$
  SELECT CASE lang
    WHEN 'en' THEN 'english'::regconfig
    WHEN 'ar' THEN 'arabic'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    WHEN 'it' THEN 'italian'::regconfig
    WHEN 'pt' THEN 'portuguese'::regconfig
    WHEN 'ru' THEN 'russian'::regconfig
    WHEN 'tr' THEN 'turkish'::regconfig
    WHEN 'nl' THEN 'dutch'::regconfig
    WHEN 'da' THEN 'danish'::regconfig
    WHEN 'fi' THEN 'finnish'::regconfig
    WHEN 'el' THEN 'greek'::regconfig
    WHEN 'hu' THEN 'hungarian'::regconfig
    WHEN 'id' THEN 'indonesian'::regconfig
    WHEN 'no' THEN 'norwegian'::regconfig
    WHEN 'nb' THEN 'norwegian'::regconfig
    WHEN 'ro' THEN 'romanian'::regconfig
    WHEN 'sv' THEN 'swedish'::regconfig
    ELSE 'simple'::regconfig
  END
$fn$;
--> statement-breakpoint

ALTER TABLE "posts" DROP COLUMN IF EXISTS "search_tsv";
--> statement-breakpoint

ALTER TABLE "posts" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector(cms_search_config("language"), coalesce("title", '')), 'A') ||
    setweight(to_tsvector(cms_search_config("language"), coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector(cms_search_config("language"), coalesce("search_text", '')), 'C')
  ) STORED;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "posts_search_tsv_idx" ON "posts" USING GIN ("search_tsv");
