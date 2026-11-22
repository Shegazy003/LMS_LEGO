// The made-up world of LMS wave 4, task W4-1a (product-contract v2 on PIL-238,
// section 3, "Test-world additions"): the wave 2 world (test/wave2/world.ts:
// the wave 1 world with Mona, a guardian linked to Salma, and Rami), plus
// - W4-a: a second space, "Nile Test Space" (School kit), with its own admin
//   Nadia Test, publisher Fares Test and learner Lina Test, and one published
//   subject in order with two chapters of one lesson each;
// - W4-b: wave 2's W2-e (Amal and Mona also hold the learner role in Mesk
//   School, Mathematics assigned to them directly): withTwoRoles;
// - W4-c: a separate copy in which, while the setting is still off, Salma has
//   marks on Adding fractions (older) and Reading decimals (newer), and a mark
//   on Old decimals made before it was removed.
// (W4-d is AT-3's, in W4-1b.) Every step name starts with "W4 " and its label,
// or with the UX id, so CI shows one step per labelled expectation. The
// wave-4 CI job runs the product in this process (LMS_TEST_RUNTIME=in-process,
// as wave-3a), so the statement spy is available. Made-up data only.
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { appointAdmin, createSpace, seed, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { HADEER, SALMA, T1, T2, as, markClock, press, wave2World, type Wave1World } from '../wave2/world.ts';
import type { Lang } from '../../src/labels.ts';

export * from '../wave2/world.ts';

/** UX-49's deny list (whole words, diacritics ignored). LMS wave 7 (ux-plan on PIL-261, UX-77) imports this one list, so it
 * lives here rather than in test/wave4/ux.test.ts; its words are unchanged. */
export const UX49_DENY = ['توقفت', 'بدأت', 'بدأته', 'أنت', 'لك', 'عليك', 'هذا', 'هذه', 'مقفل', 'مقفلة', 'مغلقة', 'متاحة', 'السابق', 'السابقة', 'التالية', 'الجديد', 'الجديدة'];

/** A fixed instant before T1, for the mark on Old decimals made before it was removed (W4-c). */
export const T0 = Date.UTC(2031, 2, 1, 8, 0, 0, 0);

/** The wave 4 world: wave 2's, with lesson activity on when asked (AT-2: "lesson activity on throughout"). */
export async function wave4World(opts: { activity?: boolean } = {}): Promise<Wave1World> {
  const w = await wave2World();
  if (opts.activity) {
    const res = await w.admin.post(`/s/${w.school.id}/admin/activity`, { told: '1' });
    assert.equal(res.status, 303, 'lesson activity on');
  }
  return w;
}

// -------------------------------------------------------------- addresses ----

export const editorPath = (s: { id: string }, subjectId: string) => `/s/${s.id}/publish/edit/${subjectId}`;
export const topicPath = (s: { id: string }, subjectId: string) => `/s/${s.id}/admin/topics/${subjectId}`;
/** The two setting addresses (AT-1.2). */
export const publisherOrder = (s: { id: string }, subjectId: string) => `${editorPath(s, subjectId)}/order`;
export const adminOrder = (s: { id: string }, subjectId: string) => `${topicPath(s, subjectId)}/order`;

/** The stored setting of a subject (0 or 1). */
export async function stored(w: Wave1World, subjectId: string): Promise<number> {
  const rows = await w.p.sql(`SELECT chapters_in_order AS v FROM subject WHERE id = '${subjectId}'`);
  assert.equal(rows.length, 1, 'the subject exists');
  return Number(rows[0].v);
}

/** Hadeer switches Mathematics' setting through her editor's form ("Mathematics in order", AT-1.2), in a space of the world. */
export async function setOrder(w: Wave1World, on: boolean, opts: { by?: Client; space?: { id: string; math: string } } = {}): Promise<void> {
  const space = opts.space ?? w.school;
  const by = opts.by ?? (await signedIn(w.p.url, publisherOf(w, space).username, HADEER.password));
  const res = await by.post(publisherOrder(space, space.math), { state: on ? 'on' : 'off' });
  assert.equal(res.status, 303, `Mathematics ${on ? 'in order' : 'not in order'}`);
  assert.equal(await stored(w, space.math), on ? 1 : 0, 'stored');
}

/** Hadeer's username in a space of the world (she publishes Mathematics in each). */
function publisherOf(w: Wave1World, space: { id: string }): { username: string } {
  if (space.id === w.company.id) return { username: 'hadeer.trainer' };
  if (space.id === w.university.id) return { username: 'hadeer.lecturer' };
  return HADEER;
}

/** Salma's client in one language. */
export const salmaIn = (w: Wave1World, lang: Lang = 'en') => as(w, SALMA, lang);

// -------------------------------------------------------- world additions ----

/** W4-a: Nile Test Space with Nadia Test (admin), Fares Test (publisher), Lina Test (learner) and one published subject in order. */
export const NADIA = { display_name: 'Nadia Test', username: 'nadia.w4', password: 'nadia-wave4-pass', mobile: '01046460001' };
export const FARES = { display_name: 'Fares Test', username: 'fares.w4', password: 'fares-wave4-pass', role: 'publisher' as const, mobile: '01046460002' };
export const LINA4 = { display_name: 'Lina Test', username: 'lina.w4', password: 'lina-wave4-pass', role: 'learner' as const, mobile: '01046460003' };

export interface Nile {
  id: string;
  subject: string;
  lessons: Record<string, string>;
  nadia: Client;
  fares: Client;
  lina: Client;
}

export async function withNile4(w: Wave1World): Promise<Nile> {
  const id = await createSpace(w.owner, { name: 'Nile Test Space', kit: 'school' });
  await appointAdmin(w.owner, id, { ...NADIA, valid_until: utcDatePlusDays(60) });
  const s = await seed(w.p.url, {
    spaceId: id, grantedBy: NADIA.username,
    people: [FARES, LINA4].map((p) => ({ ...p, valid_until: utcDatePlusDays(30) })),
    subjects: [{
      title: 'Nile science', publisher: FARES.username, published: true, users: [LINA4.username],
      chapters: [{ title: 'Water', position: 1, lessons: [{ title: 'Water cycle' }] }, { title: 'Soil', position: 2, lessons: [{ title: 'Soil layers' }] }],
    }],
  });
  const subject = s.subjects['Nile science'];
  const nile: Nile = {
    id, subject: subject.id,
    lessons: { 'Water cycle': subject.chapters.Water.lessons['Water cycle'].id, 'Soil layers': subject.chapters.Soil.lessons['Soil layers'].id },
    nadia: await signedIn(w.p.url, NADIA.username, NADIA.password),
    fares: await signedIn(w.p.url, FARES.username, FARES.password),
    lina: await signedIn(w.p.url, LINA4.username, LINA4.password),
  };
  const res = await nile.fares.post(publisherOrder(nile, nile.subject), { state: 'on' });
  assert.equal(res.status, 303, 'Nile science in order');
  return nile;
}

/** W4-c: while the setting is off, Salma marks Adding fractions (T1) and Reading decimals (T2); her mark on Old decimals (T0) was made before it was removed. */
export async function withW4c(w: Wave1World): Promise<void> {
  const salma = await as(w, SALMA, 'en');
  for (const [title, at] of [['Adding fractions', T1], ['Reading decimals', T2]] as const) {
    await markClock(w, at);
    assert.equal((await press(salma, w.school, w.school.lessons[title], 'done')).status, 303, `${title} marked`);
  }
  await markClock(w, null);
  // Old decimals is removed in the world; its mark was made before (as a press then would have stored it).
  await w.p.sql(`INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES ('${w.school.id}', '${w.ids[SALMA.username]}', '${w.school.lessons['Old decimals']}', ${T0})`);
}

// ------------------------------------------------------------- page reads ----

/** The block of a chapter on an outline (its <details> element). */
export function chapterHtml(html: string, chapterId: string): string {
  const at = html.indexOf(`id="chapter-${chapterId}"`);
  assert.ok(at > 0, `chapter ${chapterId} on the page`);
  const start = html.lastIndexOf('<details', at);
  return html.slice(start, html.indexOf('</details>', at) + '</details>'.length);
}

/** The summary of a chapter block. */
export const summaryOf = (block: string) => block.slice(block.indexOf('<summary'), block.indexOf('</summary>') + '</summary>'.length);

/** The text of an element by id (tags removed, whitespace collapsed), or null when absent. */
export function textById(html: string, id: string, tag = '[a-z0-9]+'): string | null {
  const m = new RegExp(`<(${tag})[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!m) return null;
  const open = m.index;
  // The element ends at the matching close tag of the same name (no nesting of the same tag inside these blocks).
  const close = html.indexOf(`</${m[1]}>`, open);
  return html.slice(open, close).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/ ([.,:)])/g, '$1').replace(/\( /g, '(');
}

/** A plain page's visible text with the spacing tags leave around values removed ("Fractions ." becomes "Fractions."). */
export const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/ ([.,:)])/g, '$1').replace(/\( /g, '(').trim();

/** The text a fragment renders (inline tags add no space), without styles, decorative (aria-hidden) parts and, unless asked, hidden words. */
export function inline(fragment: string, opts: { hidden?: boolean } = {}): string {
  let s = fragment.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<span aria-hidden="true">[^<]*<\/span>/g, '');
  if (!opts.hidden) s = s.replace(/<span class="sr-only">[^<]*<\/span>/g, '');
  return s.replace(/<\/?(p|li|div|section|summary|ol|ul|h1|h2|nav)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** The lock of a chapter block or page part: its tag and its reason, as read (null when it has none). */
export function lockOf(fragment: string): { tag: string; reason: string } | null {
  const tag = /<span class="lock-tag">([\s\S]*?<\/span>)<\/span>/.exec(fragment);
  const reason = /<(?:span|p) (?:id="lock-reason" )?class="lock-reason">([\s\S]*?)<\/(?:span|p)>/.exec(fragment);
  if (!tag && !reason) return null;
  return { tag: inline(tag?.[1] ?? ''), reason: inline(reason?.[1] ?? '') };
}

/** The "Go to" link of a page: its words and where it leads (null when absent). */
export function goToOf(html: string): { text: string; href: string } | null {
  const m = /<a id="go-to" class="button go-to" href="([^"]+)">([\s\S]*?)<\/a>/.exec(html);
  return m ? { text: inline(m[2]), href: m[1].replace(/&amp;/g, '&') } : null;
}
