// LMS wave 6, W6-1c (product-contract v3 addendum on PIL-265, G5, AT-6.1 to
// AT-6.3): the guardian sees the linked learner's to-do list on that learner's
// page, read-only, exactly as the learner sees it at the same instant. Lesson
// activity is switched on (the release 2 admin setting) in every space a step
// uses. One describe per labelled expectation, each its own CI step
// (`W6 AT-6.<n> ...`), on a fresh world with the clock pinned (W6-c); every
// step prints the instant it uses. Strings are asserted by ui.ts key.
// AT-6.4 to AT-6.6 compare with W6-1b-main and are in base-guardian.test.ts.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { signedIn } from '../support/seed.ts';
import {
  AT, D, HADEER, withKitGuardians, HUDA6, LAILA6, LOAD_ADMIN, LOAD_LEARNER, MONA, OMAR, SALMA, TAMER6, YARA6, activity, as, clockAt, closeWave6, dPlus, home, linkedPath, press, wave6World,
  withHuda, withTamer, withW5d, withW6b, withW6f, words, type W6a, type W6b, type Wave1World,
} from './world.ts';
import { guardianTodoOf, sequenceOf, todoOf, todoPath, withW6d, withW6e, type GuardianTodoView, type TodoView } from './todo.ts';
import { showDate } from '../../src/format.ts';

/** LMS redesign R1a (UX-16a row): a guardian line's date is S4's (day, month name, year only when not this UTC year), in <bdi>. */
const S4_DATE = /<bdi dir="(?:rtl|ltr)" class="due-date">(?![^<]*\d{4}-\d{2}-\d{2})[^<]*\b\d{1,2}\b[^<]*<\/bdi>/;
const todayAt = (instant: number) => new Date(instant).toISOString().slice(0, 10);

type Lang = 'ar' | 'en';
type Get = { get(p: string): Promise<Response> };
const W = (lang: Lang, kit: 'school' | 'company' | 'university' = 'school') => words(kit, lang);

async function html(c: Get, path: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${path} answers 200`);
  return res.text();
}

/** The learner's home block and the guardian's block at one instant; asserts AT-6.2's equality and returns both. */
async function equalAt(learner: Get, guardian: Get, space: { id: string }, learnerId: string, what: string): Promise<{ l: TodoView | null; g: GuardianTodoView | null }> {
  // LMS redesign R1a (UX-62/UX-63 rows): the learner's full list is the to-do page; its row lines end with the S6 tag, so lines are left out here.
  const l = todoOf(await html(learner, todoPath(space)));
  const g = guardianTodoOf(await html(guardian, linkedPath(space, learnerId)));
  assert.equal(g === null, l === null, `${what}: the guardian block is absent exactly when the learner's is (learner ${l ? 'has' : 'has no'} block)`);
  assert.deepEqual(sequenceOf(g, false), sequenceOf(l, false), `${what}: the guardian block's sequence equals the learner's`);
  return { l, g };
}

// ------------------------------------------------------------------ AT-6.1 ----
describe('W6 AT-6.1 place and content: Mona on Salma\'s page with W6-a, no marks, at noon: #guardian-todo after the learner card and before the results, its heading, note, groups, fold; no link, form, input, button or done count', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => {
    ({ w, a } = await wave6World({ activity: true }));
    await withW6f(w, a);
  });
  after(() => closeWave6(w));

  it('W6 AT-6.1 Mona on Salma\'s page, in Arabic and English', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const titles: Record<string, string> = Object.fromEntries((await w.p.sql(`SELECT id, title FROM lesson WHERE space_id = '${s.id}' UNION ALL SELECT id, title FROM chapter WHERE space_id = '${s.id}'`)).map((r) => [String(r.id), String(r.title)]));
    for (const lang of ['ar', 'en'] as const) {
      const tt = W(lang);
      const doc = await html(await as(w, MONA, lang), linkedPath(s, w.ids[SALMA.username]));
      const v = guardianTodoOf(doc);
      assert.ok(v, `${lang}: the block #guardian-todo`);
      const card = doc.indexOf('<div id="linked">');
      const results = doc.indexOf('<section id="results"');
      assert.ok(card >= 0 && card < v.at, `${lang}: after the learner card`);
      assert.ok(v.at + v.block.length <= results, `${lang}: before #results`);
      assert.equal(v.heading, tt('guardianTodoTitle', { name: SALMA.display_name }), `${lang}: guardianTodoTitle with Salma's name`);
      assert.match(v.block, new RegExp(`<h2 id="guardian-todo-heading">[^<]*<bdi>${SALMA.display_name}</bdi>`), `${lang}: the name in <bdi>`);
      assert.equal(v.note, tt('guardianTodoNote'), `${lang}: guardianTodoNote`);
      assert.deepEqual(v.groups.map((g) => g.key), ['overdue', 'today', 'next'], `${lang}: todoOverdue, todoToday, todoNext7`);
      // As W6-1b's AT-2.1: today also holds G1 (Arabic grammar, due D), W6-a's own item of a subject Salma reads, first by subject title.
      const expected = { overdue: [a.L.L1], today: [a.G1, a.L.L2], next: [a.L.L3, a.C2, a.L.L8, a.L.L9, a.L.L4] };
      const key = { overdue: 'todoOverdue', today: 'todoToday', next: 'todoNext7' } as const;
      for (const g of v.groups) {
        assert.deepEqual(g.items.map((i) => i.title), expected[g.key].map((id) => titles[id]), `${lang} ${g.key}: the items in order`);
        assert.equal(g.heading, tt(key[g.key], { n: String(expected[g.key].length), days: '7' }), `${lang} ${g.key}: the heading with the full count`);
      }
      const next = v.groups[2];
      assert.deepEqual(next.items.map((i) => i.folded), [false, false, false, true, true], `${lang}: L3, C2, L8 shown; L9 and L4 in the fold`);
      assert.equal(next.more, tt('todoMore', { n: '2' }), `${lang}: todoMore (2)`);
      assert.equal(next.moreOpen, false, `${lang}: the fold is closed by default`);
      for (const g of v.groups) {
        for (const i of g.items) {
          const id = expected[g.key][g.items.indexOf(i)];
          const kind = id === a.C2 ? 'chapter' : 'lesson';
          const name = Object.entries({ ...a.L, C2: a.C2, G1: a.G1 }).find(([, x]) => x === id)![0];
          assert.equal(i.line, tt('todoItemLine', { kind: tt(kind), subjectTitle: id === a.G1 ? 'Arabic grammar' : 'Mathematics', date: showDate(String(a.dates[name]), lang, todayAt(AT.noon)) }), `${lang} ${name}: todoItemLine`);
          assert.match(i.raw, /<span class="due-title"><bdi>[^<]+<\/bdi><\/span>/, `${lang} ${name}: the title as plain text in <bdi>`);
          assert.match(i.raw, S4_DATE, `${lang} ${name}: the date as S4 shows it, Latin digits (R1a, UX-16a row)`);
        }
      }
      for (const tag of ['a', 'form', 'input', 'button']) assert.doesNotMatch(v.block, new RegExp(`<${tag}\\b`), `${lang}: no <${tag}> in the block`);
      assert.doesNotMatch(v.block, /todo-progress|data-done/, `${lang}: no chapter done count (AT-6.2 checks it with C2 half done)`);
    }
  });
});

// ------------------------------------------------------------------ AT-6.2 ----
describe('W6 AT-6.2 equal to the learner\'s, always: every step of v2 AT-2.2 to AT-2.6 again, the guardian page and the learner\'s home at the same pinned instant; Laila Test on Salma\'s and Omar C\'s pages; Tamer Test on Yara Test\'s locks', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let b: W6b;
  before(async () => {
    ({ w, a } = await wave6World({ activity: true }));
    await withW6f(w, a);
    b = await withW6b(w);
    await withTamer(w, b);
  });
  after(() => closeWave6(w));

  it('W6 AT-6.2 v2 AT-2.2 to AT-2.5 replayed for Mona and Laila Test on Salma\'s page: marks, undo, the four instants, the teacher\'s changes, removals, unpublish, unassign, ended access', async (t) => {
    const s = w.school;
    const salmaId = w.ids[SALMA.username];
    let salma = await as(w, SALMA, 'en');
    const mona = await as(w, MONA, 'en');
    const laila = await as(w, LAILA6, 'en');
    let steps = 0;
    const both = async (what: string) => {
      steps++;
      await equalAt(salma, mona, s, salmaId, `Mona, ${what}`);
      return equalAt(salma, laila, s, salmaId, `Laila Test, ${what}`);
    };
    const mark = async (id: string, state: 'done' | 'not-done') => assert.equal((await press(salma, s, id, state)).status, 303, `${state} ${id}`);
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    assert.ok((await both('no marks')).g, 'no marks: the block is there');
    // The four W6-c instants (AT-2.3).
    for (const at of [AT.lastSecond, AT.nextDay, AT.egyptNextDay, AT.noon]) {
      t.diagnostic(`instant ${await clockAt(w, at)}`);
      await both(`at ${new Date(at).toISOString()}`);
    }
    // Marks and undo (AT-2.2).
    for (const id of [a.L.L1, a.L.L2, a.G1, s.lessons['Adding fractions']]) {
      await mark(id, 'done');
      await both(`${id} done`);
    }
    // C2 half done: the learner's item carries wave 2's "1 of 2"; the guardian's never a done count (G4.2).
    const half = await both('C2 one of two');
    assert.ok(half.l!.groups.flatMap((g) => g.items).find((i) => i.id === a.C2)?.progress, 'the learner\'s C2 shows its done count');
    assert.doesNotMatch(half.g!.block, /todo-progress|data-done/, 'the guardian\'s C2 shows none');
    await mark(s.lessons['Comparing fractions'], 'done');
    await both('C2 all done');
    const hadeer = await as(w, HADEER, 'en');
    assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${a.C2}/add`, { title: 'Fractions in a recipe' })).status, 303, 'Hadeer adds a lesson to C2');
    await both('a lesson added to C2');
    await mark(a.L.L1, 'not-done');
    await both('L1 undone');
    // The teacher's changes (AT-2.4), then the next day.
    const page = `/s/${s.id}/publish/edit/${s.math}/due`;
    for (const [id, value] of [[a.L.L3, dPlus(9)], [a.L.L4, ''], [a.L.L6, D]] as const) {
      assert.equal((await hadeer.post(`${page}/lesson/${id}`, { due_on: value })).status, 303, `save ${id} = ${JSON.stringify(value)}`);
      await both(`${id} set to ${JSON.stringify(value)}`);
    }
    t.diagnostic(`instant ${await clockAt(w, AT.nextDay)}`);
    await both('the next day after the changes');
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    // Removals and access (AT-2.5).
    const cases: [string, string, string][] = [
      ['L1 removed', `UPDATE lesson SET removed_at = 5 WHERE id = '${a.L.L1}'`, `UPDATE lesson SET removed_at = NULL WHERE id = '${a.L.L1}'`],
      ['C2 removed', `UPDATE chapter SET removed_at = 6 WHERE id = '${a.C2}'`, `UPDATE chapter SET removed_at = NULL WHERE id = '${a.C2}'`],
      ['Mathematics unpublished', `UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`, `UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`],
      ['Salma unassigned', `DELETE FROM group_member WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`,
        `INSERT INTO group_member (space_id, group_id, user_id) SELECT '${s.id}', id, '${salmaId}' FROM "group" WHERE space_id = '${s.id}' AND name = 'Science'`],
    ];
    for (const [what, change, undo] of cases) {
      await w.p.sql(change);
      await both(what);
      await w.p.sql(undo);
      await both(`${what}, undone`);
    }
    // Her access ends: her home is refused, and so is the guardian's page (both absent; AT-7.1 compares the 403 bytes).
    await w.p.sql(`UPDATE membership SET ended_on = '${dPlus(-1)}' WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    assert.notEqual((await salma.get(home(s))).status, 200, 'ended: her home is refused');
    for (const g of [mona, laila]) {
      const res = await g.get(linkedPath(s, salmaId));
      assert.equal(res.status, 403, 'ended: the guardian page is 403');
      assert.equal(guardianTodoOf(await res.text()), null, 'ended: no guardian block');
    }
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    salma = await as(w, SALMA, 'en');
    await both('access back');
    // Every listed item done: both absent.
    const left = (await w.p.sql(`SELECT id FROM lesson WHERE space_id = '${s.id}' AND removed_at IS NULL AND due_on IS NOT NULL AND due_on <= '${dPlus(7)}'
      UNION SELECT l.id FROM lesson l WHERE l.chapter_id IN ('${a.C2}') AND l.removed_at IS NULL`)).map((r) => String(r.id));
    for (const id of left) await mark(id, 'done');
    const end = await both('every item done');
    assert.equal(end.l, null, 'every item done: no learner block');
    t.diagnostic(`AT-6.2 Salma's page: ${steps} states, each compared for Mona and Laila Test`);
  });

  it('W6 AT-6.2 Laila Test on Omar C\'s page follows his own marks; Tamer Test on Yara Test\'s page follows her locks (v2 AT-2.6)', async (t) => {
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    const s = w.school;
    const laila = await as(w, LAILA6, 'en');
    const omar = await as(w, OMAR, 'en');
    const omarId = w.ids[OMAR.username];
    const first = await equalAt(omar, laila, s, omarId, 'Omar C, no marks of his');
    assert.ok(first.g, 'Omar C: the block is there');
    assert.equal((await press(omar, s, a.L.L8, 'done')).status, 303, 'Omar marks L8');
    const after = await equalAt(omar, laila, s, omarId, 'Omar C, L8 done');
    assert.ok(!sequenceOf(after.g)!.some((x) => x.includes('Practice L8')), 'Omar\'s own mark takes L8 off the list Laila Test sees');
    const yara = await as(w, YARA6, 'en');
    const tamer = await as(w, TAMER6, 'en');
    const yaraId = w.ids[YARA6.username];
    const nile = { id: b.id };
    const lockSeq = async (what: string) => (await equalAt(yara, tamer, nile, yaraId, `Yara Test, ${what}`)).g;
    let g = await lockSeq('no marks');
    assert.ok(g && !sequenceOf(g)!.some((x) => x.includes('Soil')), 'no marks: K2 and N3 not listed (K2 locked)');
    for (const id of [b.N1, b.N2]) assert.equal((await press(yara, nile, id, 'done')).status, 303, `Yara marks ${id}`);
    g = await lockSeq('N1 and N2 done');
    assert.ok(g && g.groups.find((x) => x.key === 'today')?.items.length === 2, 'N1 and N2 done: K2 and N3 today');
    assert.equal((await press(yara, nile, b.N2, 'not-done')).status, 303, 'Yara undoes N2');
    g = await lockSeq('N2 undone');
    assert.ok(!g || !sequenceOf(g)!.some((x) => x.includes('Soil')), 'N2 undone: K2 and N3 leave again');
  });
});

// ------------------------------------------------------------------ AT-6.5 ----
// (The activity-off part, byte for byte W6-1b-main's, is in base-guardian.test.ts; one CI step runs both.)

describe('W6 AT-6.5 kits and languages: in the Company and University kits the item lines use the kit\'s words; every new string is the ui.ts value with its placeholders filled; dates Latin YYYY-MM-DD in dir="ltr"', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    const made = await wave6World({ activity: true });
    w = made.w;
    await withW6f(w, made.a);
    await withKitGuardians(w);
  });
  after(() => closeWave6(w));

  it('W6 AT-6.5 Laila Test on Salma\'s page in the Company and University spaces, Arabic and English', async (t) => {
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    for (const space of [w.company, w.university]) {
      for (const lang of ['ar', 'en'] as const) {
        const tt = W(lang, space.kit);
        const doc = await html(await as(w, LAILA6, lang), linkedPath(space, w.ids[SALMA.username]));
        const g = guardianTodoOf(doc);
        assert.ok(g, `${space.kit} ${lang}: the block`);
        assert.equal(g.heading, tt('guardianTodoTitle', { name: SALMA.display_name }), `${space.kit} ${lang}: guardianTodoTitle`);
        assert.equal(g.note, tt('guardianTodoNote'), `${space.kit} ${lang}: guardianTodoNote`);
        assert.deepEqual(g.groups.map((x) => [x.key, x.heading]), [['today', tt('todoToday', { n: '1' })]], `${space.kit} ${lang}: todoToday (1)`);
        const item = g.groups[0].items[0];
        assert.equal(item.title, 'Adding fractions');
        assert.equal(item.line, tt('todoItemLine', { kind: tt('lesson'), subjectTitle: 'Mathematics', date: showDate(D, lang, todayAt(AT.noon)) }), `${space.kit} ${lang}: todoItemLine with the kit's word "${tt('lesson')}"`);
        assert.match(item.raw, S4_DATE, `${space.kit} ${lang}: the date as S4 shows it, Latin digits (R1a, UX-16a row)`);
        assert.match(doc, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`), `${space.kit} ${lang}: the page's language and direction`);
        const own = todoOf(await html(await as(w, SALMA, lang), todoPath(space)));
        assert.deepEqual(sequenceOf(g, false), sequenceOf(own, false), `${space.kit} ${lang}: equal to Salma's own block there`);
        t.diagnostic(`AT-6.5 ${space.kit} ${lang}: ${item.line}`);
      }
    }
  });
});

// ------------------------------------------------------------------ AT-6.3 ----
describe('W6 AT-6.3 cap: Huda Test at W6-e: the overdue heading shows the full count; 3 items shown, 7 in the fold, then guardianTodoCapped with the number not drawn; equal to the learner\'s block apart from that line', { concurrency: false }, () => {
  let w: Wave1World;
  let loadId: string;
  before(async () => {
    ({ w } = await wave6World({ activity: true }));
    const load = await withW5d(w);
    loadId = load.id;
    await withW6d(w.p.sql, load, dPlus);
    await withW6e(w.p.sql, load, dPlus);
    w.ids[HUDA6.username] = await withHuda(w.p.url, load, LOAD_ADMIN.username, LOAD_LEARNER.username);
    await activity(w, true, await signedIn(w.p.url, LOAD_ADMIN.username, LOAD_ADMIN.password), load.id);
    await w.p.sql("UPDATE membership SET valid_from = '2026-01-01' WHERE valid_from > '2026-01-01'");
  });
  after(() => closeWave6(w));

  it('W6 AT-6.3 Huda Test on the load learner\'s page, in Arabic and English', async (t) => {
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    const space = { id: loadId };
    const learnerId = (await w.p.sql(`SELECT id FROM user WHERE username = '${LOAD_LEARNER.username}'`))[0].id as string;
    for (const lang of ['ar', 'en'] as const) {
      const tt = W(lang);
      const learner = await as(w, LOAD_LEARNER, lang);
      const huda = await as(w, HUDA6, lang);
      const l = todoOf(await html(learner, todoPath(space)))!;
      const g = guardianTodoOf(await html(huda, linkedPath(space, learnerId)))!;
      assert.ok(l && g, `${lang}: both blocks`);
      const lo = l.groups.find((x) => x.key === 'overdue')!;
      const go = g.groups.find((x) => x.key === 'overdue')!;
      const n = Number(/\d+/.exec(go.heading)![0]);
      assert.ok(n > 10, `${lang}: more than 10 overdue (${n})`);
      assert.equal(go.heading, tt('todoOverdue', { n: String(n) }), `${lang}: the overdue heading with the full count`);
      assert.deepEqual(go.items.map((i) => i.folded), [...Array(3).fill(false), ...Array(7).fill(true)], `${lang}: 3 shown, 7 in the fold`);
      assert.equal(go.more, tt('todoMore', { n: '7' }), `${lang}: todoMore (7)`);
      assert.equal(go.capped, tt('guardianTodoCapped', { n: String(n - 10) }), `${lang}: guardianTodoCapped with the number not drawn`);
      assert.match(g.block, /<p class="todo-capped">[^<]*<\/p>\n<\/details>/, `${lang}: the capped line ends the fold`);
      assert.ok(lo.capped && lo.capped !== go.capped, `${lang}: the learner's own block ends with todoCapped instead`);
      assert.deepEqual(sequenceOf(g, false), sequenceOf(l, false), `${lang}: equal to the learner's block apart from that last line`);
      t.diagnostic(`AT-6.3 ${lang}: overdue ${n}, drawn 10, not drawn ${n - 10}`);
    }
  });
});
