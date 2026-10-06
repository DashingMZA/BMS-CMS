CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"translation_group" integer,
	"parent_id" integer,
	"archive_color" text,
	"archive_hover_color" text,
	"header_image" text,
	"archive_columns" varchar(10) DEFAULT 'default' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"focus_keyword" text,
	"canonical_url" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"no_index" boolean DEFAULT false NOT NULL,
	"no_follow" boolean DEFAULT false NOT NULL,
	"no_archive" boolean DEFAULT false NOT NULL,
	"no_image_index" boolean DEFAULT false NOT NULL,
	"no_snippet" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer,
	"page_id" integer,
	"parent_id" integer,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"author_url" text,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" json,
	"hook" varchar(40) DEFAULT 'before_footer' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"conditions" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_name" text DEFAULT 'Contact' NOT NULL,
	"page_path" text,
	"data" json NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" text,
	"caption" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"auto_add_pages" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer,
	"label" text NOT NULL,
	"object_type" varchar(20) DEFAULT 'custom',
	"object_id" integer,
	"icon" text,
	"description" text,
	"badge" text,
	"highlight" varchar(20),
	"mega_menu" boolean DEFAULT false,
	"mega_columns" integer DEFAULT 2,
	"url" text NOT NULL,
	"target" varchar(10) DEFAULT '_self',
	"order" integer DEFAULT 0,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "not_found_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"referrer" text,
	"last_hit" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "not_found_log_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" json,
	"featured_image" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"template" varchar(50) DEFAULT 'default',
	"author_id" text,
	"seo_title" text,
	"seo_description" text,
	"seo_keywords" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"twitter_title" text,
	"twitter_description" text,
	"twitter_image" text,
	"canonical_url" text,
	"no_index" boolean DEFAULT false,
	"no_follow" boolean DEFAULT false,
	"schema_type" varchar(50) DEFAULT 'WebPage',
	"transparent_header" varchar(10) DEFAULT 'default' NOT NULL,
	"show_title" varchar(10) DEFAULT 'default' NOT NULL,
	"post_layout" varchar(20) DEFAULT 'default' NOT NULL,
	"content_style" varchar(10) DEFAULT 'default' NOT NULL,
	"vertical_spacing" varchar(20) DEFAULT 'default' NOT NULL,
	"show_featured_image" varchar(10) DEFAULT 'default' NOT NULL,
	"show_comments" varchar(10) DEFAULT 'default' NOT NULL,
	"deleted_at" timestamp with time zone,
	"css_classes" text,
	"disable_header" boolean DEFAULT false NOT NULL,
	"disable_footer" boolean DEFAULT false NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"translation_group" integer,
	"published_at" timestamp with time zone,
	"script_head" text,
	"script_body_end" text,
	"custom_css" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "post_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" json,
	"search_text" text,
	"featured_image" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"category_id" integer,
	"author_id" text,
	"seo_title" text,
	"seo_description" text,
	"seo_keywords" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"twitter_title" text,
	"twitter_description" text,
	"twitter_image" text,
	"canonical_url" text,
	"no_index" boolean DEFAULT false,
	"no_follow" boolean DEFAULT false,
	"schema_type" varchar(50) DEFAULT 'Article',
	"transparent_header" varchar(10) DEFAULT 'default' NOT NULL,
	"show_title" varchar(10) DEFAULT 'default' NOT NULL,
	"post_layout" varchar(20) DEFAULT 'default' NOT NULL,
	"content_style" varchar(10) DEFAULT 'default' NOT NULL,
	"vertical_spacing" varchar(20) DEFAULT 'default' NOT NULL,
	"show_featured_image" varchar(10) DEFAULT 'default' NOT NULL,
	"show_comments" varchar(10) DEFAULT 'default' NOT NULL,
	"deleted_at" timestamp with time zone,
	"css_classes" text,
	"disable_header" boolean DEFAULT false NOT NULL,
	"disable_footer" boolean DEFAULT false NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"translation_group" integer,
	"published_at" timestamp with time zone,
	"script_head" text,
	"script_body_end" text,
	"custom_css" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"destination" text NOT NULL,
	"type" integer DEFAULT 301 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_kind" varchar(10) NOT NULL,
	"document_id" integer NOT NULL,
	"title" text,
	"content" json,
	"excerpt" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"type" varchar(20) DEFAULT 'text',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"translation_group" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password" text,
	"role" varchar(20) DEFAULT 'editor' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false,
	"last_login" timestamp with time zone,
	"slug" text,
	"bio" text,
	"website" text,
	"twitter" text,
	"linkedin" text,
	"facebook" text,
	"instagram" text,
	"github" text,
	"youtube" text,
	"seo_title" text,
	"seo_description" text,
	"canonical_url" text,
	"og_image" text,
	"no_index" boolean DEFAULT false NOT NULL,
	"public_profile" boolean DEFAULT true NOT NULL,
	"page_layout" varchar(20) DEFAULT 'default' NOT NULL,
	"content_style" varchar(10) DEFAULT 'default' NOT NULL,
	"vertical_spacing" varchar(20) DEFAULT 'default' NOT NULL,
	"transparent_header" varchar(10) DEFAULT 'default' NOT NULL,
	"disable_header" boolean DEFAULT false NOT NULL,
	"disable_footer" boolean DEFAULT false NOT NULL,
	"css_classes" text,
	"custom_css" text,
	"script_head" text,
	"script_body_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_language_slug_key" ON "categories" USING btree ("language","slug");--> statement-breakpoint
CREATE INDEX "categories_language_idx" ON "categories" USING btree ("language");--> statement-breakpoint
CREATE INDEX "categories_translation_group_idx" ON "categories" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","status");--> statement-breakpoint
CREATE INDEX "comments_page_status_created_idx" ON "comments" USING btree ("page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "media_url_idx" ON "media" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_language_slug_key" ON "pages" USING btree ("language","slug");--> statement-breakpoint
CREATE INDEX "pages_language_idx" ON "pages" USING btree ("language","status");--> statement-breakpoint
CREATE INDEX "pages_translation_group_idx" ON "pages" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "post_tags_tag_idx" ON "post_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_language_slug_key" ON "posts" USING btree ("language","slug");--> statement-breakpoint
CREATE INDEX "posts_language_idx" ON "posts" USING btree ("language","status","published_at");--> statement-breakpoint
CREATE INDEX "posts_translation_group_idx" ON "posts" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "posts_status_published_idx" ON "posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id","published_at");--> statement-breakpoint
CREATE INDEX "revisions_document_idx" ON "revisions" USING btree ("document_kind","document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_language_slug_key" ON "tags" USING btree ("language","slug");--> statement-breakpoint
CREATE INDEX "tags_language_idx" ON "tags" USING btree ("language");--> statement-breakpoint
CREATE INDEX "tags_translation_group_idx" ON "tags" USING btree ("translation_group");