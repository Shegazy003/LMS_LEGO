// Shared by the R2-b tests (contract product-contract-r2, AT-10, AT-11 and the
// results pages of AT-13): the R2-a world (test/at9/world.ts) with D also
// assigned directly to Mathematics, so the Mathematics list holds A and B
// (siblings), C and D (same name "Omar Test", different usernames), by the
// group Science or directly. Every exam, draft and publish goes through the
// publisher's real forms; the helpers below post them the way the page does.
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { A, B, C, D, HADEER, SHIMAA, as, buildWorld, type World } from '../at9/world.ts';

export { A, B, C, D, HADEER, SHIMAA, as, type World };

/** The Mathematics list, as the marks page must order it: by name, then username. */
export const MATH_ORDER = [C, D, A, B];

export interface Row {
  mark?: string;
  absent?: boolean;
}

/** The R2-a world, with D assigned to Mathematics directly (through the admin's real subject form). */
export async function marksWorld(opts: Parameters<typeof buildWorld>[0] = {}): Promise<World & { science: string }> {
  const w = await buildWorld(opts);
  try {
    const science = String((await w.p.sql(`SELECT id FROM "group" WHERE space_id = '${w.spaceId}' AND name = 'Science'`))[0].id);
    await assignMath(w, science, [D.username]);
    return Object.assign(w, { science });
  } catch (err) {
    await w.close();
    throw err;
  }
}

/** Saves Mathematics with Hadeer, the group Science and the given learners directly (the admin's subject form). */
export async function assignMath(w: World, science: string, direct: string[]): Promise<void> {
  const f = new FormData();
  f.set('publisher', w.ids[HADEER.username]);
  f.append('set', science);
  for (const u of direct) f.append('learner', w.ids[u]);
  const res = await w.admin.post(`/s/${w.spaceId}/admin/topics/${w.content.math}`, f);
  assert.equal(res.status, 303, `Mathematics saved (got ${res.status})`);
}

/** Replaces the members of the group Science (the admin's group form). */
export async function setScience(w: World & { science: string }, usernames: string[]): Promise<void> {
  const f = new FormData();
  for (const u of usernames) f.append('member', w.ids[u]);
  const res = await w.admin.post(`/s/${w.spaceId}/admin/sets/${w.science}`, f);
  assert.equal(res.status, 303, `Science saved (got ${res.status})`);
}

export const examListPath = (w: World, subjectId: string) => `/s/${w.spaceId}/publish/edit/${subjectId}/marks`;
export const marksPath = (w: World, examId: string) => `/s/${w.spaceId}/publish/marks/${examId}`;

/** Makes an exam through the publisher's form; returns its id. */
export async function createExam(
  w: World,
  publisher: Client,
  subjectId: string,
  v: { title: string; exam_date?: string; max_mark?: string } = { title: 'Mid-term' },
): Promise<string> {
  const res = await publisher.post(examListPath(w, subjectId), { exam_date: utcDatePlusDays(-1), max_mark: '20', ...v });
  assert.equal(res.status, 303, `exam ${v.title} made (got ${res.status})`);
  const id = (res.headers.get('location') ?? '').split('/').pop() ?? '';
  assert.ok(id, 'the exam id in the redirect');
  return id;
}

/** The marks form as the page posts it: every learner shown, each row's box and tick, and the button pressed. */
export function marksForm(w: World, learners: string[], rows: Record<string, Row>, action: 'draft' | 'publish'): FormData {
  const f = new FormData();
  for (const username of learners) {
    const id = w.ids[username];
    f.append('learner', id);
    f.set(`mark:${id}`, rows[username]?.mark ?? '');
    if (rows[username]?.absent) f.set(`absent:${id}`, '1');
  }
  f.set('action', action);
  return f;
}

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (s: string) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export interface ShownRow {
  learner: string;
  name: string;
  secondId: string;
  typed: string;
  absent: boolean;
  published: boolean;
  value: string;
  error: string;
  inputmode: string;
  group: string;
  empty: boolean;
}

/** The rows of a marks page or a confirmation page, in page order. */
export function shownRows(html: string): ShownRow[] {
  return [...html.matchAll(/<li class="mark-row" data-learner="([^"]+)"([^>]*)>([\s\S]*?)<\/li>/g)].map((m) => {
    const body = m[3];
    const input = body.match(/<input class="mark"[^>]*>/)?.[0] ?? '';
    return {
      learner: m[1],
      name: text(body.match(/<bdi class="name">([\s\S]*?)<\/bdi>/)?.[1] ?? ''),
      secondId: text(body.match(/<span class="muted second-id">([\s\S]*?)<\/span>/)?.[1] ?? ''),
      typed: unescape(input.match(/value="([^"]*)"/)?.[1] ?? ''),
      absent: /name="absent:[^"]+" value="1" checked/.test(body),
      published: /data-published="1"/.test(m[2]),
      value: text(body.match(/<span class="value"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
      error: text(body.match(/<p class="error row-error"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
      inputmode: input.match(/inputmode="([^"]*)"/)?.[1] ?? '',
      group: text(body.match(/<span class="muted group">([\s\S]*?)<\/span>\s*$/)?.[1] ?? ''),
      empty: /data-empty="1"/.test(m[2]),
    };
  });
}

/** The confirming form of a confirmation page: the learners it lists and its fingerprint; null when there is no button. */
export function confirmFields(html: string): { learners: string[]; version: string } | null {
  const form = html.match(/<form id="confirm"[\s\S]*?<\/form>/)?.[0];
  if (!form) return null;
  return {
    learners: [...form.matchAll(/name="learner" value="([^"]+)"/g)].map((m) => m[1]),
    version: form.match(/name="version" value="([^"]+)"/)?.[1] ?? '',
  };
}

export function confirmForm(fields: { learners: string[]; version: string }): FormData {
  const f = new FormData();
  for (const id of fields.learners) f.append('learner', id);
  f.set('version', fields.version);
  return f;
}

/** Publish, step one (the marks form with Publish pressed): returns the response and its page. */
export async function pressPublish(w: World, publisher: Client, examId: string, learners: string[], rows: Record<string, Row>): Promise<{ status: number; html: string }> {
  const res = await publisher.post(marksPath(w, examId), marksForm(w, learners, rows, 'publish'));
  return { status: res.status, html: await res.text() };
}

/** Publish from start to end through both steps; every row must be complete. */
export async function publishAll(w: World, publisher: Client, examId: string, learners: string[], rows: Record<string, Row>): Promise<void> {
  const step = await pressPublish(w, publisher, examId, learners, rows);
  assert.equal(step.status, 200, `the confirmation page (got ${step.status}): ${text(step.html).slice(0, 300)}`);
  const fields = confirmFields(step.html);
  assert.ok(fields, 'the confirmation page has its button');
  const res = await publisher.post(`${marksPath(w, examId)}/publish`, confirmForm(fields));
  assert.equal(res.status, 303, `published (got ${res.status})`);
}

/** Every stored row of an exam, by username: status, mark, published or not. */
export async function storedRows(w: World, examId: string): Promise<Record<string, { id: string; status: string; mark: number | null; published_at: number | null }>> {
  const rows = await w.p.sql(
    `SELECT r.id, u.username, r.status, r.mark, r.published_at FROM exam_result r JOIN user u ON u.id = r.learner_user_id WHERE r.exam_id = '${examId}' ORDER BY u.username`,
  );
  return Object.fromEntries(rows.map((r) => [String(r.username), {
    id: String(r.id), status: String(r.status), mark: r.mark === null ? null : Number(r.mark), published_at: r.published_at === null ? null : Number(r.published_at),
  }]));
}

export const count = async (w: World, sql: string) => Number((await w.p.sql(sql))[0].n);

/** A world with one published Mathematics exam (A 17, B Absent, C 12, D 15.5) and one Arabic draft for A, for the learner views. */
export async function resultsWorld(opts: Parameters<typeof buildWorld>[0] = {}) {
  const w = await marksWorld(opts);
  try {
    const hadeer = await as(w, HADEER);
    const exam = await createExam(w, hadeer, w.content.math, { title: 'Mid-term', exam_date: '2026-11-12', max_mark: '20' });
    await publishAll(w, hadeer, exam, MATH_ORDER.map((p) => p.username), {
      [A.username]: { mark: '17' }, [B.username]: { absent: true }, [C.username]: { mark: '12' }, [D.username]: { mark: '15.5' },
    });
    const shimaa = await as(w, SHIMAA);
    const draftExam = await createExam(w, shimaa, w.content.arabic, { title: 'Quiz 2', exam_date: '2026-11-20', max_mark: '10' });
    const saved = await shimaa.post(marksPath(w, draftExam), marksForm(w, [A.username], { [A.username]: { mark: '9' } }, 'draft'));
    assert.equal(saved.status, 303, 'the Arabic draft is saved');
    const published = await storedRows(w, exam);
    const draft = await storedRows(w, draftExam);
    return Object.assign(w, { hadeer, exam, draftExam, published, draft });
  } catch (err) {
    await w.close();
    throw err;
  }
}
