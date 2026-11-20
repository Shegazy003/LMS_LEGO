-- LMS Lego, wave 5 task W5-1: announcements to a subject (product-contract v2
-- on PIL-246, section 6). Additive only: one new table and one index; no
-- earlier table, column or row is changed, and earlier code never reads it, so
-- while it runs no announcement shows and none can be posted (AT-5.3). The
-- down path is migrations-down/0014_announcements.down.sql, outside this
-- folder: only the owner runs it, after redeploying the earlier code (README,
-- "Rollback").
--
-- One row per announcement a subject's teacher or the space's admin posted.
-- No column names a person: the writer is kept as a role only (publisher or
-- admin), so ending or deleting an account touches nothing here. Nothing about
-- who read what is stored. The subject is referred to together with the space
-- (the content tables' style), so an announcement can never point at another
-- space's subject. Removing one sets removed_at and erases body in the same
-- statement; the CHECK allows an empty body only on a removed row. The
-- 500-character limit lives in code (src/announcements.ts), not here.
-- Times are ISO 8601 UTC text (for example 2026-11-20T06:30:00.000Z), so they
-- sort in time order.
CREATE TABLE announcement (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES space (id),
  subject_id  TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (removed_at IS NOT NULL OR length(body) >= 1),
  author_role TEXT NOT NULL CHECK (author_role IN ('publisher', 'admin')),
  created_at  TEXT NOT NULL,
  edited_at   TEXT,
  removed_at  TEXT,
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id)
);
CREATE INDEX announcement_by_subject ON announcement (space_id, subject_id, removed_at, created_at);
