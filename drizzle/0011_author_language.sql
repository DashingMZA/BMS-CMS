-- Language override for the author page's <html lang>, independent of the
-- URL's own language segment (this document answers under every language
-- prefix, unlike a post or page). Null means "follow the page's language."
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" varchar(16);
