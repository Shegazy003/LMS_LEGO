-- LMS Lego, release 2 task R2-a: guardians (contract product-contract-r2,
-- section 5). Additive only: one new table; no table from 0001 to 0006 is
-- changed, and older code simply never reads it (AT-14: old code shows a
-- guardian nothing).
--
-- The guardian role itself needs no migration: membership.role is free text,
-- and a guardian is a membership row with role 'guardian'.
--
-- A link says which learner of a space a guardian may see. The admin makes
-- it, removes it (ended_at is set; nothing is deleted) and restores it (ended_at
-- back to NULL; the same row, unchanged otherwise). Every row carries space_id
-- (test/guards/space-isolation.test.ts); a person is never linked to themselves.
CREATE TABLE guardian_link (
  id               TEXT PRIMARY KEY,
  space_id         TEXT NOT NULL REFERENCES space (id),
  guardian_user_id TEXT NOT NULL REFERENCES user (id),
  learner_user_id  TEXT NOT NULL REFERENCES user (id),
  created_by       TEXT NOT NULL REFERENCES user (id),
  created_at       INTEGER NOT NULL,        -- milliseconds since 1970, UTC
  ended_at         INTEGER,                 -- NULL while the link is active
  UNIQUE (space_id, guardian_user_id, learner_user_id),
  CHECK (guardian_user_id <> learner_user_id)
);
CREATE INDEX guardian_link_guardian ON guardian_link (space_id, guardian_user_id);
