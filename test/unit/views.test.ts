// Small rendering checks of page templates that do not need a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { lessonEditor } from '../../src/views/publish.ts';

async function render(lang: 'ar' | 'en'): Promise<string> {
  const t = makeLabel(lang, seedKit('school'));
  const space = { id: 'sp', name: 'مدرسة مسك', primaryColor: '#0b6e4f', hasLogo: false };
  const lesson = { id: 'l1', title: 'Adding fractions', chapter_id: 'c1', chapter_title: 'Fractions', subject_id: 's1' };
  return String(await lessonEditor(t, lang, space, { subject: { id: 's1', title: 'Mathematics' }, lesson, materials: [] }));
}

test('views: the link hint isolates its Latin part left-to-right, so it reads cleanly in Arabic', async () => {
  const ar = await render('ar');
  const hint = 'الرابط (يبدأ بـ <bdi dir="ltr">http://</bdi> أو <bdi dir="ltr">https://</bdi>)';
  assert.equal(ar.split(hint).length - 1, 2, 'both address boxes (video link and web link) carry the isolated hint');
  assert.ok(!ar.includes('يبدأ بـ http://'), 'no bare Latin inside the Arabic hint');
  const en = await render('en');
  assert.ok(en.includes('Address (starts with <bdi dir="ltr">http://</bdi> or <bdi dir="ltr">https://</bdi>)'));
});
