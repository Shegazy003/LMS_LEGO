-- LMS Lego, redesign wave R1b: the down path of migrations/0018_subject_look.sql
-- (product-contract v2 on PIL-322, S7). NOT a migration: it lives outside
-- migrations/, and neither the deploy nor the Wrangler configuration refers to
-- it, so nothing ever runs it automatically.
--
-- It deletes every subject's chosen colour and icon (no learner data: they are
-- keys of fixed sets). Running it on the live database is the owner's RED
-- decision, and only in this order:
--   1. redeploy the earlier code (the code before wave R1b);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0018_subject_look.down.sql
-- Running it while R1b code is live breaks every page that reads a subject's look.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave R1b (d1a5ae3), so a later forward apply adds the empty columns again.
ALTER TABLE subject DROP COLUMN look_icon;
ALTER TABLE subject DROP COLUMN look_colour;
DELETE FROM d1_migrations WHERE name = '0018_subject_look.sql';
