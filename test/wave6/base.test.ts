// LMS wave 6, W6-1a (product-contract v2 on PIL-257, AT-4.1a, AT-4.1b and
// AT-3.4a): with no due dates, every page is W5-main's. The base comparison,
// live form, as wave 5's (test/wave5/base.test.ts): W5-main f0125980 (pinned;
// CI checks it out into LMS_BASE_ROOT, default .base-w6/) and this candidate
// run side by side in this process, each on its own copy of one database:
// 1. the world (wave 4's, lesson activity on; W5-a; Amal also a learner of
//    Mathematics; wave 5's AT-2 announcements) is built by W5-main's code on a
//    database with its migrations, and every person signs in there;
// 2. that database is copied (VACUUM INTO), the copy gains 0015 (no due date),
//    and the candidate runs on it with the same stored files: same rows, same
//    ids, same sessions;
// 3. every page reachable from the home of Salma, Omar C, Karim Test, Rana
//    Test, Youssef, Amal, Hadeer, Mona and the owner (their previews and
//    Salma's files included), in Arabic and in English, is fetched from both
//    one address at a time, and Salma's mark POSTs are sent to both; each pair
//    must answer the same.
// Style handling (contract AT-4): all new CSS is one block appended at the end
// of the inlined `CSS`, after wave 5's, starting with `/* wave 6 due dates */`,
// every selector starting with `#todo`, `#due-dates`, `.due-` or `.todo-`. Each
// candidate page's <style> must equal W5-main's followed by exactly that block;
// then both are replaced by one token. Normalising (wave 5's closed list): each
// product's own address; the owner's "usage today" block. On the candidate the
// due card (`#due-dates`) may only be on a subject's editor or subject admin
// page; it is cut there (AT-4.1a) and fails anywhere else (AT-4.1b).
// AT-3.4a counts every request's SELECT statements on both products (the
// editor and the subject admin page: W5-main's count), and on the candidate the
// due-dates page and the due writes, from the gate's statement on. Made-up data only.
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
import {
  ADMIN, HADEER, KARIM5, MONA, OMAR, RANA5, SALMA, YOUSSEF, adminDue, annBlock, duePost, publisherDue, wave4World, withAt2, withW5a, type Wave1World,
} from './world.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: W5-main f0125980 (wave 5 merged, main CI run 44864862736 green), the contract's "main". */
export const BASE_SHA = 'f0125980a2c8fc7bbbc7e1ca8676de5506502259';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w6');
const MIGRATION = '0015_due_dates.sql';
const MARK = '/* wave 6 due dates */';

type Twin = Product & { worker: InProcessWorker };
interface Who { who: string; base: Client; cand: Client }
interface Pair { w: Wave1World; base: Twin; cand: Twin; people: Who[]; close(): Promise<void> }

function twin(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

async function pair(): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `W5-main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0014_announcements.sql')) && !existsSync(join(BASE_ROOT, 'migrations', MIGRATION)), 'the base is main after wave 5 and before wave 6');
  let base: Twin | null = null;
  startProductWith(async () => (base = await inProcess({ root: BASE_ROOT })));
  let w: Wave1World;
  try {
    w = await wave4World({ activity: true });
  } finally {
    startProductWith(null);
  }
  const b = base as Twin | null;
  assert.ok(b, 'the world runs on W5-main');
  assert.deepEqual(await b.sql("SELECT name FROM pragma_table_info('lesson') WHERE name = 'due_on'"), [], "W5-main's schema has no due_on");
  try {
    await withW5a(w);
    await seed(b.url, { spaceId: w.school.id, grantedBy: ADMIN.username, memberships: [{ username: ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(30) }] });
    await b.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6-amal-learner', '${w.school.id}', '${w.school.math}', '${(await b.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}')`);
    // Wave 5's AT-2 announcements, present on both (contract AT-4, "Steps").
    await withAt2(w);
  } catch (err) {
    await w.close();
    throw err;
  }
  const people: { who: string; c: Client }[] = [
    { who: 'Salma', c: await signedIn(b.url, SALMA.username, SALMA.password) },
    { who: 'Omar C', c: await signedIn(b.url, OMAR.username, OMAR.password) },
    { who: 'Karim Test', c: await signedIn(b.url, KARIM5.username, KARIM5.password) },
    { who: 'Rana Test', c: await signedIn(b.url, RANA5.username, RANA5.password) },
    { who: 'Youssef', c: await signedIn(b.url, YOUSSEF.username, YOUSSEF.password) },
    { who: 'Amal', c: w.admin },
    { who: 'Hadeer', c: await signedIn(b.url, HADEER.username, HADEER.password) },
    { who: 'Mona', c: await signedIn(b.url, MONA.username, MONA.password) },
    { who: 'owner', c: w.owner },
  ];
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w6-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec(readFileSync(join(repo, 'migrations', MIGRATION), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b.worker.files });
  const [{ n }] = (await cand.sql('SELECT (SELECT COUNT(*) FROM lesson WHERE due_on IS NOT NULL) + (SELECT COUNT(*) FROM chapter WHERE due_on IS NOT NULL) AS n')) as { n: number }[];
  if (Number(n) !== 0) {
    // A failing set-up must stop both products, or `node --test` never exits.
    await cand.stop();
    await w.close();
    assert.fail(`no due date on the candidate (found ${n})`);
  }
  return {
    w, base: b, cand,
    people: people.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    async close() {
      await cand.stop();
      await w.close();
      rmSync(file, { force: true });
    },
  };
}

// ----------------------------------------------------------- comparing ----

/** The teacher pages (AT-4.1a): a subject's editor and a subject's admin page, where the due card belongs (section 4.2). */
const TEACHER_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const isTeacherPage = (path: string) => TEACHER_PAGES.some((re) => re.test(path));

/** The appended block: from the mark to the end of the candidate's style; every selector scoped (contract AT-4). */
export function styleCheck(baseStyle: string, candStyle: string): string | null {
  if (!candStyle.startsWith(baseStyle)) return 'the candidate\'s style does not start with W5-main\'s';
  const block = candStyle.slice(baseStyle.length);
  if (!block.startsWith(MARK)) return `the added style does not start with ${MARK}: ${JSON.stringify(block.slice(0, 80))}`;
  const rules = block.slice(MARK.length).replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) if (!/^(#todo|#due-dates|\.due-|\.todo-)/.test(s)) return `a selector outside the rule: ${s}`;
  }
  return null;
}

const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;
const CARD = /<section id="due-dates"[\s\S]*?<\/section>/g;

function normalised(body: string, url: string): string {
  return body.split(url).join('[product]').replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]');
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nmain:      ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

interface Result { what: string; who: string; path: string; status: number; teacher: boolean; card: boolean; ann: boolean; problem: string | null; reads: { base: number; cand: number } }

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

const READ = /^\s*(SELECT|WITH)\b/i;

/** Logs every statement a product runs (the wave 3a statement spy) until the returned stop(). */
function spyOn(t: Twin): () => string[] {
  const log: string[] = [];
  t.worker.setHooks({ seen: (sql) => void log.push(sql) });
  return () => {
    t.worker.setHooks({});
    return log;
  };
}

/** One address on both products, each under the statement spy: status, Location, content type, cache rule, the style rule and the (normalised) body. */
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
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on W5-main, ${rc.status} on the candidate`);
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
  if (card && !teacher) problems.push('a due card on a page that is not a teacher page');
  if (cut !== bb) problems.push(`another body ${firstDifference(bb, cut)}`);
  // Wave 5's announcement blocks, byte-identical (AT-4.1b): compared on both sides.
  const annB = annBlock(bb);
  const annC = annBlock(cut);
  if (annB !== annC) problems.push('another announcement block');
  out.push({ what, who: who.who, path, status: rc.status, teacher, card, ann: Boolean(annB), problem: problems.length ? problems.join('; ') : null, reads: { base: sb0, cand: sc0 } });
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
      if (!seen.has(next) && keep(next)) queue.push(next);
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
      const s = p.w.school;
      const fixed: Record<string, string[]> = {
        Amal: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/learn/${s.arabic}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/admin/topics/${s.math}`],
        Hadeer: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/publish/edit/${s.math}`],
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

const report = (rs: Result[]) => rs.filter((r) => r.problem).slice(0, 5).map((r) => `${r.what}: ${r.problem}`).join('\n');

/** The statements of one candidate request from the gate's statement on (contract AT-3.4a; the session and membership reads before it are every request's). */
async function ownStatements(p: Pair, c: Client, method: 'GET' | 'POST', path: string, gate: RegExp, fields: Record<string, string> = {}) {
  const stop = spyOn(p.cand);
  const res = method === 'GET' ? await c.get(path) : await c.post(path, fields);
  await res.arrayBuffer();
  await p.cand.worker.settle();
  const all = stop();
  const at = all.findIndex((x) => gate.test(x));
  assert.ok(at >= 0, `${path}: the gate's statement was seen`);
  const own = all.slice(at);
  return { status: res.status, total: all.length, own: own.length, ownReads: own.filter((x) => READ.test(x)).length, ownWrites: own.filter((x) => !READ.test(x)) };
}

describe('W6 AT-4.1 base comparison: with no due dates every page is W5-main f0125980\'s, the teacher pages but for the due card', { concurrency: false }, () => {
  let p: Pair;
  let first: Promise<Result[]> | null = null;
  const noneYet = () => (first ??= compareAll(p));
  before(async () => {
    p = await pair();
  });
  after(() => p?.close());

  it('W6 AT-4.1a (teacher pages) every subject\'s editor and subject admin page differs from W5-main only by the due card', async (t) => {
    const results = await noneYet();
    const teacher = results.filter((r) => r.teacher);
    const s = p.w.school;
    t.diagnostic(`AT-4.1a ${teacher.length} teacher-page requests compared (W5-main ${BASE_SHA.slice(0, 7)}); card cut on ${new Set(teacher.filter((r) => r.card).map((r) => r.path)).size} pages`);
    assert.equal(report(teacher), '', 'every teacher page answers as W5-main does, but the due card');
    for (const path of [`/s/${s.id}/publish/edit/${s.math}`, `/s/${s.id}/admin/topics/${s.math}`, `/s/${s.id}/admin/topics/${s.arabic}`]) {
      assert.ok(teacher.some((r) => r.path === path && r.card), `the card was seen (and cut) on ${path}`);
    }
    assert.ok(teacher.filter((r) => r.status === 200 && r.what.includes(' GET ')).every((r) => r.card), 'every 200 editor and subject admin page has the card');
  });

  it('W6 AT-4.1b (every other page) same status and same body as W5-main; no due card, to-do block or due line; wave 5\'s announcement blocks byte-identical', async (t) => {
    const results = await noneYet();
    const other = results.filter((r) => !r.teacher);
    const per: Record<string, number> = {};
    for (const r of other) per[r.who] = (per[r.who] ?? 0) + 1;
    t.diagnostic(`AT-4.1b ${other.length} other requests compared (W5-main ${BASE_SHA.slice(0, 7)}), per person ${JSON.stringify(per)}; announcement blocks on ${other.filter((r) => r.ann).length}`);
    assert.ok(other.length >= 200, `a full crawl (${other.length})`);
    for (const who of ['Karim Test', 'Rana Test', 'Mona', 'owner']) assert.ok((per[who] ?? 0) > 0, `${who} is in the crawl`);
    assert.equal(report(other), '', 'every other page answers exactly as W5-main does');
    assert.ok(other.every((r) => !r.card), 'no due card on any other page');
    assert.ok(other.some((r) => r.ann && r.who === 'Salma'), 'wave 5\'s announcement blocks were present and compared');
  });

  it('W6 AT-3.4a reads, teacher side: the editor and the subject admin page W5-main\'s count; the due-dates page at most 3 statements; each due write one gate read, one item read, one write', async (t) => {
    const results = await noneYet();
    const teacher = results.filter((r) => r.teacher && r.status === 200 && r.what.includes(' GET '));
    const off = teacher.filter((r) => r.reads.cand !== r.reads.base);
    const s = p.w.school;
    const pick = (who: string, path: string) => teacher.find((r) => r.who === who && r.path === path)?.reads;
    t.diagnostic(`AT-3.4a editor (Hadeer, Mathematics) reads W5-main/candidate: ${JSON.stringify(pick('Hadeer', `/s/${s.id}/publish/edit/${s.math}`))}; subject admin page (Amal, Mathematics): ${JSON.stringify(pick('Amal', `/s/${s.id}/admin/topics/${s.math}`))}; ${teacher.length} teacher pages compared`);
    assert.equal(off.slice(0, 5).map((r) => `${r.what}: W5-main ${r.reads.base}, candidate ${r.reads.cand}`).join('\n'), '', 'every editor and subject admin page makes W5-main\'s count');
    // The due-dates page and the due writes, on the candidate, from the gate's statement on.
    const hadeer = p.people.find((x) => x.who === 'Hadeer')!.cand;
    const amal = p.people.find((x) => x.who === 'Amal')!.cand;
    const PUBLISHER_GATE = /FROM subject s WHERE s\.id = \? AND s\.space_id = \? AND s\.publisher_user_id = \?/;
    const ADMIN_GATE = /FROM subject s LEFT JOIN user u ON u\.id = s\.publisher_user_id\s+WHERE s\.id = \? AND s\.space_id = \?/;
    const lesson = s.lessons['Adding fractions'];
    const chapter = s.chapters.Fractions;
    const date = utcDatePlusDays(5);
    const figures: string[] = [];
    for (const [who, c, page, gate] of [['Hadeer', hadeer, publisherDue(s, s.math), PUBLISHER_GATE], ['Amal', amal, adminDue(s, s.math), ADMIN_GATE]] as const) {
      const shown = await ownStatements(p, c, 'GET', page, gate);
      assert.equal(shown.status, 200);
      figures.push(`${who} due-dates page: ${shown.own} statements from the gate on (${shown.total} with the session and membership reads)`);
      assert.ok(shown.own <= 3, `${who}: the due-dates page makes at most 3 statements (${shown.own})`);
      assert.equal(shown.ownWrites.length, 0, 'it writes nothing');
      for (const [kind, id] of [['lesson', lesson], ['chapter', chapter]] as const) {
        for (const value of [date, '']) {
          const w = await ownStatements(p, c, 'POST', duePost(page, kind, id), gate, { due_on: value });
          assert.equal(w.status, 303, `${who} ${kind} ${value || 'clear'}`);
          figures.push(`${who} ${kind} ${value ? 'save' : 'clear'}: ${w.ownReads} reads and ${w.ownWrites.length} write from the gate on`);
          assert.equal(w.ownReads, 2, `${who} ${kind}: one gate read and one item read`);
          assert.equal(w.ownWrites.length, 1, `${who} ${kind}: one write statement`);
          assert.match(w.ownWrites[0], new RegExp(`^\\s*UPDATE ${kind} SET due_on`), 'the item\'s due date');
        }
      }
    }
    t.diagnostic(`AT-3.4a ${figures.join('; ')}`);
  });
});
