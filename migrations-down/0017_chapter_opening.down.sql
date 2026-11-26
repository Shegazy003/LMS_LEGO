-- LMS Lego, wave 8 task W8-1a: the down path of
-- migrations/0017_chapter_opening.sql (product-contract v2 on PIL-299,
-- section 5, R2). NOT a migration: it lives outside migrations/, and neither
-- the deploy nor the Wrangler configuration refers to it, so nothing ever runs
-- it automatically.
--
-- It deletes every chapter's opening date and before-opening choice (no
-- learner data: no person is named in them; done marks and activity records
-- stay). Running it on the live database is the owner's RED decision, and only
-- in this order:
--   1. redeploy the earlier code (the code before wave 8);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0017_chapter_opening.down.sql
-- Running it while wave 8 code is live breaks every page that reads opening
-- dates.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 8, so a later forward apply adds the empty columns again.
ALTER TABLE chapter DROP COLUMN opens_hidden;
ALTER TABLE chapter DROP COLUMN opens_on;
DELETE FROM d1_migrations WHERE name = '0017_chapter_opening.sql';
