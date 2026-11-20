// LMS wave 5: the UX floor of the teacher's card (ux-plan v2 on PIL-246, rev
// 35c25085): UX-51, UX-52, UX-53, and UX-56, UX-57 and UX-58 for the card, its
// edit page and its remove page. (UX-54, UX-55 and the learner parts of UX-56
// to UX-58 come with the learner's blocks.) One describe per item, each its
// own CI step (`UX-<n> ...`, selected with --test-name-pattern), each on a
// fresh world, in Chromium (Playwright), script on unless stated. Screenshots
// go to evidence/ux/ as the ux-plan names them. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { UI, type UiKey } from '../../src/i18n/ui.ts';
import { ANN_MAX } from '../../src/announcements.ts';
import { measure, overflow, tab } from '../wave1/ux.ts';
import {
  ADMIN, HADEER, adminAnn, annRows, as, browserAs, cardOf, editorPath, go, post, publisherAnn, storedAt, topicPath, uxShot,
  wave4World, words, WIDTHS, type Wave1World, type Width,
} from './world.ts';

type Lang = 'ar' | 'en';

/** The wave 5 keys of the card, its edit page and its remove page (ux-plan UX-56). */
const CARD_KEYS = [
  'annTitle', 'annByLine', 'annEdited', 'annHelp', 'annUnpublished', 'annNewLabel', 'annPost', 'annCount', 'annEmpty', 'annOldItem',
  'annEdit', 'annRemove', 'annSave', 'annCancel', 'annEditN', 'annRemoveN', 'annRemoveAsk', 'annPosted', 'annSaved', 'annRemovedDone',
  'annEmptyError', 'annTooLong',
] as const satisfies readonly UiKey[];
/** Every wave 5 key (the learner's too), for the checks on the values themselves. */
const ALL_KEYS = [...CARD_KEYS, 'annHomeTitle', 'annOlder', 'annFull', 'annFullFor'] as const satisfies readonly UiKey[];

/** Whether every selector is found, in this DOM order. */
const inDomOrder = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const els = sels.map((s) => document.querySelector(s));
  if (els.some((e) => !e)) return `missing: ${sels.filter((_, i) => !els[i]).join(', ')}`;
  for (let i = 1; i < els.length; i++) {
    if (!(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${sels[i - 1]} is not before ${sels[i]}`;
  }
  return 'ok';
}, selectors);

const focusedOf = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? e.id || `${e.tagName.toLowerCase()}.${e.className}` : '';
});

async function open(browser: Browser, w: Wave1World, who: { username: string; password: string }, path: string, opts: { width?: Width; lang?: Lang; script?: boolean } = {}) {
  const tabbed = await browserAs(browser, w, who, { width: opts.width ?? 'phone', lang: opts.lang ?? 'ar', script: opts.script });
  await go(tabbed.page, w, path);
  return tabbed;
}

/** Three announcements on Mathematics, one by the admin (the ux-plan's screenshots). */
async function three(w: Wave1World) {
  const s = w.school;
  const hadeer = await as(w, HADEER, 'en');
  const amal = await as(w, ADMIN, 'en');
  await post(hadeer, publisherAnn(s, s.math), 'الاختبار القصير يوم الأحد بدلًا من الخميس.');
  await post(amal, adminAnn(s, s.math), 'Parents evening on Monday at 5 pm.');
  await post(hadeer, publisherAnn(s, s.math), 'الفصل 3 جاهز الآن.\nراجعوا التمارين 1 إلى 4.');
}

// ------------------------------------------------------------------- UX-51 ----
describe('UX-51 teacher card order, labels and role controls', { concurrency: false }, () => {
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

  it('UX-51 the card after the Publish card, its parts in DOM order, the label tied to the field, a secondary button, the controls each role may use with their position in the name, the 11th item marked', async () => {
    const s = w.school;
    // The empty state first.
    for (const [lang, width] of [['ar', 'phone']] as const) {
      const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang, width });
      await uxShot(k.page, 'UX-51-phone-ar-empty');
      await k.ctx.close();
    }
    await three(w);
    for (const [who, path] of [[HADEER, editorPath(s, s.math)], [ADMIN, topicPath(s, s.math)]] as const) {
      const k = await open(browser, w, who, path, { lang: 'en', width: 'desktop' });
      const page = k.page;
      const anchor = who === HADEER ? '#preview-subject' : '#order-state';
      assert.equal(await inDomOrder(page, [anchor, '#announcements', '#announcements > h2', '#announcements .ann-help', '#ann-new', '#ann-new label', '#ann-new textarea', '#ann-new .ann-count', '#ann-new button', '#announcements .ann-list']), 'ok', `${who.username}: the card's parts in order`);
      if (who === HADEER) {
        assert.ok(await page.evaluate(() => !document.querySelector('#announcements')!.closest('.card:not(#announcements)')), 'the card is its own card, after the Publish card');
        assert.equal(await inDomOrder(page, ['#announcements', '#outline']), 'ok', 'before the outline');
      }
      assert.equal(await page.getAttribute('#ann-new label', 'for'), 'ann-new-body', 'the label is tied to the field');
      assert.equal(await page.textContent('#ann-new label'), UI.en.annNewLabel);
      assert.match((await page.getAttribute('#ann-new button', 'class')) ?? '', /\bsecondary\b/, 'Post announcement is a secondary button');
      assert.equal(await page.$$eval('#announcements button:not(.secondary)', (b) => b.length), 0, 'the card adds no primary button');
      const items = await page.$$eval('#announcements .ann-item', (lis) => lis.map((li) => ({
        role: li.getAttribute('data-role'),
        time: li.querySelector('time')?.getAttribute('datetime') ?? null,
        controls: [...li.querySelectorAll('.ann-controls a')].map((a) => [a.textContent, a.getAttribute('aria-label')]),
      })));
      assert.equal(items.length, 3);
      for (const [i, it] of items.entries()) {
        assert.ok(it.time, `item ${i + 1}: a <time datetime>`);
        const own = (who === HADEER ? 'publisher' : 'admin') === it.role;
        const want = who === HADEER
          ? (own ? [['Edit', `Edit announcement ${i + 1} of 3`], ['Remove', `Remove announcement ${i + 1} of 3`]] : [])
          : (own ? [['Edit', `Edit announcement ${i + 1} of 3`], ['Remove', `Remove announcement ${i + 1} of 3`]] : [['Remove', `Remove announcement ${i + 1} of 3`]]);
        assert.deepEqual(it.controls, want, `${who.username}, item ${i + 1} (${it.role}): the controls section 4.1 allows`);
      }
      await uxShot(page, who === HADEER ? 'UX-51-desktop-en' : 'UX-51-desktop-en-admin');
      await k.ctx.close();
    }
    for (const width of ['phone', 'tablet'] as const) {
      const k = await open(browser, w, HADEER, `${editorPath(s, s.math)}#announcements`, { lang: 'ar', width });
      await uxShot(k.page, `UX-51-${width}-ar`);
      await k.ctx.close();
    }
    // The unpublished line (Physics, unpublished in the world) and the 11th item's note.
    const physics = await (await as(w, ADMIN, 'en')).get(topicPath(s, s.physics));
    const card = cardOf(await physics.text())!;
    assert.equal(card.help[1], words('school', 'en')('annUnpublished', { subject: words('school', 'en')('subject').toLowerCase() }), 'the unpublished line on an unpublished subject');
    for (let i = 0; i < 8; i++) await storedAt(w, { space: s.id, subject: s.math, body: `Older ${i + 1}.`, role: 'admin', at: Date.now() - (i + 2) * 86_400_000 });
    const k = cardOf(await (await (await as(w, HADEER, 'en')).get(editorPath(s, s.math))).text())!;
    assert.equal(k.items.length, 11);
    assert.deepEqual(k.items.map((x) => x.old), [...Array(10).fill(false), true], 'from the 11th item on, "Older: no longer shown."');
    assert.ok(k.block.includes(UI.en.annOldItem));
  });
});

// ------------------------------------------------------------------- UX-52 ----
describe('UX-52 status line, focus target and cancel links', { concurrency: false }, () => {
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

  it('UX-52 after post, save, remove and a failed write the page lands at #announcements with the status line first in the card and focused; a stale address shows no status; edit and remove pages have Cancel after the main button', async () => {
    const s = w.school;
    for (const script of [true, false]) {
      const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'ar', script });
      const page = k.page;
      const status = () => page.evaluate(() => {
        const st = document.querySelector('#announcements .ann-status');
        return st ? { first: st === document.querySelector('#announcements')!.firstElementChild, role: st.getAttribute('role'), tab: st.getAttribute('tabindex'), text: st.textContent } : null;
      });
      // Post.
      await page.fill('#ann-new textarea', `Status check (${script ? 'script' : 'no script'}).`);
      await Promise.all([page.waitForURL(/announcement=posted#announcements$/), page.click('#ann-new button')]);
      assert.deepEqual(await status(), { first: true, role: 'status', tab: '-1', text: UI.ar.annPosted }, `script ${script}: the posted line`);
      if (script) {
        assert.equal(await focusedOf(page), 'p.ann-status done', 'the status line has focus');
        await uxShot(page, 'UX-52-phone-ar');
      } else {
        assert.ok(['announcements', 'p.ann-status done'].includes(await focusedOf(page)), `without script: the card (the address's target) has focus (${await focusedOf(page)})`);
      }
      // Edit: Cancel after Save, back to the card; then save.
      await Promise.all([page.waitForURL(/\/announcements\/[^/]+$/), page.click('#announcements .ann-item .ann-edit')]);
      assert.equal(await inDomOrder(page, ['#ann-edit button[type=submit]', '#ann-edit a.ann-cancel']), 'ok', 'Cancel after Save');
      assert.match((await page.getAttribute('#ann-edit a.ann-cancel', 'href'))!, /\/publish\/edit\/[^/]+#announcements$/, 'Cancel goes back to the card');
      await page.fill('#ann-edit textarea', `Status check, edited (${script}).`);
      await Promise.all([page.waitForURL(/announcement=saved#announcements$/), page.click('#ann-edit button[type=submit]')]);
      assert.equal((await status())?.text, UI.ar.annSaved, `script ${script}: the saved line`);
      if (script) assert.equal(await focusedOf(page), 'p.ann-status done');
      // Remove: Cancel after Remove; then remove.
      await Promise.all([page.waitForURL(/\/remove$/), page.click('#announcements .ann-item .ann-remove')]);
      assert.equal(await inDomOrder(page, ['#ann-remove button[type=submit]', '#ann-remove a.ann-cancel']), 'ok', 'Cancel after Remove');
      await Promise.all([page.waitForURL(/announcement=removed#announcements$/), page.click('#ann-remove button[type=submit]')]);
      assert.equal((await status())?.text, UI.ar.annRemovedDone, `script ${script}: the removed line`);
      await k.ctx.close();
    }
    // A stale address: ?announcement=posted with the newest item the other role's, ?announcement=saved with nothing edited, a made-up value.
    const hadeer = await as(w, HADEER, 'en');
    await post(await as(w, ADMIN, 'en'), adminAnn(s, s.math), 'The admin posted last.');
    for (const q of ['posted', 'saved', 'nonsense']) {
      assert.equal(cardOf(await (await hadeer.get(`${editorPath(s, s.math)}?announcement=${q}`)).text())!.status, null, `?announcement=${q}: no false status`);
    }
    // A failed write: wave 2's "Not saved. Please try again.", nothing changed.
    const before = JSON.stringify(await annRows(w));
    w.p.faults!.set({ before: (sql) => { if (/^\s*(INSERT INTO|UPDATE) announcement\b/.test(sql)) throw new Error('forced failure'); } });
    try {
      const res = await hadeer.post(publisherAnn(s, s.math), { body: 'Will not be stored.' });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), `${editorPath(s, s.math)}?announcement=failed#announcements`);
    } finally {
      w.p.faults!.set({});
    }
    assert.equal(JSON.stringify(await annRows(w)), before, 'nothing changed');
    assert.equal(cardOf(await (await hadeer.get(`${editorPath(s, s.math)}?announcement=failed`)).text())!.status, UI.en.markFailed, 'the failed line');
  });
});

// ------------------------------------------------------------------- UX-53 ----
describe('UX-53 errors keep text, count matches server, button disabled', { concurrency: false }, () => {
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

  it('UX-53 a refused text comes back in the field with the error tied to it and focus on the field; the count is live, polite and in code points; the button is disabled after the first press', async () => {
    const s = w.school;
    const tooLong = `${'نصّ عربي طويل 👨‍👩‍👧 '.repeat(40)}`.slice(0, 600);
    const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'ar' });
    const page = k.page;
    assert.equal(await page.getAttribute('#ann-new textarea', 'maxlength'), null, 'no maxlength');
    assert.equal(await page.getAttribute('#ann-new .ann-count', 'aria-live'), 'polite');
    await page.fill('#ann-new textarea', tooLong);
    const n = [...tooLong.trim()].length;
    await page.waitForFunction((want) => document.querySelector('#ann-new .ann-count')?.textContent === want, UI.ar.annTooLong.replace('{n}', String(n)).replace('{max}', String(ANN_MAX)));
    assert.ok(await page.evaluate(() => document.querySelector('#ann-new .ann-count')!.classList.contains('ann-over')), 'past 500: the error colour');
    await uxShot(page, 'UX-56-phone-ar-count');
    await Promise.all([page.waitForLoadState('load'), page.click('#ann-new button')]);
    assert.equal(await page.inputValue('#ann-new textarea'), tooLong, 'the typed text is kept');
    assert.equal(await page.getAttribute('#ann-new textarea', 'aria-invalid'), 'true');
    assert.equal(await page.getAttribute('#ann-new textarea', 'aria-describedby'), 'ann-new-error');
    assert.equal(await page.textContent('#ann-new-error'), UI.ar.annTooLong.replace('{n}', String(n)).replace('{max}', String(ANN_MAX)));
    assert.equal(await focusedOf(page), 'ann-new-body', 'focus on the field');
    await uxShot(page, 'UX-53-phone-ar');
    // Without script: the same refusal, the server's count is the rule.
    const off = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'ar', script: false });
    await off.page.fill('#ann-new textarea', '​ ‏');
    await Promise.all([off.page.waitForLoadState('load'), off.page.click('#ann-new button')]);
    assert.equal(await off.page.textContent('#ann-new-error'), UI.ar.annEmptyError, 'without script: the empty error');
    await off.ctx.close();
    // The button is disabled after the first press (script on), so a second press sends nothing.
    await page.fill('#ann-new textarea', 'Once only.');
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST') posts++; });
    await page.evaluate(() => {
      const f = document.querySelector<HTMLFormElement>('#ann-new')!;
      f.addEventListener('submit', (e) => e.preventDefault(), { once: true }); // hold the page still to look at the button
    });
    await page.click('#ann-new button');
    assert.equal(await page.evaluate(() => document.querySelector<HTMLButtonElement>('#ann-new button')!.disabled), true, 'disabled after the first press');
    assert.equal(posts, 0);
    await k.ctx.close();
  });
});

// ------------------------------------------------------------------- UX-56 ----
const DENY = ['أنت', 'لك', 'عليك', 'هذا', 'هذه', 'ذلك', 'تلك', 'توقفت', 'بدأت', 'السابق', 'السابقة', 'التالية', 'الجديد', 'الجديدة'];
/** The words allowed right before or after a kit placeholder: nouns of a phrase, never an agreeing adjective or verb. */
const NEIGHBOURS = ['صفحة', 'نشر', 'لكل', 'أحدث'];
const KIT_PLACEHOLDERS = ['subject', 'learner', 'role'];
const noMarks = (s: string) => s.replace(/[ً-ْ]/g, '');

describe('UX-56 Arabic, mixed text and kit words for the card (three kits)', { concurrency: false }, () => {
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

  it('UX-56 deny list and placeholder neighbours: no second person, imperative or demonstrative; annHelp and annUnpublished by name', () => {
    for (const key of ALL_KEYS) {
      const tokens = noMarks(UI.ar[key]).replace(/{[^}]*}/g, ' ').split(/[\s.,:;()«»"،·؟?]+/).filter(Boolean);
      for (const bad of DENY) assert.ok(!tokens.includes(noMarks(bad)), `${key}: no "${bad}"`);
    }
    for (const key of ALL_KEYS) {
      const v = UI.ar[key];
      for (const m of v.matchAll(/{([A-Za-z]+)}/g)) {
        if (!KIT_PLACEHOLDERS.includes(m[1])) continue;
        const beforeText = v.slice(0, m.index).trimEnd();
        const afterText = v.slice(m.index! + m[0].length);
        const prev = /([^\s.,:;()«»"،·]+)$/.exec(beforeText)?.[1];
        const next = /^([^\s.,:;()«»"،·]+)/.exec(afterText.trimStart())?.[1];
        const punctAfter = afterText.trim().length === 0 || /^\s*[.,:;()«»"،·]/.test(afterText);
        assert.ok(prev === undefined || NEIGHBOURS.includes(prev), `${key}: the word before {${m[1]}} is "${prev}"`);
        assert.ok(punctAfter || next === undefined || NEIGHBOURS.includes(next), `${key}: the word after {${m[1]}} is "${next}"`);
      }
    }
    // By name: annHelp and annUnpublished carry the placeholders the check above read.
    assert.match(UI.ar.annHelp, /{subject}/);
    assert.match(UI.ar.annHelp, /{learner}/);
    assert.match(UI.ar.annUnpublished, /{subject}/);
  });

  it('UX-56 no spaced slash in Arabic values; numbers written so they cannot reorder', () => {
    for (const key of ALL_KEYS) assert.ok(!/\s\/\s/.test(UI.ar[key]), `${key}: no spaced slash`);
    assert.equal(UI.ar.annCount, '{n} من {max}');
  });

  it('UX-56 language check by key (three kits): lang and dir, each item dir="auto", no value of the other language on the card, kit role words', async () => {
    const s = w.school;
    await three(w);
    const mixed = 'موعد Quiz 2 يوم 12 نوفمبر at 9:30';
    for (const space of [s, w.company, w.university]) {
      const admin = space === s ? await as(w, ADMIN, 'en') : space === w.company ? await as(w, { username: 'basem.admin', password: 'admin-other-pass' }, 'en') : await as(w, { username: 'nadia.admin', password: 'admin-third-pass' }, 'en');
      if (space !== s) await post(admin, adminAnn(space, space.math), mixed);
    }
    const enValues = CARD_KEYS.map((k) => [k, UI.en[k].split(/{[^}]*}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]] as const).filter(([, v]) => v.length >= 4);
    const arValues = CARD_KEYS.map((k) => [k, UI.ar[k].split(/{[^}]*}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]] as const).filter(([, v]) => v.length >= 3);
    const people = { school: ADMIN, company: { username: 'basem.admin', password: 'admin-other-pass' }, university: { username: 'nadia.admin', password: 'admin-third-pass' } };
    for (const lang of ['ar', 'en'] as const) {
      for (const space of [s, w.company, w.university]) {
        const k = await open(browser, w, people[space.kit], topicPath(space, space.math), { lang });
        const page = k.page;
        assert.deepEqual(await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })), { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' });
        assert.ok(await page.$$eval('#announcements .ann-text', (ps) => ps.length > 0 && ps.every((p) => p.getAttribute('dir') === 'auto')), 'each item dir="auto"');
        const roles = await page.$$eval('#announcements .ann-by bdi:first-child', (b) => b.map((x) => x.textContent));
        assert.ok(roles.includes(words(space.kit, lang)('admin')), `${space.kit} ${lang}: the kit's admin word (${roles.join(', ')})`);
        const text = (await page.innerText('#announcements')).replace(/[^\n]*(Quiz|Parents|الاختبار|الفصل|راجعوا|موعد)[^\n]*/g, ' ');
        for (const [key, value] of lang === 'ar' ? enValues : arValues) assert.ok(!text.includes(value), `${space.kit} ${lang}: no ${lang === 'ar' ? 'English' : 'Arabic'} ${key} ("${value}")`);
        if (lang === 'ar' && space !== s) await uxShot(page, `UX-56-phone-ar-${space.kit}-card`);
        await k.ctx.close();
      }
    }
  });
});

// ------------------------------------------------------------------- UX-57 ----
describe('UX-57 states table', { concurrency: false }, () => {
  it('UX-57 the card, edit and remove screens: empty, error, failed write, success; a removed id 404, the other role\'s item 403, a foreign id 404', async () => {
    const w = await wave4World();
    const browser = await chromium.launch();
    try {
      const s = w.school;
      const hadeer = await as(w, HADEER, 'en');
      // Card: empty.
      assert.equal(cardOf(await (await hadeer.get(editorPath(s, s.math))).text())!.empty, UI.en.annEmpty, 'card empty: annEmpty');
      // Card: error (400, text kept).
      const refused = await hadeer.post(publisherAnn(s, s.math), { body: ' ' });
      assert.equal(refused.status, 400, 'card error: 400');
      assert.equal(cardOf(await refused.text())!.field, ' ', 'card error: text kept');
      // Card: success.
      const at = await post(hadeer, publisherAnn(s, s.math), 'States table.');
      assert.equal(cardOf(await (await hadeer.get(at.split('#')[0])).text())!.status, UI.en.annPosted, 'card success: annPosted');
      const [row] = await annRows(w);
      // Card: failed write (screenshot).
      w.p.faults!.set({ before: (sql) => { if (/^\s*(INSERT INTO|UPDATE) announcement\b/.test(sql)) throw new Error('forced failure'); } });
      const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'ar' });
      try {
        await k.page.fill('#ann-new textarea', 'لن يُحفظ.');
        await Promise.all([k.page.waitForURL(/announcement=failed/), k.page.click('#ann-new button')]);
      } finally {
        w.p.faults!.set({});
      }
      assert.equal(await k.page.textContent('#announcements .ann-status'), UI.ar.markFailed, 'card failed write: wave 2\'s line');
      await uxShot(k.page, 'UX-57-phone-ar-error');
      await k.ctx.close();
      // Edit page: error and success.
      const editRefused = await hadeer.post(`${publisherAnn(s, s.math)}/${row.id}`, { body: '' });
      assert.equal(editRefused.status, 400, 'edit error: 400');
      assert.equal((await hadeer.post(`${publisherAnn(s, s.math)}/${row.id}`, { body: 'States table, saved.' })).headers.get('location'), `${editorPath(s, s.math)}?announcement=saved#announcements`, 'edit success');
      // Edit and remove: another role's item 403; a foreign id 404.
      const amal = await as(w, ADMIN, 'en');
      await post(amal, adminAnn(s, s.math), 'Admin item.');
      const adminRow = (await annRows(w)).find((r) => r.author_role === 'admin')!;
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/${adminRow.id}`)).status, 403, 'edit: the other role\'s item 403');
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/${adminRow.id}/remove`)).status, 403, 'remove: a publisher on an admin item 403');
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/made-up-id`)).status, 404, 'edit: a foreign id 404');
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/made-up-id/remove`)).status, 404, 'remove: a foreign id 404');
      // Remove confirmation (screenshot, English, says the text is erased), then success, then a removed id 404.
      const c = await open(browser, w, HADEER, `${publisherAnn(s, s.math)}/${row.id}/remove`, { lang: 'en' });
      assert.equal(await c.page.textContent('#ann-remove-ask'), UI.en.annRemoveAsk);
      await uxShot(c.page, 'UX-57-phone-en-confirm');
      await Promise.all([c.page.waitForURL(/announcement=removed/), c.page.click('#ann-remove button[type=submit]')]);
      assert.equal(await c.page.textContent('#announcements .ann-status'), UI.en.annRemovedDone, 'remove success');
      await c.ctx.close();
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/${row.id}`)).status, 404, 'edit: a removed id 404');
      assert.equal((await hadeer.get(`${publisherAnn(s, s.math)}/${row.id}/remove`)).status, 404, 'remove: removed already 404');
    } finally {
      await browser.close();
      await w.close();
    }
  });
});

// ------------------------------------------------------------------- UX-58 ----
describe('UX-58 widths, targets, contrast and keyboard', { concurrency: false }, () => {
  it('UX-58 the card, the edit page and the remove page: no sideways scroll or clipped text at 390, 768, 1280 and 320 px with 500-character texts and a 120-character title; 44 px targets, 4.5:1 text, focus rings; J1 by keyboard', async () => {
    const w = await wave4World();
    const browser = await chromium.launch();
    try {
      const s = w.school;
      const LONG_TITLE = `الرياضيات Mathematics for everyone: ${'كسور Fractions '.repeat(8)}`.slice(0, 120);
      await w.p.sql(`UPDATE subject SET title = '${LONG_TITLE}' WHERE id = '${s.math}'`);
      const hadeer = await as(w, HADEER, 'en');
      await post(hadeer, publisherAnn(s, s.math), `${'ب'.repeat(300)} ${'كلمة عربية Word '.repeat(12)}`.slice(0, 500));
      await post(hadeer, publisherAnn(s, s.math), 'x'.repeat(500));
      const [row] = await annRows(w);
      const widths: [string, { width: number; height: number }][] = [...Object.entries(WIDTHS), ['reflow', { width: 320, height: 800 }]];
      const pages: [string, string][] = [['card', editorPath(s, s.math)], ['edit', `${publisherAnn(s, s.math)}/${row.id}`], ['remove', `${publisherAnn(s, s.math)}/${row.id}/remove`]];
      for (const lang of ['ar', 'en'] as const) {
        for (const [name, path] of pages) {
          const k = await open(browser, w, HADEER, path, { lang });
          const page = k.page;
          for (const [wname, size] of widths) {
            await page.setViewportSize(size);
            await page.reload();
            const o = await overflow(page);
            assert.ok(o.sideways <= 0, `${name} ${lang} ${wname}: no sideways scroll (${o.sideways})`);
            assert.deepEqual(o.clipped.filter((c) => !/\.sr-only|sr-only:/.test(c)), [], `${name} ${lang} ${wname}: no clipped text`);
            if (name === 'card' && lang === 'en' && wname === 'tablet') await uxShot(page, 'UX-58-tablet-en');
          }
          await page.setViewportSize(WIDTHS.phone);
          await page.reload();
          for (const m of await measure(page, '#announcements textarea, #announcements button, #announcements .ann-controls a, #announcements a.ann-cancel')) {
            assert.ok(m.width >= 44 && m.height >= 44, `${name} ${lang}: ${m.selector} ${m.width}x${m.height}`);
          }
          for (const m of await measure(page, '#announcements .ann-help, #announcements .ann-by, #announcements .ann-text, #announcements .ann-count, #announcements .ann-controls a, #announcements a.ann-cancel, #ann-remove-ask')) {
            if (!m.text.trim()) continue;
            assert.ok(m.contrast >= 4.5, `${name} ${lang}: ${m.selector} "${m.text.slice(0, 30)}" ${m.contrast.toFixed(2)}:1`);
          }
          for (const sel of ['#announcements textarea', '#announcements button', '#announcements .ann-controls a', '#announcements a.ann-cancel']) {
            if (!(await page.$(sel))) continue;
            await page.focus(sel);
            await page.keyboard.press('Shift+Tab');
            const f = await tab(page);
            assert.ok(f.ringPx >= 2 && f.ringContrast >= 3, `${name} ${lang}: the focus ring on ${sel} (${f.ringPx} px, ${f.ringContrast.toFixed(2)}:1)`);
          }
          await k.ctx.close();
        }
      }
      // J1 by keyboard only: Tab to the field, type, Tab to the button, Enter; the status line has focus.
      const k = await open(browser, w, HADEER, editorPath(s, s.math), { lang: 'ar' });
      let reached = false;
      for (let i = 0; i < 80 && !reached; i++) {
        await k.page.keyboard.press('Tab');
        reached = await k.page.evaluate(() => document.activeElement?.id === 'ann-new-body');
      }
      assert.ok(reached, 'the field is reached by Tab (no trap before it)');
      await k.page.keyboard.type('بلوحة المفاتيح فقط.');
      await k.page.keyboard.press('Tab');
      assert.equal(await k.page.evaluate(() => document.activeElement?.closest('#ann-new') !== null && document.activeElement?.tagName), 'BUTTON', 'then the button');
      await Promise.all([k.page.waitForURL(/announcement=posted/), k.page.keyboard.press('Enter')]);
      assert.equal(await focusedOf(k.page), 'p.ann-status done', 'the status line has focus');
      await k.ctx.close();
    } finally {
      await browser.close();
      await w.close();
    }
  });
});
