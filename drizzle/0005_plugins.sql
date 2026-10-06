-- Installed plugins (tools placed with a shortcode). See schema.ts.
CREATE TABLE IF NOT EXISTS "plugins" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "version" varchar(32) DEFAULT '1.0.0' NOT NULL,
  "description" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "manifest" text NOT NULL,
  "settings" text DEFAULT '{}' NOT NULL,
  "installed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plugins_slug_unique" UNIQUE("slug")
);
