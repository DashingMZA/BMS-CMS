-- Elements: per-URL conditions + schedule window.
-- See schema.ts (elements table). Conditions JSON gains urls/excludeUrls arrays.
ALTER TABLE "elements" ADD COLUMN IF NOT EXISTS "start_at" timestamptz;
ALTER TABLE "elements" ADD COLUMN IF NOT EXISTS "end_at" timestamptz;
