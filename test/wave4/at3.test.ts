// LMS wave 4, W4-1b (product-contract v2 on PIL-238, AT-3): the lock follows
// every change, at every page load. World W4-d: each describe builds its own
// copy of the wave 4 world (lesson activity on), Mathematics in order through
// Hadeer's editor, Salma reading. Each check opens the outline (?open=all) and
// the named lessons again. Learner and publisher changes go through the real
// forms; the two the screens do not offer are direct database updates, named
// where they are made: a lesson moved to another chapter (AT-3.4, no screen
// does it) and removing a chapter that still shows a lesson (AT-3.3, the
// remove step refuses it today, so it is removed as the world removes "Draft
// chapter"; it is restored through Hadeer's Restore). Every publisher change
// and every switch leaves done_mark identical (same rows, same times; AT-3.5).
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import {
  HADEER, SALMA, T1, T2, T3, as, editorPath, goToOf, inline, lessonPath, lockOf, markClock, marks, press, setOrder, subjectPath, summaryOf,
  wave4World, withW4c, type MarkRow, type SpaceIds, type Wave1World,
} from './world.ts';

const CHAPTERS = ['Fractions', 'Empty chapter', 'Decimals', 'Percent', 'Review'];
const first = (title: string, left: string) => `Opens when Chapter: ${title} is done (${left} left).`;
const later = (left: string) => `Opens when everything before it is done (${left} left).`;

/** Each shown chapter's reason on Salma's outline (null: open; chapters not on the page left out), and the order box's Go to. */
async function outlineState(c: Client, s: SpaceIds): Promise<{ html: string; locks: Record<string, string | null>; order: string[]; goTo: string | null; progress: string }> {
  const res = await c.get(subjectPath(s, s.math, 'all'));
  assert.equal(res.status, 200, 'the outline');
  const html = await res.text();
  const locks: Record<string, string | null> = {};
  const order: { title: string; at: number }[] = [];
  for (const [title, id] of Object.entries(s.chapters)) {
    const at = html.indexOf(`id="chapter-${id}"`);
    if (at < 0) continue;
    const start = html.lastIndexOf('<details', at);
    const block = html.slice(start, html.indexOf('</details>', at));
    const lock = lockOf(summaryOf(block));
    assert.equal(/\bdata-locked\b/.test(block.slice(0, block.indexOf('>'))), lock !== null, `${title}: data-locked exactly when locked`);
    if (lock) assert.equal(lock.tag, 'Locked');
    locks[title] = lock?.reason ?? null;
    order.push({ title, at });
  }
  const progress = inline(/<p id="done-progress"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '');
  return { html, locks, order: order.sort((a, b) => a.at - b.at).map((o) => o.title), goTo: goToOf(html)?.text ?? null, progress };
}

/** Whether a lesson's page is the locked page (AT-2.3) or the lesson itself. */
async function lessonState(c: Client, s: SpaceIds, lessonId: string): Promise<{ locked: boolean; html: string }> {
  const res = await c.get(lessonPath(s, lessonId));
  assert.equal(res.status, 200, 'the lesson address answers 200');
  const html = await res.text();
  return { locked: html.includes('id="locked-lesson"'), html };
}

/** A press, then the page it leads to: the 303 address and the status line's words. */
async function pressed(c: Client, s: SpaceIds, lessonId: string, state: 'done' | 'not-done'): Promise<{ location: string; status: string; html: string }> {
  const res = await press(c, s, lessonId, state);
  assert.equal(res.status, 303, `${state}: 303`);
  const location = res.headers.get('location')!;
  const html = await (await c.get(location.split('#')[0])).text();
  return { location, status: inline(/<p id="done-status"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''), html };
}

const flags = (location: string) => ({ opened: /[?&]opened=1\b/.test(location), relocked: /[?&]relocked=1\b/.test(location) });

/** A change by someone other than Salma that must leave her done marks exactly as they were. */
async function keepsMarks(w: Wave1World, what: string, change: () => Promise<void>): Promise<void> {
  const before: MarkRow[] = await marks(w);
  await change();
  assert.deepEqual(await marks(w), before, `${what}: done_mark identical (same rows, same times)`);
}

const lessonIdByTitle = async (w: Wave1World, s: SpaceIds, title: string) =>
  String((await w.p.sql(`SELECT id FROM lesson WHERE space_id = '${s.id}' AND title = '${title}'`))[0].id);

/** Salma marks lessons at fixed times (T1, T2, T3 in order). */
async function markAt(w: Wave1World, salma: Client, titles: string[]): Promise<void> {
  for (const [i, title] of titles.entries()) {
    await markClock(w, [T1, T2, T3][i]);
    assert.equal((await press(salma, w.school, w.school.lessons[title], 'done')).status, 303, `${title} marked`);
  }
  await markClock(w, null);
}

// ------------------------------------------------------------------ AT-3.1 ----
describe('W4 AT-3.1 undo: what comes after is locked again with the reader\'s marks kept; marking again opens it; status lines only when the press changed what is open', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-3.1 un-marking Comparing fractions while reading Reading decimals, then marking it again, then the no-change presses', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    await setOrder(w, true);
    await markAt(w, salma, ['Adding fractions', 'Comparing fractions', 'Reading decimals']);
    assert.equal((await lessonState(salma, s, s.lessons['Reading decimals'])).locked, false, 'Salma reads Reading decimals (Fractions done)');
    const decimalsMark = (await marks(w)).find((m) => m.lesson_id === s.lessons['Reading decimals'])!;
    assert.ok(decimalsMark, 'her mark on Reading decimals');

    // Undo on Comparing fractions: the press locked what was open.
    const undo = await pressed(salma, s, s.lessons['Comparing fractions'], 'not-done');
    assert.deepEqual(flags(undo.location), { opened: false, relocked: true }, 'the 303 address says the press locked a chapter');
    assert.equal(undo.status, 'Done mark removed. What comes after Chapter: Fractions is locked until it is done.');
    const locked = await lessonState(salma, s, s.lessons['Reading decimals']);
    assert.ok(locked.locked, 'Reading decimals gives the locked page');
    assert.equal(inline(/<p id="lock-reason" class="lock-reason">([\s\S]*?)<\/p>/.exec(locked.html)![1]), first('Fractions', '1 lesson'));
    const kept = (await marks(w)).find((m) => m.lesson_id === s.lessons['Reading decimals']);
    assert.deepEqual(kept, decimalsMark, 'her mark on Reading decimals stays stored (row and time unchanged)');
    const o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: first('Fractions', '1 lesson'), Percent: later('1 lesson'), Review: later('2 lessons') },
      'the marked Reading decimals is not left to do');
    assert.match(o.html, new RegExp(`<li class="is-done"><span class="tick" data-done="lesson">[\\s\\S]*?</span></span><span class="lock-item" data-lesson="${s.lessons['Reading decimals']}"`), 'ticked on the outline (inside the locked chapter)');
    assert.equal(o.progress, 'Done: 2 of 5 lessons', 'and counted');
    assert.equal(o.goTo, 'Go to: Comparing fractions');

    // Marking it again opens Decimals with that mark intact, and says so.
    const again = await pressed(salma, s, s.lessons['Comparing fractions'], 'done');
    assert.deepEqual(flags(again.location), { opened: true, relocked: false });
    assert.equal(again.status, 'Marked as done. Chapter: Decimals is open now.');
    const open = await lessonState(salma, s, s.lessons['Reading decimals']);
    assert.ok(!open.locked && open.html.includes('id="done-tag"'), 'Reading decimals open again, still marked done');
    assert.deepEqual((await marks(w)).find((m) => m.lesson_id === s.lessons['Reading decimals']), decimalsMark, 'that mark intact');
    assert.deepEqual((await outlineState(salma, s)).locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: null, Review: first('Percent', '1 lesson') });

    // Only when the press changed what is open: with Comparing fractions not done (Decimals already locked) ...
    assert.equal((await pressed(salma, s, s.lessons['Comparing fractions'], 'not-done')).status.endsWith('is locked until it is done.'), true, 'set-up: Decimals locked again');
    const offAdding = await pressed(salma, s, s.lessons['Adding fractions'], 'not-done');
    assert.deepEqual(flags(offAdding.location), { opened: false, relocked: false }, 'un-marking Adding fractions changes nothing open');
    assert.equal(offAdding.status, 'Done mark removed.', 'only wave 2\'s sentence');
    const onAdding = await pressed(salma, s, s.lessons['Adding fractions'], 'done');
    assert.deepEqual(flags(onAdding.location), { opened: false, relocked: false }, 'marking Adding fractions changes nothing open');
    assert.equal(onAdding.status, 'Marked as done.', 'only wave 2\'s sentence');
    // ... and "Mark as done" a second time on an already marked lesson.
    const twice = await pressed(salma, s, s.lessons['Adding fractions'], 'done');
    assert.deepEqual(flags(twice.location), { opened: false, relocked: false });
    assert.equal(twice.status, 'Marked as done.', 'a repeated press: only wave 2\'s sentence');
    // A flag that does not match the current state shows nothing more (as wave 2's status rule).
    const stale = await (await salma.get(`${lessonPath(s, s.lessons['Adding fractions'])}?marked=done&opened=1`)).text();
    assert.equal(inline(/<p id="done-status"[^>]*>([\s\S]*?)<\/p>/.exec(stale)![1]), 'Marked as done.', 'a stale "opened" flag (Decimals is locked) adds nothing');
    const staleUndo = await (await salma.get(`${lessonPath(s, s.lessons['Reading decimals'])}?marked=not-done&relocked=1`)).text();
    assert.ok(staleUndo.includes('id="locked-lesson"') && !staleUndo.includes('id="done-status"'), 'a locked lesson shows no status at all');
  });
});

// ------------------------------------------------------------------ AT-3.2 ----
describe('W4 AT-3.2 a lesson added to a finished chapter locks what follows again; marked, removed or restored, the lock follows; the change note with the setting on only', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-3.2 Hadeer adds "Fractions quiz" to Fractions with Fractions and Decimals done', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const hadeer = await as(w, HADEER, 'en');
    const removedPath = `${editorPath(s, s.math)}/removed`;
    const notes = async (path: string) => [...(await (await hadeer.get(path)).text()).matchAll(/data-order-note/g)].length;

    // With the setting off, the add-lesson forms and the restore actions are today's (no note).
    assert.equal(await notes(editorPath(s, s.math)), 0, 'off: no change note on the editor');
    assert.equal(await notes(removedPath), 0, 'off: no change note on the removed items');
    await keepsMarks(w, 'switching on', () => setOrder(w, true, { by: hadeer }));
    const editor = await (await hadeer.get(editorPath(s, s.math))).text();
    const forms = [...editor.matchAll(/<form class="add-lesson inline-add"[\s\S]*?<\/form>/g)].map((m) => m[0]);
    assert.ok(forms.length >= 4, 'the add-lesson forms');
    for (const f of forms) {
      assert.equal(inline(/<p class="order-note" data-order-note>([\s\S]*?)<\/p>/.exec(f)?.[1] ?? ''),
        'Open in order is on: anyone who has finished this chapter will need to mark the new lesson done before what follows opens again.', 'on: the change note at each add-lesson form');
    }

    await markAt(w, salma, ['Adding fractions', 'Comparing fractions', 'Reading decimals']);
    assert.deepEqual((await outlineState(salma, s)).locks.Decimals, null, 'set-up: Decimals open');
    assert.equal((await outlineState(salma, s)).locks.Percent, null, 'set-up: Percent open');

    await keepsMarks(w, 'adding a lesson', async () => {
      const res = await hadeer.post(`/s/${s.id}/publish/part/${s.chapters.Fractions}/add`, { title: 'Fractions quiz' });
      assert.equal(res.status, 303, 'Hadeer adds the lesson');
    });
    const quiz = await lessonIdByTitle(w, s, 'Fractions quiz');
    let o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: first('Fractions', '1 lesson'), Percent: later('1 lesson'), Review: later('2 lessons') }, 'Decimals and every later chapter locked again');
    assert.equal(o.goTo, 'Go to: Fractions quiz');
    assert.ok((await lessonState(salma, s, s.lessons['Reading decimals'])).locked, 'Reading decimals locked');

    // She marks it done: they open again (the press says so).
    const done = await pressed(salma, s, quiz, 'done');
    assert.equal(done.status, 'Marked as done. Chapter: Decimals is open now.');
    o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: null, Review: first('Percent', '1 lesson') }, 'open again');

    // Not done again, then removed by Hadeer: they open; restored: locked again.
    assert.ok((await pressed(salma, s, quiz, 'not-done')).status.endsWith('is locked until it is done.'), 'set-up: Fractions quiz not done');
    await keepsMarks(w, 'removing the lesson', async () => {
      assert.equal((await hadeer.post(`/s/${s.id}/publish/compose/${quiz}/remove`, {})).status, 303, 'Hadeer removes Fractions quiz');
    });
    assert.deepEqual((await outlineState(salma, s)).locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: null, Review: first('Percent', '1 lesson') }, 'removing it opens them');
    const removed = await (await hadeer.get(removedPath)).text();
    const restoreForm = new RegExp(`<p class="order-note" data-order-note>([\\s\\S]*?)</p><form class="restore" method="post" action="[^"]*/compose/${quiz}/restore">`).exec(removed);
    assert.ok(restoreForm, 'on: the change note at the restore action');
    assert.equal(inline(restoreForm[1]), 'Open in order is on: anyone who has finished this chapter will need to mark the new lesson done before what follows opens again.');
    await keepsMarks(w, 'restoring the lesson', async () => {
      assert.equal((await hadeer.post(`/s/${s.id}/publish/compose/${quiz}/restore`, {})).status, 303, 'Hadeer restores Fractions quiz');
    });
    o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: first('Fractions', '1 lesson'), Percent: later('1 lesson'), Review: later('2 lessons') }, 'restoring it locks them again');
    assert.equal(o.goTo, 'Go to: Fractions quiz');

    // Off again: the add-lesson forms and the restore actions are today's.
    await keepsMarks(w, 'switching off', () => setOrder(w, false, { by: hadeer }));
    assert.equal(await notes(editorPath(s, s.math)), 0, 'off: no change note on the editor');
    assert.equal(await notes(removedPath), 0, 'off: no change note on the removed items');
  });
});

// ------------------------------------------------------------------ AT-3.3 ----
describe('W4 AT-3.3 order changes: the blocking chapter removed and restored, a chapter moved, lessons moved inside a chapter', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-3.3 with only Fractions done', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const hadeer = await as(w, HADEER, 'en');
    await setOrder(w, true, { by: hadeer });
    await markAt(w, salma, ['Adding fractions', 'Comparing fractions']);
    const start = await outlineState(salma, s);
    assert.deepEqual(start.locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: first('Decimals', '1 lesson'), Review: later('2 lessons') }, 'set-up: Decimals blocks');

    // Removing the chapter that blocks (Decimals, with Reading decimals not done) opens what follows; restoring it locks again.
    await keepsMarks(w, 'removing Decimals', async () => {
      // The remove step refuses a chapter that still shows a lesson (today's rule) ...
      assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${s.chapters.Decimals}/remove`, {})).status, 400, 'today\'s refusal on the screen');
      // ... so it is removed as the world removes "Draft chapter" (a database update), with Reading decimals inside, not done.
      await w.p.sql(`UPDATE chapter SET removed_at = 1 WHERE id = '${s.chapters.Decimals}'`);
    });
    let o = await outlineState(salma, s);
    assert.ok(!('Decimals' in o.locks), 'Decimals is not on the outline');
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Percent: null, Review: first('Percent', '1 lesson') }, 'what follows opens');
    await keepsMarks(w, 'restoring Decimals', async () => {
      assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${s.chapters.Decimals}/restore`, {})).status, 303, 'Hadeer restores Decimals');
    });
    assert.deepEqual((await outlineState(salma, s)).locks, start.locks, 'restoring it locks again');

    // The same through the screens: Hadeer removes Reading decimals (its note first); restoring it locks again.
    const note = String((await w.p.sql(`SELECT id FROM material WHERE lesson_id = '${s.lessons['Reading decimals']}' AND removed_at IS NULL`))[0].id);
    await keepsMarks(w, 'removing Reading decimals', async () => {
      assert.equal((await hadeer.post(`/s/${s.id}/publish/item/${note}/remove`, {})).status, 303, 'its note removed');
      assert.equal((await hadeer.post(`/s/${s.id}/publish/compose/${s.lessons['Reading decimals']}/remove`, {})).status, 303, 'Reading decimals removed');
    });
    o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: null, Review: first('Percent', '1 lesson') }, 'a removed not-done lesson stops counting');
    await keepsMarks(w, 'restoring Reading decimals', async () => {
      assert.equal((await hadeer.post(`/s/${s.id}/publish/compose/${s.lessons['Reading decimals']}/restore`, {})).status, 303, 'Reading decimals restored');
    });
    assert.deepEqual((await outlineState(salma, s)).locks, start.locks, 'restored: it blocks again');

    // Moving lessons up or down inside a chapter changes no lock.
    for (const direction of ['up', 'down']) {
      await keepsMarks(w, `moving Comparing fractions ${direction}`, async () => {
        assert.equal((await hadeer.post(`/s/${s.id}/publish/compose/${s.lessons['Comparing fractions']}/move`, { direction })).status, 303);
      });
      const now = await outlineState(salma, s);
      assert.deepEqual([now.locks, now.goTo], [start.locks, start.goTo], `Comparing fractions moved ${direction}: no lock changes`);
    }

    // Hadeer moves Percent above Decimals: Percent is open, Decimals is locked behind it.
    for (let i = 0; i < 4 && (o = await outlineState(salma, s)).order.indexOf('Percent') > o.order.indexOf('Decimals'); i++) {
      await keepsMarks(w, 'moving Percent up', async () => {
        assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${s.chapters.Percent}/move`, { direction: 'up' })).status, 303);
      });
    }
    o = await outlineState(salma, s);
    assert.deepEqual(o.order, ['Fractions', 'Empty chapter', 'Percent', 'Decimals', 'Review'], 'Percent above Decimals');
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Percent: null, Decimals: first('Percent', '1 lesson'), Review: later('2 lessons') });
    assert.equal(o.goTo, 'Go to: What is a percent');
    assert.ok(!(await lessonState(salma, s, s.lessons['What is a percent'])).locked, 'What is a percent opens');
    assert.ok((await lessonState(salma, s, s.lessons['Reading decimals'])).locked, 'Reading decimals is locked');
  });
});

// ------------------------------------------------------------------ AT-3.4 ----
describe('W4 AT-3.4 a lesson moved to another chapter (a database update, as no screen does it): it counts where it is now; its mark follows it', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-3.4 a not-done lesson into the finished Fractions; a done lesson out of Fractions', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    await setOrder(w, true);
    await markAt(w, salma, ['Adding fractions', 'Comparing fractions']);
    const move = (title: string, chapter: string) => keepsMarks(w, `moving ${title} to ${chapter}`, async () => {
      await w.p.sql(`UPDATE lesson SET chapter_id = '${s.chapters[chapter]}' WHERE id = '${s.lessons[title]}'`);
    });
    assert.equal((await outlineState(salma, s)).locks.Decimals, null, 'set-up: Fractions done, Decimals open');

    // A not-done lesson into the finished Fractions locks what follows.
    await move('What is a percent', 'Fractions');
    let o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: first('Fractions', '1 lesson'), Percent: null, Review: later('2 lessons') }, 'Percent is empty now (never locked); Decimals and Review locked');
    assert.equal(o.goTo, 'Go to: What is a percent');
    assert.ok((await lessonState(salma, s, s.lessons['Reading decimals'])).locked, 'Reading decimals locked');
    await move('What is a percent', 'Percent');
    assert.equal((await outlineState(salma, s)).locks.Decimals, null, 'moved back: Decimals open');

    // A done lesson out of Fractions keeps its mark, which then counts in the chapter it lands in.
    const mark = (await marks(w)).find((m) => m.lesson_id === s.lessons['Adding fractions']);
    await move('Adding fractions', 'Decimals');
    o = await outlineState(salma, s);
    assert.deepEqual(o.locks, { Fractions: null, 'Empty chapter': null, Decimals: null, Percent: first('Decimals', '1 lesson'), Review: later('2 lessons') }, 'its mark counts in Decimals (1 lesson left there, not 2)');
    assert.deepEqual((await marks(w)).find((m) => m.lesson_id === s.lessons['Adding fractions']), mark, 'its mark kept');
    const decimals = o.html.slice(o.html.indexOf(`id="chapter-${s.chapters.Decimals}"`), o.html.indexOf('</details>', o.html.indexOf(`id="chapter-${s.chapters.Decimals}"`)));
    assert.match(decimals, new RegExp(`<li class="is-done">[\\s\\S]*?data-lesson="${s.lessons['Adding fractions']}"`), 'ticked in the chapter it is in now');
    assert.equal(o.progress, 'Done: 2 of 5 lessons', 'still counted');
  });
});

// ------------------------------------------------------------------ AT-3.5 ----
describe('W4 AT-3.5 switching while learners are part-way: on locks Decimals and later (marks kept), off opens everything as today', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-3.5 with W4-c\'s marks, on and off twice', async () => {
    const s = w.school;
    await withW4c(w);
    const salma = await as(w, SALMA, 'en');
    const today = await outlineState(salma, s);
    assert.ok(!today.html.includes('id="order-box"') && Object.values(today.locks).every((x) => x === null), 'off: nothing locked');
    // The second visit (wave 1: the activity notice shows in full once, then folded).
    await lessonState(salma, s, s.lessons['Reading decimals']);
    const lessonToday = (await lessonState(salma, s, s.lessons['Reading decimals'])).html;
    for (const round of [1, 2]) {
      await keepsMarks(w, `switching on (${round})`, () => setOrder(w, true));
      const on = await outlineState(salma, s);
      assert.deepEqual(on.locks, { Fractions: null, 'Empty chapter': null, Decimals: first('Fractions', '1 lesson'), Percent: later('1 lesson'), Review: later('2 lessons') }, 'on: Decimals and later locked');
      assert.equal(on.goTo, 'Go to: Comparing fractions');
      assert.equal(on.progress, 'Done: 2 of 5 lessons', 'her marks kept and counted');
      assert.ok((await lessonState(salma, s, s.lessons['Reading decimals'])).locked, 'Reading decimals locked (her mark there kept)');
      await keepsMarks(w, `switching off (${round})`, () => setOrder(w, false));
      const off = await outlineState(salma, s);
      assert.equal(off.html, today.html, 'off: the outline is exactly today\'s');
      assert.equal((await lessonState(salma, s, s.lessons['Reading decimals'])).html, lessonToday, 'off: the lesson is exactly today\'s');
    }
  });
});
