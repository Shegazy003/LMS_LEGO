// AT-4.6 (product-contract v2, LMS wave 1, L2, section 8.2): with script
// switched off, every choice still opens only its form (through ?add=), every
// addition still works, and a refusal still keeps that form open (no focus
// assertions).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { submit } from '../support/browser.ts';
import {
  HADEER, KINDS, PDF_BYTES, PNG_BYTES, REFUSED, browserAs, chooserOn, editorPath, go, l2World, storedMaterials, words, type Kind, type L2World,
} from './world.ts';

async function follow(page: Page, kind: Kind): Promise<void> {
  await Promise.all([page.waitForEvent('load'), page.locator(`#add-new a.choice[data-kind="${kind}"]`).click()]);
}

describe('AT-4.6 with script off, each choice opens only its form through ?add=, additions work, a refusal keeps the form open', { concurrency: false }, () => {
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

  it('each choice is a link to ?add=<kind> that opens only its form; Cancel closes it', async () => {
    const tab = await browserAs(browser, w, HADEER, { lang: 'ar', width: 'phone', script: false });
    const page = tab.page;
    const lesson = w.school.lessons['Adding fractions'];
    await go(page, w, editorPath(w.school, lesson));
    assert.deepEqual((await chooserOn(page)).open, []);
    for (const k of KINDS) {
      await follow(page, k.kind);
      assert.ok(page.url().includes(`?add=${k.kind}`), `${k.kind}: through ?add=`);
      const seen = await chooserOn(page);
      assert.deepEqual(seen.open, [k.form], `${k.kind}: only its form`);
      assert.equal(seen.visibleAddForms, 1);
    }
    await Promise.all([page.waitForEvent('load'), page.locator('#add-note a.cancel').click()]);
    assert.deepEqual((await chooserOn(page)).open, [], 'Cancel closes it');
    for (const wrong of ['?add=svg', '?add=', '?add=note&add=file']) {
      await go(page, w, editorPath(w.school, lesson, wrong));
      assert.ok((await chooserOn(page)).visibleAddForms <= 1, `${wrong}: never two forms`);
    }
    await go(page, w, editorPath(w.school, lesson, '?add=svg'));
    assert.deepEqual((await chooserOn(page)).open, [], 'an unknown value opens nothing');
    await tab.ctx.close();
  });

  it('every addition works without script, and a refusal keeps the file form open with today\'s message', async () => {
    const t = words('school', 'ar');
    const lesson = w.school.lessons['Reading decimals'];
    const tab = await browserAs(browser, w, HADEER, { lang: 'ar', width: 'phone', script: false });
    const page = tab.page;
    await go(page, w, editorPath(w.school, lesson));
    const adds: { kind: Kind; form: string; title: string; stored: string; fill: () => Promise<void> }[] = [
      { kind: 'file', form: 'add-file', title: 'ورقة عمل', stored: 'pdf', fill: () => page.setInputFiles('#add-file input[name=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES }) },
      { kind: 'file', form: 'add-file', title: 'صورة', stored: 'image', fill: () => page.setInputFiles('#add-file input[name=file]', { name: 'pizza.png', mimeType: 'image/png', buffer: PNG_BYTES }) },
      { kind: 'video_link', form: 'add-video', title: 'فيديو', stored: 'video_link', fill: () => page.fill('#add-video input[name=url]', 'https://www.youtube.com/watch?v=made-up-2') },
      { kind: 'link', form: 'add-link', title: 'تمرين', stored: 'link', fill: () => page.fill('#add-link input[name=url]', 'https://example.org/decimals') },
      { kind: 'note', form: 'add-note', title: 'تذكير', stored: 'note', fill: () => page.fill('#add-note textarea[name=text]', 'الأجزاء من عشرة') },
    ];
    for (const a of adds) {
      await follow(page, a.kind);
      await page.fill(`#${a.form} input[name=title]`, a.title);
      await a.fill();
      assert.equal(await submit(page, `#${a.form}`), 303, `${a.title}: added`);
      assert.deepEqual((await storedMaterials(w, lesson)).at(-1), { title: a.title, kind: a.stored });
      const seen = await chooserOn(page);
      assert.equal(seen.materials.at(-1), a.title);
      assert.deepEqual(seen.open, [], 'the chooser is closed');
      assert.equal(seen.status, t('materialAdded', { title: a.title }));
    }
    const before = await storedMaterials(w, lesson);
    for (const f of REFUSED) {
      await follow(page, 'file');
      await page.fill('#add-file input[name=title]', `Refused ${f.name}`);
      await page.setInputFiles('#add-file input[name=file]', { name: f.name, mimeType: f.mimeType, buffer: f.buffer });
      const status = await submit(page, '#add-file');
      assert.ok(status === 400 || status === 413, `${f.name}: refused (${status})`);
      const seen = await chooserOn(page);
      assert.deepEqual(seen.open, ['add-file'], `${f.name}: the file form stays open, alone`);
      assert.equal((await page.locator('#add-file #error').innerText()).trim(), t(f.key));
    }
    assert.deepEqual(await storedMaterials(w, lesson), before, 'nothing stored for a refusal');
    await tab.ctx.close();
  });
});
