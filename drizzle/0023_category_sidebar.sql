-- Categories: per-category sidebar choice.
-- See schema.ts (categories table). "default" follows the Customizer's
-- global sidebar_choice; "sidebar1"/"sidebar2" override it for the archive.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "sidebar_choice" varchar(10) NOT NULL DEFAULT 'default';
-- Tags get the same column — a tag archive is a term archive too.
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "sidebar_choice" varchar(10) NOT NULL DEFAULT 'default';
