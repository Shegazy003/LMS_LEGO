-- LMS Lego, release 2 task R2-d: lesson activity (contract product-contract-r2,
-- section 5 and AT-15). Additive only: two new tables; no earlier table is
-- changed, and older code never reads them (AT-14: old code shows nothing and
-- writes no lesson-view row).
--
-- The admin's switch, one row per space once it has been used. Off by
-- default: a space without a row is off (AT-15a). Switching on needs the
-- "people were told" tick (told_confirmed) and sets enabled_since to that
-- day; switching off deletes every lesson_view row of the space in the same
-- batch (src/activity.ts).
CREATE TABLE lesson_view_setting (
  space_id       TEXT NOT NULL UNIQUE REFERENCES space (id),
  enabled        INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  enabled_since  TEXT,                      -- YYYY-MM-DD, set at each switch-on
  told_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (told_confirmed IN (0, 1)),
  changed_by     TEXT NOT NULL REFERENCES user (id),
  changed_at     INTEGER NOT NULL           -- milliseconds since 1970, UTC
);

-- One row per learner and lesson: the date (a calendar day, never a time) the
-- learner last opened it. Nothing else is stored (AT-15e): no time of day, no
-- count, no duration, no address, no device. The lesson is referred to
-- together with the space, so a row can never point at another space's lesson.
CREATE TABLE lesson_view (
  space_id        TEXT NOT NULL REFERENCES space (id),
  lesson_id       TEXT NOT NULL,
  learner_user_id TEXT NOT NULL REFERENCES user (id),
  last_opened_on  TEXT NOT NULL CHECK (length(last_opened_on) = 10 AND last_opened_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  UNIQUE (space_id, lesson_id, learner_user_id),
  FOREIGN KEY (lesson_id, space_id) REFERENCES lesson (id, space_id)
);
