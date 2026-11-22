// LMS wave 7, W7-3 (product-contract v3 addendum on PIL-285, G6, with the v4
// amendment on PIL-295): the test worlds of the guardian's quiz scores and the
// admin's scores page, and the readers of the guardian block. Made-up data only.
// - W7-g (on W7-a): Salma sends QA (1 of 3), Omar C QA (3 of 3), Karim Test QG
//   (1 of 1), Hala Test QA (3 of 3), Rana Test QA (2 of 3), every one through the
//   learner's take page; Sami Test (guardian of Salma and Omar C), Nabil Test
//   (guardian of Karim Test), Hala Test (learner of Mathematics and guardian of
//   Salma), Rana Test made an admin of Mesk School after her sending; Salma sends
//   one quiz of the Company space's Mathematics (1 of 1), which Mesk never shows.
import assert from 'node:assert/strict';
import { utcDatePlusDays, type Client } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import { ADMIN, AT, KARIM5, OMAR, RANA5, SALMA, W7A, as, clockAt, fixed, insertQuiz, pinnable, words, type Wave1World } from './world.ts';
import { sending, takePath } from './learner.ts';

export const SAMI7 = { display_name: 'Sami Test', username: 'sami.w7', password: 'sami-wave7-pass', role: 'guardian' as const, mobile: '01071710011' };
export const NABIL7 = { display_name: 'Nabil Test', username: 'nabil.w7', password: 'nabil-wave7-pass', role: 'guardian' as const, mobile: '01071710012' };
export const HALA7 = { display_name: 'Hala Test', username: 'hala.w7', password: 'hala-wave7-pass', role: 'learner' as const, mobile: '01071710013' };

/** The quiz of the Company space that Salma sends (never shown in Mesk). */
export const QZ = 'w7g-qz';
export const QZ_TITLE = 'Delta quiz W7';

/** The answers of QA by verdict per question ('right', 'wrong' or none), as the take page posts them. */
const QA_RIGHT = ['qa-one-b', 'qa-two-d', 'qa-three-a'];
const QA_WRONG = ['qa-one-a', 'qa-two-a', 'qa-three-b'];
export function qaPicks(verdicts: ('right' | 'wrong' | null)[]): Record<string, string> {
  const ids = ['qa-one', 'qa-two', 'qa-three'];
  return Object.fromEntries(verdicts.flatMap((v, i) => (v ? [[ids[i], (v === 'right' ? QA_RIGHT : QA_WRONG)[i]]] : [])));
}

/** A sending through the learner's take page (303 to the result page). */
export async function send(c: Client, s: { id: string }, quiz: string, picks: Record<string, string>, rev = 0): Promise<void> {
  const res = await c.post(takePath(s, quiz), sending(rev, picks));
  assert.equal(res.status, 303, `sending ${quiz}`);
  await res.arrayBuffer();
}

export interface W7g { sami: string; nabil: string; hala: string; rana: string; salma: string; omar: string; karim: string; group: string }

/** W7-g on the wave 7 world (W7-a, no W7-b). With `attempts: false` the same people, links and roles, and no attempt
 * (AT-8.3's world). */
export async function withW7g(w: Wave1World, opts: { attempts?: boolean } = {}): Promise<W7g> {
  const sending = opts.attempts ?? true;
  const s = w.school;
  const until = utcDatePlusDays(60);
  const seeded = await seed(w.p.url, {
    spaceId: s.id, grantedBy: ADMIN.username,
    people: [{ ...SAMI7, valid_until: until }, { ...NABIL7, valid_until: until }, { ...HALA7, valid_until: until }],
    memberships: [{ username: HALA7.username, role: 'guardian', valid_until: until }],
    links: [
      { guardian: SAMI7.username, learner: SALMA.username }, { guardian: SAMI7.username, learner: OMAR.username },
      { guardian: NABIL7.username, learner: KARIM5.username }, { guardian: HALA7.username, learner: SALMA.username },
    ],
  });
  for (const p of [SAMI7, NABIL7, HALA7]) w.ids[p.username] = seeded.users[p.username];
  for (const p of [KARIM5, RANA5]) if (!w.ids[p.username]) w.ids[p.username] = String((await w.p.sql(`SELECT id FROM user WHERE username = '${p.username}'`))[0].id);
  const hala = w.ids[HALA7.username];
  const rana = w.ids[RANA5.username];
  await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w7g-hala', '${s.id}', '${s.math}', '${hala}')`);
  const ranaReads = await w.p.sql(`SELECT 1 AS one FROM subject_access a WHERE a.space_id = '${s.id}' AND a.subject_id = '${s.math}' AND (a.user_id = '${rana}' OR a.group_id IN (SELECT gm.group_id FROM group_member gm WHERE gm.space_id = '${s.id}' AND gm.user_id = '${rana}'))`);
  if (!ranaReads.length) await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w7g-rana', '${s.id}', '${s.math}', '${rana}')`);
  await pinnable(w);
  // The sendings, through the take page.
  if (sending) {
    await send(await as(w, SALMA, 'en'), s, W7A.QA, qaPicks(['right', 'wrong', null]));
    await send(await as(w, OMAR, 'en'), s, W7A.QA, qaPicks(['right', 'right', 'right']));
    await send(await as(w, KARIM5, 'en'), s, W7A.QG, { 'qg-one': 'qg-one-a' });
    await send(await as(w, HALA7, 'en'), s, W7A.QA, qaPicks(['right', 'right', 'right']));
    await send(await as(w, RANA5, 'en'), s, W7A.QA, qaPicks(['right', 'right', 'wrong']));
  }
  // [B] Rana Test becomes an admin of Mesk School too (after her sending, which only a learner can make).
  const admin = String((await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
  await w.p.sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES ('w7g-rana-admin', '${s.id}', '${rana}', 'admin', '2026-01-01', '${until}', '${admin}')`);
  // Salma in a second space: the Company space's Mathematics has QZ, which she sends (1 of 1).
  await insertQuiz((q) => w.p.sql(q), { id: QZ, space: w.company.id, subject: w.company.math, title: QZ_TITLE, questions: [fixed('qz-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 3_000_000 });
  if (sending) await send(await as(w, SALMA, 'en'), w.company, QZ, { 'qz-one': 'qz-one-a' });
  const group = String((await w.p.sql(`SELECT id FROM "group" WHERE space_id = '${s.id}' AND name = 'Science'`))[0].id);
  await pinnable(w);
  return { sami: w.ids[SAMI7.username], nabil: w.ids[NABIL7.username], hala, rana, salma: w.ids[SALMA.username], omar: w.ids[OMAR.username], karim: w.ids[KARIM5.username], group };
}

/** Moves the fixed clock (a later sending sorts first), then back with `clockAt(w, AT.noon)`. */
export const clockTo = (w: Wave1World, ms: number) => clockAt(w, ms);

// ------------------------------------------------------- the guardian block ----

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (fragment: string) => unescape(fragment.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** The outer HTML of the element `<tag id="id" …>` … its matching end tag, with its start index, or null. */
export function elementById(page: string, id: string): { html: string; at: number } | null {
  const start = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"`).exec(page);
  if (!start) return null;
  const tag = start[1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = start.index + 1;
  let depth = 1;
  for (let m = re.exec(page); m; m = re.exec(page)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return { html: page.slice(start.index, m.index + m[0].length), at: start.index };
  }
  return null;
}

/** The page with one element (by id) taken out, or the page as it is. */
export function withoutElement(page: string, id: string): string {
  const e = elementById(page, id);
  return e ? page.slice(0, e.at) + page.slice(e.at + e.html.length) : page;
}

export interface QuizItem { title: string; line: string }

/** The guardian quiz block (UX-83), read: heading, note, the shown items, the fold (its summary, items, capped line). */
export function guardianQuizOf(page: string) {
  const e = elementById(page, 'quiz-guardian');
  if (!e) return null;
  const items = (fragment: string): QuizItem[] => [...fragment.matchAll(/<li><bdi>([\s\S]*?)<\/bdi> <span class="muted quiz-guardian-line">([\s\S]*?)<\/span><\/li>/g)].map((m) => ({ title: unescape(m[1]), line: textOf(m[2]) }));
  const fold = /<details class="quiz-guardian-more">([\s\S]*?)<\/details>/.exec(e.html);
  const shownPart = fold ? e.html.slice(0, e.html.indexOf('<details')) : e.html;
  return {
    html: e.html, at: e.at,
    heading: textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(e.html)?.[1] ?? ''),
    note: textOf(/<p class="muted">([\s\S]*?)<\/p>/.exec(e.html)?.[1] ?? ''),
    shown: items(shownPart),
    fold: fold ? {
      open: /<details class="quiz-guardian-more" open/.test(e.html),
      summary: textOf(/<summary>([\s\S]*?)<\/summary>/.exec(fold[1])?.[1] ?? ''),
      items: items(fold[1]),
      capped: textOf(/<p class="quiz-guardian-capped">([\s\S]*?)<\/p>/.exec(fold[1])?.[1] ?? '') || null,
    } : null,
  };
}

/** Every drawn item of the block, in order (shown, then folded). */
export const drawnOf = (b: NonNullable<ReturnType<typeof guardianQuizOf>>) => [...b.shown, ...(b.fold?.items ?? [])];

// ----------------------------------------------------------- a DOM tree ----
// The page scans of W7-3 (AT-7.8, AT-8.2, AT-9.8) parse the HTML into a tree: elements with their attributes, text nodes and
// comments, entities decoded; void elements and raw text (script, style) as the HTML rules say.

export interface DomText { kind: 'text'; text: string }
export interface DomComment { kind: 'comment'; text: string }
export interface DomElement { kind: 'element'; tag: string; attrs: [string, string][]; children: DomNode[] }
export type DomNode = DomText | DomComment | DomElement;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#[0-9]+|lt|gt|quot|apos|amp|nbsp);/gi, (_, e: string) => {
  const k = e.toLowerCase();
  if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
  if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
  return ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ' } as Record<string, string>)[k];
});

/** The tree of an HTML text (a root element named '#root'). Unclosed elements close at their parent's end. */
export function domOf(source: string): DomElement {
  const root: DomElement = { kind: 'element', tag: '#root', attrs: [], children: [] };
  const stack: DomElement[] = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end;
      top().children.push({ kind: 'comment', text: source.slice(i + 4, stop) });
      i = stop + 3;
    } else if (/^<!/i.test(source.slice(i, i + 2))) {
      i = source.indexOf('>', i) + 1 || source.length;
    } else if (/^<\/[a-zA-Z]/.test(source.slice(i, i + 3))) {
      const m = /^<\/([a-zA-Z0-9-]+)[^>]*>/.exec(source.slice(i))!;
      const tag = m[1].toLowerCase();
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i += m[0].length;
    } else if (/^<[a-zA-Z]/.test(source.slice(i, i + 2))) {
      const m = /^<([a-zA-Z0-9-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(source.slice(i));
      if (!m) {
        top().children.push({ kind: 'text', text: '<' });
        i++;
        continue;
      }
      const tag = m[1].toLowerCase();
      const attrs: [string, string][] = [...m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((a) => [a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      const el: DomElement = { kind: 'element', tag, attrs, children: [] };
      top().children.push(el);
      i += m[0].length;
      if (RAW.has(tag)) {
        const end = source.toLowerCase().indexOf(`</${tag}`, i);
        const stop = end < 0 ? source.length : end;
        if (stop > i) el.children.push({ kind: 'text', text: tag === 'textarea' || tag === 'title' ? decode(source.slice(i, stop)) : source.slice(i, stop) });
        i = stop;
        if (end >= 0) i = source.indexOf('>', end) + 1;
      } else if (!VOID.has(tag) && !m[3]) {
        stack.push(el);
      }
    } else {
      const next = source.indexOf('<', i + 1);
      const stop = next < 0 ? source.length : next;
      top().children.push({ kind: 'text', text: decode(source.slice(i, stop)) });
      i = stop;
    }
  }
  return root;
}

/** Every node of a tree, depth first (the root itself not included). */
export function* nodesOf(e: DomElement): Generator<DomNode> {
  for (const c of e.children) {
    yield c;
    if (c.kind === 'element') yield* nodesOf(c);
  }
}
export const attrOf = (e: DomElement, name: string) => e.attrs.find(([k]) => k === name)?.[1] ?? null;
/** The first element with this id, or null. */
export function byId(e: DomElement, id: string): DomElement | null {
  for (const n of nodesOf(e)) if (n.kind === 'element' && attrOf(n, 'id') === id) return n;
  return null;
}
/** All text of an element, joined. */
export const textIn = (e: DomElement): string => [...nodesOf(e)].map((n) => (n.kind === 'text' ? n.text : '')).join('');
/** A tree with every element of these ids taken out (AT-8.2's "with the element removed"). */
export function dropIds(e: DomElement, ids: string[]): DomElement {
  return { ...e, children: e.children.filter((c) => !(c.kind === 'element' && ids.includes(attrOf(c, 'id') ?? ''))).map((c) => (c.kind === 'element' ? dropIds(c, ids) : c)) };
}

/** AT-8.2 inside the block, an allow-list on the tree: the elements, the attributes and every text node. Empty when it holds.
 * `titles` are the listed quizzes' titles (each allowed only as the first <bdi> of its own li); `lines` the filled lines. */
export function quizAllowListProblems(block: DomElement, allowed: { texts: string[]; titles: string[]; lines: string[] }): string[] {
  const out: string[] = [];
  const ELEMENTS = new Set(['section', 'h2', 'p', 'ul', 'li', 'details', 'summary', 'bdi', 'span']);
  const titles = [...allowed.titles];
  const lines = [...allowed.lines];
  const take = (pool: string[], text: string, what: string) => {
    const at = pool.indexOf(text);
    if (at < 0) out.push(`${what}: ${JSON.stringify(text)}`);
    else pool.splice(at, 1);
  };
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  /** Tags and attributes everywhere; comments are refused. */
  const shape = (e: DomElement) => {
    if (!ELEMENTS.has(e.tag)) out.push(`element <${e.tag}>`);
    for (const [k] of e.attrs) if (!['id', 'class', 'dir'].includes(k)) out.push(`attribute ${k} on <${e.tag}>`);
    for (const c of e.children) {
      if (c.kind === 'comment') out.push(`a comment: ${JSON.stringify(c.text)}`);
      else if (c.kind === 'element') shape(c);
    }
  };
  shape(block);
  /** Text: each heading, note, summary or capped line is one allowed value as a whole; in an item, its first <bdi> is one
   * listed quiz title and its line one listed attempt's line; no other text node anywhere. */
  const texts = (e: DomElement) => {
    for (const c of e.children) {
      if (c.kind === 'text') {
        if (c.text.trim()) out.push(`unexpected text ${JSON.stringify(c.text)} in <${e.tag}>`);
      } else if (c.kind === 'element') {
        if (['h2', 'p', 'summary'].includes(c.tag)) {
          if (!allowed.texts.includes(flat(textIn(c)))) out.push(`unexpected text ${JSON.stringify(flat(textIn(c)))} in <${c.tag}>`);
        } else if (c.tag === 'li') {
          const els = c.children.filter((x): x is DomElement => x.kind === 'element');
          if (els.length !== 2 || els[0].tag !== 'bdi' || els[1].tag !== 'span') out.push(`an item that is not <bdi> then <span>: ${JSON.stringify(flat(textIn(c)))}`);
          for (const x of c.children) if (x.kind === 'text' && x.text.trim()) out.push(`unexpected text ${JSON.stringify(x.text)} in <li>`);
          if (els[0]) take(titles, textIn(els[0]), 'a <bdi> title that is not a listed quiz\'s');
          if (els[1]) take(lines, flat(textIn(els[1])), 'a line that is not a listed attempt\'s');
        } else texts(c);
      }
    }
  };
  texts(block);
  if (titles.length) out.push(`titles not drawn: ${JSON.stringify(titles)}`);
  if (lines.length) out.push(`lines not drawn: ${JSON.stringify(lines)}`);
  return out;
}

/** AT-8.2's allowed texts for a block: the heading (the name in its <bdi>), the note, the fold and capped lines, and the
 * items (quiz title, subject title, score, total). */
export function guardianAllowed(lang: 'ar' | 'en', name: string, items: [string, string, number, number][], more?: number, capped?: number) {
  const t = words('school', lang);
  const heading = t('guardianQuizTitle', { name: '\u0000' }).split('\u0000');
  return {
    texts: [...heading.map((x) => x.trim()).filter(Boolean), heading.join(name).trim(), name, t('guardianQuizNote'), ...(more ? [t('guardianQuizMore', { n: String(more) })] : []), ...(capped ? [t('guardianQuizCapped', { n: String(capped) })] : [])],
    titles: items.map(([q]) => q),
    lines: items.map(([, s, n, m]) => t('guardianQuizLine', { subjectTitle: s, score: String(n), total: String(m) })),
  };
}

// ------------------------------------------------------------------ W7-h ----

export interface W7h { subjects: string[]; h1: string; quizzes: { id: string; title: string; subject: string; sentAt: number }[]; learners: string[] }

/** W7-h (rows written directly): 20 published subjects H1..H20 of Mesk School with 25 quizzes each, all assigned to Salma,
 * who has an attempt on all 500 (1 of 1, sent one second apart, H1's first); in H1, 19 more made-up learners have an
 * attempt on each of its 25 quizzes (500 attempts in H1). */
export async function withW7h(w: Wave1World): Promise<W7h> {
  const s = w.school;
  const sql = (q: string) => w.p.sql(q);
  const salma = w.ids[SALMA.username];
  const admin = String((await sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
  const subjects: string[] = [];
  const quizzes: W7h['quizzes'] = [];
  const question = (id: string) => [fixed(`${id}-one`, 'Heavy question.', ['Yes', 'No'], 1)];
  for (let k = 0; k < 20; k++) {
    const id = `w7h-s${String(k + 1).padStart(2, '0')}`;
    await sql(`INSERT INTO subject (id, space_id, title, is_published) VALUES ('${id}', '${s.id}', 'Heavy subject ${String(k + 1).padStart(2, '0')}', 1)`);
    await sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('${id}-salma', '${s.id}', '${id}', '${salma}')`);
    subjects.push(id);
    const rows: string[] = [];
    for (let j = 0; j < 25; j++) {
      const qid = `${id}-q${String(j + 1).padStart(2, '0')}`;
      const n = k * 25 + j;
      const title = `Heavy quiz ${String(n + 1).padStart(3, '0')}`;
      await insertQuiz(sql, { id: qid, space: s.id, subject: id, title, questions: question(qid), state: 'open', created: AT.noon - 5_000_000 + n });
      const sentAt = AT.noon - 4_000_000 + n * 1000;
      quizzes.push({ id: qid, title, subject: `Heavy subject ${String(k + 1).padStart(2, '0')}`, sentAt });
      rows.push(`('w7h-${qid}-salma', '${s.id}', '${qid}', '${salma}', 0, '{"${qid}-one":"${qid}-one-a"}', '1', 1, 1, ${sentAt})`);
    }
    await sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ${rows.join(', ')}`);
  }
  const h1 = subjects[0];
  const learners = Array.from({ length: 19 }, (_, i) => `w7h-learner-${String(i + 1).padStart(2, '0')}`);
  await sql(`INSERT INTO user (id, username, password_hash, display_name, mobile, created_at) VALUES ${learners.map((id, i) => `('${id}', '${id}', 'pbkdf2-sha256$1$none$none', 'Heavy Learner ${String(i + 1).padStart(2, '0')}', '+2010710${String(i).padStart(5, '0')}', 1)`).join(', ')}`);
  await sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES ${learners.map((id) => `('m-${id}', '${s.id}', '${id}', 'learner', '2026-01-01', '${utcDatePlusDays(400)}', '${admin}')`).join(', ')}`);
  await sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ${learners.map((id) => `('${id}-h1', '${s.id}', '${h1}', '${id}')`).join(', ')}`);
  for (const q of quizzes.filter((x) => x.id.startsWith(h1))) {
    await sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ${learners.map((l) => `('w7h-${q.id}-${l}', '${s.id}', '${q.id}', '${l}', 0, '{"${q.id}-one":"${q.id}-one-b"}', '0', 0, 1, ${q.sentAt})`).join(', ')}`);
  }
  await pinnable(w);
  return { subjects, h1, quizzes, learners };
}
