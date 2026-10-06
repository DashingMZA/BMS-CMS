-- Structured data an author adds to a post or page by hand (SEO → Schema):
-- a JSON array of typed entries, see src/lib/schemaTypes.ts. Null = none.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "schemas" text;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "schemas" text;
