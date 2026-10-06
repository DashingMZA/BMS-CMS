-- Errors the site has thrown, readable from the admin. See schema.ts.
CREATE TABLE IF NOT EXISTS "error_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" varchar(20) DEFAULT 'render' NOT NULL,
  "path" text,
  "method" varchar(10),
  "message" text NOT NULL,
  "stack" text,
  "digest" varchar(64),
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_created_idx" ON "error_log" USING btree ("created_at");
