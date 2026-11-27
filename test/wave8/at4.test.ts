// LMS wave 8, W8-1b (product-contract v2 on PIL-299, AT-4.2 to AT-4.5;
// sections 3.4, 3.7, A1, L1, K1, K2): the preview, the guardian and the
// admin, privacy, and the new learner words, in world W8-a
// (test/wave8/world.ts). One describe per labelled expectation, each its own
// CI step (`W8 AT-4.<n> ...`), each on a fresh world with the clock pinned.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MADE_UP, normalise, requestList } from './n1.ts';
import { AMAL, AT8, HADEER, ID, MARKER, MONA, OMAR, OWNER8, RANA, SALMA, textOf, w8World, words8, type Kit, type Person, type W8World } from './world.ts';
import { S, cardOf, got, lessonLinks, outlineOf, shown as s4 } from './learner.ts';
import { Client } from '../support/http.ts';

const D16END = Date.parse('2026-12-16T23:59:59.999Z');
const at = (ms: number) => new Date(ms).toISOString();

async function n1(res: Response, id?: string): Promise<{ key: string; body: string }> {
  const raw = Buffer.from(await res.arrayBuffer());
  const { headers, body } = normalise(res, raw, id);
  return { key: JSON.stringify({ status: res.status, headers, sha: createHash('sha256').update(body).digest('hex') }), body: body.toString('utf8') };
}

/** The outline as a new learner meets it: chapter ids, locks and reasons. */
const shape = (html: string) => outlineOf(html).map((ch) => ({ id: ch.id, locked: ch.locked, reasons: ch.reasons, lessons: ch.lessons }));

// ------------------------------------------------------------------ AT-4.2 ----
describe('W8 AT-4.2 the preview matches A1 (a new learner today) on /preview, /preview/learn/<subject> and /preview/read/<lesson>', { concurrency: false }, () => {
  for (const inOrder of [false, true]) {
    it(`W8 AT-4.2 Open in order ${inOrder ? 'on' : 'off'}: Hadeer's, Amal's and Rana's previews equal Omar's own pages (no marks) at 2026-12-09`, async (t) => {
      const w = await w8World({ inOrder, atMs: AT8.d9 });
      try {
        t.diagnostic(`instant ${at(AT8.d9)}`);
        const omar = await w.as(OMAR, 'en');
        const own = shape((await got(omar, `${S}/learn/${ID.math}?open=all`)).html);
        assert.ok(!own.some((ch) => ch.id === ID.ch3), 'Omar: Ch3 absent');
        const ownLocked = (await got(omar, `${S}/read/${ID.l21}`)).html;
        const ownReason = textOf(/<p id="lock-reason"[^>]*>([\s\S]*?)<\/p>/.exec(ownLocked)?.[1] ?? '');
        for (const who of [HADEER, AMAL, RANA]) {
          const c = await w.as(who, 'en');
          const home = await got(c, `${S}/preview`);
          assert.equal(home.status, 200);
          const card = cardOf(home.html);
          assert.equal(card.count, words8('school', 'en')('lessonCount', { n: '6' }), `${who.key} /preview: 6 lessons (Ch3 not counted)`);
          for (const id of [ID.l21, ID.l22, ID.l31]) assert.ok(!lessonLinks(home.html).includes(id), `${who.key} /preview: no link to ${id}`);
          const outline = await got(c, `${S}/preview/learn/${ID.math}?open=all`);
          assert.deepEqual(shape(outline.html), own, `${who.key} /preview/learn: the outline of a new learner today`);
          const locked = await got(c, `${S}/preview/read/${ID.l21}`);
          assert.equal(locked.status, 200);
          assert.match(locked.html, /<section id="locked-lesson"/, `${who.key} /preview/read Ch2: the locked page`);
          assert.equal(textOf(/<p id="lock-reason"[^>]*>([\s\S]*?)<\/p>/.exec(locked.html)?.[1] ?? ''), ownReason, `${who.key} /preview/read Ch2: the new learner's reason`);
          const hidden = await n1(await c.get(`${S}/preview/read/${ID.l31}`), ID.l31);
          const madeUp = await n1(await c.get(`${S}/preview/read/${MADE_UP.lesson}`), MADE_UP.lesson);
          assert.equal(hidden.key, madeUp.key, `${who.key} /preview/read Ch3: identical (N1) to a made-up id`);
          const open = await got(c, `${S}/preview/read/${ID.l11}`);
          assert.match(open.html, /id="lesson-place"/, `${who.key} /preview/read Ch1: the lesson page`);
        }
      } finally {
        await w.close();
      }
    });
  }
});

// ------------------------------------------------------------------ AT-4.3 ----
describe('W8 AT-4.3 Mona\'s pages, and Rana\'s as admin, are identical (N1) to W8-0, apart from the changes listed in 3.4', { concurrency: false }, () => {
  let a: W8World;
  let zero: W8World;
  before(async () => {
    a = await w8World({ atMs: AT8.d9 });
    zero = await w8World({ dates: false, atMs: AT8.d9 });
  });
  after(async () => {
    await a?.close();
    await zero?.close();
  });

  it('W8 AT-4.3 at 2026-12-09: Rana\'s admin pages identical; Mona\'s guardian home, learner page and activity page identical once the 3.4 changes are cut from W8-0 (Ch3\'s last open, Ch3\'s activity row, Ch2\'s to-do item)', async (t) => {
    t.diagnostic(`instant ${at(AT8.d9)}`);
    const ra = await a.as(RANA, 'en');
    const rz = await zero.as(RANA, 'en');
    for (const path of [S, `${S}/admin`, `${S}/admin/topics`, `${S}/admin/topics/${ID.math}`, `${S}/admin/people`, `${S}/admin/results`]) {
      const x = await n1(await ra.get(path));
      const y = await n1(await rz.get(path));
      assert.equal(x.key, y.key, `Rana as admin ${path}: identical (N1) to W8-0`);
    }
    const ma = await a.as(MONA, 'en');
    const mz = await zero.as(MONA, 'en');
    const EN = words8('school', 'en');
    const cuts: [string, (html: string) => string][] = [
      [`${S}/linked`, (h) => h.replace(/<p class="last-opened" data-activity>[\s\S]*?<\/p>/, `<p class="last-opened" data-activity>${EN('lastOpenedNone')}</p>`)],
      [`${S}/linked/${SALMA.id}`, (h) => h.replace(/<section id="guardian-todo"[\s\S]*?<\/section>\n<\/section>/, '')],
      [`${S}/linked/${SALMA.id}/activity`, (h) => h.replace(new RegExp(`<li class="row"><bdi class="title">Exam revision ${MARKER}</bdi>[\\s\\S]*?</li>`), '')],
    ];
    for (const [path, cut] of cuts) {
      const x = await n1(await ma.get(path));
      const y = await n1(await mz.get(path));
      const zeroCut = cut(y.body);
      assert.notEqual(zeroCut, y.body, `${path}: W8-0 has the 3.4 change to cut`);
      assert.equal(x.body, zeroCut, `Mona ${path}: identical to W8-0 apart from the 3.4 change`);
    }
  });
});

// ------------------------------------------------------------------ AT-4.4 ----
/** Everything of Ch3 that must not show before day X (L1). */
// R1a (UX-16a row): Ch3's date also as S4 shows it, in both languages.
const CH3_SIGNS = [MARKER, ID.ch3, ID.l31, '2026-12-17', s4('2026-12-17', 'en'), s4('2026-12-17', 'ar'), 'Revision', 'Exam revision'];

/** Every surface of the 3.4 inventory (requestList) and the guardian, preview and quiz surfaces again, as one person each. */
function scanList(): { who: Person; path: string; method: 'GET' | 'POST'; fields?: Record<string, string> }[] {
  const list = requestList().map((r) => ({ who: r.who, path: r.path, method: r.method, fields: r.fields }));
  for (const who of [SALMA, OMAR]) list.push({ who, path: `${S}/quiz/${ID.quiz}`, method: 'GET' }, { who, path: `${S}/learn/${ID.math}?open=${ID.ch3}`, method: 'GET' });
  for (const who of [HADEER, AMAL, RANA]) {
    list.push({ who, path: `${S}/preview/learn/${ID.math}?open=all`, method: 'GET' }, { who, path: `${S}/preview/read/${ID.l31}`, method: 'GET' }, { who, path: `${S}/preview/read/${ID.l22}`, method: 'GET' });
  }
  list.push({ who: MONA, path: `${S}/linked`, method: 'GET' }, { who: MONA, path: `${S}/linked/${SALMA.id}`, method: 'GET' }, { who: MONA, path: `${S}/linked/${SALMA.id}/activity`, method: 'GET' });
  list.push({ who: OWNER8, path: `/owner/spaces/${ID.space}/preview`, method: 'GET' });
  return list;
}

describe('W8 AT-4.4 an allow-list scan over every 3.4 surface, for Salma, Omar, Mona, Rana and the preview, before 2026-12-17, finds nothing of Ch3', { concurrency: false }, () => {
  for (const inOrder of [false, true]) {
    it(`W8 AT-4.4 Open in order ${inOrder ? 'on' : 'off'} at 2026-12-09 and 2026-12-16T23:59:59.999Z: no Ch3 title, marker, id, date or lesson title in any body or header (Mona's three pages included, though Salma marked and opened Ch3)`, async (t) => {
      const w = await w8World({ inOrder, atMs: AT8.d9 });
      try {
        let seen = 0;
        for (const ms of [AT8.d9, D16END]) {
          await w.clock(ms);
          t.diagnostic(`instant ${at(ms)}`);
          const clients = new Map<string, Client>();
          for (const r of scanList()) {
            if (!clients.has(r.who.key)) clients.set(r.who.key, await w.as(r.who, r.who === OWNER8 ? undefined : 'ar'));
            const c = clients.get(r.who.key)!;
            const res = r.method === 'GET' ? await c.get(r.path) : await c.post(r.path, r.fields ?? {});
            const body = Buffer.from(await res.arrayBuffer()).toString('utf8');
            const headers: string[] = [];
            res.headers.forEach((v, k) => headers.push(`${k}: ${v}`));
            // The address itself may name Ch3's id (it is the request); the response may not repeat it.
            const shown = `${body}\n${headers.join('\n')}`.split(r.path).join('[request]');
            for (const sign of CH3_SIGNS) assert.ok(!shown.includes(sign), `${at(ms)} ${r.who.key} ${r.method} ${r.path}: "${sign}" is not shown`);
            seen++;
          }
        }
        t.diagnostic(`AT-4.4 ${seen} responses scanned for ${CH3_SIGNS.length} signs`);
      } finally {
        await w.close();
      }
    });
  }
});

// ------------------------------------------------------------------ AT-4.5 ----
describe('W8 AT-4.5 every new string renders in all three kits in English and Arabic, with the kit\'s words and no {placeholder} left', { concurrency: false }, () => {
  for (const kit of ['school', 'company', 'university'] as Kit[]) {
    it(`W8 AT-4.5 ${kit}: openedOn on the outline and the locked lesson page, openNext on the card and in Continue`, async () => {
      const w = await w8World({ kit, inOrder: true, atMs: AT8.d9 });
      try {
        for (const id of [ID.l11, ID.l12]) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
        for (const lang of ['en', 'ar'] as const) {
          const t = words8(kit, lang);
          const c = await w.as(SALMA, lang);
          const outline = (await got(c, `${S}/learn/${ID.math}?open=all`)).html;
          const ch2 = outlineOf(outline).find((x) => x.id === ID.ch2)!;
          assert.deepEqual(ch2.reasons.map((r) => r.text), [t('openedOn', { date: s4('2026-12-10', lang) })], `${kit} ${lang}: openedOn on the outline`);
          const page = (await got(c, `${S}/read/${ID.l21}`)).html;
          assert.ok(textOf(page).includes(t('openedOn', { date: s4('2026-12-10', lang) })), `${kit} ${lang}: openedOn on the locked page`);
          const home = (await got(c, S)).html;
          const next = t('openNext', { title: 'Fractions', date: s4('2026-12-10', lang) });
          assert.equal(cardOf(home).next, next, `${kit} ${lang}: openNext on the card`);
          if (lang === 'en') assert.ok(next.startsWith(`Next: ${t('chapter')}: Fractions`), `${kit}: the kit's own word ("${t('chapter')}")`);
          for (const text of [textOf(outline), textOf(page), textOf(home)]) assert.ok(!/\{[a-zA-Z]+\}/.test(text), `${kit} ${lang}: no {placeholder} left`);
        }
      } finally {
        await w.close();
      }
    });
  }
});
