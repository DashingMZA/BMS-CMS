-- A public author page is now opt-in, not opt-out. Only the default for
-- rows created from here on changes — nobody's existing page is touched.
ALTER TABLE "users" ALTER COLUMN "public_profile" SET DEFAULT false;
