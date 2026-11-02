import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLabel, CONCEPTS, dirFor } from '../../src/labels.ts';
import { SEED_KITS, seedKit } from '../../src/kits/seed.ts';
import { UI } from '../../src/i18n/ui.ts';

test('labels: three seed kits, each labelling all canonical concepts in Arabic and English', () => {
  assert.deepEqual(SEED_KITS.map((k) => k.seed), ['school', 'company', 'university']);
  for (const kit of SEED_KITS) {
    for (const lang of ['ar', 'en'] as const) {
      for (const concept of CONCEPTS) {
        const value = kit.labels[lang][concept];
        assert.ok(typeof value === 'string' && value.trim() !== '', `${kit.seed}.${lang}.${concept}`);
      }
    }
  }
});

test('labels: the School kit reads معلّم / طالب / فصل / مادّة in Arabic', () => {
  const t = makeLabel('ar', seedKit('school'));
  assert.equal(t('publisher'), 'معلّم');
  assert.equal(t('learner'), 'طالب');
  assert.equal(t('group'), 'فصل');
  assert.equal(t('subject'), 'مادّة');
  assert.equal(t('admin'), 'مدير');
});

test('labels: the same keys read differently in another kit and language', () => {
  assert.equal(makeLabel('en', seedKit('school'))('publisher'), 'Teacher');
  assert.equal(makeLabel('en', seedKit('company'))('publisher'), 'Trainer');
  assert.equal(makeLabel('ar', seedKit('company'))('publisher'), 'مدرّب');
  assert.equal(makeLabel('en', seedKit('university'))('group'), 'Section');
});

test('labels: product words come through the same function, with values filled in', () => {
  const t = makeLabel('en', seedKit('school'));
  assert.equal(
    t('accessEnded', { space: 'مدرسة مسك', date: '2026-12-01', contact: t('ownerWord') }),
    'Your access to مدرسة مسك ended on 2026-12-01. Contact the owner.',
  );
  // A concept inside a product sentence comes from the kit.
  assert.equal(t('appointAdmin'), 'Appoint Administrator');
  assert.equal(makeLabel('en', seedKit('company'))('appointAdmin'), 'Appoint HR administrator');
});

test('labels: values are inserted literally, not re-expanded', () => {
  const t = makeLabel('en', seedKit('school'));
  assert.equal(
    t('accessEnded', { space: '{publisher}', date: 'd', contact: 'c' }),
    'Your access to {publisher} ended on d. Contact the c.',
  );
});

test('labels: an unknown key is an error, never a silent blank', () => {
  const t = makeLabel('en', seedKit('school'));
  assert.throws(() => t('noSuchKey' as never));
});

test('labels: Arabic and English product dictionaries have the same keys', () => {
  assert.deepEqual(Object.keys(UI.ar).sort(), Object.keys(UI.en).sort());
});

test('labels: writing direction follows the language', () => {
  assert.equal(dirFor('ar'), 'rtl');
  assert.equal(dirFor('en'), 'ltr');
});

// Task 5: the Arabic "access ended" sentence must read correctly whatever the
// admin label is (with or without the definite article), so it no longer
// builds «تواصل مع <label>»: it names whom to contact after «للتواصل:».
test('labels: the Arabic "access ended" sentence reads correctly for any admin label and for the owner', () => {
  for (const seed of ['school', 'company', 'university']) {
    const t = makeLabel('ar', seedKit(seed));
    const sentence = t('accessEnded', { space: 'مدرسة مسك', date: '2026-12-01', contact: t('admin') });
    assert.equal(sentence, `انتهى وصولك إلى مدرسة مسك في 2026-12-01. للتواصل: ${t('admin')}.`, seed);
  }
  const t = makeLabel('ar', seedKit('school'));
  assert.equal(
    t('accessEnded', { space: 'مدرسة مسك', date: '2026-12-01', contact: t('ownerWord') }),
    'انتهى وصولك إلى مدرسة مسك في 2026-12-01. للتواصل: المالك.',
  );
  assert.ok(!UI.ar.accessEnded.includes('تواصل مع'), 'no phrasing that needs the definite article');
});

// Release 1.1 (carried from the AT-7 Verifier): «تغيير اسم الـ{item}» showed a
// visible tatweel ("الـفصل"). No Arabic sentence may glue the article to a
// placeholder that a kit word fills, so every sentence reads cleanly for any kit.
test('labels: no Arabic sentence glues the definite article to a kit word (no visible tatweel such as «الـفصل»)', () => {
  for (const [key, template] of Object.entries(UI.ar)) {
    assert.ok(!/(?:ال|لل)ـ?\{(?:space|admin|publisher|learner|group|subject|chapter|lesson|material|item|inside)\}/.test(template), `ar.${key} attaches ال to a kit word: ${template}`);
  }
  for (const seed of ['school', 'company', 'university']) {
    const t = makeLabel('ar', seedKit(seed));
    for (const concept of ['group', 'subject', 'chapter', 'lesson', 'material'] as const) {
      assert.equal(t('renameItem', { item: t(concept) }), `تغيير الاسم: ${t(concept)}`, `${seed}: the rename heading for ${concept} reads cleanly`);
    }
  }
});
