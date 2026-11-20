// LMS wave 5 (product-contract v2 on PIL-246, AT-1): post, edit and remove on
// a subject's announcement card, by the teacher (Hadeer, on the Mathematics
// editor) and the admin (Amal, on the Mathematics admin page). One describe
// per labelled expectation, each its own CI step (`W5 AT-1.<n> ...`, selected
// with --test-name-pattern), each on a fresh world. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { OWNER, signedIn } from '../support/seed.ts';
import { setClockOffsetMs, setClockTo, workerNow } from '../support/http.ts';
import { ANN_MAX } from '../../src/announcements.ts';
import {
  ADMIN, HADEER, MONA, SALMA, SHIMAA, adminAnn, adminOrder, annRows, annSnapshot, as, browserAs, byLine, cardOf, cardSides, editorPath,
  plain, post, publisherAnn, publisherOrder, topicPath, wave4World, withNile5, words, type Wave1World,
} from './world.ts';

const EN = words('school', 'en');

// ------------------------------------------------------------------ AT-1.1 ----
describe('W5 AT-1.1 post from the editor and the subject admin page: the card, a plain form, 303 to the card, posted status, each page lists the other\'s, double tap stored once', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(async () => {
    await setClockOffsetMs(w.p.url, 0);
    await w?.close();
  });

  it('W5 AT-1.1 both pages show the empty card with the form; posting answers 303 to ?announcement=posted#announcements and shows the item at the top', async () => {
    const sides = await cardSides(w, 'en');
    for (const side of sides) {
      const k = cardOf(await (await side.c.get(side.page)).text());
      assert.ok(k, `${side.who}: the card (id="announcements")`);
      assert.equal(k.heading, EN('annTitle'), `${side.who}: the heading`);
      assert.equal(k.empty, EN('annEmpty'), `${side.who}: "No announcements yet."`);
      assert.equal(k.action, side.post, `${side.who}: the form posts to its own address`);
      assert.match(k.block, /<textarea id="ann-new-body" name="body"/, `${side.who}: one field, body`);
      assert.doesNotMatch(k.block, /maxlength/, `${side.who}: no maxlength`);
      assert.equal(k.items.length, 0);
    }
    const [hadeer, amal] = sides;
    const before = Date.now();
    const location = await post(hadeer.c, hadeer.post, 'Quiz moved to Sunday.');
    assert.equal(location, `${hadeer.page}?announcement=posted#announcements`, 'Hadeer: back to the editor at the card');
    const k = cardOf(await (await hadeer.c.get(location.split('#')[0])).text())!;
    assert.equal(k.status, EN('annPosted'), 'Hadeer: "Announcement posted."');
    assert.equal(k.items.length, 1);
    assert.equal(k.items[0].text, 'Quiz moved to Sunday.');
    const rows = await annRows(w);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].author_role, 'publisher', 'stored as the publisher role');
    assert.ok(Date.parse(rows[0].created_at) >= before - 5000, 'posted now');
    assert.equal(k.items[0].by, byLine('en', 'publisher', rows[0].created_at), 'the role word and the date: "Teacher · <date>"');
    assert.ok(k.items[0].by.startsWith('Teacher · '), k.items[0].by);
    // Amal posts on the admin page; each page lists what the other posted, newest first.
    const amalAt = await post(amal.c, amal.post, 'Parents evening on Monday.');
    assert.equal(amalAt, `${amal.page}?announcement=posted#announcements`, 'Amal: back to the subject admin page at the card');
    const onAdmin = cardOf(await (await amal.c.get(amalAt.split('#')[0])).text())!;
    assert.equal(onAdmin.status, EN('annPosted'));
    assert.deepEqual(onAdmin.items.map((i) => i.text), ['Parents evening on Monday.', 'Quiz moved to Sunday.'], 'the admin page lists Hadeer\'s too');
    assert.ok(onAdmin.items[0].by.startsWith('Administrator · '), onAdmin.items[0].by);
    const onEditor = cardOf(await (await hadeer.c.get(hadeer.page)).text())!;
    assert.deepEqual(onEditor.items.map((i) => i.text), ['Parents evening on Monday.', 'Quiz moved to Sunday.'], 'the editor lists Amal\'s too');
    assert.equal(onEditor.status, null, 'no status without ?announcement=');
  });

  it('W5 AT-1.1 double tap: the same text from the same role 5 seconds later stores nothing and answers the same 303; 11 seconds later it is a second row', async () => {
    const [hadeer, amal] = await cardSides(w, 'en');
    const t0 = (await workerNow(w.p.url)) + 60_000;
    for (const side of [hadeer, amal]) {
      const text = `Bring a ruler (${side.who}).`;
      const count = async () => (await annRows(w)).filter((r) => r.body === text).length;
      await setClockTo(w.p.url, t0);
      const first = await post(side.c, side.post, text);
      await setClockTo(w.p.url, t0 + 5_000);
      const again = await post(side.c, side.post, text);
      assert.equal(again, first, `${side.who}: the same 303`);
      assert.equal(await count(), 1, `${side.who}: one row after a tap 5 seconds later`);
      await setClockTo(w.p.url, t0 + 11_000);
      assert.equal(await post(side.c, side.post, text), first, `${side.who}: 303 again`);
      assert.equal(await count(), 2, `${side.who}: a second row 11 seconds later`);
    }
    // The other role's identical text is not a double tap of this role's.
    await setClockTo(w.p.url, t0 + 12_000);
    await post(hadeer.c, hadeer.post, 'Same words.');
    await setClockTo(w.p.url, t0 + 13_000);
    await post(amal.c, amal.post, 'Same words.');
    assert.equal((await annRows(w)).filter((r) => r.body === 'Same words.').length, 2, 'one per role');
  });
});

// ------------------------------------------------------------------ AT-1.2 ----
describe('W5 AT-1.2 edit, own role only: the edit form, 303 saved, same place and role, the edited line; the other role\'s item has no Edit and answers 403', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W5 AT-1.2 each role edits its own items; the other role\'s edit form and save answer 403 and change nothing', async () => {
    const [hadeer, amal] = await cardSides(w, 'en');
    await post(hadeer.c, hadeer.post, 'Teacher first.');
    await post(amal.c, amal.post, 'Admin second.');
    await post(hadeer.c, hadeer.post, 'Teacher third.');
    const [first, second, third] = await annRows(w);
    for (const [side, own, other, newText] of [[hadeer, first, second, 'Teacher first, edited.'], [amal, second, first, 'Admin second, edited.']] as const) {
      const k = cardOf(await (await side.c.get(side.page)).text())!;
      const ownItem = k.items.find((i) => i.id === own.id)!;
      const otherItem = k.items.find((i) => i.id === other.id)!;
      assert.equal(otherItem.edit, null, `${side.who}: no Edit on the other role's item`);
      assert.ok(ownItem.edit, `${side.who}: Edit on an own item`);
      assert.equal(ownItem.edit.href, `${side.post}/${own.id}`);
      assert.equal(ownItem.edit.text, EN('annEdit'));
      // The edit form holds the text.
      const form = await side.c.get(ownItem.edit.href);
      assert.equal(form.status, 200, `${side.who}: the edit form`);
      const page = await form.text();
      assert.equal(/<textarea id="ann-edit-body" name="body"[^>]*>([\s\S]*?)<\/textarea>/.exec(page)?.[1], own.body, 'the text in the form');
      assert.match(page, new RegExp(`<form id="ann-edit" class="ann-form" method="post" action="${side.post}/${own.id}"`));
      // The other role's item: 403 on the form and on save, nothing changed.
      const snap = await annSnapshot(w);
      assert.equal((await side.c.get(`${side.post}/${other.id}`)).status, 403, `${side.who}: the other role's edit form 403`);
      assert.equal((await side.c.post(`${side.post}/${other.id}`, { body: 'Taken over.' })).status, 403, `${side.who}: the other role's save 403`);
      assert.equal(await annSnapshot(w), snap, 'nothing changed');
      // Saving.
      const res = await side.c.post(`${side.post}/${own.id}`, { body: newText });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), `${side.page}?announcement=saved#announcements`);
      const after = cardOf(await (await side.c.get(`${side.page}?announcement=saved`)).text())!;
      assert.equal(after.status, EN('annSaved'), `${side.who}: "Announcement saved."`);
      const row = (await annRows(w)).find((r) => r.id === own.id)!;
      assert.equal(row.body, newText);
      assert.equal(row.author_role, own.author_role, 'author_role never changes');
      assert.equal(row.created_at, own.created_at, 'the posting time is kept');
      assert.ok(row.edited_at, 'the edit time is set');
      const item = after.items.find((i) => i.id === own.id)!;
      assert.equal(item.text, newText, 'the new text');
      assert.equal(item.by, `${byLine('en', own.author_role as 'publisher' | 'admin', own.created_at)} · ${EN('annEdited', { date: row.edited_at!.slice(0, 10) })}`, 'the edited line');
    }
    // The order is by posting time: unchanged by the edits.
    const k = cardOf(await (await hadeer.c.get(hadeer.page)).text())!;
    assert.deepEqual(k.items.map((i) => i.id), [third.id, second.id, first.id], 'the same places in the list');
  });
});

// ------------------------------------------------------------------ AT-1.3 ----
describe('W5 AT-1.3 remove: Hadeer on publisher items, Amal on every item; the confirmation, 303 removed, the text erased, 404 after', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W5 AT-1.3 Remove is offered as section 4.1 allows; confirming erases the text and sets removed_at; the item leaves both cards; a removed item answers 404', async () => {
    const [hadeer, amal] = await cardSides(w, 'en');
    await post(hadeer.c, hadeer.post, 'Teacher item one.');
    await post(amal.c, amal.post, 'Admin item.');
    await post(hadeer.c, hadeer.post, 'Teacher item two.');
    const [t1, a1, t2] = await annRows(w);
    const onEditor = cardOf(await (await hadeer.c.get(hadeer.page)).text())!;
    const onAdmin = cardOf(await (await amal.c.get(amal.page)).text())!;
    assert.deepEqual(onEditor.items.map((i) => [i.role, Boolean(i.remove)]), [['publisher', true], ['admin', false], ['publisher', true]], 'Hadeer: Remove on publisher items only');
    assert.deepEqual(onAdmin.items.map((i) => [i.role, Boolean(i.remove)]), [['publisher', true], ['admin', true], ['publisher', true]], 'Amal: Remove on every item');
    // Hadeer's remove address on Amal's item: 403, both GET and POST.
    const snap = await annSnapshot(w);
    assert.equal((await hadeer.c.get(`${hadeer.post}/${a1.id}/remove`)).status, 403);
    assert.equal((await hadeer.c.post(`${hadeer.post}/${a1.id}/remove`, {})).status, 403);
    assert.equal(await annSnapshot(w), snap, 'nothing changed');
    // Hadeer removes her own; Amal removes a teacher's item (moderation).
    for (const [side, row] of [[hadeer, t1], [amal, t2]] as const) {
      const ask = await side.c.get(`${side.post}/${row.id}/remove`);
      assert.equal(ask.status, 200, `${side.who}: the confirmation page`);
      const page = await ask.text();
      assert.ok(plain(page).includes(EN('annRemoveAsk')), 'it says the text is erased');
      assert.match(page, new RegExp(`<form id="ann-remove" method="post" action="${side.post}/${row.id}/remove">`));
      const res = await side.c.post(`${side.post}/${row.id}/remove`, {});
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), `${side.page}?announcement=removed#announcements`);
      assert.equal(cardOf(await (await side.c.get(`${side.page}?announcement=removed`)).text())!.status, EN('annRemovedDone'));
      const stored = (await annRows(w)).find((r) => r.id === row.id)!;
      assert.ok(stored.removed_at, 'removed_at set');
      assert.equal(stored.body, '', 'the text is erased');
      // Editing or removing a removed item: 404.
      const editor = side.role === 'publisher' ? hadeer : amal;
      assert.equal((await editor.c.get(`${editor.post}/${row.id}`)).status, 404, 'edit form of a removed item: 404');
      assert.equal((await editor.c.post(`${editor.post}/${row.id}`, { body: 'Back again.' })).status, 404, 'save of a removed item: 404');
      assert.equal((await editor.c.get(`${editor.post}/${row.id}/remove`)).status, 404, 'remove page of a removed item: 404');
      assert.equal((await editor.c.post(`${editor.post}/${row.id}/remove`, {})).status, 404, 'remove of a removed item: 404');
    }
    for (const side of [hadeer, amal]) {
      const k = cardOf(await (await side.c.get(side.page)).text())!;
      assert.deepEqual(k.items.map((i) => i.id), [a1.id], `${side.who}: the removed items are gone from the card`);
      assert.ok(!k.block.includes('Teacher item'), 'no removed text anywhere in the card');
    }
  });
});

// ------------------------------------------------------------------ AT-1.4 ----
const ARABIC_500 = (() => {
  // 500 code points: Arabic with diacritics, a thumbs-up and a ZWJ family emoji.
  const emoji = ['👍', '👨‍👩‍👧'];
  const fixed = [...emoji.join(' ')].length + 1;
  const letters = [...'مَدْرَسَةٌ جَمِيلَةٌ '];
  const out: string[] = [];
  while (out.length < 500 - fixed) out.push(letters[out.length % letters.length]);
  if (out[out.length - 1] === ' ') out[out.length - 1] = 'ب';
  return `${out.join('')} ${emoji.join(' ')}`;
})();

describe('W5 AT-1.4 text rules: empty and invisible texts refused, 501 refused, 500 with emoji stored, RLM kept, line breaks, the live count matches the server', { concurrency: false }, () => {
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

  it('W5 AT-1.4 refused texts answer 400 with the page again, the typed text kept, nothing stored; accepted texts are stored as the rules say', async () => {
    assert.equal([...ARABIC_500].length, ANN_MAX, 'the sample is exactly 500 code points');
    assert.ok(ARABIC_500.length > ANN_MAX, 'and more than 500 UTF-16 units');
    const sides = await cardSides(w, 'en');
    for (const side of sides) {
      for (const [typed, want] of [
        ['', EN('annEmptyError')],
        ['     ', EN('annEmptyError')],
        ['​﻿ ', EN('annEmptyError')],
        ['‎‏؜', EN('annEmptyError')],
        ['ب'.repeat(501), 'Too long: 501 of 500 characters.'],
        [`${ARABIC_500}!`, 'Too long: 501 of 500 characters.'],
      ] as const) {
        const snap = await annSnapshot(w);
        const res = await side.c.post(side.post, { body: typed });
        assert.equal(res.status, 400, `${side.who}: ${JSON.stringify(typed).slice(0, 30)} answers 400`);
        const k = cardOf(await res.text())!;
        assert.ok(k, 'the card\'s page drawn again');
        assert.equal(k.error, want, 'the error next to the field');
        assert.equal(k.field, typed, 'the typed text kept in the field');
        assert.match(k.block, /aria-invalid="true" aria-describedby="ann-new-error"/, 'the field is marked and tied to the error');
        assert.equal(await annSnapshot(w), snap, 'nothing stored');
      }
    }
    const [hadeer] = sides;
    // Stored: exactly 500 code points; an RLM inside Arabic; line breaks kept, three or more become two; controls removed.
    for (const [typed, stored] of [
      [ARABIC_500, ARABIC_500],
      ['الدرس ‏ الأول', 'الدرس ‏ الأول'],
      ['  Line one\r\n\r\n\r\n\r\nLine two three\t.  ', 'Line one\n\nLine two\nthree .'],
      ['Safe‮text⁦here\u0007.', 'Safetexthere.'],
    ] as const) {
      await post(hadeer.c, hadeer.post, typed);
      const rows = await annRows(w);
      assert.equal(rows[rows.length - 1].body, stored, `stored as ${JSON.stringify(stored).slice(0, 40)}`);
    }
    // The same rules on save.
    const own = (await annRows(w))[0];
    const res = await hadeer.c.post(`${hadeer.post}/${own.id}`, { body: '​ ' });
    assert.equal(res.status, 400, 'save of an invisible text: 400');
    const page = await res.text();
    assert.ok(plain(page).includes(EN('annEmptyError')));
    assert.equal(/<textarea id="ann-edit-body" name="body"[^>]*>([\s\S]*?)<\/textarea>/.exec(page)?.[1], '​ ', 'the typed text kept');
  });

  it('W5 AT-1.4 with script, the live count shows the number the server counts (code points), past 500 the too-long text; no maxlength', async () => {
    const { ctx, page } = await browserAs(browser, w, HADEER, { lang: 'en', width: 'phone' });
    try {
      await page.goto(w.p.url + editorPath(w.school, w.school.math));
      assert.equal(await page.getAttribute('#ann-new-body', 'maxlength'), null, 'no maxlength');
      for (const [typed, n] of [[ARABIC_500, 500], ['الدرس ‏ الأول', [...'الدرس ‏ الأول'].length], ['  x\n\n\n\ny  ', 4], [`${ARABIC_500}!`, 501]] as const) {
        const want = n > ANN_MAX ? EN('annTooLong', { n: String(n), max: '500' }) : EN('annCount', { n: String(n), max: '500' });
        await page.fill('#ann-new-body', typed);
        const shown = await page.waitForFunction((text) => document.querySelector('#ann-new .ann-count')?.textContent === text, want, { timeout: 5000 })
          .then(() => true, () => false);
        assert.ok(shown, `the count for ${n}: "${want}" (shown: "${await page.textContent('#ann-new .ann-count')}")`);
        assert.equal(await page.evaluate(() => document.querySelector('#ann-new .ann-count')!.classList.contains('ann-over')), n > ANN_MAX, 'the error colour past 500');
      }
    } finally {
      await ctx.close();
    }
  });
});

// ------------------------------------------------------------------ AT-1.5 ----
describe('W5 AT-1.5 refused with nothing stored: other publisher, learner, guardian, owner, ended access, another site, other subject or space, made-up id, GET and HEAD; one gate read, one item read, one write', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W5 AT-1.5 every refused case answers as listed and stores or changes nothing', async () => {
    const s = w.school;
    const nile = await withNile5(w);
    const [hadeer, amal] = await cardSides(w, 'en');
    await post(hadeer.c, hadeer.post, 'Teacher item.');
    await post(amal.c, amal.post, 'Admin item.');
    // An item on Arabic grammar (Amal may edit it there, but not through Mathematics' addresses).
    await post(amal.c, adminAnn(s, s.arabic), 'Arabic grammar item.');
    const [tItem, aItem, arabicItem] = await annRows(w).then((r) => r.filter((x) => x.space_id === s.id));
    const snap = await annSnapshot(w);
    const unchanged = async (what: string) => assert.equal(await annSnapshot(w), snap, `${what}: nothing stored or changed`);
    const every = (base: string, id: string) => [
      ['POST', base, { body: 'Taken.' }], ['GET', `${base}/${id}`], ['POST', `${base}/${id}`, { body: 'Taken.' }], ['GET', `${base}/${id}/remove`], ['POST', `${base}/${id}/remove`, {}],
    ] as const;
    const send = (c: typeof hadeer.c, [method, path, body]: readonly [string, string, Record<string, string>?]) =>
      method === 'GET' ? c.get(path) : c.post(path, body ?? {});

    // A publisher who does not publish Mathematics, a learner, a guardian and the owner: 403 on every new address.
    const shimaa = await as(w, SHIMAA, 'en');
    const salma = await as(w, SALMA, 'en');
    const mona = await as(w, MONA, 'en');
    const owner = await signedIn(w.p.url, OWNER.username, OWNER.password);
    for (const [who, c, bases] of [
      ['Shimaa', shimaa, [hadeer.post]], ['Salma', salma, [hadeer.post, amal.post]], ['Mona', mona, [hadeer.post, amal.post]], ['the owner', owner, [hadeer.post, amal.post]],
    ] as const) {
      for (const base of bases) {
        for (const req of every(base, base === hadeer.post ? tItem.id : aItem.id)) {
          assert.equal((await send(c, req)).status, 403, `${who}: ${req[0]} ${req[1]} 403`);
        }
      }
      await unchanged(who);
    }
    // Another site (the same-origin check).
    for (const [side, id] of [[hadeer, tItem.id], [amal, aItem.id]] as const) {
      for (const path of [side.post, `${side.post}/${id}`, `${side.post}/${id}/remove`]) {
        assert.equal((await side.c.postWith(path, { body: 'Forged.' }, { origin: 'https://elsewhere.example' })).status, 403, `another site: ${path} 403`);
      }
    }
    await unchanged('another site');
    // An id of another subject, of Nile Test Space, or made up, through Mathematics' addresses: 404 (a subject they may edit).
    for (const [side, ids] of [[hadeer, [arabicItem.id, nile.ann, 'made-up-id']], [amal, [arabicItem.id, nile.ann, 'made-up-id']]] as const) {
      for (const id of ids) {
        for (const [method, path, body] of every(side.post, id).slice(1)) {
          assert.equal((await send(side.c, [method, path, body])).status, 404, `${side.who}: ${method} ${path}: 404`);
        }
      }
    }
    await unchanged('foreign ids');
    // Through a subject they may not edit: 403 (Hadeer on Arabic grammar's editor; Mathematics through Nile; Nile's subject through Mesk).
    for (const [who, c, path] of [
      ['Hadeer on Arabic grammar', hadeer.c, publisherAnn(s, s.arabic)],
      ['Nadia, Mathematics through Nile', nile.nadia, adminAnn({ id: nile.id }, s.math)],
      ['Fares, Mathematics through Nile', nile.fares, publisherAnn({ id: nile.id }, s.math)],
      ['Amal, Nile science through Mesk', amal.c, adminAnn(s, nile.subject)],
      ['Hadeer, Nile science through Mesk', hadeer.c, publisherAnn(s, nile.subject)],
    ] as const) {
      for (const req of every(path, nile.ann)) assert.equal((await send(c, req)).status, 403, `${who}: ${req[0]} ${req[1]} 403`);
    }
    await unchanged('another subject or space');
    // GET or HEAD on the post address: 404 (no route).
    for (const side of [hadeer, amal]) {
      for (const method of ['GET', 'HEAD']) {
        const res = await fetch(w.p.url + side.post, { method, redirect: 'manual', headers: { cookie: `lms_session=${side.c.cookie('lms_session')}` } });
        assert.equal(res.status, 404, `${method} ${side.post}: 404`);
      }
    }
    await unchanged('GET and HEAD');

    // Under the statement spy: each write request makes the gate's reads, at most one more read, and one write (compared with the setting's POST, the same gate).
    const count = async (c: typeof hadeer.c, path: string, body: Record<string, string>) => {
      await c.get(topicPath(s, s.math));
      w.p.spy!.start();
      const res = await c.post(path, body);
      await res.arrayBuffer();
      const statements = await w.p.spy!.stop();
      return { status: res.status, reads: statements.filter((x) => /^\s*(SELECT|WITH)\b/i.test(x)).length, writes: statements.filter((x) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(x)) };
    };
    for (const side of [hadeer, amal]) {
      const setting = await count(side.c, side.role === 'publisher' ? publisherOrder(s, s.math) : adminOrder(s, s.math), { state: 'off' });
      assert.equal(setting.status, 303);
      const rows = (await annRows(w)).filter((r) => r.space_id === s.id && r.subject_id === s.math && r.author_role === side.role && !r.removed_at);
      for (const [what, path, body] of [
        ['post', side.post, { body: `Spy post (${side.who}).` }],
        ['save', `${side.post}/${rows[0].id}`, { body: `Spy save (${side.who}).` }],
        ['remove', `${side.post}/${rows[0].id}/remove`, {}],
      ] as const) {
        const m = await count(side.c, path, body);
        assert.equal(m.status, 303, `${side.who} ${what}`);
        assert.ok(m.reads <= setting.reads + 1, `${side.who} ${what}: ${m.reads} reads, the gate's ${setting.reads} plus at most one`);
        assert.equal(m.writes.length, setting.writes.length, `${side.who} ${what}: one write statement (as the setting's one): ${m.writes.join(' | ')}`);
        assert.ok(m.writes.some((x) => /announcement/i.test(x)), `${side.who} ${what}: the write is the announcement's`);
      }
    }

    // An admin or publisher whose access ended: today's access-ended answer, nothing stored.
    const afterSpy = await annSnapshot(w);
    const hadeer2 = await as(w, HADEER, 'en');
    assert.equal((await amal.c.post(`/s/${s.id}/admin/people/${w.ids[HADEER.username]}/end`, {})).status, 303, 'Amal ends Hadeer\'s access');
    const editorNow = await hadeer2.get(editorPath(s, s.math));
    const pressNow = await hadeer.c.post(hadeer.post, { body: 'After the end.' });
    assert.notEqual(pressNow.status, 303, 'ended publisher: not saved');
    assert.equal(pressNow.status, editorNow.status, 'ended publisher: the editor\'s own answer');
    assert.equal(await annSnapshot(w), afterSpy, 'ended publisher: nothing stored');
    const amal2 = await as(w, ADMIN, 'en');
    const amalId = String((await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
    await w.p.sql(`UPDATE membership SET ended_on = '2026-01-01' WHERE space_id = '${s.id}' AND role = 'admin' AND user_id = '${amalId}'`);
    const topicNow = await amal2.get(topicPath(s, s.math));
    const adminPress = await amal.c.post(amal.post, { body: 'After the end.' });
    assert.notEqual(adminPress.status, 303, 'ended admin: not saved');
    assert.equal(adminPress.status, topicNow.status, 'ended admin: the subject page\'s own answer');
    assert.equal(await adminPress.text(), await topicNow.text(), 'ended admin: the same access-ended page');
    assert.equal(await annSnapshot(w), afterSpy, 'ended admin: nothing stored');
  });
});
