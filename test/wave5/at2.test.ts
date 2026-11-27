// LMS wave 5, W5-1b (product-contract v2 on PIL-246, AT-2): what the learner
// sees. Hadeer posts three announcements and Amal one on Mathematics, Shimaa
// one on Arabic grammar (withAt2); Salma, Omar C and Rana Test (Mathematics
// through the class Science only) read them on the Mathematics page and on
// their home; Karim Test (W5-a) reads only Arabic grammar's. One describe per
// labelled expectation, each its own CI step (`W5 AT-2.<n> ...`). Strings are
// asserted by ui.ts key (the English value with kit words, and the Arabic
// value of the same key). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { signedIn } from '../support/seed.ts';
import { utcDatePlusDays, workerNow } from '../support/http.ts';
import { utcDate } from '../../src/access.ts';
import { ANN_CUT, codePoints, cutText } from '../../src/announcements.ts';
import type { Lang } from '../../src/labels.ts';
import {
  ADMIN, AT2_ARABIC, AT2_MATH, COMPANY_ADMIN, HADEER, KARIM5, OMAR, RANA5, SALMA, UNIVERSITY_ADMIN, adminAnn, annRows, as, blockTexts, browserAs, cardLines, learnerByLine, learnerDay,
  home, learnerBlockOf, post, press, publisherAnn, setOrder, storedAt, subjectPath, wave4World, withAt2, withW5a, words, type Wave1World,
} from './world.ts';

const W = (lang: Lang, kit: 'school' | 'company' | 'university' = 'school') => words(kit, lang);
const text = async (c: { get(p: string): Promise<Response> }, path: string) => (await c.get(path)).text();
const DAY = 86_400_000;
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The subject ids of the home's cards (learnerCards, the same request). */
const cardSubjects = (html: string) => new Set([...html.matchAll(/<li class="card subj" data-subject="([^"]+)"/g)].map((m) => m[1]));
/** The subject ids whose card shows an announcement line (LMS redesign R1a, UX-55 row: in place of the home block). */
const blockSubjects = (html: string) => new Set(cardLines(html).keys());

async function readers(w: Wave1World, lang: Lang) {
  return [
    { who: 'Salma', c: await as(w, SALMA, lang) },
    { who: 'Omar C', c: await as(w, OMAR, lang) },
    { who: 'Rana Test', c: await as(w, RANA5, lang) },
  ];
}

async function at2World(opts: { activity?: boolean } = {}): Promise<Wave1World> {
  const w = await wave4World(opts);
  try {
    await withW5a(w);
    await withAt2(w);
  } catch (err) {
    await w.close();
    throw err;
  }
  return w;
}

// ------------------------------------------------------------------ AT-2.1 ----
describe('W5 AT-2.1 subject page: the block under the title block, newest first, text as stored, role and date line, edited line, 3 in full and 7 folded', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await at2World()));
  after(() => w?.close());

  it('W5 AT-2.1 Salma, Omar C and Rana Test see Mathematics\' four announcements newest first, in Arabic and English; Arabic grammar\'s is not there', async () => {
    const s = w.school;
    const rows = (await annRows(w)).filter((r) => r.subject_id === s.math).reverse();
    for (const lang of ['ar', 'en'] as const) {
      for (const { who, c } of await readers(w, lang)) {
        const doc = await text(c, subjectPath(s, s.math));
        const b = learnerBlockOf(doc);
        assert.ok(b, `${who} ${lang}: the block`);
        assert.equal(b.heading, W(lang)('annTitle'), `${who} ${lang}: annTitle`);
        assert.deepEqual(blockTexts(b), [...AT2_MATH].reverse(), `${who} ${lang}: newest first, each text exactly as stored (line breaks kept)`);
        assert.equal(b.items.length, 3, `${who} ${lang}: the newest 3 in full`);
        assert.ok(b.fold, `${who} ${lang}: the fourth in the fold`);
        assert.equal(b.fold.summary, W(lang)('annOlder', { n: '1' }), `${who} ${lang}: annOlder (1)`);
        assert.ok(!blockTexts(b).includes(AT2_ARABIC), `${who} ${lang}: not Arabic grammar's`);
        const all = [...b.items, ...b.fold.items];
        for (const [i, item] of all.entries()) {
          assert.equal(item.by, learnerByLine(lang, rows[i].author_role as 'publisher' | 'admin', rows[i].created_at), `${who} ${lang}: the role and date line of item ${i + 1}`);
          assert.equal(item.edited, false, 'not edited');
        }
        assert.ok(all[0].by.startsWith(`${W(lang)('admin')} · `), `${who} ${lang}: Amal's says the admin word`);
        assert.ok(all[1].by.startsWith(`${W(lang)('publisher')} · `), `${who} ${lang}: Hadeer's says the publisher word`);
        if (lang === 'en') {
          assert.ok(all[0].by.startsWith('Administrator · '), all[0].by);
          assert.ok(all[1].by.startsWith('Teacher · '), all[1].by);
        }
        assert.ok(b.block.includes(`<p class="ann-text" dir="auto">${escaped(AT2_MATH[1])}</p>`), `${who} ${lang}: the line break kept as stored`);
        const at = doc.indexOf('id="announcements"');
        assert.ok(doc.indexOf('id="subject-title"') < at && at < doc.indexOf('id="outline"'), `${who} ${lang}: after the title, before the outline`);
      }
    }
  });

  it('W5 AT-2.1 after wave 2\'s progress line and wave 4\'s order box; an edited item shows annEdited; with 12, the newest 3 in full, 7 folded ("Older announcements (7)"), the oldest 2 not at all', async () => {
    const s = w.school;
    await setOrder(w, true);
    const salma = await as(w, SALMA, 'en');
    assert.equal((await press(salma, s, s.lessons['Adding fractions'], 'done')).status, 303, 'Salma marks a lesson (the progress line shows)');
    // Hadeer edits her newest.
    const hadeer = await as(w, HADEER, 'en');
    const ruler = (await annRows(w)).find((r) => r.body === AT2_MATH[2])!;
    assert.equal((await hadeer.post(`${publisherAnn(s, s.math)}/${ruler.id}`, { body: 'Bring a ruler and a pencil.' })).status, 303, 'saved');
    const edited = (await annRows(w)).find((r) => r.id === ruler.id)!;
    for (const lang of ['ar', 'en'] as const) {
      const c = await as(w, SALMA, lang);
      const doc = await text(c, subjectPath(s, s.math));
      const at = doc.indexOf('id="announcements"');
      assert.ok(doc.indexOf('id="done-progress"') > 0 && doc.indexOf('id="done-progress"') < at, `${lang}: after the progress line`);
      assert.ok(doc.indexOf('id="order-box"') > 0 && doc.indexOf('id="order-box"') < at, `${lang}: after the order box`);
      assert.ok(at < doc.indexOf('id="outline"'), `${lang}: before the outline`);
      const b = learnerBlockOf(doc)!;
      const item = b.items.find((i) => i.text === 'Bring a ruler and a pencil.')!;
      assert.ok(item.edited, `${lang}: annEdited on the edited item`);
      assert.equal(item.by, `${learnerByLine(lang, 'publisher', edited.created_at)} · ${W(lang)('annEdited', { date: learnerDay(edited.edited_at!, lang) })}`, `${lang}: "Teacher · <date> · Edited <date>"`);
    }
    // 8 older ones: 12 in all.
    const now = await workerNow(w.p.url);
    const older = Array.from({ length: 8 }, (_, i) => `Older note ${i + 1}`);
    for (const [i, body] of older.entries()) await storedAt(w, { space: s.id, subject: s.math, body, role: 'publisher', at: now - (i + 2) * DAY });
    const all = (await annRows(w)).filter((r) => r.subject_id === s.math && !r.removed_at).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => r.body);
    assert.equal(all.length, 12, '12 announcements on Mathematics');
    for (const lang of ['ar', 'en'] as const) {
      for (const { who, c } of await readers(w, lang)) {
        const b = learnerBlockOf(await text(c, subjectPath(s, s.math)))!;
        assert.deepEqual(b.items.map((i) => i.text), all.slice(0, 3), `${who} ${lang}: the newest 3 in full`);
        assert.ok(b.fold, `${who} ${lang}: the fold`);
        assert.equal(b.fold.open, false, `${who} ${lang}: closed by default`);
        assert.equal(b.fold.summary, W(lang)('annOlder', { n: '7' }), `${who} ${lang}: annOlder (7)`);
        if (lang === 'en') assert.equal(b.fold.summary, 'Older announcements (7)');
        assert.deepEqual(b.fold.items.map((i) => i.text), all.slice(3, 10), `${who} ${lang}: the next 7 folded`);
        for (const gone of all.slice(10)) assert.ok(!b.block.includes(escaped(gone)), `${who} ${lang}: the oldest 2 not at all (${gone})`);
      }
    }
  });
});

// ------------------------------------------------------------------ AT-2.2 ----
// LMS redesign R1a (product-contract v2 on PIL-322, UX-55 row): the home has no announcements block any more. Each
// subject card shows one line, the first item its subject page shows this learner (same rule, same order, any age),
// cut at 100 code points by the same rule, linking to the subject page's block; none when the page shows none.
describe('W5 AT-2.2 home: the block after the notice and after Continue (the UX-55 fallback form (2)), the newest 3 of the last 30 days, subject links, the cut at 100 code points', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await at2World({ activity: true })));
  after(() => w?.close());

  it('W5 AT-2.2 Salma\'s home (UX-55 row): no announcements block; each card\'s line is the first item of its subject page\'s block, linking to that block', async () => {
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const c = await as(w, SALMA, lang);
      const doc = await text(c, home(s));
      assert.ok(!doc.includes('id="announcements"'), `${lang}: no announcements block on the home`);
      const lines = cardLines(doc);
      for (const subject of [s.math, s.arabic]) {
        const first = learnerBlockOf(await text(c, subjectPath(s, subject)))!.items[0];
        const line = lines.get(subject);
        assert.ok(line, `${lang}: the ${subject === s.math ? 'Mathematics' : 'Arabic grammar'} card has a line`);
        assert.equal(line.text, first.text, `${lang}: the line is the subject page's first item`);
        assert.equal(line.href, `/s/${s.id}/learn/${subject}#announcements`, `${lang}: linking to the subject page's block`);
        assert.equal(line.links, 1, `${lang}: one link`);
      }
      assert.equal(lines.get(s.math)!.text, AT2_MATH[3], `${lang}: Mathematics' newest`);
      assert.equal(lines.get(s.arabic)!.text, AT2_ARABIC, `${lang}: Arabic grammar's`);
    }
  });

  it('W5 AT-2.2 a text over 100 code points is cut at the last blank at or before 100 and ends with "…"; with no blank, at 100', async () => {
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const long = `${'Word '.repeat(19)}abcdefghij klmnopqrst uvwxyz end of the long announcement.`;
    const solid = 'x'.repeat(150);
    await post(hadeer, publisherAnn(s, s.math), long);
    for (const lang of ['ar', 'en'] as const) {
      const line = cardLines(await text(await as(w, SALMA, lang), home(s))).get(s.math)!;
      const expected = cutText(long).text;
      assert.equal(line.text, `${expected}…`, `${lang}: cut at the last blank`);
      assert.ok(codePoints(expected) <= ANN_CUT && long.startsWith(expected) && long[expected.length] === ' ', `${lang}: at a blank, at most 100 code points`);
    }
    await post(w.admin, adminAnn(s, s.math), solid);
    for (const lang of ['ar', 'en'] as const) {
      const line = cardLines(await text(await as(w, SALMA, lang), home(s))).get(s.math)!;
      assert.equal(line.text, `${'x'.repeat(100)}…`, `${lang}: no blank: cut at code point 100`);
    }
    // The rule on characters that must stay whole: combining marks, ZWJ sequences, surrogate pairs.
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    for (const [name, unit] of [['combining mark', 'é'], ['ZWJ sequence', family], ['surrogate pair', '\u{1F600}'], ['Arabic with a diacritic', 'بَ']] as const) {
      const sample = unit.repeat(120);
      const { text: cut, cut: was } = cutText(sample);
      assert.ok(was, `${name}: cut`);
      assert.ok(codePoints(cut) <= ANN_CUT, `${name}: at most 100 code points`);
      assert.equal(cut.length % unit.length, 0, `${name}: only whole characters (${codePoints(cut)} code points)`);
      assert.ok(sample.startsWith(cut));
    }
    assert.deepEqual(cutText('a'.repeat(100)), { text: 'a'.repeat(100), cut: false }, '100 code points: not cut');
  });

  it('W5 AT-2.2 W5-c dates (UX-55 row: any age, as the subject page): the card shows the newest the page shows; all removed: no line', async () => {
    const w2 = await wave4World();
    try {
      const s = w2.school;
      const now = await workerNow(w2.p.url);
      const ids: Record<number, string> = {};
      for (const days of [60, 31, 29, 1]) ids[days] = await storedAt(w2, { space: s.id, subject: s.math, body: `Posted ${days} days ago.`, role: 'publisher', at: now - days * DAY });
      const check = async (want: string | null, what: string) => {
        for (const lang of ['ar', 'en'] as const) {
          const salma = await as(w2, SALMA, lang);
          const line = cardLines(await text(salma, home(s))).get(s.math);
          const page = blockTexts(learnerBlockOf(await text(salma, subjectPath(s, s.math))));
          assert.equal(page[0] ?? null, want, `${lang} ${what}: the subject page's first item`);
          assert.equal(line?.text ?? null, want, `${lang} ${what}: the card's line`);
        }
      };
      await check('Posted 1 days ago.', 'all four');
      for (const days of [1, 29]) await w2.p.sql(`UPDATE announcement SET removed_at = '${new Date(now).toISOString()}', body = '' WHERE id = '${ids[days]}'`);
      await check('Posted 31 days ago.', 'none in the last 30 days');
      for (const days of [31, 60]) await w2.p.sql(`UPDATE announcement SET removed_at = '${new Date(now).toISOString()}', body = '' WHERE id = '${ids[days]}'`);
      await check(null, 'all removed');
    } finally {
      await w2.close();
    }
  });
});

// ------------------------------------------------------------------ AT-2.3 ----
describe('W5 AT-2.3 everyone in the subject and nobody else; unpublished, unassigned or ended: gone, and back when published again', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await at2World()));
  after(() => w?.close());

  /** The subset rule (contract AT-2.3): the home block's subjects are among the same request's cards. */
  async function subset(c: { get(p: string): Promise<Response> }, who: string, what: string): Promise<string> {
    const res = await c.get(home(w.school));
    const doc = await res.text();
    assert.ok(!doc.includes('id="announcements"'), `${who} (${what}): no announcements block on the home (UX-55 row)`);
    if (res.status === 200 && doc.includes('id="my-list"')) {
      const cards = cardSubjects(doc);
      for (const id of blockSubjects(doc)) assert.ok(cards.has(id), `${who} (${what}): the line's subject ${id} is one of the cards`);
    } else {
      assert.equal(blockSubjects(doc).size, 0, `${who} (${what}): no cards, no line`);
    }
    return doc;
  }

  // LMS redesign R1a (UX-55 row): the home's announcement read is latestRows over the ids of the same request's cards
  // (learnerCards, previewCards), on subjectRows' rule and order; wave 5's learnerAnnouncements is gone.
  it('W5 AT-2.3 one rule, one place: the home\'s announcement read uses learnerCards\' readable-subject rule, word for word (src/learning.ts)', () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../src/${path}`, import.meta.url)), 'utf8');
    assert.doesNotMatch(read('learning.ts'), /learnerAnnouncements|previewAnnouncements/, 'the wave 5 home reads are gone');
    const ann = read('announcements.ts');
    const body = (fn: string) => {
      const at = ann.search(new RegExp(`export (async )?function ${fn}\\(`));
      assert.ok(at >= 0, `${fn} in src/announcements.ts`);
      return ann.slice(at, ann.indexOf('\n}\n', at));
    };
    for (const fn of ['subjectRows', 'latestRows']) {
      assert.match(body(fn), /removed_at IS NULL/, `${fn}: not removed`);
      assert.match(body(fn), /ORDER BY (n\.)?created_at DESC, (n\.)?id DESC/, `${fn}: newest first, the same order`);
    }
    const app = read('app.ts');
    const calls = [...app.matchAll(/latestRows\(c\.get\('db'\), view\.id, cards\.map\(\(x\) => x\.id\)\)/g)];
    assert.equal(calls.length, (app.match(/latestRows\(/g) ?? []).length, 'every call reads for the same request\'s cards');
    assert.equal(calls.length, 2, 'the learner\'s cards and the preview\'s cards');
    assert.match(app, /const cards = await learnerCards\([^;]*;[\s\S]{0,700}latestRows\(c\.get\('db'\), view\.id, cards\.map/, 'the learner\'s: learnerCards\' cards');
    assert.match(app, /const cards = await previewCards\([^;]*;[\s\S]{0,700}latestRows\(c\.get\('db'\), view\.id, cards\.map/, 'the preview\'s: previewCards\' cards');
  });

  it('W5 AT-2.3 Salma, Omar C and Rana Test (class only) see the same Mathematics announcements; Karim Test only Arabic grammar\'s', async () => {
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const blocks: string[] = [];
      for (const { who, c } of await readers(w, lang)) {
        const b = learnerBlockOf(await text(c, subjectPath(s, s.math)))!;
        assert.deepEqual(blockTexts(b), [...AT2_MATH].reverse(), `${who} ${lang}`);
        blocks.push(b.block);
        const doc = await subset(c, who, lang);
        for (const id of blockSubjects(doc)) assert.ok([s.math, s.arabic].includes(id), `${who} ${lang}: own subjects only`);
      }
      assert.ok(blocks.every((b) => b === blocks[0]), `${lang}: the same block for the three`);
      const karim = await as(w, KARIM5, lang);
      const kHome = await subset(karim, 'Karim Test', lang);
      assert.deepEqual([...cardLines(kHome).values()].map((l) => [l.subject, l.text]), [[s.arabic, AT2_ARABIC]], `${lang}: Karim Test's home: Arabic grammar's only`);
      assert.equal((await karim.get(subjectPath(s, s.math))).status, 403, `${lang}: Karim Test: Mathematics is today's 403`);
      assert.deepEqual(blockTexts(learnerBlockOf(await text(karim, subjectPath(s, s.arabic)))), [AT2_ARABIC], `${lang}: Karim Test: the Arabic grammar page`);
      // Rana Test's home: Mathematics only (her one subject).
      assert.ok([...blockSubjects(await subset(await as(w, RANA5, lang), 'Rana Test', lang))].every((id) => id === s.math), `${lang}: Rana Test: Mathematics only`);
    }
  });

  it('W5 AT-2.3 unpublished, Salma unassigned, or her access ended: Mathematics\' announcements leave her home and its page is today\'s 403; published again they are back; the subset holds in every case', async () => {
    const s = w.school;
    const salmaId = w.ids[SALMA.username];
    const salma = await as(w, SALMA, 'en');
    const mathOnHome = async (what: string) => [...blockSubjects(await subset(salma, 'Salma', what))].includes(s.math);
    const page = () => salma.get(subjectPath(s, s.math));
    assert.ok(await mathOnHome('before'), 'before: Mathematics on her home');
    const cases: [string, () => Promise<void>, () => Promise<void>][] = [
      ['unpublished', () => w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`).then(() => {}), () => w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`).then(() => {})],
      ['unassigned', () => w.p.sql(`DELETE FROM group_member WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`).then(() => {}),
        async () => {
          const g = await w.p.sql(`SELECT id FROM "group" WHERE space_id = '${s.id}' AND name = 'Science'`);
          await w.p.sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${s.id}', '${g[0].id}', '${salmaId}')`);
        }],
    ];
    for (const [what, change, undo] of cases) {
      await change();
      assert.equal(await mathOnHome(what), false, `${what}: not on her home`);
      const res = await page();
      const body = await res.text();
      assert.equal(res.status, 403, `${what}: the subject page is today's 403`);
      assert.ok(!body.includes('id="announcements"') && !AT2_MATH.some((t) => body.includes(escaped(t))), `${what}: nothing new shown`);
      await undo();
      assert.ok(await mathOnHome(`${what}, undone`), `${what}, undone: back on her home`);
      assert.deepEqual(blockTexts(learnerBlockOf(await (await page()).text())), [...AT2_MATH].reverse(), `${what}, undone: back on the page`);
    }
    // Her access ends (End access now): no announcement anywhere she reaches; restored, they are back.
    await w.p.sql(`UPDATE membership SET ended_on = '${utcDatePlusDays(0)}' WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    for (const path of [home(s), subjectPath(s, s.math), home(s), subjectPath(s, s.math)]) {
      const res = await salma.get(path);
      const body = await res.text();
      assert.notEqual(res.status, 200, `ended: ${path} is refused (${res.status})`);
      assert.ok(!body.includes('id="announcements"') && !AT2_MATH.some((t) => body.includes(escaped(t))), `ended: nothing shown on ${path}`);
    }
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${salmaId}' AND space_id = '${s.id}'`);
    const again = await as(w, SALMA, 'en');
    assert.ok([...blockSubjects(await (await again.get(home(s))).text())].includes(s.math), 'restored: back on her home');
  });
});

// ------------------------------------------------------------------ AT-2.4 ----
const UNSAFE = [
  '<script>alert(1)</script>',
  '<b>bold</b>',
  '**bold**',
  '[link](javascript:alert(1))',
  '&lt;tag&gt;',
  'y'.repeat(300),
  'الواجب رقم 3 في Chapter 2 صفحة 45 (page 45)',
];

describe('W5 AT-2.4 safe text: markup, markdown and entities shown as literal text, today\'s headers, the long string wraps at 390 px, dir="auto" on each item', { concurrency: false }, () => {
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

  it('W5 AT-2.4 the subject page and the home show each text literally; no element, link or entity is made from them', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const headersBefore = { page: (await salma.get(subjectPath(s, s.math))).headers, home: (await salma.get(home(s))).headers };
    const hadeer = await as(w, HADEER, 'en');
    for (const body of UNSAFE) await post(hadeer, publisherAnn(s, s.math), body);
    for (const lang of ['ar', 'en'] as const) {
      const c = await as(w, SALMA, lang);
      const res = await c.get(subjectPath(s, s.math));
      const b = learnerBlockOf(await res.text())!;
      assert.deepEqual(blockTexts(b), [...UNSAFE].reverse(), `${lang}: every text exactly`);
      for (const item of [...b.items, ...b.fold!.items]) assert.equal(item.raw, escaped(item.text), `${lang}: the text is one escaped text node`);
      assert.ok(!/<(script|b|a|img|iframe)\b/i.test(b.block), `${lang}: no element made from a text`);
      assert.ok(!/javascript:/i.test(b.block.replace(/\[link\]\(javascript:alert\(1\)\)/g, '')), `${lang}: no javascript address outside the literal text`);
      assert.ok(b.block.includes('&amp;lt;tag&amp;gt;'), `${lang}: the entity text shown as typed`);
      for (const li of b.block.match(/<li class="ann-item"[^>]*>/g)!) assert.match(li, /dir="auto"/, `${lang}: dir="auto" on each item`);
      assert.equal(res.headers.get('content-security-policy'), headersBefore.page.get('content-security-policy'), `${lang}: today's Content-Security-Policy`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const homeRes = await c.get(home(s));
      // LMS redesign R1a (UX-55 row): the home shows the newest as the Mathematics card's line: one link, the text one escaped text node.
      const line = cardLines(await homeRes.text()).get(s.math)!;
      assert.ok(!/<(script|b|img|iframe)\b/i.test(line.raw), `${lang} home: no element made from a text`);
      assert.equal(line.raw, escaped(line.text), `${lang} home: the line's text is one escaped text node`);
      assert.equal(line.links, 1, `${lang} home: the line's one link`);
      assert.equal(homeRes.headers.get('content-security-policy'), headersBefore.home.get('content-security-policy'), `${lang} home: today's Content-Security-Policy`);
    }
  });

  it('W5 AT-2.4 the 300-character unbroken string wraps inside 390 px on the subject page and on the home (ux-plan UX-55)', async () => {
    const s = w.school;
    const tab = await browserAs(browser, w, SALMA, { width: 'phone', lang: 'ar' });
    try {
      for (const path of [subjectPath(s, s.math), home(s)]) {
        await tab.page.goto(`${w.p.url}${path}`);
        const fold = tab.page.locator('#announcements details summary');
        if (await fold.count()) await fold.first().click();
        // LMS redesign R1a (UX-55 row): on the home, the card's one-line announcement (cut with an ellipsis) stays inside its box.
        const m = await tab.page.evaluate(() => {
          const b = (document.getElementById('announcements') ?? document.querySelector('#my-list .ann'))!;
          return { block: [b.scrollWidth, b.clientWidth], doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
        });
        assert.ok(m.block[0] <= m.block[1], `${path}: the block does not overflow (${m.block})`);
        assert.ok(m.doc[0] <= m.doc[1], `${path}: the page does not scroll sideways (${m.doc})`);
      }
    } finally {
      await tab.ctx.close();
    }
  });
});

// ------------------------------------------------------------------ AT-2.5 ----
describe('W5 AT-2.5 kits and languages: the kit\'s role words, every new string the ui.ts value, the date as today\'s dated pages write it', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World()));
  after(() => w?.close());

  it('W5 AT-2.5 Company (Trainer, HR administrator) and University (Lecturer, Registrar), in Arabic and English, on the subject page and the home', async () => {
    const spaces = [
      { kit: 'company' as const, s: w.company, publisher: 'hadeer.trainer', admin: COMPANY_ADMIN, en: ['Trainer', 'HR administrator'] },
      { kit: 'university' as const, s: w.university, publisher: 'hadeer.lecturer', admin: UNIVERSITY_ADMIN, en: ['Lecturer', 'Registrar'] },
      { kit: 'school' as const, s: w.school, publisher: HADEER.username, admin: ADMIN, en: ['Teacher', 'Administrator'] },
    ];
    for (const sp of spaces) {
      const pub = await signedIn(w.p.url, sp.publisher, HADEER.password);
      const adm = await signedIn(w.p.url, sp.admin.username, sp.admin.password);
      await post(pub, publisherAnn(sp.s, sp.s.math), `${sp.kit}: a teacher's note.`);
      await post(adm, adminAnn(sp.s, sp.s.math), `${sp.kit}: an admin's note.`);
      const rows = (await annRows(w)).filter((r) => r.space_id === sp.s.id).reverse();
      for (const lang of ['ar', 'en'] as const) {
        const t = W(lang, sp.kit);
        const salma = await as(w, SALMA, lang);
        // LMS redesign R1a: the home has no block (UX-55 row; the card's line is asserted in AT-2.2); the subject page's
        // dates are S4's (UX-16a row), in the <time> element with the stored instant.
        for (const [where, path, heading] of [['subject page', subjectPath(sp.s, sp.s.math), 'annTitle']] as const) {
          const b = learnerBlockOf(await text(salma, path))!;
          assert.ok(b, `${sp.kit} ${lang} ${where}: the block`);
          assert.equal(b.heading, t(heading), `${sp.kit} ${lang} ${where}: ${heading}`);
          const items = b.items.filter((i) => i.text.startsWith(`${sp.kit}:`));
          assert.equal(items.length, 2, `${sp.kit} ${lang} ${where}: both notes`);
          for (const [i, item] of items.entries()) {
            const r = rows[i];
            assert.equal(item.by, t('annByLine', { role: t(r.author_role as 'publisher' | 'admin'), date: learnerDay(r.created_at, lang) }), `${sp.kit} ${lang} ${where}: the kit's role word`);
            assert.ok(b.block.includes(`<time datetime="${r.created_at}">${learnerDay(r.created_at, lang)}</time>`), `${sp.kit} ${lang} ${where}: the date as learner pages write it (S4)`);
          }
          if (lang === 'en') {
            assert.ok(items[0].by.startsWith(`${sp.en[1]} · `), `${sp.kit} en ${where}: ${sp.en[1]}`);
            assert.ok(items[1].by.startsWith(`${sp.en[0]} · `), `${sp.kit} en ${where}: ${sp.en[0]}`);
          }
        }
      }
    }
    // The Arabic values are the ui.ts values (the single source, ux-plan UX-56): read from the file itself.
    const ui = readFileSync(fileURLToPath(new URL('../../src/i18n/ui.ts', import.meta.url)), 'utf8');
    for (const key of ['annTitle', 'annOlder', 'annByLine'] as const) { // R1a (UX-55 row): annHomeTitle, annFull, annFullFor went with the home block
      assert.ok(ui.includes(`${key}: '`), `${key} is a ui.ts key`);
      // annByLine is "<role> · <date>" in both languages; every other new learner string is Arabic in Arabic.
      if (key !== 'annByLine') assert.match(W('ar')(key, { n: '1', subject: 'x' }), /[؀-ۿ]/, `${key}: its Arabic value`);
    }
  });
});
