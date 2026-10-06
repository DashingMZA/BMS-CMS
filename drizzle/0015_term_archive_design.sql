-- One category's own archive colours, overriding Appearance → Archive for
-- that category only: the band behind the title, the page behind the cards,
-- the title, description and count, and every part of a card.
--
-- A JSON object rather than a dozen columns, keyed by the same setting names
-- the site-wide panel writes (`archive_title_color`, `archive_card_bg`, …), so
-- the term path and the site path feed the very same CSS builders and cannot
-- drift. Null or empty = follow the site.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "archive_design" text;
