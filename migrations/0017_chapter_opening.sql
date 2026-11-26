-- LMS Lego, wave 8 task W8-1a: chapter opening dates (product-contract v2 on
-- PIL-299, section 5, R1). Additive only: two new columns on chapter; no
-- earlier table, column or row is changed (every existing chapter gets no date
-- and the choice "shown locked"), and earlier code never reads the columns, so
-- with it every chapter is open (AT-5.3). The down path is
-- migrations-down/0017_chapter_opening.down.sql, outside this folder: only the
-- owner runs it, after redeploying the earlier code (README, "Rollback").
--
-- An opening date is a date only (YYYY-MM-DD, a UTC day): the chapter opens at
-- 00:00 UTC on that day. opens_hidden is the before-opening choice: 0 = shown
-- locked (the default), 1 = hidden. Nothing else is stored: no lock and no
-- per-learner row; the lock is worked out at each load. The 730-day limit
-- lives in code (src/opening.ts), not here.
ALTER TABLE chapter ADD COLUMN opens_on TEXT NULL CHECK (opens_on IS NULL OR opens_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE chapter ADD COLUMN opens_hidden INTEGER NOT NULL DEFAULT 0 CHECK (opens_hidden IN (0, 1));
