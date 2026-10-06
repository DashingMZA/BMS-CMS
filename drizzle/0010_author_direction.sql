-- Per-account text-direction override for the author page, the same field
-- posts and pages already carry (see 0007_direction.sql). Null means "follow
-- whichever language the archive is being read in."
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "direction" varchar(4);
