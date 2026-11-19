-- LMS Lego, wave 4 task W4-1: the down path of
-- migrations/0013_chapters_in_order.sql (product-contract v2 on PIL-238,
-- section 6.2). NOT a migration: it lives outside migrations/, and neither the
-- deploy nor the Wrangler configuration refers to it, so nothing ever runs it
-- automatically.
--
-- It loses every subject's "open in order" setting (no learner data: done
-- marks stay). Running it on the live database is the owner's RED decision,
-- and only in this order:
--   1. redeploy the earlier code (the code before wave 4);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0013_chapters_in_order.down.sql
-- Running it while wave 4 code is live breaks every subject page.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 4, so a later forward apply adds the column again (every subject off).
ALTER TABLE subject DROP COLUMN chapters_in_order;
DELETE FROM d1_migrations WHERE name = '0013_chapters_in_order.sql';
