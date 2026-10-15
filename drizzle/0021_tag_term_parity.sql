-- Tag term parity with categories: per-tag archive design + SEO.
-- See schema.ts (tags table).
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "archive_color" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "archive_hover_color" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "header_image" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "archive_columns" varchar(10) NOT NULL DEFAULT 'default';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "archive_card_style" varchar(12) NOT NULL DEFAULT 'default';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "archive_design" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "seo_title" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "seo_description" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "focus_keyword" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "canonical_url" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "og_title" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "og_description" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "og_image" text;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "no_index" boolean NOT NULL DEFAULT false;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "no_follow" boolean NOT NULL DEFAULT false;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "no_archive" boolean NOT NULL DEFAULT false;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "no_image_index" boolean NOT NULL DEFAULT false;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "no_snippet" boolean NOT NULL DEFAULT false;
