-- LMS Lego, release 1: each person's own page language (AT-5, task 5).
-- Additive only: one nullable column; no table from 0001 to 0003 is changed
-- otherwise, and older code simply ignores it.
--
-- NULL (the default) means "the space's first language", as before. A person
-- who chooses a language on My account stores 'ar' or 'en' here; inside a
-- space it applies when the space offers that language, and it decides the
-- page language and direction (dir="rtl" or dir="ltr") of that person's pages.
ALTER TABLE user ADD COLUMN lang TEXT CHECK (lang IS NULL OR lang IN ('ar', 'en'));
