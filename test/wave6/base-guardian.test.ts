// LMS wave 6, W6-1c (product-contract v3 addendum on PIL-265, G5: AT-6.4 to
// AT-6.6, AT-7.1, AT-7.3 and AT-7.4): the guardian's view against W6-1b-main.
// The base comparison, live form, as v2's (test/wave6/base.test.ts):
// W6-1b-main c39af35 (pinned; CI checks it out into LMS_BASE_ROOT, default
// .base-w6c/) and this candidate run side by side in this process, each on its
// own copy of one database:
// 1. the world is built by W6-1b-main's code: wave 4's (lesson activity on),
//    W5-a, Amal also a learner of Mathematics, wave 5's AT-2 announcements,
//    W6-a, W6-b and W6-f (Laila, Tamer, Huda and Rania Test), the W5-d load
//    space with W6-d and W6-e (Huda Test's learner), Salma's mark on L3; every
//    person signs in there;
// 2. the made-up dates move by the same number of days so that D is the real
//    today (both products run on the real clock; a test clock is per product),
//    or, for "no due dates", every date is cleared; lesson activity is switched
//    off when a step asks; then the database is copied (VACUUM INTO) and the
//    candidate runs on the copy with the same stored files, rows and sessions;
// 3. pages are fetched from both, one address at a time, under the statement
//    spy. W6-1c adds no style, so each page's style must be W6-1b-main's as it
//    is. Normalising (wave 5's closed list): each product's own address; the
//    owner's "usage today" block. Allowed differences: on the candidate the
//    `#guardian-todo` element on a linked learner's page while activity is on
//    (AT-7.4 a), and the last sentence of `dueCardHelp` on the editor and the
//    subject admin page (G7, AT-7.3, AT-7.4 b). Made-up data only.
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
import {
  ADMIN, HADEER, HUDA6, KARIM5, LAILA6, LOAD_ADMIN, LOAD_LEARNER, MONA, OMAR, RANA5, RANIA6, SALMA, TAMER6, YARA6, YOUSSEF, annBlock, dPlus, linkedPath, press,
  wave4World, withAt2, withHuda, withTamer, withW5a, withW5d, withW6a, withW6b, withW6f, words, type Load, type W6a, type W6b, type Wave1World,
} from './world.ts';
import { QUIZ_CARD, cutWave7Style } from '../wave7/world.ts';
import { OPENING_CARD } from '../wave8/world.ts';
import { d9People } from '../d9/base.ts';
import { linksOf, r1aNormal } from '../redesign/base.ts';
import { expectedItems, guardianTodoOf, listed, onLocalD1, sequenceOf, stripOf, todoOf, todoPath, withW6d, withW6e, withoutGuardianTodo } from './todo.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
/** The pinned base: W6-1b-main c39af35 (W6-1b merged, PR #53, 12 of 12 checks), the contract's "today's". */
export const BASE_SHA = 'c39af35b80b64998d1aaf48b68a787433307055b';
const BASE_ROOT = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w6c');

type Twin = Product & { worker: InProcessWorker };
interface Who { who: string; base: Client; cand: Client }
interface Pair {
  w: Wave1World; base: Twin; cand: Twin; people: Who[]; load: Load; a: W6a; b: W6b;
  /** One statement on both databases (they hold the same rows). */
  both(sql: string): Promise<void>;
  close(): Promise<void>;
}

function twin(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

const switchActivity = (c: Client, spaceId: string, on: boolean) => (on ? c.post(`/s/${spaceId}/admin/activity`, { told: '1' }) : c.post(`/s/${spaceId}/admin/activity/off`, {}));

async function pair(opts: { dates: boolean; activity: boolean }): Promise<Pair> {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `W6-1b-main ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0015_due_dates.sql')), 'the base is main after W6-1a');
  assert.ok(readFileSync(join(BASE_ROOT, 'src', 'progress.ts'), 'utf8').includes('export function learnerTodo('), 'the base is main after W6-1b');
  assert.ok(!readFileSync(join(BASE_ROOT, 'src', 'views', 'guardian.ts'), 'utf8').includes('guardian-todo'), 'the base is main before W6-1c');
  let base: Twin | null = null;
  startProductWith(async () => (base = await inProcess({ root: BASE_ROOT })));
  let w: Wave1World;
  try {
    w = await wave4World({ activity: true });
  } finally {
    startProductWith(null);
  }
  const b0 = base as Twin | null;
  assert.ok(b0, 'the world runs on W6-1b-main');
  let a: W6a;
  let nile: W6b;
  let load: Load;
  const people: { who: string; c: Client }[] = [];
  try {
    await withW5a(w);
    await seed(b0.url, { spaceId: w.school.id, grantedBy: ADMIN.username, memberships: [{ username: ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(30) }] });
    await b0.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6c-amal-learner', '${w.school.id}', '${w.school.math}', '${(await b0.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}')`);
    await withAt2(w);
    a = await withW6a(w);
    await withW6f(w, a);
    nile = await withW6b(w);
    await withTamer(w, nile);
    load = await withW5d(w);
    await withW6d(b0.sql, load, dPlus);
    await withW6e(b0.sql, load, dPlus);
    w.ids[HUDA6.username] = await withHuda(b0.url, load, LOAD_ADMIN.username, LOAD_LEARNER.username);
    const loadAdmin = await signedIn(b0.url, LOAD_ADMIN.username, LOAD_ADMIN.password);
    assert.equal((await switchActivity(loadAdmin, load.id, true)).status, 303, 'lesson activity on in the load space');
    // Salma's marks present (AT-7, "Steps"): L3.
    assert.equal((await press(await signedIn(b0.url, SALMA.username, SALMA.password), w.school, a.L.L3, 'done')).status, 303, 'Salma marks L3');
    // D becomes the real today: every made-up date moves by the same number of days.
    const shift = Math.round((Date.parse(`${utcDatePlusDays(0)}T00:00:00Z`) - Date.parse(`${dPlus(0)}T00:00:00Z`)) / 86_400_000);
    for (const table of ['lesson', 'chapter']) {
      await b0.sql(opts.dates
        ? `UPDATE ${table} SET due_on = date(due_on, '${shift >= 0 ? '+' : ''}${shift} days') WHERE due_on IS NOT NULL`
        : `UPDATE ${table} SET due_on = NULL WHERE due_on IS NOT NULL`);
    }
    if (!opts.activity) {
      assert.equal((await switchActivity(w.admin, w.school.id, false)).status, 303, 'activity off in Mesk School');
      assert.equal((await switchActivity(nile.nadia, nile.id, false)).status, 303, 'activity off in Nile Test Space');
      assert.equal((await switchActivity(loadAdmin, load.id, false)).status, 303, 'activity off in the load space');
    }
    for (const [who, person] of [
      ['Salma', SALMA], ['Omar C', OMAR], ['Karim Test', KARIM5], ['Rana Test', RANA5], ['Youssef', YOUSSEF], ['Amal', ADMIN], ['Hadeer', HADEER], ['Mona', MONA],
      ['Laila Test', LAILA6], ['Tamer Test', TAMER6], ['Huda Test', HUDA6], ['Rania Test', RANIA6], ['Yara Test', YARA6], ['Load learner', LOAD_LEARNER],
    ] as const) people.push({ who, c: await signedIn(b0.url, person.username, person.password) });
    people.push({ who: 'owner', c: w.owner });
  } catch (err) {
    await w.close();
    throw err;
  }
  await b0.worker.settle();
  const file = join(tmpdir(), `lms-w6c-base-${process.pid}-${Date.now()}.sqlite`);
  b0.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  // LMS wave 7 (W7-2, contract v2 on PIL-261, section 11 item 3): the candidate's subject pages read quizzes, so the copy gains that migration (none stored).
  copy.exec(readFileSync(join(repo, 'migrations', '0016_quizzes.sql'), 'utf8'));
  const cand = await inProcess({ sqlite: copy, files: b0.worker.files });
  return {
    w, base: b0, cand, load: load!, a: a!, b: nile!,
    people: people.map((p) => ({ who: p.who, base: p.c, cand: twin(p.c, cand.url) })),
    async both(sql: string) {
      await b0.sql(sql);
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

const TEACHER_PAGES = [/^\/s\/[^/]+\/publish\/edit\/[^/?#]+(\?|$)/, /^\/s\/[^/]+\/admin\/topics\/[^/?#]+(\?|$)/];
const isTeacherPage = (path: string) => TEACHER_PAGES.some((re) => re.test(path));
/** A linked learner's page (not its activity page). */
const LINKED = /^\/s\/[^/]+\/linked\/[^/?#]+(\?|$)/;

const READ = /^\s*(SELECT|WITH)\b/i;
const TODO = /^\s*WITH (todo_chapter|item) AS/;

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (fragment: string) => unescape(fragment.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** dueCardHelp's last sentence: v2's on W6-1b-main, v3's on the candidate (G7, UX-81), in every kit and language. */
const V2_LAST = { en: 'Nobody else is shown who is late.', ar: 'لا يُعرض التأخّر لأي شخص آخر.' } as const;
function v3Lasts(): Set<string> {
  const out = new Set<string>();
  for (const kit of ['school', 'company', 'university'] as const) {
    for (const lang of ['en', 'ar'] as const) {
      const t = words(kit, lang);
      const low = (k: 'learner' | 'guardian') => t(k).toLocaleLowerCase(lang);
      const full = t('dueCardHelp', { chapter: 'c', lesson: 'l', subject: 's', learner: low('learner'), guardian: low('guardian'), days: '7' });
      out.add(full.slice(full.lastIndexOf(lang === 'ar' ? 'لا يظهر' : 'Lateness')));
    }
  }
  return out;
}
const V3_LASTS = v3Lasts();

const HELP = /<p class="due-help">([\s\S]*?)<\/p>/;
const HEAD_STYLE = /(<head>[\s\S]*?<style>)([\s\S]*?)(<\/style>)/;

/** The help line of both sides: W6-1b-main's ends with v2's sentence, the candidate's is the same text with v3's sentence in its place. */
function helpProblem(bb: string, cb: string): string | null {
  const hb = HELP.exec(bb);
  const hc = HELP.exec(cb);
  if (!hb && !hc) return null;
  if (!hb || !hc) return 'the due card help line on one side only';
  const tb = textOf(hb[1]);
  const tc = textOf(hc[1]);
  const last = tb.endsWith(V2_LAST.en) ? V2_LAST.en : tb.endsWith(V2_LAST.ar) ? V2_LAST.ar : null;
  if (!last) return `W6-1b-main's help line does not end with v2's sentence: ${JSON.stringify(tb.slice(-80))}`;
  const head = tb.slice(0, tb.length - last.length);
  if (!tc.startsWith(head)) return `the candidate's help line differs before its last sentence: ${JSON.stringify(tc.slice(0, 120))}`;
  if (!V3_LASTS.has(tc.slice(head.length))) return `the candidate's last sentence is not v3's: ${JSON.stringify(tc.slice(head.length))}`;
  return null;
}

function normalised(body: string, url: string): string {
  // LMS-D9 (PIL-320): the appoint form's help line and role choices (test/d9/base.ts).
  // LMS redesign R1a (PIL-325): the new shell, learner home and S4 dates, on both sides (test/redesign/base.ts).
  return r1aNormal(d9People(body.split(url).join('[product]').replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]')));
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\nW6-1b-main: ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\ncandidate:  ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`;
}

interface Result {
  what: string; who: string; path: string; status: number; problem: string | null; block: boolean;
  reads: { base: number; cand: number }; todo: number; cache: string; body: string; candBody: string; links: string[]; emptyHome: boolean; strip: boolean;
}

async function bodyOf(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  return type.startsWith('text/') ? res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
}

function spyOn(t: Twin): () => string[] {
  const log: string[] = [];
  t.worker.setHooks({ seen: (sql) => void log.push(sql) });
  return () => {
    t.worker.setHooks({});
    return log;
  };
}

/** One address on both products, under the statement spy: status, Location, content type, cache rule and the (normalised) body, with the allowed differences only. */
async function same(p: Pair, who: Who, method: 'GET' | 'POST', path: string, out: Result[], fields: Record<string, string> = {}, opts: { block?: boolean } = {}): Promise<Result & { res: Response }> {
  const stopBase = spyOn(p.base);
  const rb = method === 'GET' ? await who.base.get(path) : await who.base.post(path, fields);
  const bodyB = await bodyOf(rb);
  await p.base.worker.settle();
  const sb = stopBase();
  const stopCand = spyOn(p.cand);
  const rc = method === 'GET' ? await who.cand.get(path) : await who.cand.post(path, fields);
  const bodyC = await bodyOf(rc);
  await p.cand.worker.settle();
  const sc = stopCand();
  const problems: string[] = [];
  if (rc.status !== rb.status) problems.push(`status ${rb.status} on W6-1b-main, ${rc.status} on the candidate`);
  const loc = (r: Response, url: string) => (r.headers.get('location') ?? '').split(url).join('[product]');
  if (loc(rc, p.cand.url) !== loc(rb, p.base.url)) problems.push('another Location');
  for (const h of ['content-type', 'cache-control']) if (rc.headers.get(h) !== rb.headers.get(h)) problems.push(`another ${h}`);
  const bb = normalised(bodyB, p.base.url);
  let cb = normalised(bodyC, p.cand.url);
  // LMS wave 7 (W7 contract on PIL-261, section 11 item 3): wave 7's style block, at the end of the candidate's <style>, is
  // checked and cut off; the quiz card is cut off teacher pages. Everything else is compared as before.
  const style = HEAD_STYLE.exec(cb);
  // LMS redesign R1a (PIL-325): R1a replaces the shared style; r1aNormal made both one token, so no block is left to check.
  if (style && style[2] !== '[style]') {
    const w7 = cutWave7Style(style[2]);
    if (w7.problem) problems.push(`style: ${w7.problem}`);
    cb = cb.replace(HEAD_STYLE, (_m, a: string, _s: string, z: string) => a + w7.rest + z);
  }
  // LMS wave 8 (contract on PIL-299, B1): the Opening dates card, after the quiz card, on the same pages.
  const quizCut = (isTeacherPage(path) ? cb.replace(OPENING_CARD, '') : cb).replace(QUIZ_CARD, '');
  if (quizCut !== cb && !isTeacherPage(path)) problems.push('a quiz card on a page that is not a teacher page');
  cb = quizCut;
  let cut = withoutGuardianTodo(cb);
  const block = cut !== cb;
  if (block && !(opts.block && LINKED.test(path))) problems.push('a #guardian-todo element where none may be');
  let cmpB = bb;
  if (isTeacherPage(path)) {
    const bad = helpProblem(bb, cut);
    if (bad) problems.push(bad);
    cmpB = bb.replace(HELP, '<p class="due-help">[help]</p>');
    cut = cut.replace(HELP, '<p class="due-help">[help]</p>');
  } else if (HELP.test(cut) && cut !== bb) {
    problems.push('the due card help line outside a teacher page');
  }
  if (cut !== cmpB) problems.push(`another body ${firstDifference(cmpB, cut)}`);
  // Mandatory (AT-7.4): wave 5's announcement blocks and the learner's own to-do block, byte-identical.
  if (annBlock(bb) !== annBlock(cb)) problems.push('another announcement block');
  if ((todoOf(bb)?.block ?? null) !== (todoOf(cb)?.block ?? null)) problems.push('another learner to-do block');
  const r = {
    what: `${who.who} ${method} ${path}`, who: who.who, path, status: rc.status, problem: problems.length ? problems.join('; ') : null, block,
    reads: { base: sb.filter((x) => READ.test(x)).length, cand: sc.filter((x) => READ.test(x)).length }, todo: sc.filter((x) => TODO.test(x)).length,
    cache: rc.headers.get('cache-control') ?? '', body: bb, candBody: cb, res: rb,
    // The crawl follows main's own links (R1a: the learner home is one token in the compared body).
    links: linksOf(bodyB),
    // LMS redesign R1a: a learner home with no subject card (no latest-announcement read), and a home with its due strip.
    emptyHome: /<main class="[^"]*\bhome\b/.test(bodyC) && !/<ul id="my-list"/.test(bodyC),
    strip: Boolean(stripOf(bodyC)?.ids.length),
  };
  out.push(r);
  return r;
}

const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);

async function crawlBoth(p: Pair, who: Who, out: Result[], opts: { block?: boolean }, limit = 600): Promise<string[]> {
  const seen = new Set<string>();
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const r = await same(p, who, 'GET', path, out, {}, opts);
    if (r.res.status >= 300 && r.res.status < 400) {
      const to = (r.res.headers.get('location') ?? '').replace(p.base.url, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!(r.res.headers.get('content-type') ?? '').startsWith('text/html')) continue;
    for (const next of r.links) {
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `${who.who}: the crawl ends before ${limit} pages`);
  return [...seen];
}

/** v2 AT-4's address list (every page of its people, Amal's and Hadeer's previews and teacher pages, Salma's mark POSTs) plus every page of Laila, Tamer, Huda and Rania Test; Arabic and English. */
async function compareAll(p: Pair, opts: { block?: boolean } = {}): Promise<Result[]> {
  const out: Result[] = [];
  const s = p.w.school;
  const crawled = p.people.filter((x) => x.who !== 'Yara Test' && x.who !== 'Load learner');
  for (const lang of ['ar', 'en'] as const) {
    for (const who of crawled) {
      await same(p, who, 'POST', '/account/language', out, { lang }, opts);
      const pages = await crawlBoth(p, who, out, opts);
      assert.ok(pages.length >= 3, `${who.who} (${lang}): pages reached`);
      const fixed: Record<string, string[]> = {
        Amal: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/learn/${s.arabic}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/admin/topics/${s.math}`],
        Hadeer: [`/s/${s.id}/learn/${s.math}`, `/s/${s.id}/preview?from=home`, `/s/${s.id}/preview/learn/${s.math}?from=home`, `/s/${s.id}/publish/edit/${s.math}`],
      };
      for (const path of (fixed[who.who] ?? []).filter((x) => !pages.includes(x))) await same(p, who, 'GET', path, out, {}, opts);
    }
    const salma = p.people.find((x) => x.who === 'Salma')!;
    for (const title of ['Adding fractions', 'Reading decimals']) {
      for (const state of ['done', 'not-done']) {
        const posted = await same(p, salma, 'POST', `/s/${s.id}/read/${s.lessons[title]}/done`, out, { state }, opts);
        assert.equal(posted.res.status, 303, `${title} ${state}`);
        await same(p, salma, 'GET', (posted.res.headers.get('location') ?? '').replace(p.base.url, '').split('#')[0], out, {}, opts);
      }
    }
  }
  return out;
}

const report = (rs: Result[]) => rs.filter((r) => r.problem).slice(0, 5).map((r) => `${r.what}: ${r.problem}`).join('\n');
const per = (rs: Result[]) => {
  const n: Record<string, number> = {};
  for (const r of rs) n[r.who] = (n[r.who] ?? 0) + 1;
  return JSON.stringify(n);
};

/** AT-6.4 on a crawl: a linked learner's page W6-1b-main's count plus exactly one while activity is on, every other request W6-1b-main's count; no to-do statement but there. */
function readsProblems(rs: Result[], activityOn: boolean): string {
  const off = rs.filter((r) => {
    const linked = activityOn && r.status === 200 && r.what.includes(' GET ') && LINKED.test(r.path);
    // LMS wave 7 (W7-2, contract v2 on PIL-261, section 11 item 4): a subject's /learn page and the preview subject page read its quizzes once more.
    const quiz = r.status === 200 && r.what.includes(' GET ') && /^\/s\/[^/]+\/(preview\/)?learn\/[^/?#]+(\?|$)/.test(r.path) ? 1 : 0;
    // LMS wave 7 (W7-3, contract v3 addendum on PIL-285, G9.2 and G9.5): a 200 linked learner's page also reads the
    // learner's quiz scores once, whatever the activity setting.
    const scores = r.status === 200 && r.what.includes(' GET ') && LINKED.test(r.path) ? 1 : 0;
    // LMS redesign R1a (PIL-325, UX-55 row): wave 5's home block read is now the cards' latest-announcement read, which a
    // learner home with no subject card (nothing assigned) does not make: one fewer there.
    const noCards = r.status === 200 && r.what.includes(' GET ') && /^\/s\/[^/?#]+$/.test(r.path) && r.emptyHome ? 1 : 0;
    return r.reads.cand !== r.reads.base + (linked ? 1 : 0) + quiz + scores - noCards || (LINKED.test(r.path) && r.todo !== (linked ? 1 : 0));
  });
  return off.slice(0, 5).map((r) => `${r.what}: W6-1b-main ${r.reads.base}, candidate ${r.reads.cand}, to-do statements ${r.todo}`).join('\n');
}

// --------------------------------------------------------------- AT-7.3 ----
describe('W6 AT-7.3 base comparison with no due dates: W6-1b-main c39af35 and the candidate on the same world, lesson activity off and then on; every page the same status and body but the dueCardHelp text', { concurrency: false }, () => {
  let off: Pair | undefined;
  let on: Pair | undefined;
  after(async () => {
    await off?.close();
    await on?.close();
  });

  it('W6 AT-7.3 no due dates: v2 AT-4\'s address list plus every page of Laila, Tamer, Huda and Rania Test, Arabic and English, activity off then on; reads as AT-6.4', async (t) => {
    off = await pair({ dates: false, activity: false });
    const a = await compareAll(off);
    await off.close();
    off = undefined;
    on = await pair({ dates: false, activity: true });
    const b = await compareAll(on, { block: true });
    for (const [what, rs, act] of [['activity off', a, false], ['activity on', b, true]] as const) {
      t.diagnostic(`AT-7.3 ${what}: ${rs.length} requests compared with W6-1b-main ${BASE_SHA.slice(0, 7)} (${per(rs)}); ${rs.filter((r) => r.problem === null && isTeacherPage(r.path)).length} teacher pages differ only by dueCardHelp`);
      assert.ok(rs.length >= 300, `${what}: a full crawl (${rs.length})`);
      assert.equal(report(rs), '', `${what}: every page as W6-1b-main, but the dueCardHelp text`);
      assert.equal(rs.filter((r) => r.block).length, 0, `${what}: no guardian block without due dates`);
      assert.ok(rs.some((r) => isTeacherPage(r.path) && HELP.test(r.candBody)), `${what}: the help line was compared`);
      assert.ok(['Laila Test', 'Tamer Test', 'Huda Test', 'Rania Test'].every((x) => rs.some((r) => r.who === x && LINKED.test(r.path) && r.status === 200)), `${what}: each new guardian's linked learner pages were compared`);
      assert.equal(readsProblems(rs, act), '', `${what}: reads as AT-6.4 (linked learner's page +1 while activity is on, every other page W6-1b-main's)`);
    }
  });
});

// --------------------------------------------------------------- AT-7.4 ----
describe('W6 AT-7.4 with due dates: the same crawl with W6-a and W6-b present; every page equals W6-1b-main\'s but the #guardian-todo element on linked learners\' pages with listed items while activity is on, and the dueCardHelp text', { concurrency: false }, () => {
  let p: Pair;
  before(async () => {
    p = await pair({ dates: true, activity: true });
  });
  after(() => p?.close());

  it('W6 AT-7.4 with due dates, activity on, Arabic and English: only the guardian block and the help text differ; the learner\'s own block and wave 5\'s announcement blocks byte-identical', async (t) => {
    const rs = await compareAll(p, { block: true });
    const blocks = rs.filter((r) => r.block);
    t.diagnostic(`AT-7.4: ${rs.length} requests compared with W6-1b-main ${BASE_SHA.slice(0, 7)} (${per(rs)}); ${blocks.length} with the guardian block (${[...new Set(blocks.map((r) => r.who))].join(', ')}); ${rs.filter((r) => todoOf(r.body)).length} with the learner's own block, byte-identical`);
    assert.ok(rs.length >= 300, `a full crawl (${rs.length})`);
    assert.equal(report(rs), '', 'every page as W6-1b-main, but the guardian block and the dueCardHelp text');
    for (const who of ['Mona', 'Laila Test', 'Rania Test', 'Tamer Test', 'Huda Test']) assert.ok(blocks.some((r) => r.who === who), `${who}: the block on a linked learner's page`);
    // LMS redesign R1a (UX-34/UX-54/UX-62 and UX-62/UX-63 rows): the learner's own block is on her to-do page, which
    // W6-1b-main does not have (W6 AT-6.x and AT-R1a.3b read it there); her home shows its due strip, seen here.
    assert.ok(rs.some((r) => r.strip), 'the learner\'s own due strip was on her home');
    assert.ok(rs.some((r) => annBlock(r.body)), 'wave 5\'s announcement blocks were compared');
    assert.equal(readsProblems(rs, true), '', 'reads as AT-6.4 with due dates');
  });
});

// ------------------------------------------- AT-6.5, AT-6.6 and AT-7.1 ----
describe('W6 AT-6.5, AT-6.6 and AT-7.1 against W6-1b-main with due dates', { concurrency: false }, () => {
  let p: Pair | undefined;
  after(() => p?.close());

  it('W6 AT-6.5 activity off in Mesk School: Mona\'s and Laila Test\'s pages for Salma byte for byte W6-1b-main\'s (the activity-off line, no block), no to-do statement; switching on brings the block at the next load, off removes it', async (t) => {
    p = await pair({ dates: true, activity: false });
    const s = p.w.school;
    const out: Result[] = [];
    const salmaPage = linkedPath(s, p.w.ids[SALMA.username]);
    for (const lang of ['ar', 'en'] as const) {
      for (const who of p.people.filter((x) => x.who === 'Mona' || x.who === 'Laila Test')) {
        await same(p, who, 'POST', '/account/language', out, { lang });
        const r = await same(p, who, 'GET', salmaPage, out);
        assert.equal(r.problem, null, `${who.who} ${lang}: byte for byte W6-1b-main's`);
        assert.equal(r.status, 200);
        assert.match(r.candBody, /<p id="activity-off" class="card message" data-activity>/, `${who.who} ${lang}: the activity-off line`);
        assert.equal(guardianTodoOf(r.candBody), null, `${who.who} ${lang}: no block`);
        assert.equal(r.todo, 0, `${who.who} ${lang}: no to-do statement`);
        // LMS wave 7 (W7-3, contract v3 addendum on PIL-285, G9.5 and AT-7.9): the quiz score statement, whatever the activity setting.
        assert.equal(r.reads.cand, r.reads.base + 1, `${who.who} ${lang}: W6-1b-main's count plus the quiz score statement`);
      }
    }
    const amal = p.people.find((x) => x.who === 'Amal')!.cand;
    const mona = p.people.find((x) => x.who === 'Mona')!.cand;
    assert.equal((await switchActivity(amal, s.id, true)).status, 303, 'activity on (the candidate)');
    assert.ok(guardianTodoOf(await (await mona.get(salmaPage)).text()), 'switched on: the block at the next load');
    assert.equal((await switchActivity(amal, s.id, false)).status, 303, 'activity off again');
    assert.equal(guardianTodoOf(await (await mona.get(salmaPage)).text()), null, 'switched off: no block at the next load');
    t.diagnostic(`AT-6.5: ${out.length} requests compared with W6-1b-main ${BASE_SHA.slice(0, 7)} while activity is off; on and off again at the next load`);
    await p.close();
    p = undefined;
  });

  it('W6 AT-6.6 one person, two roles: Rania Test\'s home shows her own list (no L1), Salma\'s page shows Salma\'s (L1 overdue), never mixed; Rania Test at her own linked address gets W6-1b-main\'s answer, no to-do statement', async (t) => {
    p = await pair({ dates: true, activity: true });
    const s = p.w.school;
    const rania = p.people.find((x) => x.who === 'Rania Test')!;
    const salma = p.people.find((x) => x.who === 'Salma')!;
    const cw = { ...p.w, p: { ...p.w.p, sql: p.cand.sql } } as Wave1World;
    const last = utcDatePlusDays(7);
    // LMS redesign R1a (UX-62/UX-63 row): a learner's own block is on her to-do page.
    const own = todoOf(await (await rania.cand.get(todoPath(s))).text());
    assert.ok(own, 'Rania Test\'s learner home has her own block');
    const ownIds = [...listed(own)];
    assert.ok(!ownIds.includes(p.a.L.L1), 'her home: L1 is absent (she marked it done)');
    assert.deepEqual(ownIds.filter((id) => id !== p.a.G1).sort(), [...(await expectedItems(cw, s.id, s.math, p.w.ids[RANIA6.username], last))].sort(), 'her home: her own v2 list');
    const salmaHome = todoOf(await (await salma.cand.get(todoPath(s))).text());
    const page = guardianTodoOf(await (await rania.cand.get(linkedPath(s, p.w.ids[SALMA.username]))).text());
    assert.ok(page && salmaHome, 'Salma\'s page opened by Rania Test has the block');
    // LMS redesign R1a (UX-62/UX-63 row): the learner's row ends with the S6 tag, the guardian's keeps wave 6's line, so the
    // lists are compared without their lines (groups, headings, titles, order, folds); W6 AT-6.x check each guardian line.
    assert.deepEqual(sequenceOf(page, false), sequenceOf(salmaHome, false), 'Salma\'s page equals Salma\'s to-do block at that instant');
    assert.ok(page.groups.find((g) => g.key === 'overdue')?.items.some((i) => i.title === 'Practice L1'), 'Salma\'s page: L1 in todoOverdue');
    assert.notDeepEqual(sequenceOf(page, false), sequenceOf(own, false), 'the two lists are not the same list');
    assert.ok(!(own.groups.find((g) => g.key === 'overdue')?.items ?? []).some((i) => i.title === 'Practice L1'), 'Salma\'s L1 never reaches Rania Test\'s own home');
    assert.ok(!sequenceOf(page)!.some((x) => x.includes('Practice L3')), 'Salma marked L3: it is not on her page even though Rania Test has not');
    assert.ok(listed(own).has(p.a.L.L3), 'Rania Test has L3 on her own list (her own marks)');
    const out: Result[] = [];
    const self = await same(p, rania, 'GET', linkedPath(s, p.w.ids[RANIA6.username]), out);
    assert.equal(self.problem, null, 'her own linked address: W6-1b-main\'s answer, byte for byte');
    assert.equal(self.status, 403, 'her own linked address: 403');
    assert.equal(self.todo, 0, 'no to-do statement');
    t.diagnostic(`AT-6.6: Rania Test's home ${ownIds.length} items, Salma's page ${sequenceOf(page)!.length} items; her own linked address ${self.status}, as W6-1b-main`);
  });

  it('W6 AT-7.1 only their own linked learner: the refusals are W6-1b-main\'s 403 byte for byte with no to-do statement; restoring the link or the access brings the block back; the block page and each 403 carry Cache-Control private or no-store', async (t) => {
    p ??= await pair({ dates: true, activity: true });
    const s = p.w.school;
    const by = (who: string) => p!.people.find((x) => x.who === who)!;
    const ids = p.w.ids;
    const out: Result[] = [];
    const salmaPage = linkedPath(s, ids[SALMA.username]);
    const omarPage = linkedPath(s, ids[OMAR.username]);
    const refused = async (who: string, path: string, what: string) => {
      const r = await same(p!, by(who), 'GET', path, out);
      assert.equal(r.problem, null, `${what}: W6-1b-main's answer, byte for byte`);
      assert.equal(r.status, 403, `${what}: 403`);
      assert.equal(r.todo, 0, `${what}: no to-do statement`);
      assert.match(r.cache, /private|no-store/, `${what}: Cache-Control ${r.cache}`);
    };
    const shown = async (who: string, path: string, what: string) => {
      const res = await by(who).cand.get(path);
      assert.equal(res.status, 200, `${what}: 200`);
      assert.match(res.headers.get('cache-control') ?? '', /private|no-store/, `${what}: Cache-Control on the page with the block`);
      assert.ok(guardianTodoOf(await res.text()), `${what}: the block`);
    };
    await shown('Mona', salmaPage, 'Mona on Salma\'s page');
    await refused('Mona', omarPage, 'Mona at Omar C\'s page');
    await refused('Tamer Test', salmaPage, 'Tamer Test at Salma\'s page (another space)');
    for (const who of ['Mona', 'Laila Test', 'Tamer Test', 'Huda Test', 'Rania Test']) await refused(who, linkedPath(s, 'made-up-learner-id'), `${who} at a made-up id`);
    await refused('Tamer Test', linkedPath({ id: p.b.id }, 'made-up-learner-id'), 'Tamer Test at a made-up id in his own space');
    // Laila Test's link to Omar C removed (the admin's Remove sets ended_at), then restored.
    await shown('Laila Test', omarPage, 'Laila Test on Omar C\'s page');
    await p.both(`UPDATE guardian_link SET ended_at = 1 WHERE guardian_user_id = '${ids[LAILA6.username]}' AND learner_user_id = '${ids[OMAR.username]}'`);
    await refused('Laila Test', omarPage, 'Laila Test after her link to Omar C is removed');
    await p.both(`UPDATE guardian_link SET ended_at = NULL WHERE guardian_user_id = '${ids[LAILA6.username]}' AND learner_user_id = '${ids[OMAR.username]}'`);
    await shown('Laila Test', omarPage, 'Laila Test after the link is restored');
    // Salma's access ends, then comes back.
    await p.both(`UPDATE membership SET ended_on = '${utcDatePlusDays(-1)}' WHERE user_id = '${ids[SALMA.username]}' AND space_id = '${s.id}'`);
    for (const who of ['Mona', 'Laila Test', 'Rania Test']) await refused(who, salmaPage, `${who} after Salma's access ends`);
    await p.both(`UPDATE membership SET ended_on = NULL WHERE user_id = '${ids[SALMA.username]}' AND space_id = '${s.id}'`);
    for (const who of ['Mona', 'Laila Test', 'Rania Test']) await shown(who, salmaPage, `${who} after Salma's access is back`);
    t.diagnostic(`AT-7.1: ${out.length} refusals compared with W6-1b-main ${BASE_SHA.slice(0, 7)}, each 403 byte for byte with no to-do statement`);
  });
});

// ---------------------------------------------------------------- AT-6.4 ----

/** One GET under the statement spy, with every statement's bound parameters. */
async function measure(t: Twin, c: Client, path: string) {
  const log: { sql: string; params: unknown[] }[] = [];
  t.worker.setHooks({ seen: (sql, params) => void log.push({ sql, params }) });
  const res = await c.get(path);
  const body = await res.text();
  await t.worker.settle();
  t.worker.setHooks({});
  const todo = log.filter((l) => TODO.test(l.sql));
  return { status: res.status, body, bytes: Buffer.byteLength(body), reads: log.filter((l) => READ.test(l.sql)).length, maxParams: Math.max(...log.map((l) => l.params.length)), todo: todo.length === 1 ? todo[0] : null, todos: todo.length };
}

describe('W6 AT-6.4 reads (hard gate): the linked learner\'s page W6-1b-main\'s count plus exactly one while activity is on, with or without due dates; W6-1b-main\'s while off; the guardian home and the activity page W6-1b-main\'s; at W6-e at most 30 rows, 5,000 rows read, 20 bound parameters, and the page within W6-1b-main\'s + the learner\'s own block + 2 KB', { concurrency: false }, () => {
  let p: Pair;
  before(async () => {
    p = await pair({ dates: true, activity: true });
  });
  after(() => p?.close());

  it('W6 AT-6.4 reads on every guardian page, with and without due dates, activity on and off; the W6-e figures (Huda Test), rows read from a local D1 copy', async (t) => {
    const s = p.w.school;
    const ids = p.w.ids;
    const by = (who: string) => p.people.find((x) => x.who === who)!;
    const loadLearnerId = String((await p.cand.sql(`SELECT id FROM user WHERE username = '${LOAD_LEARNER.username}'`))[0].id);
    const pages: [string, string][] = [
      ['Mona', `/s/${s.id}/linked`], ['Mona', linkedPath(s, ids[SALMA.username])], ['Mona', `${linkedPath(s, ids[SALMA.username])}/activity`],
      ['Laila Test', linkedPath(s, ids[SALMA.username])], ['Laila Test', linkedPath(s, ids[OMAR.username])], ['Rania Test', linkedPath(s, ids[SALMA.username])],
      ['Tamer Test', `/s/${p.b.id}/linked`], ['Tamer Test', linkedPath({ id: p.b.id }, ids[YARA6.username])],
      ['Huda Test', `/s/${p.load.id}/linked`], ['Huda Test', linkedPath(p.load, loadLearnerId)], ['Huda Test', `${linkedPath(p.load, loadLearnerId)}/activity`],
    ];
    const lines: string[] = [];
    const check = async (what: string, activityOn: boolean) => {
      for (const [who, path] of pages) {
        const mb = await measure(p.base, by(who).base, path);
        const mc = await measure(p.cand, by(who).cand, path);
        assert.equal(mc.status, mb.status, `${what} ${who} ${path}: the same status`);
        const linked = LINKED.test(path) && mc.status === 200 && activityOn;
        // LMS wave 7 (W7-3, contract v3 addendum on PIL-285, G9.2): wave 6's count rises by one, the quiz score statement.
        const scores = LINKED.test(path) && mc.status === 200 ? 1 : 0;
        assert.equal(mc.reads, mb.reads + (linked ? 1 : 0) + scores, `${what} ${who} ${path}: W6-1b-main's count (${mb.reads})${linked ? ' plus exactly one' : ''}${scores ? ' plus the quiz score statement' : ''}`);
        assert.equal(mc.todos, linked ? 1 : 0, `${what} ${who} ${path}: ${linked ? 'one' : 'no'} to-do statement`);
        lines.push(`${what} ${who} ${path.replace(/^\/s\/[^/]+/, '')}: ${mb.reads} → ${mc.reads}`);
      }
    };
    await check('with due dates, activity on:', true);
    const saved = await p.cand.sql("SELECT 'lesson' AS t, id, due_on FROM lesson WHERE due_on IS NOT NULL UNION ALL SELECT 'chapter', id, due_on FROM chapter WHERE due_on IS NOT NULL");
    for (const table of ['lesson', 'chapter']) await p.both(`UPDATE ${table} SET due_on = NULL WHERE due_on IS NOT NULL`);
    await check('no due dates, activity on:', true);
    const amal = by('Amal');
    for (const side of [amal.base, amal.cand]) assert.equal((await switchActivity(side, s.id, false)).status, 303, 'activity off in Mesk School');
    for (const side of [p.b.nadia, twin(p.b.nadia, p.cand.url)]) assert.equal((await switchActivity(side, p.b.id, false)).status, 303, 'activity off in Nile Test Space');
    // Signed in after the copy, so on each product.
    const loadAdmins = [await signedIn(p.base.url, LOAD_ADMIN.username, LOAD_ADMIN.password), await signedIn(p.cand.url, LOAD_ADMIN.username, LOAD_ADMIN.password)];
    for (const side of loadAdmins) assert.equal((await switchActivity(side, p.load.id, false)).status, 303, 'activity off in the load space');
    await check('no due dates, activity off:', false);
    for (let i = 0; i < saved.length; i += 50) {
      const chunk = saved.slice(i, i + 50);
      for (const table of ['lesson', 'chapter']) {
        const rows = chunk.filter((r) => r.t === table);
        if (rows.length) await p.both(`UPDATE ${table} SET due_on = CASE id ${rows.map((r) => `WHEN '${r.id}' THEN '${r.due_on}'`).join(' ')} END WHERE id IN (${rows.map((r) => `'${r.id}'`).join(', ')})`);
      }
    }
    await check('with due dates, activity off:', false);
    for (const side of [amal.base, amal.cand]) assert.equal((await switchActivity(side, s.id, true)).status, 303, 'activity on again in Mesk School');
    for (const side of loadAdmins) assert.equal((await switchActivity(side, p.load.id, true)).status, 303, 'activity on again in the load space');
    t.diagnostic(`AT-6.4 reads against W6-1b-main ${BASE_SHA.slice(0, 7)}:\n${lines.join('\n')}`);
    // W6-e (the load space: all 300 lessons overdue, 150 dated chapters, 75 subjects in order): Huda Test on the load learner's page.
    const path = linkedPath(p.load, loadLearnerId);
    const huda = by('Huda Test');
    const mb = await measure(p.base, huda.base, path);
    const mc = await measure(p.cand, huda.cand, path);
    // LMS redesign R1a (UX-62/UX-63 row): the learner's own block is on the to-do page.
    const own = await measure(p.cand, by('Load learner').cand, todoPath(p.load));
    const ownBlock = todoOf(own.body);
    assert.ok(ownBlock && guardianTodoOf(mc.body), 'W6-e: the learner\'s own block and the guardian block');
    // LMS wave 7 (W7-3, contract v3 addendum on PIL-285, G9.2): plus wave 7's quiz score statement.
    assert.equal(mc.reads, mb.reads + 1 + 1, `W6-e: W6-1b-main's count plus one (${mb.reads}), plus the quiz score statement`);
    assert.ok(mc.todo, 'W6-e: one to-do statement');
    const rows = p.cand.worker.sqlite.prepare(mc.todo!.sql).all(...(mc.todo!.params as (string | number | null)[])).length;
    const d1 = await onLocalD1(p.cand.worker.sqlite, mc.todo!);
    const blockBytes = Buffer.byteLength(ownBlock.block);
    // LMS redesign R1a (PIL-325, UX-1 look row): R1a replaces the shared style (its own budget is AT-R1a.6a, 48 KB), so
    // both pages are measured without it.
    const noStyle = (b: string) => Buffer.byteLength(b.replace(HEAD_STYLE, '$1$3'));
    const mbBytes = noStyle(mb.body);
    const mcBytes = noStyle(mc.body);
    const bound = mbBytes + blockBytes + 2048;
    const figures = `rows returned ${rows} (at most 30); rows read ${d1.meta.rows_read} (at most 5,000); largest bound-parameter count ${mc.maxParams} (at most 20); page without the shared style ${mcBytes} B, bound ${bound} B = W6-1b-main's page without it ${mbBytes} B + the learner's own block ${blockBytes} B + 2,048 B; reads ${mc.reads} (W6-1b-main ${mb.reads})`;
    t.diagnostic(`AT-6.4 W6-e figures: ${figures}`);
    assert.ok(typeof d1.meta.rows_read === 'number', `local D1 reports rows_read (meta: ${JSON.stringify(d1.meta)})`);
    assert.equal(d1.rows.length, rows, 'local D1 returns the same rows as the product\'s database');
    assert.ok(rows <= 30, `W6-e: at most 30 rows returned (${rows})`);
    assert.ok(Number(d1.meta.rows_read) <= 5000, `W6-e: at most 5,000 rows read (${d1.meta.rows_read})`);
    assert.ok(mc.maxParams <= 20, `W6-e: no statement has more than 20 bound parameters (${mc.maxParams})`);
    assert.ok(mcBytes <= bound, `W6-e: the page without the shared style at most ${bound} B (${mcBytes})`);
  });
});
