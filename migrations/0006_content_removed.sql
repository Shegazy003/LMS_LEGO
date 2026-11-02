-- LMS Lego, release 1.1: the publisher removes and restores content (AT-8,
-- build task 12). Additive only: one nullable column on each of chapter,
-- lesson and material; no table from 0001 to 0005 is changed otherwise.
--
-- NULL (the default) means the item shows, as in release 1. A time here
-- (milliseconds since 1970, UTC) is when the publisher removed it: from that
-- moment no reading page shows it and its address answers "not found". The
-- row, its position and its file stay exactly as they were, so "Restore"
-- (setting it back to NULL) puts it back in its old place with the same file.
-- Nothing is deleted. Older code ignores the column and would show removed
-- items again (see README, rollback).
ALTER TABLE chapter ADD COLUMN removed_at INTEGER;
ALTER TABLE lesson ADD COLUMN removed_at INTEGER;
ALTER TABLE material ADD COLUMN removed_at INTEGER;
