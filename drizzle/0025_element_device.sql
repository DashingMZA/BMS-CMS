-- 0025: Element device targeting (desktop / mobile / all).
ALTER TABLE elements ADD COLUMN IF NOT EXISTS device varchar(10) NOT NULL DEFAULT 'all';
