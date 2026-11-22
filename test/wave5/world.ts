// The made-up world of LMS wave 5, announcements (product-contract v2 on
// PIL-246, section 3, "Test-world additions"): the wave 4 world (test/wave4/
// world.ts: waves 1 to 4, with Mona, Rami and Nile Test Space), plus
// - W5-b: Nile Test Space (W4-a) with one announcement on its subject;
// - W5-c: the test clock (src/clock.ts through /__test/clock) for posts a few
//   seconds apart, and rows dated days ago written directly.
// - W5-a (Karim Test, Rana Test) and W5-d (the load world), for the learner
//   side (W5-1b).
// Every step name starts with
// "W5 " and its label, or with the UX id, so CI shows one step per labelled
// expectation. The wave-5 CI job runs the product in this process
// (LMS_TEST_RUNTIME=in-process, as wave-3a and wave-4), so the statement spy is
// available. Made-up data only.
import assert from 'node:assert/strict';
import { setClockOffsetMs, setClockTo, utcDatePlusDays, workerNow, type Client } from '../support/http.ts';
import { appointAdmin, createSpace, seed } from '../support/seed.ts';
import { ADMIN, HADEER, SHIMAA, as, editorPath, plain, topicPath, withNile4, words, type Nile, type Wave1World } from '../wave4/world.ts';
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

/** W5-a: Karim Test, a learner of Mesk School assigned only Arabic grammar; Rana Test, who gets Mathematics through the class Science only. */
export const KARIM5 = { display_name: 'Karim Test', username: 'karim.w5', password: 'karim-wave5-pass', role: 'learner' as const, mobile: '01051510001' };
export const RANA5 = { display_name: 'Rana Test', username: 'rana.w5', password: 'rana-wave5-pass', role: 'learner' as const, mobile: '01051510002' };

/** W5-a, added through the test seed and the two rows an admin's assignment and class forms write (works on main's code too). */
export async function withW5a(w: Wave1World, sql: (q: string) => Promise<Record<string, unknown>[]> = (q) => w.p.sql(q), url = w.p.url): Promise<void> {
  const s = w.school;
  const seeded = await seed(url, { spaceId: s.id, grantedBy: ADMIN.username, people: [KARIM5, RANA5].map((p) => ({ ...p, valid_until: utcDatePlusDays(30) })) });
  const karim = seeded.users[KARIM5.username];
  const rana = seeded.users[RANA5.username];
  await sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w5a-karim', '${s.id}', '${s.arabic}', '${karim}')`);
  const science = await sql(`SELECT id FROM "group" WHERE space_id = '${s.id}' AND name = 'Science'`);
  assert.equal(science.length, 1, 'the class Science');
  await sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${s.id}', '${science[0].id}', '${rana}')`);
  w.ids[KARIM5.username] = karim;
  w.ids[RANA5.username] = rana;
}

/** The AT-2 announcements, posted through the cards one minute apart (oldest first): Hadeer three and Amal one on
 * Mathematics, Shimaa one on Arabic grammar. Returns their texts, newest first per subject. */
export const AT2_MATH = ['Quiz moved to Sunday.', 'Chapter 3 is ready.\nRead it before class.', 'Bring a ruler.', 'Parents evening on Monday.'];
export const AT2_ARABIC = 'Grammar test next week.';
export async function withAt2(w: Wave1World): Promise<{ math: string[]; arabic: string }> {
  const s = w.school;
  const hadeer = await as(w, HADEER, 'en');
  const shimaa = await as(w, SHIMAA, 'en');
  // The posts stay inside the current UTC day (W6-1c, the 00:00 to 01:00 UTC flake of main b299dac run 44967311317):
  // an hour back from now, but never before today's midnight, where the same-day access grants begin; spaced one
  // minute apart, or closer in the first minutes after midnight, so the last is still no later than now.
  const nowMs = await workerNow(w.p.url);
  const dayStart = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  const t0 = Math.max(nowMs - 60 * 60_000, dayStart);
  const posts: [Client, string, string][] = [
    [hadeer, publisherAnn(s, s.math), AT2_MATH[0]],
    [hadeer, publisherAnn(s, s.math), AT2_MATH[1]],
    [hadeer, publisherAnn(s, s.math), AT2_MATH[2]],
    [w.admin, adminAnn(s, s.math), AT2_MATH[3]],
    [shimaa, publisherAnn(s, s.arabic), AT2_ARABIC],
  ];
  const step = Math.max(1, Math.min(60_000, Math.floor((nowMs - t0) / posts.length)));
  try {
    for (const [i, [c, path, body]] of posts.entries()) {
      await setClockTo(w.p.url, t0 + i * step);
      await post(c, path, body);
    }
  } finally {
    await setClockOffsetMs(w.p.url, 0);
  }
  return { math: [...AT2_MATH].reverse(), arabic: AT2_ARABIC };
}

/** W5-d: a third made-up space, "Load Test Space", with 150 published subjects all assigned to one learner, each with 2 announcements. */
export const LOAD_ADMIN = { display_name: 'Load Admin Test', username: 'load.admin.w5', password: 'load-admin-wave5-pass', mobile: '01051510010' };
export const LOAD_LEARNER = { display_name: 'Load Learner Test', username: 'load.learner.w5', password: 'load-learner-wave5-pass', role: 'learner' as const, mobile: '01051510011' };
export interface Load { id: string; subjects: string[] }
export async function withW5d(w: Wave1World, opts: { announcements?: boolean; sql?: (q: string) => Promise<Record<string, unknown>[]>; url?: string; owner?: Client } = {}): Promise<Load> {
  const sql = opts.sql ?? ((q: string) => w.p.sql(q));
  const owner = opts.owner ?? w.owner;
  const id = await createSpace(owner, { name: 'Load Test Space', kit: 'school' });
  await appointAdmin(owner, id, { ...LOAD_ADMIN, valid_until: utcDatePlusDays(60) });
  const titles = Array.from({ length: 150 }, (_, i) => `Load subject ${String(i + 1).padStart(3, '0')}`);
  const s = await seed(opts.url ?? w.p.url, {
    spaceId: id, grantedBy: LOAD_ADMIN.username,
    people: [{ ...LOAD_LEARNER, valid_until: utcDatePlusDays(30) }],
    subjects: titles.map((title) => ({ title, published: true, users: [LOAD_LEARNER.username], chapters: [{ title: 'Unit', lessons: [{ title: `${title} lesson` }] }] })),
  });
  const load = { id, subjects: titles.map((t) => s.subjects[t].id) };
  if (opts.announcements !== false) await withLoadAnnouncements(sql, load);
  return load;
}

/** The 300 announcements of W5-d (2 per subject), posted over the last 2 days. */
export async function withLoadAnnouncements(sql: (q: string) => Promise<Record<string, unknown>[]>, load: Load): Promise<void> {
  const now = Date.now();
  const rows = load.subjects.flatMap((subject, i) => [0, 1].map((k) => `('w5d-${i}-${k}', '${load.id}', '${subject}', 'Load note ${i + 1}.${k + 1}', '${k ? 'admin' : 'publisher'}', '${new Date(now - (i * 2 + k + 1) * 60_000).toISOString()}')`));
  for (let i = 0; i < rows.length; i += 50) {
    await sql(`INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at) VALUES ${rows.slice(i, i + 50).join(', ')}`);
  }
}

// ------------------------------------------------------------- page reads ----

/** One item of a learner block (UX-54, UX-55), as a reader gets it. */
export interface LearnerItem {
  /** The announcement text as shown (unescaped; the home's cut text with its "…", without the inline link). */
  text: string;
  /** The raw markup inside the text paragraph. */
  raw: string;
  by: string;
  edited: boolean;
  /** Home only: the subject link and the inline link to the whole text. */
  subject: { id: string; title: string; href: string } | null;
  full: { href: string; name: string; text: string } | null;
  dirAuto: boolean;
}

function learnerItems(fragment: string): LearnerItem[] {
  return [...fragment.matchAll(/<li class="ann-item" dir="auto"(?: data-subject="([^"]+)")?>([\s\S]*?)<\/li>/g)].map((m) => {
    const inner = m[2];
    const rawText = /<p class="ann-text" dir="auto">([\s\S]*?)<\/p>/.exec(inner)![1];
    const fullM = /<a class="ann-full" href="([^"]+)" aria-label="([^"]+)">([\s\S]*?)<\/a>/.exec(rawText);
    const subjM = /<a class="ann-where-link" href="([^"]+)"><bdi>([\s\S]*?)<\/bdi><\/a>/.exec(inner);
    const textOnly = fullM ? rawText.slice(0, fullM.index).replace(/ $/, '') : rawText;
    return {
      text: unescape(textOnly),
      raw: rawText,
      by: plain(/<p class="ann-by">([\s\S]*?)<\/p>/.exec(inner)![1]),
      edited: inner.includes('class="ann-edited"'),
      subject: subjM && m[1] ? { id: m[1], title: unescape(subjM[2]), href: unescape(subjM[1]) } : null,
      full: fullM ? { href: unescape(fullM[1]), name: unescape(fullM[2]), text: plain(fullM[3]) } : null,
      dirAuto: true,
    };
  });
}

/** The learner block on a subject page or a home (null when absent): heading, items in full, the fold. */
export function learnerBlockOf(html: string) {
  const block = annBlock(html);
  if (!block) return null;
  const foldAt = block.indexOf('<details class="ann-older">');
  const top = foldAt < 0 ? block : block.slice(0, foldAt);
  const fold = foldAt < 0 ? null : block.slice(foldAt, block.indexOf('</details>', foldAt) + '</details>'.length);
  return {
    block,
    heading: plain(/<h2 id="ann-heading">([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? ''),
    items: learnerItems(top),
    fold: fold ? { summary: plain(/<summary>([\s\S]*?)<\/summary>/.exec(fold)![1]), open: /<details class="ann-older" open/.test(fold), items: learnerItems(fold) } : null,
  };
}

/** Every text a learner block shows, in order (in full, then folded). */
export const blockTexts = (b: ReturnType<typeof learnerBlockOf>) => (b ? [...b.items, ...(b.fold?.items ?? [])].map((i) => i.text) : []);

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
