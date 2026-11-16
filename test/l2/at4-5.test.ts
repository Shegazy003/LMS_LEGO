// AT-4.5 (product-contract v2, LMS wave 1, L2, section 8.2): each of the five
// additions (a PDF, an image, a video link, a web link, a note) succeeds
// through the existing add route (the same kind values) and the lesson shows it
// last in order; after a success the chooser is closed and "Added: <title>" is
// announced. A .docx, a file over 25 MiB and an SVG renamed .png are refused
// with today's messages, and the same form stays open with the message beside
// it (the typed title kept); nothing is stored for a refusal. Keyboard only, at
// 390 px, script on.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import {
  HADEER, PDF_BYTES, PNG_BYTES, REFUSED, browserAs, chooserOn, editorPath, go, l2World, storedMaterials, words, type Kind, type L2World,
} from './world.ts';

async function choose(page: Page, kind: Kind): Promise<void> {
  await page.locator(`#add-new a.choice[data-kind="${kind}"]`).focus();
  await page.keyboard.press('Enter');
}

/** Submits the open form with the keyboard (Enter on its button); returns the status of the form's own response. */
async function submitWithKeys(page: Page, form: string): Promise<number> {
  await page.locator(`#${form} button[type=submit]`).focus();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.request().frame() === page.mainFrame()),
    page.waitForEvent('load'),
    page.keyboard.press('Enter'),
  ]);
  return res.status();
}

describe('AT-4.5 five additions through the one add route; three refusals keep the same form open with today\'s message', { concurrency: false }, () => {
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

  it('the five additions: each stored with today\'s kind, shown last, the chooser closed and "Added: <title>" announced', async () => {
    const t = words('school', 'en');
    const lesson = w.school.lessons['Adding fractions'];
    const tab = await browserAs(browser, w, HADEER, { lang: 'en', width: 'phone' });
    const page = tab.page;
    await go(page, w, editorPath(w.school, lesson));
    const adds: { kind: Kind; form: string; title: string; stored: string; fill: () => Promise<void> }[] = [
      { kind: 'file', form: 'add-file', title: 'Fractions worksheet', stored: 'pdf', fill: () => page.setInputFiles('#add-file input[name=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES }) },
      { kind: 'file', form: 'add-file', title: 'Pizza picture', stored: 'image', fill: () => page.setInputFiles('#add-file input[name=file]', { name: 'pizza.png', mimeType: 'image/png', buffer: PNG_BYTES }) },
      { kind: 'video_link', form: 'add-video', title: 'Watch: adding fractions', stored: 'video_link', fill: () => page.fill('#add-video input[name=url]', 'https://www.youtube.com/watch?v=made-up-1') },
      { kind: 'link', form: 'add-link', title: 'Practice online', stored: 'link', fill: () => page.fill('#add-link input[name=url]', 'https://example.org/fractions') },
      { kind: 'note', form: 'add-note', title: 'Remember', stored: 'note', fill: () => page.fill('#add-note textarea[name=text]', 'Add the tops, keep the bottom.') },
    ];
    for (const a of adds) {
      await choose(page, a.kind);
      await page.keyboard.type(a.title); // focus is on the title field
      await a.fill();
      assert.equal(await submitWithKeys(page, a.form), 303, `${a.title}: added through the add route`);
      const stored = await storedMaterials(w, lesson);
      assert.deepEqual(stored.at(-1), { title: a.title, kind: a.stored }, `${a.title}: stored last, kind ${a.stored}`);
      const seen = await chooserOn(page);
      assert.equal(seen.materials.at(-1), a.title, `${a.title}: the lesson shows it last`);
      assert.deepEqual(seen.open, [], `${a.title}: the chooser is closed`);
      assert.equal(seen.status, t('materialAdded', { title: a.title }), `${a.title}: announced`);
      assert.equal(seen.status, `Added: ${a.title}`);
    }
    await tab.ctx.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: the .docx, the file over 25 MiB and the renamed SVG are refused with today's messages; the file form stays open with the message beside the field; nothing is stored`, async () => {
      const t = words('school', lang);
      const lesson = w.school.lessons['Comparing fractions'];
      const tab = await browserAs(browser, w, HADEER, { lang, width: 'phone' });
      const page = tab.page;
      await go(page, w, editorPath(w.school, lesson));
      const before = await storedMaterials(w, lesson);
      const count = async () => Number((await w.p.sql(`SELECT COUNT(*) AS n FROM material WHERE space_id = '${w.school.id}'`))[0].n);
      const all = await count();
      for (const f of REFUSED) {
        await choose(page, 'file');
        await page.fill('#add-file input[name=title]', `Refused ${f.name}`);
        await page.setInputFiles('#add-file input[name=file]', { name: f.name, mimeType: f.mimeType, buffer: f.buffer });
        const status = await submitWithKeys(page, 'add-file');
        assert.ok(status === 400 || status === 413, `${f.name}: refused (${status})`);
        const seen = await chooserOn(page);
        assert.deepEqual(seen.open, ['add-file'], `${f.name}: the same form stays open, alone`);
        const beside = await page.evaluate(() => {
          const err = document.querySelector('#error');
          const input = document.querySelector('#add-file input[name=file]');
          return { text: (err as HTMLElement | null)?.innerText.trim() ?? '', inForm: Boolean(err?.closest('#add-file')), describedBy: input?.getAttribute('aria-describedby'), invalid: input?.getAttribute('aria-invalid') };
        });
        assert.deepEqual(beside, { text: t(f.key), inForm: true, describedBy: 'error', invalid: 'true' }, `${f.name}: today's message beside the file field`);
        assert.equal(await page.inputValue('#add-file input[name=title]'), `Refused ${f.name}`, `${f.name}: the typed title is kept`);
        assert.equal(seen.status, null, 'no Added line');
      }
      assert.deepEqual(await storedMaterials(w, lesson), before, 'nothing stored for a refusal');
      assert.equal(await count(), all, 'no material row anywhere');
      await tab.ctx.close();
    });
  }
});
