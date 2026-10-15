-- Categories: featured flag.
-- See schema.ts (categories table). Marks a category as featured so it can
-- be highlighted in lists and widgets.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false;
