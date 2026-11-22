// LMS wave 4, W4-1a (product-contract v2 on PIL-238, AT-1): the setting, who
// switches it, default off, off is today. One describe per labelled
// expectation, each its own CI step (`W4 AT-1.<n> ...`, selected with
// --test-name-pattern), each on a fresh world. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import type { Client } from '../support/http.ts';
import { OWNER, signedIn } from '../support/seed.ts';
import { UI } from '../../src/i18n/ui.ts';
import type { Lang } from '../../src/labels.ts';
import {
  ADMIN, HADEER, MONA, SALMA, SHIMAA, adminOrder, as, browserAs, editorPath, home, lessonPath, markPath, plain, publisherOrder, stored,
  subjectPath, topicPath, wave4World, withNile4, words, type Wave1World,
} from './world.ts';

/** The setting card on a page (UX-44): the value line, the explanation, the button and the field it sends, and the status line. */
function card(html: string) {
  const at = html.indexOf('id="order-state"');
  if (at < 0) return null;
  const block = html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
  const text = (re: RegExp) => plain(re.exec(block)?.[1] ?? '');
  return {
    value: text(/<p id="order-value"[^>]*>([\s\S]*?)<\/p>/),
    explain: text(/<p class="order-explain"[^>]*>([\s\S]*?)<\/p>/),
    button: text(/<button type="submit"[^>]*>([\s\S]*?)<\/button>/),
    sends: /name="state" value="([a-z]+)"/.exec(block)?.[1] ?? '',
    action: /<form id="order-form" method="post" action="([^"]+)"/.exec(block)?.[1] ?? '',
    status: /id="order-status"/.test(block) ? text(/<p id="order-status"[^>]*>([\s\S]*?)<\/p>/) : null,
    block,
  };
}

/** The card's words in one language, kit words filled in as the page does (lower case inside the sentence). */
function cardWords(lang: Lang) {
  const t = words('school', lang);
  const kit = { chapter: t('chapter').toLocaleLowerCase(lang), lesson: t('lesson').toLocaleLowerCase(lang), learner: t('learner').toLocaleLowerCase(lang) };
  return { off: t('orderStateOff'), on: t('orderStateOn'), explain: t('orderExplain', kit), switchOn: t('orderSwitchOn'), switchOff: t('orderSwitchOff'), nowOn: t('orderNowOn'), nowOff: t('orderNowOff') };
}

const EXPLAIN_EN = 'When on, each chapter opens only when every lesson before it is marked done. Adding a lesson to a finished chapter locks what comes after it again until the new lesson is marked done. Switching it off opens everything for everyone at once; there is no exception for one student. Marks and locks show only to the student they belong to.';

// ------------------------------------------------------------------ AT-1.1 ----
describe('W4 AT-1.1 every subject starts off, also one created later; both pages show the card "Open in order: Off" with "Switch on"', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W4 AT-1.1 the migration leaves every subject off, a new subject is off, and the editor and the subject admin page show the off card', async () => {
    const all = await w.p.sql('SELECT chapters_in_order AS v FROM subject');
    assert.ok(all.length >= 10, `every existing subject (${all.length})`);
    assert.deepEqual([...new Set(all.map((r) => Number(r.v)))], [0], 'every existing subject is off');
    const res = await w.admin.post(`/s/${w.school.id}/admin/topics`, { title: 'Geometry later', publisher: '' });
    assert.equal(res.status, 303, 'Amal creates a subject');
    const created = res.headers.get('location')!.split('/').pop()!;
    assert.equal(await stored(w, created), 0, 'a subject created afterwards is off');
    assert.equal(EXPLAIN_EN, cardWords('en').explain, 'the English explanation of section 4.2');
    for (const lang of ['en', 'ar'] as const) {
      const hadeer = await as(w, HADEER, lang);
      const amal = await as(w, ADMIN, lang);
      const want = cardWords(lang);
      for (const [who, c, path, action] of [
        ['Hadeer\'s editor', hadeer, editorPath(w.school, w.school.math), publisherOrder(w.school, w.school.math)],
        ['Amal\'s subject admin page', amal, topicPath(w.school, w.school.math), adminOrder(w.school, w.school.math)],
      ] as const) {
        const r = await c.get(path);
        assert.equal(r.status, 200, `${who} (${lang})`);
        const k = card(await r.text());
        assert.ok(k, `${who} (${lang}): the setting card`);
        assert.equal(k.value, want.off, `${who} (${lang}): "Open in order: Off"`);
        assert.equal(k.explain, want.explain, `${who} (${lang}): the explanation`);
        assert.equal(k.button, want.switchOn, `${who} (${lang}): "Switch on"`);
        assert.equal(k.sends, 'on', `${who}: the button sends state = on`);
        assert.equal(k.action, action, `${who}: the form posts to its own address`);
        assert.equal(k.status, null, `${who}: no status line`);
        if (lang === 'en') assert.deepEqual([k.value, k.button], ['Open in order: Off', 'Switch on']);
      }
    }
  });
});

// ------------------------------------------------------------------ AT-1.2 ----
describe('W4 AT-1.2 "Switch on" and "Switch off" from the editor and the subject admin page: a set, a 303 to #order-state, the status line, with script on and off', { concurrency: false }, () => {
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

  it('W4 AT-1.2 each press sets the value (twice each, both ways), answers 303 to ?order=<state>#order-state, and each page shows the value the other set', async () => {
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const amal = await as(w, ADMIN, 'en');
    const sides = [
      { who: 'Hadeer', c: hadeer, post: publisherOrder(s, s.math), page: editorPath(s, s.math) },
      { who: 'Amal', c: amal, post: adminOrder(s, s.math), page: topicPath(s, s.math) },
    ];
    for (const side of sides) {
      for (const [state, value] of [['on', 1], ['on', 1], ['off', 0], ['off', 0]] as const) {
        const res = await side.c.post(side.post, { state });
        assert.equal(res.status, 303, `${side.who} ${state}: 303`);
        const location = res.headers.get('location')!;
        assert.equal(location, `${side.page}?order=${state}#order-state`, `${side.who} ${state}: back to the page at the setting block`);
        assert.equal(await stored(w, s.math), value, `${side.who} ${state}: stored ${value} (a set, not a switch)`);
        const k = card(await (await side.c.get(location.split('#')[0])).text())!;
        assert.equal(k.status, state === 'on' ? 'Open in order is on.' : 'Open in order is off.', `${side.who} ${state}: the status line`);
        assert.equal(k.value, state === 'on' ? 'Open in order: On' : 'Open in order: Off');
        assert.equal(k.button, state === 'on' ? 'Switch off' : 'Switch on');
        assert.equal(k.sends, state === 'on' ? 'off' : 'on');
      }
    }
    // Each page shows the value the other set.
    assert.equal((await hadeer.post(publisherOrder(s, s.math), { state: 'on' })).status, 303);
    assert.equal(card(await (await amal.get(topicPath(s, s.math))).text())!.value, 'Open in order: On', 'Amal sees Hadeer\'s value');
    assert.equal((await amal.post(adminOrder(s, s.math), { state: 'off' })).status, 303);
    assert.equal(card(await (await hadeer.get(editorPath(s, s.math))).text())!.value, 'Open in order: Off', 'Hadeer sees Amal\'s value');
    // A stale ?order= (not the stored value) shows no status line.
    assert.equal(card(await (await hadeer.get(`${editorPath(s, s.math)}?order=on`)).text())!.status, null, 'a stale ?order= shows none');
    assert.equal(card(await (await amal.get(`${topicPath(s, s.math)}?order=bogus`)).text())!.status, null, 'any other value shows none');
  });

  it('W4 AT-1.2 in a browser, with script on and with script off, the button works the same from both pages', async () => {
    const s = w.school;
    for (const script of [true, false]) {
      for (const [who, person, path] of [['Hadeer', HADEER, editorPath(s, s.math)], ['Amal', ADMIN, topicPath(s, s.math)]] as const) {
        const { ctx, page } = await browserAs(browser, w, person, { lang: 'en', script });
        try {
          for (const [state, value] of [['on', 1], ['on', 1], ['off', 0], ['off', 0]] as const) {
            await page.goto(w.p.url + path);
            const shown = (await page.locator('#order-value').innerText()).trim();
            // Pressing "on" twice: the second press is on a page that already says On, so it sends what the button says; press by posting the form's state.
            if ((state === 'on') !== (shown === 'Open in order: Off')) {
              // The button would send the other value: set the field as the form would for this press (a second press of the same set).
              await page.locator('#order-form input[name=state]').evaluate((el, v) => ((el as HTMLInputElement).value = v), state);
            }
            await Promise.all([page.waitForEvent('load'), page.locator('#order-form button').click()]);
            assert.ok(page.url().endsWith(`${path}?order=${state}#order-state`), `${who}, script ${script ? 'on' : 'off'}: at ${page.url()}`);
            assert.equal((await page.locator('#order-status').innerText()).trim(), state === 'on' ? 'Open in order is on.' : 'Open in order is off.');
            assert.equal(await stored(w, s.math), value, `${who}, script ${script ? 'on' : 'off'}, ${state}: stored`);
          }
        } finally {
          await ctx.close();
        }
      }
    }
  });
});

// ------------------------------------------------------------------ AT-1.3 ----
describe('W4 AT-1.3 refused with nothing stored: other publisher, learner, guardian, owner, ended access, another site, another space, made-up id, bad state, GET and HEAD', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W4 AT-1.3 every refused case answers as listed and leaves every subject\'s value unchanged', async () => {
    const s = w.school;
    const nile = await withNile4(w);
    // Mathematics on first, so "unchanged" means something either way.
    const hadeer = await as(w, HADEER, 'en');
    assert.equal((await hadeer.post(publisherOrder(s, s.math), { state: 'on' })).status, 303);
    const all = async () => (await w.p.sql('SELECT id, chapters_in_order AS v FROM subject ORDER BY id')).map((r) => `${r.id}=${r.v}`);
    const before = await all();
    const unchanged = async (what: string) => assert.deepEqual(await all(), before, `${what}: nothing stored`);
    const both = [publisherOrder(s, s.math), adminOrder(s, s.math)];

    // A publisher who does not publish Mathematics.
    const shimaa = await as(w, SHIMAA, 'en');
    for (const state of ['on', 'off']) {
      assert.equal((await shimaa.post(publisherOrder(s, s.math), { state })).status, 403, 'Shimaa: 403');
      await unchanged('another publisher');
    }
    // A learner, a guardian and the owner, on both addresses.
    const salma = await as(w, SALMA, 'en');
    const mona = await as(w, MONA, 'en');
    const owner = await signedIn(w.p.url, OWNER.username, OWNER.password);
    for (const [who, c] of [['Salma', salma], ['Mona', mona], ['the owner', owner]] as const) {
      for (const path of both) {
        assert.equal((await c.post(path, { state: 'off' })).status, 403, `${who} on ${path}: 403`);
        await unchanged(who);
      }
    }
    // Another site (the same-origin check), on both addresses.
    const amal = await as(w, ADMIN, 'en');
    for (const [c, path] of [[hadeer, both[0]], [amal, both[1]]] as const) {
      assert.equal((await c.postWith(path, { state: 'off' }, { origin: 'https://elsewhere.example' })).status, 403, `another site on ${path}: 403`);
      await unchanged('another site');
    }
    // Another space's subject id through this space's address, and the reverse (Nadia and Fares of W4-a).
    const nileSpace = { id: nile.id };
    for (const [who, c, path] of [
      ['Nadia, Mathematics through Nile', nile.nadia, adminOrder(nileSpace, s.math)],
      ['Fares, Mathematics through Nile', nile.fares, publisherOrder(nileSpace, s.math)],
      ['Amal, Nile science through Mesk', amal, adminOrder(s, nile.subject)],
      ['Hadeer, Nile science through Mesk', hadeer, publisherOrder(s, nile.subject)],
      ['Nadia, Nile science through Mesk', nile.nadia, adminOrder(s, nile.subject)],
      ['Fares, Nile science through Mesk', nile.fares, publisherOrder(s, nile.subject)],
    ] as const) {
      assert.equal((await c.post(path, { state: 'off' })).status, 403, `${who}: 403`);
      await unchanged(who);
    }
    // A made-up subject id.
    for (const [c, path] of [[hadeer, publisherOrder(s, 'made-up-subject')], [amal, adminOrder(s, 'made-up-subject')]] as const) {
      assert.equal((await c.post(path, { state: 'on' })).status, 403, `a made-up id on ${path}: 403`);
      await unchanged('a made-up id');
    }
    // A state other than on or off: 400, today's plain error page.
    for (const [c, path] of [[hadeer, both[0]], [amal, both[1]]] as const) {
      for (const state of ['', 'ON', 'toggle', '1', 'true']) {
        const res = await c.post(path, { state });
        assert.equal(res.status, 400, `state "${state}" on ${path}: 400`);
        assert.ok(plain(await res.text()).includes(words('school', 'en')('choiceInvalid')), 'today\'s plain error page');
        await unchanged(`state "${state}"`);
      }
      assert.equal((await c.post(path, {})).status, 400, 'no state at all: 400');
      await unchanged('no state');
    }
    // GET or HEAD on either address: 404 (no route), nothing written.
    for (const [c, path] of [[hadeer, both[0]], [amal, both[1]]] as const) {
      for (const method of ['GET', 'HEAD']) {
        const res = await fetch(w.p.url + path + '?state=off', { method, redirect: 'manual', headers: { cookie: `lms_session=${c.cookie('lms_session')}` } });
        assert.equal(res.status, 404, `${method} on ${path}: 404`);
        await unchanged(method);
      }
    }
    // An admin or publisher whose access ended: today's access-ended answer (asked once per signed-in browser, so compared with a second one).
    const hadeer2 = await as(w, HADEER, 'en');
    const hadeerId = w.ids[HADEER.username];
    assert.equal((await amal.post(`/s/${s.id}/admin/people/${hadeerId}/end`, {})).status, 303, 'Amal ends Hadeer\'s access');
    const editorNow = await hadeer2.get(editorPath(s, s.math));
    const pressNow = await hadeer.post(both[0], { state: 'off' });
    assert.notEqual(pressNow.status, 303, 'ended publisher: not saved');
    assert.equal(pressNow.status, editorNow.status, 'ended publisher: the editor\'s own answer');
    await unchanged('ended publisher');
    const amal2 = await as(w, ADMIN, 'en');
    await w.p.sql(`UPDATE membership SET ended_on = '2026-01-01' WHERE space_id = '${s.id}' AND role = 'admin' AND user_id = '${w.ids[ADMIN.username] ?? (await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}'`);
    const topicNow = await amal2.get(topicPath(s, s.math));
    const adminPress = await amal.post(both[1], { state: 'off' });
    assert.notEqual(adminPress.status, 303, 'ended admin: not saved');
    assert.equal(adminPress.status, topicNow.status, 'ended admin: the subject page\'s own answer');
    assert.equal(await adminPress.text(), await topicNow.text(), 'ended admin: the same access-ended page');
    await unchanged('ended admin');
  });
});

// ------------------------------------------------------------------ AT-1.4 ----
// (a) is every existing CI step passing (contract section 10); (b) and (c), the base comparison, are W4-1b.
// (d) here: with the setting off, no page makes more reads than main b4ad669's, measured there once with the
// statement spy (the same request list and world, recorded by the Builder from main's code; listed in CANDIDATE READY).
const MAIN_READS: Record<string, number> = {
  'Salma home': 5, 'Salma outline': 6, 'Salma outline open=all': 6, 'Salma lesson': 9, 'Salma locked-to-be lesson': 9,
  'Salma mark POST': 5, 'Salma file': 5, 'Hadeer editor': 4, 'Hadeer removed items': 6, 'Hadeer preview outline': 4, 'Hadeer preview lesson': 6,
  'Amal subject admin page': 8, 'Amal preview outline': 4, 'Amal preview lesson': 7, 'Amal outline': 4, 'Amal lesson': 6,
};
// LMS wave 5 (product-contract v2 on PIL-246, AT-3.5): the announcement card on a subject's editor and subject
// admin page reads its list once, so those two pages are allowed exactly one read more than main's. Every other
// page keeps main's count. Named in CANDIDATE READY (an assertion outside section 11's list; the Lead decides).
// W5-1b (AT-3.5): the learner home, the subject's /learn page (learner, admin, publisher) and the preview subject
// page each read their announcements once, so they too are allowed exactly one more.
const WAVE5_CARD_READS: Record<string, number> = {
  'Hadeer editor': 1, 'Amal subject admin page': 1,
  'Salma home': 1, 'Salma outline': 1, 'Salma outline open=all': 1, 'Amal outline': 1, 'Hadeer preview outline': 1, 'Amal preview outline': 1,
};
// LMS wave 6 (W6-1b, product-contract v2 on PIL-257, AT-3.4b): the learner home reads its to-do list once (W5-main's count
// plus exactly one); every other page here keeps its count. Named in CANDIDATE READY (outside section 11; the Lead decides).
const WAVE6_TODO_READS: Record<string, number> = { 'Salma home': 1 };
// LMS wave 7 (W7-2, product-contract v2 on PIL-261, section 11.4): every learner and preview subject page reads its open
// quizzes once, so exactly one more there; every other page keeps its count. Named in CANDIDATE READY (the Lead decides).
const WAVE7_QUIZ_READS: Record<string, number> = {
  'Salma outline': 1, 'Salma outline open=all': 1, 'Amal outline': 1, 'Hadeer preview outline': 1, 'Amal preview outline': 1,
};

describe('W4 AT-1.4 with the setting off no page makes more reads than main\'s (statement spy)', { concurrency: false }, () => {
  it('W4 AT-1.4 (d) the read counts with every setting off are at most main\'s, page by page', async (t) => {
    const w = await wave4World();
    try {
      const s = w.school;
      const salma = await as(w, SALMA, 'en');
      const hadeer = await as(w, HADEER, 'en');
      const amal = await as(w, ADMIN, 'en');
      const pdf = String((await w.p.sql(`SELECT m.id FROM material m WHERE m.space_id = '${s.id}' AND m.kind = 'pdf' AND m.title = 'Worksheet'`))[0].id);
      const preview = `/s/${s.id}/preview`;
      const list: [string, Client, () => Promise<Response>][] = [
        ['Salma home', salma, () => salma.get(home(s))],
        ['Salma outline', salma, () => salma.get(subjectPath(s, s.math))],
        ['Salma outline open=all', salma, () => salma.get(subjectPath(s, s.math, 'all'))],
        ['Salma lesson', salma, () => salma.get(lessonPath(s, s.lessons['Comparing fractions']))],
        ['Salma locked-to-be lesson', salma, () => salma.get(lessonPath(s, s.lessons['Reading decimals']))],
        ['Salma mark POST', salma, () => salma.post(markPath(s, s.lessons['Comparing fractions']), { state: 'done' })],
        ['Salma file', salma, () => salma.get(`/s/${s.id}/file/${pdf}`)],
        ['Hadeer editor', hadeer, () => hadeer.get(editorPath(s, s.math))],
        ['Hadeer removed items', hadeer, () => hadeer.get(`${editorPath(s, s.math)}/removed`)],
        ['Hadeer preview outline', hadeer, () => hadeer.get(`${preview}/learn/${s.math}`)],
        ['Hadeer preview lesson', hadeer, () => hadeer.get(`${preview}/read/${s.lessons['Reading decimals']}`)],
        ['Amal subject admin page', amal, () => amal.get(topicPath(s, s.math))],
        ['Amal preview outline', amal, () => amal.get(`${preview}/learn/${s.math}`)],
        ['Amal preview lesson', amal, () => amal.get(`${preview}/read/${s.lessons['Reading decimals']}`)],
        ['Amal outline', amal, () => amal.get(subjectPath(s, s.math))],
        ['Amal lesson', amal, () => amal.get(lessonPath(s, s.lessons['Reading decimals']))],
      ];
      const counts: { name: string; n: number; status: number }[] = [];
      for (const [name, c, request] of list) {
        await c.get(home(s)); // a first visit settles the session refresh
        w.p.spy!.start();
        const res = await request();
        await res.arrayBuffer();
        const n = (await w.p.spy!.stop()).filter((x) => /^\s*(SELECT|WITH)\b/i.test(x)).length;
        counts.push({ name, n, status: res.status });
      }
      t.diagnostic(`AT-1.4 (d) reads with the setting off: ${counts.map((x) => `${x.name}: ${x.n} (main ${MAIN_READS[x.name]})`).join('; ')}`);
      for (const x of counts) {
        assert.ok(x.status === 200 || x.status === 303, `${x.name}: ${x.status}`);
        const allowed = MAIN_READS[x.name] + (WAVE5_CARD_READS[x.name] ?? 0) + (WAVE6_TODO_READS[x.name] ?? 0) + (WAVE7_QUIZ_READS[x.name] ?? 0);
        assert.ok(x.n <= allowed, `${x.name}: ${x.n} reads, main ${MAIN_READS[x.name]}, allowed ${allowed}`);
      }
    } finally {
      await w.close();
    }
  });
});

void UI;
