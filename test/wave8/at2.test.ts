// LMS wave 8, W8-1b (product-contract v2 on PIL-299, AT-2; sections 3.1 and
// 3.3, D1 to D7): the moment of opening, as Salma Test (and Mona Test, her
// guardian) meet it in world W8-a (test/wave8/world.ts), Open in order off.
// Ch2 (shown locked) and Ch5 (shown locked, empty) open at 00:00 UTC on
// 2026-12-10, Ch3 (hidden; Salma marked and opened its lesson before it was
// dated, D6) at 00:00 UTC on 2026-12-17. One describe per labelled
// expectation, each its own CI step (`W8 AT-2.<n> ...`), each on a fresh world
// with the clock pinned (W6-c). Strings are asserted by ui.ts key.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MADE_UP, normalise } from './n1.ts';
import { AT8, ID, MARKER, MONA, OMAR, SALMA, textOf, w8World, words8, type W8World } from './world.ts';
import {
  S, cardOf, continueOf, counterOf, donePath, filePath, got, lessonLinks, lessonPath, marksOf, opensOf, outlineOf, subjectPath, todoIds, todoPath, shown,
} from './learner.ts';
import type { Client } from '../support/http.ts';

const EN = words8('school', 'en');
const D16END = Date.parse('2026-12-16T23:59:59.999Z');
const CH2_LESSONS = [ID.l21, ID.l22];
const at = (ms: number) => new Date(ms).toISOString();

/** A response normalised by N1 (status, headers, body), with an id replaced when given. */
async function n1(res: Response, id?: string): Promise<string> {
  const raw = Buffer.from(await res.arrayBuffer());
  const { headers, body } = normalise(res, raw, id);
  return JSON.stringify({ status: res.status, headers, body: createHash('sha256').update(body).digest('hex'), bytes: body.length });
}

/** Salma's view of one request, N1-normalised, in one world. */
async function view(c: Client, method: 'GET' | 'POST', path: string, fields?: Record<string, string>, id?: string): Promise<string> {
  return n1(method === 'GET' ? await c.get(path) : await c.post(path, fields ?? {}), id);
}

// ------------------------------------------------------------------ AT-2.1 ----
describe('W8 AT-2.1 at 2026-12-09T23:59:59.999Z Salma meets the shown-locked column for Ch2 and Ch5 and the hidden column for Ch3, row by row; no open recorded for a Ch2 or Ch3 address', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ atMs: AT8.d9end });
  });
  after(async () => w?.close());

  it('W8 AT-2.1 outline, lesson page, file, done, home card, counter and links, to-do: each row of section 3.3', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9end)}`);
    const c = await w.as(SALMA, 'en');
    const opensBefore = opensOf(w, SALMA.id);
    const marksBefore = marksOf(w, SALMA.id);
    // Outline: Ch2 and Ch5 locked with the tag and "Opens on 2026-12-10."; Ch2's lessons listed without links; Ch3 absent.
    const outline = await got(c, subjectPath());
    assert.equal(outline.status, 200);
    const chapters = outlineOf(outline.html);
    assert.deepEqual(chapters.map((ch) => ch.id), [ID.ch1, ID.ch2, ID.ch4, ID.ch5], 'outline: Ch3 is absent (no heading, gap or count)');
    for (const id of [ID.ch2, ID.ch5]) {
      const ch = chapters.find((x) => x.id === id)!;
      assert.ok(ch.locked && ch.tag, `outline ${id}: the "Locked" tag`);
      assert.deepEqual(ch.reasons, [{ kind: 'date', text: EN('openedOn', { date: shown('2026-12-10') }) }], `outline ${id}: the date line only (Open in order off)`);
    }
    assert.deepEqual(chapters.find((x) => x.id === ID.ch2)!.lessons, CH2_LESSONS.map((id) => ({ id, link: false })), 'outline: Ch2\'s lessons listed without links');
    for (const id of [ID.ch1, ID.ch4]) assert.ok(!chapters.find((x) => x.id === id)!.locked, `outline ${id}: open`);
    assert.ok(!outline.html.includes(ID.ch3) && !outline.html.includes(MARKER) && !outline.html.includes(ID.l31), 'outline: nothing of Ch3');
    // Lesson page: Ch2's is the locked page with the date reason, no material, no done block; Ch3's is a made-up id's.
    for (const id of CH2_LESSONS) {
      const page = await got(c, lessonPath(id));
      assert.equal(page.status, 200, `lesson ${id}: the locked page (200)`);
      assert.match(page.html, /<section id="locked-lesson"/, `lesson ${id}: the locked page`);
      assert.equal(textOf(/<p id="lock-reason"[^>]*>([\s\S]*?)<\/p>/.exec(page.html)?.[1] ?? ''), EN('openedOn', { date: shown('2026-12-10') }), `lesson ${id}: the reason "Opens on 2026-12-10."`);
      assert.ok(!/id="items"|id="done-state"|id="done-control"|\/file\//.test(page.html), `lesson ${id}: no material, file link or done block`);
    }
    const hidden = await view(c, 'GET', lessonPath(ID.l31), undefined, ID.l31);
    assert.equal(hidden, await view(c, 'GET', lessonPath(MADE_UP.lesson), undefined, MADE_UP.lesson), 'lesson of Ch3: identical (N1) to a made-up id');
    // File: refused as wave 4 refuses a locked lesson's file (403, no bytes).
    const file = await c.get(filePath());
    assert.equal(file.status, 403, 'Ch2\'s PDF: refused');
    assert.ok(!(file.headers.get('content-type') ?? '').includes('pdf'), 'no bytes of the file');
    // Done / not done: refused, nothing stored (Ch2 as a locked lesson, Ch3 as a lesson that does not exist).
    for (const [id, state] of [[ID.l21, 'done'], [ID.l22, 'done'], [ID.l31, 'done'], [ID.l31, 'not-done']] as const) {
      const res = await c.post(donePath(id), { state });
      assert.equal(res.status, 403, `POST ${state} on ${id}: refused`);
    }
    assert.equal(await view(c, 'POST', donePath(ID.l31), { state: 'not-done' }, ID.l31), await view(c, 'POST', donePath(MADE_UP.lesson), { state: 'not-done' }, MADE_UP.lesson), 'POST on Ch3: identical (N1) to a made-up id');
    assert.deepEqual(marksOf(w, SALMA.id), marksBefore, 'no done mark stored or deleted');
    // Home card: Ch2's lessons count (6 = 7 less Ch3's one); Start never leads into Ch2.
    const home = await got(c, S);
    const card = cardOf(home.html);
    assert.equal(card.count, EN('lessonCount', { n: '6' }), 'home: 6 lessons (Ch2 counted, Ch3 not, Salma\'s Ch3 mark not counted)');
    for (const id of [...CH2_LESSONS, ID.l31]) assert.ok(!lessonLinks(home.html).includes(id), `home: no link to ${id}`);
    assert.deepEqual(card.links, [ID.l11], 'home: Start leads to Ch1\'s first lesson');
    // Counter and links: Ch2 counted (k / 6), Ch3 skipped; Next from Ch1's last lesson is wave 4's locked block, not a link.
    const l12 = await got(c, lessonPath(ID.l12));
    assert.deepEqual(counterOf(l12.html), { k: 2, n: 6 }, 'counter on Ch1\'s second lesson: 2 / 6');
    assert.match(l12.html, /<div id="next-locked" class="next-locked">/, 'Next into Ch2: the locked block');
    assert.ok(!lessonLinks(l12.html).includes(ID.l21), 'no link into Ch2 from the lesson page\'s Next');
    const l41 = await got(c, lessonPath(ID.l41));
    assert.deepEqual(counterOf(l41.html), { k: 5, n: 6 }, 'counter on Ch4\'s first lesson: 5 / 6 (Ch2 counted, Ch3 skipped)');
    assert.ok(!l41.html.includes(ID.l31) && !l41.html.includes(MARKER), 'no link into Ch3');
    // To-do: Ch2's lesson due 2026-12-08 is not listed before day X.
    assert.ok(!Object.values(todoIds((await got(c, todoPath)).html)).flat().includes(ID.l21), 'to-do: Ch2\'s item is not listed');
    // No open recorded for any Ch2 or Ch3 address.
    assert.deepEqual(opensOf(w, SALMA.id).filter((r) => [ID.l21, ID.l22, ID.l31].some((id) => r.startsWith(id))), opensBefore.filter((r) => r.startsWith(ID.l31)), 'no open recorded for Ch2 or Ch3 (Ch3\'s old record unchanged)');
    t.diagnostic(`AT-2.1 outline ${chapters.map((ch) => `${ch.id.slice(-1)}${ch.locked ? ':locked' : ''}`).join(' ')}; card "${card.count}"; counters 2/6 and 5/6`);
  });
});

// ------------------------------------------------------------------ AT-2.2 ----
describe('W8 AT-2.2 at 2026-12-10T00:00:00.000Z Ch2 and Ch5 are open; Ch2\'s pages, files, done marks and home counts are identical (N1) to W8-0 at the same instant', { concurrency: false }, () => {
  // In-process products share one clock: every world here is pinned at the same instant.
  let a: W8World;
  let zero: W8World;
  let undated: W8World;
  before(async () => {
    a = await w8World({ atMs: AT8.d10 });
    zero = await w8World({ dates: false, atMs: AT8.d10 });
    // D3 exactly: W8-a with no date on Ch2 and Ch5 (Ch3 keeps its date, still hidden on 2026-12-10).
    undated = await w8World({ atMs: AT8.d10 });
    undated.run('UPDATE chapter SET opens_on = NULL, opens_hidden = 0 WHERE id IN (?, ?)', ID.ch2, ID.ch5);
  });
  after(async () => {
    await a?.close();
    await zero?.close();
    await undated?.close();
  });

  const CH2_REQUESTS = [
    ['GET', subjectPath()], ['GET', lessonPath(ID.l21)], ['GET', lessonPath(ID.l22)], ['GET', filePath()],
    ['POST', donePath(ID.l21), { state: 'done' }], ['GET', `${lessonPath(ID.l21)}?marked=done`], ['GET', S],
    ['POST', donePath(ID.l21), { state: 'not-done' }], ['POST', donePath(ID.l22), { state: 'done' }], ['GET', S],
  ] as ['GET' | 'POST', string, Record<string, string>?][];

  it('W8 AT-2.2 D3: every Ch2 page, file, done mark and the home are byte for byte (N1) those of the same world without Ch2\'s and Ch5\'s dates', async (t) => {
    t.diagnostic(`instant ${at(AT8.d10)}`);
    const ca = await a.as(SALMA, 'en');
    const cu = await undated.as(SALMA, 'en');
    const chapters = outlineOf((await got(ca, subjectPath())).html);
    for (const id of [ID.ch2, ID.ch5]) assert.ok(!chapters.find((x) => x.id === id)!.locked, `outline ${id}: open, no tag, no date`);
    for (const [method, path, fields] of CH2_REQUESTS) assert.equal(await view(ca, method, path, fields), await view(cu, method, path, fields), `${method} ${path}: identical (N1) to the world without Ch2's and Ch5's dates`);
    assert.deepEqual(marksOf(a, SALMA.id), marksOf(undated, SALMA.id), 'the same done marks stored');
  });

  it('W8 AT-2.2 against W8-0: the Ch2 and Ch5 outline blocks, the PDF and every done press are identical (N1); a Ch2 lesson page differs only in the counter\'s total (Ch3 still hidden: 6, not 7); the card counts Ch2 as W8-0 does', async (t) => {
    t.diagnostic(`instant ${at(AT8.d10)}`);
    const ca = await a.as(SALMA, 'en');
    const cz = await zero.as(SALMA, 'en');
    for (const [method, path, fields] of [['GET', filePath()], ['POST', donePath(ID.l21), { state: 'done' }], ['POST', donePath(ID.l21), { state: 'not-done' }], ['POST', donePath(ID.l22), { state: 'done' }]] as ['GET' | 'POST', string, Record<string, string>?][]) {
      assert.equal(await view(ca, method, path, fields), await view(cz, method, path, fields), `${method} ${path}: identical (N1) to W8-0`);
    }
    // The same marks on Ch2 in both worlds now: the two chapter blocks of the outline.
    const block = (html: string, id: string) => outlineOf(html).find((x) => x.id === id)!.html;
    for (const id of [ID.ch2, ID.ch5]) {
      assert.equal(block((await got(ca, subjectPath())).html, id), block((await got(cz, subjectPath())).html, id), `outline ${id}: the chapter's block equals W8-0's`);
    }
    assert.deepEqual(marksOf(a, SALMA.id).filter((id) => CH2_LESSONS.includes(id)), [ID.l22], 'the done marks on Ch2 are stored as in W8-0');
    assert.deepEqual(marksOf(zero, SALMA.id).filter((id) => CH2_LESSONS.includes(id)), [ID.l22]);
    const pa = await got(ca, lessonPath(ID.l21));
    const pz = await got(cz, lessonPath(ID.l21));
    assert.deepEqual([counterOf(pa.html), counterOf(pz.html)], [{ k: 3, n: 6 }, { k: 3, n: 7 }], 'the counter: 3 / 6 (Ch3 hidden) and 3 / 7');
    const total = (html: string) => html.replace(/(<p id="lesson-place" class="muted">[\s\S]*?\d+ \/ )\d+/, '$1n');
    assert.equal(total(pa.html), total(pz.html), 'the Ch2 lesson page equals W8-0\'s but for the counter\'s total');
    const ha = cardOf((await got(ca, S)).html);
    const hz = cardOf((await got(cz, S)).html);
    assert.equal(hz.count.replace(/\s+/g, ' '), textOf(EN('doneProgress', { n: '2', count: EN('doneCount', { n: '7' }), total: '7' })), 'W8-0: Done 2 of 7 (the Ch2 mark and the Ch3 mark)');
    assert.equal(ha.count.replace(/\s+/g, ' '), textOf(EN('doneProgress', { n: '1', count: EN('doneCount', { n: '6' }), total: '6' })), 'W8-a: Done 1 of 6: Ch2 counted as in W8-0, less Ch3 (one lesson, one mark) still hidden');
    t.diagnostic(`AT-2.2 W8-a card "${ha.count}", W8-0 card "${hz.count}"`);
  });
});

// ------------------------------------------------------------------ AT-2.3 ----
describe('W8 AT-2.3 Ch3 behaves the same at 2026-12-16T23:59:59.999Z (hidden) and 2026-12-17T00:00:00.000Z (open, identical to W8-0)', { concurrency: false }, () => {
  let a: W8World;
  let zero: W8World;
  before(async () => {
    // In-process products share one clock: both start at the last instant before, and move together.
    a = await w8World({ atMs: D16END });
    zero = await w8World({ dates: false, atMs: D16END });
  });
  after(async () => {
    await a?.close();
    await zero?.close();
  });

  it('W8 AT-2.3 the last instant before: absent, made-up id, not counted; the first instant of the day: present and every Ch3 response equals W8-0\'s', async (t) => {
    t.diagnostic(`instant ${at(D16END)}`);
    const c = await a.as(SALMA, 'en');
    assert.ok(!outlineOf((await got(c, subjectPath())).html).some((ch) => ch.id === ID.ch3), 'before: Ch3 absent from the outline');
    assert.equal(await view(c, 'GET', lessonPath(ID.l31), undefined, ID.l31), await view(c, 'GET', lessonPath(MADE_UP.lesson), undefined, MADE_UP.lesson), 'before: Ch3\'s lesson is a made-up id');
    assert.equal(cardOf((await got(c, S)).html).count, EN('lessonCount', { n: '6' }), 'before: 6 lessons');
    await a.clock(AT8.d17);
    t.diagnostic(`instant ${at(AT8.d17)}`);
    // Fresh browsers on both sides (the notice cookie of the visits before would fold the notice on one side only).
    const ca = await a.as(SALMA, 'en');
    const cz = await zero.as(SALMA, 'en');
    const ch3 = outlineOf((await got(ca, subjectPath())).html).find((ch) => ch.id === ID.ch3);
    assert.ok(ch3 && !ch3.locked, 'from 00:00 UTC: Ch3 is in the outline, open');
    await got(cz, subjectPath());
    for (const [method, path, fields] of [['GET', subjectPath()], ['GET', lessonPath(ID.l31)], ['GET', S], ['POST', donePath(ID.l31), { state: 'done' }], ['GET', lessonPath(ID.l42)]] as ['GET' | 'POST', string, Record<string, string>?][]) {
      assert.equal(await view(ca, method, path, fields), await view(cz, method, path, fields), `from 00:00 UTC: ${method} ${path} identical (N1) to W8-0`);
    }
  });
});

// ------------------------------------------------------------------ AT-2.4 ----
describe('W8 AT-2.4 before day X Ch3\'s lesson and file addresses are identical (N1) to a made-up id\'s, and POST done on a Ch2 or Ch3 lesson stores nothing', { concurrency: false }, () => {
  let w: W8World;
  const CH3_FILE = 'w8-file-0000-0000-0000-000000000003';
  before(async () => {
    w = await w8World({ atMs: AT8.d9 });
    // A file in Ch3's lesson (this world only), so its address can be compared.
    const key = `spaces/${ID.space}/files/${CH3_FILE}`;
    await w.p.worker.files.put(key, new TextEncoder().encode('%PDF-1.4\n%%EOF\n'), { httpMetadata: { contentType: 'application/pdf' } });
    w.run('INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, url, note_text, position) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1)', CH3_FILE, ID.space, ID.l31, 'pdf', `Revision sheet ${MARKER}`, key);
  });
  after(async () => w?.close());

  it('W8 AT-2.4 lesson, file and done addresses of Ch3 equal a made-up id\'s for Salma and Omar; done and not-done on Ch2 and Ch3 store nothing', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    for (const who of [SALMA, OMAR]) {
      const c = await w.as(who, 'en');
      assert.equal(await view(c, 'GET', lessonPath(ID.l31), undefined, ID.l31), await view(c, 'GET', lessonPath(MADE_UP.lesson), undefined, MADE_UP.lesson), `${who.key}: Ch3's lesson = a made-up lesson id`);
      assert.equal(await view(c, 'GET', filePath(CH3_FILE), undefined, CH3_FILE), await view(c, 'GET', filePath(MADE_UP.file), undefined, MADE_UP.file), `${who.key}: Ch3's file = a made-up file id`);
      const before = JSON.stringify(w.sql('SELECT * FROM done_mark ORDER BY learner_user_id, lesson_id'));
      for (const id of [ID.l21, ID.l22, ID.l31]) {
        for (const state of ['done', 'not-done']) {
          const res = await c.post(donePath(id), { state });
          assert.equal(res.status, 403, `${who.key}: POST ${state} on ${id} refused`);
        }
      }
      assert.equal(JSON.stringify(w.sql('SELECT * FROM done_mark ORDER BY learner_user_id, lesson_id')), before, `${who.key}: nothing stored or deleted`);
    }
  });
});

// ------------------------------------------------------------------ AT-2.5 ----
describe('W8 AT-2.5 at 2026-12-10T00:00:00.000Z the Ch2 lesson due 2026-12-08 is in Salma\'s to-do (overdue) and in Mona\'s guardian block (D7); at 2026-12-09T23:59:59.999Z in neither', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ atMs: AT8.d9end });
  });
  after(async () => w?.close());

  it('W8 AT-2.5 the last instant before and the first instant of 2026-12-10', async (t) => {
    const salma = await w.as(SALMA, 'en');
    const mona = await w.as(MONA, 'en');
    const guardianHas = async () => {
      const page = (await got(mona, `${S}/linked/${SALMA.id}`)).html;
      const block = /<section id="guardian-todo"[\s\S]*?<\/section>\s*(?=<section|<h2|$)/.exec(page)?.[0] ?? '';
      const overdue = /<section class="todo-group" id="guardian-todo-overdue">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';
      return { any: page.includes('Halves and quarters'), overdue: overdue.includes('Halves and quarters'), block };
    };
    t.diagnostic(`instant ${at(AT8.d9end)}`);
    assert.ok(!Object.values(todoIds((await got(salma, todoPath)).html)).flat().includes(ID.l21), 'before: not in Salma\'s to-do');
    assert.equal((await guardianHas()).any, false, 'before: not in Mona\'s block');
    await w.clock(AT8.d10);
    t.diagnostic(`instant ${at(AT8.d10)}`);
    assert.ok((todoIds((await got(salma, todoPath)).html).overdue ?? []).includes(ID.l21), 'from 00:00 UTC: in Salma\'s overdue group');
    assert.equal((await guardianHas()).overdue, true, 'from 00:00 UTC: in Mona\'s guardian block, overdue group');
  });
});

// ------------------------------------------------------------------ AT-2.6 ----
describe('W8 AT-2.6 before 2026-12-17 the card counts 6 lessons without Salma\'s Ch3 mark and the counter reads k / 6; from 2026-12-17, 7 lessons with the mark counted and k / 7 (D6, marks kept)', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ atMs: AT8.d10 });
  });
  after(async () => w?.close());

  it('W8 AT-2.6 the card, Continue and the counter at 2026-12-10, 2026-12-16 23:59:59.999 and 2026-12-17', async (t) => {
    const c = await w.as(SALMA, 'en');
    assert.equal((await c.post(donePath(ID.l11), { state: 'done' })).status, 303, 'Salma marks Ch1\'s first lesson');
    for (const ms of [AT8.d10, D16END]) {
      await w.clock(ms);
      t.diagnostic(`instant ${at(ms)}`);
      const home = await got(c, S);
      assert.equal(cardOf(home.html).count.replace(/\s+/g, ' '), textOf(EN('doneProgress', { n: '1', count: EN('doneCount', { n: '6' }), total: '6' })), `${at(ms)}: Done 1 of 6 (the Ch3 mark not counted)`);
      assert.ok(!continueOf(home.html).links.includes(ID.l31), `${at(ms)}: Continue does not lead into Ch3`);
      assert.deepEqual(counterOf((await got(c, lessonPath(ID.l42))).html), { k: 6, n: 6 }, `${at(ms)}: Ch4's last lesson is 6 / 6`);
    }
    await w.clock(AT8.d17);
    t.diagnostic(`instant ${at(AT8.d17)}`);
    const home = await got(c, S);
    assert.equal(cardOf(home.html).count.replace(/\s+/g, ' '), textOf(EN('doneProgress', { n: '2', count: EN('doneCount', { n: '7' }), total: '7' })), 'from 2026-12-17: Done 2 of 7 (the kept Ch3 mark counts again)');
    assert.deepEqual(counterOf((await got(c, lessonPath(ID.l42))).html), { k: 7, n: 7 }, 'from 2026-12-17: Ch4\'s last lesson is 7 / 7');
    assert.deepEqual(counterOf((await got(c, lessonPath(ID.l31))).html), { k: 5, n: 7 }, 'from 2026-12-17: Ch3\'s lesson is 5 / 7');
    assert.ok(marksOf(w, SALMA.id).includes(ID.l31), 'the Ch3 mark was kept throughout');
  });
});
