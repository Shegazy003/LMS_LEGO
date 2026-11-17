-- LMS Lego, wave 2 task W2-1: done marks (product-contract v2 on PIL-225,
-- section 6). Additive only: one new table; no earlier table is changed, and
-- older code never reads it (AT-3.3: old code shows nothing of it and writes
-- no done mark). The down path is migrations-down/0011_done_marks.down.sql,
-- outside this folder: only the owner runs it, after redeploying the earlier
-- code (README, "Rollback").
--
-- One row per learner and lesson the learner marked as done. Only that
-- learner's press writes it (src/progress.ts); undo deletes the row. Nothing
-- else is stored: no "undone" state, no history, no count, no device, no time
-- spent. marked_at (milliseconds since 1970, UTC, the moment of the press) only
-- orders marks; it is never shown, sent or logged. The lesson is referred to
-- together with the space, so a mark can never point at another space's
-- lesson, and every mark disappears with its learner, its lesson or its space
-- in the same statement.
CREATE TABLE done_mark (
  space_id        TEXT NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  lesson_id       TEXT NOT NULL,
  learner_user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  marked_at       INTEGER NOT NULL,
  PRIMARY KEY (space_id, learner_user_id, lesson_id),
  FOREIGN KEY (lesson_id, space_id) REFERENCES lesson (id, space_id) ON DELETE CASCADE
);
