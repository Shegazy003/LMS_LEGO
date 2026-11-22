-- LMS Lego, wave 6 task W6-1: due dates on lessons and chapters
-- (product-contract v2 on PIL-257, section 6.1). Additive only: two new
-- columns and two indexes; no earlier table, column or row is changed (every
-- existing row gets NULL), and earlier code never reads the columns, so while
-- it runs no due date shows and none can be set (AT-5.3). The down path is
-- migrations-down/0015_due_dates.down.sql, outside this folder: only the owner
-- runs it, after redeploying the earlier code (README, "Rollback").
--
-- A due date is a date only (YYYY-MM-DD, a UTC day, "by the end of that day").
-- It lives on the lesson or chapter row itself: no new table, no person, no
-- per-learner row. The to-do list is worked out at each page load from these
-- dates and the learner's own done marks. The 730-day limit lives in code
-- (src/due.ts), not here.
ALTER TABLE chapter ADD COLUMN due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE lesson  ADD COLUMN due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
CREATE INDEX chapter_due ON chapter (space_id, due_on) WHERE due_on IS NOT NULL;
CREATE INDEX lesson_due  ON lesson  (space_id, due_on) WHERE due_on IS NOT NULL;
