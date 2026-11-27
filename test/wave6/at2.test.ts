// LMS wave 6, W6-1b (product-contract v2 on PIL-257, AT-2): the learner's
// to-do list on their home, built from their own done marks (W6-a and W6-b,
// Arabic and English). One describe per labelled expectation, each its own CI
// step (`W6 AT-2.<n> ...`, selected with --test-name-pattern), each on a fresh
// world with the clock pinned (W6-c); every step prints the instant it uses.
// Strings are asserted by ui.ts key (ux-plan UX-64). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AT, D, HADEER, KARIM5, OMAR, RANA5, SALMA, YARA6, as, clockAt, closeWave6, dPlus, home, lessonPath, press, subjectPath, wave6World, withW5a, withW6b, words,
  type W6a, type W6b, type Wave1World,
} from './world.ts';
import { dueLinesOf, expectedItems, idsIn, listed, rowLine, sameItems, shape, todoOf, todoPath, type TodoView } from './todo.ts';
import * as w8 from '../wave8/world.ts';
import { chapterLocks, previewTodo, shownChapters } from '../../src/learning.ts';
import { TODO_MAX_PER_GROUP, todoGroups, todoWindow } from '../../src/due.ts';
import { showDate } from '../../src/format.ts';

type Lang = 'ar' | 'en';
const W = (lang: Lang, kit: 'school' | 'company' | 'university' = 'school') => words(kit, lang);
const LAST = dPlus(7);

/** The home of a client, as HTML (expects 200). */
async function homeHtml(c: { get(p: string): Promise<Response> }, s: { id: string }): Promise<string> {
  const res = await c.get(home(s));
  assert.equal(res.status, 200, 'the home answers 200');
  return res.text();
}

/** The learner's to-do page, as HTML (expects 200). LMS redesign R1a (UX-34/UX-54/UX-62 rows): wave 6's block moved here from the home. */
async function todoHtml(c: { get(p: string): Promise<Response> }, s: { id: string }): Promise<string> {
  const res = await c.get(todoPath(s));
  assert.equal(res.status, 200, 'the to-do page answers 200');
  return res.text();
}

/** The subjects of the home's cards (data-subject of #my-list). */
const cardSubjects = (html: string) => new Set([...html.matchAll(/<li class="card subj" data-subject="([^"]+)"/g)].map((m) => m[1]));

/** The to-do block's subjects are a subset of the cards (AT-2.5); R1a: the cards of the home, the block of the to-do page. */
function subsetOfCards(homeDoc: string, todoDoc: string, what: string): void {
  const cards = cardSubjects(homeDoc);
  for (const g of todoOf(todoDoc)?.groups ?? []) for (const i of g.items) assert.ok(cards.has(i.subject), `${what}: ${i.id}'s subject is on a card of the home`);
  // The home's due strip lists only items of those subjects too.
  for (const m of homeDoc.matchAll(/<li class="strip-row"[^>]*data-subject="([^"]+)"/g)) assert.ok(cards.has(m[1]), `${what}: the strip's ${m[1]} is on a card of the same page`);
}

/** Where the home's due strip (#todo) sits: after Continue, before the cards (UX-34 row). */
function stripPlace(doc: string, what: string): void {
  const at = doc.indexOf('<section id="todo" class="strip"');
  assert.ok(at > 0, `${what}: the home has the due strip`);
  assert.ok(doc.indexOf('id="continue"') >= 0 && doc.indexOf('id="continue"') < at, `${what}: after Continue where you stopped`);
  assert.ok(at < doc.indexOf('id="my-list"'), `${what}: before the subject cards`);
}

/** The heading of a group as ui.ts gives it. */
const heading = (t: ReturnType<typeof W>, key: 'overdue' | 'today' | 'next', n: number) =>
  t(key === 'overdue' ? 'todoOverdue' : key === 'today' ? 'todoToday' : 'todoNext7', { n: String(n), days: '7' });

/** A chapter item's done count, wave 2's words (doneLine). */
const doneCount = (t: ReturnType<typeof W>, n: number, total: number) => t('doneProgress', { n: String(n), count: t('doneCount', { n: String(total) }), total: String(total) });

// ------------------------------------------------------------------ AT-2.1 ----
describe('W6 AT-2.1 groups: the to-do block after Continue and before the cards, overdue, today and next 7 days with counts, the fold, the order, the item lines and links', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.1 Salma with no done marks, in Arabic and English: groups, counts, order, fold, lines and links; L5, L6, C3 and the removed L7 in no group', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const tt = W(lang);
      const c = await as(w, SALMA, lang);
      stripPlace(await homeHtml(c, s), lang);
      const v = todoOf(await todoHtml(c, s));
      assert.ok(v, `${lang}: the to-do block`);
      assert.equal(v.heading, tt('todoTitle'), `${lang}: todoTitle`);
      assert.deepEqual(v.groups.map((g) => g.key), ['overdue', 'today', 'next'], `${lang}: the groups in order`);
      // Today also holds G1 (Arabic grammar, due D): W6-a's own item of a subject Salma reads; Arabic grammar comes before Mathematics by title.
      const expected = { overdue: [a.L.L1], today: [a.G1, a.L.L2], next: [a.L.L3, a.C2, a.L.L8, a.L.L9, a.L.L4] };
      for (const g of v.groups) {
        assert.deepEqual(g.items.map((i) => i.id), expected[g.key], `${lang} ${g.key}: the items in order (due date, subject title, outline order)`);
        assert.equal(g.heading, heading(tt, g.key, expected[g.key].length), `${lang} ${g.key}: its heading with the full count`);
      }
      const next = v.groups[2];
      assert.deepEqual(next.items.map((i) => i.folded), [false, false, false, true, true], `${lang}: the first 3 shown, L9 and L4 in the fold`);
      assert.equal(next.more, tt('todoMore', { n: '2' }), `${lang}: todoMore (2)`);
      assert.equal(next.moreOpen, false, `${lang}: the fold is closed by default`);
      assert.equal(v.groups[0].more, null, `${lang}: no fold in a group of 1`);
      assert.ok(v.groups.every((g) => g.capped === null), `${lang}: no todoCapped (no group over 10)`);
      for (const out of [a.L.L5, a.L.L6, a.C3, a.L.L7]) assert.ok(!listed(v).has(out), `${lang}: ${out} is in no group`);
      // Each item: the title link, then todoItemLine; a lesson links to its page, a chapter to the outline with it open.
      const titles: Record<string, string> = Object.fromEntries((await w.p.sql(`SELECT id, title FROM lesson WHERE space_id = '${s.id}' UNION ALL SELECT id, title FROM chapter WHERE space_id = '${s.id}'`)).map((r) => [String(r.id), String(r.title)]));
      for (const g of v.groups) {
        for (const i of g.items) {
          const subjectTitle = i.id === a.G1 ? 'Arabic grammar' : 'Mathematics';
          assert.equal(i.title, titles[i.id], `${lang} ${i.id}: the title`);
          // LMS redesign R1a (UX-62/UX-63 rows, UX-16a row): the line ends with the group's S6 tag, its day S4's, in a <time> with the ISO day.
          const due = String(a.dates[Object.entries({ ...a.L, C2: a.C2, C3: a.C3, G1: a.G1 }).find(([, id]) => id === i.id)![0]]);
          assert.equal(i.line, rowLine(tt, lang, i.kind, subjectTitle, g.key, due, D), `${lang} ${i.id}: the line and its tag`);
          assert.match(i.raw, new RegExp(`<span class="tag ${{ overdue: 'late', today: 'today', next: 'due' }[g.key]}">`), `${lang} ${i.id}: the ${g.key} tag`);
          if (g.key !== 'today') assert.ok(i.raw.includes(`<time datetime="${due}">`), `${lang} ${i.id}: the ISO day in <time>`);
          assert.doesNotMatch(i.raw, /[٠-٩۰-۹]/, `${lang} ${i.id}: Western digits only`);
          if (i.kind === 'lesson') {
            assert.equal(i.href, lessonPath(s, i.id), `${lang} ${i.id}: links to its lesson page`);
            assert.equal(i.progress, null, `${lang} ${i.id}: a lesson has no done count`);
          } else {
            assert.equal(i.href, `/s/${s.id}/learn/${s.math}?open=${i.id}#chapter-${i.id}`, `${lang} ${i.id}: links to the outline with that chapter open`);
            // Wave 2's done count follows wave 2's rule: no line before the first mark (the outline's and the card's too),
            // so a learner with no marks, and the preview (W2 AT-2.4: never a progress line), show none; AT-2.2 shows 1 of 2.
            assert.equal(i.progress, null, `${lang} ${i.id}: wave 2's done count, not drawn at 0 of 2`);
          }
        }
      }
      // Following the chapter link shows details#chapter-<C2> with open.
      const chapter = v.groups[2].items.find((i) => i.kind === 'chapter')!;
      const page = await (await c.get(chapter.href.split('#')[0])).text();
      assert.match(page, new RegExp(`<details class="card fold[^"]*" id="chapter-${a.C2}"[^>]* open>`), `${lang}: the chapter link opens details#chapter-${a.C2}`);
    }
  });
});

// ------------------------------------------------------------------ AT-2.2 ----
describe('W6 AT-2.2 done empties it: marked items leave, a chapter leaves when all its shown lessons are done and returns when a lesson is added, an undo brings an item back, and an empty list has no block', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.2 Salma marks, Hadeer adds a lesson to C2, Salma undoes; at the end with every item done the home has no block', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const tt = W('en');
    const now = async () => todoOf(await todoHtml(salma, s));
    const mark = async (id: string, state: 'done' | 'not-done') => assert.equal((await press(salma, s, id, state)).status, 303, `${state} ${id}`);
    await mark(a.L.L1, 'done');
    await mark(a.L.L2, 'done');
    let v = await now();
    assert.equal(v?.groups.find((g) => g.key === 'overdue'), undefined, 'after L1 and L2: no overdue group');
    assert.deepEqual(idsIn(v, 'today'), [a.G1], 'after L1 and L2: today holds only G1 (Arabic grammar), no Mathematics item');
    await mark(a.G1, 'done');
    v = await now();
    assert.equal(v?.groups.find((g) => g.key === 'today'), undefined, 'after G1 too: no today group');
    // C2 = Fractions: Adding fractions and Comparing fractions.
    await mark(s.lessons['Adding fractions'], 'done');
    v = await now();
    const c2 = () => v?.groups.flatMap((g) => g.items).find((i) => i.id === a.C2);
    assert.equal(c2()?.progress, doneCount(tt, 1, 2), 'one of two: C2 stays, 1 of 2');
    await mark(s.lessons['Comparing fractions'], 'done');
    v = await now();
    assert.equal(c2(), undefined, 'both: C2 leaves');
    // Hadeer adds a third lesson to C2 (the editor's real form).
    const hadeer = await as(w, HADEER, 'en');
    assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${a.C2}/add`, { title: 'Fractions in a recipe' })).status, 303, 'Hadeer adds a lesson to C2');
    v = await now();
    assert.equal(c2()?.progress, doneCount(tt, 2, 3), 'C2 returns, 2 of 3');
    // An undo brings the item back.
    await mark(a.L.L1, 'not-done');
    v = await now();
    assert.deepEqual(idsIn(v, 'overdue'), [a.L.L1], 'L1 undone: back in overdue');
    // Every listed item done: no block at all, and no group word anywhere on the home.
    for (const id of [a.L.L1, a.L.L3, a.L.L8, a.L.L9, a.L.L4]) await mark(id, 'done');
    const added = String((await w.p.sql(`SELECT id FROM lesson WHERE chapter_id = '${a.C2}' AND title = 'Fractions in a recipe'`))[0].id);
    await mark(added, 'done');
    // LMS redesign R1a (UX-34/UX-62 rows, UX-98, UX-102): the to-do page keeps its heading and says «لا شيء مطلوب الآن»; the
    // home's due strip keeps its heading and says it too; no group, no fold, no row anywhere.
    for (const lang of ['en', 'ar'] as const) {
      const c = await as(w, SALMA, lang);
      const doc = await todoHtml(c, s);
      assert.equal(todoOf(doc), null, `${lang}: every group empty: no group`);
      assert.ok(doc.includes(`<p id="todo-none" class="strip-none">${W(lang)('nothingDue')}</p>`), `${lang}: the to-do page says nothingDue`);
      const home = await homeHtml(c, s);
      assert.ok(home.includes(`<p id="todo-none" class="strip-none">${W(lang)('nothingDue')}</p>`), `${lang}: the home's strip says nothingDue`);
      for (const page of [doc, home]) {
        assert.ok(!page.includes(W(lang)('todoMore', { n: '0' })), `${lang}: no todoMore`);
        assert.doesNotMatch(page.replace(/<style>[\s\S]*?<\/style>/g, ''), /todo-(item|group|more|link|line)/, `${lang}: no to-do row, group or fold (outside the inlined style)`);
      }
    }
  });
});

// ------------------------------------------------------------------ AT-2.3 ----
describe('W6 AT-2.3 day boundaries: UTC days at the four W6-c instants, one instant for every group', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.3 at 23:59:59 L2 is today; at 00:00:00 the next day L2 is overdue, L3 today and L5 enters the next 7 days; at 22:30 UTC (00:30 in Egypt) the groups equal noon\'s', async (t) => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const at = async (ms: number) => {
      t.diagnostic(`instant ${await clockAt(w, ms)}`);
      return todoOf(await todoHtml(salma, s));
    };
    const noon = await at(AT.noon);
    const late = await at(AT.lastSecond);
    assert.ok(idsIn(late, 'today').includes(a.L.L2), '23:59:59 UTC: L2 in todoToday');
    assert.deepEqual(shape(late), shape(noon), '23:59:59 UTC: the same groups as at noon');
    const next = await at(AT.nextDay);
    assert.ok(idsIn(next, 'overdue').includes(a.L.L2), '00:00:00 UTC on D+1: L2 in todoOverdue');
    assert.deepEqual(idsIn(next, 'today'), [a.L.L3], '00:00:00 UTC on D+1: L3 in todoToday');
    assert.ok(idsIn(next, 'next').includes(a.L.L5), '00:00:00 UTC on D+1: L5 (D+8) enters todoNext7');
    assert.deepEqual(idsIn(next, 'overdue'), [a.L.L1, a.G1, a.L.L2], 'overdue at D+1: L1, then G1 and L2 (D, by subject title)');
    const egypt = await at(AT.egyptNextDay);
    assert.deepEqual(shape(egypt), shape(noon), '22:30 UTC (already 11 December in Egypt): the groups equal those at 12:00 UTC');
    // One request, one instant: the to-do statement's today and last day come from the same now().
    const log: { sql: string; params: unknown[] }[] = [];
    await clockAt(w, AT.lastSecond);
    w.p.faults!.set({ seen: (sql, params) => void log.push({ sql, params }) });
    await homeHtml(salma, s);
    w.p.faults!.set({});
    const todo = log.filter((l) => /^\s*WITH (todo_chapter|item) AS/.test(l.sql));
    assert.equal(todo.length, 1, 'one to-do statement on the home');
    const p = todo[0].params;
    const dates = p.filter((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));
    assert.deepEqual(dates, [D, LAST], 'today (D, ?3) and the last day (D+7, ?4) of one instant, each bound once and used in every place of the statement');
  });
});

// ------------------------------------------------------------------ AT-2.4 ----
describe('W6 AT-2.4 changes by the teacher: a moved, a cleared and a new date take effect at the next page load', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.4 Hadeer changes L3 to D+9 (it leaves), clears L4 (it leaves), sets L6 to D (today, then overdue at 00:00 UTC the next day)', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const salma = await as(w, SALMA, 'en');
    const page = `/s/${s.id}/publish/edit/${s.math}/due`;
    const save = async (id: string, value: string) => assert.equal((await hadeer.post(`${page}/lesson/${id}`, { due_on: value })).status, 303, `save ${id} = ${JSON.stringify(value)}`);
    await save(a.L.L3, dPlus(9));
    let v = todoOf(await todoHtml(salma, s));
    assert.ok(!listed(v).has(a.L.L3), 'L3 moved to D+9: leaves the list');
    await save(a.L.L4, '');
    v = todoOf(await todoHtml(salma, s));
    assert.ok(!listed(v).has(a.L.L4), 'L4 cleared: leaves the list');
    await save(a.L.L6, D);
    v = todoOf(await todoHtml(salma, s));
    assert.ok(idsIn(v, 'today').includes(a.L.L6), 'L6 set to D: in todoToday');
    t.diagnostic(`instant ${await clockAt(w, AT.nextDay)}`);
    v = todoOf(await todoHtml(salma, s));
    assert.ok(idsIn(v, 'overdue').includes(a.L.L6), '00:00:00 UTC on D+1: L6 in todoOverdue');
  });
});

// ------------------------------------------------------------------ AT-2.5 ----
describe('W6 AT-2.5 removal and access: removed items leave and return with Restore; unpublished, unassigned or ended access removes every Mathematics item; the block\'s subjects are always among the cards\'', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.5 L1 removed and restored, C2 removed, Mathematics unpublished, Salma unassigned, her access ended, and each undone; the subset holds in every case', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const salmaId = w.ids[SALMA.username];
    let salma = await as(w, SALMA, 'en');
    const look = async (what: string) => {
      const doc = await homeHtml(salma, s);
      const todo = await todoHtml(salma, s);
      subsetOfCards(doc, todo, what);
      return { doc, v: todoOf(todo) };
    };
    const mathIds = async () => new Set([...(await expectedItems(w, s.id, s.math, salmaId, LAST))]);
    const mathListed = (v: TodoView | null) => [...listed(v)].filter((id) => id !== a.G1);
    await look('before');
    // L1 removed (Remove leaves removed_at set), then restored with its date (still overdue).
    await w.p.sql(`UPDATE lesson SET removed_at = 5 WHERE id = '${a.L.L1}'`);
    assert.ok(!listed((await look('L1 removed')).v).has(a.L.L1), 'L1 removed: leaves the list');
    await w.p.sql(`UPDATE lesson SET removed_at = NULL WHERE id = '${a.L.L1}'`);
    assert.deepEqual(idsIn((await look('L1 restored')).v, 'overdue'), [a.L.L1], 'L1 restored: back, still overdue');
    // Chapter C2 removed: C2 and its lessons' items leave (give one of its lessons a date to see it go too).
    await w.p.sql(`UPDATE lesson SET due_on = '${dPlus(4)}' WHERE id = '${s.lessons['Adding fractions']}'`);
    assert.ok(listed((await look('C2 lesson dated')).v).has(s.lessons['Adding fractions']), 'a dated lesson of C2 is listed');
    await w.p.sql(`UPDATE chapter SET removed_at = 6 WHERE id = '${a.C2}'`);
    const gone = (await look('C2 removed')).v;
    assert.ok(!listed(gone).has(a.C2) && !listed(gone).has(s.lessons['Adding fractions']), 'C2 removed: the chapter and its lessons leave');
    await w.p.sql(`UPDATE chapter SET removed_at = NULL WHERE id = '${a.C2}'`);
    const expected = await mathIds();
    assert.deepEqual(mathListed((await look('C2 restored')).v).sort(), [...expected].sort(), 'C2 restored: the list is the expected one again');
    const cases: [string, string, string][] = [
      ['unpublished', `UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`, `UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`],
      ['unassigned', `DELETE FROM group_member WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`,
        `INSERT INTO group_member (space_id, group_id, user_id) SELECT '${s.id}', id, '${salmaId}' FROM "group" WHERE space_id = '${s.id}' AND name = 'Science'`],
    ];
    for (const [what, change, undo] of cases) {
      await w.p.sql(change);
      const { doc, v } = await look(what);
      assert.deepEqual(mathListed(v), [], `${what}: no Mathematics item`);
      assert.ok(!cardSubjects(doc).has(s.math), `${what}: the home is today's answer (no Mathematics card)`);
      await w.p.sql(undo);
      assert.deepEqual(mathListed((await look(`${what}, undone`)).v).sort(), [...expected].sort(), `${what}, undone: every Mathematics item back`);
    }
    // Her access ends: today's answer on the home, no to-do anywhere she reaches.
    await w.p.sql(`UPDATE membership SET ended_on = '${dPlus(-1)}' WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    for (const path of [home(s), todoPath(s)]) { // R1a: the home and the to-do page
      const res = await salma.get(path);
      const body = await res.text();
      assert.notEqual(res.status, 200, `ended: ${path} is refused (${res.status})`);
      assert.equal(todoOf(body), null, `ended: no to-do block on ${path}`);
    }
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    salma = await as(w, SALMA, 'en');
    assert.deepEqual(mathListed((await look('access back')).v).sort(), [...expected].sort(), 'access back: every Mathematics item back');
  });
});

// ------------------------------------------------------------------ AT-2.6 ----
describe('W6 AT-2.6 everyone in the subject with their own marks; locked chapters are listed only when they open (compared with chapterLocks)', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let b: W6b;
  before(async () => {
    ({ w, a } = await wave6World());
    await withW5a(w);
    b = await withW6b(w);
  });
  after(() => closeWave6(w));

  it('W6 AT-2.6 Omar C and Rana Test see Mathematics by their own marks (Salma\'s change nothing); Karim Test sees only G1', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    for (const id of [a.L.L1, a.L.L3]) assert.equal((await press(salma, s, id, 'done')).status, 303, `Salma marks ${id}`);
    const omar = await as(w, OMAR, 'en');
    assert.equal((await press(omar, s, a.L.L8, 'done')).status, 303, 'Omar marks L8');
    for (const [who, person] of [['Omar C', OMAR], ['Rana Test', RANA5]] as const) {
      const v = todoOf(await todoHtml(await as(w, person, 'en'), s));
      sameItems(v, await expectedItems(w, s.id, s.math, w.ids[person.username], LAST), `${who}: exactly the Mathematics items by their own marks`);
    }
    assert.ok(listed(todoOf(await todoHtml(omar, s))).has(a.L.L1), 'Salma\'s mark on L1 changes nothing for Omar');
    assert.ok(!listed(todoOf(await todoHtml(omar, s))).has(a.L.L8), 'Omar\'s own mark on L8 takes it off his list');
    const karim = todoOf(await todoHtml(await as(w, KARIM5, 'en'), s));
    assert.deepEqual([...listed(karim)], [a.G1], 'Karim Test: only G1');
  });

  it('W6 AT-2.6 wave 4 (W6-b, Yara Test): N1 listed, K2 and N3 not (K2 locked); N1 and N2 done: K2 and N3 today; N2 undone: they leave; every state equals chapterLocks', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const yara = await as(w, YARA6, 'en');
    const yaraId = w.ids[YARA6.username];
    const nile = { id: b.id };
    const check = async (what: string) => {
      const v = todoOf(await todoHtml(yara, nile));
      sameItems(v, await expectedItems(w, b.id, b.subject, yaraId, LAST), `${what}: listed ⇔ not done and its chapter not locked (chapterLocks)`);
      return v;
    };
    let v = await check('no marks');
    assert.ok(listed(v).has(b.N1) && !listed(v).has(b.K2) && !listed(v).has(b.N3), 'no marks: N1 listed, K2 and N3 not (K2 locked)');
    for (const id of [b.N1, b.N2]) assert.equal((await press(yara, nile, id, 'done')).status, 303, `Yara marks ${id}`);
    v = await check('N1 and N2 done');
    assert.deepEqual(idsIn(v, 'today'), [b.K2, b.N3], 'N1 and N2 done: K2 and N3 in todoToday');
    assert.equal((await press(yara, nile, b.N2, 'not-done')).status, 303, 'Yara undoes N2');
    v = await check('N2 undone');
    assert.ok(!listed(v).has(b.K2) && !listed(v).has(b.N3), 'N2 undone: K2 and N3 leave again');
  });
});

// ------------------------------------------------------------------ AT-2.7 ----
describe('W6 AT-2.7 outline: each dated lesson or chapter shows dueOn, for every date; nothing else changes; no late word; a locked chapter\'s date as any other', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let b: W6b;
  before(async () => {
    ({ w, a } = await wave6World());
    b = await withW6b(w);
  });
  after(() => closeWave6(w));

  it('W6 AT-2.7 Salma\'s Mathematics page and Yara\'s Nile subject page, in Arabic and English', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const dated: [string, string][] = [
      [a.L.L1, a.dates.L1!], [a.L.L2, a.dates.L2!], [a.L.L3, a.dates.L3!], [a.L.L4, a.dates.L4!], [a.L.L5, a.dates.L5!], [a.L.L8, a.dates.L8!], [a.L.L9, a.dates.L9!],
      [a.C2, a.dates.C2!], [a.C3, a.dates.C3!],
    ];
    for (const lang of ['ar', 'en'] as const) {
      const tt = W(lang);
      const doc = await (await (await as(w, SALMA, lang)).get(subjectPath(s, s.math, 'all'))).text();
      const lines = dueLinesOf(doc);
      assert.deepEqual([...lines.keys()].sort(), dated.map(([id]) => id).sort(), `${lang}: a due line on every dated item (also D+8, the past L1 and C3) and on nothing else`);
      for (const [id, date] of dated) assert.equal(lines.get(id), tt('dueOn', { date: showDate(date, lang, D) }), // R1a (UX-16a row): S4 days
        `${lang} ${id}: dueOn with its date`);
      for (const word of ['todoOverdue', 'todoToday', 'todoNext7'] as const) assert.ok(!doc.includes(tt(word, { n: '1', days: '7' }).replace(/ ?\(1\)$/, '')), `${lang}: no late or group word (${word}) in the outline`);
      assert.doesNotMatch(doc, /id="todo"/, `${lang}: no to-do block on the subject page`);
      // Locked chapter K2 of W6-b: its date shows as any other.
      const nile = await (await (await as(w, YARA6, lang)).get(`/s/${b.id}/learn/${b.subject}?open=all`)).text();
      assert.match(nile, new RegExp(`id="chapter-${b.K2}"[^>]*data-locked`), `${lang}: K2 is locked for Yara`);
      assert.equal(dueLinesOf(nile).get(b.K2), tt('dueOn', { date: showDate(D, lang, D) }), `${lang}: the locked K2 shows its date`);
      assert.equal(dueLinesOf(nile).get(b.N3), tt('dueOn', { date: showDate(D, lang, D) }), `${lang}: N3 inside the locked chapter shows its date`);
    }
  });

  it('W6 AT-2.7 nothing else in the outline changes: with every date cleared the page is the page with dates minus exactly its due lines', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const withDates = await (await salma.get(subjectPath(s, s.math, 'all'))).text();
    await w.p.sql(`UPDATE lesson SET due_on = NULL WHERE space_id = '${s.id}'`);
    await w.p.sql(`UPDATE chapter SET due_on = NULL WHERE space_id = '${s.id}'`);
    const without = await (await salma.get(subjectPath(s, s.math, 'all'))).text();
    const stripped = withDates.replace(/<span class="due-line">[\s\S]*?<\/bdi><\/span>/g, '').replace(/<li class="(is-done )?due-dated">/g, (_m, done) => (done ? '<li class="is-done">' : '<li>'));
    assert.equal(stripped, without, 'the same page once the due lines are taken out');
  });
});

// ------------------------------------------------------------------ AT-2.8 ----
describe('W6 AT-2.8 kits and languages: the item lines use the kit\'s words; Arabic is the ui.ts value; dates in Latin digits inside dir="ltr"', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => ({ w } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-2.8 Salma in Delta Logistics (Company) and Nile University (University), a dated lesson and chapter each, Arabic and English', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    for (const [kit, sp] of [['company', w.company], ['university', w.university]] as const) {
      const lesson = sp.lessons['Adding fractions'];
      const chapter = sp.chapters.Percent;
      await w.p.sql(`UPDATE lesson SET due_on = '${D}' WHERE id = '${lesson}'`);
      await w.p.sql(`UPDATE chapter SET due_on = '${dPlus(2)}' WHERE id = '${chapter}'`);
      for (const lang of ['ar', 'en'] as const) {
        const tt = W(lang, kit);
        const doc = await todoHtml(await as(w, SALMA, lang), sp);
        const v = todoOf(doc)!;
        assert.ok(v, `${kit} ${lang}: the block`);
        assert.equal(v.heading, tt('todoTitle'));
        const items = v.groups.flatMap((g) => g.items);
        const l = items.find((i) => i.id === lesson)!;
        const c = items.find((i) => i.id === chapter)!;
        // LMS redesign R1a (UX-62/UX-63 rows): "<kind> · <subject>" then the S6 tag (the kit's words are unchanged).
        assert.equal(l.line, rowLine(tt, lang, 'lesson', 'Mathematics', 'today', D, D), `${kit} ${lang}: the lesson line with the kit's word`);
        assert.equal(c.line, rowLine(tt, lang, 'chapter', 'Mathematics', 'next', dPlus(2), D), `${kit} ${lang}: the chapter line with the kit's word`);
        if (lang === 'en') {
          const [lw, cw] = kit === 'company' ? ['Session', 'Module'] : ['Lecture', 'Unit'];
          assert.ok(l.line.startsWith(`${lw} · `) && c.line.startsWith(`${cw} · `), `${kit}: "${lw}" and "${cw}"`);
        }
        assert.equal(v.groups.find((g) => g.key === 'today')!.heading, tt('todoToday', { n: '1' }), `${kit} ${lang}: todoToday`);
        assert.match(doc, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`), `${kit} ${lang}: lang and dir`);
        // R1a (UX-16a row, UX-104): S4 days in Western digits; the ISO day stays in <time datetime>.
        for (const i of items) assert.doesNotMatch(i.raw, /[٠-٩۰-۹]/, `${kit} ${lang} ${i.id}: Western digits only`);
        assert.ok(c.raw.includes(`<time datetime="${dPlus(2)}">`), `${kit} ${lang}: the chapter's ISO day in <time>`);
      }
    }
  });
});

// --------------------------------------------------- W8 AT-3.7 (wave 8) ----
// LMS wave 8, W8-1b (product-contract v2 on PIL-299, section 3.6 and AT-3.7):
// the to-do statements (learnerTodo, and previewTodo for an admin and for a
// publisher) agree with chapterLocks on every combination of Open in order on
// or off x each chapter with no date, shown locked before its day, hidden
// before its day, or a passed date. World W8-a (test/wave8/world.ts) at
// 2026-12-09; every lesson due that day and every chapter due 2026-12-12, so
// every item is a candidate; each chapter takes each state in turn.
const W8_STATES = ['none', 'locked', 'hidden', 'passed'] as const;
const w8Opening = (s: (typeof W8_STATES)[number]): [string | null, number] =>
  (s === 'none' ? [null, 0] : s === 'locked' ? ['2026-12-10', 0] : s === 'hidden' ? ['2026-12-17', 1] : ['2026-12-01', 1]);

describe('W8 AT-3.7 learnerTodo and both previewTodo variants agree with chapterLocks on every combination of section 3.6', { concurrency: false }, () => {
  for (const inOrder of [false, true]) {
    it(`W8 AT-3.7 Open in order ${inOrder ? 'on' : 'off'}: 4 rotations of the four states over Ch1 to Ch4 (Ch5 empty, shown locked), Salma with and without marks, Hadeer's and Amal's previews`, async (t) => {
      const w = await w8.w8World({ inOrder, atMs: w8.AT8.d9 });
      try {
        t.diagnostic(`instant ${new Date(w8.AT8.d9).toISOString()}`);
        w.run('UPDATE lesson SET due_on = ? WHERE space_id = ? AND chapter_id IN (SELECT id FROM chapter WHERE subject_id = ?)', '2026-12-09', w8.ID.space, w8.ID.math);
        w.run('UPDATE chapter SET due_on = ? WHERE space_id = ? AND subject_id = ?', '2026-12-12', w8.ID.space, w8.ID.math);
        const ids = [w8.ID.ch1, w8.ID.ch2, w8.ID.ch3, w8.ID.ch4];
        let checked = 0;
        for (let rot = 0; rot < W8_STATES.length; rot++) {
          ids.forEach((id, i) => {
            const [on, hidden] = w8Opening(W8_STATES[(i + rot) % W8_STATES.length]);
            w.run('UPDATE chapter SET opens_on = ?, opens_hidden = ? WHERE id = ?', on, hidden, id);
          });
          for (const marks of [[] as string[], [w8.ID.l11, w8.ID.l12, w8.ID.l21]]) {
            w.run('DELETE FROM done_mark WHERE learner_user_id = ?', w8.SALMA.id);
            for (const id of marks) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, 1)', w8.ID.space, w8.SALMA.id, id);
            const parts = w8OutlineFromDb(w);
            const expect = (done: Set<string>) => {
              const shown = shownChapters(parts, '2026-12-09');
              const locked = chapterLocks(shown, done, { today: '2026-12-09', inOrder }).locked;
              const items: string[] = [];
              for (const ch of shown) {
                if (locked.has(ch.id)) continue;
                for (const l of ch.lessons) if (!done.has(l.id)) items.push(l.id);
                if (ch.lessons.some((l) => !done.has(l.id))) items.push(ch.id);
              }
              return items.sort();
            };
            const listedOn = async (who: w8.Person, path: string) => Object.values(w8TodoIds(await (await (await w.as(who, 'en')).get(path)).text())).flat().sort();
            const what = `rotation ${rot} (${ids.map((_, i) => W8_STATES[(i + rot) % W8_STATES.length]).join(', ')}), Salma ${marks.length ? 'with Ch1 and one Ch2 mark' : 'with no marks'}`;
            // LMS redesign R1a (UX-34/UX-62 rows): the learner's full list is on the to-do page.
            assert.deepEqual(await listedOn(w8.SALMA, `/s/${w8.ID.space}/todo`), expect(new Set(marks)), `learnerTodo, ${what}`);
            if (!marks.length) {
              // R1a: the preview home shows only the due strip (the to-do page is not previewable, S9), so both previewTodo
              // variants are read directly on the same database, and the strip must be their first items, in order.
              const day = todoWindow(w8.AT8.d9);
              const db = { all: async (q: string, ...p: (string | number | null)[]) => w.sql(q, ...p) } as unknown as Parameters<typeof previewTodo>[0];
              for (const [label, who, previewer] of [['admin', w8.HADEER, { kind: 'admin', userId: w8.HADEER.id }], ['publisher', w8.AMAL, { kind: 'publisher', userId: w8.AMAL.id }]] as const) {
                const rows = await previewTodo(db, w8.ID.space, previewer, day.today, day.last, TODO_MAX_PER_GROUP);
                assert.deepEqual(rows.map((r) => r.id).sort(), expect(new Set()), `previewTodo (${label}), ${what}`);
                const strip = [...(await (await (await w.as(who, 'en')).get(`/s/${w8.ID.space}/preview`)).text()).matchAll(/<li class="strip-row"[^>]*data-item="([^"]+)"/g)].map((m) => m[1]);
                assert.deepEqual(strip, todoGroups(rows).flatMap((g) => g.items.map((i) => i.id)).slice(0, 3), `the ${label}'s preview strip: the first items of previewTodo, ${what}`);
              }
            }
            checked++;
          }
        }
        t.diagnostic(`AT-3.7 ${checked} combinations checked (order ${inOrder ? 'on' : 'off'})`);
      } finally {
        await w.close();
      }
    });
  }
});

type W8Chapter = { id: string; title: string; opens_on: string | null; opens_hidden: number; lessons: { id: string; title: string }[] };

/** The outline of Mathematics with each chapter's opening, read straight from the database (the product's own order: position, title, id). */
function w8OutlineFromDb(w: w8.W8World): W8Chapter[] {
  const rows = w.sql(`SELECT c.id AS cid, c.title AS ctitle, c.opens_on, c.opens_hidden, l.id AS lid, l.title AS ltitle FROM chapter c
    LEFT JOIN lesson l ON l.chapter_id = c.id AND l.removed_at IS NULL WHERE c.subject_id = ? AND c.removed_at IS NULL ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`, w8.ID.math);
  const out: W8Chapter[] = [];
  for (const r of rows) {
    let ch = out.at(-1);
    if (!ch || ch.id !== r.cid) out.push((ch = { id: String(r.cid), title: String(r.ctitle), opens_on: (r.opens_on as string | null) ?? null, opens_hidden: Number(r.opens_hidden), lessons: [] }));
    if (r.lid) ch.lessons.push({ id: String(r.lid), title: String(r.ltitle) });
  }
  return out;
}

/** The ids listed in a home's to-do block, by group (data-item). */
function w8TodoIds(page: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  // LMS redesign R1a: a row now holds a <div> of its own, so each group runs to the next group (or the block's end).
  const block = page.slice(Math.max(0, page.indexOf('<section id="todo"')));
  const parts = block.split(/(?=<div class="todo-group" data-group=")/).slice(1);
  for (const part of parts) out[/data-group="([^"]+)"/.exec(part)![1]] = [...part.matchAll(/<li class="todo-item"[^>]*data-item="([^"]+)"/g)].map((m) => m[1]);
  return out;
}
