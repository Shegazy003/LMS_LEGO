-- LMS Lego, wave 5 task W5-1: the down path of
-- migrations/0014_announcements.sql (product-contract v2 on PIL-246, section
-- 6.2). NOT a migration: it lives outside migrations/, and neither the deploy
-- nor the Wrangler configuration refers to it, so nothing ever runs it
-- automatically.
--
-- It deletes every announcement (no learner data: no person is named in the
-- table). Running it on the live database is the owner's RED decision, and
-- only in this order:
--   1. redeploy the earlier code (the code before wave 5);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0014_announcements.down.sql
-- Running it while wave 5 code is live breaks every page that reads announcements.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 5, so a later forward apply creates the empty table again.
DROP INDEX announcement_by_subject;
DROP TABLE announcement;
DELETE FROM d1_migrations WHERE name = '0014_announcements.sql';
