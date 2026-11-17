// LMS wave 2, W2-1a (product-contract v2 on PIL-225, AT-4; ux-plan v2 UX-27,
// UX-30 and UX-31): nothing is recorded that the learner did not tap, the
// preview stays untouched, and the done block reads clearly in every state.
// One describe per labelled expectation, each its own CI step (`W2 AT-4.<n> ...`
// or `UX-<n> ...`, selected with --test-name-pattern), each on a fresh world.
// The AT-4 and UX checks share this one file to keep the task inside its file
// budget (contract section 12).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import type { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import { crawl, doneHits, doneWords } from '../at13/pages.ts';
import { measure } from '../wave1/ux.ts';
import {
  ADMIN, HADEER, MATH_ORDER, SALMA, T1, T2, activity, as, browserAs, home, lessonPath, markClock, markPath, marks, ownerPreview,
  plain, press, previewLesson, subjectPath, uxShot, wave2World, withTwoRoles, word, words, type Wave1World,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
const namesDone = (s: string) => /\bdone_mark\b/.test(s);
const writesDone = (statements: string[]) => statements.filter((s) => WRITE.test(s) && namesDone(s));

/** Salma's two existing marks (Adding fractions at T1, Reading decimals at T2). */
async function salmaTwoMarks(w: Wave1World): Promise<void> {
  const salma = await as(w, SALMA, 'en');
  for (const [title, at] of [['Adding fractions', T1], ['Reading decimals', T2]] as const) {
    await markClock(w, at);
    assert.equal((await press(salma, w.school, w.school.lessons[title], 'done')).status, 303, `${title} marked`);
  }
  await markClock(w, null);
}

/** A request with any method, sent with the client's session as a browser would (same origin). */
function send(w: Wave1World, c: Client, method: string, path: string, body?: string): Promise<Response> {
  const headers: Record<string, string> = { cookie: `lms_session=${c.cookie('lms_session')}`, origin: w.p.url };
  if (body !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
  return fetch(w.p.url + path, { method, redirect: 'manual', headers, body });
}

async function hrefs(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
}

// ------------------------------------------------------------------ AT-4.1 ----

describe('W2 AT-4.1 opening, scrolling, folding, following Next, a PDF, My results and the activity switch record no done mark', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('W2 AT-4.1 done_mark is identical before and after, no GET or HEAD writes it, and lesson opens are recorded as today', async (t) => {
    const s = w.school;
    await activity(w, true);
    await salmaTwoMarks(w);
    const before = await marks(w);
    assert.equal(before.length, 2, 'Salma holds two marks');
    assert.deepEqual(before.map((m) => m.marked_at).sort(), [T1, T2], 'at the test clock\'s times');
    const salmaId = w.ids[SALMA.username];
    const views = async () => (await w.p.sql(`SELECT lesson_id FROM lesson_view WHERE space_id = '${s.id}' AND learner_user_id = '${salmaId}' ORDER BY lesson_id`)).map((r) => String(r.lesson_id));
    assert.deepEqual(await views(), [], 'no lesson open recorded yet');

    // Signing in and choosing the language are done before the spy starts: they are not part of the journey.
    const { ctx, page } = await browserAs(browser, w, SALMA, { lang: 'ar' });
    const methods: string[] = [];
    ctx.on('request', (r) => { if (r.url().startsWith(w.p.url)) methods.push(`${r.method()} ${r.url().slice(w.p.url.length)}`); });
    const go = async (path: string) => {
      const res = await page.goto(w.p.url + path);
      assert.equal(res?.status(), 200, `${path} answers 200`);
      await page.mouse.wheel(0, 2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    };
    const spy = w.p.spy!;
    spy.start();
    await go(home(s));
    await go(subjectPath(s, s.math));
    const all = await hrefs(page, '#expand-all');
    if (all.length) {
      await go(all[0]);
      await go((await hrefs(page, '#collapse-all'))[0]);
    }
    await go(subjectPath(s, s.math, 'all'));
    for (const summary of await page.locator('summary').all()) {
      await summary.click();
      await summary.click();
    }
    // Every Mathematics lesson, by Next from the first, then the PDF and My results.
    await go(lessonPath(s, s.lessons[MATH_ORDER[0]]));
    let pdf = false;
    for (let next = await hrefs(page, '#next-lesson'); next.length; next = await hrefs(page, '#next-lesson')) {
      const href = await page.locator('li[data-kind="pdf"] a.open').first().getAttribute('href').catch(() => null);
      if (href && !pdf) {
        assert.equal(await page.evaluate(async (h) => (await fetch(h, { credentials: 'same-origin' })).status, href), 200, 'the PDF opens');
        pdf = true;
      }
      await go(next[0]);
    }
    assert.ok(pdf, 'a PDF material was opened');
    await go((await hrefs(page, '#nav-results'))[0]);
    // HEAD on every lesson, the outline and the home, as a browser or a proxy may send.
    for (const path of [home(s), subjectPath(s, s.math), ...MATH_ORDER.map((title) => lessonPath(s, s.lessons[title]))]) {
      await page.evaluate(async (p) => { await fetch(p, { method: 'HEAD', credentials: 'same-origin' }); }, path);
    }
    const journey = await spy.stop();
    await ctx.close();

    const sent = methods.filter((m) => !/^(GET|HEAD) /.test(m));
    assert.deepEqual(sent, [], 'the journey sent only GET and HEAD');
    t.diagnostic(`AT-4.1 journey: ${methods.length} requests, ${journey.length} statements, ${journey.filter(namesDone).length} reads of done_mark`);
    assert.deepEqual(writesDone(journey), [], 'no GET or HEAD request runs a statement that writes done_mark');
    assert.deepEqual(await marks(w), before, 'done_mark is identical (same rows, same times)');
    // Lesson activity is as today: one row per lesson opened, today's date.
    const opened = MATH_ORDER.map((title) => s.lessons[title]).sort();
    assert.deepEqual(await views(), opened, 'every Mathematics lesson opened is recorded once in lesson_view');

    // The admin's switch off and on: lesson_view rows go, done marks stay.
    spy.start();
    await activity(w, false);
    await activity(w, true);
    const switched = await spy.stop();
    assert.deepEqual(await views(), [], 'the switch-off deleted the lesson_view rows (today\'s behaviour)');
    assert.deepEqual(writesDone(switched), [], 'the switch runs no statement that writes done_mark');
    assert.deepEqual(await marks(w), before, 'done_mark is still identical after the switch');
  });
});

// ------------------------------------------------------------------ AT-4.2 ----

describe('W2 AT-4.2 only a POST to the mark address writes a done mark', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-4.2 every other method and address, and every other form of the lesson page, writes no done mark; the code calls the writes only there', async () => {
    const s = w.school;
    await activity(w, true);
    const salma = await as(w, SALMA, 'en');
    const lesson = s.lessons['Comparing fractions'];
    const spy = w.p.spy!;
    const tried: { what: string; status: number; writes: string[] }[] = [];
    const attempt = async (what: string, run: () => Promise<Response>) => {
      spy.start();
      const res = await run();
      await res.arrayBuffer();
      tried.push({ what, status: res.status, writes: writesDone(await spy.stop()) });
    };
    const form = 'state=done';
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      await attempt(`${method} mark address`, () => send(w, salma, method, markPath(s, lesson), ['GET', 'HEAD'].includes(method) ? undefined : form));
    }
    await attempt('GET mark address with ?state=done', () => salma.get(`${markPath(s, lesson)}?state=done`));
    for (const path of [lessonPath(s, lesson), `${lessonPath(s, lesson)}?marked=done`, subjectPath(s, s.math), home(s), `${markPath(s, lesson)}/again`, `/s/${s.id}/read/${lesson}/done-state`]) {
      await attempt(`POST ${path}`, () => salma.post(path, { state: 'done' }));
      await attempt(`GET ${path}`, () => salma.get(path));
    }
    // Every other post form a learner meets on the lesson page (the notice's Got it, sign-out last).
    const doc = await (await salma.get(lessonPath(s, lesson))).text();
    const actions = [...doc.matchAll(/<form\b[^>]*method="post"[^>]*action="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
      .filter((a) => !a.endsWith('/done')).sort((a, b) => Number(a.includes('signout')) - Number(b.includes('signout')));
    assert.ok(actions.length > 0, 'the lesson page has other post forms');
    await attempt('POST language', () => salma.post('/account/language', { lang: 'ar' }));
    for (const a of actions) await attempt(`POST ${a} (lesson page form)`, () => salma.post(a, { state: 'done' }));
    const others = tried.filter((x) => x.writes.length);
    assert.deepEqual(others.map((x) => `${x.what}: ${x.writes.join(' | ')}`), [], 'nothing but the mark POST writes a done mark');
    assert.deepEqual(await marks(w), [], 'and nothing is stored');

    // The mark POST itself is the one that writes.
    const signedIn = await as(w, SALMA, 'en');
    spy.start();
    assert.equal((await press(signedIn, s, lesson, 'done')).status, 303);
    assert.equal(writesDone(await spy.stop()).length, 1, 'the mark POST runs one write of done_mark');
    assert.equal((await marks(w)).length, 1, 'and stores the mark');

    // In the code: the two writes are called only from the POST handler of the mark address.
    const src = fileURLToPath(new URL('../../src/', import.meta.url));
    const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(src);
    const calls: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\b(markDone|markNotDone)\s*\(/g)) {
        const rel = relative(src, f).replace(/\\/g, '/');
        if (rel === 'progress.ts' && /export async function (markDone|markNotDone)\s*\($/.test(text.slice(0, m.index! + m[0].length))) continue;
        const handler = text.lastIndexOf("app.", m.index);
        calls.push(`${rel}: ${text.slice(handler, text.indexOf('\n', handler))}`);
      }
    }
    assert.ok(calls.length >= 2, 'the two writes are called');
    for (const c of calls) assert.equal(c, "app.ts: app.post('/s/:spaceId/read/:lessonId/done', async (c) => {", 'called only from the mark POST');
  });
});

// ------------------------------------------------------------------ AT-4.3 ----

describe('W2 AT-4.3 every preview page shows no tick, tag or progress line, draws "Mark as done" inert, and runs no statement naming done_mark', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-4.3 the owner\'s, the admin\'s and the publisher\'s previews, with Salma\'s and Amal\'s own marks present', async (t) => {
    const s = w.school;
    await activity(w, true);
    await salmaTwoMarks(w);
    // Amal also learns Mathematics (W2-e) and marks a lesson herself: her preview still shows nothing of it.
    await withTwoRoles(w);
    const amal = await as(w, ADMIN, 'en');
    assert.equal((await press(amal, s, s.lessons['Adding fractions'], 'done')).status, 303);
    assert.equal((await marks(w)).length, 3);
    const spy = w.p.spy!;
    let lessons = 0;
    for (const lang of LANGS) {
      const viewers: [string, Client, string[], (p: string) => boolean][] = [
        ['admin', await as(w, ADMIN, lang), [`/s/${s.id}/preview?from=home`], (p) => p.startsWith(`/s/${s.id}/preview`)],
        ['publisher', await as(w, HADEER, lang), [`/s/${s.id}/preview?from=home`], (p) => p.startsWith(`/s/${s.id}/preview`)],
        ['owner', await as(w, OWNER, lang), [ownerPreview(s), `${ownerPreview(s)}/results`], (p) => p.startsWith(`/owner/spaces/${s.id}/preview`)],
      ];
      for (const [name, c, starts, keep] of viewers) {
        spy.start();
        const pages = await crawl(c, starts, [], 80, keep);
        const statements = await spy.stop();
        assert.deepEqual(statements.filter(namesDone), [], `${name} ${lang}: no preview request runs a statement naming done_mark`);
        assert.ok(pages.length > 0, `${name} ${lang}: preview pages reached`);
        for (const p of pages.filter((x) => x.status === 200)) {
          assert.deepEqual(doneHits(p.body, doneWords(true)), [], `${name} ${lang} ${p.path}: no tick, tag, status or progress`);
          assert.ok(!/id="done-(tag|status|progress)"/.test(p.body), `${name} ${lang} ${p.path}: no Done tag, status line or progress line`);
          const block = /<section id="done-state"[\s\S]*?<\/section>/.exec(p.body)?.[0];
          if (!/\/preview\/read\//.test(p.path)) {
            assert.equal(block, undefined, `${name} ${lang} ${p.path}: no done block outside a lesson`);
            continue;
          }
          lessons++;
          assert.ok(block, `${name} ${lang} ${p.path}: the done block is drawn`);
          assert.ok(!/<form\b/.test(block), `${p.path}: no form`);
          assert.match(block, /<button type="button" id="done-control" aria-disabled="true" aria-describedby="preview-reason">/, `${p.path}: inert, described by the reason sentence`);
          assert.equal(plain(block), word(lang, 'markDone'), `${p.path}: "Mark as done", whatever anyone marked`);
        }
      }
    }
    t.diagnostic(`AT-4.3 ${lessons} preview lesson pages checked`);
    assert.ok(lessons >= 2 * 2 * MATH_ORDER.length, 'every Mathematics lesson was previewed by the admin and the publisher in both languages');
  });
});

// ------------------------------------------------------------------ AT-4.4 ----
// The wave 3a "changes nothing" journey (test/wave3a/at3.test.ts) runs with
// Salma's two done marks present; its record (evidence/wave3a/at3-journey.json,
// written in CI for this run by the W3a AT-3.1 step) is judged here. This step
// runs in the wave-3a job right after the W3a AT-3 steps of the same run.

describe('W2 AT-4.4 W3a AT-3.1 to AT-3.5 pass with the done-mark table in the snapshot, holding Salma\'s rows unchanged', () => {
  it('W2 AT-4.4 the wave 3a journey record holds done_mark with Salma\'s two rows, identical before and after, and no statement naming it', () => {
    const record = new URL('../../evidence/wave3a/at3-journey.json', import.meta.url);
    const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT ?? '1'}` : null;
    assert.ok(run, 'runs after the W3a AT-3 steps of the same run (GITHUB_RUN_ID set)');
    assert.ok(existsSync(record), 'the W3a AT-3.1 step wrote the journey record');
    const j = JSON.parse(readFileSync(record, 'utf8')) as { run: string; before: Record<string, string[]>; after: Record<string, string[]>; statements: string[] };
    assert.equal(j.run, run, 'the record is this run\'s');
    assert.ok('done_mark' in j.before && 'done_mark' in j.after, 'the snapshots hold the done-mark table');
    assert.equal(j.before.done_mark.length, 2, 'with Salma\'s two rows');
    const rows = j.before.done_mark.map((r) => Object.fromEntries(JSON.parse(r) as [string, unknown][]));
    assert.equal(new Set(rows.map((r) => r.learner_user_id)).size, 1, 'both rows are one learner\'s (Salma\'s)');
    assert.deepEqual(rows.map((r) => Number(r.marked_at)).sort(), [1951234567890, 1951234599999], 'at their stored times');
    assert.deepEqual(j.after.done_mark, j.before.done_mark, 'the rows are unchanged after the journey');
    assert.deepEqual(j.statements.filter(namesDone), [], 'no preview request of the journey runs a statement naming done_mark');
  });
});

// ------------------------------------------------------------------- UX-27 ----

type Facts = { tag: string; bg: string; color: string; border: string; borderWidth: number; height: number; width: number; blockWidth: number };

async function buttonFacts(page: Page): Promise<Facts> {
  return page.locator('#done-control button').evaluate((b) => {
    const cs = getComputedStyle(b);
    const block = document.getElementById('done-state')!.getBoundingClientRect();
    const box = b.getBoundingClientRect();
    return {
      tag: b.tagName.toLowerCase(), bg: cs.backgroundColor, color: cs.color, border: cs.borderTopStyle, borderWidth: parseFloat(cs.borderTopWidth),
      height: box.height, width: box.width, blockWidth: block.width,
    };
  });
}

/** Presses the block's button as a person does, and waits for the page it lands on. */
async function pressButton(page: Page): Promise<void> {
  await Promise.all([page.waitForEvent('load'), page.locator('#done-control button').click()]);
}

const focusedId = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  if (!e || e === document.body) return 'body';
  if (e.closest('#items')) return 'materials';
  if (e.closest('#done-control')) return 'done-button';
  return e.id || e.tagName.toLowerCase();
});

describe('UX-27 done block on the lesson page', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-27 place, sizes, primary and secondary styles, status line with focus after each press (script on and off), no status on a stale ?marked=, focus order; screenshots', async () => {
    const s = w.school;
    const lesson = s.lessons['Comparing fractions'];
    const path = lessonPath(s, lesson);

    // The standard set of a not-done lesson.
    for (const [width, lang, kit] of [['phone', 'ar', 'school'], ['tablet', 'ar', 'school'], ['desktop', 'ar', 'school'], ['phone', 'en', 'school'], ['phone', 'ar', 'company']] as const) {
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang, width });
      const sp = kit === 'company' ? w.company : s;
      await page.goto(w.p.url + lessonPath(sp, sp.lessons['Comparing fractions']));
      assert.equal((await page.locator('#done-control button').innerText()).trim(), words(kit, lang)('markDone'), `${width} ${lang} ${kit}: "Mark as done"`);
      await uxShot(page, `UX-27-${width}-${lang}${kit === 'company' ? '-company' : ''}`);
      await ctx.close();
    }

    const { ctx, page } = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await page.goto(w.p.url + path);
    // Place: after the materials, before Next and Previous.
    const order = await page.evaluate(() => {
      const ids = ['items', 'done-state', 'lesson-nav'];
      const els = ids.map((id) => document.getElementById(id)!);
      return els.every(Boolean) && Boolean(els[0].compareDocumentPosition(els[1]) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(els[1].compareDocumentPosition(els[2]) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.ok(order, 'the block sits after the materials and before Next and Previous');
    assert.equal(await page.locator('#done-state').getAttribute('tabindex'), '-1', 'the block can take focus from the fragment');
    // Not done: one native button in a post form, full width on phone, 48 px or more, the primary (filled) style.
    const notDone = await buttonFacts(page);
    assert.equal(notDone.tag, 'button');
    assert.equal(await page.locator('#done-control').evaluate((f) => `${f.tagName} ${(f as HTMLFormElement).method}`), 'FORM post', 'a plain post form');
    assert.ok(notDone.height >= 48, `"Mark as done" is ${notDone.height} px tall (48 or more)`);
    assert.ok(notDone.width >= notDone.blockWidth - 1, `full width on phone (${notDone.width} of ${notDone.blockWidth})`);
    assert.ok(!/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(notDone.bg), `filled primary background (${notDone.bg})`);
    const [m] = await measure(page, '#done-control button');
    assert.ok(m.contrast >= 4.5, `button text contrast ${m.contrast.toFixed(2)}`);

    // Tab order: the materials, the done button, Next, Previous.
    await page.evaluate(() => window.scrollTo(0, 0));
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      seen.push(await focusedId(page));
      if (seen.at(-1) === 'previous-lesson') break;
    }
    const at = seen.indexOf('done-button');
    assert.ok(at > 0, `the done button is reached by Tab (${seen.join(', ')})`);
    assert.deepEqual(seen.slice(at - 1, at + 3), ['materials', 'done-button', 'next-lesson', 'previous-lesson'], 'Tab order: materials, done button, Next, Previous');

    // The press (script on): the page opens at the block, which has focus; the status line says it.
    await pressButton(page);
    assert.ok(page.url().endsWith(`${path}?marked=done#done-state`), 'lands at the block');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'done-state', 'focus is on #done-state after the press');
    assert.equal((await page.locator('#done-state [role="status"]').innerText()).trim(), word('ar', 'markedDone'), 'the status line inside the block');
    assert.equal((await page.locator('#done-state .done-now').innerText()).replace(/\s+/g, ' ').trim(), `✓ ${word('ar', 'doneTag')}`, 'a tick with the text "Done"');
    const done = await buttonFacts(page);
    assert.equal((await page.locator('#done-control button').innerText()).trim(), word('ar', 'markNotDone'));
    assert.ok(done.height >= 44, `"Mark as not done" is ${done.height} px tall (44 or more)`);
    assert.ok(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(done.bg) && done.border === 'solid' && done.borderWidth >= 1, `secondary (outlined) style (${done.bg}, ${done.border} ${done.borderWidth}px)`);
    assert.equal(done.color, notDone.bg, 'the outline style takes the primary colour as its text');
    const [m2] = await measure(page, '#done-control button');
    assert.ok(m2.contrast >= 4.5, `"Mark as not done" contrast ${m2.contrast.toFixed(2)}`);
    await uxShot(page, 'UX-27-phone-ar-done');
    // From the focused block: the block's button, then Next.
    await page.keyboard.press('Tab');
    assert.equal(await focusedId(page), 'done-button', 'the next Tab reaches the block\'s button');
    await page.keyboard.press('Tab');
    assert.equal(await focusedId(page), 'next-lesson', 'then Next');

    // Undo.
    await pressButton(page);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'done-state', 'focus is on #done-state after the undo');
    assert.equal((await page.locator('#done-state [role="status"]').innerText()).trim(), word('ar', 'markedNotDone'));
    await uxShot(page, 'UX-27-phone-ar-undone');
    // A stale or wrong ?marked= shows no status line.
    for (const q of ['?marked=done', '?marked=failed', '?marked=other']) {
      await page.goto(w.p.url + path + q + '#done-state');
      const n = await page.locator('#done-state [role="status"]').count();
      if (q === '?marked=failed') continue; // a failed save is said whatever the state (UX-30)
      assert.equal(n, 0, `${q} on a not-done lesson: no status line`);
    }
    await ctx.close();

    // English, after the press.
    const en = await browserAs(browser, w, SALMA, { lang: 'en' });
    await en.page.goto(w.p.url + path);
    await pressButton(en.page);
    assert.equal((await en.page.locator('#done-state [role="status"]').innerText()).trim(), 'Marked as done.');
    await uxShot(en.page, 'UX-27-phone-en-done');
    await en.page.goto(w.p.url + path + '?marked=not-done');
    assert.equal(await en.page.locator('#done-state [role="status"]').count(), 0, '?marked=not-done on a done lesson: no status line');
    await en.ctx.close();

    // Script off: the same press, the same focus.
    const off = await browserAs(browser, w, SALMA, { lang: 'ar', script: false });
    await off.page.goto(w.p.url + lessonPath(s, s.lessons['Adding fractions']));
    await pressButton(off.page);
    assert.equal(await off.page.evaluate(() => document.activeElement?.id), 'done-state', 'script off: focus is on #done-state after the press');
    assert.equal((await off.page.locator('#done-state [role="status"]').innerText()).trim(), word('ar', 'markedDone'));
    await pressButton(off.page);
    assert.equal(await off.page.evaluate(() => document.activeElement?.id), 'done-state', 'script off: focus is on #done-state after the undo');
    await off.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-30 ----

describe('UX-30 marking states and errors', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  const state = async (page: Page) => ({
    status: (await page.locator('#done-state [role="status"]').count()) ? (await page.locator('#done-state [role="status"]').innerText()).trim() : null,
    now: (await page.locator('#done-state .done-now').count()) ? (await page.locator('#done-state .done-now').innerText()).replace(/\s+/g, ' ').trim() : null,
    button: (await page.locator('#done-control button').innerText()).trim(),
  });

  it('UX-30 not done, done, just marked, just undone, failed save, refused, and no block for an admin or publisher; screenshots', async () => {
    const s = w.school;
    const path = lessonPath(s, s.lessons['Adding fractions']);
    for (const lang of LANGS) {
      const t = (k: Parameters<typeof word>[1]) => word(lang, k);
      const { ctx, page } = await browserAs(browser, w, SALMA, { lang });
      await page.goto(w.p.url + path);
      assert.deepEqual(await state(page), { status: null, now: null, button: t('markDone') }, `${lang}: not done`);
      await pressButton(page);
      assert.deepEqual(await state(page), { status: t('markedDone'), now: `✓ ${t('doneTag')}`, button: t('markNotDone') }, `${lang}: just marked`);
      await page.goto(w.p.url + path);
      assert.deepEqual(await state(page), { status: null, now: `✓ ${t('doneTag')}`, button: t('markNotDone') }, `${lang}: done`);
      await pressButton(page);
      assert.deepEqual(await state(page), { status: t('markedNotDone'), now: null, button: t('markDone') }, `${lang}: just undone`);
      // A failed save, forced by a test hook that makes the write fail (as AT-15i does): the state is unchanged, the button still there.
      w.p.faults!.set({ before: (sql) => { if (namesDone(sql) && WRITE.test(sql)) throw new Error('forced'); } });
      await pressButton(page);
      w.p.faults!.set({});
      assert.deepEqual(await state(page), { status: t('markFailed'), now: null, button: t('markDone') }, `${lang}: failed save`);
      assert.equal(await page.locator('#done-state [role="status"]').getAttribute('class'), 'error', `${lang}: the failed save reads as an error`);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'done-state', `${lang}: focus on the block after the failed save`);
      assert.deepEqual(await marks(w), [], `${lang}: nothing stored`);
      await uxShot(page, `UX-30-phone-${lang}-failed`);
      await ctx.close();
    }

    // Refused: today's page for that person and lesson, unchanged.
    const salma = await as(w, SALMA, 'en');
    const physics = String((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${s.physics}'`))[0].id);
    for (const [what, id, status] of [['unpublished subject', physics, 403], ['removed lesson', s.lessons['Old decimals'], 404]] as const) {
      const read = await salma.get(lessonPath(s, id));
      const pressed = await press(salma, s, id, 'done');
      assert.equal(pressed.status, status, `${what}: ${status}`);
      assert.equal(read.status, status, `${what}: the reading page answers the same`);
      assert.equal(await pressed.text(), await read.text(), `${what}: today's refusal page, unchanged`);
    }
    // An admin or publisher reading a lesson not assigned to them as a learner: no done block at all.
    for (const [who, c] of [['admin', w.admin], ['publisher', await as(w, HADEER, 'en')]] as const) {
      const res = await c.get(path);
      assert.equal(res.status, 200, `${who} reads the lesson`);
      assert.ok(!(await res.text()).includes('done-state'), `${who}: no done block`);
    }
  });
});

// ------------------------------------------------------------------- UX-31 ----

describe('UX-31 done block inert in preview, no ticks or progress', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('UX-31 the preview lesson draws "Mark as done" inert (focusable, described, no form), does nothing when pressed, and shows no tick, tag or progress; screenshot', async () => {
    const s = w.school;
    await salmaTwoMarks(w);
    await withTwoRoles(w);
    // Amal's own mark of the lesson she previews changes nothing in the preview.
    assert.equal((await press(await as(w, ADMIN, 'en'), s, s.lessons['Adding fractions'], 'done')).status, 303);
    for (const lang of LANGS) {
      const { ctx, page } = await browserAs(browser, w, ADMIN, { lang });
      const path = previewLesson(s, s.lessons['Adding fractions'], 'home');
      await page.goto(w.p.url + path);
      const facts = await page.locator('#done-control').evaluate((e) => ({
        tag: e.tagName.toLowerCase(), type: e.getAttribute('type'), disabled: e.getAttribute('aria-disabled'), describedby: e.getAttribute('aria-describedby'),
        form: Boolean(e.closest('form')) || Boolean(document.querySelector('#done-state form')), text: (e as HTMLElement).innerText.trim(),
      }));
      assert.deepEqual(facts, { tag: 'button', type: 'button', disabled: 'true', describedby: 'preview-reason', form: false, text: word(lang, 'markDone') }, `${lang}: inert "Mark as done"`);
      assert.equal((await page.locator('#preview-reason').innerText()).trim(), word(lang, 'previewInert'), `${lang}: the reason sentence it points at`);
      assert.equal(await page.locator('[data-done], #done-tag, #done-status, #done-progress').count(), 0, `${lang}: no tick, tag, status or progress`);
      const sent: string[] = [];
      page.on('request', (r) => sent.push(`${r.method()} ${r.url()}`));
      const before = await page.evaluate(() => document.body.innerHTML);
      const control = page.locator('#done-control');
      await control.focus();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'done-control', `${lang}: focusable`);
      await control.click({ force: true });
      await control.focus();
      await page.keyboard.press('Enter');
      await control.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
      assert.deepEqual(sent, [], `${lang}: nothing is sent`);
      assert.ok(page.url().endsWith(path), `${lang}: still on the same page`);
      assert.equal(await page.evaluate(() => document.body.innerHTML), before, `${lang}: the page is unchanged`);
      if (lang === 'ar') {
        // Unfocused, so the shot shows the inert controls' dashed outline (UX-19), not the focus ring.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await uxShot(page, 'UX-31-phone-ar-preview-lesson');
      }
      await ctx.close();
    }
    assert.equal((await marks(w)).length, 3, 'the marks are as they were');
  });
});
