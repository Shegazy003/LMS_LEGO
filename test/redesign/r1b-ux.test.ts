// LMS redesign wave R1b (ux-plan rev 4b1f5917 on PIL-322, UX-101): the Look
// card of the subject editor in a real browser (Chromium), in the seeded
// Arabic world, as منى (the responsible teacher of الرياضيات). Each test name
// starts with the item it proves, so each is its own CI step
// (--test-name-pattern). Screenshots go to evidence/ux/UX-101-<phone|tablet|desktop>.png
// (evidence only, not the gate). Made-up data only.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ID, MATH, MONA, r1aWorld, type Person, type R1aWorld } from './world.ts';
import { ICONS, PALETTE, autoColour, subjectColours } from '../../src/look.ts';
import { overflow } from '../wave1/ux.ts';

const UX = 'evidence/ux/';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 900 };
const EDITOR = `/s/${ID.space}/publish/edit/${MATH.id}`;

let w: R1aWorld;
let browser: Browser;
const contexts: BrowserContext[] = [];

async function as(who: Person, viewport: { width: number; height: number }, javaScriptEnabled = true): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: 'ar-EG', javaScriptEnabled });
  ctx.setDefaultTimeout(20_000);
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto(w.url + '/signin');
  await page.fill('form#signin input[name=username]', who.username);
  await page.fill('form#signin input[name=password]', who.password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/signin')), page.click('form#signin button[type=submit]')]);
  return page;
}

async function visit(page: Page, path: string): Promise<void> {
  const res = await page.goto(w.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${UX}${name}.png`, fullPage: true });
const stored = () => ({ ...w.sql('SELECT look_colour, look_icon FROM subject WHERE id = ?', MATH.id)[0] });
const hexOf = (key: string) => subjectColours(PALETTE.find((p) => p.key === key)!.hex).subject.toLowerCase();

/** The colour (--subj) and icon the sample card shows now. */
const sample = (page: Page) => page.locator('#look-sample').evaluate((el) => ({
  colour: getComputedStyle(el).getPropertyValue('--subj').trim().toLowerCase(),
  icon: el.querySelector('.sicon svg')?.getAttribute('data-icon') ?? '',
}));

/** Chooses a radio by clicking its option (the radio itself is visually hidden inside it). */
const choose = (page: Page, group: 'colour' | 'icon', value: string) =>
  page.locator(`#look-form label.look-opt:has(input[name="${group}"][value="${value}"])`).click();

async function save(page: Page): Promise<void> {
  await Promise.all([page.waitForURL(/[?&]look=saved/), page.click('#look-save')]);
}

before(async () => {
  mkdirSync(UX, { recursive: true });
  w = await r1aWorld();
  browser = await chromium.launch();
});
after(async () => {
  for (const c of contexts) await c.close().catch(() => undefined);
  await browser?.close();
  await w?.close();
});

describe('UX-101 the Look card', { concurrency: false }, () => {
  it('UX-101 look card radios names and refusals: after the first card; sample; «اللون» Automatic + 12 named swatches; «الرمز» Automatic + 16 named icons; one Save look; targets ≥ 44 px; the choice marked by a ring and a tick; a refusal beside its group', async () => {
    const page = await as(MONA, PHONE);
    await visit(page, EDITOR);
    // Placement: the Look card is the element right after the editor's first card.
    const placed = await page.evaluate(() => {
      const look = document.getElementById('look');
      const prev = look?.previousElementSibling;
      const first = document.querySelector('main .card');
      return { afterFirst: !!prev && prev === first && !!prev.querySelector('#publish-state'), sample: !!look?.querySelector('#look-sample') };
    });
    assert.deepEqual(placed, { afterFirst: true, sample: true }, 'the Look card follows the first card and holds the sample');
    // Two radio groups, each named by its legend.
    assert.equal(await page.getByRole('group', { name: 'اللون' }).count(), 1, 'the colour group «اللون»');
    assert.equal(await page.getByRole('group', { name: 'الرمز' }).count(), 1, 'the icon group «الرمز»');
    const colours = page.getByRole('group', { name: 'اللون' });
    const icons = page.getByRole('group', { name: 'الرمز' });
    assert.equal(await colours.getByRole('radio').count(), 13, 'Automatic + 12 colours');
    assert.equal(await icons.getByRole('radio').count(), 17, 'Automatic + 16 icons');
    assert.equal(await colours.getByRole('radio', { name: 'تلقائي', exact: true }).count(), 1, 'colour: Automatic');
    assert.equal(await icons.getByRole('radio', { name: 'تلقائي', exact: true }).count(), 1, 'icon: Automatic');
    for (const p of PALETTE) assert.equal(await colours.getByRole('radio', { name: p.ar, exact: true }).getAttribute('value'), p.key, `${p.key} is named ${p.ar}`);
    for (const i of ICONS) assert.equal(await icons.getByRole('radio', { name: i.ar, exact: true }).getAttribute('value'), i.key, `${i.key} is named ${i.ar}`);
    assert.equal(await page.locator('#look button[type=submit]').count(), 1, 'one button');
    assert.equal((await page.locator('#look-save').textContent())?.trim(), 'حفظ الشكل');
    // Every target at least 44 × 44 px.
    const small = await page.locator('#look label.look-opt, #look-save').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
    assert.equal(small, 0, 'every option and the button is at least 44 px');
    // Nothing sticks out sideways at the phone width.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'no sideways scroll');
    // No text overflows its box (the check UX-14a and UX-24 use on every page), with Automatic chosen and its tick shown.
    assert.deepEqual((await overflow(page)).clipped, [], 'no clipped text in the Look card');
    // The selected swatch: a ring and a tick, not colour alone; the others neither.
    await choose(page, 'colour', 'c05');
    const marks = await page.locator('#look-colours label.look-opt').evaluateAll((els) => els.map((e) => {
      const chip = e.querySelector('.chip')!;
      const tick = e.querySelector('.tick')!;
      return { value: e.querySelector('input')!.value, checked: e.querySelector('input')!.checked, ring: getComputedStyle(chip).boxShadow !== 'none', tick: getComputedStyle(tick).display !== 'none' && !!tick.querySelector('svg[data-icon="check"]') };
    }));
    for (const m of marks) assert.deepEqual({ ring: m.ring, tick: m.tick }, { ring: m.checked, tick: m.checked }, `${m.value}: ring and tick only when chosen`);
    assert.deepEqual(marks.filter((m) => m.checked).map((m) => m.value), ['c05']);
    await shot(page, 'UX-101-phone');
    await page.locator('#look').screenshot({ path: `${UX}UX-101-card-phone.png` });
    // A refusal: a key outside the set (a changed page) is refused beside its group, the page says it, nothing stored.
    const before = stored();
    await page.locator('#look-form input[name="icon"][value="flask"]').evaluate((el) => { (el as HTMLInputElement).value = 'rocket'; (el as HTMLInputElement).checked = true; });
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/look') && r.request().method() === 'POST'), page.click('#look-save')]);
    assert.equal(res.status(), 400);
    await page.waitForSelector('#look-refusal');
    const beside = await page.evaluate(() => {
      const r = document.getElementById('look-refusal');
      return { inIcons: !!r?.closest('#look-icons'), described: document.getElementById('look-icons')?.getAttribute('aria-describedby'), role: r?.getAttribute('role'), text: r?.textContent?.trim() };
    });
    assert.deepEqual(beside, { inIcons: true, described: 'look-refusal', role: 'alert', text: 'اختر أحد الرموز المعروضة.' }, 'the refusal sits in the icon group and is announced');
    assert.deepEqual(stored(), before, 'nothing stored');
    await shot(page, 'UX-101-refusal-phone');
    for (const [name, vp] of [['tablet', TABLET], ['desktop', DESKTOP]] as const) {
      const p = await as(MONA, vp);
      await visit(p, EDITOR);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${name}: no sideways scroll`);
      await shot(p, `UX-101-${name}`);
    }
  });

  it('UX-101 live sample: after a save the sample shows the stored keys; with script a radio change moves the sample before saving; without script the sample shows the saved look', async () => {
    const page = await as(MONA, PHONE);
    await visit(page, EDITOR);
    w.run('UPDATE subject SET look_colour = NULL, look_icon = NULL WHERE id = ?', MATH.id);
    await visit(page, EDITOR);
    assert.deepEqual(await sample(page), { colour: subjectColours(autoColour(MATH.id).hex).subject.toLowerCase(), icon: 'book' }, 'automatic at first');
    // With script, the sample follows the radios before saving.
    await choose(page, 'colour', 'c09');
    await choose(page, 'icon', 'atom');
    assert.deepEqual(await sample(page), { colour: hexOf('c09'), icon: 'atom' }, 'the sample follows the chosen radios');
    assert.deepEqual(stored(), { look_colour: null, look_icon: null }, 'nothing stored before Save look');
    // After a save: the stored keys and the sample agree.
    await choose(page, 'colour', 'c05');
    await choose(page, 'icon', 'flask');
    await save(page);
    assert.deepEqual(stored(), { look_colour: 'c05', look_icon: 'flask' });
    assert.deepEqual(await sample(page), { colour: hexOf('c05'), icon: 'flask' }, 'after the save the sample shows the stored look');
    assert.equal((await page.locator('#look-status').textContent())?.trim(), 'تمّ حفظ الشكل');
    // Without script: the sample shows the saved look, and a radio change does not move it.
    const plain = await as(MONA, PHONE, false);
    await visit(plain, EDITOR);
    assert.deepEqual(await sample(plain), { colour: hexOf('c05'), icon: 'flask' }, 'without script: the saved look');
    await choose(plain, 'colour', 'c11');
    await choose(plain, 'icon', 'music');
    assert.deepEqual(await sample(plain), { colour: hexOf('c05'), icon: 'flask' }, 'without script the sample stays on the saved look');
    await Promise.all([plain.waitForURL(/[?&]look=saved/), plain.click('#look-save')]);
    assert.deepEqual(stored(), { look_colour: 'c11', look_icon: 'music' }, 'the form works without script');
    assert.deepEqual(await sample(plain), { colour: hexOf('c11'), icon: 'music' }, 'without script: the newly saved look');
  });
});
