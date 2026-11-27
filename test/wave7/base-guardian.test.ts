// LMS wave 7, W7-3 (product-contract v3 addendum on PIL-285, AT-8, with the
// v4 amendment on PIL-295, R11): nobody else sees the guardian's quiz scores,
// and every other page is W7-2-main's. W7-2-main c1a9d14 (pinned; CI checks it
// out into LMS_BASE_ROOT, default .base-w73/) and this candidate run side by
// side in this process, each on its own copy of one database:
// 1. the world (wave 7's W7-a and W7-g, with or without W7-g's attempts, lesson
//    activity on or off) is built by W7-2-main's code, both clocks pinned at
//    2026-12-10 12:00:00 UTC, and every person signs in there;
// 2. that database is copied (VACUUM INTO) and the candidate runs on the copy
//    with the same stored files: same rows, ids and sessions (no migration:
//    W7-3 stores nothing new);
// 3. every page reachable from the home of Mona, Sami Test, Nabil Test, Hala
//    Test, Salma, Omar C, Karim Test, Amal, Rana Test, Hadeer, Shimaa and the
//    owner, in Arabic and English, is fetched from both, plus every admin
//    answers address of QA; each pair must answer the same, except only the
//    differences AT-8.3 and AT-8.4 list by address.
// AT-8.1 (refusals), AT-8.2 (privacy scans on the DOM tree) and the base parts
// of AT-7.5 and AT-7.9 run on the same pairs. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { seed, signedIn } from '../support/seed.ts';
import { inProcess, startProductWith, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { UI } from '../../src/i18n/ui.ts';
import { activityIn, annHits, doneHits, doneWords, exemptRemoved, isExemptPage, lockHits, quizHits, resultsSection, todoHits, uploadHits, visible } from '../at13/pages.ts';
import { HALA7, NABIL7, QZ_TITLE, SAMI7, byId, domOf, dropIds, guardianAllowed, guardianQuizOf, quizAllowListProblems, withW7g, withoutElement, type W7g } from './guardian.ts';
import {
  ADMIN, AT, HADEER, KARIM5, MONA, OMAR, RANA5, SALMA, SHIMAA, TITLES, W7A, adminQuizzes, cutWave7Style, linkedPath, publisherQuizzes, resultsOf, selectorsOf, wave7World, words, type Wave1World,
} from './world.ts';
import { OPENING_CARD } from '../wave8/world.ts';
import { d9People } from '../d9/base.ts';
import { linksOf, r1aNormal } from '../redesign/base.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: W7-2-main c1a9d14 (PR #56 merged, 13 of 13 checks), the contract's "today's". */
export const BASE_SHA = 'c1a9d14dfc17d89a280c9effd2179f09c2148bcc';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w73');

type Twin = Product & { worker: InProcessWorker };
interface Who { who: string; base: Client; cand: Client }
interface Pair { w: Wave1World; g: W7g; base: Twin; cand: Twin; people: Who[]; both(sql: string): Promise<void>; close(): Promise<void> }

function twin(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

async function pinned(url: string): Promise<void> {
  const res = await fetch(url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ atMs: AT.noon }) });
  assert.equal(res.status, 200, 'the fixed clock answers');
}

/** A made-up guardian of the Company space, linked to Salma there (AT-8.1's "a guardian of another space"). */
const GINA7 = { display_name: 'Gina Test', username: 'gina.w7', password: 'gina-wave7-pass', role: 'guardian' as const, mobile: '01071710014' };

async function pair(opts: { attempts: boolean; activity: boolean }): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `W7-2-main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0016_quizzes.sql')), 'the base is main after wave 7\'s migration');
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'views', 'quiz-take.ts')), 'the base is main after W7-2');
  assert.ok(!readFileSync(join(BASE_ROOT, 'src', 'views', 'guardian.ts'), 'utf8').includes('quiz-guardian'), 'the base is main before W7-3');
  let base: Twin | null = null;
  startProductWith(async () => (base = await inProcess({ root: BASE_ROOT })));
  let w: Wave1World;
  try {
    ({ w } = await wave7World({ activity: opts.activity }));
  } finally {
    startProductWith(null);
  }
  const b = base as Twin | null;
  assert.ok(b, 'the world runs on W7-2-main');
  const people: { who: string; c: Client }[] = [];
  let g: W7g;
  try {
    g = await withW7g(w, { attempts: opts.attempts });
    await seed(b.url, { spaceId: w.company.id, grantedBy: 'basem.admin', people: [{ ...GINA7, valid_until: utcDatePlusDays(60) }], links: [{ guardian: GINA7.username, learner: SALMA.username }] });
    for (const [who, person] of [
      ['Mona', MONA], ['Sami Test', SAMI7], ['Nabil Test', NABIL7], ['Hala Test', HALA7], ['Salma', SALMA], ['Omar C', OMAR], ['Karim Test', KARIM5],
      ['Amal', ADMIN], ['Rana Test', RANA5], ['Hadeer', HADEER], ['Shimaa', SHIMAA], ['Gina Test', GINA7],
    ] as const) people.push({ who, c: await signedIn(b.url, person.username, person.password) });
    people.push({ who: 'owner', c: w.owner });
  } catch (err) {
    await w.close();
    throw err;
  }
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w73-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const cand = await inProcess({ sqlite: new DatabaseSync(file), files: b.worker.files });
  await pinned(cand.url);
  return {
    w, g: g!, base: b, cand,
    people: people.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    async both(sql: string) {
      await b.sql(sql);
      await cand.sql(sql);
    },
    async close() {
      await cand.stop();
      await w.close();
      rmSync(file, { force: true });
    },
  };
}

// ----------------------------------------------------------- comparing ----

const TEACHER_PAGE = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const ADMIN_LIST = /^\/s\/[^/]+\/admin\/topics\/[^/]+\/quizzes(\?|$)/;
const ADMIN_SCORES = /^\/s\/[^/]+\/admin\/topics\/[^/]+\/quizzes\/[^/]+\/results(\?|$)/;
const LINKED_PAGE = /^\/s\/[^/]+\/linked\/[^/?#]+$/;
const READ = /^\s*(SELECT|WITH)\b/i;
const SCORE = /FROM quiz_attempt att\b/;

interface Result { who: string; what: string; path: string; status: number; problem: string | null; block: boolean; cut: string[]; reads: { base: number; cand: number }; score: number; cache: string | null; body: string }

function spyOn(t: Twin): () => string[] {
  const log: string[] = [];
  t.worker.setHooks({ seen: (sql) => void log.push(sql) });
  return () => {
    t.worker.setHooks({});
    return log;
  };
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nmain:      ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

/** Wave 5's closed list of normalisations: each product's own address; the owner's "usage today" block (live counters). */
function normalised(body: string, url: string): string {
  // LMS-D9 (PIL-320): the appoint form's help line and role choices (test/d9/base.ts).
  // LMS redesign R1a (PIL-325): the new shell, learner home and S4 dates, on both sides (test/redesign/base.ts).
  return r1aNormal(d9People(body.split(url).join('[product]').replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]')));
}

/** The quiz card's help line of a teacher page (AT-8.3 / 8.4 (b): the only allowed difference there). */
const HELP = /(<section id="quizzes" class="card"[\s\S]*?)<p class="quiz-help">[\s\S]*?<\/p>/;
/** The results link on each admin quiz list row (AT-8.3 / 8.4 (c)). */
const RESULTS_LINK = /\n<a class="quiz-results-link" href="[^"]+">[\s\S]*?<\/a>/g;

const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;
/** What is wrong with the candidate's style against W7-2-main's, or null: it must be the base's with only rules whose selectors
 * all start with `#quiz-guardian` appended, and the wave 7 block (from its mark) must keep its rule. */
function styleProblem(base: string, cand: string): string | null {
  if (!cand.startsWith(base)) return 'the candidate\'s style does not start with W7-2-main\'s';
  const added = cand.slice(base.length);
  const sels = selectorsOf(added);
  if (!sels.length || sels.some((s) => !s.startsWith('#quiz-guardian'))) return `an added style rule outside #quiz-guardian: ${JSON.stringify(added.slice(0, 120))}`;
  return cutWave7Style(cand).problem;
}

/** One address on both products, each under the statement spy; the candidate's body cut only by the allowed differences. */
async function same(p: Pair, who: Who, path: string, out: Result[], allowBlock: boolean): Promise<{ res: Response; body: string; links: string[] }> {
  const stopB = spyOn(p.base);
  const rb = await who.base.get(path);
  const rawB = await rb.text();
  const bb = normalised(rawB, p.base.url);
  await p.base.worker.settle();
  const sb = stopB().filter((x) => READ.test(x)).length;
  const stopC = spyOn(p.cand);
  const rc = await who.cand.get(path);
  const raw = await rc.text();
  await p.cand.worker.settle();
  const logC = stopC();
  const sc = logC.filter((x) => READ.test(x)).length;
  let cb = normalised(raw, p.cand.url);
  const problems: string[] = [];
  const cut: string[] = [];
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on W7-2-main, ${rc.status} on the candidate`);
  for (const h of ['content-type', 'cache-control']) if (rc.headers.get(h) !== rb.headers.get(h)) problems.push(`another ${h}`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  if (loc(rc, p.cand.url) !== loc(rb, p.base.url)) problems.push('another Location');
  // v2's style handling (contract v3, files): the candidate's style is W7-2-main's with only `#quiz-guardian` rules added at
  // the end of the wave 7 block, which stays within its rule (scoped selectors, at most 4 KB); then the styles compare equal.
  const sB = HEAD_STYLE.exec(bb);
  const sC = HEAD_STYLE.exec(cb);
  if (sB && sC && sB[2] !== sC[2]) {
    const problem = styleProblem(sB[2], sC[2]);
    if (problem) problems.push(problem);
    else {
      cb = cb.replace(HEAD_STYLE, (_, a: string, _s: string, z: string) => a + sB[2] + z);
      cut.push('#quiz-guardian style');
    }
  }
  const block = LINKED_PAGE.test(path) && cb.includes('<section id="quiz-guardian"');
  if (block) {
    if (!allowBlock) problems.push('a #quiz-guardian block where the learner has no listed quiz');
    cb = withoutElement(cb, 'quiz-guardian');
    cut.push('#quiz-guardian');
  }
  if (TEACHER_PAGE.some((re) => re.test(path))) {
    const help = HELP.exec(bb);
    if (help) {
      const before = cb;
      cb = cb.replace(HELP, `$1${/<p class="quiz-help">[\s\S]*?<\/p>/.exec(bb.slice(help.index + help[1].length))![0]}`);
      if (before !== cb) cut.push('quizCardHelp');
    }
    // LMS wave 8 (contract on PIL-299, B1): the Opening dates card, after the quiz card, is the teacher pages' allowed difference.
    const before = cb;
    cb = cb.replace(OPENING_CARD, '');
    if (before !== cb) cut.push('#opening-dates');
  }
  if (ADMIN_LIST.test(path)) {
    const before = cb;
    cb = cb.replace(RESULTS_LINK, '');
    if (before !== cb) cut.push('quizResultsLink');
  }
  if (cb !== bb) problems.push(`another body ${firstDifference(bb, cb)}`);
  if (cb.includes('id="quiz-guardian"')) problems.push('#quiz-guardian outside a linked learner\'s page');
  out.push({ who: who.who, what: `${who.who} GET ${path}`, path, status: rc.status, problem: problems.length ? problems.join('; ') : null, block, cut, reads: { base: sb, cand: sc }, score: logC.filter((x) => SCORE.test(x)).length, cache: rc.headers.get('cache-control'), body: raw });
  // The crawl follows main's own links (R1a: the learner home is one token in the compared body).
  return { res: rb, body: bb, links: linksOf(rawB) };
}

const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path) && !ADMIN_SCORES.test(path);

async function crawlBoth(p: Pair, who: Who, out: Result[], allowBlock: boolean, limit = 700): Promise<string[]> {
  const seen = new Set<string>();
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const { res, links } = await same(p, who, path, out, allowBlock);
    if (res.status >= 300 && res.status < 400) {
      const to = (res.headers.get('location') ?? '').replace(p.base.url, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!(res.headers.get('content-type') ?? '').startsWith('text/html')) continue;
    for (const next of links) {
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `${who.who}: the crawl ends before ${limit} pages`);
  return [...seen];
}

/** Every person's pages in both languages, plus the guardians' linked pages by address and every admin answers address of QA. */
async function compareAll(p: Pair, allowBlock: boolean): Promise<Result[]> {
  const out: Result[] = [];
  const s = p.w.school;
  const learners = [p.g.salma, p.g.omar, p.g.karim, p.g.hala, p.g.rana];
  for (const lang of ['ar', 'en'] as const) {
    for (const who of p.people) {
      for (const c of [who.base, who.cand]) assert.ok((await c.post('/account/language', { lang })).status < 400, `${who.who}: language ${lang}`);
      const pages = await crawlBoth(p, who, out, allowBlock);
      assert.ok(pages.length >= 2, `${who.who} (${lang}): pages reached`);
      if (['Mona', 'Sami Test', 'Nabil Test', 'Hala Test', 'Gina Test'].includes(who.who)) {
        for (const id of [...learners, 'made-up-learner']) {
          const path = linkedPath(s, id);
          if (!pages.includes(path)) await same(p, who, path, out, allowBlock);
        }
      }
      if (who.who === 'Amal' || who.who === 'Rana Test') {
        // v4 R11: the admin answers address is compared with W7-2-main (403 there and here).
        for (const id of [...learners, 'made-up-learner']) await same(p, who, `${resultsOf(adminQuizzes(s, s.math), W7A.QA)}/${id}`, out, allowBlock);
      }
    }
  }
  return out;
}

const report = (rs: Result[]) => rs.filter((r) => r.problem).slice(0, 5).map((r) => `${r.what}: ${r.problem}`).join('\n');

/** AT-7.5 (base): a 200 linked learner's page is W7-2-main's count plus exactly one (the score statement); every other page W7-2-main's. */
function readProblems(rs: Result[]): string {
  return rs.filter((r) => {
    const plus = r.status === 200 && LINKED_PAGE.test(r.path) ? 1 : 0;
    // LMS redesign R1a (PIL-325, UX-55 row): wave 5's home block read is now the cards' latest-announcement read, which a
    // learner home with no subject card (nothing assigned) does not make: one fewer there.
    const noCards = r.status === 200 && /^\/s\/[^/?#]+$/.test(r.path) && /<main class="[^"]*\bhome\b/.test(r.body) && !/<ul id="my-list"/.test(r.body) ? 1 : 0;
    return r.reads.cand !== r.reads.base + plus - noCards || r.score !== plus;
  }).slice(0, 5).map((r) => `${r.what}: W7-2-main ${r.reads.base}, candidate ${r.reads.cand}, score statements ${r.score}`).join('\n');
}

// --------------------------------------------------------- AT-8.3 ----

for (const activity of [false, true]) {
  describe(`W7 AT-8.3 base comparison with no attempts against W7-2-main c1a9d14 (lesson activity ${activity ? 'on' : 'off'})`, { concurrency: false }, () => {
    let p: Pair;
    let results: Promise<Result[]> | null = null;
    const all = () => (results ??= compareAll(p, false));
    before(async () => {
      p = await pair({ attempts: false, activity });
    });
    after(() => p?.close());

    it(`W7 AT-8.3 every page has W7-2-main's status and body, but quizCardHelp on the editor and subject admin page and quizResultsLink (0) on the admin quiz list (activity ${activity ? 'on' : 'off'})`, async (t) => {
      const rs = await all();
      const per: Record<string, number> = {};
      for (const r of rs) per[r.who] = (per[r.who] ?? 0) + 1;
      const cutOn = (what: string) => new Set(rs.filter((r) => r.cut.includes(what)).map((r) => r.path)).size;
      t.diagnostic(`AT-8.3 (activity ${activity ? 'on' : 'off'}): ${rs.length} requests compared with W7-2-main ${BASE_SHA.slice(0, 7)} (${JSON.stringify(per)}); quizCardHelp cut on ${cutOn('quizCardHelp')} pages, quizResultsLink on ${cutOn('quizResultsLink')}, #quiz-guardian on ${cutOn('#quiz-guardian')}`);
      assert.equal(report(rs), '', 'every page answers as W7-2-main does but the listed differences');
      assert.equal(cutOn('#quiz-guardian'), 0, 'no attempts: no guardian block anywhere');
      assert.ok(cutOn('quizCardHelp') >= 2 && cutOn('quizResultsLink') >= 1, 'the help text and the admin list rows were seen');
      for (const who of ['Mona', 'Sami Test', 'Nabil Test', 'Hala Test', 'Amal', 'Rana Test', 'Hadeer', 'Shimaa', 'owner']) assert.ok((per[who] ?? 0) > 0, `${who} is in the crawl`);
      const list = rs.find((r) => ADMIN_LIST.test(r.path) && r.status === 200 && r.path.includes(p.w.school.math));
      assert.ok(list && [...list.body.matchAll(/class="quiz-results-link"[^>]*>([\s\S]*?)<\/a>/g)].every((m) => m[1].replace(/<[^>]*>/g, '').trim() === words('school', /lang="ar"/.test(list.body) ? 'ar' : 'en')('quizResultsLink', { n: '0' })), 'quizResultsLink (0) on each admin list row');
    });

    it(`W7 AT-7.5 (base, no attempts) the linked learner's page is W7-2-main's count plus exactly one, every other page W7-2-main's count (activity ${activity ? 'on' : 'off'})`, async (t) => {
      const rs = await all();
      const linked = rs.filter((r) => r.status === 200 && LINKED_PAGE.test(r.path));
      t.diagnostic(`AT-7.5 (no attempts, activity ${activity ? 'on' : 'off'}): ${linked.length} linked learner's pages at W7-2-main's count + 1 (e.g. ${JSON.stringify(linked[0]?.reads)}); guardian home ${JSON.stringify(rs.find((r) => /\/linked$/.test(r.path))?.reads)}`);
      assert.ok(linked.length >= 4, 'linked learner\'s pages measured');
      assert.equal(readProblems(rs), '', 'plus one on the linked learner\'s page only');
    });
  });
}

// --------------------------------------------------------- AT-8.4 ----

for (const activity of [true, false]) {
  describe(`W7 AT-8.4 with attempts (W7-g) against W7-2-main c1a9d14 (lesson activity ${activity ? 'on' : 'off'})`, { concurrency: false }, () => {
    let p: Pair;
    let results: Promise<Result[]> | null = null;
    const all = () => (results ??= compareAll(p, true));
    before(async () => {
      p = await pair({ attempts: true, activity });
    });
    after(() => p?.close());

    it(`W7 AT-8.4 every page equals W7-2-main's but #quiz-guardian on linked learners' pages with a listed quiz, quizCardHelp and quizResultsLink (n); the admin answers address is W7-2-main's 403 (activity ${activity ? 'on' : 'off'})`, async (t) => {
      const rs = await all();
      const blocks = rs.filter((r) => r.block);
      t.diagnostic(`AT-8.4 (activity ${activity ? 'on' : 'off'}): ${rs.length} requests compared with W7-2-main ${BASE_SHA.slice(0, 7)}; #quiz-guardian on ${blocks.length} linked pages (${[...new Set(blocks.map((r) => r.who))].join(', ')})`);
      assert.equal(report(rs), '', 'every page answers as W7-2-main does but the listed differences');
      for (const who of ['Mona', 'Sami Test', 'Nabil Test', 'Hala Test']) assert.ok(blocks.some((r) => r.who === who), `${who}: the block was seen (and cut) on a linked learner's page`);
      const answers = rs.filter((r) => /\/admin\/topics\/[^/]+\/quizzes\/[^/]+\/results\/[^/]+$/.test(r.path));
      assert.ok(answers.length >= 12 && answers.every((r) => r.status === 403 && !r.problem), 'the admin answers address: W7-2-main\'s 403, byte for byte');
    });

    it(`W7 AT-7.5 (base, with attempts) the linked learner's page is W7-2-main's count plus exactly one; the guardian home and the activity page W7-2-main's (activity ${activity ? 'on' : 'off'})`, async () => {
      assert.equal(readProblems(await all()), '', 'plus one on the linked learner\'s page only');
    });

    if (!activity) {
      it('W7 AT-7.9 (base) with activity off: outside #quiz-guardian Salma\'s page is W7-2-main\'s activity-off page byte for byte', async () => {
        const rs = await all();
        const salma = rs.filter((r) => r.path === linkedPath(p.w.school, p.g.salma) && r.who === 'Mona');
        assert.ok(salma.length === 2 && salma.every((r) => r.block && !r.problem), 'Mona on Salma\'s page, Arabic and English: the block, and the rest is W7-2-main\'s');
        assert.ok(salma.every((r) => r.body.includes('id="activity-off"')), 'the activity-off line as today');
      });
    }

    if (activity) {
      it('W7 AT-8.1 only their own linked learner; never cached: the refusals are W7-2-main\'s 403 byte for byte with no score statement; restoring brings the block back; Cache-Control no-store', async (t) => {
        const s = p.w.school;
        const by = (who: string) => p.people.find((x) => x.who === who)!;
        const out: Result[] = [];
        const refused = async (who: string, path: string, what: string) => {
          await same(p, by(who), path, out, false);
          const r = out.at(-1)!;
          assert.equal(r.status, 403, `${what}: 403`);
          assert.equal(r.problem, null, `${what}: W7-2-main's answer, byte for byte`);
          assert.equal(r.score, 0, `${what}: no score statement`);
          assert.ok((r.cache ?? '').includes('no-store'), `${what}: Cache-Control no-store`);
        };
        for (const c of p.people.flatMap((x) => [x.base, x.cand])) await c.post('/account/language', { lang: 'en' });
        await refused('Mona', linkedPath(s, p.g.omar), 'Mona at Omar C\'s page');
        await refused('Nabil Test', linkedPath(s, p.g.salma), 'Nabil Test at Salma\'s page');
        await refused('Gina Test', linkedPath(s, p.g.salma), 'a guardian of another space at Salma\'s page');
        for (const who of ['Mona', 'Sami Test', 'Nabil Test', 'Hala Test']) await refused(who, linkedPath(s, 'made-up-learner'), `${who} at a made-up id`);
        const sami = p.g.sami;
        await p.both(`UPDATE guardian_link SET ended_at = ${AT.noon - 1000} WHERE guardian_user_id = '${sami}' AND learner_user_id = '${p.g.omar}'`);
        await refused('Sami Test', linkedPath(s, p.g.omar), 'Sami Test after his link to Omar C is removed');
        await p.both(`UPDATE guardian_link SET ended_at = NULL WHERE guardian_user_id = '${sami}' AND learner_user_id = '${p.g.omar}'`);
        const back = await by('Sami Test').cand.get(linkedPath(s, p.g.omar));
        const backBody = await back.text();
        assert.ok(back.status === 200 && guardianQuizOf(backBody), 'restoring the link brings the block back at the next load');
        assert.ok((back.headers.get('cache-control') ?? '').includes('no-store'), 'the page with the block: no-store');
        await p.both(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${p.g.salma}' AND space_id = '${s.id}' AND role = 'learner'`);
        for (const who of ['Mona', 'Sami Test', 'Hala Test']) await refused(who, linkedPath(s, p.g.salma), `${who} after Salma's access ends`);
        await p.both(`UPDATE membership SET ended_on = NULL WHERE user_id = '${p.g.salma}' AND space_id = '${s.id}' AND role = 'learner'`);
        assert.ok(guardianQuizOf(await (await by('Mona').cand.get(linkedPath(s, p.g.salma))).text()), 'restoring the access brings the block back');
        t.diagnostic(`AT-8.1: ${out.length} refusals byte-identical to W7-2-main ${BASE_SHA.slice(0, 7)}, none ran a score statement`);
      });

      it('W7 AT-8.2 privacy scans on the DOM tree: outside the block the release 2 and v2 scans unchanged; inside it the allow-list; no other page shows the block or its words', async (t) => {
        const rs = (await all()).filter((r) => r.status === 200 && /<html/.test(r.body));
        const s = p.w.school;
        const lessonWords = (await p.cand.sql('SELECT title FROM lesson UNION SELECT title FROM material WHERE title IS NOT NULL')).map((r) => String(r.title)).filter((x) => x.length >= 6);
        const learnerNames = (await p.cand.sql("SELECT DISTINCT u.display_name AS n FROM membership m JOIN user u ON u.id = m.user_id WHERE m.role = 'learner'")).map((r) => String(r.n));
        const links: Record<string, Set<string>> = {};
        for (const [who, u] of [['Mona', MONA.username], ['Sami Test', SAMI7.username], ['Nabil Test', NABIL7.username], ['Hala Test', HALA7.username], ['Gina Test', GINA7.username]] as const) {
          links[who] = new Set((await p.cand.sql(`SELECT u.display_name AS n FROM guardian_link gl JOIN user u ON u.id = gl.learner_user_id JOIN user g ON g.id = gl.guardian_user_id WHERE g.username = '${u}' AND gl.ended_at IS NULL`)).map((r) => String(r.n)));
        }
        // Each learner's listed items (hand-written from W7-g: the expected lists of AT-7.2).
        const items: Record<string, [string, string, number, number][]> = {
          [p.g.salma]: [[TITLES.QA, 'Mathematics', 1, 3]], [p.g.omar]: [[TITLES.QA, 'Mathematics', 3, 3]], [p.g.karim]: [[TITLES.QG, 'Arabic grammar', 1, 1]],
        };
        const names: Record<string, string> = { [p.g.salma]: SALMA.display_name, [p.g.omar]: OMAR.display_name, [p.g.karim]: KARIM5.display_name };
        let guardianPages = 0;
        let blocks = 0;
        let others = 0;
        const own = (lang: 'ar' | 'en') => [UI[lang].guardianQuizTitle.split('{name}')[0].trim(), UI[lang].guardianQuizNote, UI[lang].guardianQuizCapped.split('{n}')[0].trim()];
        for (const r of rs) {
          const lang = /<html lang="ar"/.test(r.body) ? 'ar' : 'en';
          const where = `${r.what} (${lang})`;
          const guardian = ['Mona', 'Sami Test', 'Nabil Test', 'Hala Test', 'Gina Test'].includes(r.who) && r.path.includes('/linked');
          if (!LINKED_PAGE.test(r.path)) {
            others++;
            assert.equal(byId(domOf(r.body), 'quiz-guardian'), null, `${where}: no #quiz-guardian`);
            const text = visible(r.body);
            for (const v of own(lang)) assert.ok(!text.includes(v), `${where}: no guardian quiz words (${v})`);
            if (!guardian) continue;
          }
          if (!guardian) continue;
          guardianPages++;
          const tree = domOf(r.body);
          const block = byId(tree, 'quiz-guardian');
          if (block) {
            blocks++;
            const id = /\/linked\/([^/?#]+)/.exec(r.path)![1];
            // In the Company space Salma's one listed quiz is W7-g's QZ (1 of 1); Mesk's lists are the ones above.
            const list = r.path.startsWith(`/s/${p.w.company.id}/`) ? (id === p.g.salma ? [[QZ_TITLE, 'Mathematics', 1, 1]] as [string, string, number, number][] : undefined) : items[id];
            assert.ok(list, `${where}: a block only for a learner with a listed quiz`);
            assert.deepEqual(quizAllowListProblems(block, guardianAllowed(lang, names[id], list)), [], `${where}: the allow-list inside the block`);
          }
          // Outside the block (and wave 6's #guardian-todo, as wave 6 does): the release 2 and v2 scans, unchanged.
          void dropIds;
          const body = withoutElement(withoutElement(r.body, 'quiz-guardian'), 'guardian-todo');
          if (!isExemptPage(r.path)) {
            const cut = exemptRemoved(body);
            assert.deepEqual(activityIn(visible(cut)).filter((h) => !h.startsWith('a ')), [], `${where}: AT-13a no lesson-activity phrase`);
            const { rest, strays } = resultsSection(cut);
            assert.deepEqual(strays, [], `${where}: AT-13a the results section holds digits only in its own forms`);
            assert.deepEqual(activityIn(visible(rest)), [], `${where}: AT-13a no date, count or time outside the results`);
            const text = visible(cut);
            assert.deepEqual(lessonWords.filter((x) => text.includes(x)), [], `${where}: AT-9d and AT-13b no lesson or material title`);
            assert.deepEqual(learnerNames.filter((n) => !(links[r.who]?.has(n)) && n !== r.who && text.includes(n)), [], `${where}: AT-9d no learner the viewer is not linked to`);
          }
          assert.deepEqual(quizHits(body), [], `${where}: v2 AT-4.3 no quiz word, title, question, score or marker outside the block`);
          assert.deepEqual(doneHits(body, doneWords(false)), [], `${where}: no done mark`);
          assert.deepEqual(uploadHits(body), [], `${where}: no upload word`);
          assert.deepEqual(lockHits(body), [], `${where}: no lock state`);
          assert.deepEqual(annHits(body), [], `${where}: no announcement`);
          if (!activity) assert.deepEqual(todoHits(body), [], `${where}: no to-do state`);
        }
        t.diagnostic(`AT-8.2: ${guardianPages} guardian pages scanned with the block taken out, ${blocks} blocks checked against the allow-list, ${others} other pages without the block or its words`);
        assert.ok(blocks >= 8, `blocks checked (${blocks})`);
        assert.ok(guardianPages >= 16 && others >= 200, `the crawl reached the pages (${guardianPages} guardian, ${others} other)`);
        void s;
        void publisherQuizzes;
      });
    }
  });
}

// ------------------------------------------------- AT-8.2 self-check ----

describe('W7 AT-8.2 self-check: the allow-list catches a link, another name, a verdict, a date and a data attribute inside the block', () => {
  it('W7 AT-8.2 self-check', () => {
    const t = words('school', 'en');
    const ok = `<section id="quiz-guardian" class="card">\n<h2 id="quiz-guardian-title">Quiz scores: <bdi>Salma Test</bdi></h2>\n<p class="muted">${t('guardianQuizNote')}</p>\n<ul class="quiz-guardian-list"><li><bdi>Fractions check</bdi> <span class="muted quiz-guardian-line"><bdi>Mathematics</bdi> · score <bdi>1</bdi> of <bdi>3</bdi></span></li></ul>\n</section>`;
    const allowed = { texts: ['Quiz scores:', 'Quiz scores: Salma Test', 'Salma Test', t('guardianQuizNote')], titles: ['Fractions check'], lines: [t('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '3' })] };
    const check = (html: string) => quizAllowListProblems(byId(domOf(html), 'quiz-guardian')!, allowed);
    assert.deepEqual(check(ok), []);
    assert.ok(check(ok.replace('<bdi>Fractions check</bdi>', '<a href="/x"><bdi>Fractions check</bdi></a>')).length >= 1, 'a link');
    assert.ok(check(ok.replace('Salma Test</bdi></h2>', 'Omar Test</bdi></h2>')).length >= 1, 'another learner\'s name');
    assert.ok(check(ok.replace('</span></li>', ` ${t('quizRight')}</span></li>`)).length >= 1, 'a verdict word');
    assert.ok(check(ok.replace('</ul>', '</ul><p>2026-12-10</p>')).length >= 1, 'a date');
    assert.ok(check(ok.replace('<li>', '<li data-quiz="w7a-qa">')).length >= 1, 'a data attribute');
    assert.ok(check(ok.replace('</ul>', '</ul><!-- w7a-qa -->')).length >= 1, 'a comment');
    void withoutElement;
  });
});
