-- LMS Lego, release 1: tables for AT-1 (owner, spaces, kits, admins, sessions,
-- usage). Migrations are additive: a later release adds tables or columns and
-- never rewrites these, so rolling back the code never breaks the data.
--
-- Scoping: every row that belongs to a space carries space_id (a space row's
-- own id is its space_id). Product-level rows do not: user and kit (as in the
-- Lego model), session (one per signed-in browser) and usage_day (product-wide
-- totals for the owner's panel).

CREATE TABLE user (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- pbkdf2-sha256$iterations$salt$hash
  display_name  TEXT NOT NULL,
  mobile        TEXT NOT NULL,           -- international form, e.g. +201012345678
  is_owner      INTEGER NOT NULL DEFAULT 0,
  recovery_hash TEXT,                    -- owner only: SHA-256 of the one-time recovery code
  created_at    INTEGER NOT NULL         -- milliseconds since 1970, UTC
);
-- Exactly one owner account in this release.
CREATE UNIQUE INDEX user_single_owner ON user (is_owner) WHERE is_owner = 1;

-- One kit row per space: a copy of a seed kit, editable without touching any
-- other space. json holds languages, labels, theme (see docs/02-LEGO-MODEL.md).
CREATE TABLE kit (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE space (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  kit_id               TEXT NOT NULL UNIQUE REFERENCES kit (id),
  default_country_code TEXT NOT NULL,    -- e.g. +20
  created_by           TEXT NOT NULL REFERENCES user (id),
  created_at           INTEGER NOT NULL
);

CREATE TABLE membership (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES space (id),
  user_id     TEXT NOT NULL REFERENCES user (id),
  role        TEXT NOT NULL,             -- admin, publisher, learner (free text for later roles)
  valid_from  TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  valid_until TEXT NOT NULL,             -- YYYY-MM-DD, UTC; access ends the day after
  granted_by  TEXT NOT NULL REFERENCES user (id),
  UNIQUE (space_id, user_id, role)
);
CREATE INDEX membership_user ON membership (user_id);

CREATE TABLE session (
  id         TEXT PRIMARY KEY,           -- SHA-256 of the cookie token; the token itself is never stored
  user_id    TEXT NOT NULL REFERENCES user (id),
  expires_at INTEGER NOT NULL            -- milliseconds; 30 days after last use
);
CREATE INDEX session_user ON session (user_id);

CREATE TABLE usage_day (
  day      TEXT PRIMARY KEY,             -- YYYY-MM-DD, UTC
  requests INTEGER NOT NULL DEFAULT 0,
  writes   INTEGER NOT NULL DEFAULT 0
);
