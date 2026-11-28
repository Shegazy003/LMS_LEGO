// LMS redesign wave R1a (product-contract v2 on PIL-322, S12, D10): the
// realistic Arabic test world, the prototype's own data plus three subjects
// for سلمى (8 assigned published subjects: the budget's worst case). Written
// straight into a freshly migrated database with FIXED ids and a fixed clock
// (2026-11-27), so the same world on two builds (d1a5ae3 for the baseline, the
// candidate) gives comparable pages. CI uses it in process; the delegate's
// local copy is built from the same statements by tools/seed-demo.ts.
// Made-up data only.
import { inProcess, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { Client } from '../support/http.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { hashPassword } from '../../src/auth/password.ts';

export type Twin = Product & { worker: InProcessWorker };

/** The world's day and instant (S12): every date rule of the pages reads this. */
export const TODAY = '2026-11-27';
export const AT = Date.parse('2026-11-27T09:00:00.000Z');
export const SCHOOL_COLOUR = '#E9A020';

export interface Person { key: string; id: string; username: string; password: string; display_name: string; mobile: string }
const person = (key: string, name: string, n: number): Person => ({
  key, id: `r1a-user-${key}`, username: `${key}.r1a`, password: `${key}-r1a-pass-2026`, display_name: name, mobile: `+2010${String(91900000 + n)}`,
});
export const OWNER = person('owner', 'owner', 0);
export const ADMIN = person('nadia', 'نادية حسن', 1);
export const MONA = person('mona', 'منى سالم', 2);
export const KHALED = person('khaled', 'خالد عمر', 3);
export const HODA = person('hoda', 'هدى فؤاد', 4);
export const SARA = person('sara', 'سارة نبيل', 5);
export const MAHMOUD = person('mahmoud', 'محمود رضا', 6);
export const TAREK = person('tarek', 'طارق علي', 7);
export const SALMA = person('salma', 'سلمى أحمد', 8);
export const YOUSSEF = person('youssef', 'يوسف أحمد', 9);
export const OMAR = person('omar', 'عمر خالد', 10);
export const LAILA = person('laila', 'ليلى حسن', 11);
export const AHMED = person('ahmed', 'أحمد محمود', 12);
export const VISITOR = person('visitor', 'زائر بلا مكان', 13);
export const RANA = person('rana', 'رنا سمير', 14);
export const KARIM = person('karim', 'كريم عادل', 15);
export const PEOPLE = [OWNER, ADMIN, MONA, KHALED, HODA, SARA, MAHMOUD, TAREK, SALMA, YOUSSEF, OMAR, LAILA, AHMED, VISITOR, RANA, KARIM];

const id = (kind: string, n: number) => `r1a-${kind}-${String(n).padStart(4, '0')}`;
export const ID = {
  space: 'r1a-space-0001', kit: 'r1a-kit-0001', otherSpace: 'r1a-space-0002', otherKit: 'r1a-kit-0002',
  group: 'r1a-group-0001', quiz: 'r1a-quiz-0001', exam1: 'r1a-exam-0001', exam2: 'r1a-exam-0002',
};

export interface WorldLesson { id: string; title: string; due?: string; done?: number }
export interface WorldChapter { id: string; title: string; due?: string; opens?: string; lessons: WorldLesson[] }
export interface WorldSubject { id: string; title: string; teacher: Person; published: boolean; inOrder?: boolean; group: boolean; chapters: WorldChapter[] }

let ln = 0;
let cn = 0;
const L = (title: string, extra: Partial<WorldLesson> = {}): WorldLesson => ({ id: id('less', ++ln), title, ...extra });
const C = (title: string, lessons: WorldLesson[], extra: Partial<WorldChapter> = {}): WorldChapter => ({ id: id('chap', ++cn), title, lessons, ...extra });
const MARK = (minute: number) => Date.parse('2026-11-26T15:00:00.000Z') + minute * 60_000;

/** The subjects, in the home's order (by title): the first five through the class (سلمى and يوسف), the next three for سلمى only, the last unpublished. */
export const SUBJECTS: WorldSubject[] = [
  { id: id('subj', 1), title: 'الرياضيات', teacher: MONA, published: true, group: true, chapters: [
    C('الأعداد', [L('الأعداد الطبيعية', { done: MARK(1) }), L('القيمة المكانية', { done: MARK(2) })]),
    C('الكسور', [L('مقدمة في الكسور', { done: MARK(10) }), L('الكسور المتكافئة', { due: TODAY }), L('جمع الكسور', { due: '2026-11-28' }), L('طرح الكسور')]),
    C('الهندسة', [L('الزوايا'), L('المثلثات')], { opens: '2026-12-10' }),
  ] },
  { id: id('subj', 2), title: 'العلوم', teacher: KHALED, published: true, group: true, inOrder: true, chapters: [
    C('الخلية', [L('مكونات الخلية', { done: MARK(-600) }), L('تقرير التجربة', { due: '2026-11-25' }), L('الخلية النباتية')]),
    C('المادة وحالاتها', [L('الحالة الصلبة'), L('الحالة السائلة')]),
  ] },
  { id: id('subj', 3), title: 'اللغة العربية', teacher: HODA, published: true, group: true, chapters: [
    C('النحو', [L('الجملة الاسمية', { due: '2026-11-24' }), L('الجملة الفعلية')]),
    C('القراءة', [L('نص: رحلة إلى الأقصر'), L('أسئلة الفهم')], { due: '2026-12-02' }),
  ] },
  { id: id('subj', 4), title: 'اللغة الإنجليزية', teacher: SARA, published: true, group: true, chapters: [
    C('التحيات', [L('Hello and goodbye'), L('Numbers 1-20')]),
  ] },
  { id: id('subj', 5), title: 'الدراسات الاجتماعية', teacher: MAHMOUD, published: true, group: true, chapters: [
    C('خريطة مصر', [L('المحافظات', { due: '2026-12-01' }), L('نهر النيل')]),
  ] },
  { id: id('subj', 6), title: 'الحاسب الآلي', teacher: TAREK, published: true, group: false, chapters: [
    C('أجزاء الحاسب', [L('لوحة المفاتيح'), L('الفأرة')]),
  ] },
  { id: id('subj', 7), title: 'المهارات الحياتية', teacher: TAREK, published: true, group: false, chapters: [
    C('تنظيم الوقت', [L('جدول يومي'), L('أولوياتي')]),
  ] },
  { id: id('subj', 8), title: 'التربية الفنية', teacher: HODA, published: true, group: false, chapters: [
    C('الألوان', [L('الألوان الأساسية'), L('مزج الألوان')]),
  ] },
  { id: id('subj', 9), title: 'الفيزياء', teacher: KHALED, published: false, group: false, chapters: [
    C('الحركة', [L('السرعة')]),
  ] },
];
export const MATH = SUBJECTS[0];
export const SCIENCE = SUBJECTS[1];
export const PHYSICS = SUBJECTS[8];
/** The lesson of the hero for سلمى (wave 2's rule: the first lesson not done after her newest mark). */
export const HERO_LESSON = MATH.chapters[1].lessons[1];
/** The lesson with all five material kinds. */
export const KINDS_LESSON = MATH.chapters[1].lessons[2];

/** Announcements (S12): newest per subject is the card's line; one removed ("hidden") and one in the unpublished subject never show. */
export const HIDDEN_MARK = 'إعلان-مخفي-r1a-7c2e';
export const DRAFT_MARK = 'إعلان-مسودة-r1a-4b9d';
export const LONG_TEXT = 'أحضروا ورقة بيضاء وأقلامًا ملوّنة لتجربة الأسبوع القادم عن الخلية النباتية، وسنرسم معًا أجزاء الخلية ونكتب أسماءها، ثم نقارنها بالخلية الحيوانية في الحصة التالية.';
export const ANNOUNCEMENTS = [
  { id: id('ann', 1), subject: SUBJECTS[0], body: 'تم رفع ورقة عمل الأعداد.', at: '2026-11-20T08:00:00.000Z' },
  { id: id('ann', 2), subject: SUBJECTS[0], body: 'اختبار الكسور يوم الأحد القادم، راجعوا الفصل الأول.', at: '2026-11-25T08:00:00.000Z' },
  { id: id('ann', 3), subject: SUBJECTS[1], body: LONG_TEXT, at: '2026-11-24T08:00:00.000Z' },
  { id: id('ann', 4), subject: SUBJECTS[2], body: 'مسابقة الإلقاء الشهر القادم، سجّلوا أسماءكم.', at: '2026-11-22T08:00:00.000Z' },
  { id: id('ann', 5), subject: SUBJECTS[3], body: `${HIDDEN_MARK} لن يظهر هذا الإعلان.`, at: '2026-11-26T08:00:00.000Z', removed: '2026-11-26T09:00:00.000Z' },
  { id: id('ann', 6), subject: SUBJECTS[5], body: 'أحضروا سماعات الأذن في الحصة القادمة.', at: '2026-10-01T08:00:00.000Z' },
  { id: id('ann', 7), subject: PHYSICS, body: `${DRAFT_MARK} مادة جديدة قريبًا.`, at: '2026-11-26T10:00:00.000Z' },
];

const CREATED = Date.parse('2026-09-01T08:00:00.000Z');
const QUESTIONS = [
  { id: 'r1a-q1', text: '½ + ¼ = ?', answers: [{ id: 'r1a-q1-a', text: '¾' }, { id: 'r1a-q1-b', text: '2/6' }], rightId: 'r1a-q1-a' },
  { id: 'r1a-q2', text: 'أي كسر يساوي ½؟', answers: [{ id: 'r1a-q2-a', text: '2/4' }, { id: 'r1a-q2-b', text: '1/3' }], rightId: 'r1a-q2-a' },
  { id: 'r1a-q3', text: 'ما بسط الكسر ⅗؟', answers: [{ id: 'r1a-q3-a', text: '3' }, { id: 'r1a-q3-b', text: '5' }], rightId: 'r1a-q3-a' },
];

/** A tiny real PDF and a tiny PNG, fixed bytes (no binary fixture). */
export function pdfBytes(): Uint8Array {
  const stream = 'BT /F1 24 Tf 72 720 Td (Fractions) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
export const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

export const FILES = {
  pdf: { key: `spaces/${ID.space}/files/r1a-file-0001`, type: 'application/pdf', bytes: pdfBytes },
  image: { key: `spaces/${ID.space}/files/r1a-file-0002`, type: 'image/png', bytes: () => PNG_BYTES },
};

export type Row = [string, ...(string | number | null)[]];

/** LMS redesign R1b (S7, section 7 "seed: one subject with a chosen look"): اللغة العربية's chosen look. */
export const CHOSEN_LOOK = { subjectId: SUBJECTS[2].id, colour: 'c03', icon: 'letters' } as const;

/** Every statement of the world, in order (one transaction). `look` (R1b and the demo seed only; needs migration
 * 0018): one subject with a chosen look; without it every subject is automatic, as in R1a's world. */
export async function worldRows(opts: { look?: boolean } = {}): Promise<Row[]> {
  const rows: Row[] = [];
  for (const p of PEOPLE) {
    rows.push(['INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      p.id, p.username, await hashPassword(p.password), p.display_name, p.mobile, p === OWNER ? 1 : 0, CREATED]);
  }
  for (const [kitId, spaceId, name] of [[ID.kit, ID.space, 'مدرسة الأمل التجريبية'], [ID.otherKit, ID.otherSpace, 'مدرسة النور التجريبية']]) {
    const kit = seedKit('school');
    kit.languages = ['ar', 'en'];
    kit.theme.primaryColor = spaceId === ID.space ? SCHOOL_COLOUR.toLowerCase() : '#1f5fad';
    rows.push(['INSERT INTO kit (id, name, json) VALUES (?, ?, ?)', kitId, kit.name.en, JSON.stringify(kit)]);
    rows.push(['INSERT INTO space (id, name, kit_id, default_country_code, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', spaceId, name, kitId, '+20', OWNER.id, CREATED]);
  }
  let m = 0;
  const member = (who: Person, role: string, space = ID.space, ended: string | null = null) => rows.push([
    'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by, ended_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id('memb', ++m), space, who.id, role, '2026-09-01', '2027-08-31', OWNER.id, ended,
  ]);
  member(ADMIN, 'admin');
  for (const t of [MONA, KHALED, HODA, SARA, MAHMOUD, TAREK]) member(t, 'publisher');
  for (const l of [SALMA, YOUSSEF, OMAR, LAILA]) member(l, 'learner');
  member(LAILA, 'guardian');
  member(AHMED, 'guardian');
  member(RANA, 'learner', ID.otherSpace);
  member(KARIM, 'learner', ID.space, '2026-11-20');
  rows.push(['INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', id('link', 1), ID.space, AHMED.id, SALMA.id, ADMIN.id, CREATED]);
  rows.push(['INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', id('link', 2), ID.space, AHMED.id, YOUSSEF.id, ADMIN.id, CREATED]);
  rows.push(['INSERT INTO lesson_view_setting (space_id, enabled, enabled_since, told_confirmed, changed_by, changed_at) VALUES (?, 1, ?, 1, ?, ?)', ID.space, '2026-09-01', ADMIN.id, CREATED]);
  rows.push(['INSERT INTO "group" (id, space_id, name) VALUES (?, ?, ?)', ID.group, ID.space, 'السادس أ']);
  for (const l of [SALMA, YOUSSEF]) rows.push(['INSERT INTO group_member (space_id, group_id, user_id) VALUES (?, ?, ?)', ID.space, ID.group, l.id]);
  let a = 0;
  for (const s of SUBJECTS) {
    rows.push(['INSERT INTO subject (id, space_id, title, publisher_user_id, is_published, chapters_in_order) VALUES (?, ?, ?, ?, ?, ?)', s.id, ID.space, s.title, s.teacher.id, s.published ? 1 : 0, s.inOrder ? 1 : 0]);
    if (s.group) rows.push(['INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, ?, NULL)', id('acc', ++a), ID.space, s.id, ID.group]);
    else rows.push(['INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, NULL, ?)', id('acc', ++a), ID.space, s.id, SALMA.id]);
    s.chapters.forEach((ch, ci) => {
      rows.push(['INSERT INTO chapter (id, space_id, subject_id, title, position, due_on, opens_on, opens_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', ch.id, ID.space, s.id, ch.title, ci + 1, ch.due ?? null, ch.opens ?? null]);
      ch.lessons.forEach((l, li) => {
        rows.push(['INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position, due_on) VALUES (?, ?, ?, ?, ?, ?, ?)', l.id, ID.space, ch.id, l.title, `${l.title}: ملاحظات الدرس.`, li + 1, l.due ?? null]);
        if (l.done) rows.push(['INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, l.id, l.done]);
      });
    });
  }
  // Every material kind on one lesson (S12).
  const mat = (n: number, kind: string, title: string, key: string | null, url: string | null, note: string | null) => rows.push([
    'INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, url, note_text, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id('mat', n), ID.space, KINDS_LESSON.id, kind, title, key, url, note, n,
  ]);
  mat(1, 'pdf', 'ورقة عمل جمع الكسور', FILES.pdf.key, null, null);
  mat(2, 'image', 'صورة: نموذج الكسور', FILES.image.key, null, null);
  mat(3, 'video_link', 'فيديو: جمع الكسور', null, 'https://video.example.org/fractions', null);
  mat(4, 'link', 'تمارين إضافية', null, 'https://example.org/fractions', null);
  mat(5, 'note', 'ملاحظة المعلّمة', null, null, 'وحّد المقامات أولًا، ثم اجمع البسط.');
  for (const n of ANNOUNCEMENTS) {
    rows.push(['INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at, edited_at, removed_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
      n.id, ID.space, n.subject.id, n.body, 'publisher', n.at, 'removed' in n ? n.removed ?? null : null]);
  }
  rows.push(['INSERT INTO quiz (id, space_id, subject_id, title, questions_json, rev, state, created_at, removed_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)',
    ID.quiz, ID.space, MATH.id, 'اختبار قصير: الكسور', JSON.stringify(QUESTIONS), 'open', CREATED]);
  rows.push(['INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES (?, ?, ?, ?, 0, ?, ?, 2, 3, ?)',
    id('att', 1), ID.space, ID.quiz, SALMA.id, JSON.stringify({ 'r1a-q1': 'r1a-q1-a', 'r1a-q2': 'r1a-q2-a', 'r1a-q3': 'r1a-q3-b' }), '110', Date.parse('2026-11-23T10:00:00.000Z')]);
  for (const [examId, subject, title, date, max, mark] of [[ID.exam1, MATH, 'امتحان الشهر الأول', '2026-10-20', 20, 17], [ID.exam2, SCIENCE, 'امتحان قصير', '2026-11-10', 3, 1]] as const) {
    rows.push(['INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', examId, ID.space, subject.id, title, date, max, subject.teacher.id, CREATED]);
    rows.push(['INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      `${examId}-salma`, ID.space, examId, SALMA.id, 'marked', mark, Date.parse(`${date}T12:00:00.000Z`), subject.teacher.id, Date.parse(`${date}T12:00:00.000Z`)]);
  }
  if (opts.look) rows.push(['UPDATE subject SET look_colour = ?, look_icon = ? WHERE id = ? AND space_id = ?', CHOSEN_LOOK.colour, CHOSEN_LOOK.icon, CHOSEN_LOOK.subjectId, ID.space]);
  return rows;
}

/** Writes the world into an in-process product's database (one transaction) and its files into the file store. */
export async function seedR1a(w: InProcessWorker, opts: { look?: boolean } = {}): Promise<void> {
  const rows = await worldRows(opts);
  for (const f of Object.values(FILES)) await w.files.put(f.key, f.bytes(), { httpMetadata: { contentType: f.type } });
  w.sqlite.exec('BEGIN');
  try {
    for (const [q, ...params] of rows) w.sqlite.prepare(q).run(...params);
    w.sqlite.exec('COMMIT');
  } catch (err) {
    w.sqlite.exec('ROLLBACK');
    throw err;
  }
}

async function pin(url: string, atMs: number | null): Promise<void> {
  const res = await fetch(url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ atMs }) });
  if (res.status !== 200) throw new Error(`the fixed clock answers ${res.status}`);
}

export interface R1aWorld {
  p: Twin;
  url: string;
  sql(query: string, ...params: (string | number | null)[]): Record<string, unknown>[];
  run(query: string, ...params: (string | number | null)[]): void;
  /** A signed-in client of a person (Arabic first: no language sent). */
  as(who: Person, lang?: 'ar' | 'en'): Promise<Client>;
  clock(atMs: number | null): Promise<void>;
  close(): Promise<void>;
}

/** The world on a fresh in-process product (this checkout, or another one: `root`), the clock pinned to 2026-11-27. */
export async function r1aWorld(opts: { root?: string; atMs?: number; look?: boolean } = {}): Promise<R1aWorld> {
  const p = (await inProcess(opts.root ? { root: opts.root } : {})) as Twin;
  try {
    await seedR1a(p.worker, { look: opts.look });
    await pin(p.url, opts.atMs ?? AT);
  } catch (err) {
    await p.stop();
    throw err;
  }
  return {
    p,
    url: p.url,
    sql: (q, ...params) => p.worker.sqlite.prepare(q).all(...params) as Record<string, unknown>[],
    run: (q, ...params) => void p.worker.sqlite.prepare(q).run(...params),
    async as(who, lang) {
      const c = new Client(p.url, { lang: lang ?? null });
      const res = await c.post('/signin', { username: who.username, password: who.password });
      if (res.status !== 302) throw new Error(`${who.username} signs in (${res.status})`);
      if (lang) {
        const set = await c.post('/account/language', { lang });
        if (set.status >= 400) throw new Error(`${who.username}: language ${lang} (${set.status})`);
      }
      return c;
    },
    clock: (atMs) => pin(p.url, atMs),
    async close() {
      await pin(p.url, null).catch(() => undefined);
      await p.stop();
    },
  };
}

// ------------------------------------------------------------- addresses ----
export const HOME = `/s/${ID.space}`;
export const SUBJECTS_PAGE = `/s/${ID.space}/subjects`;
export const TODO_PAGE = `/s/${ID.space}/todo`;
export const subjectPage = (s: WorldSubject) => `/s/${ID.space}/learn/${s.id}`;
export const lessonPage = (l: WorldLesson) => `/s/${ID.space}/read/${l.id}`;

/** The page's text with tags removed (as a reader sees it, styles off). */
export const textOf = (fragment: string) => fragment.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/\s+/g, ' ').trim();
