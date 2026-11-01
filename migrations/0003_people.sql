-- LMS Lego, release 1: one-time reset links and the sign-in rate limit
-- (AT-2, task 4). Additive only: no table from 0001 or 0002 is changed.
--
-- Both are product-level tables, like session: a reset link belongs to one
-- person (issuing a new one kills every older one of that person), and an
-- attempt count belongs to a username or a client. reset_link records the
-- space whose name and language its page shows.

-- A one-time link to set a new password (docs/02-LEGO-MODEL.md, rule 5, and
-- the safeguards in the product contract, section 8). Only the SHA-256 of the
-- token is stored; the token itself exists only in the link.
CREATE TABLE reset_link (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user (id),
  space_id        TEXT NOT NULL REFERENCES space (id),
  token_hash      TEXT NOT NULL UNIQUE,
  created_at      INTEGER NOT NULL,          -- milliseconds since 1970, UTC
  expires_at      INTEGER NOT NULL,          -- created_at + 30 minutes
  used_at         INTEGER,                   -- set on use, and when a newer link is issued
  failed_attempts INTEGER NOT NULL DEFAULT 0, -- wrong usernames typed on this link
  created_by      TEXT NOT NULL REFERENCES user (id)
);
CREATE INDEX reset_link_user ON reset_link (user_id);

-- Failed sign-in and reset attempts, counted per key: 'u:<username>' or
-- 'c:<hash of the client address>' (the address itself is never stored).
-- A row is written only on a failure; a refused attempt writes nothing.
CREATE TABLE attempt_limit (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,             -- milliseconds; the first failure of this window
  failures     INTEGER NOT NULL
);
CREATE INDEX attempt_limit_window ON attempt_limit (window_start);
