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
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '../support/http.ts';
import { signedIn } from '../support/seed.ts';
import { inProcess, startProductWith, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { HADEER, MONA, OMAR, SALMA, YOUSSEF, wave4World, type Wave1World } from './world.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: main b87bfc5 (wave 4 and housekeeping Q1 merged), the contract's "main". */
export const BASE_SHA = 'b87bfc55f255a332f0593e45bf08c2fa5f96697d';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-main');
const MIGRATION = '0014_announcements.sql';
const MARK = '/* wave 5 announcements */';

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
  const people: { who: string; c: Client }[] = [
    { who: 'Salma', c: await signedIn(b.url, SALMA.username, SALMA.password) },
    { who: 'Omar C', c: await signedIn(b.url, OMAR.username, OMAR.password) },
    { who: 'Youssef', c: await signedIn(b.url, YOUSSEF.username, YOUSSEF.password) },
    { who: 'Amal', c: w.admin },
    { who: 'Hadeer', c: await signedIn(b.url, HADEER.username, HADEER.password) },
    { who: 'Mona', c: await signedIn(b.url, MONA.username, MONA.password) },
    { who: 'owner', c: w.owner },
  ];
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w5-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec(readFileSync(join(repo, 'migrations', MIGRATION), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b.worker.files });
  const [{ n }] = (await cand.sql('SELECT COUNT(*) AS n FROM announcement')) as { n: number }[];
  if (Number(n) !== 0) {
    // A failing set-up must stop both products, or `node --test` never exits.
    await cand.stop();
    await w.close();
    assert.fail(`no announcement on the candidate (found ${n})`);
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

/** The teacher pages (AT-4.1a): a subject's editor and a subject's admin page, where the card belongs (section 4.1). */
const TEACHER_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const isTeacherPage = (path: string) => TEACHER_PAGES.some((re) => re.test(path));

/** The appended block: from the mark to the end of the candidate's style; every selector scoped (contract AT-4). */
export function styleCheck(baseStyle: string, candStyle: string): string | null {
  if (!candStyle.startsWith(baseStyle)) return 'the candidate\'s style does not start with main\'s';
  const block = candStyle.slice(baseStyle.length);
  if (!block.startsWith(MARK)) return `the added style does not start with ${MARK}: ${JSON.stringify(block.slice(0, 80))}`;
  const rules = block.slice(MARK.length).replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) if (!/^(#announcements|\.ann-)/.test(s)) return `a selector outside the rule: ${s}`;
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

interface Result { what: string; path: string; teacher: boolean; card: boolean; problem: string | null }

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

/** One address on both products: status, Location, content type, cache rule, the style rule and the (normalised) body. */
async function same(p: Pair, who: Who, method: 'GET' | 'POST', path: string, out: Result[], fields: Record<string, string> = {}): Promise<{ res: Response; body: string }> {
  const rb = method === 'GET' ? await who.base.get(path) : await who.base.post(path, fields);
  const rc = method === 'GET' ? await who.cand.get(path) : await who.cand.post(path, fields);
  await p.base.worker.settle();
  await p.cand.worker.settle();
  const what = `${who.who} ${method} ${path}`;
  const problems: string[] = [];
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on main, ${rc.status} on the candidate`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  if (loc(rc, p.cand.url) !== loc(rb, p.base.url)) problems.push('another Location');
  for (const h of ['content-type', 'cache-control']) if (rc.headers.get(h) !== rb.headers.get(h)) problems.push(`another ${h}`);
  let bb = normalised(await bodyOf(rb), p.base.url);
  let cb = normalised(await bodyOf(rc), p.cand.url);
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
  const cut = cb.replace(/<section id="announcements"[\s\S]*?<\/section>/g, '');
  const card = cut !== cb;
  const teacher = isTeacherPage(path);
  if (card && !teacher) problems.push('an announcement block on a page that is not a teacher page');
  if (cut !== bb) problems.push(`another body ${firstDifference(bb, cut)}`);
  out.push({ what, path, teacher, card, problem: problems.length ? problems.join('; ') : null });
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

describe('W5 AT-4.1 base comparison: with no announcements every page is main b87bfc5\'s, the teacher pages but for the card', { concurrency: false }, () => {
  let p: Pair;
  let results: Result[];
  before(async () => {
    p = await pair();
    results = await compareAll(p);
  });
  after(() => p?.close());

  it('W5 AT-4.1a (teacher pages) Hadeer\'s editors and Amal\'s subject admin pages differ from main only by the announcement card', (t) => {
    const teacher = results.filter((r) => r.teacher);
    const s = p.w.school;
    t.diagnostic(`AT-4.1a ${teacher.length} teacher-page requests compared (main ${BASE_SHA.slice(0, 7)}); card cut on ${new Set(teacher.filter((r) => r.card).map((r) => r.path)).size} pages`);
    assert.equal(report(teacher), '', 'every teacher page answers as main does, but the card');
    for (const path of [`/s/${s.id}/publish/edit/${s.math}`, `/s/${s.id}/admin/topics/${s.math}`]) {
      assert.ok(teacher.some((r) => r.path === path && r.card), `the card was seen (and cut) on ${path}`);
    }
  });

  it('W5 AT-4.1b (every other page) same status and same body as main; no learner page shows an announcement block', (t) => {
    const other = results.filter((r) => !r.teacher);
    const per: Record<string, number> = {};
    for (const r of other) per[r.what.split(' ')[0]] = (per[r.what.split(' ')[0]] ?? 0) + 1;
    t.diagnostic(`AT-4.1b ${other.length} other requests compared (main ${BASE_SHA.slice(0, 7)}), per person ${JSON.stringify(per)}`);
    assert.ok(other.length >= 200, `a full crawl (${other.length})`);
    assert.equal(report(other), '', 'every other page answers exactly as main does');
    assert.ok(other.every((r) => !r.card), 'no announcement block on any other page');
  });
});
