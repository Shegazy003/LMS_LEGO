-- LMS Lego, release 2 task R2-b: exams, marks and their history (contract
-- product-contract-r2, section 5). Additive only: three new tables and two
-- triggers; no table from 0001 to 0007 is changed, and older code simply never
-- reads them (AT-14: old code shows nobody a mark).
--
-- An exam belongs to one subject of a space and is made by that subject's
-- publisher. A result is one learner's mark (or Absent) for one exam: a draft
-- while published_at is NULL, seen by nobody but the publisher; published from
-- the moment published_at is set, in one atomic step for the whole list, and
-- then seen by that learner only. Each child refers to its parent by
-- (id, space_id), so the database itself refuses a row that points into
-- another space (test/guards/space-isolation.test.ts).
--
-- The history keeps every published value: one row when a result is first
-- published (previous = none), and from R2-c one row per correction, with its
-- reason. It is append-only: triggers refuse every change and every removal of
-- a history row, whoever asks. Its rows are reached through their result,
-- which carries space_id.
CREATE TABLE exam (
  id         TEXT PRIMARY KEY,
  space_id   TEXT NOT NULL REFERENCES space (id),
  subject_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  exam_date  TEXT NOT NULL,                -- YYYY-MM-DD
  max_mark   REAL NOT NULL CHECK (max_mark > 0),
  created_by TEXT NOT NULL REFERENCES user (id),
  created_at INTEGER NOT NULL,             -- milliseconds since 1970, UTC
  UNIQUE (id, space_id),
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id)
);
CREATE INDEX exam_subject ON exam (space_id, subject_id);

CREATE TABLE exam_result (
  id              TEXT PRIMARY KEY,
  space_id        TEXT NOT NULL,
  exam_id         TEXT NOT NULL,
  learner_user_id TEXT NOT NULL REFERENCES user (id),
  status          TEXT NOT NULL CHECK (status IN ('marked', 'absent')),
  mark            REAL,                    -- NULL when absent
  published_at    INTEGER,                 -- NULL while a draft
  changed_by      TEXT NOT NULL REFERENCES user (id),
  changed_at      INTEGER NOT NULL,
  UNIQUE (exam_id, learner_user_id),
  CHECK ((status = 'absent' AND mark IS NULL) OR (status = 'marked' AND mark IS NOT NULL AND mark >= 0)),
  FOREIGN KEY (exam_id, space_id) REFERENCES exam (id, space_id)
);
CREATE INDEX exam_result_learner ON exam_result (space_id, learner_user_id);

CREATE TABLE exam_result_history (
  id              TEXT PRIMARY KEY,
  result_id       TEXT NOT NULL REFERENCES exam_result (id),
  previous_status TEXT,                    -- NULL at the first publish
  previous_mark   REAL,
  new_status      TEXT NOT NULL CHECK (new_status IN ('marked', 'absent')),
  new_mark        REAL,
  reason          TEXT,                    -- NULL at the first publish; required for a correction (R2-c)
  changed_by      TEXT NOT NULL REFERENCES user (id),
  changed_at      INTEGER NOT NULL
);
CREATE INDEX exam_result_history_result ON exam_result_history (result_id);

CREATE TRIGGER exam_result_history_no_update BEFORE UPDATE ON exam_result_history
BEGIN
  SELECT RAISE(ABORT, 'exam_result_history is append-only');
END;

CREATE TRIGGER exam_result_history_no_delete BEFORE DELETE ON exam_result_history
BEGIN
  SELECT RAISE(ABORT, 'exam_result_history is append-only');
END;
