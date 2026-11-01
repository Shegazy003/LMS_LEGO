import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_NAME_MAX, USERNAME_MAX, cleanDisplayName, isUsername, typedUsername } from '../../src/names.ts';
import { userKey } from '../../src/auth/limits.ts';

test('names: a username is 3 to 32 characters of a-z, digits, dot, dash, underscore', () => {
  assert.equal(USERNAME_MAX, 32);
  assert.ok(isUsername('amal.admin'));
  assert.ok(isUsername('u'.repeat(32)));
  assert.ok(!isUsername('u'.repeat(33)));
  assert.ok(!isUsername('ab'));
  assert.ok(!isUsername('Amal'));
});

test('names: a typed username is trimmed and lower-cased; one longer than the maximum is no username at all', () => {
  assert.equal(typedUsername('  Amal.Admin '), 'amal.admin');
  assert.equal(typedUsername('u'.repeat(32)), 'u'.repeat(32));
  assert.equal(typedUsername('u'.repeat(33)), '');
  assert.equal(typedUsername('a'.repeat(100_000)), '');
});

test('names: the rate-limit key of a username is bounded, whatever is typed', () => {
  assert.equal(userKey('Hadeer'), 'u:hadeer');
  assert.ok(userKey('a'.repeat(100_000)).length <= 2 + USERNAME_MAX);
  assert.ok(!userKey('a'.repeat(100_000)).includes('a'.repeat(USERNAME_MAX + 1)));
});

test('names: a display name is 1 to 100 characters on one line', () => {
  assert.equal(DISPLAY_NAME_MAX, 100);
  assert.equal(cleanDisplayName('  Amal Hassan  '), 'Amal Hassan');
  assert.equal(cleanDisplayName('سلمى عادل'), 'سلمى عادل');
  assert.equal(cleanDisplayName('م'.repeat(100)), 'م'.repeat(100));
  for (const bad of ['', '   ', 'n'.repeat(101), 'a\nb', 'a\rb', 'a\tb', 'a b', 'a‮b', 'a⁦b', 'a\u0000b', 'a\u0085b']) {
    assert.equal(cleanDisplayName(bad), null, JSON.stringify(bad));
  }
  // Counted in characters, not UTF-16 units: 100 emoji are 100 characters.
  assert.equal(cleanDisplayName('😀'.repeat(100)), '😀'.repeat(100));
  assert.equal(cleanDisplayName('😀'.repeat(101)), null);
});
