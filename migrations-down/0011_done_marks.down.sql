-- LMS Lego, wave 2 task W2-1: the down path of migrations/0011_done_marks.sql
-- (product-contract v2 on PIL-225, section 6.4). NOT a migration: it lives
-- outside migrations/, and neither the deploy nor the Wrangler configuration
-- refers to it, so nothing ever runs it automatically.
--
-- It deletes every done mark. Running it on the live database is the owner's
-- RED decision, and only in this order:
--   1. redeploy the earlier code (the code before wave 2);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0011_done_marks.down.sql
-- Running it while wave 2 code is live breaks every learner page.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 2, so a later forward apply creates the table again (empty).
DROP TABLE done_mark;
DELETE FROM d1_migrations WHERE name = '0011_done_marks.sql';
