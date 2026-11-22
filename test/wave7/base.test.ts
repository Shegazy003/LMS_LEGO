// LMS wave 7, W7-1 (product-contract v2 on PIL-261, AT-5.1a, AT-5.1b, AT-5.2
// and the base part of AT-4.3): with no quizzes every page is W6-main's. The
// base comparison, live form, as waves 5 and 6 (test/wave6/base.test.ts):
// W6-main 6ce8366 (pinned; CI checks it out into LMS_BASE_ROOT, default
// .base-w7/) and this candidate run side by side in this process, each on its
// own copy of one database:
// 1. the world (wave 4's, lesson activity on; W5-a; Amal also a learner of
//    Mathematics; wave 5's AT-2 announcements; W6-a's due dates and Nour Test)
//    is built by W6-main's code on a database with its migrations, both clocks
//    pinned at 2026-12-10 12:00:00 UTC (W6-c), and every person signs in there;
// 2. that database is copied (VACUUM INTO), the copy gains 0016 (no quiz), and
//    the candidate runs on it with the same stored files: same rows, same ids,
//    same sessions;
// 3. every page reachable from the home of Salma, Omar C, Karim Test, Rana
//    Test, Nour Test, Youssef, Amal, Hadeer, Mona and the owner (their previews
//    and Salma's files included), in Arabic and in English, is fetched from
//    both one address at a time, and Salma's mark POSTs are sent to both; each
//    pair must answer the same.
// Style handling (contract AT-5): all new CSS is one block appended at the end
// of the inlined `CSS`, after wave 6's, starting with `/* wave 7 quizzes */`,
// every selector starting with `#quizzes`, `#quiz-` or `.quiz-` (inside an
// @media rule too), at most 4 KB. Each candidate page's <style> must equal
// W6-main's followed by exactly that block; then both are replaced by one
// token. Normalising (wave 5's closed list): each product's own address; the
// owner's "usage today" block. On the candidate the quiz card (`#quizzes`) may
// only be on a subject's editor or subject admin page; it is cut there
// (AT-5.1a) and fails anywhere else (AT-5.1b). Made-up data only.
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
import { onLocalD1 } from '../wave6/todo.ts';
import {
  ADMIN, AT, HADEER, KARIM5, MONA, NOUR6, OMAR, QL, QUIZ_CARD, RANA5, SALMA, W7A, W7_CSS_MAX, W7_MARK, YOUSSEF, annBlock, as, closeWave6, clockAt, publisherQuizzes, questionForm,
  resultsOf, wave4World, wave7BlockProblem, wave7World, withAt2, withW5a, withW6a, withW7a, withW7b, withW7d, withW7e, type Wave1World,
} from './world.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: W6-main 6ce8366 (W6-1c merged, wave 6 complete; the Lead's MAIN_SHA for W7-1). */
export const BASE_SHA = '6ce83669c286d1fd1c7742380c4f76df27a3184a';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w7');
const MIGRATION = '0016_quizzes.sql';
const MARK = W7_MARK;
const CSS_MAX = W7_CSS_MAX;

type Twin = Product & { worker: InProcessWorker };
interface Who { who: string; base: Client; cand: Client }
interface Pair { w: Wave1World; base: Twin; cand: Twin; people: Who[]; close(): Promise<void> }

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

async function pair(): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `W6-main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0015_due_dates.sql')) && !existsSync(join(BASE_ROOT, 'migrations', MIGRATION)), 'the base is main after wave 6 and before wave 7');
  let base: Twin | null = null;
  startProductWith(async () => (base = await inProcess({ root: BASE_ROOT })));
  let w: Wave1World;
  try {
    w = await wave4World({ activity: true });
  } finally {
    startProductWith(null);
  }
  const b = base as Twin | null;
  assert.ok(b, 'the world runs on W6-main');
  assert.deepEqual(await b.sql("SELECT name FROM sqlite_master WHERE name IN ('quiz', 'quiz_attempt')"), [], "W6-main's schema has no quiz table");
  try {
    await withW5a(w);
    await seed(b.url, { spaceId: w.school.id, grantedBy: ADMIN.username, memberships: [{ username: ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(30) }] });
    await b.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w7-amal-learner', '${w.school.id}', '${w.school.math}', '${(await b.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}')`);
    // Wave 5's AT-2 announcements (posted on the real clock), then W6-c's pinned clock and W6-a's due dates and Nour Test.
    await withAt2(w);
    await pinned(b.url);
    await withW6a(w);
    for (const p of [SALMA, OMAR, ADMIN, HADEER, RANA5]) w.ids[p.username] ??= String((await b.sql(`SELECT id FROM user WHERE username = '${p.username}'`))[0].id);
  } catch (err) {
    await clockAt(w, null).catch(() => null);
    await w.close();
    throw err;
  }
  // Everyone signs in after the pin (a session from before it is idle by D).
  const people: { who: string; c: Client }[] = [
    { who: 'Salma', c: await signedIn(b.url, SALMA.username, SALMA.password) },
    { who: 'Omar C', c: await signedIn(b.url, OMAR.username, OMAR.password) },
    { who: 'Karim Test', c: await signedIn(b.url, KARIM5.username, KARIM5.password) },
    { who: 'Rana Test', c: await signedIn(b.url, RANA5.username, RANA5.password) },
    { who: 'Nour Test', c: await signedIn(b.url, NOUR6.username, NOUR6.password) },
    { who: 'Youssef', c: await signedIn(b.url, YOUSSEF.username, YOUSSEF.password) },
    { who: 'Amal', c: await signedIn(b.url, ADMIN.username, ADMIN.password) },
    { who: 'Hadeer', c: await signedIn(b.url, HADEER.username, HADEER.password) },
    { who: 'Mona', c: await signedIn(b.url, MONA.username, MONA.password) },
    { who: 'owner', c: w.owner },
  ];
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w7-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec(readFileSync(join(repo, 'migrations', MIGRATION), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b.worker.files });
  await pinned(cand.url);
  const [{ n }] = (await cand.sql('SELECT (SELECT COUNT(*) FROM quiz) + (SELECT COUNT(*) FROM quiz_attempt) AS n')) as { n: number }[];
  if (Number(n) !== 0) {
    await cand.stop();
    await w.close();
    assert.fail(`no quiz on the candidate (found ${n})`);
  }
  return {
    w, base: b, cand,
    people: people.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    async close() {
      await cand.stop();
      await clockAt(w, null).catch(() => null);
      await w.close();
      rmSync(file, { force: true });
    },
  };
}

// ----------------------------------------------------------- comparing ----

/** The teacher pages (AT-5.1a): a subject's editor and a subject's admin page, where the quiz card belongs (section 4.2). */
const TEACHER_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const isTeacherPage = (path: string) => TEACHER_PAGES.some((re) => re.test(path));

/** The appended block: from the mark to the end of the candidate's style; every selector scoped; at most 4 KB (contract AT-5). */
export function styleCheck(baseStyle: string, candStyle: string): string | null {
  if (!candStyle.startsWith(baseStyle)) return 'the candidate\'s style does not start with W6-main\'s';
  const block = candStyle.slice(baseStyle.length);
  if (!block.startsWith(MARK)) return `the added style does not start with ${MARK}: ${JSON.stringify(block.slice(0, 80))}`;
  return wave7BlockProblem(block);
}

const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;
const CARD = QUIZ_CARD;

function normalised(body: string, url: string): string {
  return body.split(url).join('[product]').replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]');
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nmain:      ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

interface Result { what: string; who: string; path: string; status: number; teacher: boolean; card: boolean; ann: boolean; todo: boolean; problem: string | null; reads: { base: number; cand: number } }

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

const READ = /^\s*(SELECT|WITH)\b/i;

function spyOn(t: Twin): () => string[] {
  const log: string[] = [];
  t.worker.setHooks({ seen: (sql) => void log.push(sql) });
  return () => {
    t.worker.setHooks({});
    return log;
  };
}

/** Wave 6's to-do block and due lines of a page, as one text (compared byte for byte). */
const waveSix = (body: string) => [...body.matchAll(/<section id="todo"[\s\S]*?<\/section>|<span class="due-line"[^>]*>[\s\S]*?<\/span>/g)].map((m) => m[0]).join('\n');

/** One address on both products, each under the statement spy. */
async function same(p: Pair, who: Who, method: 'GET' | 'POST', path: string, out: Result[], fields: Record<string, string> = {}): Promise<{ res: Response; body: string }> {
  const stopBase = spyOn(p.base);
  const rb = method === 'GET' ? await who.base.get(path) : await who.base.post(path, fields);
  const bodyB = await bodyOf(rb);
  await p.base.worker.settle();
  const sb0 = stopBase().filter((x) => READ.test(x)).length;
  const stopCand = spyOn(p.cand);
  const rc = method === 'GET' ? await who.cand.get(path) : await who.cand.post(path, fields);
  const bodyC = await bodyOf(rc);
  await p.cand.worker.settle();
  const sc0 = stopCand().filter((x) => READ.test(x)).length;
  const what = `${who.who} ${method} ${path}`;
  const problems: string[] = [];
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on W6-main, ${rc.status} on the candidate`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  if (loc(rc, p.cand.url) !== loc(rb, p.base.url)) problems.push('another Location');
  for (const h of ['content-type', 'cache-control']) if (rc.headers.get(h) !== rb.headers.get(h)) problems.push(`another ${h}`);
  let bb = normalised(bodyB, p.base.url);
  let cb = normalised(bodyC, p.cand.url);
  const sb = HEAD_STYLE.exec(bb);
  const sc = HEAD_STYLE.exec(cb);
  if (sb && sc) {
    const bad = styleCheck(sb[2], sc[2]);
    if (bad) problems.push(`style: ${bad}`);
    bb = bb.replace(HEAD_STYLE, '$1[style]$3');
    cb = cb.replace(HEAD_STYLE, '$1[style]$3');
  } else if (Boolean(sb) !== Boolean(sc)) {
    problems.push('a <style> on one side only');
  }
  const cut = cb.replace(CARD, '');
  const card = cut !== cb;
  const teacher = isTeacherPage(path);
  if (card && !teacher) problems.push('a quiz card on a page that is not a teacher page');
  if (cut !== bb) problems.push(`another body ${firstDifference(bb, cut)}`);
  const annB = annBlock(bb);
  if (annB !== annBlock(cut)) problems.push('another announcement block');
  const six = waveSix(bb);
  if (six !== waveSix(cut)) problems.push('another to-do block or due line');
  out.push({ what, who: who.who, path, status: rc.status, teacher, card, ann: Boolean(annB), todo: six.length > 0, problem: problems.length ? problems.join('; ') : null, reads: { base: sb0, cand: sc0 } });
  return { res: rb, body: bb };
}

const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);

async function crawlBoth(p: Pair, who: Who, out: Result[], limit = 700): Promise<string[]> {
  const seen = new Set<string>();
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const { res, body } = await same(p, who, 'GET', path, out);
    if (res.status >= 300 && res.status < 400) {
      const to = (res.headers.get('location') ?? '').replace(p.base.url, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!(res.headers.get('content-type') ?? '').startsWith('text/html')) continue;
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `${who.who}: the crawl ends before ${limit} pages`);
  return [...seen];
}

/** The whole list in both languages: each person's pages, then Salma's mark POSTs (only some people with `only`). */
async function compareAll(p: Pair, only?: string[]): Promise<Result[]> {
  const out: Result[] = [];
  for (const lang of ['ar', 'en'] as const) {
    for (const who of p.people.filter((x) => !only || only.includes(x.who))) {
      await same(p, who, 'POST', '/account/language', out, { lang });
      const pages = await crawlBoth(p, who, out);
      assert.ok(pages.length >= 3, `${who.who} (${lang}): pages reached`);
      if (who.who === 'Salma') assert.ok(pages.some((x) => x.includes('/file/')) && pages.some((x) => x.includes('/read/')), 'Salma\'s lessons and files are in the list');
      if (who.who === 'Amal' || who.who === 'Hadeer') assert.ok(pages.some((x) => x.includes('/preview')), `${who.who}'s previews are in the list`);
      const s = p.w.school;
      const fixed: Record<string, string[]> = {
        Amal: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/learn/${s.arabic}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/admin/topics/${s.math}`],
        Hadeer: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/publish/edit/${s.math}`],
      };
      for (const path of (fixed[who.who] ?? []).filter((x) => !pages.includes(x))) await same(p, who, 'GET', path, out);
    }
    if (only) continue;
    const salma = p.people.find((x) => x.who === 'Salma')!;
    for (const title of ['Adding fractions', 'Reading decimals']) {
      for (const state of ['done', 'not-done']) {
        const posted = await same(p, salma, 'POST', `/s/${p.w.school.id}/read/${p.w.school.lessons[title]}/done`, out, { state });
        assert.equal(posted.res.status, 303, `${title} ${state}`);
        await same(p, salma, 'GET', (posted.res.headers.get('location') ?? '').replace(p.base.url, '').split('#')[0], out);
      }
    }
  }
  return out;
}

const report = (rs: Result[]) => rs.filter((r) => r.problem).slice(0, 5).map((r) => `${r.what}: ${r.problem}`).join('\n');

describe('W7 AT-5.1 base comparison: with no quizzes every page is W6-main 6ce8366\'s, the teacher pages but for the quiz card', { concurrency: false }, () => {
  let p: Pair;
  let first: Promise<Result[]> | null = null;
  const noneYet = () => (first ??= compareAll(p));
  before(async () => {
    p = await pair();
  });
  after(() => p?.close());

  it('W7 AT-5.1a (teacher pages) every subject\'s editor and subject admin page differs from W6-main only by the quiz card', async (t) => {
    const results = await noneYet();
    const teacher = results.filter((r) => r.teacher);
    const s = p.w.school;
    t.diagnostic(`AT-5.1a ${teacher.length} teacher-page requests compared (W6-main ${BASE_SHA.slice(0, 7)}, live form); card cut on ${new Set(teacher.filter((r) => r.card).map((r) => r.path)).size} pages`);
    assert.equal(report(teacher), '', 'every teacher page answers as W6-main does, but the quiz card');
    for (const path of [`/s/${s.id}/publish/edit/${s.math}`, `/s/${s.id}/admin/topics/${s.math}`, `/s/${s.id}/admin/topics/${s.arabic}`]) {
      assert.ok(teacher.some((r) => r.path === path && r.card), `the card was seen (and cut) on ${path}`);
    }
    assert.ok(teacher.filter((r) => r.status === 200 && r.what.includes(' GET ')).every((r) => r.card), 'every 200 editor and subject admin page has the card');
  });

  it('W7 AT-5.1b (every other page) same status and body as W6-main; no quiz card; wave 5\'s announcement blocks and wave 6\'s to-do block and due lines byte-identical', async (t) => {
    const results = await noneYet();
    const other = results.filter((r) => !r.teacher);
    const per: Record<string, number> = {};
    for (const r of other) per[r.who] = (per[r.who] ?? 0) + 1;
    t.diagnostic(`AT-5.1b ${other.length} other requests compared (W6-main ${BASE_SHA.slice(0, 7)}, live form), per person ${JSON.stringify(per)}; announcement blocks on ${other.filter((r) => r.ann).length}, to-do blocks or due lines on ${other.filter((r) => r.todo).length}`);
    assert.ok(other.length >= 200, `a full crawl (${other.length})`);
    for (const who of ['Salma', 'Omar C', 'Karim Test', 'Rana Test', 'Nour Test', 'Amal', 'Hadeer', 'Mona', 'owner']) assert.ok((per[who] ?? 0) > 0, `${who} is in the crawl`);
    assert.equal(report(other), '', 'every other page answers exactly as W6-main does');
    assert.ok(other.every((r) => !r.card), 'no quiz card on any other page');
    assert.ok(other.some((r) => r.ann && r.who === 'Salma'), 'wave 5\'s announcement blocks were present and compared');
    assert.ok(other.some((r) => r.todo && r.who === 'Salma'), 'wave 6\'s to-do block and due lines were present and compared');
  });

  it('W7 AT-5.2 reads, teacher side: the editor and the subject admin page make W6-main\'s count; the CSS block size printed', async (t) => {
    const results = await noneYet();
    const teacher = results.filter((r) => r.teacher && r.status === 200 && r.what.includes(' GET '));
    const off = teacher.filter((r) => r.reads.cand !== r.reads.base);
    const s = p.w.school;
    const pick = (who: string, path: string) => teacher.find((r) => r.who === who && r.path === path)?.reads;
    const style = HEAD_STYLE.exec(await (await p.people.find((x) => x.who === 'Hadeer')!.cand.get(`/s/${s.id}/publish/edit/${s.math}`)).text())![2];
    const block = style.slice(style.indexOf(MARK));
    t.diagnostic(`AT-5.2 editor (Hadeer, Mathematics) reads W6-main/candidate: ${JSON.stringify(pick('Hadeer', `/s/${s.id}/publish/edit/${s.math}`))}; subject admin page (Amal, Mathematics): ${JSON.stringify(pick('Amal', `/s/${s.id}/admin/topics/${s.math}`))}; ${teacher.length} teacher pages compared; CSS block ${Buffer.byteLength(block)} bytes (at most ${CSS_MAX})`);
    assert.equal(off.slice(0, 5).map((r) => `${r.what}: W6-main ${r.reads.base}, candidate ${r.reads.cand}`).join('\n'), '', 'every editor and subject admin page makes W6-main\'s count');
    assert.ok(Buffer.byteLength(block) <= CSS_MAX, 'the CSS block is at most 4 KB');
  });

  it('W7 AT-4.3 (guardian and owner) with W7-a and W7-b on the candidate, every page of Mona and the owner is byte-identical to W6-main\'s on the same world, Arabic and English', async (t) => {
    // W7-a and W7-b on the candidate only (W6-main has no quiz tables).
    const cw = { ...p.w, p: { ...p.w.p, url: p.cand.url, sql: p.cand.sql } } as Wave1World;
    await withW7a(cw);
    await withW7b(cw);
    const results = await compareAll(p, ['Mona', 'owner']);
    const per: Record<string, number> = {};
    for (const r of results) per[r.who] = (per[r.who] ?? 0) + 1;
    t.diagnostic(`AT-4.3 with W7-a and W7-b: ${results.length} guardian and owner requests byte-identical to W6-main ${BASE_SHA.slice(0, 7)} (${JSON.stringify(per)})`);
    assert.ok((per.Mona ?? 0) > 5 && (per.owner ?? 0) > 5, 'both crawls reached their pages');
    assert.equal(report(results), '', 'every guardian and owner page answers exactly as W6-main does');
  });
});

// ------------------------------------------------- AT-5.2 at W7-e ----

/** One request under the statement spy, from the gate's statement on: statements, reads, writes, each with its parameters. */
async function measured(w: Wave1World, c: Client, method: 'GET' | 'POST', path: string, gate: RegExp, fields: Record<string, string> = {}) {
  const log: { sql: string; params: unknown[] }[] = [];
  const worker = (w.p as Twin).worker;
  worker.setHooks({ seen: (sql, params) => void log.push({ sql, params }) });
  const res = method === 'GET' ? await c.get(path) : await c.post(path, fields);
  const body = await res.text();
  await worker.settle();
  worker.setHooks({});
  const at = log.findIndex((x) => gate.test(x.sql));
  assert.ok(at >= 0, `${path}: the gate's statement was seen`);
  const own = log.slice(at);
  return { status: res.status, body, bytes: Buffer.byteLength(body), total: log.length, own, reads: own.filter((x) => READ.test(x.sql)), writes: own.filter((x) => !READ.test(x.sql)), maxParams: Math.max(...log.map((x) => x.params.length)) };
}

const PUBLISHER_GATE = /FROM subject s WHERE s\.id = \? AND s\.space_id = \? AND s\.publisher_user_id = \?/;
const ADMIN_GATE = /FROM subject s LEFT JOIN user u ON u\.id = s\.publisher_user_id\s+WHERE s\.id = \? AND s\.space_id = \?/;

describe('W7 AT-5.2 reads at W7-e: the quiz list, the editor of QL, QL\'s results and every quiz write', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7d(w);
    await withW7e(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-5.2 at W7-e: list at most 10 statements and 40 quiz rows; QL editor at most 10 and 250 KB; QL results at most 10, 50 names, 1 summary row, 5,000 rows read, 80 KB; each write one gate read, one quiz read, one write', async (t) => {
    assert.ok((w.p as Twin).worker, 'the in-process product (statement spy)');
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const amal = await as(w, ADMIN, 'en');
    const list = publisherQuizzes(s, s.math);
    const sqlite = (w.p as Twin).worker.sqlite;
    const rowsOf = (st: { sql: string; params: unknown[] }) => sqlite.prepare(st.sql).all(...(st.params as (string | number | null)[])).length;
    const figures: string[] = [];
    for (const [who, c, l, gate] of [['Hadeer', hadeer, list, PUBLISHER_GATE], ['Amal', amal, list.replace('/publish/edit/', '/admin/topics/'), ADMIN_GATE]] as const) {
      const m = await measured(w, c, 'GET', l, gate);
      assert.equal(m.status, 200);
      const quizStatement = m.reads.find((x) => /FROM quiz\b/.test(x.sql))!;
      const rows = rowsOf(quizStatement);
      figures.push(`${who} list: ${m.own.length} statements from the gate on, quiz statement ${rows} rows, ${(m.bytes / 1024).toFixed(1)} KB`);
      assert.ok(m.own.length <= 10, `${who}: the list at most 10 statements (${m.own.length})`);
      assert.ok(rows <= 40, `${who}: its quiz statement returns at most 40 rows (${rows})`);
      assert.equal(rows, 40, 'W7-e: 30 shown and 10 removed');
    }
    const editor = await measured(w, hadeer, 'GET', `${list}/${QL}`, PUBLISHER_GATE);
    figures.push(`QL editor: ${editor.own.length} statements, ${(editor.bytes / 1024).toFixed(1)} KB`);
    assert.equal(editor.status, 200);
    assert.ok(editor.own.length <= 10, `the editor of QL at most 10 statements (${editor.own.length})`);
    assert.ok(editor.bytes <= 250 * 1024, `the editor of QL at most 250 KB (${editor.bytes})`);
    const results = await measured(w, hadeer, 'GET', resultsOf(list, QL), PUBLISHER_GATE);
    assert.equal(results.status, 200);
    const names = results.reads.find((x) => /^\s*WITH r AS/.test(x.sql))!;
    const summary = results.reads.find((x) => /TOTAL\(substr\(a\.right_flags/.test(x.sql))!;
    const nameRows = rowsOf(names);
    const summaryRows = rowsOf(summary);
    let rowsRead = 0;
    for (const st of results.reads) rowsRead += Number((await onLocalD1(sqlite, st)).meta.rows_read);
    const nameMeta = (await onLocalD1(sqlite, names)).meta;
    assert.ok(typeof nameMeta.rows_read === 'number', `local D1 reports rows_read (meta: ${JSON.stringify(nameMeta)})`);
    figures.push(`QL results: ${results.own.length} statements, names ${nameRows} rows, summary ${summaryRows} row, rows read ${rowsRead} (local D1), largest bound-parameter count ${results.maxParams}, ${(results.bytes / 1024).toFixed(1)} KB`);
    assert.ok(results.own.length <= 10, `QL's results at most 10 statements (${results.own.length})`);
    assert.ok(nameRows <= 50, `the name list returns at most 50 rows (${nameRows})`);
    assert.equal(summaryRows, 1, 'the per-question summary returns 1 row');
    assert.ok(rowsRead <= 5000, `total rows_read at most 5,000 (${rowsRead})`);
    assert.ok(results.bytes <= 80 * 1024, `the results page at most 80 KB (${results.bytes})`);
    // Every quiz write, copy included, from either address: at most one gate read, one quiz read and one write statement.
    const writes: [string, Client, string, Record<string, string>, RegExp][] = [];
    const qb = `${list}/${W7A.QB}`;
    // Room for the writes: QB back (one of the 10 removed) after one of the 29 others is removed through the page.
    writes.push(['remove', hadeer, `${list}/w7e-qa/remove`, { rev: '0' }, PUBLISHER_GATE]);
    writes.push(['restore', hadeer, `${qb}/restore`, { rev: '0' }, PUBLISHER_GATE]);
    writes.push(['title', amal, `${qb.replace('/publish/edit/', '/admin/topics/')}/title`, { title: 'Decimals again', rev: '0' }, ADMIN_GATE]);
    writes.push(['add', hadeer, `${qb}/question`, questionForm('Added', ['a', 'b'], 1, 0), PUBLISHER_GATE]);
    writes.push(['save', amal, `${qb.replace('/publish/edit/', '/admin/topics/')}/question/qb-one`, questionForm('Saved', ['a', 'b'], 2, 1), ADMIN_GATE]);
    writes.push(['remove question', hadeer, `${qb}/question/qb-two/remove`, { rev: '2' }, PUBLISHER_GATE]);
    writes.push(['open', hadeer, `${qb}/open`, { rev: '3' }, PUBLISHER_GATE]);
    writes.push(['close', amal, `${qb.replace('/publish/edit/', '/admin/topics/')}/close`, { rev: '3' }, ADMIN_GATE]);
    writes.push(['reopen', hadeer, `${qb}/reopen`, { rev: '3' }, PUBLISHER_GATE]);
    writes.push(['remove', hadeer, `${qb}/remove`, { rev: '3' }, PUBLISHER_GATE]);
    writes.push(['restore', hadeer, `${qb}/restore`, { rev: '3' }, PUBLISHER_GATE]);
    writes.push(['remove', hadeer, `${list}/w7e-qb/remove`, { rev: '0' }, PUBLISHER_GATE]);
    writes.push(['copy', hadeer, `${list}/${QL}/copy`, { rev: '0' }, PUBLISHER_GATE]);
    writes.push(['remove', hadeer, `${list}/w7e-qc/remove`, { rev: '0' }, PUBLISHER_GATE]);
    writes.push(['create', amal, list.replace('/publish/edit/', '/admin/topics/'), { title: 'New at W7-e' }, ADMIN_GATE]);
    for (const [what, c, path, fields, gate] of writes) {
      const m = await measured(w, c, 'POST', path, gate, fields);
      assert.equal(m.status, 303, `${what} ${path}: 303 (${m.status})`);
      const reads = m.reads.length;
      figures.push(`${what}: ${reads} reads, ${m.writes.length} write`);
      assert.ok(reads <= 2 && m.writes.length === 1, `${what}: at most one gate read and one quiz read (${reads}) and one write statement (${m.writes.length})`);
    }
    t.diagnostic(`AT-5.2 W7-e figures: ${figures.join('; ')}`);
    void AT;
    void SALMA;
  });
});
