-- LMS Lego, wave 3b task W3b-1: add a class from a spreadsheet
-- (product-contract v2 on PIL-232, section 6.2). Additive only: one new table
-- and one new nullable column; no earlier table, column or row is changed, and
-- older code never reads either (AT-5.5). The down path is
-- migrations-down/0012_class_upload.down.sql, outside this folder: only the
-- owner runs it, after redeploying the earlier code (README, "Rollback").
--
-- One row per add (the "trail"): which space, who added, when (milliseconds
-- since 1970, UTC) and two counts. Nothing else: no name, username, mobile
-- number, role, file name or file text. A check makes no row; the file itself
-- is never stored. The rows go with their space.
CREATE TABLE class_upload (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  uploaded_by   TEXT NOT NULL REFERENCES user (id),
  uploaded_at   INTEGER NOT NULL,
  lines_added   INTEGER NOT NULL,
  lines_refused INTEGER NOT NULL
);
CREATE INDEX class_upload_space_time ON class_upload (space_id, uploaded_at);

-- The add that made a membership, set only by an add (appointing by hand
-- leaves it NULL). The add writes it from the upload row of the same space in
-- the same statement (src/upload.ts), so it never names another space's upload.
ALTER TABLE membership ADD COLUMN class_upload_id TEXT REFERENCES class_upload (id) ON DELETE SET NULL;
