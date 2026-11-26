// LMS wave 8, W8-1b (ux-plan revision e49e1755 on PIL-299, UX-88 to UX-91
// and UX-93 for the learner screens and keys): the learner meets the dates.
// Each describe is its own CI step (`UX-<n> ...`); screenshots go to
// evidence/ux/ (UX-88 at 390, 768 and 1280 px, UX-89 and UX-90 at 390 px),
// in Arabic, from world W8-a (test/wave8/world.ts) at 2026-12-09.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { SEED_KIT_WORDS } from '../../src/kits/seed.ts';
import { overflow } from '../wave1/ux.ts';
import { AT8, ID, OMAR, SALMA, textOf, w8World, words8, type Kit, type Person, type W8World } from './world.ts';
import { S, cardOf, got, lessonLinks, outlineOf } from './learner.ts';

type Lang = 'ar' | 'en';
const WIDTHS = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } } as const;
type Width = keyof typeof WIDTHS;
const UX_EVIDENCE = fileURLToPath(new URL('../../evidence/ux/', import.meta.url));
/** The learner keys of W8-1b (the wording table: openedOn and openNext). */
const LEARNER_KEYS = ['openedOn', 'openNext'] as const satisfies readonly UiKey[];

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(UX_EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${UX_EVIDENCE}${name}.png`, fullPage: true });
}

interface Tab { ctx: BrowserContext; page: Page }

/** A fresh browser at a width, signed in through the real form, with the person's language set. */
async function browserAs(browser: Browser, w: W8World, who: Person, opts: { width?: Width; lang?: Lang } = {}): Promise<Tab> {
  const ctx = await browser.newContext({ viewport: WIDTHS[opts.width ?? 'phone'], locale: 'ar-EG' });
  ctx.setDefaultTimeout(15_000);
  const page = await ctx.newPage();
  await page.goto(w.url + '/signin');
  await page.fill('form#signin input[name=username]', who.username);
  await page.fill('form#signin input[name=password]', who.password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
  await page.goto(w.url + '/account/language');
  await page.selectOption('form#language select[name=lang]', opts.lang ?? 'ar');
  await Promise.all([page.waitForEvent('load'), page.locator('form#language button[type=submit]').click()]);
  return { ctx, page };
}

async function go(page: Page, w: W8World, path: string): Promise<void> {
  const res = await page.goto(w.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
}

/** W8-a in order at 2026-12-09 noon, Salma with Ch1 done; Omar has no marks. */
function world(opts: { inOrder?: boolean; kit?: Kit } = {}) {
  const box: { w?: W8World; browser?: Browser } = {};
  before(async () => {
    box.w = await w8World({ inOrder: opts.inOrder ?? true, kit: opts.kit, atMs: AT8.d9 });
    for (const id of [ID.l11, ID.l12]) box.w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
    box.browser = await chromium.launch();
  });
  after(async () => {
    await box.browser?.close();
    await box.w?.close();
  });
  return box as { w: W8World; browser: Browser };
}

const outlinePath = `${S}/learn/${ID.math}?open=all`;

// ------------------------------------------------------------------- UX-88 ----
describe('UX-88 outline date lock, both reasons, hidden absent, counter', { concurrency: false }, () => {
  const x = world();

  it('UX-88 wave 4\'s tag and reason classes; lesson titles not links; the date line before the order line; an empty chapter: tag and date line only; the hidden chapter leaves no gap, heading or count; the counter leaves it out', async () => {
    const t = words8('school', 'en');
    const omar = await x.w.as(OMAR, 'en');
    const html = (await got(omar, outlinePath)).html;
    const chapters = outlineOf(html);
    assert.deepEqual(chapters.map((c) => c.id), [ID.ch1, ID.ch2, ID.ch4, ID.ch5], 'four chapters: Ch3 leaves no heading');
    const ch2 = chapters.find((c) => c.id === ID.ch2)!;
    assert.ok(ch2.locked && ch2.tag, 'Ch2: wave 4\'s data-locked and lock-tag');
    assert.match(ch2.html, /<details class="card fold locked"/, 'Ch2: wave 4\'s locked class');
    assert.deepEqual(ch2.reasons.map((r) => r.kind), ['date', 'order'], 'Ch2 (both reasons): the date line first, then wave 4\'s line');
    assert.ok(ch2.html.split('class="lock-reason"').length - 1 === 2, 'both lines use wave 4\'s reason class');
    assert.ok(ch2.lessons.every((l) => !l.link), 'Ch2: lesson titles are not links');
    const ch5 = chapters.find((c) => c.id === ID.ch5)!;
    assert.ok(ch5.tag, 'Ch5 (empty): the tag');
    assert.deepEqual(ch5.reasons.map((r) => r.kind), ['date'], 'Ch5 (empty): the date line only');
    assert.equal(ch5.reasons[0].text, t('openedOn', { date: '2026-12-10' }));
    assert.ok(!html.includes(ID.ch3), 'nothing of Ch3: no id, no gap element');
    assert.equal((html.match(/<details class="card fold/g) ?? []).length, 4, 'exactly four chapter blocks');
    const lesson = (await got(omar, `${S}/read/${ID.l11}`)).html;
    assert.match(textOf(/<p id="lesson-place"[^>]*>([\s\S]*?)<\/p>/.exec(lesson)?.[1] ?? ''), /1 \/ 6/, 'the counter: 1 / 6 (Ch3\'s lesson left out)');
  });

  it('UX-88 screenshots at 390, 768 and 1280 px, Arabic, Open in order on, the both-reason case visible (Omar, no marks)', async () => {
    for (const width of Object.keys(WIDTHS) as Width[]) {
      const k = await browserAs(x.browser, x.w, OMAR, { width });
      await go(k.page, x.w, outlinePath);
      assert.equal(await k.page.getAttribute('html', 'dir'), 'rtl');
      assert.equal(await k.page.locator(`#chapter-${ID.ch2} [data-reason=date]`).count(), 1, `${width}: the date line is drawn`);
      await k.page.locator(`#chapter-${ID.ch2}`).scrollIntoViewIfNeeded();
      await shot(k.page, `UX-88-${width}`);
      await k.ctx.close();
    }
  });
});

// ------------------------------------------------------------------- UX-89 ----
describe('UX-89 date-locked lesson page', { concurrency: false }, () => {
  const x = world({ inOrder: false });

  it('UX-89 the title, the "Locked" tag and "Opens on {date}."; "Back to <subject>" is the first focusable item after the heading; no material, file link or done form', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const t = words8('school', lang);
      const k = await browserAs(x.browser, x.w, SALMA, { lang });
      await go(k.page, x.w, `${S}/read/${ID.l21}`);
      const v = await k.page.evaluate(() => {
        const h1 = document.querySelector('#locked-lesson h1');
        const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        const after = focusable.filter((e) => h1 && (h1.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
        return {
          title: h1?.textContent ?? '',
          tag: document.querySelector('#locked-lesson .lock-tag')?.textContent ?? '',
          reason: document.querySelector('#lock-reason')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          firstAfter: after[0]?.id ?? after[0]?.outerHTML.slice(0, 60) ?? '',
          back: (document.querySelector('#back-to-subject') as HTMLAnchorElement | null)?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          material: document.querySelectorAll('#items, a[href*="/file/"], #done-state, #done-control, form[action*="/done"]').length,
        };
      });
      assert.equal(v.title, 'Halves and quarters', `${lang}: the title`);
      assert.ok(v.tag.includes(t('lockedTag')), `${lang}: the Locked tag`);
      assert.equal(v.reason, t('openedOn', { date: '2026-12-10' }), `${lang}: the reason`);
      assert.equal(v.firstAfter, 'back-to-subject', `${lang}: Back to <subject> is the first focusable item after the heading`);
      assert.equal(v.back, t('quizBackToSubject', { subjectTitle: 'Mathematics' }), `${lang}: "Back to Mathematics"`);
      assert.equal(v.material, 0, `${lang}: no material, file link or done form in the markup`);
      if (lang === 'ar') await shot(k.page, 'UX-89-phone');
      await k.ctx.close();
    }
  });

  it('UX-89 with Open in order on (both reasons): the date line, then wave 4\'s line; Back to <subject> still first', async () => {
    x.w.run('UPDATE subject SET chapters_in_order = 1 WHERE id = ?', ID.math);
    const k = await browserAs(x.browser, x.w, OMAR, { lang: 'en' });
    await go(k.page, x.w, `${S}/read/${ID.l21}`);
    const v = await k.page.evaluate(() => ({
      kinds: [...document.querySelectorAll('#lock-reason > .lock-reason')].map((e) => e.getAttribute('data-reason') ?? 'order'),
      first: (() => {
        const h1 = document.querySelector('#locked-lesson h1')!;
        return [...document.querySelectorAll('a[href], button')].find((e) => h1.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)?.id;
      })(),
    }));
    assert.deepEqual(v.kinds, ['date', 'order']);
    assert.equal(v.first, 'back-to-subject');
    x.w.run('UPDATE subject SET chapters_in_order = 0 WHERE id = ?', ID.math);
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-90 ----
describe('UX-90 no link into a not-open chapter', { concurrency: false }, () => {
  const x = world();

  it('UX-90 no home, Continue or Go to link points to a lesson not open (Salma and Omar, order on and off); the card shows openNext as plain text; screenshot', async () => {
    const notOpen = [ID.l21, ID.l22, ID.l31];
    for (const inOrder of [true, false]) {
      x.w.run('UPDATE subject SET chapters_in_order = ? WHERE id = ?', inOrder ? 1 : 0, ID.math);
      for (const who of [SALMA, OMAR]) {
        const c = await x.w.as(who, 'en');
        for (const path of [S, outlinePath, `${S}/read/${ID.l11}`, `${S}/read/${ID.l12}`, `${S}/read/${ID.l21}`]) {
          const html = (await got(c, path)).html;
          for (const id of lessonLinks(html)) assert.ok(!notOpen.includes(id), `order ${inOrder ? 'on' : 'off'} ${who.key} ${path}: no link to ${id}`);
        }
      }
    }
    x.w.run('UPDATE subject SET chapters_in_order = 1 WHERE id = ?', ID.math);
    const home = (await got(await x.w.as(SALMA, 'en'), S)).html;
    const card = cardOf(home);
    assert.equal(card.next, words8('school', 'en')('openNext', { title: 'Fractions', date: '2026-12-10' }), 'the card: openNext');
    const line = /<p class="open-next">([\s\S]*?)<\/p>/.exec(card.html);
    assert.ok(line, 'a plain paragraph');
    assert.doesNotMatch(line[1], /<a\b/, 'openNext holds no link');
    assert.equal(card.links.length, 0, 'the card has no lesson link at all');
    const k = await browserAs(x.browser, x.w, SALMA);
    await go(k.page, x.w, S);
    assert.equal(await k.page.locator(`li.card[data-subject="${ID.math}"] .open-next a`).count(), 0);
    await shot(k.page, 'UX-90-phone');
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-91 ----
describe('UX-91 rtl, bdi and no horizontal overflow at 390/768/1280 (learner screens)', { concurrency: false }, () => {
  const x = world();

  const PAGES = (who: Person) => (who === OMAR ? [outlinePath, `${S}/read/${ID.l21}`, `${S}/read/${ID.l12}`] : [S, outlinePath]);

  it('UX-91 Arabic: dir=rtl; every new date isolated left to right as dueOn; chapter titles in <bdi>', async () => {
    for (const who of [SALMA, OMAR]) {
      const k = await browserAs(x.browser, x.w, who);
      for (const path of PAGES(who)) {
        await go(k.page, x.w, path);
        assert.equal(await k.page.getAttribute('html', 'dir'), 'rtl', `${who.key} ${path}: rtl`);
        const bad = await k.page.evaluate(() => {
          const out: string[] = [];
          const news = document.querySelectorAll('[data-reason=date], .open-next');
          for (const e of news) {
            const times = e.querySelectorAll('time');
            if (!times.length) out.push(`no <time> in ${e.className}`);
            for (const t of times) if (!(t.parentElement?.tagName === 'BDI' && t.parentElement.getAttribute('dir') === 'ltr')) out.push(`a date not isolated: ${t.textContent}`);
          }
          for (const e of document.querySelectorAll('.open-next')) if (!e.querySelector('bdi:not([dir])')) out.push('the chapter title of openNext not in <bdi>');
          // A date is never broken across lines.
          for (const e of document.querySelectorAll('.open-next .due-date, [data-reason=date] .due-date')) if (e.getClientRects().length !== 1) out.push(`a date broken across lines: ${e.textContent}`);
          for (const e of document.querySelectorAll('details.fold .head')) if (!e.querySelector('bdi.title')) out.push('a chapter title not in <bdi>');
          return { out, count: news.length };
        });
        assert.deepEqual(bad.out, [], `${who.key} ${path}`);
        // Never vacuous: the outline carries the date lines of the shown-locked chapters (Ch2, Ch5).
        if (path === outlinePath) assert.ok(bad.count >= 2, `${who.key} ${path}: the date lines are there to check (${bad.count})`);
      }
      await k.ctx.close();
    }
  });

  it('UX-91 no sideways scroll and no clipped text on the page and on each chapter row, card and locked page at 390, 768 and 1280, Arabic and English, also with 120-character titles', async () => {
    const LONG = (p: string) => `${p} ${'كسور Fractions '.repeat(10)}`.slice(0, 120);
    for (const long of [false, true]) {
      if (long) {
        x.w.run('UPDATE subject SET title = ? WHERE id = ?', LONG('الرياضيات Mathematics'), ID.math);
        x.w.run('UPDATE chapter SET title = ? WHERE id = ?', LONG('وحدة Unit'), ID.ch2);
      }
      for (const lang of ['ar', 'en'] as const) {
        for (const who of [SALMA, OMAR]) {
          const k = await browserAs(x.browser, x.w, who, { lang });
          for (const path of PAGES(who)) {
            await go(k.page, x.w, path);
            for (const [wname, size] of Object.entries(WIDTHS)) {
              await k.page.setViewportSize(size);
              await k.page.reload();
              const o = await overflow(k.page);
              assert.ok(o.sideways <= 0, `${lang} ${who.key} ${path} ${wname}${long ? ' long' : ''}: no sideways scroll (${o.sideways})`);
              assert.deepEqual(o.clipped.filter((c) => !/sr-only/.test(c)), [], `${lang} ${who.key} ${path} ${wname}: no clipped text`);
              const rows = await k.page.$$eval('details.fold, details.fold > summary, li.card, #continue, #locked-lesson, #lock-reason, .open-next, #next-locked',
                (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.tagName + (e.id ? '#' + e.id : '.' + e.className)));
              assert.deepEqual(rows, [], `${lang} ${who.key} ${path} ${wname}: each row fits (scrollWidth <= clientWidth)`);
            }
          }
          await k.ctx.close();
        }
      }
    }
    x.w.run('UPDATE subject SET title = ? WHERE id = ?', 'Mathematics', ID.math);
    x.w.run('UPDATE chapter SET title = ? WHERE id = ?', 'Fractions', ID.ch2);
  });
});

// ------------------------------------------------------------------- UX-93 ----
describe('UX-93 wording in 3 kits x 2 languages (learner keys openedOn and openNext)', { concurrency: false }, () => {
  for (const kit of ['school', 'company', 'university'] as const) {
    it(`UX-93 ${kit}: openedOn and openNext render in English and Arabic with the kit's words and no {placeholder} left`, async () => {
      const w = await w8World({ inOrder: true, kit, atMs: AT8.d9 });
      try {
        for (const id of [ID.l11, ID.l12]) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
        for (const lang of ['en', 'ar'] as const) {
          const t = words8(kit, lang);
          const c = await w.as(SALMA, lang);
          const pages = [(await got(c, outlinePath)).html, (await got(c, `${S}/read/${ID.l21}`)).html, (await got(c, S)).html];
          const text = textOf(pages.join('\n'));
          for (const [key, vars] of [['openedOn', { date: '2026-12-10' }], ['openNext', { title: 'Fractions', date: '2026-12-10' }]] as const) {
            assert.ok(text.includes(t(key, vars)), `${kit} ${lang}: ${key} renders: ${t(key, vars)}`);
          }
          assert.ok(!/\{[a-zA-Z]+\}/.test(text), `${kit} ${lang}: no {placeholder} left`);
          if (lang === 'en') assert.ok(t('openNext', { title: 'X', date: 'D' }).startsWith(`Next: ${t('chapter')}: `), `${kit}: the kit's "${t('chapter')}" in openNext`);
        }
      } finally {
        await w.close();
      }
    });
  }

  it('UX-93 no English kit word is hard-coded in the learner keys; the Arabic has no kit word after «الـ», «لكل» or «لأي», and a kit placeholder only as a label ("{chapter}:")', () => {
    const kitWords = (lang: 'ar' | 'en') => [...new Set(Object.values(SEED_KIT_WORDS).flatMap((k) => ['chapter', 'lesson', 'learner', 'subject'].map((w) => (k[lang] as Record<string, string>)[w]).filter(Boolean)))];
    for (const key of LEARNER_KEYS) {
      const en = UI.en[key];
      for (const word of [...kitWords('en'), 'chapter', 'chapters', 'lesson', 'lessons', 'learner', 'learners', 'subject', 'course', 'unit', 'module', 'student', 'employee']) {
        assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(en.replace(/\{[a-zA-Z]+\}/g, '')), `en ${key}: no literal "${word}"`);
      }
      const ar = UI.ar[key];
      for (const m of ar.matchAll(/\{(\w+)\}(.?)/g)) {
        assert.ok(['title', 'date'].includes(m[1]) || (m[1] === 'chapter' && m[2] === ':'), `ar ${key}: {${m[1]}} only as a label`);
      }
      for (const word of kitWords('ar')) {
        const bare = word.replace(/^ال/, '');
        assert.ok(!new RegExp(`(?:ال|لكل\\s+|لأي\\s+)${bare}`).test(ar), `ar ${key}: no kit word "${word}" after «الـ», «لكل» or «لأي»`);
      }
    }
  });
});
