// The one-time reset link (contract 0.3, AT-2 and section 8): the token, its
// life, the WhatsApp link and the fixed message. The routes that use these are
// tested against the running Worker in test/guards/reset-links.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64urlDecode } from '../../src/auth/encoding.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import {
  RESET_LINK_MS, RESET_MAX_ATTEMPTS, lastDigits, newResetToken, resetLinkState, resetMessage, whatsappHref,
} from '../../src/reset.ts';

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);

test('reset link: the token is random, at least 128 bits, and never repeats', () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const token = newResetToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/, 'URL-safe');
    const bytes = b64urlDecode(token);
    assert.ok(bytes && bytes.length * 8 >= 128, `at least 128 bits (got ${bytes ? bytes.length * 8 : 0})`);
    tokens.add(token);
  }
  assert.equal(tokens.size, 200);
});

test('reset link: it lives 30 minutes from creation, works once, and allows a bounded number of wrong usernames', () => {
  assert.equal(RESET_LINK_MS, 30 * 60_000);
  assert.equal(RESET_MAX_ATTEMPTS, 5);
  const row = { expires_at: T0 + RESET_LINK_MS, used_at: null, failed_attempts: 0 };
  assert.equal(resetLinkState(row, T0), 'usable');
  assert.equal(resetLinkState(row, T0 + RESET_LINK_MS - 1), 'usable', 'still usable one moment before 30 minutes');
  assert.equal(resetLinkState(row, T0 + RESET_LINK_MS), 'expired', 'dead at 30 minutes');
  assert.equal(resetLinkState({ ...row, used_at: T0 + 1 }, T0 + 2), 'used');
  assert.equal(resetLinkState({ ...row, failed_attempts: RESET_MAX_ATTEMPTS - 1 }, T0), 'usable', 'wrong usernames below the bound keep it alive');
  assert.equal(resetLinkState({ ...row, failed_attempts: RESET_MAX_ATTEMPTS }, T0), 'spent');
});

test('reset link: the WhatsApp button is a wa.me link with the international number and the message', () => {
  assert.equal(whatsappHref('+201022223333', 'سطر أول\nhttps://x.example/r/abc'),
    'https://wa.me/201022223333?text=' + encodeURIComponent('سطر أول\nhttps://x.example/r/abc'));
  assert.equal(whatsappHref('+201022223333', 'a b'), 'https://wa.me/201022223333?text=a%20b');
  for (const bad of ['01022223333', '201022223333', '+0123', '+20 10', '']) {
    assert.equal(whatsappHref(bad, 'x'), null, `refused: "${bad}"`);
  }
});

test('reset link: the admin sees only the last digits of the number', () => {
  assert.equal(lastDigits('+201022223333'), '3333');
  assert.equal(lastDigits('+966501234567'), '4567');
});

test('reset link: the message is a fixed product text in the space\'s first language, with the link alone on the last line', () => {
  const kit = seedKit('school');
  const link = 'https://lms.example/r/TOKEN_abc-123';
  const values = { space: 'مدرسة مسك', sender: 'Amal Hassan', role: makeLabel('ar', kit)('admin'), name: 'Hadeer', address: 'https://lms.example', link };
  const ar = resetMessage(makeLabel('ar', kit), values);
  const lines = ar.split('\n');
  assert.equal(lines.at(-1), link, 'the link alone on the last line');
  assert.ok(lines.slice(0, -1).every((l) => !l.includes(link)), 'the link appears only there');
  for (const part of ['مدرسة مسك', 'Amal Hassan', 'مدير', 'https://lms.example', 'صالح لمدة 30 دقيقة']) {
    assert.ok(ar.includes(part), `names "${part}"`);
  }
  const en = resetMessage(makeLabel('en', kit), { ...values, space: 'Mesk School', role: 'Administrator' });
  assert.equal(en.split('\n').at(-1), link);
  for (const part of ['Mesk School', 'Amal Hassan', 'https://lms.example', 'valid 30 minutes']) assert.ok(en.includes(part), `names "${part}"`);
});
