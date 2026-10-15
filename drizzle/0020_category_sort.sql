-- Manual sort order for categories. See schema.ts.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
