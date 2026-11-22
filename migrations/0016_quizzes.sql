-- LMS Lego, wave 7 task W7-1: online quizzes (product-contract v2 on PIL-261,
-- section 6.1). Additive only: two new tables and two indexes; no earlier
-- table, column or row is changed, and earlier code never reads the tables, so
-- while it runs no quiz shows and none can be taken (AT-6.3). The down path is
-- migrations-down/0016_quizzes.down.sql, outside this folder: only the owner
-- runs it, after redeploying the earlier code (README, "Rollback").
--
-- A quiz belongs to a subject and names no person (no author). Its questions,
-- answers and right answers live in questions_json (src/quiz.ts writes and
-- reads it). An attempt is one learner's one sending: the chosen answers, one
-- right/wrong flag per question, and the score. The database itself refuses a
-- quiz of another space's subject, an attempt on another space's quiz, and a
-- second attempt by the same learner on the same quiz. The limits (titles,
-- questions, answers, quizzes per subject) live in code (src/quiz.ts).
CREATE TABLE quiz (
  id             TEXT PRIMARY KEY,
  space_id       TEXT NOT NULL REFERENCES space (id),
  subject_id     TEXT NOT NULL,
  title          TEXT NOT NULL,
  questions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(questions_json)),
  rev            INTEGER NOT NULL DEFAULT 0,
  state          TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'open', 'closed')),
  created_at     INTEGER NOT NULL,
  removed_at     INTEGER,
  UNIQUE (id, space_id),
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id)
);
CREATE INDEX quiz_subject ON quiz (space_id, subject_id);

CREATE TABLE quiz_attempt (
  id              TEXT PRIMARY KEY,
  space_id        TEXT NOT NULL,
  quiz_id         TEXT NOT NULL,
  learner_user_id TEXT NOT NULL REFERENCES user (id),
  rev             INTEGER NOT NULL,
  answers_json    TEXT NOT NULL CHECK (json_valid(answers_json)),
  right_flags     TEXT NOT NULL,          -- one '1' or '0' per question, in order
  score           INTEGER NOT NULL CHECK (score >= 0),
  question_count  INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 20),
  sent_at         INTEGER NOT NULL,       -- milliseconds since 1970, UTC
  UNIQUE (quiz_id, learner_user_id),
  FOREIGN KEY (quiz_id, space_id) REFERENCES quiz (id, space_id)
);
CREATE INDEX quiz_attempt_learner ON quiz_attempt (space_id, learner_user_id);
