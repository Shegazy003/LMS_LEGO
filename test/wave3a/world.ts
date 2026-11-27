// The made-up world of LMS wave 3a, task W3a-1 (product-contract v2 on PIL-216,
// section 3, "Test-world additions"): the wave 1 world (test/wave1/world.ts)
// plus
// - W-a: Rami Test (rami.w3a), a publisher in Mesk School whose only subject,
//   "Chemistry", is unpublished (UX-23) — in every copy;
// - W-b: a separate copy in which Physics is published and assigned to the
//   group Science, so Omar C has it (AT-2.4);
// - W-c: a separate copy with four more published subjects (AT-5.4).
// Made-up names and data only.
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { utcDatePlusDays, type Client } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import type { Lang } from '../../src/labels.ts';
import { G1 } from '../at9/world.ts';
import { ADMIN, SALMA, wave1World, words, type SpaceIds, type Wave1World } from '../wave1/world.ts';

export * from '../wave1/world.ts';

/** Mona, a made-up guardian linked to Salma (AT-1.4). */
export const MONA = G1;
export const RAMI = { display_name: 'Rami Test', username: 'rami.w3a', password: 'rami-wave3a-pass', role: 'publisher' as const, mobile: '01077778888' };

/** The four extra subjects of W-c, by title (made up). */
export const EXTRA_SUBJECTS = ['Art studio', 'Biology basics', 'Geography walk', 'History stories'];

export type Variant = 'as-is' | 'physics-published' | 'more-subjects';

export interface Wave3aWorld extends Wave1World {
  chemistry: string;
}

/** The wave 1 world with W-a, and W-b or W-c when asked for. */
export async function wave3aWorld(variant: Variant = 'as-is'): Promise<Wave3aWorld> {
  const w = await wave1World();
  try {
    const until = utcDatePlusDays(30);
    const s = await seed(w.p.url, {
      spaceId: w.school.id,
      grantedBy: ADMIN.username,
      people: [{ ...RAMI, valid_until: until }, { ...G1, valid_until: until }],
      links: [{ guardian: G1.username, learner: SALMA.username }],
      subjects: [
        { title: 'Chemistry', publisher: RAMI.username, published: false, chapters: [{ title: 'Atoms', lessons: [{ title: 'What is an atom' }] }] },
        ...(variant === 'more-subjects'
          ? EXTRA_SUBJECTS.map((title) => ({
            title, published: true, groups: ['Science'], chapters: [{ title: 'Start', lessons: [{ title: `${title}: first lesson` }] }],
          }))
          : []),
      ],
    });
    if (variant === 'physics-published') await physicsPublished(w);
    return { ...w, chemistry: s.subjects.Chemistry.id };
  } catch (err) {
    await w.close();
    throw err;
  }
}

/** W-b: Physics published and assigned to the group Science (Salma and Omar C).
 * AT-2.4 compares whole documents, ids included, so it applies W-b to the same
 * world after taking the previews "as is": the same content and ids as a
 * separate copy, which a second product would give new ids. */
export async function physicsPublished(w: Wave1World): Promise<void> {
  await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${w.school.physics}'`);
  const group = await w.p.sql(`SELECT id FROM "group" WHERE space_id = '${w.school.id}' AND name = 'Science'`);
  assert.equal(group.length, 1, 'group Science');
  await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, group_id) VALUES ('w3a-physics-science', '${w.school.id}', '${w.school.physics}', '${group[0].id}')`);
}

/** A learner page as a fresh browser gets it: the session only, no notice cookie (AT-2.1, "fresh browser"). */
export async function fresh(c: Client, path: string): Promise<Response> {
  return c.getWith(path, { cookie: `lms_session=${c.cookie('lms_session')}` });
}

// ------------------------------------------------------------- addresses ----

export type From = 'home' | `topic:${string}` | `subject:${string}` | `lesson:${string}`;

const withFrom = (path: string, from?: From) => (from ? `${path}${path.includes('?') ? '&' : '?'}from=${encodeURIComponent(from)}` : path);
export const previewHome = (s: { id: string }, from?: From) => withFrom(`/s/${s.id}/preview`, from);
export const previewSubject = (s: { id: string }, subjectId: string, open?: string, from?: From) =>
  withFrom(`/s/${s.id}/preview/learn/${subjectId}${open ? `?open=${open}` : ''}`, from);
export const previewLesson = (s: { id: string }, lessonId: string, from?: From) => withFrom(`/s/${s.id}/preview/read/${lessonId}`, from);
export const previewResults = (s: { id: string }, from?: From) => withFrom(`/s/${s.id}/preview/results`, from);
export const ownerPreview = (s: { id: string }) => `/owner/spaces/${s.id}/preview`;
export const ownerPreviewResults = (s: { id: string }) => `/owner/spaces/${s.id}/preview/results`;

// ----------------------------------------------------------------- words ----

/** The value of a ui.ts key in a language and kit (School unless stated), kit words and {name} values filled in. */
export function word(lang: Lang, key: Parameters<ReturnType<typeof words>>[0], vars: Record<string, string> = {}, kit: SpaceIds['kit'] = 'school'): string {
  return words(kit, lang)(key, vars);
}

// --------------------------------------------------------- normalising ----
// Section 7.3 of the contract: the closed list of edits N1 to N6, on the whole
// document. Nothing else is edited. Each edit is done on the HTML text the
// server sent, element by element, so what is compared is exactly what a
// browser receives.

/** The outer HTML of the element whose opening tag matches `open`, with its matching close (same tag name, nesting counted). */
export function element(doc: string, open: RegExp): { start: number; end: number; html: string } | null {
  const m = open.exec(doc);
  if (!m) return null;
  const start = m.index;
  const tag = /^<([a-zA-Z0-9]+)/.exec(m[0])![1].toLowerCase();
  if (/\/>$/.test(m[0]) || ['img', 'input', 'br', 'meta', 'link'].includes(tag)) return { start, end: start + m[0].length, html: m[0] };
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start + m[0].length;
  let depth = 1;
  for (let t = re.exec(doc); t; t = re.exec(doc)) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return { start, end: t.index + t[0].length, html: doc.slice(start, t.index + t[0].length) };
  }
  return null;
}

const byId = (id: string) => new RegExp(`<[a-zA-Z0-9]+\\b[^>]*\\bid="${id}"[^>]*>`);
const brand = /<a\b[^>]*\bclass="brand"[^>]*>/;

function cut(doc: string, open: RegExp): string {
  const e = element(doc, open);
  return e ? doc.slice(0, e.start) + doc.slice(e.end) : doc;
}

function replace(doc: string, open: RegExp, token: string): string {
  const e = element(doc, open);
  assert.ok(e, `element ${open} is in the document`);
  return doc.slice(0, e.start) + token + doc.slice(e.end);
}

/** Visible text of an HTML fragment. */
export function textOfHtml(fragment: string): string {
  return fragment.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** The four controls of section 6.3, each found by its own place in the page,
 * and (LMS wave 2, contract on PIL-225 section 11 item 3) the done block's control. */
export const CONTROLS = [
  { kind: 'brand', open: brand },
  { kind: 'sign-out', open: byId('signout') },
  { kind: 'my-account', open: byId('nav-account') },
  { kind: 'got-it', open: byId('notice-fold') },
  { kind: 'done', open: byId('done-control') },
  // LMS redesign R1a (S9, UX-98): the due strip's "see all" leads to the to-do page, which a preview does not have.
  { kind: 'see-all', open: byId('todo-all') },
] as const;

/** UX-19 / N4: in the preview, a control has aria-disabled, the reason as description, no address and no form action, and stays focusable. */
export function assertInert(html: string, kind: string): void {
  const opening = /^<[^>]+>/.exec(html)![0];
  assert.ok(!/\bhref=/.test(html), `${kind}: no href`);
  assert.ok(!/\baction=/.test(html) && !/<form\b/.test(html), `${kind}: no form or action`);
  assert.ok(/aria-disabled="true"/.test(html), `${kind}: aria-disabled="true"`);
  assert.ok(/aria-describedby="preview-reason"/.test(html), `${kind}: described by the reason sentence`);
  const focusable = /<button\b/.test(html) || /tabindex="0"/.test(opening);
  assert.ok(focusable, `${kind}: stays focusable`);
}

export interface Normalise {
  lang: Lang;
  /** The kit's learner word in this language (N3). */
  learnerWord: string;
  /** N6: the previewer is a publisher or the owner. */
  noNotice?: boolean;
  /** The owner's preview (N2: /owner/spaces/<space>/preview becomes /s/<space>). */
  owner?: boolean;
}

function hrefsOf(doc: string, edit: (href: string) => string): string {
  return doc.replace(/\bhref="([^"]*)"/g, (_, h: string) => `href="${edit(h.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}"`);
}

/** N2: the preview address back to the learner's, and no `from`. */
export function learnerHref(href: string): string {
  let h = href.replace(/^\/owner\/spaces\/([^/?#]+)\/preview/, '/s/$1').replace(/^(\/s\/[^/?#]+)\/preview(?=[/?#]|$)/, '$1');
  const hash = h.indexOf('#');
  const anchor = hash >= 0 ? h.slice(hash) : '';
  if (hash >= 0) h = h.slice(0, hash);
  const q = h.indexOf('?');
  if (q >= 0) {
    const kept = h.slice(q + 1).split('&').filter((p) => p && !p.startsWith('from='));
    h = h.slice(0, q) + (kept.length ? `?${kept.join('&')}` : '');
  }
  return h + anchor;
}

/** N1 to N5 on a preview document (N6 on the learner's is separate). */
export function normalisePreview(doc: string, n: Normalise): string {
  let d = cut(doc, byId('preview-banner'));
  d = cut(d, byId('preview-end'));
  d = hrefsOf(d, learnerHref);
  const greeting = element(d, byId('greeting'));
  if (greeting) {
    assert.equal(textOfHtml(greeting.html), word(n.lang, 'welcome', { name: n.learnerWord }), 'N3: the greeting names the learner word');
    d = d.slice(0, greeting.start) + '[greeting]' + d.slice(greeting.end);
  }
  for (const c of CONTROLS) {
    const e = element(d, c.open);
    if (!e) continue;
    assertInert(e.html, c.kind);
    d = d.slice(0, e.start) + `[control ${c.kind} "${textOfHtml(e.html)}"]` + d.slice(e.end);
  }
  const prefix = `${word(n.lang, 'previewTitlePrefix')} · `;
  assert.ok(d.includes(`<title>${prefix}`), `N5: the title starts with "${prefix}"`);
  d = d.replace(`<title>${prefix}`, '<title>');
  if (n.noNotice) assert.ok(!/id="notice-(card|line)"/.test(d), 'N6: no notice in the preview');
  return d;
}

/** N3, N4 and N6 on the learner's document. */
export function normaliseLearner(doc: string, n: Normalise): string {
  let d = doc;
  const greeting = element(d, byId('greeting'));
  if (greeting) d = d.slice(0, greeting.start) + '[greeting]' + d.slice(greeting.end);
  for (const c of CONTROLS) {
    const e = element(d, c.open);
    if (!e) continue;
    d = d.slice(0, e.start) + `[control ${c.kind} "${textOfHtml(e.html)}"]` + d.slice(e.end);
  }
  if (n.noNotice) {
    d = cut(d, byId('notice-card'));
    d = cut(d, byId('notice-line'));
  }
  // LMS redesign R1a (S9, UX-96): My subjects and To do are not previewable, so the preview's navigation keeps
  // wave 3a's items; the learner's two new items leave the comparison (the rest of the nav is compared as is).
  d = cut(d, byId('nav-subjects'));
  d = cut(d, byId('nav-todo'));
  // LMS redesign R1a (UX-99, as UX-31): no ring or progress in a preview; the learner's decorative ring leaves the comparison.
  d = d.replace(/<span class="ring" aria-hidden="true">[\s\S]*?<\/span>/g, '');
  return d;
}

/** Fails with the first differing line of two documents. */
export function assertSameDocument(preview: string, learner: string, what: string): void {
  if (preview === learner) return;
  const a = preview.split('\n');
  const b = learner.split('\n');
  const i = a.findIndex((line, k) => line !== b[k]);
  const at = i < 0 ? Math.min(a.length, b.length) : i;
  assert.fail(`${what}: first difference at line ${at + 1}\npreview: ${a[at] ?? '(end)'}\nlearner: ${b[at] ?? '(end)'}`);
}

// --------------------------------------------------------------- browser ----

/** The preview banner's visible lines (UX-18 order). */
export async function bannerLines(page: Page): Promise<string[]> {
  return page.locator('#preview-banner [data-line]').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
}

