// LMS wave 6, W6-1a (product-contract v2 on PIL-257, AT-1): set, change and
// clear a due date, by the teacher (Hadeer, from the Mathematics editor) and
// the admin (Amal, from the Mathematics admin page), with script on and off,
// and every refused case. One describe per labelled expectation, each its own
// CI step (`W6 AT-1.<n> ...`, selected with --test-name-pattern), each on a
// fresh world with the clock pinned (W6-c). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { OWNER, signedIn } from '../support/seed.ts';
import {
  ADMIN, AT, D, HADEER, MONA, OMAR, SALMA, SHIMAA, adminDue, as, browserAs, clockAt, closeWave6, dPlus, dueCardOf, dueOf, duePost, dueRowsOf, dueSnapshot,
  editorPath, markPath, publisherDue, adminOrder, saveDue, topicPath, wave6World, withW6b, words, type W6a, type Wave1World,
} from './world.ts';

const EN = words('school', 'en');
const AR = words('school', 'ar');

/** The ids of a subject's outline as the due-dates page must list them: each chapter not removed, then its lessons not removed, in order. */
async function outlineIds(w: Wave1World, subjectId: string): Promise<string[]> {
  const rows = await w.p.sql(`SELECT c.id AS cid, l.id AS lid FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
    WHERE c.subject_id = '${subjectId}' AND c.removed_at IS NULL ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`);
  const out: string[] = [];
  for (const r of rows) {
    if (!out.includes(String(r.cid))) out.push(String(r.cid));
    if (r.lid) out.push(String(r.lid));
  }
  return out;
}

/** Hadeer's and Amal's clients, each with the page the card sits on and the due-dates page reached from it. */
async function sides(w: Wave1World, lang: 'ar' | 'en' = 'en') {
  const s = w.school;
  return [
    { who: 'Hadeer', c: await as(w, HADEER, lang), from: editorPath(s, s.math), page: publisherDue(s, s.math) },
    { who: 'Amal', c: await as(w, ADMIN, lang), from: topicPath(s, s.math), page: adminDue(s, s.math) },
  ];
}

const status = async (c: Awaited<ReturnType<typeof sides>>[number]['c'], path: string) => {
  const res = await c.get(path);
  return { status: res.status, html: await res.text() };
};

// ------------------------------------------------------------------ AT-1.1 ----
describe('W6 AT-1.1 set: the due card on the editor and the subject admin page, the due-dates page lists the outline, saving answers 303 to the row with dueSaved, each page shows what the other set', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let browser: Browser;
  before(async () => {
    ({ w, a } = await wave6World());
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await closeWave6(w);
  });

  it('W6 AT-1.1 the card and its link on both pages; the page lists every chapter and lesson not removed, in outline order, each with its own form', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const expected = await outlineIds(w, w.school.math);
    for (const side of await sides(w)) {
      const from = await status(side.c, side.from);
      assert.equal(from.status, 200);
      const card = dueCardOf(from.html);
      assert.ok(card, `${side.who}: the due card (id="due-dates")`);
      assert.equal(card.heading, EN('dueCardTitle'));
      assert.deepEqual(card.link, { href: side.page, text: EN('dueSetLink') }, `${side.who}: the link to the due-dates page`);
      assert.ok(from.html.indexOf('id="announcements"') < card.at, `${side.who}: after the announcement card`);
      const page = await status(side.c, side.page);
      assert.equal(page.status, 200, `${side.who}: GET ${side.page}`);
      const rows = dueRowsOf(page.html);
      assert.deepEqual(rows.map((r) => r.id), expected, `${side.who}: every chapter and lesson not removed, in outline order`);
      assert.ok(!rows.some((r) => r.id === a.L.L7), 'the removed lesson L7 is not listed');
      for (const r of rows) {
        assert.equal(r.save.action, duePost(side.page, r.kind, r.id), `${r.id}: its own form`);
        assert.equal(r.save.text, EN('dueSave'));
        assert.equal(r.field.max, dPlus(730), `${r.id}: max = D+730`);
      }
      assert.equal(rows.find((r) => r.id === a.C3)!.empty, EN('dueChapterEmpty', { lesson: 'lesson' }), 'C3 (no lesson) shows dueChapterEmpty');
      assert.equal(rows.filter((r) => r.empty).length, 1, 'only C3 has no lesson');
      assert.match(page.html, /<input type="date" id="due-w6a-l6" name="due_on" value="" min="2026-12-10" max="2028-12-09">/, 'L6: an empty date field with min D and max D+730');
    }
  });

  it('W6 AT-1.1 saving D+5 on L6 (lesson) and on C3 (chapter) answers 303 to ?due=saved&item=<id>#item-<id>; the row says dueSaved and holds the date; each page shows what the other set', async () => {
    const [hadeer, amal] = await sides(w);
    const loc = await saveDue(hadeer.c, hadeer.page, 'lesson', a.L.L6, dPlus(5));
    assert.equal(loc, `${hadeer.page}?due=saved&item=${a.L.L6}#item-${a.L.L6}`);
    assert.equal(await dueOf(w, 'lesson', a.L.L6), dPlus(5), 'stored');
    const after = dueRowsOf((await status(hadeer.c, loc.split('#')[0])).html);
    const l6 = after.find((r) => r.id === a.L.L6)!;
    assert.equal(l6.status, EN('dueSaved'), 'dueSaved on that row');
    assert.equal(after.filter((r) => r.status).length, 1, 'on that row only');
    assert.equal(l6.field.value, dPlus(5), 'the stored date in the field');
    assert.equal(l6.value, EN('dueOn', { date: dPlus(5) }));
    // Amal sets the chapter C3 from the admin page; each page shows the other's.
    const at = await saveDue(amal.c, amal.page, 'chapter', a.C3, dPlus(4));
    assert.equal(at, `${amal.page}?due=saved&item=${a.C3}#item-${a.C3}`);
    assert.equal(await dueOf(w, 'chapter', a.C3), dPlus(4));
    const onAdmin = dueRowsOf((await status(amal.c, amal.page)).html);
    assert.equal(onAdmin.find((r) => r.id === a.L.L6)!.field.value, dPlus(5), 'the admin page shows Hadeer\'s date');
    const onEditor = dueRowsOf((await status(hadeer.c, hadeer.page)).html);
    assert.equal(onEditor.find((r) => r.id === a.C3)!.field.value, dPlus(4), 'the editor\'s page shows Amal\'s date');
    assert.equal(onEditor.find((r) => r.id === a.C3)!.status, null, 'no status without ?due=');
  });

  it('W6 AT-1.1 with script on (Hadeer, phone, Arabic) and off (Amal, desktop, English): the real form saves, lands on #item-<id> and shows the status', async () => {
    for (const [who, person, page, script, lang, date] of [
      ['Hadeer', HADEER, publisherDue(w.school, w.school.math), true, 'ar', dPlus(9)],
      ['Amal', ADMIN, adminDue(w.school, w.school.math), false, 'en', dPlus(11)],
    ] as const) {
      const { ctx, page: tab } = await browserAs(browser, w, person, { lang, script, width: script ? 'phone' : 'desktop' });
      try {
        await tab.goto(w.p.url + page);
        await tab.fill(`#due-${a.L.L5}`, date);
        await Promise.all([tab.waitForEvent('load'), tab.click(`#item-${a.L.L5} .due-form button[type=submit]`)]);
        assert.equal(new URL(tab.url()).hash, `#item-${a.L.L5}`, `${who}: lands on the row`);
        assert.equal(await dueOf(w, 'lesson', a.L.L5), date, `${who} (script ${script ? 'on' : 'off'}): stored`);
        const said = (await tab.locator(`#item-${a.L.L5} > .due-row .due-status`).innerText()).trim();
        assert.equal(said, (lang === 'ar' ? AR : EN)('dueSaved'), `${who}: the status on the row`);
        assert.equal(await tab.inputValue(`#due-${a.L.L5}`), date, `${who}: the field holds the date`);
      } finally {
        await ctx.close();
      }
    }
  });
});

// ------------------------------------------------------------------ AT-1.2 ----
describe('W6 AT-1.2 change and clear: another date replaces it; dueClear posts an empty value, 303 cleared, the row shows dueNone; clearing an empty row stores nothing', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-1.2 last save wins; Clear only on a row with a date; cleared shows dueCleared and dueNone; a stale ?due= shows no status', async () => {
    const [hadeer, amal] = await sides(w);
    await saveDue(hadeer.c, hadeer.page, 'lesson', a.L.L3, dPlus(2));
    await saveDue(amal.c, amal.page, 'lesson', a.L.L3, dPlus(12));
    assert.equal(await dueOf(w, 'lesson', a.L.L3), dPlus(12), 'last save wins');
    const rows = dueRowsOf((await status(hadeer.c, hadeer.page)).html);
    for (const r of rows) {
      const dated = (await dueOf(w, r.kind, r.id)) !== null;
      assert.equal(Boolean(r.clear), dated, `${r.id}: Clear ${dated ? 'shown' : 'not shown'}`);
      if (r.clear) {
        assert.equal(r.clear.action, r.save.action, 'the clear form posts to the row\'s address');
        assert.equal(r.clear.text, EN('dueClear'));
        assert.match(r.html, /<form class="due-clear" method="post" action="[^"]+"><input type="hidden" name="due_on" value="">/, 'an empty due_on');
      } else {
        assert.equal(r.value, EN('dueNone'), `${r.id}: dueNone`);
      }
    }
    for (const side of [hadeer, amal]) {
      const [kind, id] = side === hadeer ? (['lesson', a.L.L3] as const) : (['chapter', a.C2] as const);
      const res = await side.c.post(duePost(side.page, kind, id), { due_on: '' });
      assert.equal(res.status, 303);
      const loc = res.headers.get('location')!;
      assert.equal(loc, `${side.page}?due=cleared&item=${id}#item-${id}`);
      assert.equal(await dueOf(w, kind, id), null, `${side.who}: cleared`);
      const row = dueRowsOf((await status(side.c, loc.split('#')[0])).html).find((r) => r.id === id)!;
      assert.equal(row.status, EN('dueCleared'));
      assert.equal(row.value, EN('dueNone'));
      assert.equal(row.clear, null, 'no Clear once cleared');
      assert.equal(row.field.value, '');
      // A stale address: ?due=saved for a row with no date shows nothing.
      assert.equal(dueRowsOf((await status(side.c, `${side.page}?due=saved&item=${id}`)).html).find((r) => r.id === id)!.status, null, 'no false status');
    }
    // Clearing a row with no date stores nothing and answers the same 303.
    const snap = await dueSnapshot(w);
    const res = await hadeer.c.post(duePost(hadeer.page, 'lesson', a.L.L6), { due_on: '' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `${hadeer.page}?due=cleared&item=${a.L.L6}#item-${a.L.L6}`);
    assert.equal(await dueSnapshot(w), snap, 'nothing stored');
  });
});

// ------------------------------------------------------------------ AT-1.3 ----
describe('W6 AT-1.3 date rules: min and max from the request\'s now(); bad values by direct POST and a stale page refused with dueInvalid, 400, nothing stored; D and D+730 stored; an unchanged past date accepted', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let browser: Browser;
  before(async () => {
    ({ w, a } = await wave6World());
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await closeWave6(w);
  });

  it('W6 AT-1.3 each field: min = the earlier of D and the stored date, max = D+730', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const [hadeer] = await sides(w);
    for (const r of dueRowsOf((await status(hadeer.c, hadeer.page)).html)) {
      const stored = await dueOf(w, r.kind, r.id);
      assert.equal(r.field.min, stored !== null && stored < D ? stored : D, `${r.id}: min`);
      assert.equal(r.field.max, dPlus(730), `${r.id}: max`);
    }
    assert.equal(dueRowsOf((await status(hadeer.c, hadeer.page)).html).find((r) => r.id === a.L.L1)!.field.min, dPlus(-3), 'L1 (stored D-3) keeps its own date valid');
  });

  it('W6 AT-1.3 by direct POST: 2026-02-30, 20261201, abc, D-1 and D+731 answer 400 with dueInvalid naming D+730, the value kept only when well-formed, nothing stored', async () => {
    for (const side of await sides(w)) {
      const snap = await dueSnapshot(w);
      for (const [value, kept] of [['2026-02-30', '2026-02-30'], ['20261201', ''], ['abc', ''], [dPlus(-1), dPlus(-1)], [dPlus(731), dPlus(731)]] as const) {
        const res = await side.c.post(duePost(side.page, 'lesson', a.L.L6), { due_on: value });
        assert.equal(res.status, 400, `${side.who}: ${value} refused`);
        const rows = dueRowsOf(await res.text());
        const row = rows.find((r) => r.id === a.L.L6)!;
        assert.equal(row.error, EN('dueInvalid', { date: dPlus(730) }), `${side.who}: ${value}: dueInvalid naming D+730`);
        assert.equal(row.field.value, kept, `${side.who}: ${value}: the field shows ${kept || 'nothing'}`);
        assert.ok(row.field.invalid && row.field.describedBy === `due-${a.L.L6}-error`, 'aria-invalid and aria-describedby');
        assert.equal(rows.filter((r) => r.error).length, 1, 'other rows unchanged');
      }
      assert.equal(await dueSnapshot(w), snap, `${side.who}: nothing stored`);
    }
    // Stored: D and D+730 (the edges).
    const [hadeer, amal] = await sides(w);
    await saveDue(hadeer.c, hadeer.page, 'lesson', a.L.L6, D);
    assert.equal(await dueOf(w, 'lesson', a.L.L6), D, 'D stored');
    await saveDue(amal.c, amal.page, 'chapter', a.C3, dPlus(730));
    assert.equal(await dueOf(w, 'chapter', a.C3), dPlus(730), 'D+730 stored');
    // Re-saving L1's stored past date (D-3) unchanged is accepted and stores nothing new.
    const snap = await dueSnapshot(w);
    assert.equal(await saveDue(hadeer.c, hadeer.page, 'lesson', a.L.L1, dPlus(-3)), `${hadeer.page}?due=saved&item=${a.L.L1}#item-${a.L.L1}`);
    assert.equal(await dueSnapshot(w), snap, 'nothing stored for the unchanged past date');
    // ...but changing L1 to another past date is refused.
    assert.equal((await hadeer.c.post(duePost(hadeer.page, 'lesson', a.L.L1), { due_on: dPlus(-2) })).status, 400, 'another past date refused');
  });

  it('W6 AT-1.3 through the page: loaded at 2026-12-10 23:59:59 UTC, D typed, submitted at 2026-12-11 00:00:00 UTC: refused with D kept in the field', async (t) => {
    const page = publisherDue(w.school, w.school.math);
    const { ctx, page: tab } = await browserAs(browser, w, HADEER, { lang: 'en', width: 'phone' });
    try {
      await clockAt(w, AT.lastSecond);
      t.diagnostic(`loaded at ${new Date(AT.lastSecond).toISOString()}, submitted at ${new Date(AT.nextDay).toISOString()}`);
      await tab.goto(w.p.url + page);
      assert.equal(await tab.getAttribute(`#due-${a.L.L8}`, 'min'), D, 'the field allowed D when loaded');
      assert.equal(await dueOf(w, 'lesson', a.L.L8), dPlus(5), 'L8 holds D+5 (W6-a)');
      await tab.fill(`#due-${a.L.L8}`, D);
      await clockAt(w, AT.nextDay);
      const snap = await dueSnapshot(w);
      const [res] = await Promise.all([tab.waitForResponse((r) => r.request().method() === 'POST'), tab.click(`#item-${a.L.L8} .due-form button[type=submit]`)]);
      assert.equal(res.status(), 400, 'refused');
      await tab.waitForLoadState('load');
      assert.equal(await tab.inputValue(`#due-${a.L.L8}`), D, 'D kept in the field');
      assert.equal((await tab.locator(`#due-${a.L.L8}-error`).innerText()).trim(), EN('dueInvalid', { date: '2028-12-10' }), 'dueInvalid naming the new D+730');
      assert.equal(await dueSnapshot(w), snap, 'nothing stored');
    } finally {
      await ctx.close();
      await clockAt(w, AT.noon);
    }
  });
});

// ------------------------------------------------------------------ AT-1.4 ----
describe('W6 AT-1.4 refused, nothing stored: other publisher, learner, guardian, owner 403; ended access; another site 403; removed, other subject, other space, made-up id 404; GET and HEAD of a post address 404', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-1.4 the setting POST and a due write under the same gate: one item read and one write statement more than the gate', async (t) => {
    const s = w.school;
    const c = await as(w, ADMIN, 'en');
    const measure = async (path: string, body: Record<string, string>) => {
      await c.get(topicPath(s, s.arabic));
      w.p.spy!.start();
      const res = await c.post(path, body);
      await res.arrayBuffer();
      const st = await w.p.spy!.stop();
      return { status: res.status, reads: st.filter((x) => /^\s*(SELECT|WITH)\b/i.test(x)).length, writes: st.filter((x) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(x)) };
    };
    const setting = await measure(adminOrder(s, s.arabic), { state: 'off' });
    const due = await measure(duePost(adminDue(s, s.arabic), 'lesson', a.G1), { due_on: dPlus(6) });
    t.diagnostic(`setting POST: ${setting.reads} reads, ${setting.writes.length} writes; due write: ${due.reads} reads, ${due.writes.length} writes`);
    assert.equal(due.status, 303);
    assert.equal(due.reads, setting.reads + 1, 'the gate read plus one item read');
    assert.equal(due.writes.length, setting.writes.length, 'one write statement, as the setting\'s');
    assert.ok(due.writes.every((x) => !/\bsubject SET\b/i.test(x)) && due.writes.some((x) => /UPDATE lesson SET due_on/i.test(x)), 'the write is the lesson\'s due date');
  });

  it('W6 AT-1.4 every case of the table answers as listed on every new address and stores nothing', async () => {
    const s = w.school;
    const nile = await withW6b(w);
    const [hadeer, amal] = await sides(w);
    const snap = await dueSnapshot(w);
    const unchanged = async (what: string) => assert.equal(await dueSnapshot(w), snap, `${what}: nothing stored or changed`);
    const every = (page: string) => [['GET', page], ['POST', duePost(page, 'lesson', a.L.L6), { due_on: dPlus(5) }], ['POST', duePost(page, 'chapter', a.C3), { due_on: dPlus(5) }]] as const;
    type Req = readonly [string, string, Record<string, string>?];
    const send = (c: typeof hadeer.c, [method, path, body]: Req) => (method === 'GET' ? c.get(path) : c.post(path, body ?? {}));
    // A publisher who does not publish Mathematics, a learner, a guardian, the owner: 403.
    const owner = await signedIn(w.p.url, OWNER.username, OWNER.password);
    for (const [who, c] of [['Shimaa', await as(w, SHIMAA, 'en')], ['Salma', await as(w, SALMA, 'en')], ['Mona', await as(w, MONA, 'en')], ['the owner', owner]] as const) {
      for (const page of [hadeer.page, amal.page]) for (const req of every(page)) assert.equal((await send(c, req)).status, 403, `${who}: ${req[0]} ${req[1]}`);
      await unchanged(who);
    }
    // Hadeer through the admin addresses (not an admin): 403.
    for (const req of every(amal.page)) assert.equal((await send(hadeer.c, req)).status, 403, `Hadeer: ${req[0]} ${req[1]}`);
    // Through a subject that is not theirs here: 403 before any item (Hadeer on Arabic grammar; Nile staff on Mathematics; Mesk staff on Nile science).
    for (const [who, c, page] of [
      ['Hadeer on Arabic grammar', hadeer.c, publisherDue(s, s.arabic)],
      ['Nadia, Mathematics through Nile', nile.nadia, adminDue({ id: nile.id }, s.math)],
      ['Fares, Mathematics through Nile', nile.fares, publisherDue({ id: nile.id }, s.math)],
      ['Amal, Nile science through Mesk', amal.c, adminDue(s, nile.subject)],
    ] as const) {
      for (const req of every(page)) assert.equal((await send(c, req)).status, 403, `${who}: ${req[0]} ${req[1]}`);
    }
    await unchanged('another subject\'s address');
    // Another site: 403 (the same-origin check).
    for (const side of [hadeer, amal]) {
      for (const [kind, id] of [['lesson', a.L.L6], ['chapter', a.C3]] as const) {
        assert.equal((await side.c.postWith(duePost(side.page, kind, id), { due_on: dPlus(5) }, { origin: 'https://elsewhere.example' })).status, 403, `${side.who}: another site`);
      }
    }
    await unchanged('another site');
    // Allowed person: removed, of another subject, of another space, made up: 404.
    const draft = String((await w.p.sql(`SELECT id FROM lesson WHERE chapter_id = '${s.chapters['Draft chapter']}'`))[0].id);
    const arabicChapter = Object.values(s.arabicChapters)[0];
    for (const side of [hadeer, amal]) {
      for (const [what, kind, id] of [
        ['removed lesson L7', 'lesson', a.L.L7], ['removed chapter', 'chapter', s.chapters['Draft chapter']], ['lesson of a removed chapter', 'lesson', draft],
        ['lesson of Arabic grammar', 'lesson', a.G1], ['chapter of Arabic grammar', 'chapter', arabicChapter],
        ['lesson of Nile Test Space', 'lesson', nile.N1], ['chapter of Nile Test Space', 'chapter', nile.K2],
        ['made-up lesson', 'lesson', 'made-up-id'], ['made-up chapter', 'chapter', 'made-up-id'], ['another kind', 'material', a.L.L6],
      ] as const) {
        assert.equal((await side.c.post(`${side.page}/${kind}/${id}`, { due_on: dPlus(5) })).status, 404, `${side.who}: ${what}: 404`);
      }
      // GET or HEAD on a post address: 404 (no route).
      for (const method of ['GET', 'HEAD']) {
        const res = await fetch(w.p.url + duePost(side.page, 'lesson', a.L.L6), { method, redirect: 'manual', headers: { cookie: `lms_session=${side.c.cookie('lms_session')}` } });
        assert.equal(res.status, 404, `${side.who}: ${method} of a post address`);
      }
    }
    await unchanged('404 cases');

    // An admin or publisher whose access ended: today's access-ended answer, nothing stored.
    // The access-ended page shows once per session (then a redirect), so each request uses its own session, signed in before the end.
    const fresh = async (person: typeof HADEER, n: number) => Promise.all(Array.from({ length: n }, () => as(w, person, 'en')));
    const [hadeer2, ...hadeerEach] = await fresh(HADEER, 4);
    const [amal2, ...amalEach] = await fresh(ADMIN, 4);
    assert.equal((await amal.c.post(`/s/${s.id}/admin/people/${w.ids[HADEER.username]}/end`, {})).status, 303, 'Amal ends Hadeer\'s access');
    const editorNow = await hadeer2.get(editorPath(s, s.math));
    for (const [i, req] of every(hadeer.page).entries()) {
      const res = await send(hadeerEach[i], req);
      assert.equal(res.status, editorNow.status, `ended publisher: ${req[0]} ${req[1]} answers as the editor does (${editorNow.status})`);
      assert.notEqual(res.status, 303);
    }
    await unchanged('ended publisher');
    await w.p.sql(`UPDATE membership SET ended_on = '2026-01-01' WHERE space_id = '${s.id}' AND role = 'admin' AND user_id = '${w.ids[ADMIN.username] ?? (await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}'`);
    const topicNow = await amal2.get(topicPath(s, s.math));
    const topicBody = await topicNow.text();
    for (const [i, req] of every(amal.page).entries()) {
      const res = await send(amalEach[i], req);
      assert.equal(res.status, topicNow.status, `ended admin: ${req[0]} ${req[1]}`);
      assert.equal(await res.text(), topicBody, 'ended admin: the same access-ended page');
    }
    await unchanged('ended admin');
  });
});

// ------------------------------------------------------------------ AT-1.5 ----
describe('W6 AT-1.5 no learner data on staff pages: the due-dates page, the card, the editor and the admin page are byte-identical with and without Salma\'s and Omar C\'s done marks', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-1.5 byte-identical before and after the marks, in Arabic and English; no learner name on the due-dates page or the card', async () => {
    const s = w.school;
    const pages = async () => {
      const out: string[] = [];
      for (const lang of ['ar', 'en'] as const) {
        for (const side of await sides(w, lang)) {
          for (const path of [side.from, side.page]) out.push(`${side.who} ${lang} ${path}\n${(await status(side.c, path)).html}`);
        }
      }
      return out;
    };
    const before = await pages();
    for (const p of before.filter((x) => x.includes('/due\n'))) {
      for (const name of [SALMA.display_name, OMAR.display_name, 'Nour Test']) assert.ok(!p.includes(name), `no learner name on ${p.split('\n')[0]}`);
    }
    for (const p of before.filter((x) => !x.includes('/due\n'))) {
      const card = dueCardOf(p)!;
      for (const name of [SALMA.display_name, OMAR.display_name]) assert.ok(!card.block.includes(name), 'no learner name in the card');
    }
    for (const person of [SALMA, OMAR]) {
      const c = await as(w, person, 'en');
      for (const id of [a.L.L1, a.L.L2, s.lessons['Adding fractions']]) assert.equal((await c.post(markPath(s, id), { state: 'done' })).status, 303, `${person.display_name} marks ${id}`);
    }
    const marks = await w.p.sql(`SELECT COUNT(*) AS n FROM done_mark WHERE space_id = '${s.id}'`);
    assert.ok(Number(marks[0].n) >= 6, 'the marks are stored');
    const after = await pages();
    assert.equal(after.length, before.length);
    for (const [i, p] of after.entries()) assert.equal(p, before[i], `byte-identical: ${p.split('\n')[0]}`);
  });
});
