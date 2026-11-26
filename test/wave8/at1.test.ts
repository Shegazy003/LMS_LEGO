// LMS wave 8, W8-1a (product-contract v2 on PIL-299, AT-1 and AT-4.1): the
// Opening dates page. Amal Test (Mathematics' responsible publisher, from the
// editor) and Hadeer Test (admin, from the admin's subject page) set, change
// and clear a chapter's opening date and before-opening choice; every refused
// case stores nothing. One describe per labelled expectation, each its own CI
// step (`W8 AT-1.<n> ...`, selected with --test-name-pattern), each on a fresh
// world W8-a or W8-0 (test/wave8/world.ts) with the clock pinned (W6-c).
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMAL, AT8, CHAPTERS, HADEER, ID, KARIM, MONA, SALMA, adminOf, editorOf, openCardOf, openPage, openPost, openRowsOf, openingOf, openingSnapshot,
  w8World, words8, type W8World,
} from './world.ts';
import type { Client } from '../support/http.ts';

const EN = words8('school', 'en');
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function got(c: Client, path: string): Promise<{ status: number; html: string }> {
  const res = await c.get(path);
  return { status: res.status, html: await res.text() };
}

/** A press on one row: Save (date, choice) or Clear. */
async function press(c: Client, from: string, chapterId: string, fields: { action: 'save' | 'clear'; opens_on?: string; before?: string }): Promise<Response> {
  return c.post(openPost(from, chapterId), { action: fields.action, opens_on: fields.opens_on ?? '', before: fields.before ?? 'locked' });
}

/** Follows a 303 back to the page and returns the pressed row. */
async function landed(c: Client, res: Response, from: string, chapterId: string) {
  assert.equal(res.status, 303, 'the press answers 303');
  const loc = res.headers.get('location') ?? '';
  assert.ok(loc.endsWith(`#chapter-${chapterId}`), `back to the row (#chapter-<id>): ${loc}`);
  assert.ok(loc.startsWith(`${openPage(from)}?`), `back to the page: ${loc}`);
  const page = await got(c, loc.replace(/#.*$/, ''));
  assert.equal(page.status, 200);
  const row = openRowsOf(page.html).find((r) => r.id === chapterId);
  assert.ok(row, 'the row is on the page');
  return { page, row, loc };
}

/** Amal on the editor's address and Hadeer on the admin's, in English. */
async function sides(w: W8World) {
  return [
    { who: 'Amal', c: await w.as(AMAL, 'en'), from: editorOf() },
    { who: 'Hadeer', c: await w.as(HADEER, 'en'), from: adminOf() },
  ];
}

// ------------------------------------------------------------------ AT-1.1 ----
describe('W8 AT-1.1 set, change and clear: Amal on the editor\'s page and Hadeer on the admin\'s, each press shows its status and the stored row matches', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ dates: false });
  });
  after(async () => w?.close());

  it('W8 AT-1.1 the card on both pages leads to the page in one tap; the page lists Ch1 to Ch5 in order, every row with the same controls', async () => {
    for (const side of await sides(w)) {
      const from = await got(side.c, side.from);
      assert.equal(from.status, 200);
      const card = openCardOf(from.html);
      assert.ok(card, `${side.who}: the Opening dates card`);
      assert.equal(card.heading, EN('openCardTitle'));
      assert.deepEqual({ href: card.href, text: card.text }, { href: openPage(side.from), text: EN('openSetLink') }, `${side.who}: one tap to the page`);
      const page = await got(side.c, openPage(side.from));
      assert.equal(page.status, 200);
      const rows = openRowsOf(page.html);
      assert.deepEqual(rows.map((r) => r.id), CHAPTERS.map((c) => c.id), `${side.who}: Ch1 to Ch5, in outline order`);
      for (const r of rows) {
        assert.equal(r.state, 'none');
        assert.equal(r.stateText, EN('openNone'));
        assert.equal(r.action, openPost(side.from, r.id));
        assert.deepEqual(r.radios, [{ value: 'locked', checked: true }, { value: 'hidden', checked: false }], `${r.id}: two radios, shown locked by default`);
        assert.deepEqual(r.buttons.map((b) => b.value), ['save', 'clear'], `${r.id}: Save and Clear date`);
        assert.equal(r.field.min, '2026-12-09');
        assert.equal(r.field.max, addDays('2026-12-09', 730));
      }
    }
  });

  it('W8 AT-1.1 each side sets, changes and clears Ch2: status line, state line and the stored row each time', async () => {
    for (const side of await sides(w)) {
      // Set: 2026-12-10, shown locked.
      let r = await landed(side.c, await press(side.c, side.from, ID.ch2, { action: 'save', opens_on: '2026-12-10', before: 'locked' }), side.from, ID.ch2);
      assert.deepEqual(r.row.status, { role: 'status', text: EN('openSaved') }, `${side.who}: openSaved in the row's status region`);
      assert.equal(r.row.state, 'locked');
      assert.equal(r.row.stateText, EN('openStateLocked', { date: '2026-12-10' }));
      assert.equal(r.row.field.value, '2026-12-10');
      assert.deepEqual(openingOf(w, ID.ch2), { opens_on: '2026-12-10', opens_hidden: 0 }, `${side.who}: stored`);
      // Change: 2026-12-12, hidden.
      r = await landed(side.c, await press(side.c, side.from, ID.ch2, { action: 'save', opens_on: '2026-12-12', before: 'hidden' }), side.from, ID.ch2);
      assert.equal(r.row.status?.text, EN('openSaved'));
      assert.equal(r.row.state, 'hidden');
      assert.equal(r.row.stateText, EN('openStateHidden', { date: '2026-12-12' }));
      assert.deepEqual(r.row.radios, [{ value: 'locked', checked: false }, { value: 'hidden', checked: true }]);
      assert.deepEqual(openingOf(w, ID.ch2), { opens_on: '2026-12-12', opens_hidden: 1 }, `${side.who}: changed`);
      // Clear.
      r = await landed(side.c, await press(side.c, side.from, ID.ch2, { action: 'clear' }), side.from, ID.ch2);
      assert.equal(r.row.status?.text, EN('openCleared'));
      assert.equal(r.row.state, 'none');
      assert.equal(r.row.field.value, '');
      assert.deepEqual(openingOf(w, ID.ch2), { opens_on: null, opens_hidden: 0 }, `${side.who}: cleared, the choice back to shown locked`);
    }
  });

  it('W8 AT-1.1 what one side set shows on the other side\'s page', async () => {
    const [amal, hadeer] = await sides(w);
    await press(amal.c, amal.from, ID.ch4, { action: 'save', opens_on: '2026-12-20', before: 'locked' });
    const seen = openRowsOf((await got(hadeer.c, openPage(hadeer.from))).html).find((r) => r.id === ID.ch4)!;
    assert.equal(seen.stateText, EN('openStateLocked', { date: '2026-12-20' }));
    assert.equal(seen.status, null, 'no status line without a press');
    await press(hadeer.c, hadeer.from, ID.ch4, { action: 'clear' });
    assert.equal(openRowsOf((await got(amal.c, openPage(amal.from))).html).find((r) => r.id === ID.ch4)!.state, 'none');
  });
});

// ------------------------------------------------------------------ AT-1.2 ----
describe('W8 AT-1.2 refused: a date before today, after today + 730, a malformed date, a chapter of another subject or space; nothing is stored', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ dates: false });
  });
  after(async () => w?.close());

  it('W8 AT-1.2 dates out of range or malformed answer 400 with openInvalid on the row, on both addresses', async () => {
    const before = openingSnapshot(w);
    for (const side of await sides(w)) {
      for (const bad of ['2026-12-08', addDays('2026-12-09', 731), '2026-02-30', '2026-13-01', 'tomorrow', '10/12/2026', '2026-12-1']) {
        const res = await press(side.c, side.from, ID.ch2, { action: 'save', opens_on: bad, before: 'locked' });
        assert.equal(res.status, 400, `${side.who}: ${bad} refused`);
        const row = openRowsOf(await res.text()).find((r) => r.id === ID.ch2)!;
        assert.equal(row.error, EN('openInvalid', { date: addDays('2026-12-09', 730) }), `${side.who}: ${bad}: openInvalid under the field`);
      }
      const odd = await press(side.c, side.from, ID.ch2, { action: 'save', opens_on: '2026-12-20', before: 'sometimes' });
      assert.equal(odd.status, 400, `${side.who}: an unknown choice is refused`);
    }
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });

  it('W8 AT-1.2 today and today + 730 are accepted (the bounds themselves)', async () => {
    const [amal] = await sides(w);
    assert.equal((await press(amal.c, amal.from, ID.ch1, { action: 'save', opens_on: '2026-12-09', before: 'locked' })).status, 303);
    assert.equal((await press(amal.c, amal.from, ID.ch4, { action: 'save', opens_on: addDays('2026-12-09', 730), before: 'hidden' })).status, 303);
    assert.deepEqual(openingOf(w, ID.ch4), { opens_on: addDays('2026-12-09', 730), opens_hidden: 1 });
    await press(amal.c, amal.from, ID.ch1, { action: 'clear' });
    await press(amal.c, amal.from, ID.ch4, { action: 'clear' });
  });

  it('W8 AT-1.2 a chapter of another subject, of another space, or no chapter at all answers 404 on both addresses', async () => {
    const before = openingSnapshot(w);
    for (const side of await sides(w)) {
      for (const id of [ID.sciCh, ID.otherCh, 'w8-chap-0000-0000-0000-000000000099']) {
        for (const action of ['save', 'clear'] as const) {
          const res = await press(side.c, side.from, id, { action, opens_on: '2026-12-20', before: 'locked' });
          assert.equal(res.status, 404, `${side.who}: ${action} on ${id}`);
        }
      }
    }
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });

  it('W8 AT-1.2 Amal on Science\'s address (not her subject) and on another space\'s answers 403', async () => {
    const before = openingSnapshot(w);
    const amal = await w.as(AMAL, 'en');
    assert.equal((await got(amal, openPage(editorOf(ID.science)))).status, 403);
    assert.equal((await press(amal, editorOf(ID.science), ID.sciCh, { action: 'save', opens_on: '2026-12-20' })).status, 403);
    const elsewhere = `/s/${ID.otherSpace}/publish/edit/${ID.otherSubject}`;
    assert.equal((await press(amal, elsewhere, ID.otherCh, { action: 'save', opens_on: '2026-12-20' })).status, 403);
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });
});

// ------------------------------------------------------------------ AT-1.3 ----
describe('W8 AT-1.3 Salma, Mona and Karim (publisher of another subject) get 403 on both page addresses and both POST addresses', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World();
  });
  after(async () => w?.close());

  it('W8 AT-1.3 403 on GET and POST, editor and admin addresses; nothing stored', async () => {
    const before = openingSnapshot(w);
    for (const who of [SALMA, MONA, KARIM]) {
      const c = await w.as(who, 'en');
      for (const from of [editorOf(), adminOf()]) {
        assert.equal((await got(c, openPage(from))).status, 403, `${who.display_name}: GET ${openPage(from)}`);
        for (const action of ['save', 'clear'] as const) {
          const res = await press(c, from, ID.ch2, { action, opens_on: '2026-12-20', before: 'hidden' });
          assert.equal(res.status, 403, `${who.display_name}: POST ${action} ${openPost(from, ID.ch2)}`);
        }
      }
    }
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });

  it('W8 AT-1.3 signed out: no page, no write', async () => {
    const before = openingSnapshot(w);
    const { Client } = await import('../support/http.ts');
    const anon = new Client(w.url);
    const page = await anon.get(openPage(editorOf()));
    assert.ok(page.status === 302 || page.status === 403, `signed out GET answers ${page.status}`);
    const post = await press(anon, editorOf(), ID.ch2, { action: 'clear' });
    assert.ok(post.status === 302 || post.status === 403, `signed out POST answers ${post.status}`);
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });
});

// ------------------------------------------------------------------ AT-1.4 ----
describe('W8 AT-1.4 Clear returns the row to "No opening date" and the chapter is open to Salma at the next load; Clear on a row without a date stores nothing', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World();
  });
  after(async () => w?.close());

  it('W8 AT-1.4 Clear on Ch2: openCleared, "No opening date", stored NULL, Salma opens Ch2\'s lesson and file', async () => {
    const amal = await w.as(AMAL, 'en');
    const { row } = await landed(amal, await press(amal, editorOf(), ID.ch2, { action: 'clear' }), editorOf(), ID.ch2);
    assert.equal(row.status?.text, EN('openCleared'));
    assert.equal(row.stateText, EN('openNone'));
    assert.deepEqual(openingOf(w, ID.ch2), { opens_on: null, opens_hidden: 0 });
    const salma = await w.as(SALMA, 'en');
    const outline = await got(salma, `/s/${ID.space}/learn/${ID.math}`);
    assert.equal(outline.status, 200);
    assert.ok(outline.html.includes(`href="/s/${ID.space}/read/${ID.l21}"`), 'Ch2\'s lesson is a link on Salma\'s outline');
    assert.equal((await salma.get(`/s/${ID.space}/read/${ID.l21}`)).status, 200, 'Salma opens Ch2\'s lesson');
    assert.equal((await salma.get(`/s/${ID.space}/file/${ID.pdf}`)).status, 200, 'and its file');
  });

  it('W8 AT-1.4 Clear on Ch1 (no date): the same message, nothing stored', async () => {
    const before = openingSnapshot(w);
    const hadeer = await w.as(HADEER, 'en');
    const { row } = await landed(hadeer, await press(hadeer, adminOf(), ID.ch1, { action: 'clear' }), adminOf(), ID.ch1);
    assert.equal(row.status?.text, EN('openCleared'));
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });
});

// ------------------------------------------------------------------ AT-1.5 ----
describe('W8 AT-1.5 removing and restoring Ch2 keeps its date and choice', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World();
  });
  after(async () => w?.close());

  it('W8 AT-1.5 a removed Ch2 is not listed and keeps its row; restored, it is listed with the same date and choice', async () => {
    const amal = await w.as(AMAL, 'en');
    await press(amal, editorOf(), ID.ch2, { action: 'save', opens_on: '2026-12-10', before: 'hidden' });
    const stored = openingOf(w, ID.ch2);
    assert.deepEqual(stored, { opens_on: '2026-12-10', opens_hidden: 1 });
    // The product's own removal: the file, the two lessons, then the chapter.
    for (const path of [`item/${ID.pdf}`, `compose/${ID.l21}`, `compose/${ID.l22}`, `part/${ID.ch2}`]) {
      const res = await amal.post(`/s/${ID.space}/publish/${path}/remove`, {});
      assert.equal(res.status, 303, `remove ${path}`);
    }
    assert.ok(w.sql('SELECT removed_at FROM chapter WHERE id = ?', ID.ch2)[0].removed_at, 'Ch2 is removed');
    const page = await got(amal, openPage(editorOf()));
    assert.deepEqual(openRowsOf(page.html).map((r) => r.id), [ID.ch1, ID.ch3, ID.ch4, ID.ch5], 'a removed chapter is not listed');
    assert.equal((await press(amal, editorOf(), ID.ch2, { action: 'clear' })).status, 404, 'a removed chapter cannot be dated or cleared');
    assert.deepEqual(openingOf(w, ID.ch2), stored, 'kept while removed');
    assert.equal((await amal.post(`/s/${ID.space}/publish/part/${ID.ch2}/restore`, {})).status, 303, 'restored');
    const back = openRowsOf((await got(amal, openPage(editorOf()))).html);
    assert.deepEqual(back.map((r) => r.id), CHAPTERS.map((c) => c.id));
    assert.equal(back.find((r) => r.id === ID.ch2)!.stateText, EN('openStateHidden', { date: '2026-12-10' }));
    assert.deepEqual(openingOf(w, ID.ch2), stored, 'the same date and choice');
  });
});

// ------------------------------------------------------------------ AT-1.6 ----
describe('W8 AT-1.6 the page warns on Ch2: its due date 2026-12-08 is before its opening date 2026-12-10', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World();
  });
  after(async () => w?.close());

  it('W8 AT-1.6 openDueWarn on Ch2 only, on both addresses', async () => {
    for (const side of await sides(w)) {
      const rows = openRowsOf((await got(side.c, openPage(side.from))).html);
      for (const r of rows) assert.equal(r.lines.includes('openDueWarn'), r.id === ID.ch2, `${side.who}: ${r.id}`);
      const ch2 = rows.find((r) => r.id === ID.ch2)!;
      assert.ok(ch2.html.includes(EN('openDueWarn')), 'the warning text');
    }
  });

  it('W8 AT-1.6 a chapter\'s own due date counts too; a due date on or after the opening date gives no warning', async () => {
    w.run('UPDATE chapter SET due_on = ? WHERE id = ?', '2026-12-12', ID.ch3);
    w.run('UPDATE lesson SET due_on = ? WHERE id = ?', '2026-12-10', ID.l21);
    const amal = await w.as(AMAL, 'en');
    let rows = openRowsOf((await got(amal, openPage(editorOf()))).html);
    assert.ok(rows.find((r) => r.id === ID.ch3)!.lines.includes('openDueWarn'), 'Ch3: its own due 2026-12-12 before 2026-12-17');
    assert.ok(!rows.find((r) => r.id === ID.ch2)!.lines.includes('openDueWarn'), 'Ch2: due on the opening day');
    w.run('UPDATE chapter SET due_on = NULL WHERE id = ?', ID.ch3);
    w.run('UPDATE lesson SET due_on = ? WHERE id = ?', '2026-12-08', ID.l21);
    rows = openRowsOf((await got(amal, openPage(editorOf()))).html);
    assert.ok(rows.find((r) => r.id === ID.ch2)!.lines.includes('openDueWarn'));
  });
});

// ------------------------------------------------------------------ AT-1.7 ----
describe('W8 AT-1.7 Save with an empty date is refused with 400 openNeedsDate, and nothing is stored', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World();
  });
  after(async () => w?.close());

  it('W8 AT-1.7 on a row without a date and on a dated row, either choice, both addresses', async () => {
    const before = openingSnapshot(w);
    for (const side of await sides(w)) {
      for (const [id, choice] of [[ID.ch1, 'hidden'], [ID.ch2, 'hidden'], [ID.ch2, 'locked'], [ID.ch3, 'locked']] as const) {
        for (const empty of ['', '   ']) {
          const res = await press(side.c, side.from, id, { action: 'save', opens_on: empty, before: choice });
          assert.equal(res.status, 400, `${side.who}: ${id} ${choice}`);
          const row = openRowsOf(await res.text()).find((r) => r.id === id)!;
          assert.equal(row.error, EN('openNeedsDate'), 'openNeedsDate under the field');
        }
      }
    }
    assert.equal(openingSnapshot(w), before, 'nothing stored');
  });
});

// ------------------------------------------------------------------ AT-1.8 ----
describe('W8 AT-1.8 at 2026-12-11, re-sending Ch2\'s stored date 2026-12-10 with "hidden" stores the choice only; Salma\'s pages are unchanged', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ atMs: AT8.d11 });
  });
  after(async () => w?.close());

  it('W8 AT-1.8 the passed date re-sent: 303 openSaved, the choice stored, the date kept; again with the same choice stores nothing', async () => {
    const salma = await w.as(SALMA, 'en');
    const pages = [`/s/${ID.space}`, `/s/${ID.space}/learn/${ID.math}`, `/s/${ID.space}/read/${ID.l21}`, `/s/${ID.space}/read/${ID.l31}`];
    const seen = async () => Promise.all(pages.map(async (p) => {
      const r = await salma.get(p);
      return `${r.status}\n${await r.text()}`;
    }));
    // The first visit records her opens (lesson activity is on) and moves "Continue": the second is the one compared.
    await seen();
    const beforePages = await seen();
    const amal = await w.as(AMAL, 'en');
    const page = openRowsOf((await got(amal, openPage(editorOf()))).html).find((r) => r.id === ID.ch2)!;
    assert.equal(page.stateText, EN('openSince', { date: '2026-12-10' }), 'a passed date reads "Open since"');
    assert.equal(page.field.value, '', 'the field is empty when the date has passed');
    const { row } = await landed(amal, await press(amal, editorOf(), ID.ch2, { action: 'save', opens_on: '2026-12-10', before: 'hidden' }), editorOf(), ID.ch2);
    assert.equal(row.status?.text, EN('openSaved'));
    assert.deepEqual(openingOf(w, ID.ch2), { opens_on: '2026-12-10', opens_hidden: 1 }, 'the choice only');
    const snap = openingSnapshot(w);
    assert.equal((await press(amal, editorOf(), ID.ch2, { action: 'save', opens_on: '2026-12-10', before: 'hidden' })).status, 303);
    assert.equal(openingSnapshot(w), snap, 'the same date and choice store nothing');
    assert.deepEqual(await seen(), beforePages, 'Salma\'s pages are unchanged');
  });

  it('W8 AT-1.8 another passed date (not the stored one) is refused', async () => {
    const amal = await w.as(AMAL, 'en');
    const snap = openingSnapshot(w);
    assert.equal((await press(amal, editorOf(), ID.ch2, { action: 'save', opens_on: '2026-12-09', before: 'hidden' })).status, 400);
    assert.equal(openingSnapshot(w), snap);
  });
});

// ------------------------------------------------------------------ AT-1.9 ----
describe('W8 AT-1.9 with Open in order on at 2026-12-09: openStartedWarn on Ch1 and Ch4, openOrderCascade on Ch2, neither on Ch3 or Ch5; with it off, no cascade', { concurrency: false }, () => {
  it('W8 AT-1.9 Open in order on', async () => {
    const w = await w8World({ inOrder: true, atMs: AT8.d9 });
    try {
      for (const side of await sides(w)) {
        const rows = openRowsOf((await got(side.c, openPage(side.from))).html);
        const lines = Object.fromEntries(rows.map((r) => [r.id, r.lines.filter((l) => l !== 'openDueWarn')]));
        assert.deepEqual(lines, {
          [ID.ch1]: ['openStartedWarn'], [ID.ch2]: ['openOrderCascade'], [ID.ch3]: [], [ID.ch4]: ['openStartedWarn'], [ID.ch5]: [],
        }, side.who);
        const ch2 = rows.find((r) => r.id === ID.ch2)!;
        assert.ok(ch2.html.includes(EN('openOrderCascade', { title: 'Fractions' }).split('Fractions')[0]), 'the cascade sentence');
      }
    } finally {
      await w.close();
    }
  });

  it('W8 AT-1.9 Open in order off: no row shows openOrderCascade; the started lines are the same', async () => {
    const w = await w8World({ inOrder: false, atMs: AT8.d9 });
    try {
      for (const side of await sides(w)) {
        const rows = openRowsOf((await got(side.c, openPage(side.from))).html);
        assert.ok(!rows.some((r) => r.lines.includes('openOrderCascade')), side.who);
        assert.deepEqual(rows.filter((r) => r.lines.includes('openStartedWarn')).map((r) => r.id), [ID.ch1, ID.ch4]);
      }
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.1 ----
describe('W8 AT-4.1 Amal\'s and Hadeer\'s editor, admin and Opening dates pages show all five chapters; no page they reach shows a learner\'s lock state', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ inOrder: true });
  });
  after(async () => w?.close());

  it('W8 AT-4.1 all five chapters (two of them dated, one hidden) on Amal\'s editor and on both Opening dates and due-dates pages', async () => {
    // At a41f7d8 the admin's subject page lists no chapter at all (it filters none out): Hadeer sees the chapters on the
    // Opening dates and due-dates pages it links to (T1; named in CANDIDATE READY).
    for (const side of await sides(w)) {
      const paths = side.who === 'Amal' ? [side.from, openPage(side.from), `${side.from}/due`] : [openPage(side.from), `${side.from}/due`];
      for (const path of paths) {
        const page = await got(side.c, path);
        assert.equal(page.status, 200, `${side.who}: ${path}`);
        for (const ch of CHAPTERS) assert.ok(page.html.includes(`>${ch.title}<`), `${side.who}: ${path} shows ${ch.title}`);
      }
      const course = await got(side.c, side.from);
      assert.equal(course.status, 200);
      const named = CHAPTERS.filter((ch) => course.html.includes(`>${ch.title}<`)).length;
      assert.ok(named === 0 || named === CHAPTERS.length, `${side.who}: ${side.from} lists every chapter or none (${named})`);
    }
  });

  it('W8 AT-4.1 no page they reach from these pages shows a learner\'s lock state (wave 4\'s tag, reason or locked fold), and the Opening dates page names no learner', async () => {
    // Every page of Mathematics' teacher side reachable from the editor or the admin's subject page (not the preview, which is
    // a new learner's view by A1 and comes with W8-1b, and not removal or sign-out steps).
    const LOCK = /class="(?:lock-tag|lock-reason|lock-line|lock-item|card fold locked)"/;
    for (const side of await sides(w)) {
      const seen = new Set<string>();
      const queue = [side.from];
      while (queue.length && seen.size < 150) {
        const path = queue.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);
        const res = await side.c.get(path);
        if (res.status !== 200 || !(res.headers.get('content-type') ?? '').startsWith('text/html')) continue;
        const html = await res.text();
        assert.ok(!LOCK.test(html), `${side.who}: ${path} shows no lock state`);
        for (const m of html.matchAll(/href="(\/s\/[^"#?]*)"/g)) {
          const next = m[1];
          if (!seen.has(next) && next.startsWith(`/s/${ID.space}/`) && !/\/(preview|remove|signout)\b/.test(next) && (next.includes(ID.math) || /\/(part|compose|item)\//.test(next))) queue.push(next);
        }
      }
      assert.ok(seen.has(openPage(side.from)), `${side.who}: the crawl reached the Opening dates page`);
      const page = (await got(side.c, openPage(side.from))).html;
      for (const name of ['Salma Test', 'Omar Test', 'Rana Test', 'Mona Test']) assert.ok(!page.includes(name), `${side.who}: the Opening dates page names no ${name}`);
      // A shown-locked chapter before its date: the page states the date, never "locked" for a person.
      assert.ok(!page.includes(EN('lockedTag')), `${side.who}: no "${EN('lockedTag')}" tag`);
    }
  });
});
