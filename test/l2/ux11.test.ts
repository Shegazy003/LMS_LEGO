// UX-11 (ux-plan v2 on PIL-210, L2): one "Add <material>" control showing four
// choices as large targets (a row on tablet and desktop, a 2 × 2 grid on
// phone), each at least 44 px. The open form has a heading naming its kind,
// its fields, the submit button and "Cancel". With script on, focus moves to
// the first field when a form opens and back to the chosen kind's control on
// Cancel. A refusal shows the reason next to the field, linked by
// aria-describedby, and the field is marked invalid; a success shows "Added:
// <title>" in a role="status" line. The page never shows two forms (script on
// and off). Screenshots: UX-11-phone-ar.png, UX-11-phone-ar-file.png,
// UX-11-phone-ar-refused.png, UX-11-desktop-ar-file.png, UX-11-phone-en-file.png.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { submit } from '../support/browser.ts';
import { uxShot, type Width } from '../wave1/world.ts';
import { HADEER, KINDS, REFUSED, browserAs, chooserOn, editorPath, go, l2World, words, type L2World } from './world.ts';

async function choiceBoxes(page: Page) {
  return page.locator('#add-new a.choice').evaluateAll((as) => as.map((a) => {
    const r = a.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), width: r.width, height: r.height };
  }));
}

async function openFormParts(page: Page, form: string) {
  return page.locator(`#${form}`).evaluate((f) => ({
    heading: (f.querySelector('h3') as HTMLElement | null)?.innerText.trim() ?? '',
    fields: [...f.querySelectorAll('input:not([type=hidden]), textarea')].map((x) => ({ name: x.getAttribute('name'), labelled: Boolean(x.closest('label')?.textContent?.trim()) })),
    submit: (f.querySelector('button[type=submit]') as HTMLElement | null)?.innerText.trim() ?? '',
    cancel: (f.querySelector('a.cancel') as HTMLElement | null)?.innerText.trim() ?? '',
  }));
}

describe('UX-11 add-new chooser, one form, keyboard', { concurrency: false }, () => {
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
  const lesson = () => w.school.lessons['Comparing fractions'];

  for (const width of ['phone', 'tablet', 'desktop'] as Width[]) {
    it(`${width}: four choices, each at least 44 px, ${width === 'phone' ? 'a 2 × 2 grid' : 'one row'}`, async () => {
      const tab = await browserAs(browser, w, HADEER, { lang: 'ar', width });
      await go(tab.page, w, editorPath(w.school, lesson()));
      const boxes = await choiceBoxes(tab.page);
      assert.equal(boxes.length, 4);
      for (const b of boxes) assert.ok(b.height >= 44 && b.width >= 44, `a large target (${b.width} × ${b.height})`);
      const rows = [...new Set(boxes.map((b) => b.top))];
      assert.equal(rows.length, width === 'phone' ? 2 : 1, `${width}: rows ${rows.join(', ')}`);
      if (width === 'phone') assert.equal(new Set(boxes.map((b) => b.left)).size, 2, 'two columns');
      if (width === 'phone') await uxShot(tab.page, 'UX-11-phone-ar');
      await tab.ctx.close();
    });
  }

  for (const [width, lang] of [['phone', 'ar'], ['desktop', 'ar'], ['phone', 'en']] as [Width, 'ar' | 'en'][]) {
    it(`${width} ${lang}, script on: each open form has its heading, fields, submit and Cancel; focus moves to its first field and back on Cancel`, async () => {
      const t = words('school', lang);
      const tab = await browserAs(browser, w, HADEER, { lang, width });
      const page = tab.page;
      await go(page, w, editorPath(w.school, lesson()));
      const headings: Record<string, string> = { file: t('addFile'), video_link: t('addVideo'), link: t('addLink'), note: t('addNote') };
      for (const k of KINDS) {
        await page.locator(`#add-new a.choice[data-kind="${k.kind}"]`).focus();
        await page.keyboard.press('Enter');
        assert.equal((await chooserOn(page)).visibleAddForms, 1, 'never two forms');
        const parts = await openFormParts(page, k.form);
        assert.equal(parts.heading, headings[k.kind], `${k.kind}: a heading naming its kind`);
        assert.ok(parts.fields.length >= 2 && parts.fields.every((f) => f.labelled), `${k.kind}: labelled fields`);
        assert.equal(parts.submit, t('add'));
        assert.equal(parts.cancel, t('cancel'));
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'title', `${k.kind}: focus on the first field`);
        if (k.kind === 'file') await uxShot(page, `UX-11-${width}-${lang}-file`);
        await page.locator(`#${k.form} a.cancel`).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-kind')), k.kind, `${k.kind}: focus back on its choice`);
        assert.equal((await chooserOn(page)).visibleAddForms, 0);
      }
      await tab.ctx.close();
    });
  }

  for (const script of [true, false]) {
    it(`script ${script ? 'on' : 'off'}: a refusal shows the reason next to the field, linked by aria-describedby and marked invalid; a success says Added in a status line; never two forms`, async () => {
      const t = words('school', 'ar');
      const tab = await browserAs(browser, w, HADEER, { lang: 'ar', width: 'phone', script });
      const page = tab.page;
      await go(page, w, editorPath(w.school, lesson(), '?add=file'));
      assert.deepEqual((await chooserOn(page)).open, ['add-file']);
      const f = REFUSED[0];
      await page.fill('#add-file input[name=title]', 'Refused');
      await page.setInputFiles('#add-file input[name=file]', { name: f.name, mimeType: f.mimeType, buffer: f.buffer });
      assert.equal(await submit(page, '#add-file'), 400);
      const refusal = await page.evaluate(() => {
        const input = document.querySelector('#add-file input[name=file]')!;
        const id = input.getAttribute('aria-describedby') ?? '';
        const msg = document.getElementById(id);
        const label = input.closest('label');
        const rect = (e: Element | null) => e?.getBoundingClientRect();
        const gap = msg && label ? Math.abs((rect(msg)!.top) - (rect(label)!.bottom)) : 999;
        return { invalid: input.getAttribute('aria-invalid'), text: (msg as HTMLElement | null)?.innerText.trim() ?? '', inForm: Boolean(msg?.closest('#add-file')), gap };
      });
      assert.equal(refusal.invalid, 'true', 'the field is marked invalid');
      assert.equal(refusal.text, t('uploadType'), 'the reason, linked by aria-describedby');
      assert.ok(refusal.inForm && refusal.gap <= 24, `next to the field (${refusal.gap}px)`);
      assert.equal((await chooserOn(page)).visibleAddForms, 1, 'one form');
      if (script) await uxShot(page, 'UX-11-phone-ar-refused');
      await page.goto(w.p.url + editorPath(w.school, lesson(), '?add=note'));
      await page.fill('#add-note input[name=title]', script ? 'Status line' : 'Status line, no script');
      await page.fill('#add-note textarea[name=text]', 'A short note.');
      assert.equal(await submit(page, '#add-note'), 303);
      const status = await page.locator('[role=status]#added').innerText();
      assert.equal(status.trim(), t('materialAdded', { title: script ? 'Status line' : 'Status line, no script' }));
      assert.equal((await chooserOn(page)).visibleAddForms, 0, 'closed after a success');
      await tab.ctx.close();
    });
  }
});
