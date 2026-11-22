// LMS wave 5 (product-contract v2 on PIL-246, AT-4.1a and AT-4.1b): with no
// announcements, every page is today's. The base comparison, live form, as
// wave 4's (test/wave4/base.test.ts): main b87bfc5 (pinned; CI checks it out
// into LMS_BASE_ROOT, default .base-main/) and this candidate run side by side
// in this process, each on its own copy of one database:
// 1. the world (wave 4's, lesson activity on) is built by main's code on a
//    database with main's migrations, and every person signs in there;
// 2. that database is copied (VACUUM INTO), the copy gains the new migration
//    (no announcement), and the candidate runs on it with the same stored
//    files: same rows, same ids, same sessions;
// 3. every page reachable from the home of Salma, Omar C, Youssef, Amal,
//    Hadeer, Mona and the owner (their previews and Salma's files included), in
//    Arabic and in English, is fetched from both one address at a time, and
//    Salma's mark POSTs are sent to both; each pair must answer the same.
// Style handling (contract AT-4): all new CSS is one block appended at the end
// of the inlined `CSS`, starting with `/* wave 5 announcements */`, every
// selector starting with `#announcements` or `.ann-`. Each candidate page's
// <style> in <head> must equal main's followed by exactly that block; then
// both are replaced by one token. Normalising (the closed list, wave 4's): each
// product's own address; the owner's "usage today" block. On the candidate,
// the announcement card (`#announcements`) may only be on a teacher page (a
// subject editor or a subject admin page); it is cut there (AT-4.1a) and fails
// anywhere else (AT-4.1b). Made-up data only.
//
// W5-1b adds: Karim Test (W5-a) in the crawl, and Amal also a learner of
// Mathematics (a person who is both); AT-4.2 (after one announcement is
// posted on the candidate and removed, the comparison passes again); and AT-3.5
// (reads): every request of the crawls is also counted under the statement
// spy on both products (SELECT statements, and the bound parameters of every
// statement), with no announcements and with AT-2's announcements stored on the
// candidate, plus the W5-d load world (150 subjects, 300 announcements).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '../support/http.ts';
import { seed, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { inProcess, startProductWith, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { QUIZ_CARD, cutWave7Style } from '../wave7/world.ts';
import {
  ADMIN, AT2_ARABIC, AT2_MATH, HADEER, KARIM5, LOAD_ADMIN, LOAD_LEARNER, MONA, OMAR, SALMA, YOUSSEF, adminAnn, annBlock, post, publisherAnn, wave4World, withLoadAnnouncements,
  withW5a, withW5d, type Load, type Wave1World,
} from './world.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: main b87bfc5 (wave 4 and housekeeping Q1 merged), the contract's "main". */
export const BASE_SHA = 'b87bfc55f255a332f0593e45bf08c2fa5f96697d';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-main');
const MIGRATION = '0014_announcements.sql';
const MARK = '/* wave 5 announcements */';
// LMS wave 6 (contract on PIL-257, section 11 item 3): wave 6 appends its own block after this one; its selectors are its own.
const W6_MARK = '/* wave 6 due dates */';
const W6_SCOPE = /^(#todo|#due-dates|\.due-|\.todo-)/;

type Twin = Product & { worker: InProcessWorker };
interface Who { who: string; base: Client; cand: Client }
interface Pair { w: Wave1World; base: Twin; cand: Twin; people: Who[]; load: Load; loadPeople: Who[]; close(): Promise<void> }

function twin(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

async function pair(): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0013_chapters_in_order.sql')) && !existsSync(join(BASE_ROOT, 'migrations', MIGRATION)), 'the base is main after wave 4 and before wave 5');
  let base: Twin | null = null;
  startProductWith(async () => (base = await inProcess({ root: BASE_ROOT })));
  let w: Wave1World;
  try {
    w = await wave4World({ activity: true });
  } finally {
    startProductWith(null);
  }
  const b = base as Twin | null;
  assert.ok(b, 'the world runs on main');
  assert.deepEqual(await b.sql("SELECT name FROM sqlite_master WHERE name = 'announcement'"), [], "main's schema has no announcement table");
  // W5-a (Karim Test, Rana Test), W5-d (the load space, its announcements later on the candidate only), and Amal also a learner of Mathematics, all through main's code.
  let load: Load;
  try {
    await withW5a(w);
    load = await withW5d(w, { announcements: false });
    await seed(b.url, { spaceId: w.school.id, grantedBy: ADMIN.username, memberships: [{ username: ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(30) }] });
    await b.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w5-amal-learner', '${w.school.id}', '${w.school.math}', '${w.ids[ADMIN.username] ?? (await b.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}')`);
    // The load admin is also a learner of the load space (no subject assigned), as Amal is of Mesk School, so "admin /learn" is the same kind of reading in both worlds.
    await seed(b.url, { spaceId: load.id, grantedBy: LOAD_ADMIN.username, memberships: [{ username: LOAD_ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(30) }] });
  } catch (err) {
    await w.close();
    throw err;
  }
  const people: { who: string; c: Client }[] = [
    { who: 'Salma', c: await signedIn(b.url, SALMA.username, SALMA.password) },
    { who: 'Omar C', c: await signedIn(b.url, OMAR.username, OMAR.password) },
    { who: 'Karim Test', c: await signedIn(b.url, KARIM5.username, KARIM5.password) },
    { who: 'Youssef', c: await signedIn(b.url, YOUSSEF.username, YOUSSEF.password) },
    { who: 'Amal', c: w.admin },
    { who: 'Hadeer', c: await signedIn(b.url, HADEER.username, HADEER.password) },
    { who: 'Mona', c: await signedIn(b.url, MONA.username, MONA.password) },
    { who: 'owner', c: w.owner },
  ];
  const loadPeople: { who: string; c: Client }[] = [
    { who: 'Load learner', c: await signedIn(b.url, LOAD_LEARNER.username, LOAD_LEARNER.password) },
    { who: 'Load admin', c: await signedIn(b.url, LOAD_ADMIN.username, LOAD_ADMIN.password) },
  ];
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w5-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec(readFileSync(join(repo, 'migrations', MIGRATION), 'utf8'));
  // LMS wave 6 (contract on PIL-257, section 11 item 3): the candidate reads due dates, so its copy gains that migration too (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0015_due_dates.sql'), 'utf8'));
  // LMS wave 7 (W7-2, contract v2 on PIL-261, section 11 item 3): the candidate's subject pages read quizzes, so the copy gains that migration too (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0016_quizzes.sql'), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b.worker.files });
  const [{ n }] = (await cand.sql('SELECT COUNT(*) AS n FROM announcement')) as { n: number }[];
  if (Number(n) !== 0) {
    // A failing set-up must stop both products, or `node --test` never exits.
    await cand.stop();
    await w.close();
    assert.fail(`no announcement on the candidate (found ${n})`);
  }
  return {
    w, base: b, cand, load,
    people: people.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    loadPeople: loadPeople.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    async close() {
      await cand.stop();
      await w.close();
      rmSync(file, { force: true });
    },
  };
}

// ----------------------------------------------------------- comparing ----

/** The teacher pages (AT-4.1a): a subject's editor and a subject's admin page, where the card belongs (section 4.1). */
const TEACHER_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const isTeacherPage = (path: string) => TEACHER_PAGES.some((re) => re.test(path));

/** The appended block: from the mark to the end of the candidate's style; every selector scoped (contract AT-4). */
export function styleCheck(baseStyle: string, candStyle: string): string | null {
  if (!candStyle.startsWith(baseStyle)) return 'the candidate\'s style does not start with main\'s';
  const added = candStyle.slice(baseStyle.length);
  if (!added.startsWith(MARK)) return `the added style does not start with ${MARK}: ${JSON.stringify(added.slice(0, 80))}`;
  const at6 = added.indexOf(W6_MARK);
  const parts: [string, RegExp][] = [[added.slice(MARK.length, at6 < 0 ? undefined : at6), /^(#announcements|\.ann-)/]];
  if (at6 >= 0) parts.push([added.slice(at6 + W6_MARK.length), W6_SCOPE]);
  for (const [block, scope] of parts) {
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);
    for (const rule of rules) {
      const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
      for (const s of selectors) if (!scope.test(s)) return `a selector outside the rule: ${s}`;
    }
  }
  return null;
}

const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;

function normalised(body: string, url: string): string {
  return body.split(url).join('[product]').replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]');
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nmain:      ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

interface Reads { base: number; cand: number; maxParams: number }
interface Result { what: string; who: string; path: string; status: number; teacher: boolean; card: boolean; problem: string | null; reads: Reads }

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

const READ = /^\s*(SELECT|WITH)\b/i;

/** Logs every statement a product runs (the wave 3a statement spy, with its bound parameters) until the returned stop(). */
function spyOn(t: Twin): () => { reads: number; maxParams: number } {
  const log: { sql: string; n: number }[] = [];
  t.worker.setHooks({ seen: (sql, params) => void log.push({ sql, n: params.length }) });
  return () => {
    t.worker.setHooks({});
    return { reads: log.filter((x) => READ.test(x.sql)).length, maxParams: Math.max(0, ...log.map((x) => x.n)) };
  };
}

/** One address on both products, each under the statement spy: status, Location, content type, cache rule, the style rule and the (normalised) body. */
async function same(p: Pair, who: Who, method: 'GET' | 'POST', path: string, out: Result[], fields: Record<string, string> = {}): Promise<{ res: Response; body: string }> {
  const stopBase = spyOn(p.base);
  const rb = method === 'GET' ? await who.base.get(path) : await who.base.post(path, fields);
  const bodyB = await bodyOf(rb);
  await p.base.worker.settle();
  const sb0 = stopBase();
  const stopCand = spyOn(p.cand);
  const rc = method === 'GET' ? await who.cand.get(path) : await who.cand.post(path, fields);
  const bodyC = await bodyOf(rc);
  await p.cand.worker.settle();
  const sc0 = stopCand();
  const what = `${who.who} ${method} ${path}`;
  const problems: string[] = [];
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on main, ${rc.status} on the candidate`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  if (loc(rc, p.cand.url) !== loc(rb, p.base.url)) problems.push('another Location');
  for (const h of ['content-type', 'cache-control']) if (rc.headers.get(h) !== rb.headers.get(h)) problems.push(`another ${h}`);
  let bb = normalised(bodyB, p.base.url);
  let cb = normalised(bodyC, p.cand.url);
  const sb = HEAD_STYLE.exec(bb);
  const sc = HEAD_STYLE.exec(cb);
  if (sb && sc) {
    // LMS wave 7 (W7 contract on PIL-261, section 11 item 3): wave 7's block follows wave 6's; it is checked and cut off first.
    const w7 = cutWave7Style(sc[2]);
    if (w7.problem) problems.push(`style: ${w7.problem}`);
    const bad = styleCheck(sb[2], w7.rest);
    if (bad) problems.push(`style: ${bad}`);
    bb = bb.replace(HEAD_STYLE, '$1[style]$3');
    cb = cb.replace(HEAD_STYLE, '$1[style]$3');
  } else if (Boolean(sb) !== Boolean(sc)) {
    problems.push('a <style> on one side only');
  }
  // LMS wave 6 (contract on PIL-257, section 11 item 3): the due card (#due-dates) is cut with the announcement card; only on a teacher page.
  // LMS wave 7 (W7 contract on PIL-261, section 11 item 3): the quiz card (#quizzes) too.
  const cut = cb.replace(/<section id="announcements"[\s\S]*?<\/section>/g, '').replace(/<section id="due-dates"[\s\S]*?<\/section>/g, '').replace(QUIZ_CARD, '');
  const card = cut !== cb;
  const teacher = isTeacherPage(path);
  if (card && !teacher) problems.push('an announcement block on a page that is not a teacher page');
  if (cut !== bb) problems.push(`another body ${firstDifference(bb, cut)}`);
  out.push({ what, who: who.who, path, status: rc.status, teacher, card, problem: problems.length ? problems.join('; ') : null, reads: { base: sb0.reads, cand: sc0.reads, maxParams: sc0.maxParams } });
  return { res: rb, body: bb };
}

const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);

async function crawlBoth(p: Pair, who: Who, out: Result[], limit = 600): Promise<string[]> {
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
      // The load space (W5-d) is measured by its own list (AT-3.5), not crawled.
      if (!seen.has(next) && keep(next) && !next.startsWith(`/s/${p.load.id}/`) && next !== `/s/${p.load.id}`) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `${who.who}: the crawl ends before ${limit} pages`);
  return [...seen];
}

/** The whole list in both languages: each person's pages, then Salma's mark POSTs. */
async function compareAll(p: Pair): Promise<Result[]> {
  const out: Result[] = [];
  for (const lang of ['ar', 'en'] as const) {
    for (const who of p.people) {
      await same(p, who, 'POST', '/account/language', out, { lang });
      const pages = await crawlBoth(p, who, out);
      assert.ok(pages.length >= 3, `${who.who} (${lang}): pages reached`);
      if (who.who === 'Salma') assert.ok(pages.some((x) => x.includes('/file/')) && pages.some((x) => x.includes('/read/')), 'Salma\'s lessons and files are in the list');
      if (who.who === 'Amal' || who.who === 'Hadeer') assert.ok(pages.some((x) => x.includes('/preview')), `${who.who}'s previews are in the list`);
      // The pages AT-3.5 measures by name, whether or not a link leads to them: the admin's and the publisher's own /learn pages and the previews.
      const s = p.w.school;
      const fixed: Record<string, string[]> = {
        Amal: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/learn/${s.arabic}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`],
        Hadeer: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`],
      };
      for (const path of (fixed[who.who] ?? []).filter((x) => !pages.includes(x))) await same(p, who, 'GET', path, out);
    }
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

/** W5-d (AT-3.5): the load space's pages, one list, on both products. */
async function compareLoad(p: Pair): Promise<Result[]> {
  const out: Result[] = [];
  const [learner, admin] = p.loadPeople;
  const id = p.load.id;
  const first = p.load.subjects[0];
  const lesson = String((await p.cand.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${first}'`))[0].id);
  for (const [who, path] of [
    [learner, `/s/${id}`], [learner, `/s/${id}/learn/${first}`], [learner, `/s/${id}/read/${lesson}`],
    [admin, `/s/${id}`], [admin, `/s/${id}/admin/topics/${first}`], [admin, `/s/${id}/learn/${first}`], [admin, `/s/${id}/preview`],
    [admin, `/s/${id}/preview?from=home`], [admin, `/s/${id}/preview/learn/${first}?from=home`],
  ] as const) {
    await same(p, who, 'GET', path, out);
  }
  return out;
}

const report = (rs: Result[]) => rs.filter((r) => r.problem).slice(0, 5).map((r) => `${r.what}: ${r.problem}`).join('\n');

/** Contract AT-3.5: one more read on a page that shows an announcement block or the card, main's count on every other. */
function extraReads(r: Result, spaces: string[]): number {
  if (r.status !== 200 || !r.what.includes(' GET ')) return 0;
  const path = r.path.split('?')[0];
  const space = spaces.find((s) => path === `/s/${s}` || path.startsWith(`/s/${s}/`));
  if (!space) return 0;
  const rest = path.slice(`/s/${space}`.length);
  // The learner home: the space home of a person whose main role there is learner (Salma, Omar C, Karim Test, Youssef; the load learner).
  // LMS wave 6 (W6-1b, product-contract v2 on PIL-257, AT-3.4b): the learner home and the preview home also read the
  // to-do list once (W5-main's count plus exactly one). Named in CANDIDATE READY (outside section 11; the Lead decides).
  if (rest === '' && ['Salma', 'Omar C', 'Karim Test', 'Youssef', 'Load learner'].includes(r.who)) return 1 + 1;
  // LMS wave 7 (W7-2, contract v2 on PIL-261, section 11 item 4): the subject's /learn page and the preview subject page
  // also read the subject's quizzes once (exactly one more statement).
  if (/^\/learn\/[^/]+$/.test(rest)) return 1 + 1; // the subject's /learn page (learner, admin, publisher)
  if (rest === '/preview') return 1 + 1; // the preview home (and wave 6's to-do read)
  if (/^\/preview\/learn\/[^/]+$/.test(rest)) return 1 + 1; // the preview subject page (and wave 7's quiz read)
  if (/^\/publish\/edit\/[^/]+$/.test(rest) || /^\/admin\/topics\/[^/]+$/.test(rest)) return 1; // the editor and the subject admin page (the card's list)
  // LMS wave 6 (W6-1c, product-contract v3 addendum on PIL-265, G9.5): a linked learner's page reads that learner's
  // to-do list once while lesson activity is on in its space (W5-main's count plus exactly one, AT-6.4).
  if (/^\/linked\/[^/]+$/.test(rest) && activityOn.has(space)) return 1;
  return 0;
}

/** The spaces with lesson activity on (read once from the candidate before the counts are checked; W6-1c G9.5). */
let activityOn = new Set<string>();

/** The requests whose counts break the rule, at most five. */
function readProblems(rs: Result[], spaces: string[]): string {
  return rs
    .filter((r) => r.reads.cand !== r.reads.base + extraReads(r, spaces))
    .slice(0, 5)
    .map((r) => `${r.what}: main ${r.reads.base}, candidate ${r.reads.cand}, expected ${r.reads.base + extraReads(r, spaces)}`)
    .join('\n');
}

describe('W5 AT-4.1 base comparison: with no announcements every page is main b87bfc5\'s, the teacher pages but for the card', { concurrency: false }, () => {
  let p: Pair;
  let first: Promise<Result[]> | null = null;
  let again: Promise<Result[]> | null = null;
  let withAnn: Promise<{ small: Result[]; load: Result[]; loadNone: Result[] }> | null = null;
  /** Crawl A: no announcements anywhere. */
  const noneYet = () => (first ??= compareAll(p));
  /** Crawl B (AT-4.2): Hadeer posts one announcement on the candidate and removes it; then everything again. */
  const afterRemoved = () => (again ??= (async () => {
    await noneYet();
    const hadeer = p.people.find((x) => x.who === 'Hadeer')!;
    const s = p.w.school;
    await post(hadeer.cand, publisherAnn(s, s.math), 'Posted and removed (AT-4.2).');
    const [{ id }] = (await p.cand.sql('SELECT id FROM announcement')) as { id: string }[];
    const res = await hadeer.cand.post(`${publisherAnn(s, s.math)}/${id}/remove`, {});
    assert.equal(res.status, 303, 'removed');
    const [{ n }] = (await p.cand.sql('SELECT COUNT(*) AS n FROM announcement WHERE removed_at IS NULL')) as { n: number }[];
    assert.equal(Number(n), 0, 'nothing shown remains');
    return compareAll(p);
  })());
  /** Crawl C (AT-3.5, with announcements): AT-2's on the candidate (main has none), and the 300 of W5-d. */
  const withAnnouncements = () => (withAnn ??= (async () => {
    const loadNone = await compareLoad(p);
    await afterRemoved();
    const s = p.w.school;
    const hadeer = p.people.find((x) => x.who === 'Hadeer')!;
    const amal = p.people.find((x) => x.who === 'Amal')!;
    for (const body of AT2_MATH.slice(0, 3)) await post(hadeer.cand, publisherAnn(s, s.math), body);
    await post(amal.cand, adminAnn(s, s.math), AT2_MATH[3]);
    await post(amal.cand, adminAnn(s, s.arabic), AT2_ARABIC);
    await withLoadAnnouncements((q) => p.cand.sql(q), p.load);
    const small = await compareAll(p);
    assert.ok(small.some((r) => r.path === `/s/${s.id}/learn/${s.math}` && r.card), 'the announcements show on the candidate (crawl C)');
    return { small, load: await compareLoad(p), loadNone };
  })());
  before(async () => {
    p = await pair();
  });
  after(() => p?.close());

  it('W5 AT-4.1a (teacher pages) Hadeer\'s editors and Amal\'s subject admin pages differ from main only by the announcement card', async (t) => {
    const results = await noneYet();
    const teacher = results.filter((r) => r.teacher);
    const s = p.w.school;
    t.diagnostic(`AT-4.1a ${teacher.length} teacher-page requests compared (main ${BASE_SHA.slice(0, 7)}); card cut on ${new Set(teacher.filter((r) => r.card).map((r) => r.path)).size} pages`);
    assert.equal(report(teacher), '', 'every teacher page answers as main does, but the card');
    for (const path of [`/s/${s.id}/publish/edit/${s.math}`, `/s/${s.id}/admin/topics/${s.math}`]) {
      assert.ok(teacher.some((r) => r.path === path && r.card), `the card was seen (and cut) on ${path}`);
    }
  });

  it('W5 AT-4.1b (every other page) same status and same body as main; no learner page shows an announcement block', async (t) => {
    const results = await noneYet();
    const other = results.filter((r) => !r.teacher);
    const per: Record<string, number> = {};
    for (const r of other) per[r.who] = (per[r.who] ?? 0) + 1;
    t.diagnostic(`AT-4.1b ${other.length} other requests compared (main ${BASE_SHA.slice(0, 7)}), per person ${JSON.stringify(per)}`);
    assert.ok(other.length >= 200, `a full crawl (${other.length})`);
    assert.ok((per['Karim Test'] ?? 0) > 0, 'Karim Test (W5-a) is in the crawl');
    assert.equal(report(other), '', 'every other page answers exactly as main does');
    assert.ok(other.every((r) => !r.card), 'no announcement block on any other page');
  });

  it('W5 AT-4.2 after one announcement is posted and removed, AT-4.1a and AT-4.1b pass again', async (t) => {
    const results = await afterRemoved();
    const teacher = results.filter((r) => r.teacher);
    const other = results.filter((r) => !r.teacher);
    t.diagnostic(`AT-4.2 ${results.length} requests compared again after a post and its removal`);
    assert.equal(report(teacher), '', 'AT-4.1a again: teacher pages differ only by the card');
    assert.equal(report(other), '', 'AT-4.1b again: every other page is main\'s');
    assert.ok(other.every((r) => !r.card), 'no announcement block on any other page');
    assert.ok(other.length >= 200, `a full crawl (${other.length})`);
  });

  it('W5 AT-3.5 reads: one more on the learner home, the /learn pages, both preview pages, the editor and the subject admin page; main\'s on every other page; the same in the load world; at most 20 bound parameters', async (t) => {
    const none = await noneYet();
    const { small, load, loadNone } = await withAnnouncements();
    const spaces = [p.w.school.id, p.w.company.id, p.w.university.id, p.load.id];
    activityOn = new Set((await p.cand.sql('SELECT space_id FROM lesson_view_setting WHERE enabled = 1')).map((r) => String(r.space_id)));
    for (const [name, rs] of [['no announcements', none], ['with announcements', small], ['load world, no announcements', loadNone], ['load world, 300 announcements', load]] as const) {
      // Pages that exist only on the candidate (the card's own edit and remove pages) have no main count to compare.
      const comparable = rs.filter((r) => !/\/announcements(\/|$)/.test(r.path));
      assert.equal(readProblems(comparable, spaces), '', `${name}: every request has main's count, plus exactly one where the contract says`);
    }
    // The same counts whatever is stored and whatever the size: per kind of page.
    const kinds = (rs: Result[]) => {
      const isLoad = rs === load || rs === loadNone;
      const s = p.w.school;
      const space = isLoad ? p.load.id : s.id;
      const subject = isLoad ? p.load.subjects[0] : s.math;
      // Amal is also a learner of Mathematics (her own marks are read there): her admin reading is measured on Arabic grammar.
      const adminSubject = isLoad ? p.load.subjects[0] : s.arabic;
      const pick = (who: string, path: string) => rs.find((r) => r.who === who && r.path === path && r.what.includes(' GET '))?.reads.cand;
      const [learner, admin] = isLoad ? ['Load learner', 'Load admin'] : ['Salma', 'Amal'];
      return {
        'learner home': pick(learner, `/s/${space}`),
        'learner /learn': pick(learner, `/s/${space}/learn/${subject}`),
        'admin /learn': pick(admin, `/s/${space}/learn/${adminSubject}`),
        'preview home': pick(admin, `/s/${space}/preview?from=home`),
        'preview /learn': pick(admin, `/s/${space}/preview/learn/${subject}?from=home`),
        'subject admin page': pick(admin, `/s/${space}/admin/topics/${subject}`),
        'admin home': pick(admin, `/s/${space}`),
      };
    };
    const table = { none: kinds(none), with: kinds(small), loadNone: kinds(loadNone), load: kinds(load) };
    const maxParams = Math.max(...[...none, ...small, ...load, ...loadNone].map((r) => r.reads.maxParams));
    const mainOf = (rs: Result[], who: string, re: RegExp) => rs.find((r) => r.who === who && re.test(r.path) && r.what.includes(' GET '))?.reads.base;
    t.diagnostic(`AT-3.5 candidate reads per page (SELECT statements): ${JSON.stringify(table)}`);
    t.diagnostic(`AT-3.5 main ${BASE_SHA.slice(0, 7)} reads: learner home ${mainOf(none, 'Salma', /^\/s\/[^/]+$/)}, learner /learn ${mainOf(none, 'Salma', /^\/s\/[^/]+\/learn\/[^/?]+$/)}, preview home ${mainOf(none, 'Amal', /^\/s\/[^/]+\/preview\?from=home$/)}, subject admin page ${mainOf(none, 'Amal', /^\/s\/[^/]+\/admin\/topics\/[^/?]+$/)}, admin home ${mainOf(none, 'Amal', /^\/s\/[^/]+$/)}`);
    t.diagnostic(`AT-3.5 the largest number of bound parameters in any statement of any request: ${maxParams}`);
    for (const k of Object.keys(table.none) as (keyof typeof table.none)[]) {
      assert.ok(table.none[k] !== undefined, `${k}: measured`);
      assert.equal(table.with[k], table.none[k], `${k}: the same with and without announcements`);
      assert.equal(table.load[k], table.loadNone[k], `${k}: the same in the load world with and without its 300 announcements`);
      assert.equal(table.load[k], table.none[k], `${k}: the same in the load world (150 subjects, 300 announcements) as in the small world`);
    }
    // A person who is both a learner and an admin (Amal): her space home is the admin home (main's count); her /learn page is one more.
    const amalHome = none.find((r) => r.who === 'Amal' && r.path === `/s/${p.w.school.id}`)!;
    assert.equal(amalHome.reads.cand, amalHome.reads.base, 'Amal (admin and learner): her admin home is main\'s count');
    const amalLearn = none.find((r) => r.who === 'Amal' && r.path === `/s/${p.w.school.id}/learn/${p.w.school.math}`)!;
    // LMS wave 7 (W7-2, section 11 item 4): plus wave 7's one quiz read.
    assert.equal(amalLearn.reads.cand, amalLearn.reads.base + 1 + 1, 'Amal (admin and learner): her /learn page is main\'s plus one (and wave 7\'s quiz read)');
    assert.ok(maxParams <= 20, `at most 20 bound parameters in any statement (${maxParams}); no IN list of subject ids`);
    // The blocks really showed in crawl C (so the counts above are with announcements on the page).
    const salmaHome = small.find((r) => r.who === 'Salma' && r.path === `/s/${p.w.school.id}`)!;
    assert.ok(salmaHome.card, 'Salma\'s home showed the block in crawl C');
    void annBlock;
  });
});
