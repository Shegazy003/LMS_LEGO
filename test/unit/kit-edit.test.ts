import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_MAX, labelField, readLabels, switchedKit } from '../../src/kits/edit.ts';
import { SEED_KITS, seedKit } from '../../src/kits/seed.ts';
import { CONCEPTS, type Lang } from '../../src/labels.ts';

const school = () => {
  const kit = seedKit('school');
  kit.theme = { ...kit.theme, primaryColor: '#0b6e4f', logoKey: 'spaces/x/logo', logoType: 'image/png' };
  return kit;
};
const LANGS: Lang[] = ['ar', 'en'];
const full = (kit = school()) => Object.fromEntries(LANGS.flatMap((l) => CONCEPTS.map((c) => [labelField(l, c), kit.labels[l][c]])));

test('kit edit: a full form reads back as the labels, trimmed', () => {
  const body = { ...full(), [labelField('en', 'publisher')]: '  Coach ', [labelField('ar', 'publisher')]: 'مرشد' };
  const r = readLabels(body, LANGS);
  assert.ok(r.ok);
  assert.equal(r.labels.en.publisher, 'Coach');
  assert.equal(r.labels.ar.publisher, 'مرشد');
  assert.deepEqual(Object.keys(r.labels).sort(), ['ar', 'en']);
  for (const l of LANGS) assert.deepEqual(Object.keys(r.labels[l]).sort(), [...CONCEPTS].sort());
});

test('kit edit: a label is 1 to 40 characters on one line', () => {
  assert.equal(LABEL_MAX, 40);
  const key = labelField('en', 'group');
  assert.ok(readLabels({ ...full(), [key]: 'x'.repeat(40) }, LANGS).ok);
  for (const bad of ['', '   ', 'x'.repeat(41), 'a\nb', 'a‮b']) {
    const r = readLabels({ ...full(), [key]: bad }, LANGS);
    assert.ok(!r.ok, JSON.stringify(bad));
    assert.equal(r.ok ? '' : r.error, 'labelInvalid');
  }
});

test('kit edit: every language must carry exactly the same keys', () => {
  const missing = full();
  delete missing[labelField('en', 'lesson')];
  assert.deepEqual(readLabels(missing, LANGS), { ok: false, error: 'labelsIncomplete' });
  assert.deepEqual(readLabels({ ...full(), 'ar.guardian': 'ولي أمر' }, LANGS), { ok: false, error: 'labelsIncomplete' });
  assert.deepEqual(readLabels({ ...full(), 'fr.publisher': 'Professeur' }, LANGS), { ok: false, error: 'labelsIncomplete' });
  assert.deepEqual(readLabels({ ...full(), [labelField('en', 'space')]: ['a', 'b'] }, LANGS), { ok: false, error: 'labelsIncomplete' });
  // Other fields of the form are not labels and are ignored.
  assert.ok(readLabels({ ...full(), confirm: 'yes' }, LANGS).ok);
});

test('kit edit: switching takes the seed\'s name and labels, and keeps the space\'s languages and theme', () => {
  const current = school();
  current.languages = ['en', 'ar'];
  current.labels.en.publisher = 'Coach';
  const next = switchedKit(current, 'company');
  assert.ok(next);
  assert.equal(next.seed, 'company');
  assert.deepEqual(next.name, seedKit('company').name);
  assert.deepEqual(next.labels, seedKit('company').labels, 'custom labels are replaced');
  assert.deepEqual(next.languages, ['en', 'ar']);
  assert.deepEqual(next.theme, current.theme);
  assert.equal(current.labels.en.publisher, 'Coach', 'the current kit is not changed in place');
  next.labels.en.publisher = 'Changed';
  assert.equal(SEED_KITS.find((k) => k.seed === 'company')!.labels.en.publisher, 'Trainer', 'the seed is never changed');
  assert.equal(switchedKit(current, 'pirate'), null, 'only the three seed kits');
});
