-- A tiny blurred preview per image, made at upload. See schema.ts.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "blur" text;
