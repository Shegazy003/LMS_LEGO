-- LMS Lego, wave 7 task W7-1: the down path of migrations/0016_quizzes.sql
-- (product-contract v2 on PIL-261, section 6.2). NOT a migration: it lives
-- outside migrations/, and neither the deploy nor the Wrangler configuration
-- refers to it, so nothing ever runs it automatically.
--
-- It deletes every quiz and every learner's answers and scores. Running it on
-- the live database is the owner's RED decision, and only in this order:
--   1. redeploy the earlier code (the code before wave 7);
--   2. then run this script on the database:
--      npx wrangler d1 execute <database> --remote --file migrations-down/0016_quizzes.down.sql
-- Running it while wave 7 code is live breaks every page that reads quizzes.
--
-- Afterwards the schema and Wrangler's applied-migrations record equal those
-- before wave 7, so a later forward apply adds the empty tables again.
DROP INDEX quiz_attempt_learner;
DROP TABLE quiz_attempt;
DROP INDEX quiz_subject;
DROP TABLE quiz;
DELETE FROM d1_migrations WHERE name = '0016_quizzes.sql';
