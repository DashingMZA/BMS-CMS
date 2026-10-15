-- 0026: Media title field (shown in the library detail panel, editable).
ALTER TABLE media ADD COLUMN IF NOT EXISTS title text;
