// LMS wave 8, W8-1b (product-contract v2 on PIL-299, AT-3.1 to AT-3.6;
// section 3.5, C1 to C6): opening dates together with wave 4's "Open in
// order". World W8-a with Mathematics in order (test/wave8/world.ts), the
// clock at 2026-12-09 and Salma Test with Ch1 done, unless a step says
// otherwise. One describe per labelled expectation, each its own CI step
// (`W8 AT-3.<n> ...`); AT-3.7 is in test/wave6/at2.test.ts and AT-3.8 is the
// wave 4 suite, untouched. Strings are asserted by ui.ts key.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AT8, ID, OMAR, SALMA, textOf, w8World, words8, type W8World } from './world.ts';
import { S, cardOf, continueOf, donePath, got, lessonLinks, lessonPath, marksOf, outlineOf, shown, subjectPath } from './learner.ts';

const EN = words8('school', 'en');
const CH2_LESSONS = [ID.l21, ID.l22];
const at = (ms: number) => new Date(ms).toISOString();

/** Wave 4's line naming a chapter, with the count left. */
const orderLine = (title: string, left: number) => textOf(EN('lockedReason', {
  title,
  count: left === 1 ? EN('lockedCountOne', { lesson: EN('lesson').toLocaleLowerCase('en') }) : EN('lockedCount', { n: String(left) }),
}));
const dateLine = (date: string) => EN('openedOn', { date: shown(date) });

/** W8-a in order at 2026-12-09 noon, Salma with Ch1 done (marked before the day). */
async function inOrderWorld(atMs = AT8.d9): Promise<W8World> {
  const w = await w8World({ inOrder: true, atMs });
  for (const id of [ID.l11, ID.l12]) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
  return w;
}

// ------------------------------------------------------------------ AT-3.1 ----
describe('W8 AT-3.1 in order at 2026-12-09: Ch2 shows only the date line, Ch4 wave 4\'s line naming Ch2, Ch3 is absent and outside the order rule, Ch5 the tag and the date line', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld();
  });
  after(async () => w?.close());

  it('W8 AT-3.1 Salma (Ch1 done) and Omar (Ch1 done by him, no Ch3 mark): the same reasons; Ch4\'s count leaves Ch3 out', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    for (const id of [ID.l11, ID.l12]) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, OMAR.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
    for (const who of [SALMA, OMAR]) {
      const chapters = outlineOf((await got(await w.as(who, 'en'), subjectPath())).html);
      const ch = (id: string) => chapters.find((x) => x.id === id);
      assert.equal(ch(ID.ch3), undefined, `${who.key}: Ch3 absent`);
      assert.ok(!ch(ID.ch1)!.locked, `${who.key}: Ch1 open`);
      assert.deepEqual(ch(ID.ch2)!.reasons, [{ kind: 'date', text: dateLine('2026-12-10') }], `${who.key}: Ch2 only the date line`);
      assert.deepEqual(ch(ID.ch4)!.reasons, [{ kind: 'order', text: orderLine('Fractions', 2) }], `${who.key}: Ch4 wave 4's line naming Ch2 (2 left: Ch3 is not counted)`);
      assert.ok(ch(ID.ch5)!.tag, `${who.key}: Ch5 the tag`);
      assert.deepEqual(ch(ID.ch5)!.reasons, [{ kind: 'date', text: dateLine('2026-12-10') }], `${who.key}: Ch5 the date line only (empty: no order line)`);
    }
  });
});

// ------------------------------------------------------------------ AT-3.2 ----
describe('W8 AT-3.2 "Go to" and Continue never lead into Ch2', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld();
  });
  after(async () => w?.close());

  it('W8 AT-3.2 Salma at 2026-12-09: no Go to (nothing open is left to do), no link into Ch2 on the home, the card or Continue; Omar (no marks): Go to leads to Ch1', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    const c = await w.as(SALMA, 'en');
    const outline = (await got(c, subjectPath())).html;
    assert.doesNotMatch(outline, /id="go-to"/, 'Salma: no Go to');
    const home = (await got(c, S)).html;
    for (const id of CH2_LESSONS) {
      assert.ok(!lessonLinks(home).includes(id), `Salma home: no link to ${id}`);
      assert.ok(!continueOf(home).links.includes(id), `Salma Continue: no link to ${id}`);
    }
    for (const page of [outline, (await got(c, lessonPath(ID.l21))).html]) assert.ok(!/id="go-to"[^>]*href="[^"]*(w8-less-0000-0000-0000-00000000002\d)/.test(page), 'no Go to into Ch2');
    const omar = (await got(await w.as(OMAR, 'en'), subjectPath())).html;
    assert.match(omar, new RegExp(`<a id="go-to" class="button go-to" href="/s/${ID.space}/read/${ID.l11}"`), 'Omar: Go to leads to Ch1\'s first lesson');
  });
});

// ------------------------------------------------------------------ AT-3.3 ----
describe('W8 AT-3.3 the card shows "Next: … Fractions, opens on 2026-12-10"', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld();
  });
  after(async () => w?.close());

  it('W8 AT-3.3 Salma\'s card and Continue: openNext as plain text, no link', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    const home = (await got(await w.as(SALMA, 'en'), S)).html;
    const card = cardOf(home);
    const expected = EN('openNext', { title: 'Fractions', date: shown('2026-12-10') });
    assert.equal(card.next, expected, 'the card\'s line');
    assert.match(expected, /Fractions, opens on Dec 10\.$/);
    assert.deepEqual(card.links.filter((id) => CH2_LESSONS.includes(id)), [], 'no link into Ch2 on the card');
    assert.ok(continueOf(home).text.includes(expected), 'Continue shows the same line');
  });
});

// ------------------------------------------------------------------ AT-3.4 ----
describe('W8 AT-3.4 marking the last Ch1 lesson done never says "Fractions is open now"', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld();
    w.run('DELETE FROM done_mark WHERE learner_user_id = ? AND lesson_id = ?', SALMA.id, ID.l12);
  });
  after(async () => w?.close());

  it('W8 AT-3.4 Salma marks Ch1\'s last lesson: the address has no opened flag and the page no markedOpened line', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    const c = await w.as(SALMA, 'en');
    const res = await c.post(donePath(ID.l12), { state: 'done' });
    assert.equal(res.status, 303);
    const loc = res.headers.get('location') ?? '';
    assert.ok(!loc.includes('opened=1'), `no opened flag: ${loc}`);
    const page = (await got(c, loc.replace(/#.*$/, ''))).html;
    assert.doesNotMatch(page, /id="open-change"/, 'no open-change line');
    assert.ok(!page.includes(EN('markedOpened', { title: 'Fractions' })), 'never "Fractions is open now"');
    // Even with the flag forced into the address, Ch2 is not open, so nothing says so.
    const forced = (await got(c, `${lessonPath(ID.l12)}?marked=done&opened=1`)).html;
    assert.ok(!forced.includes(EN('markedOpened', { title: 'Fractions' })), 'a forced flag says nothing either');
  });
});

// ------------------------------------------------------------------ AT-3.5 ----
describe('W8 AT-3.5 Omar finishes Ch1 and Ch2 between 10 and 16 December and marks a Ch4 lesson; at 2026-12-17 Ch3 appears and his Ch4 relocks behind Ch3, marks kept; Salma is not relocked', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld(AT8.d10);
  });
  after(async () => w?.close());

  it('W8 AT-3.5 Omar\'s marks by the real form on 10 and 11 December, then the outline at 2026-12-16 and 2026-12-17', async (t) => {
    const omar = await w.as(OMAR, 'en');
    const salma = await w.as(SALMA, 'en');
    t.diagnostic(`instant ${at(AT8.d10)}`);
    for (const id of [ID.l11, ID.l12]) assert.equal((await omar.post(donePath(id), { state: 'done' })).status, 303, `Omar marks ${id}`);
    await w.clock(AT8.d11);
    t.diagnostic(`instant ${at(AT8.d11)}`);
    for (const id of [ID.l21, ID.l22, ID.l41]) assert.equal((await omar.post(donePath(id), { state: 'done' })).status, 303, `Omar marks ${id} (Ch3 hidden and outside the order rule: Ch4 open)`);
    for (const id of [ID.l21, ID.l22]) assert.equal((await salma.post(donePath(id), { state: 'done' })).status, 303, `Salma marks ${id}`);
    await w.clock(Date.parse('2026-12-16T12:00:00.000Z'));
    assert.ok(!outlineOf((await got(omar, subjectPath())).html).find((x) => x.id === ID.ch4)!.locked, '16 December: Omar\'s Ch4 open');
    await w.clock(AT8.d17);
    t.diagnostic(`instant ${at(AT8.d17)}`);
    const o = outlineOf((await got(omar, subjectPath())).html);
    const ch3 = o.find((x) => x.id === ID.ch3);
    assert.ok(ch3 && !ch3.locked, 'Omar: Ch3 appears, open');
    assert.deepEqual(o.find((x) => x.id === ID.ch4)!.reasons, [{ kind: 'order', text: orderLine('Revision', 1) }], 'Omar: Ch4 relocks behind Ch3');
    assert.ok(marksOf(w, OMAR.id).includes(ID.l41), 'Omar\'s Ch4 mark is kept');
    assert.equal((await omar.get(lessonPath(ID.l41))).status, 200);
    const s = outlineOf((await got(salma, subjectPath())).html);
    assert.ok(!s.find((x) => x.id === ID.ch4)!.locked, 'Salma (Ch3 marked before it was hidden): Ch4 not relocked');
  });
});

// ------------------------------------------------------------------ AT-3.6 ----
describe('W8 AT-3.6 both reasons: Ch2 with Ch1 not done and before day X shows the date line, then wave 4\'s line', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await inOrderWorld();
  });
  after(async () => w?.close());

  it('W8 AT-3.6 Omar (no marks) at 2026-12-09: outline and the locked lesson page, date line first', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    const c = await w.as(OMAR, 'en');
    const ch2 = outlineOf((await got(c, subjectPath())).html).find((x) => x.id === ID.ch2)!;
    assert.deepEqual(ch2.reasons, [{ kind: 'date', text: dateLine('2026-12-10') }, { kind: 'order', text: orderLine('Numbers', 2) }], 'outline: the date line, then wave 4\'s line');
    const page = (await got(c, lessonPath(ID.l21))).html;
    const reason = /<p id="lock-reason"[^>]*>([\s\S]*?)<\/p>/.exec(page)?.[1] ?? '';
    const d = reason.indexOf('data-reason="date"');
    const o = reason.indexOf('<span class="lock-reason">');
    assert.ok(d >= 0 && o > d, 'the locked page: the date line, then wave 4\'s line');
    assert.equal(textOf(reason), `${dateLine('2026-12-10')} ${orderLine('Numbers', 2)}`);
  });
});
