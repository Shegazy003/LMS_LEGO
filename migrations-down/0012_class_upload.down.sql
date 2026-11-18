-- LMS Lego, wave 3b task W3b-1: the down path of migrations/0012_class_upload.sql
-- (product-contract v2 on PIL-232, section 6.3). NOT a migration: it lives
-- outside migrations/, and neither the deploy nor the Wrangler configuration
-- refers to it, so nothing ever runs it automatically.
--
-- It forgets which add made each membership and deletes every upload row (the
-- people added stay, as if appointed by hand). Running it on the live database
-- is the owner's RED decision, and only in this order:
--   1. redeploy the earlier code (the code before wave 3b);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0012_class_upload.down.sql
-- Running it while wave 3b code is live breaks the people pages.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 3b, so a later forward apply creates the table and the column again.
ALTER TABLE membership DROP COLUMN class_upload_id;
DROP INDEX class_upload_space_time;
DROP TABLE class_upload;
DELETE FROM d1_migrations WHERE name = '0012_class_upload.sql';
