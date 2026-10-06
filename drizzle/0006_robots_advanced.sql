-- Per-document robots directives beyond index/follow: noarchive, noimageindex,
-- nosnippet and the max-snippet / max-image-preview / max-video-preview
-- allowances. One JSON column rather than six, since the whole group is
-- read and written together and almost every row leaves it empty.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "robots_advanced" text;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "robots_advanced" text;
