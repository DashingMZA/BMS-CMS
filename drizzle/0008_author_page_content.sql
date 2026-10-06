-- An author's public page as a real block-editable document, the same
-- shape posts and pages already carry. Null means "not customised yet" —
-- the author page falls back to the fixed avatar/bio/links layout built
-- from the profile fields directly.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "content" json;
