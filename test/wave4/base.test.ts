// LMS wave 4, W4-1b (product-contract v2 on PIL-238, AT-1.4(b) and (c)): the
// base comparison, live form. Main b4ad669 (pinned; CI checks it out into
// LMS_BASE_ROOT, default .base-main/) and this candidate run side by side in
// this process, each on its own copy of one database:
// 1. the world (wave 4's, lesson activity on) is built by main's code on a
//    database with main's migrations, and every person signs in there;
// 2. that database is copied (VACUUM INTO), the copy gains the new migration
//    (every setting off, the column's default), and the candidate runs on it,
//    with the same stored files: same rows, same ids, same sessions;
// 3. every page reachable by following links from the home of Salma, Omar C,
//    Youssef, Amal, Hadeer, Mona and the owner (their previews, Salma's files
//    included), in Arabic and in English, is fetched from both, one address
//    at a time in the same order, and Salma's mark POSTs are sent to both; each
//    pair has the same status, the same Location and the same body.
// Normalising (the closed list): each product's own address in the body; the
// owner's "usage today" block (it counts each product's own requests since it
// started, and main's built the world); on the candidate, the setting card
// (`#order-state`), which only Hadeer's editor, the add-lesson and removed-items
// pages and Amal's subject admin page may carry. The comparison fails on any
// other difference, and on an empty or tiny crawl. Made-up data only.
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
import { HADEER, MONA, OMAR, SALMA, YOUSSEF, adminOrder, publisherOrder, wave4World, type Wave1World } from './world.ts';
import { QUIZ_CARD, cutWave7Style } from '../wave7/world.ts';
import { OPENING_CARD } from '../wave8/world.ts';
import { d9People } from '../d9/base.ts';
import { linksOf, r1aNormal } from '../redesign/base.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: main b4ad669 (wave 3b merged), the contract's "main". */
export const BASE_SHA = 'b4ad669c848a0454f700ab7e68bc24d0f5571095';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-main');

type Twin = Product & { worker: InProcessWorker };

interface Pair {
  w: Wave1World;
  base: Twin;
  cand: Twin;
  /** Each person's client on main and on the candidate (same session). */
  people: { who: string; base: Client; cand: Client }[];
  close(): Promise<void>;
}

/** A client of the other product holding the same cookies (the session made on main's database before the copy). */
function twin(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

async function pair(): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(!existsSync(join(BASE_ROOT, 'migrations', '0013_chapters_in_order.sql')), 'the base is main before wave 4');
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
  const cols = (await b.sql("SELECT name FROM pragma_table_info('subject')")).map((r) => String(r.name));
  assert.ok(!cols.includes('chapters_in_order'), "main's schema has no setting column");
  const people: { who: string; c: Client }[] = [
    { who: 'Salma', c: await signedIn(b.url, SALMA.username, SALMA.password) },
    { who: 'Omar C', c: await signedIn(b.url, OMAR.username, OMAR.password) },
    { who: 'Youssef', c: await signedIn(b.url, YOUSSEF.username, YOUSSEF.password) },
    { who: 'Amal', c: w.admin },
    { who: 'Hadeer', c: await signedIn(b.url, HADEER.username, HADEER.password) },
    { who: 'Mona', c: await signedIn(b.url, MONA.username, MONA.password) },
    { who: 'owner', c: w.owner },
  ];
  // The copy: same rows, ids and sessions; then the candidate's new migration, every setting at its default (off).
  await b.worker.settle();
  const file = join(tmpdir(), `lms-w4-base-${process.pid}-${Date.now()}.sqlite`);
  b.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec(readFileSync(join(repo, 'migrations', '0013_chapters_in_order.sql'), 'utf8'));
  // LMS wave 5 (contract on PIL-246, section 11 item 3): the candidate's code reads announcements, so its copy gains that migration too (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0014_announcements.sql'), 'utf8'));
  // LMS wave 6 (contract on PIL-257, section 11 item 3): and the due-date migration (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0015_due_dates.sql'), 'utf8'));
  // LMS wave 7 (W7-2, contract v2 on PIL-261, section 11 item 3): the candidate's subject pages read quizzes, so the copy gains that migration too (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0016_quizzes.sql'), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b.worker.files });
  const off = await cand.sql('SELECT COUNT(*) AS n FROM subject WHERE chapters_in_order <> 0');
  assert.equal(Number(off[0].n), 0, 'every setting off on the candidate');
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

/** The pages the setting card (#order-state) may be on (the contract's exceptions): Hadeer's editor, the add-lesson
 * (chapter) page and the removed-items page, and Amal's subject admin page. */
const CARD_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\/removed)?(\?|$)/, /^\/s\/[^/]+\/publish\/part\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];

function normalised(body: string, url: string): string {
  // LMS-D9 (PIL-320): the appoint form's help line and role choices (test/d9/base.ts).
  // LMS redesign R1a (PIL-325): the new shell, learner home and S4 dates, on both sides (test/redesign/base.ts).
  return r1aNormal(d9People(body.split(url).join('[product]')
    // The owner's usage today: each product counts its own requests (main's also built the world).
    .replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]')));
}

// LMS wave 5 (contract on PIL-246, section 11 item 3, and AT-4's style handling): the CSS is inlined in every page,
// and wave 5 appends one block to it. The candidate's <style> in <head> must be main's followed by exactly that block
// (starting with the mark, every selector `#announcements…` or `.ann-…`); then both are replaced by one token.
const W5_MARK = '/* wave 5 announcements */';
// LMS wave 6 (contract on PIL-257, section 11 item 3): wave 6 appends its own block after wave 5's; its selectors are its own.
const W6_MARK = '/* wave 6 due dates */';
const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;
function styleHandled(base: string, cand: string, what: string): { base: string; cand: string } {
  const sb = HEAD_STYLE.exec(base);
  const sc = HEAD_STYLE.exec(cand);
  assert.equal(Boolean(sc), Boolean(sb), `${what}: a <style> on both sides or neither`);
  if (!sb || !sc) return { base, cand };
  // LMS redesign R1a (PIL-325): R1a replaces the shared style; r1aNormal made both one token, so no block is left to check.
  if (sb[2] === '[style]' && sc[2] === '[style]') return { base, cand };
  // LMS wave 7 (W7 contract on PIL-261, section 11 item 3): wave 7's block follows wave 6's; it is checked and cut off first.
  const w7 = cutWave7Style(sc[2]);
  assert.equal(w7.problem, null, `${what}: the wave 7 block`);
  assert.ok(w7.rest.startsWith(sb[2]), `${what}: the candidate's style starts with main's`);
  const block = w7.rest.slice(sb[2].length);
  if (block) {
    assert.ok(block.startsWith(W5_MARK), `${what}: the added style is the wave 5 block`);
    const at6 = block.indexOf(W6_MARK);
    for (const rule of block.slice(W5_MARK.length, at6 < 0 ? undefined : at6).split('}').map((r) => r.trim()).filter(Boolean)) {
      for (const s of rule.slice(0, rule.indexOf('{')).split(',').map((x) => x.trim())) assert.match(s, /^(#announcements|\.ann-)/, `${what}: a scoped selector`);
    }
    if (at6 >= 0) {
      for (const rule of block.slice(at6 + W6_MARK.length).replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean)) {
        for (const s of rule.slice(0, rule.indexOf('{')).split(',').map((x) => x.trim())) assert.match(s, /^(#todo|#due-dates|\.due-|\.todo-)/, `${what}: a scoped wave 6 selector`);
      }
    }
  }
  return { base: base.replace(HEAD_STYLE, '$1[style]$3'), cand: cand.replace(HEAD_STYLE, '$1[style]$3') };
}

/** The candidate's body without its setting card and (wave 5) its announcement card; whether it had one. */
function withoutCard(body: string): { body: string; card: boolean } {
  // The card with the line break and indent it is drawn after.
  const out = body.replace(/\n?[ \t]*<section id="order-state"[\s\S]*?<\/section>/g, '')
    .replace(/<section id="announcements"[\s\S]*?<\/section>/g, '')
    // LMS wave 6 (contract on PIL-257, section 11 item 3): the due card, on the same pages.
    .replace(/<section id="due-dates"[\s\S]*?<\/section>/g, '')
    // LMS wave 7 (W7 contract on PIL-261, section 11 item 3): the quiz card, on the same pages.
    .replace(QUIZ_CARD, '')
    // LMS wave 8 (W8 contract on PIL-299, B1): the Opening dates card, after the quiz card, on the same pages.
    .replace(OPENING_CARD, '');
  return { body: out, card: out !== body };
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nmain:      ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

interface Tally {
  pages: number;
  cards: string[];
  per: Record<string, number>;
}

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

/** One address on both products: same status, Location, content type, cache rule and (normalised) body. */
async function same(p: Pair, who: { who: string; base: Client; cand: Client }, method: 'GET' | 'POST', path: string, tally: Tally, fields: Record<string, string> = {}): Promise<{ res: Response; body: string; links: string[] }> {
  const rb = method === 'GET' ? await who.base.get(path) : await who.base.post(path, fields);
  const rc = method === 'GET' ? await who.cand.get(path) : await who.cand.post(path, fields);
  await p.base.worker.settle();
  await p.cand.worker.settle();
  const what = `${who.who} ${method} ${path}`;
  assert.equal(rc.status, rb.status, `${what}: same status`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  assert.equal(loc(rc, p.cand.url), loc(rb, p.base.url), `${what}: same Location`);
  for (const h of ['content-type', 'cache-control']) assert.equal(rc.headers.get(h), rb.headers.get(h), `${what}: same ${h}`);
  const rawBase = await bodyOf(rb);
  const styled = styleHandled(normalised(rawBase, p.base.url), normalised(await bodyOf(rc), p.cand.url), what);
  const bb = styled.base;
  const cut = withoutCard(styled.cand);
  if (cut.card) {
    assert.ok(CARD_PAGES.some((re) => re.test(path)), `${what}: the setting card only on the editor, add-lesson, removed-items and subject admin pages`);
    tally.cards.push(path);
  }
  if (cut.body !== bb) assert.fail(`${what}: same body ${firstDifference(bb, cut.body)}`);
  tally.pages++;
  tally.per[who.who] = (tally.per[who.who] ?? 0) + 1;
  // The crawl follows main's own links (R1a: the learner home is one token in the compared body).
  return { res: rb, body: bb, links: linksOf(rawBase) };
}

/** Never followed: leaving (sign-out is a form anyway) and the test build's own addresses. */
const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);

/** Every page reachable by following same-site links (and redirects) from the person's home, fetched from both. */
async function crawlBoth(p: Pair, who: { who: string; base: Client; cand: Client }, tally: Tally, limit = 600): Promise<string[]> {
  const seen = new Set<string>();
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const { res, links } = await same(p, who, 'GET', path, tally);
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

/** The whole list in one language: each person's pages, then Salma's mark POSTs (done, then not-done, on two lessons). */
async function compareAll(p: Pair, t: { diagnostic(s: string): void }, label: string): Promise<Tally> {
  const tally: Tally = { pages: 0, cards: [], per: {} };
  for (const lang of ['ar', 'en'] as const) {
    for (const who of p.people) {
      await same(p, who, 'POST', '/account/language', tally, { lang });
      const pages = await crawlBoth(p, who, tally);
      assert.ok(pages.length >= 3, `${who.who} (${lang}): pages reached`);
      if (who.who === 'Salma') {
        assert.ok(pages.some((x) => x.includes('/file/')), 'Salma\'s files are in the list');
        assert.ok(pages.some((x) => x.includes('/read/')), 'Salma\'s lessons are in the list');
      }
      if (who.who === 'Amal' || who.who === 'Hadeer') assert.ok(pages.some((x) => x.includes('/preview')), `${who.who}'s previews are in the list`);
    }
    const salma = p.people.find((x) => x.who === 'Salma')!;
    for (const title of ['Adding fractions', 'Reading decimals']) {
      const lesson = p.w.school.lessons[title];
      for (const state of ['done', 'not-done']) {
        const posted = await same(p, salma, 'POST', `/s/${p.w.school.id}/read/${lesson}/done`, tally, { state });
        assert.equal(posted.res.status, 303, `${title} ${state}`);
        await same(p, salma, 'GET', (posted.res.headers.get('location') ?? '').replace(p.base.url, '').split('#')[0], tally);
      }
    }
  }
  t.diagnostic(`AT-1.4 ${label}: ${tally.pages} addresses compared (main ${BASE_SHA.slice(0, 7)} against the candidate), per person ${JSON.stringify(tally.per)}; setting card cut on ${new Set(tally.cards).size} pages: ${[...new Set(tally.cards)].join(', ')}`);
  assert.ok(new Set(tally.cards).size >= 2, 'the setting card was seen (and cut) on Hadeer\'s editor and Amal\'s subject admin page');
  return tally;
}

// ------------------------------------------------------------- AT-1.4(b) ----
describe('W4 AT-1.4(b) base comparison: with every setting off, every page and mark POST answers as main b4ad669 does (but the setting card)', { concurrency: false }, () => {
  let p: Pair;
  before(async () => (p = await pair()));
  after(() => p?.close());

  it('W4 AT-1.4(b) same status, Location and normalised body for every address, in Arabic and English', async (t) => {
    await compareAll(p, t, '(b)');
  });
});

// ------------------------------------------------------------- AT-1.4(c) ----
describe('W4 AT-1.4(c) after switching on and off again (Hadeer\'s editor and Amal\'s admin page), the base comparison passes again', { concurrency: false }, () => {
  let p: Pair;
  before(async () => (p = await pair()));
  after(() => p?.close());

  it('W4 AT-1.4(c) on and off from both pages, then the whole list again', async (t) => {
    const s = p.w.school;
    const hadeer = p.people.find((x) => x.who === 'Hadeer')!.cand;
    const amal = p.people.find((x) => x.who === 'Amal')!.cand;
    for (const [by, at] of [[hadeer, publisherOrder(s, s.math)], [amal, adminOrder(s, s.math)]] as const) {
      for (const state of ['on', 'off']) assert.equal((await by.post(at, { state })).status, 303, `${at} ${state}`);
    }
    const back = await p.cand.sql(`SELECT chapters_in_order AS v FROM subject WHERE id = '${s.math}'`);
    assert.equal(Number(back[0].v), 0, 'Mathematics is off again');
    await compareAll(p, t, '(c)');
  });
});
