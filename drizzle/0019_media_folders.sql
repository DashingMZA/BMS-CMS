-- Media library folders. See schema.ts (mediaFolders, media.folderId).
CREATE TABLE IF NOT EXISTS "media_folders" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "parent_id" integer REFERENCES "media_folders"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "folder_id" integer REFERENCES "media_folders"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "media_folder_idx" ON "media" ("folder_id");
