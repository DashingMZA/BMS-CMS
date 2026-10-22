-- 0027: Which storage driver holds each media file, and its key there.
-- Uploads used to be assumed local-disk (or Vercel Blob when a token was
-- set). With selectable drivers (Settings → Media Storage: local / S3 / R2 /
-- GitHub) a row must remember where its bytes live, or a later driver switch
-- would send deletes to the wrong place. `storage_key` is the object key /
-- repo path the file was stored under (null for rows from before this —
-- deletes then derive it from the filename, as the old code derived paths).
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'local';
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage_key text;
