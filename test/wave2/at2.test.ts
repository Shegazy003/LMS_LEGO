// LMS wave 2, W2-1, AT-2 (product-contract v2 on PIL-225): only the learner
// sees or touches their marks. One describe per labelled expectation, each its
// own CI step (`W2 AT-2.<n> ...`), each on a fresh world. The statement spy
// shows that refusals come before any done-mark read; the crawls compare every
// page other people reach before and after Salma's marks.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { crawl, doneHits, doneWords, type Reached } from '../at13/pages.ts';
import {
  ADMIN, HADEER, MATH_ORDER, MONA, OMAR, SALMA, T1, T2, T3, as, home, lessonPath, markClock, marks, plain, press, salmaThreeMarks, subjectPath,
  timeForms, wave2World, withTwoRoles, type Wave1World,
} from './world.ts';

/** The text of the element with this id in a fetched page, or null. */
function byId(html: string, id: string): string | null {
  const m = new RegExp(`<(\\w+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return m ? plain(m[2]) : null;
}

/** Statements that name the done-mark table. */
const naming = (statements: string[]) => statements.filter((s) => /\bdone_mark\b/i.test(s));

/** Every lesson address of Mesk School a curious person could type: Mathematics, Arabic grammar and Reading club. */
const lessonPaths = (w: Wave1World) => [...Object.values(w.school.lessons), ...Object.values(w.school.arabicLessons)].map((id) => lessonPath(w.school, id));

/** The pages a person reaches from these starts (and the typed addresses), as path -> body, with the preview kept apart. */
async function reach(c: Client, start: string[], typed: string[]): Promise<Reached[]> {
  return crawl(c, start, typed, 120, (p) => !p.startsWith('/signout'));
}

describe('W2 AT-2.1 every mark and undo POST by the admin, the publisher, the guardian and the owner is refused before any done-mark read; another learner marks only their own', { concurrency: false }, () => {
  let w: Wave1World;
  let stored: Awaited<ReturnType<typeof marks>>;
  before(async () => {
    w = await wave2World();
    await salmaThreeMarks(w, await as(w, SALMA, 'en'));
    stored = await marks(w);
    assert.equal(stored.length, 3, 'Salma has three marks');
  });
  after(() => w?.close());

  /** Every POST (mark and undo, on each of Salma's lessons, with fields naming Salma) answers today's plain 403, reads no done mark, and changes nothing. */
  const refusedEverywhere = async (c: Client, who: string) => {
    const salmaId = w.ids[SALMA.username];
    const today = await c.get(`/s/${w.school.id}/results`);
    assert.equal(today.status, 403, `${who}: today's plain 403 (a learner-only address)`);
    const todayPage = await today.text();
    for (const title of MATH_ORDER) {
      for (const state of ['done', 'not-done']) {
        for (const extra of [{}, { learner: salmaId, learner_user_id: salmaId, user_id: salmaId }]) {
          w.p.spy!.start();
          const res = await press(c, w.school, w.school.lessons[title], state, extra);
          const statements = await w.p.spy!.stop();
          assert.equal(res.status, 403, `${who} ${state} ${title}: 403`);
          assert.equal(await res.text(), todayPage, `${who} ${state} ${title}: today's plain 403 page`);
          assert.deepEqual(naming(statements), [], `${who} ${state} ${title}: no statement names done_mark`);
        }
      }
    }
    assert.deepEqual(await marks(w), stored, `${who}: nothing changed`);
  };

  it('W2 AT-2.1 admin', async () => refusedEverywhere(w.admin, 'admin'));
  it('W2 AT-2.1 publisher', async () => refusedEverywhere(await as(w, HADEER, 'en'), 'publisher'));
  it('W2 AT-2.1 guardian', async () => refusedEverywhere(await as(w, MONA, 'en'), 'guardian'));
  it('W2 AT-2.1 owner', async () => {
    // The owner holds no membership in the space: the space itself refuses, with today's page for the owner.
    const res = await press(w.owner, w.school, w.school.lessons['Adding fractions'], 'done');
    const reading = await w.owner.get(lessonPath(w.school, w.school.lessons['Adding fractions']));
    assert.equal(res.status, 403, 'owner: 403');
    assert.equal(await res.text(), await reading.text(), 'owner: the same page the reading page gives the owner');
    w.p.spy!.start();
    for (const title of MATH_ORDER) for (const state of ['done', 'not-done']) {
      assert.equal((await press(w.owner, w.school, w.school.lessons[title], state, { learner: w.ids[SALMA.username] })).status, 403, `owner ${state} ${title}`);
    }
    assert.deepEqual(naming(await w.p.spy!.stop()), [], 'owner: no statement names done_mark');
    assert.deepEqual(await marks(w), stored, 'owner: nothing changed');
  });
  it('W2 AT-2.1 other learner', async () => {
    const omar = await as(w, OMAR, 'en');
    const salmaId = w.ids[SALMA.username];
    const extra = { learner: salmaId, learner_user_id: salmaId, user_id: salmaId };
    assert.equal((await press(omar, w.school, w.school.lessons['What is a percent'], 'done', extra)).status, 303, 'Omar C marks a lesson');
    assert.equal((await press(omar, w.school, w.school.lessons['Adding fractions'], 'not-done', extra)).status, 303, 'Omar C undoes a lesson Salma marked');
    const now = await marks(w);
    assert.deepEqual(now.filter((r) => r.learner_user_id === salmaId), stored, 'Salma\'s rows unchanged');
    assert.deepEqual(now.filter((r) => r.learner_user_id !== salmaId).map((r) => [r.learner_user_id, r.lesson_id]),
      [[w.ids[OMAR.username], w.school.lessons['What is a percent']]], 'only Omar C\'s own lesson is marked, as his');
  });
});

describe('W2 AT-2.2 no page the admin, the publisher, the guardian or the owner reaches shows a tick, tag, progress line, done control or count; their /learn and /read pages are as today', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-2.2 every page, Arabic and English, is the same before and after Salma\'s marks, and holds no done word or marker', async () => {
    const s = w.school;
    const learnPaths = [subjectPath(s, s.math), subjectPath(s, s.math, 'all'), subjectPath(s, s.arabic), ...lessonPaths(w)];
    const viewers = [
      { name: 'admin', who: ADMIN, start: [home(s), `/s/${s.id}/admin`, `/s/${s.id}/preview?from=home`], typed: learnPaths },
      { name: 'publisher', who: HADEER, start: [home(s), `/s/${s.id}/publish`, `/s/${s.id}/preview?from=home`], typed: learnPaths },
      { name: 'guardian', who: MONA, start: [home(s), `/s/${s.id}/linked`, `/s/${s.id}/linked/${w.ids[SALMA.username]}`], typed: learnPaths },
      { name: 'owner', who: null, start: ['/owner', `/owner/spaces/${s.id}`, `/owner/spaces/${s.id}/preview`], typed: learnPaths },
    ];
    // Everyone signs in once, before the first look, so the two looks differ by Salma's marks alone.
    const salma = await as(w, SALMA, 'en');
    const clients = new Map<string, Client>();
    for (const v of viewers) clients.set(v.name, v.who ? await as(w, v.who, 'ar') : w.owner);
    const look = async (v: (typeof viewers)[number], lang: 'ar' | 'en') => {
      const c = clients.get(v.name)!;
      assert.equal((await c.post('/account/language', { lang })).status, 303);
      return reach(c, v.start, v.typed);
    };
    const seen = new Map<string, Reached[]>();
    for (const lang of ['ar', 'en'] as const) for (const v of viewers) seen.set(`${v.name} ${lang}`, await look(v, lang));
    await salmaThreeMarks(w, salma);
    let scanned = 0;
    for (const lang of ['ar', 'en'] as const) {
      for (const v of viewers) {
        const before = new Map(seen.get(`${v.name} ${lang}`)!.map((p) => [p.path, p]));
        const now = await look(v, lang);
        assert.deepEqual(now.map((p) => p.path), [...before.keys()], `${v.name} ${lang}: the same pages`);
        for (const p of now) {
          if (!p.contentType.startsWith('text/')) continue;
          scanned++;
          // The owner's usage meter counts every request of the day (today's page), so its lines move with the crawl itself.
          const steady = (b: string) => b.replace(/<li data-usage="[^"]*"[\s\S]*?<\/li>/g, '<li data-usage>');
          const was = steady(before.get(p.path)!.body);
          const is = steady(p.body);
          if (is !== was) {
            let i = 0;
            while (is[i] === was[i]) i++;
            assert.fail(`${v.name} ${lang} ${p.path}: the same page as before Salma's marks; was "${was.slice(i - 60, i + 60)}", now "${is.slice(i - 60, i + 60)}"`);
          }
          // The preview draws "Mark as done" inert (AT-4.3); nothing else of a done mark anywhere.
          assert.deepEqual(doneHits(p.body, doneWords(p.path.includes('/preview'))), [], `${v.name} ${lang} ${p.path}: no done word or marker`);
          if (/\/(learn|read)\//.test(p.path) && !p.path.includes('/preview')) {
            assert.ok(!/id="done-(state|progress|tag)"/.test(p.body), `${v.name} ${lang} ${p.path}: no done block, tag or progress line`);
          }
        }
      }
    }
    assert.ok(scanned >= 100, `pages scanned: ${scanned}`);
  });
});

describe('W2 AT-2.3 another learner\'s pages show only their own marks: with Salma\'s three, Omar C\'s Mathematics outline and lessons are as today', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-2.3 Omar C\'s outline and every lesson are the same before and after Salma\'s marks', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const omar = await as(w, OMAR, lang);
      const paths = [subjectPath(w.school, w.school.math), subjectPath(w.school, w.school.math, 'all'), ...MATH_ORDER.map((t) => lessonPath(w.school, w.school.lessons[t]))];
      const before = new Map<string, string>();
      for (const p of paths) before.set(p, await (await omar.get(p)).text());
      await salmaThreeMarks(w, await as(w, SALMA, 'en'));
      for (const p of paths) {
        const page = await (await omar.get(p)).text();
        assert.equal(page, before.get(p), `${lang} ${p}: as before Salma's marks`);
        assert.ok(!/data-done|id="done-progress"|id="done-tag"/.test(page), `${lang} ${p}: no tick, tag or progress line`);
      }
      for (const t of MATH_ORDER) {
        assert.match(await (await omar.get(lessonPath(w.school, w.school.lessons[t]))).text(), /name="state" value="done"/, `${lang} ${t}: his own not-done block`);
      }
      await w.p.sql('DELETE FROM done_mark');
    }
  });
});

describe('W2 AT-2.4 the privacy scans AT-13a and AT-13b carry the done-mark words and marker, and pass with marks present', { concurrency: false }, () => {
  it('W2 AT-2.4 the forbidden lists hold every W2-1 key in both languages and data-done (the scans run in their own steps)', async () => {
    const { W2_KEYS } = await import('../at13/pages.ts');
    const words = doneWords(false);
    assert.equal(words.size, W2_KEYS.length * 2, 'every key, English and Arabic');
    for (const v of words.values()) assert.ok(v.length >= 3, `a word worth looking for: "${v}"`);
    assert.deepEqual(doneHits('<span data-done="lesson"></span>', new Map()), ['the tick marker data-done']);
  });
});

/** Reasons the source breaks the AT-2.5 rule (empty when it keeps it): files maps a path under src/ to its text. */
export function doneMarkOffences(files: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [path, text] of files) {
    if (path !== 'progress.ts' && /\bdone_mark\b/.test(text)) out.push(`${path} names done_mark (only src/progress.ts may)`);
  }
  // The code of progress.ts without its comments.
  const progress = (files.get('progress.ts') ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Every statement: a string literal naming the table, then its bound values up to the closing parenthesis of the call.
  const calls = [...progress.matchAll(/db\.(run|first|all)(?:<[^>]*>)?\(\s*(`[^`]*`|'[^']*')\s*,([^;]*?)\);/g)];
  const inCalls = calls.reduce((n, m) => n + (m[2].match(/\bdone_mark\b/g) ?? []).length, 0);
  const inCode = (progress.match(/\bdone_mark\b/g) ?? []).length;
  if (inCalls !== inCode) out.push(`progress.ts: done_mark named ${inCode} times, ${inCalls} of them in a plain db call`);
  for (const [, , sql, args] of calls) {
    if (!/\bspace_id\b/.test(sql) || !/\blearner_user_id\b/.test(sql)) out.push(`a statement without space_id and learner_user_id: ${sql.slice(0, 60)}`);
    if (!/^\s*who\.spaceId,\s*who\.userId\b/.test(args)) out.push(`a statement not bound from the signed-in learner first: ${args.trim().slice(0, 60)}`);
  }
  if ((progress.match(/as Learner\b/g) ?? []).length !== 1) out.push('progress.ts: a Learner is made somewhere other than signedInLearner');
  if (!/c\.get\('space'\)\.id, userId: c\.get\('user'\)!\.id/.test(progress)) out.push('signedInLearner does not take the space and the person from the request context');
  if (/\bc\.req\b|\breq\.(param|query|parseBody|header)/.test(progress)) out.push('progress.ts reads the request');
  return out;
}

describe('W2 AT-2.5 (code guard) done_mark is named only in src/progress.ts, and every statement names and binds space_id and learner_user_id from the signed-in learner', { concurrency: false }, () => {
  it('W2 AT-2.5 the guard catches planted violations (self-check), and the source passes', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const root = new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files = new Map<string, string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|js|sql)$/.test(name)) files.set(relative(root, p).replace(/\\/g, '/'), readFileSync(p, 'utf8'));
      }
    };
    walk(root);
    assert.ok(files.has('progress.ts') && files.size >= 20, `src/ read (${files.size} files)`);
    assert.deepEqual(doneMarkOffences(files), [], 'the source keeps the rule');

    const progress = files.get('progress.ts')!;
    const planted = (path: string, text: string) => doneMarkOffences(new Map([...files, [path, text]]));
    assert.equal(planted('views/admin.ts', `${files.get('views/admin.ts')}\nconst n = 'SELECT COUNT(*) FROM done_mark';`).length, 1, 'a count elsewhere');
    assert.ok(planted('progress.ts', progress.replace("'DELETE FROM done_mark WHERE space_id = ? AND learner_user_id = ? AND lesson_id = ?'", "'DELETE FROM done_mark WHERE lesson_id = ?'")).length >= 1, 'a statement without the two columns');
    assert.ok(planted('progress.ts', progress.replace('who.spaceId, who.userId, lessonId,\n  );\n}\n\n/** Whether', 'who.spaceId, c.req.query(\'learner\'), lessonId,\n  );\n}\n\n/** Whether')).length >= 1, 'a learner id from the request');
    assert.ok(planted('progress.ts', `${progress}\nexport const anyone = (id: string) => ({ spaceId: 'x', userId: id }) as Learner;`).length >= 1, 'a Learner made from an id');
  });
});

describe('W2 AT-2.6 (W2-e) Amal and Mona, each also a learner, mark only as themselves and see only their own marks, never on admin, guardian or preview pages', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave2World();
    await withTwoRoles(w);
  });
  after(() => w?.close());

  it('W2 AT-2.6 marks as themselves, own marks only, no block where not a learner, nothing on admin, guardian and preview pages', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    assert.equal((await press(salma, s, s.lessons['Comparing fractions'], 'done')).status, 303, 'Salma marks Comparing fractions');
    const amal = await as(w, ADMIN, 'en');
    const mona = await as(w, MONA, 'en');
    assert.equal((await press(amal, s, s.lessons['Adding fractions'], 'done', { learner: w.ids[SALMA.username] })).status, 303, 'Amal marks Adding fractions');
    assert.equal((await press(mona, s, s.lessons['Reading decimals'], 'done', { learner: w.ids[SALMA.username] })).status, 303, 'Mona marks Reading decimals');
    const rows = await marks(w);
    const mine = (u: string) => rows.filter((r) => r.learner_user_id === w.ids[u]).map((r) => r.lesson_id);
    assert.deepEqual(mine(SALMA.username), [s.lessons['Comparing fractions']]);
    assert.deepEqual(mine(ADMIN.username), [s.lessons['Adding fractions']]);
    assert.deepEqual(mine(MONA.username), [s.lessons['Reading decimals']]);

    // On /read and on the outline each sees their own state only (W2-1b adds the outline's ticks and progress line).
    for (const [c, own] of [[amal, 'Adding fractions'], [mona, 'Reading decimals']] as const) {
      for (const title of MATH_ORDER) {
        const lesson = await (await c.get(lessonPath(s, s.lessons[title]))).text();
        const mineToo = title === own;
        assert.equal(byId(lesson, 'done-control'), mineToo ? 'Mark as not done' : 'Mark as done', `${title}: ${mineToo ? 'their own mark' : 'not theirs (Salma\'s does not count)'}`);
        assert.equal(byId(lesson, 'done-tag') !== null, mineToo, `${title}: the Done tag only on their own mark`);
      }
      const outline = await (await c.get(subjectPath(s, s.math))).text();
      const ticked = [...outline.matchAll(/data-done="lesson"[\s\S]*?<a data-lesson="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(ticked, [s.lessons[own]], `the outline: only their own tick (${own})`);
      assert.equal(byId(outline, 'done-progress'), 'Done: 1 of 5 lessons', 'the outline: their own count');
    }
    assert.equal((await press(amal, s, s.lessons['Adding fractions'], 'not-done')).status, 303, 'Amal undoes hers');
    assert.deepEqual((await marks(w)).filter((r) => r.learner_user_id === w.ids[ADMIN.username]), [], 'her row is gone');
    assert.equal((await marks(w)).length, 2, 'the others stay');

    // Amal reads Arabic grammar as the admin; it is not assigned to her as a learner.
    const prep = s.arabicLessons['Prepositions'];
    const stored = await marks(w);
    const reading = await amal.get(lessonPath(s, prep));
    assert.equal(reading.status, 200, 'Amal reads it as the admin');
    assert.ok(!(await reading.text()).includes('id="done-state"'), 'with no done block');
    assert.equal((await press(amal, s, prep, 'done')).status, 403, 'her press is refused');
    assert.deepEqual(await marks(w), stored, 'and stores nothing');

    // Her admin pages, Mona's guardian pages and Amal's preview: nothing of any mark; the preview reads no done mark.
    const adminPages = await crawl(amal, [`/s/${s.id}/admin`], [`/s/${s.id}/admin/people/${w.ids[SALMA.username]}`], 80, (p) => p.startsWith(`/s/${s.id}/admin`));
    const guardianPages = await crawl(mona, [`/s/${s.id}/linked`, `/s/${s.id}/linked/${w.ids[SALMA.username]}`], [], 40, (p) => p.startsWith(`/s/${s.id}/linked`));
    w.p.spy!.start();
    const previewPages = await crawl(amal, [`/s/${s.id}/preview?from=home`], [], 60, (p) => p.startsWith(`/s/${s.id}/preview`));
    assert.deepEqual(naming(await w.p.spy!.stop()), [], 'the preview runs no statement naming done_mark');
    assert.ok(previewPages.some((p) => p.path.includes('/preview/read/') && p.status === 200), 'the crawl reached a preview lesson');
    for (const [what, pages, words] of [['admin', adminPages, doneWords(false)], ['guardian', guardianPages, doneWords(false)], ['preview', previewPages, doneWords(true)]] as const) {
      assert.ok(pages.length >= 2,`${what}: pages ${pages.length}`);
      for (const p of pages) if (p.contentType.startsWith('text/')) assert.deepEqual(doneHits(p.body, words), [], `${what} ${p.path}`);
    }
  });
});

describe('W2 AT-2.7 lesson and outline responses carry Cache-Control: no-store, and no stored marked_at reaches a body, a header or a log line', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-2.7 no-store on every lesson and outline response to a signed-in person; no marked_at anywhere', async () => {
    const s = w.school;
    const physics = String((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${s.physics}'`))[0].id);
    w.p.faults!.clearLog();
    const recorded: { what: string; status: number; headers: string; body: string }[] = [];
    const record = async (what: string, res: Response) => {
      const body = await res.text();
      recorded.push({ what, status: res.status, headers: [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n'), body });
      return { status: res.status, cache: res.headers.get('cache-control') ?? '', body };
    };
    const salma = await as(w, SALMA, 'en');
    for (const [i, title] of MATH_ORDER.slice(0, 3).entries()) {
      await markClock(w, [T1, T2, T3][i]);
      await record(`press ${title}`, await press(salma, s, s.lessons[title], 'done'));
    }
    await markClock(w, null);
    // A failed save as well, so its log line is in the record (UX-30's forced fault).
    w.p.faults!.set({ before: (sql) => { if (/done_mark/.test(sql) && /^\s*(INSERT|DELETE)/i.test(sql)) throw new Error('forced'); } });
    await record('failed press', await press(salma, s, s.lessons['What is a percent'], 'done'));
    w.p.faults!.set({});
    await record('undo', await press(salma, s, s.lessons['Reading decimals'], 'not-done'));
    // Every stored time comes from the test clock: a real-time press would share its second with the Date header.
    await markClock(w, T3 + 1000);
    await record('again', await press(salma, s, s.lessons['Reading decimals'], 'done'));
    await markClock(w, null);

    const learnAndRead = (who: string) => [
      subjectPath(s, s.math), subjectPath(s, s.math, 'all'), subjectPath(s, s.arabic), subjectPath(s, s.physics),
      ...Object.values(s.lessons).map((id) => lessonPath(s, id)), ...Object.values(s.arabicLessons).map((id) => lessonPath(s, id)),
      lessonPath(s, physics), lessonPath(s, 'made-up-lesson-id'), ...MATH_ORDER.map((t) => `${lessonPath(s, s.lessons[t])}?marked=done`),
    ].map((p) => [who, p] as const);
    const people: [string, Client][] = [['Salma', salma], ['Omar C', await as(w, OMAR, 'ar')], ['Amal', w.admin], ['Hadeer', await as(w, HADEER, 'en')]];
    let checked = 0;
    for (const [who, c] of people) {
      for (const [, path] of learnAndRead(who)) {
        const r = await record(`${who} ${path}`, await c.get(path));
        assert.match(r.cache, /\bno-store\b/, `${who} ${path} (${r.status}): Cache-Control no-store`);
        checked++;
      }
    }
    for (const path of [home(s), `/s/${s.id}/results`, '/account']) await record(`Salma ${path}`, await salma.get(path));
    assert.ok(checked >= 80, `lesson and outline responses checked: ${checked}`);

    const stored = (await marks(w)).map((r) => r.marked_at);
    assert.ok(stored.includes(T1) && stored.includes(T2), 'the test times are stored');
    const forms = stored.flatMap(timeForms);
    const logs = w.p.faults!.log();
    assert.ok(logs.some((l) => l.includes('progress write failed')), 'the failed save is in the log record');
    for (const r of recorded) {
      for (const f of forms) {
        assert.ok(!r.body.includes(f), `${r.what} (${r.status}): body holds no marked_at ("${f}")`);
        assert.ok(!r.headers.includes(f), `${r.what}: headers hold no marked_at ("${f}")`);
      }
    }
    for (const l of logs) for (const f of forms) assert.ok(!l.includes(f), `log line holds no marked_at ("${f}"): ${l}`);
  });
});
