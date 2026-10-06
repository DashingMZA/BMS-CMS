-- The card design one category's archive uses, overriding Appearance →
-- Archive for that category only — the same shape as `archive_columns`
-- beside it, where `default` means "follow the site-wide setting".
-- Values: default | classic | elevated | bordered | overlay | list | minimal.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "archive_card_style" varchar(12) DEFAULT 'default' NOT NULL;
