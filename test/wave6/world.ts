// The made-up world of LMS wave 6, due dates (product-contract v2 on PIL-257,
// section 3, "Test-world additions"): the wave 5 world (test/wave5/world.ts:
// waves 1 to 5, with Mona, Rami, Nile Test Space, Karim Test and Rana Test),
// plus
// - W6-a: in Mathematics (chapters in order off) the dated lessons and
//   chapters of the contract, past dates written directly into the rows; one
//   removed lesson; in Arabic grammar one dated lesson; Nour Test, a learner of
//   Mathematics who never marks anything;
// - W6-b: Nile Test Space (W4-a, chapters in order on) with chapter K1 (N1 due
//   D+1, N2), chapter K2 due D (N3 due D), and learner Yara Test;
// - W6-c: the fixed clock (src/clock.ts through /__test/clock-fixed) at four
//   instants; every step runs at 2026-12-10 12:00:00 UTC unless it names another.
// Every step name starts with "W6 " and its label, or with the UX id. The
// wave-6 CI job runs the product in this process (LMS_TEST_RUNTIME=in-process,
// as wave-5), so the statement spy is available. Made-up data only.
import assert from 'node:assert/strict';
import { utcDatePlusDays, type Client } from '../support/http.ts';
import { seed, signedIn } from '../support/seed.ts';
import { COMPANY_ADMIN, OMAR, SALMA, UNIVERSITY_ADMIN, activity, editorPath, topicPath, wave4World, withNile4, type Nile, type Wave1World } from '../wave5/world.ts';

export * from '../wave5/world.ts';

// ------------------------------------------------------------ W6-c clock ----

/** D, the literal winter date of the contract (Egypt is UTC+2). */
export const D = '2026-12-10';
/** D plus n days, as YYYY-MM-DD. */
export const dPlus = (n: number) => new Date(Date.parse(`${D}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The four W6-c instants. */
export const AT = {
  noon: Date.UTC(2026, 11, 10, 12, 0, 0),
  lastSecond: Date.UTC(2026, 11, 10, 23, 59, 59),
  nextDay: Date.UTC(2026, 11, 11, 0, 0, 0),
  egyptNextDay: Date.UTC(2026, 11, 10, 22, 30, 0),
} as const;

/** Pins the product's clock to one instant for every request (test builds only), or gives it back (null). */
export async function clockAt(w: Wave1World, atMs: number | null): Promise<string | null> {
  const res = await fetch(w.p.url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.p.url }, body: JSON.stringify({ atMs }) });
  assert.equal(res.status, 200, 'the fixed clock answers');
  return ((await res.json()) as { now: string; atMs: number | null }).atMs === null ? null : new Date(atMs!).toISOString();
}

// -------------------------------------------------------------- addresses ----

/** The due-dates page of a subject: the publisher's (under the editor) and the admin's (under the subject admin page). */
export const publisherDue = (s: { id: string }, subjectId: string) => `${editorPath(s, subjectId)}/due`;
export const adminDue = (s: { id: string }, subjectId: string) => `${topicPath(s, subjectId)}/due`;
/** The post address of one item's form under a due-dates page. */
export const duePost = (page: string, kind: 'lesson' | 'chapter', id: string) => `${page}/${kind}/${id}`;

/** Every due date stored (lessons and chapters), as one comparable text (for "nothing stored or changed"). */
export async function dueSnapshot(w: Wave1World): Promise<string> {
  const rows = await w.p.sql("SELECT 'chapter' AS kind, id, due_on FROM chapter WHERE due_on IS NOT NULL UNION ALL SELECT 'lesson', id, due_on FROM lesson WHERE due_on IS NOT NULL ORDER BY 1, 2");
  return JSON.stringify(rows.map((r) => [r.kind, r.id, r.due_on]));
}

/** The stored due date of one item. */
export async function dueOf(w: Wave1World, kind: 'lesson' | 'chapter', id: string): Promise<string | null> {
  const rows = await w.p.sql(`SELECT due_on FROM ${kind} WHERE id = '${id}'`);
  assert.equal(rows.length, 1, `${kind} ${id} exists`);
  return (rows[0].due_on as string | null) ?? null;
}

/** Posts one item's form and expects a 303; returns the Location. */
export async function saveDue(c: Client, page: string, kind: 'lesson' | 'chapter', id: string, dueOn: string): Promise<string> {
  const res = await c.post(duePost(page, kind, id), { due_on: dueOn });
  assert.equal(res.status, 303, `${kind} ${id}: ${JSON.stringify(dueOn)} answers 303`);
  return res.headers.get('location')!;
}

// -------------------------------------------------------------- W6-a ----

/** Nour Test (W6-a): a learner of Mathematics who never marks anything. */
export const NOUR6 = { display_name: 'Nour Test', username: 'nour.w6', password: 'nour-wave6-pass', role: 'learner' as const, mobile: '01061610001' };

/** The W6-a items: lesson and chapter ids by the contract's names. */
export interface W6a {
  L: Record<'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9', string>;
  C2: string;
  C3: string;
  /** The chapter holding L1 to L9 ("Practice"). */
  practice: string;
  G1: string;
  /** The dates W6-a writes, by name. */
  dates: Record<string, string | null>;
}

const q = (s: string) => s.replace(/'/g, "''");

/** W6-a, written directly into the rows (works on W5-main's code for every row but the dates). Mathematics: C2 = Fractions (two lessons), C3 = Empty chapter (no lesson), and a new chapter Practice with L1 to L9 (L7 removed). */
export async function withW6a(w: Wave1World, opts: { dates?: boolean } = {}): Promise<W6a> {
  const s = w.school;
  const practice = 'w6a-practice';
  await w.p.sql(`INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES ('${practice}', '${s.id}', '${s.math}', 'Practice', 80)`);
  const names = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'] as const;
  const L = {} as W6a['L'];
  for (const [i, name] of names.entries()) {
    const id = `w6a-${name.toLowerCase()}`;
    await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, position) VALUES ('${id}', '${s.id}', '${practice}', '${q(`Practice ${name}`)}', ${(i + 1) * 10})`);
    L[name] = id;
  }
  await w.p.sql(`UPDATE lesson SET removed_at = 1 WHERE id = '${L.L7}'`);
  const G1 = Object.values(s.arabicLessons)[0];
  const out: W6a = {
    L, practice, G1, C2: s.chapters.Fractions, C3: s.chapters['Empty chapter'],
    dates: { L1: dPlus(-3), L2: D, L3: dPlus(1), L8: dPlus(5), L9: dPlus(6), L4: dPlus(7), L5: dPlus(8), L6: null, C2: dPlus(2), C3: dPlus(3), L7: D, G1: D },
  };
  if (opts.dates !== false) {
    for (const [name, date] of Object.entries(out.dates)) {
      if (date === null) continue;
      const [table, id] = name.startsWith('C') ? ['chapter', name === 'C2' ? out.C2 : out.C3] : ['lesson', name === 'G1' ? G1 : L[name as keyof W6a['L']]];
      await w.p.sql(`UPDATE ${table} SET due_on = '${date}' WHERE id = '${id}'`);
    }
  }
  // Nour Test, assigned Mathematics directly.
  const seeded = await seed(w.p.url, { spaceId: s.id, grantedBy: 'amal.admin', people: [{ ...NOUR6, valid_until: utcDatePlusDays(60) }] });
  const nour = seeded.users[NOUR6.username];
  await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6a-nour', '${s.id}', '${s.math}', '${nour}')`);
  w.ids[NOUR6.username] = nour;
  await pinnable(w);
  return out;
}

/** Every membership starts on or before D, so the fixed clock (D) finds them all active whatever the real date of the run. */
export async function pinnable(w: Wave1World): Promise<void> {
  await w.p.sql("UPDATE membership SET valid_from = '2026-01-01' WHERE valid_from > '2026-01-01'");
  const late = await w.p.sql(`SELECT COUNT(*) AS n FROM membership WHERE ended_on IS NULL AND valid_until < '${dPlus(2)}'`);
  assert.equal(Number(late[0].n), 0, 'no open membership ends before D+2');
}

// -------------------------------------------------------------- W6-b ----

export const YARA6 = { display_name: 'Yara Test', username: 'yara.w6', password: 'yara-wave6-pass', role: 'learner' as const, mobile: '01061610002' };

export interface W6b extends Nile { K1: string; K2: string; N1: string; N2: string; N3: string }

/** W6-b: Nile Test Space (W4-a, in order) with K1 = Water (N1 = Water cycle due D+1, N2 = Rain, new), K2 = Soil due D (N3 = Soil layers due D); Yara Test learns it. */
export async function withW6b(w: Wave1World): Promise<W6b> {
  const nile = await withNile4(w);
  const chapters = await w.p.sql(`SELECT id, title FROM chapter WHERE space_id = '${nile.id}' ORDER BY position`);
  const K1 = String(chapters.find((c) => c.title === 'Water')!.id);
  const K2 = String(chapters.find((c) => c.title === 'Soil')!.id);
  const N2 = 'w6b-rain';
  await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, position) VALUES ('${N2}', '${nile.id}', '${K1}', 'Rain', 99)`);
  await w.p.sql(`UPDATE lesson SET due_on = '${dPlus(1)}' WHERE id = '${nile.lessons['Water cycle']}'`);
  await w.p.sql(`UPDATE chapter SET due_on = '${D}' WHERE id = '${K2}'`);
  await w.p.sql(`UPDATE lesson SET due_on = '${D}' WHERE id = '${nile.lessons['Soil layers']}'`);
  const seeded = await seed(w.p.url, { spaceId: nile.id, grantedBy: 'nadia.w4', people: [{ ...YARA6, valid_until: utcDatePlusDays(60) }] });
  await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6b-yara', '${nile.id}', '${nile.subject}', '${seeded.users[YARA6.username]}')`);
  w.ids[YARA6.username] = seeded.users[YARA6.username];
  await pinnable(w);
  return { ...nile, K1, K2, N1: nile.lessons['Water cycle'], N2, N3: nile.lessons['Soil layers'] };
}

// -------------------------------------------------------------- W6-f ----
// Contract v3 addendum on PIL-265, G5 (W6-1c): guardians of the to-do list.

export const LAILA6 = { display_name: 'Laila Test', username: 'laila.w6', password: 'laila-wave6-pass', role: 'guardian' as const, mobile: '01061610003' };
export const TAMER6 = { display_name: 'Tamer Test', username: 'tamer.w6', password: 'tamer-wave6-pass', role: 'guardian' as const, mobile: '01061610004' };
export const HUDA6 = { display_name: 'Huda Test', username: 'huda.w6', password: 'huda-wave6-pass', role: 'guardian' as const, mobile: '01061610005' };
export const RANIA6 = { display_name: 'Rania Test', username: 'rania.w6', password: 'rania-wave6-pass', role: 'learner' as const, mobile: '01061610006' };

/** W6-f in Mesk School (after withW6a): Laila Test, a guardian linked to Salma and Omar C; Rania Test, a learner of Mathematics
 * (W6-a's subject, as Salma) with her own mark on L1, who is also a guardian linked to Salma. Mona stays linked to Salma only. */
export async function withW6f(w: Wave1World, a: W6a): Promise<void> {
  const s = w.school;
  const until = utcDatePlusDays(60);
  const seeded = await seed(w.p.url, {
    spaceId: s.id, grantedBy: 'amal.admin',
    people: [{ ...LAILA6, valid_until: until }, { ...RANIA6, valid_until: until }],
    memberships: [{ username: RANIA6.username, role: 'guardian', valid_until: until }],
    links: [{ guardian: LAILA6.username, learner: SALMA.username }, { guardian: LAILA6.username, learner: OMAR.username }, { guardian: RANIA6.username, learner: SALMA.username }],
  });
  w.ids[LAILA6.username] = seeded.users[LAILA6.username];
  const rania = seeded.users[RANIA6.username];
  w.ids[RANIA6.username] = rania;
  await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6f-rania', '${s.id}', '${s.math}', '${rania}')`);
  await w.p.sql(`INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES ('${s.id}', '${rania}', '${a.L.L1}', 1)`);
  await pinnable(w);
}

/** W6-f in Nile Test Space (after withW6b): Tamer Test, a guardian linked to Yara Test; lesson activity on there (Nadia's form). */
export async function withTamer(w: Wave1World, b: W6b): Promise<void> {
  const seeded = await seed(w.p.url, {
    spaceId: b.id, grantedBy: 'nadia.w4',
    people: [{ ...TAMER6, valid_until: utcDatePlusDays(60) }],
    links: [{ guardian: TAMER6.username, learner: YARA6.username }],
  });
  w.ids[TAMER6.username] = seeded.users[TAMER6.username];
  const res = await b.nadia.post(`/s/${b.id}/admin/activity`, { told: '1' });
  assert.equal(res.status, 303, 'lesson activity on in Nile Test Space');
  await pinnable(w);
}

/** W6-f in the W6-e space (the load space): Huda Test, a guardian linked to its learner, seeded through the product at `url`. */
export async function withHuda(url: string, load: { id: string }, adminUsername: string, learnerUsername: string): Promise<string> {
  const seeded = await seed(url, {
    spaceId: load.id, grantedBy: adminUsername,
    people: [{ ...HUDA6, valid_until: utcDatePlusDays(60) }],
    links: [{ guardian: HUDA6.username, learner: learnerUsername }],
  });
  return seeded.users[HUDA6.username];
}

/** W6-f in the other kits (AT-6.5, UX-81): Laila Test also a guardian of Salma in the Company and University spaces, with
 * Adding fractions due D there and lesson activity on (each space's admin's form). Call after withW6f. */
export async function withKitGuardians(w: Wave1World): Promise<void> {
  for (const [space, admin] of [[w.company, COMPANY_ADMIN], [w.university, UNIVERSITY_ADMIN]] as const) {
    await seed(w.p.url, {
      spaceId: space.id, grantedBy: admin.username,
      memberships: [{ username: LAILA6.username, role: 'guardian', valid_until: utcDatePlusDays(60) }],
      links: [{ guardian: LAILA6.username, learner: SALMA.username }],
    });
    await w.p.sql(`UPDATE lesson SET due_on = '${D}' WHERE id = '${space.lessons['Adding fractions']}'`);
    await activity(w, true, await signedIn(w.p.url, admin.username, admin.password), space.id);
  }
  await pinnable(w);
}

/** The linked learner's page of a guardian. */
export const linkedPath = (s: { id: string }, learnerId: string) => `/s/${s.id}/linked/${learnerId}`;

/** The wave 6 world: wave 4's (and so waves 1 to 3), the clock pinned at the default W6-c instant, then W6-a. Sign people in after this (a session from before the pin may be idle by D). */
export async function wave6World(opts: { dates?: boolean; activity?: boolean } = {}): Promise<{ w: Wave1World; a: W6a }> {
  const w = await wave4World({ activity: opts.activity });
  try {
    await clockAt(w, AT.noon);
    return { w, a: await withW6a(w, { dates: opts.dates }) };
  } catch (err) {
    await clockAt(w, null).catch(() => null);
    await w.close();
    throw err;
  }
}

/** Gives the clock back and stops the product (each describe's after()). */
export async function closeWave6(w: Wave1World | undefined): Promise<void> {
  if (!w) return;
  await clockAt(w, null).catch(() => null);
  await w.close();
}

// ------------------------------------------------------------- page reads ----

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (fragment: string) => unescape(fragment.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** The due card on a page (UX-59), or null. */
export function dueCardOf(html: string) {
  const m = /<section id="due-dates"[\s\S]*?<\/section>/.exec(html);
  if (!m) return null;
  const block = m[0];
  const link = /<a class="due-link" href="([^"]+)">([\s\S]*?)<\/a>/.exec(block);
  return {
    block,
    at: m.index,
    heading: textOf(/<h2 id="due-card-title">([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? ''),
    help: textOf(/<p class="due-help">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? ''),
    link: link ? { href: unescape(link[1]), text: textOf(link[2]) } : null,
  };
}

/** One row of the due-dates page (UX-60), as a reader gets it. */
export interface DueRowView {
  id: string;
  kind: 'lesson' | 'chapter';
  /** The row's own markup (without a chapter's nested lesson rows). */
  html: string;
  title: string;
  value: string;
  empty: string | null;
  status: string | null;
  field: { value: string; min: string; max: string; invalid: boolean; describedBy: string | null };
  label: string;
  save: { action: string; name: string; text: string };
  clear: { action: string; name: string; text: string } | null;
  error: string | null;
}

/** Every row of the due-dates page, in page order. */
export function dueRowsOf(html: string): DueRowView[] {
  return [...html.matchAll(/<li id="item-([^"]+)" class="due-item due-(top|child)" tabindex="-1"><div class="due-row" data-kind="(lesson|chapter)">([\s\S]*?)\n<\/div>/g)].map((m) => {
    const inner = m[4];
    const input = /<input type="date" id="due-[^"]+" name="due_on" value="([^"]*)" min="([^"]+)" max="([^"]+)"([^>]*)>/.exec(inner)!;
    const forms = [...inner.matchAll(/<form class="due-(form|clear)" method="post" action="([^"]+)">([\s\S]*?)<\/form>/g)];
    const button = (f: RegExpMatchArray | undefined) => {
      if (!f) return null;
      const b = /<button type="submit" class="due-button" aria-label="([^"]+)">([\s\S]*?)<\/button>/.exec(f[3])!;
      return { action: unescape(f[2]), name: unescape(b[1]), text: textOf(b[2]) };
    };
    return {
      id: m[1],
      kind: m[3] as 'lesson' | 'chapter',
      html: inner,
      title: textOf(/<p class="due-title">[\s\S]*?<bdi>([\s\S]*?)<\/bdi><\/p>/.exec(inner)?.[1] ?? ''),
      value: textOf(/<p class="due-value[^"]*">([\s\S]*?)<\/p>/.exec(inner)?.[1] ?? ''),
      empty: /<p class="due-empty">([\s\S]*?)<\/p>/.exec(inner)?.[1] ? textOf(/<p class="due-empty">([\s\S]*?)<\/p>/.exec(inner)![1]) : null,
      status: /<p class="due-status [a-z]+" role="status" tabindex="-1">([\s\S]*?)<\/p>/.exec(inner)?.[1] ?? null,
      field: { value: input[1], min: input[2], max: input[3], invalid: /aria-invalid="true"/.test(input[4]), describedBy: /aria-describedby="([^"]+)"/.exec(input[4])?.[1] ?? null },
      label: textOf(/<label for="due-[^"]+">([\s\S]*?)<\/label>/.exec(inner)?.[1] ?? ''),
      save: button(forms.find((f) => f[1] === 'form'))!,
      clear: button(forms.find((f) => f[1] === 'clear')),
      error: /<p id="due-[^"]+-error" class="error due-error">([\s\S]*?)<\/p>/.exec(inner)?.[1] ? textOf(/<p id="due-[^"]+-error" class="error due-error">([\s\S]*?)<\/p>/.exec(inner)![1]) : null,
    };
  });
}
