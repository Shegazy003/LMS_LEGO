// The made-up world of LMS wave 5, announcements (product-contract v2 on
// PIL-246, section 3, "Test-world additions"): the wave 4 world (test/wave4/
// world.ts: waves 1 to 4, with Mona, Rami and Nile Test Space), plus
// - W5-b: Nile Test Space (W4-a) with one announcement on its subject;
// - W5-c: the test clock (src/clock.ts through /__test/clock) for posts a few
//   seconds apart, and rows dated days ago written directly.
// (W5-a and W5-d are the learner side's, in W5-1b.) Every step name starts with
// "W5 " and its label, or with the UX id, so CI shows one step per labelled
// expectation. The wave-5 CI job runs the product in this process
// (LMS_TEST_RUNTIME=in-process, as wave-3a and wave-4), so the statement spy is
// available. Made-up data only.
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { ADMIN, HADEER, as, editorPath, plain, topicPath, withNile4, words, type Nile, type Wave1World } from '../wave4/world.ts';
import type { Lang } from '../../src/labels.ts';

export * from '../wave4/world.ts';

// -------------------------------------------------------------- addresses ----

/** The post addresses of a subject's card (AT-1.1): the editor's and the subject admin page's. */
export const publisherAnn = (s: { id: string }, subjectId: string) => `${editorPath(s, subjectId)}/announcements`;
export const adminAnn = (s: { id: string }, subjectId: string) => `${topicPath(s, subjectId)}/announcements`;

/** The row of an announcement as stored. */
export interface AnnRow {
  id: string;
  space_id: string;
  subject_id: string;
  body: string;
  author_role: string;
  created_at: string;
  edited_at: string | null;
  removed_at: string | null;
}

/** Every announcement row, oldest first (by posting time, then id). */
export async function annRows(w: Wave1World): Promise<AnnRow[]> {
  return (await w.p.sql('SELECT * FROM announcement ORDER BY created_at, id')) as unknown as AnnRow[];
}

/** Every row as one comparable text (for "nothing stored or changed"). */
export const annSnapshot = async (w: Wave1World) => JSON.stringify(await annRows(w));

/** Hadeer's and Amal's clients in one language, with the page and post address of Mathematics' card for each. */
export async function cardSides(w: Wave1World, lang: Lang = 'en') {
  const s = w.school;
  return [
    { who: 'Hadeer', role: 'publisher' as const, c: await as(w, HADEER, lang), page: editorPath(s, s.math), post: publisherAnn(s, s.math) },
    { who: 'Amal', role: 'admin' as const, c: await as(w, ADMIN, lang), page: topicPath(s, s.math), post: adminAnn(s, s.math) },
  ];
}

/** Posts a text on a card and expects the 303 back to the card. */
export async function post(c: Client, path: string, body: string): Promise<string> {
  const res = await c.post(path, { body });
  assert.equal(res.status, 303, `posted on ${path}`);
  return res.headers.get('location')!;
}

// -------------------------------------------------------- world additions ----

/** W5-b: Nile Test Space (W4-a) with one announcement on its subject, posted by Fares. */
export async function withNile5(w: Wave1World): Promise<Nile & { ann: string }> {
  const nile = await withNile4(w);
  await post(nile.fares, publisherAnn(nile, nile.subject), 'Nile field trip on Thursday.');
  const rows = await w.p.sql(`SELECT id FROM announcement WHERE space_id = '${nile.id}'`);
  assert.equal(rows.length, 1, 'W5-b: one announcement in Nile Test Space');
  return { ...nile, ann: String(rows[0].id) };
}

/** W5-c: an announcement stored directly with a given posting time (days or seconds ago), as a post then would have stored it. */
export async function storedAt(w: Wave1World, v: { space: string; subject: string; body: string; role: 'publisher' | 'admin'; at: number }): Promise<string> {
  const id = crypto.randomUUID();
  const body = v.body.replace(/'/g, "''");
  await w.p.sql(`INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at) VALUES ('${id}', '${v.space}', '${v.subject}', '${body}', '${v.role}', '${new Date(v.at).toISOString()}')`);
  return id;
}

// ------------------------------------------------------------- page reads ----

export interface CardItem {
  id: string;
  role: string;
  text: string;
  by: string;
  old: boolean;
  edit: { href: string; name: string; text: string } | null;
  remove: { href: string; name: string; text: string } | null;
}

/** The section with id="announcements" on a page (null when absent). */
export function annBlock(html: string): string | null {
  const at = html.indexOf('id="announcements"');
  if (at < 0) return null;
  const start = html.lastIndexOf('<section', at);
  return html.slice(start, html.indexOf('</section>', at) + '</section>'.length);
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function control(item: string, cls: string): CardItem['edit'] {
  const m = new RegExp(`<a class="${cls}" href="([^"]+)" aria-label="([^"]+)">([\\s\\S]*?)</a>`).exec(item);
  return m ? { href: unescape(m[1]), name: unescape(m[2]), text: plain(m[3]) } : null;
}

/** The teacher card on a page (UX-51): status line, heading, help lines, the form, the list. */
export function cardOf(html: string) {
  const block = annBlock(html);
  if (!block) return null;
  const items: CardItem[] = [...block.matchAll(/<li class="ann-item" data-ann="([^"]+)" data-role="([a-z]+)">([\s\S]*?)<\/li>/g)].map((m) => ({
    id: m[1],
    role: m[2],
    text: unescape(/<p class="ann-text" dir="auto">([\s\S]*?)<\/p>/.exec(m[3])![1]),
    by: plain(/<p class="ann-by">([\s\S]*?)<\/p>/.exec(m[3])![1]),
    old: m[3].includes('class="ann-old"'),
    edit: control(m[3], 'ann-edit'),
    remove: control(m[3], 'ann-remove'),
  }));
  const status = /<p class="ann-status [a-z]+" role="status" tabindex="-1">([\s\S]*?)<\/p>/.exec(block);
  const error = /<p id="ann-new-error" class="error ann-error">([\s\S]*?)<\/p>/.exec(block);
  return {
    block,
    status: status ? plain(status[1]) : null,
    heading: plain(/<h2>([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? ''),
    help: [...block.matchAll(/<p class="ann-help[^"]*">([\s\S]*?)<\/p>/g)].map((m) => plain(m[1])),
    empty: /<p class="ann-empty">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? null,
    action: /<form id="ann-new" class="ann-form" method="post" action="([^"]+)"/.exec(block)?.[1] ?? '',
    field: unescape(/<textarea id="ann-new-body" name="body"[^>]*>([\s\S]*?)<\/textarea>/.exec(block)?.[1] ?? ''),
    error: error ? plain(error[1]) : null,
    items,
  };
}

/** The role and date line of an item, as the page writes it (the kit's role word, the ISO date). */
export const byLine = (lang: Lang, role: 'publisher' | 'admin', iso: string, kit: 'school' | 'company' | 'university' = 'school') =>
  words(kit, lang)('annByLine', { role: words(kit, lang)(role), date: iso.slice(0, 10) });
