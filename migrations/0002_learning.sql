-- LMS Lego, release 1: groups, subjects and their content (AT-4, and later
-- AT-2 and AT-3). Additive only: no table from 0001 is changed.
--
-- Scoping: every row here carries space_id. A child row's space_id must equal
-- its parent's: each child refers to its parent by (id, space_id), so the
-- database itself refuses a chapter, lesson, material, access row or group
-- member that points into another space.
--
-- People (admins, publishers, learners) and their end dates stay in
-- membership (0001).

CREATE TABLE "group" (
  id       TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES space (id),
  name     TEXT NOT NULL,
  UNIQUE (id, space_id)
);
CREATE INDEX group_space ON "group" (space_id);

CREATE TABLE group_member (
  space_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id  TEXT NOT NULL REFERENCES user (id),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id, space_id) REFERENCES "group" (id, space_id)
);
CREATE INDEX group_member_user ON group_member (space_id, user_id);

CREATE TABLE subject (
  id                TEXT PRIMARY KEY,
  space_id          TEXT NOT NULL REFERENCES space (id),
  title             TEXT NOT NULL,
  publisher_user_id TEXT REFERENCES user (id),  -- exactly one responsible publisher (may be unset while drafting)
  is_published      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id, space_id)
);
CREATE INDEX subject_space ON subject (space_id);

-- Who may read a subject: one group or one user per row.
CREATE TABLE subject_access (
  id         TEXT PRIMARY KEY,
  space_id   TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  group_id   TEXT,
  user_id    TEXT REFERENCES user (id),
  CHECK ((group_id IS NULL) <> (user_id IS NULL)),
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id),
  FOREIGN KEY (group_id, space_id) REFERENCES "group" (id, space_id)
);
CREATE INDEX subject_access_subject ON subject_access (space_id, subject_id);
CREATE UNIQUE INDEX subject_access_group ON subject_access (subject_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX subject_access_user ON subject_access (subject_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE chapter (
  id         TEXT PRIMARY KEY,
  space_id   TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id)
);
CREATE INDEX chapter_subject ON chapter (space_id, subject_id, position);

CREATE TABLE lesson (
  id         TEXT PRIMARY KEY,
  space_id   TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  body_text  TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  UNIQUE (id, space_id),
  FOREIGN KEY (chapter_id, space_id) REFERENCES chapter (id, space_id)
);
CREATE INDEX lesson_chapter ON lesson (space_id, chapter_id, position);

-- A file (pdf, image) lives in R2 under storage_key; a link keeps its url; a
-- note keeps its text. Every material has a stable id (Later: print orders).
CREATE TABLE material (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL,
  lesson_id   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('pdf', 'image', 'video_link', 'link', 'note')),
  title       TEXT NOT NULL,
  storage_key TEXT,
  url         TEXT,
  note_text   TEXT,
  position    INTEGER NOT NULL,
  CHECK (
    (kind IN ('pdf', 'image') AND storage_key IS NOT NULL) OR
    (kind IN ('video_link', 'link') AND url IS NOT NULL) OR
    (kind = 'note' AND note_text IS NOT NULL)
  ),
  FOREIGN KEY (lesson_id, space_id) REFERENCES lesson (id, space_id)
);
CREATE INDEX material_lesson ON material (space_id, lesson_id, position);
