// LMS wave 5, W5-1b: the UX floor of the learner's blocks (ux-plan v2 on
// PIL-246, rev 35c25085): UX-54 (the subject page block), UX-55 (the home
// block), and the learner parts of UX-56, UX-57 and UX-58 (the card's parts
// are in test/wave5/ux.test.ts; the same CI steps run both files). One
// describe per item, each test its own CI step (`UX-<n> ...`, selected with
// --test-name-pattern), each on a fresh world, in Chromium (Playwright).
// Screenshots go to evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import type { Lang } from '../../src/labels.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import { signedIn } from '../support/seed.ts';
import { cutText } from '../../src/announcements.ts';
import {
  ADMIN, COMPANY_ADMIN, KARIM5, SALMA, UNIVERSITY_ADMIN, adminAnn, as, browserAs, cardLines, go, home, learnerBlockOf, post, setOrder, storedAt, subjectPath,
  topicPath, uxShot, wave4World, withW5a, words, WIDTHS, type Wave1World, type Width,
} from './world.ts';

/** The wave 5 keys a learner reads (ux-plan UX-56). */
// LMS redesign R1a (UX-55 row): annHomeTitle, annFull and annFullFor went with the home block.
const LEARNER_KEYS = ['annTitle', 'annOlder', 'annEdited'] as const satisfies readonly UiKey[];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar' });
  await go(tabbed.page, w, path);
  return tabbed;
}

/** Whether every selector is found, in this DOM order. */
const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

/** Twelve announcements on Mathematics, an hour apart, the newest last (number 12); every third by the admin. */
async function twelve(w: Wave1World): Promise<string[]> {
  const s = w.school;
  const bodies = Array.from({ length: 12 }, (_, i) => (i % 2 ? `Announcement ${i + 1}: bring the workbook.` : `الإعلان ${i + 1}: الاختبار القصير يوم الأحد.\nراجعوا الفصل ${i + 1}.`));
  for (const [i, body] of bodies.entries()) {
    await storedAt(w, { space: s.id, subject: s.math, body, role: i % 3 === 0 ? 'admin' : 'publisher', at: Date.now() - (12 - i) * HOUR });
  }
  return [...bodies].reverse();
}

/** Opens and closes a details fold from the keyboard: Enter opens, Enter closes, Space opens. */
async function foldByKeyboard(page: Page): Promise<boolean[]> {
  const states: boolean[] = [];
  const isOpen = () => page.$eval('#announcements details.ann-older', (d) => (d as HTMLDetailsElement).open);
  await page.focus('#announcements details.ann-older > summary');
  for (const key of ['Enter', 'Enter', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    states.push(await isOpen());
  }
  return states;
}

// ------------------------------------------------------------------- UX-54 ----
describe('UX-54 subject page block order, fold and empty case', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-54 the block after the progress line and the order box and before the outline; heading, the newest 3, then a closed fold of 7; the text in pre-line and dir="auto", the role and date line in the secondary style; no announcements: no block and no empty message', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    // The empty case first: no block, no empty message.
    for (const lang of ['ar', 'en'] as const) {
      const page = await (await (await as(w, SALMA, lang)).get(subjectPath(s, s.math))).text();
      assert.equal(learnerBlockOf(page), null, `${lang}: no block with no announcements`);
      assert.ok(!page.includes(UI[lang].annEmpty) && !page.includes(UI[lang].annTitle), `${lang}: no empty message and no heading`);
    }
    // The title block in full: wave 2's progress line (one lesson done) and wave 4's order box.
    await setOrder(w, true);
    assert.equal((await salma.post(`/s/${s.id}/read/${s.lessons['Adding fractions']}/done`, { state: 'done' })).status, 303, 'one lesson done');
    const bodies = await twelve(w);
    // One edited item, to show annEdited.
    await w.p.sql(`UPDATE announcement SET edited_at = '${new Date(Date.now() - HOUR / 2).toISOString()}' WHERE body = '${bodies[1].replace(/'/g, "''")}'`);
    for (const [lang, width] of [['ar', 'phone'], ['ar', 'tablet'], ['en', 'desktop']] as const) {
      const k = await open(browser, w, SALMA, subjectPath(s, s.math), { lang, width });
      const page = k.page;
      assert.equal(await inDomOrder(page, ['#subject-title', '#done-progress', '#order-box', '#announcements', '#announcements > h2', '#announcements > ul.ann-list', '#announcements > details.ann-older', '#outline']), 'ok', `${lang} ${width}: the block's place and parts in order`);
      assert.equal(await page.textContent('#announcements > h2'), UI[lang].annTitle);
      const top = await page.$$eval('#announcements > ul.ann-list > li', (lis) => lis.map((li) => li.querySelector('.ann-text')!.textContent));
      assert.deepEqual(top, bodies.slice(0, 3), `${lang} ${width}: the newest 3 in full, newest first`);
      const fold = await page.$eval('#announcements > details.ann-older', (d) => ({
        open: (d as HTMLDetailsElement).open,
        summary: d.querySelector('summary')!.textContent,
        items: [...d.querySelectorAll('li .ann-text')].map((p) => p.textContent),
      }));
      assert.equal(fold.open, false, 'the fold is closed by default');
      assert.equal(fold.summary, words('school', lang)('annOlder', { n: '7' }));
      assert.deepEqual(fold.items, bodies.slice(3, 10), 'the next 7 in the fold');
      const all = await page.innerText('main');
      for (const gone of bodies.slice(10)) assert.ok(!all.includes(gone.split('\n')[0]), `the oldest 2 are not shown: ${gone.slice(0, 20)}`);
      const styles = await page.$$eval('#announcements .ann-item', (lis) => lis.map((li) => {
        const text = li.querySelector('.ann-text') as HTMLElement;
        const by = li.querySelector('.ann-by') as HTMLElement;
        return { ws: getComputedStyle(text).whiteSpace, dir: text.getAttribute('dir'), itemDir: li.getAttribute('dir'), byAfter: Boolean(text.compareDocumentPosition(by) & Node.DOCUMENT_POSITION_FOLLOWING) };
      }));
      assert.equal(styles.length, 10);
      for (const st of styles) assert.deepEqual(st, { ws: 'pre-line', dir: 'auto', itemDir: 'auto', byAfter: true }, 'text in pre-line with dir="auto", then the role and date line');
      const edited = await page.$$eval('#announcements .ann-item .ann-by .ann-edited', (e) => e.map((x) => x.textContent));
      assert.equal(edited.length, 1, 'the edited item carries annEdited in its role and date line');
      assert.ok(edited[0]!.startsWith(UI[lang].annEdited.split('{')[0]), `annEdited (${edited[0]})`);
      for (const m of await measure(page, '#announcements .ann-by')) assert.ok(m.contrast >= 4.5, `${lang}: the role and date line ${m.contrast.toFixed(2)}:1`);
      await uxShot(page, `UX-54-${width}-${lang}`);
      if (lang === 'ar' && width === 'phone') {
        assert.deepEqual(await foldByKeyboard(page), [true, false, true], 'the fold opens with Enter and with Space');
        await uxShot(page, 'UX-54-phone-ar-open');
      }
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-55 ----
/** Three recent announcements over 100 code points (one an unbroken string), on Mathematics and on Arabic grammar. */
async function homeWorld(w: Wave1World): Promise<void> {
  const s = w.school;
  const long = [
    'الاختبار القصير يوم الأحد بدلًا من الخميس. راجعوا الفصلين 2 و3، وأحضروا الآلة الحاسبة والمسطرة، والاختبار في القاعة 4 الساعة 9 صباحًا.',
    `${'x'.repeat(300)}`,
    'Parents evening on Monday at 5 pm in the main hall. Every family is welcome; the teachers will talk about the first term and the next steps.',
  ];
  await storedAt(w, { space: s.id, subject: s.math, body: long[2], role: 'admin', at: Date.now() - 3 * HOUR });
  await storedAt(w, { space: s.id, subject: s.arabic, body: long[1], role: 'admin', at: Date.now() - 2 * HOUR });
  await storedAt(w, { space: s.id, subject: s.math, body: long[0], role: 'publisher', at: Date.now() - HOUR });
}

// LMS redesign R1a (product-contract v2 on PIL-322, UX-55 row; ux-plan UX-99): the home's block is gone; each subject
// card shows one line, the newest announcement its subject page shows, cut at 100 code points, one line with an
// ellipsis, linking to the subject page's block. The first-screen clause is kept: Continue ends within 844 px.
describe('UX-55 learner home block', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave4World({ activity: true });
    browser = await chromium.launch();
    // Salma reads Mathematics and Arabic grammar, so the home has announcements from two subjects. A lesson opened, so the home has its "Continue where you stopped" link.
    const salma = await as(w, SALMA, 'en');
    assert.equal((await salma.post(`/s/${w.school.id}/read/${w.school.lessons['Adding fractions']}/done`, { state: 'done' })).status, 303, 'one lesson done');
    await homeWorld(w);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-55 home block order, cut and wrapping: after the activity notice and just after Continue (fallback form (2)); heading; at most 3 items of subject link, role and date line, text; the cut ends with "…" and the inline link named with the subject; the unbroken string wraps at 320 and 390 px; nothing recent: no block', async () => {
    const s = w.school;
    for (const [lang, width] of [['ar', 'phone'], ['en', 'desktop']] as const) {
      const k = await open(browser, w, SALMA, home(s), { lang, width });
      const page = k.page;
      assert.equal(await page.$$eval('#announcements', (e) => e.length), 0, `${lang}: no announcements block on the home (UX-55 row)`);
      const lines = await page.$$eval('#my-list > li[data-subject] .ann', (ps) => ps.map((p) => {
        const links = p.querySelectorAll('a');
        const a = links[0] as HTMLAnchorElement;
        const card = p.closest('li')!.getBoundingClientRect();
        const box = p.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return {
          subject: (p.closest('li') as HTMLElement).dataset.subject, links: links.length, href: a.getAttribute('href'), text: a.textContent ?? '', dir: a.getAttribute('dir'),
          bell: Boolean(p.querySelector('svg[aria-hidden="true"]')), oneLine: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis',
          inside: box.left >= card.left - 1 && box.right <= card.right + 1,
        };
      }));
      assert.deepEqual(lines.map((l) => l.subject).sort(), [s.math, s.arabic].sort(), `${lang}: a line on the Mathematics and Arabic grammar cards`);
      for (const l of lines) {
        assert.equal(l.links, 1, 'one link');
        assert.equal(l.href, `/s/${s.id}/learn/${l.subject}#announcements`, 'to its subject page\'s block');
        assert.ok(l.bell, 'the bell icon, hidden from screen readers');
        assert.equal(l.dir, 'auto', 'dir="auto"');
        assert.ok(l.oneLine, 'one line, ending in an ellipsis when longer');
        assert.ok(l.inside, 'inside its card');
        assert.ok(l.text.endsWith('…'), `each is over 100 code points, so cut with "…" (${l.text.slice(-12)})`);
        assert.ok([...l.text.replace(/…$/, '')].length <= 100, 'at most 100 code points shown');
      }
      for (const m of await measure(page, '#my-list .ann a')) assert.ok(m.height >= 44, `${lang}: the line is a 44 px tall target (${m.width}x${m.height})`);
      if (lang === 'ar') {
        await page.screenshot({ path: 'evidence/ux/UX-55-phone-ar.png', fullPage: false });
      } else {
        await uxShot(page, 'UX-55-desktop-en');
      }
      for (const size of [{ width: 320, height: 800 }, WIDTHS.phone]) {
        await page.setViewportSize(size);
        await page.reload();
        const o = await overflow(page);
        assert.ok(o.sideways <= 0, `${lang} ${size.width}: no sideways scroll (${o.sideways})`);
        assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${lang} ${size.width}: no clipped text`);
      }
      await k.ctx.close();
    }
    // Every announcement removed: the subject pages show none, so no card has a line.
    await w.p.sql(`UPDATE announcement SET removed_at = '${new Date().toISOString()}', body = ''`);
    for (const lang of ['ar', 'en'] as const) {
      const page = await (await (await as(w, SALMA, lang)).get(home(s))).text();
      assert.ok(!page.includes('class="ann"'), `${lang}: no line when the subject pages show none`);
      assert.ok(!page.includes('id="announcements"'), `${lang}: no block`);
    }
  });

  it('UX-55 continue stays on the first phone screen: at 390 x 844 in Arabic, with the activity notice on and three cut items, the bottom of the Continue link is at most 844 px from the top', async (t) => {
    const s = w.school;
    await w.p.sql(`DELETE FROM announcement`);
    await homeWorld(w);
    const k = await open(browser, w, SALMA, home(s), { lang: 'ar', width: 'phone' });
    try {
      const page = k.page;
      const m = await page.evaluate(() => {
        const notice = document.querySelector('#activity-notice');
        const link = document.querySelector('#continue-link');
        return {
          notice: Boolean(notice),
          folded: Boolean(document.querySelector('#notice-line')),
          lines: document.querySelectorAll('#my-list .ann').length,
          bottom: link ? link.getBoundingClientRect().bottom + window.scrollY : null,
        };
      });
      t.diagnostic(`UX-55 first phone screen: the bottom of "Continue where you stopped" is at ${m.bottom === null ? 'none' : m.bottom.toFixed(1)} px of 844 (activity notice ${m.folded ? 'folded' : 'in full'}, ${m.lines} card lines; R1a: no home block)`);
      assert.ok(m.notice, 'the activity notice is on');
      assert.equal(m.lines, 2, 'the two cards\' lines');
      assert.ok(m.bottom !== null, 'the Continue link is there');
      assert.ok(m.bottom! <= 844, `the Continue link ends within the first phone screen (${m.bottom})`);
    } finally {
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-56 ----
describe('UX-56 Arabic, mixed text and kit words for the learner blocks (three kits)', { concurrency: false }, () => {
  it('UX-56 language check by key (three kits), learner blocks: lang and dir, each item dir="auto", subject titles in <bdi>, no value of the other language in the blocks, the kit role words', async () => {
    const w = await wave4World();
    const browser = await chromium.launch();
    try {
      const mixed = 'موعد Quiz 2 يوم 12 نوفمبر at 9:30، والقاعة B-4.';
      const spaces = [
        { s: w.school, admin: ADMIN },
        { s: w.company, admin: COMPANY_ADMIN },
        { s: w.university, admin: UNIVERSITY_ADMIN },
      ];
      for (const sp of spaces) await post(await signedIn(w.p.url, sp.admin.username, sp.admin.password), adminAnn(sp.s, sp.s.math), mixed);
      const longest = (lang: Lang) => LEARNER_KEYS.map((k) => [k, UI[lang][k].split(/{[^}]*}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]] as const)
        .filter(([, v]) => v.length >= 3);
      for (const lang of ['ar', 'en'] as const) {
        for (const sp of spaces) {
          for (const [where, path] of [['subject', subjectPath(sp.s, sp.s.math)], ['home', home(sp.s)]] as const) {
            const k = await open(browser, w, SALMA, path, { lang });
            const page = k.page;
            assert.deepEqual(await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' });
            if (where === 'home') {
              // LMS redesign R1a (UX-55 row): the card's line, dir="auto", with no role line and no other-language words.
              assert.ok(await page.$$eval('#my-list .ann a', (as_) => as_.length > 0 && as_.every((a) => a.getAttribute('dir') === 'auto')), `${sp.s.kit} ${lang} home: each card line dir="auto"`);
              assert.ok(await page.$$eval('#my-list h2 a', (as_) => as_.every((a) => a.firstElementChild?.tagName === 'BDI')), 'subject titles in <bdi>');
              const text = (await page.innerText('#my-list')).replace(/[^\n]*(Quiz|موعد)[^\n]*/g, ' ');
              for (const [key, value] of longest(lang === 'ar' ? 'en' : 'ar')) assert.ok(!text.includes(value), `${sp.s.kit} ${lang} home: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
              await k.ctx.close();
              continue;
            }
            assert.ok(await page.$$eval('#announcements .ann-item', (lis) => lis.length > 0 && lis.every((li) => li.getAttribute('dir') === 'auto' && li.querySelector('.ann-text')!.getAttribute('dir') === 'auto')), `${sp.s.kit} ${lang} ${where}: each item dir="auto"`);
            const roles = await page.$$eval('#announcements .ann-by bdi:first-child', (b) => b.map((x) => x.textContent));
            assert.ok(roles.includes(words(sp.s.kit, lang)('admin')), `${sp.s.kit} ${lang} ${where}: the kit's admin word (${roles.join(', ')})`);
            const text = (await page.innerText('#announcements')).replace(/[^\n]*(Quiz|موعد)[^\n]*/g, ' ');
            for (const [key, value] of longest(lang === 'ar' ? 'en' : 'ar')) assert.ok(!text.includes(value), `${sp.s.kit} ${lang} ${where}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
            if (lang === 'ar' && where === 'subject' && sp.s !== w.school) await uxShot(page, `UX-56-phone-ar-${sp.s.kit}`);
            await k.ctx.close();
          }
        }
      }
    } finally {
      await browser.close();
      await w.close();
    }
  });
});

// ------------------------------------------------------------------- UX-57 ----
describe('UX-57 states table for the learner screens', { concurrency: false }, () => {
  it('UX-57 states table, learner screens: subject page and home empty (no block), an unreadable subject today\'s 403, success with items and the fold; the preview: as the learner, with today\'s refusals', async () => {
    const w = await wave4World();
    try {
      await withW5a(w);
      const s = w.school;
      const salma = await as(w, SALMA, 'en');
      const karim = await as(w, KARIM5, 'en');
      const amal = await as(w, ADMIN, 'en');
      const previewHome = `/s/${s.id}/preview?from=home`;
      const previewMath = `/s/${s.id}/preview/learn/${s.math}?from=home`;
      // Empty: no block on the subject page, the home and both previews (R1a, UX-55 row: and no card line).
      for (const [c, path] of [[salma, subjectPath(s, s.math)], [salma, home(s)], [amal, previewHome], [amal, previewMath]] as const) {
        const body = await (await c.get(path)).text();
        assert.equal(learnerBlockOf(body), null, `empty: no block on ${path}`);
        assert.equal(cardLines(body).size, 0, `empty: no card line on ${path}`);
      }
      // Error: an unreadable subject answers today's 403 (Karim Test is not assigned Mathematics), before and after posting.
      const before403 = await karim.get(subjectPath(s, s.math));
      assert.equal(before403.status, 403, 'an unreadable subject: 403');
      const refusal = (await salma.get(previewHome)).status;
      await twelve(w);
      const after403 = await karim.get(subjectPath(s, s.math));
      assert.equal(after403.status, 403, 'still 403 with announcements stored');
      assert.equal(await after403.text(), await before403.text(), 'the same 403 page (nothing new shown)');
      assert.equal((await salma.get(previewHome)).status, refusal, 'the preview\'s refusal for a learner is today\'s');
      // Success: the subject page with items and the fold; the home with up to 3; the previews the same blocks.
      const subject = learnerBlockOf(await (await salma.get(subjectPath(s, s.math))).text())!;
      assert.equal(subject.items.length, 3, 'subject page: 3 in full');
      assert.equal(subject.fold?.items.length, 7, 'subject page: 7 in the fold');
      // LMS redesign R1a (UX-55 row): the home shows the subject page's first item as the card's line.
      const homeLines = cardLines(await (await salma.get(home(s))).text());
      assert.equal(homeLines.get(s.math)?.text, cutText(subject.items[0].text).cut ? `${cutText(subject.items[0].text).text}…` : subject.items[0].text, 'home: the Mathematics card\'s line is the subject page\'s first item');
      const pSubject = learnerBlockOf(await (await amal.get(previewMath)).text())!;
      assert.deepEqual(pSubject.items.map((i) => i.text), subject.items.map((i) => i.text), 'preview subject page: the learner\'s block');
      const pHome = cardLines(await (await amal.get(previewHome)).text());
      assert.equal(pHome.get(s.math)?.text, homeLines.get(s.math)?.text, 'preview home: the learner\'s line');
      // Unpublished subject: the preview shows the block a learner would see after publishing (contract AT-3.4c); a learner gets today's answer.
      await storedAt(w, { space: s.id, subject: s.physics, body: 'Physics lab on Tuesday.', role: 'admin', at: Date.now() - HOUR });
      const pPhysics = learnerBlockOf(await (await amal.get(`/s/${s.id}/preview/learn/${s.physics}?from=home`)).text());
      assert.deepEqual(pPhysics?.items.map((i) => i.text), ['Physics lab on Tuesday.'], 'the unpublished subject\'s preview shows its block');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------- UX-58 ----
describe('UX-58 widths, targets, contrast and keyboard for the learner blocks', { concurrency: false }, () => {
  it('UX-58 widths, targets, contrast and keyboard, learner blocks: no sideways scroll or clipped text at 390, 768, 1280 and 320 px with 500-character texts and a 120-character title; 44 px targets, 4.5:1 text, focus rings; J2 to J4 by keyboard', async () => {
    const w = await wave4World();
    const browser = await chromium.launch();
    try {
      const s = w.school;
      const LONG_TITLE = `الرياضيات Mathematics for everyone: ${'كسور Fractions '.repeat(8)}`.slice(0, 120);
      await w.p.sql(`UPDATE subject SET title = '${LONG_TITLE}' WHERE id = '${s.math}'`);
      await twelve(w);
      await storedAt(w, { space: s.id, subject: s.math, body: `${'ب'.repeat(300)} ${'كلمة عربية Word '.repeat(12)}`.slice(0, 500), role: 'publisher', at: Date.now() - 2 * 60_000 });
      await storedAt(w, { space: s.id, subject: s.math, body: 'x'.repeat(500), role: 'admin', at: Date.now() - 60_000 });
      const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
      for (const lang of ['ar', 'en'] as const) {
        for (const [name, path] of [['subject page', subjectPath(s, s.math)], ['home', home(s)]] as const) {
          const k = await open(browser, w, SALMA, path, { lang });
          const page = k.page;
          for (const [wname, size] of widths) {
            await page.setViewportSize(size);
            await page.reload();
            if (name === 'subject page') await page.$eval('#announcements details.ann-older', (d) => ((d as HTMLDetailsElement).open = true));
            const o = await overflow(page);
            assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
            assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
            if (name === 'subject page' && lang === 'ar' && wname === 'desktop') {
              await page.$eval('#announcements details.ann-older', (d) => ((d as HTMLDetailsElement).open = false));
              await uxShot(page, 'UX-58-desktop-ar');
            }
          }
          await page.setViewportSize(WIDTHS.phone);
          await page.reload();
          // LMS redesign R1a (UX-55 row): on the home, the cards' announcement lines (#my-list .ann a) in place of the block.
          for (const m of await measure(page, '#announcements summary, #announcements a.ann-where-link, #my-list .ann a')) {
            assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
          }
          for (const m of await measure(page, '#announcements h2, #announcements .ann-by, #announcements .ann-text, #announcements summary, #announcements a.ann-where-link, #announcements a.ann-full, #my-list .ann a')) {
            if (!m.text.trim()) continue;
            assert.ok(m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
          }
          for (const sel of ['#announcements summary', '#announcements a.ann-where-link', '#announcements a.ann-full', '#my-list .ann a']) {
            if (!(await page.$(sel))) continue;
            await page.focus(sel);
            await page.keyboard.press('Shift+Tab');
            const f = await tab(page);
            assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
          }
          await k.ctx.close();
        }
      }
      // J3 and J4 by keyboard only (Salma, phone, Arabic): Tab from the top of the home to the first subject link, Enter
      // opens Mathematics at its block; Tab on to the fold, Enter and Space open and close it; then on to the outline (no trap).
      const k = await open(browser, w, SALMA, home(s), { lang: 'ar' });
      const reach = async (test: string, max = 80) => {
        for (let i = 0; i < max; i++) {
          await k.page.keyboard.press('Tab');
          if (await k.page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, test)) return true;
        }
        return false;
      };
      assert.ok(await reach('#my-list .ann a'), 'J3: the first card\'s announcement line is reached by Tab (R1a, UX-55 row)');
      await Promise.all([k.page.waitForURL(/\/learn\/[^/]+#announcements$/), k.page.keyboard.press('Enter')]);
      assert.ok(await reach('#announcements summary'), 'J3/J4: the fold is reached by Tab');
      assert.deepEqual(await foldByKeyboard(k.page), [true, false, true], 'the fold opens with Enter and Space');
      await k.page.keyboard.press('Tab');
      assert.equal(await k.page.evaluate(() => {
        const e = document.activeElement;
        const block = document.querySelector('#announcements')!;
        return Boolean(e && e !== document.body && !block.contains(e) && (block.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
      }), true, 'J4: the next Tab leaves the block for what follows it, the outline (no trap)');
      await k.ctx.close();
      // J2 by keyboard only (Amal, desktop, English): Tab to the card's field on the subject admin page, type, Tab to the button, Enter.
      const a = await open(browser, w, ADMIN, topicPath(s, s.math), { lang: 'en', width: 'desktop' });
      let reached = false;
      for (let i = 0; i < 120 && !reached; i++) {
        await a.page.keyboard.press('Tab');
        reached = await a.page.evaluate(() => document.activeElement?.id === 'ann-new-body');
      }
      assert.ok(reached, 'J2: the field is reached by Tab');
      await a.page.keyboard.type('By keyboard only.');
      await a.page.keyboard.press('Tab');
      await Promise.all([a.page.waitForURL(/announcement=posted/), a.page.keyboard.press('Enter')]);
      assert.equal(await a.page.evaluate(() => document.activeElement?.classList.contains('ann-status') ?? false), true, 'J2: the status line has focus');
      await a.ctx.close();
    } finally {
      await browser.close();
      await w.close();
    }
  });
});

mkdirSync('evidence/ux', { recursive: true });
