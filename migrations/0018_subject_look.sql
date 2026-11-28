-- LMS Lego, redesign wave R1b: a subject's colour and icon, chosen by its
-- responsible teacher (product-contract v2 on PIL-322, S7, D6). Additive only:
-- two new nullable columns on subject; no earlier table, column or row is
-- changed, and earlier code never reads them.
--
-- Each column holds a KEY of the fixed sets in src/look.ts, never a free colour
-- or a file name: look_colour one of c01 to c12, look_icon one of the sixteen
-- icon keys. NULL (every existing subject) means automatic: the colour worked
-- out from the subject's id and the neutral "book" icon. A key the code does
-- not know (after a later change of the sets) is read as automatic too.
--
-- Deploy order: apply this migration BEFORE deploying the R1b Worker. The down
-- path is migrations-down/0018_subject_look.down.sql, outside this folder: only
-- the owner runs it, after redeploying the earlier code (README, "Rollback").
ALTER TABLE subject ADD COLUMN look_colour TEXT;
ALTER TABLE subject ADD COLUMN look_icon TEXT;
