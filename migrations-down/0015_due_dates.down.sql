-- LMS Lego, wave 6 task W6-1: the down path of migrations/0015_due_dates.sql
-- (product-contract v2 on PIL-257, section 6.2). NOT a migration: it lives
-- outside migrations/, and neither the deploy nor the Wrangler configuration
-- refers to it, so nothing ever runs it automatically.
--
-- It deletes every due date of every lesson and chapter (no learner data: no
-- person is named in them; done marks stay). Running it on the live database
-- is the owner's RED decision, and only in this order:
--   1. redeploy the earlier code (the code before wave 6);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0015_due_dates.down.sql
-- Running it while wave 6 code is live breaks every page that reads due dates.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 6, so a later forward apply adds the empty columns again.
DROP INDEX lesson_due;
DROP INDEX chapter_due;
ALTER TABLE lesson DROP COLUMN due_on;
ALTER TABLE chapter DROP COLUMN due_on;
DELETE FROM d1_migrations WHERE name = '0015_due_dates.sql';
