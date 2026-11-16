// AT-4.4 (product-contract v2, LMS wave 1, L2, section 8.2): the lesson editor
// shows the materials in order and one "Add <material word>" control with four
// choices (File: PDF or image, Video link, Web link, Note) and no form open.
// Choosing one opens exactly that form; choosing another closes the first;
// Cancel closes it. With script on, focus moves to the open form's first field,
// and Cancel returns focus to the chooser. Keyboard only, at 390 px.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { HADEER, KINDS, browserAs, chooserOn, editorPath, go, l2World, storedMaterials, words, type L2World } from './world.ts';

describe('AT-4.4 one add-new chooser with four choices; one form at a time; focus with script on', { concurrency: false }, () => {
  let w: L2World;
  let browser: Browser;
  before(async () => {
    w = await l2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: the materials in order, one "Add <material>" control with the four choices in order, and no form open`, async () => {
      const t = words('school', lang);
      const tab = await browserAs(browser, w, HADEER, { lang, width: 'phone' });
      const lesson = w.school.lessons['Comparing fractions'];
      await go(tab.page, w, editorPath(w.school, lesson));
      const seen = await chooserOn(tab.page);
      assert.deepEqual(seen.materials, (await storedMaterials(w, lesson)).map((m) => m.title), 'the materials in their order');
      assert.equal(seen.choosers, 1, 'one chooser');
      assert.equal(seen.heading, t('addMaterial'));
      if (lang === 'en') assert.equal(seen.heading, 'Add Material');
      assert.deepEqual(seen.choices.map((c) => c.text), KINDS.map((k) => t(k.choice)));
      if (lang === 'en') assert.deepEqual(seen.choices.map((c) => c.text), ['File (PDF or image)', 'Video link', 'Web link', 'Note']);
      assert.deepEqual(seen.choices.map((c) => c.kind), KINDS.map((k) => k.kind));
      assert.deepEqual(seen.open, [], 'no form open on arrival');
      assert.equal(seen.visibleAddForms, 0);
      await tab.ctx.close();
    });
  }

  it('keyboard only at 390 px, script on: each choice opens exactly its form with focus on its first field; another closes the first; Cancel closes it and returns focus to the choice', async () => {
    const tab = await browserAs(browser, w, HADEER, { lang: 'ar', width: 'phone' });
    const page = tab.page;
    await go(page, w, editorPath(w.school, w.school.lessons['Adding fractions']));
    for (const k of KINDS) {
      await page.locator(`#add-new a.choice[data-kind="${k.kind}"]`).focus();
      await page.keyboard.press('Enter');
      const seen = await chooserOn(page);
      assert.deepEqual(seen.open, [k.form], `${k.kind}: exactly its form is open (the one before is closed)`);
      assert.equal(seen.choices.find((c) => c.kind === k.kind)?.expanded, 'true', `${k.kind}: the choice says it is open`);
      assert.ok(seen.choices.filter((c) => c.kind !== k.kind).every((c) => c.expanded === 'false'), 'the others say they are closed');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement;
        const form = el.closest('form');
        const first = form?.querySelector('input:not([type=hidden]), textarea, select');
        return { form: form?.id ?? '', isFirst: first === el, name: el.getAttribute('name') };
      });
      assert.deepEqual(focused, { form: k.form, isFirst: true, name: 'title' }, `${k.kind}: focus on the open form's first field`);
    }
    // Cancel, with the keyboard, on the last open form (Note), then on a re-opened File form.
    for (const k of [KINDS[3], KINDS[0]]) {
      if (k.kind === 'file') {
        await page.locator('#add-new a.choice[data-kind="file"]').focus();
        await page.keyboard.press('Enter');
      }
      await page.locator(`#${k.form} a.cancel`).focus();
      await page.keyboard.press('Enter');
      const seen = await chooserOn(page);
      assert.deepEqual(seen.open, [], `${k.kind}: Cancel closes it`);
      const back = await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('data-kind'));
      assert.equal(back, k.kind, `${k.kind}: focus is back on its choice`);
    }
    assert.equal(page.url(), w.p.url + editorPath(w.school, w.school.lessons['Adding fractions']), 'with script, nothing left the page');
    await tab.ctx.close();
  });

  it('the forms are today\'s: the hidden kind values, the fields and the one add route', async () => {
    const tab = await browserAs(browser, w, HADEER, { lang: 'en', width: 'desktop' });
    await go(tab.page, w, editorPath(w.school, w.school.lessons['Adding fractions']));
    const forms = await tab.page.locator('#add-new form').evaluateAll((fs) => fs.map((f) => ({
      id: f.id, action: f.getAttribute('action'), kind: (f.querySelector('input[name=kind]') as HTMLInputElement | null)?.value,
      fields: [...f.querySelectorAll('input:not([type=hidden]), textarea')].map((x) => x.getAttribute('name')),
      heading: (f.querySelector('h3') as HTMLElement | null)?.innerText ?? '',
    })));
    const add = `/s/${w.school.id}/publish/compose/${w.school.lessons['Adding fractions']}/add`;
    assert.deepEqual(forms, [
      { id: 'add-file', action: add, kind: 'file', fields: ['title', 'file'], heading: 'Upload a PDF or an image' },
      { id: 'add-video', action: add, kind: 'video_link', fields: ['title', 'url'], heading: 'Add a video link' },
      { id: 'add-link', action: add, kind: 'link', fields: ['title', 'url'], heading: 'Add a web link' },
      { id: 'add-note', action: add, kind: 'note', fields: ['title', 'text'], heading: 'Add a note' },
    ]);
    await tab.ctx.close();
  });
});
