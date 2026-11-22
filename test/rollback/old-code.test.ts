// AT-14a (contract product-contract-r2, section 9): rollback holds. This file
// runs inside a checkout of the code that is live before release 2 (CI job
// "rollback": main at f3b1fa7, the H-1 version 528786a4, the rollback target),
// with release 2's migrations copied into that checkout's migrations/ folder,
// so the old code runs on a release 2 database. It uses only the old code's own
// test helpers (test/support/worker.ts, http.ts and seed.ts, unchanged since
// release 1.1).
//
// On that database there is a guardian membership row and a guardian link,
// from R2-b an exam with a published mark, its history row and a draft, and
// from R2-d a lesson-view row with the setting switched on (each only if its
// tables exist). Old code must show the guardian nothing (no learner, no
// subject, no lesson, no file), show nobody an exam or a mark, expose nothing
// to others, write no lesson-view row and delete nothing. From LMS wave 2
// (W2-1, AT-3.3) a done mark of Salma's: old code shows nobody anything of it,
// writes no done mark and deletes nothing. From LMS wave 4 (W4-1a, AT-5.3): a
// subject set in order (chapters_in_order = 1): old code opens its later
// chapter's lesson (no lock) and writes nothing to the setting.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';

const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { display_name: 'Hadeer', username: 'hadeer.t', password: 'hadeer-first-pass', mobile: '01022223333', role: 'publisher' as const };
const SALMA = { display_name: 'Salma Test', username: 'salma.a', password: 'salma-first-pass', mobile: '01031313131', role: 'learner' as const };
const MONA = { display_name: 'Mona Guardian', username: 'mona.g1', password: 'mona-first-pass', mobile: '01041414141', role: 'learner' as const };
const SEEN_ONLY_BY_SALMA = ['Salma Test', 'Mathematics', 'Fractions', 'Adding fractions', 'Worksheet', 'Pizza slices'];
// From R2-b: exams and marks, which old code shows nobody (it has no results page at all).
const EXAM_TITLE = 'Mid-term exam';
const DRAFT_TITLE = 'Quiz draft';
const MARKS_SHOWN_TO_NOBODY = [EXAM_TITLE, DRAFT_TITLE, '17.5', '17,5'];
// From LMS wave 3b (W3b-1, AT-5.5): a person added from a spreadsheet, with the no-password value
// (today's stored form, the marker salt of 16 zero bytes, a random 32-byte hash nobody can match).
const NO_PASSWORD = { display_name: 'Nopass Test', username: 'nopass.w3b' };
const NO_PASSWORD_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$q8Yb3Wl0Hn2T5vR7cK9xJ1mZ4pQ6sD8fG0hU2iV3wE4';

let worker: RunningWorker;
let spaceId = '';
let ids: Record<string, string> = {};
let content = { subject: '', lesson: '', pdf: '' };
let later = '';
const count = async (sql: string) => Number((await worker.sql(sql))[0].n);
const tableExists = async (name: string) => (await worker.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`)).length === 1;

/** The rows release 2 left, which old code must neither show nor delete. */
async function release2Rows(): Promise<Record<string, number>> {
  const out: Record<string, number> = {
    guardian_link: await count('SELECT COUNT(*) AS n FROM guardian_link'),
    guardian_membership: await count("SELECT COUNT(*) AS n FROM membership WHERE role = 'guardian'"),
  };
  for (const t of ['lesson_view', 'lesson_view_setting', 'exam', 'exam_result', 'exam_result_history', 'done_mark']) {
    if (await tableExists(t)) out[t] = await count(`SELECT COUNT(*) AS n FROM "${t}"`);
  }
  return out;
}

describe('AT-14a old code on a release 2 database shows a guardian nothing, exposes nothing, writes and deletes nothing', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [HADEER, SALMA, MONA].map((p) => ({ ...p, valid_until: utcDatePlusDays(30) })),
      subjects: [{
        title: 'Mathematics', publisher: HADEER.username, published: true, users: [SALMA.username],
        chapters: [{ title: 'Fractions', position: 1, lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf('Pizza slices')), contentType: 'application/pdf' },
        ] }] }, {
          // From LMS wave 4 (W4-1a, AT-5.3): a later chapter, which wave 4 code would lock while Fractions is not done.
          title: 'Decimals', position: 2, lessons: [{ title: 'Reading decimals', materials: [{ kind: 'note', title: 'Decimal note', text: 'Tenths and hundredths' }] }],
        }],
      }],
    });
    ids = s.users;
    const lesson = s.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'];
    content = { subject: s.subjects.Mathematics.id, lesson: lesson.id, pdf: lesson.materials.Worksheet };
    later = s.subjects.Mathematics.chapters.Decimals.lessons['Reading decimals'].id;
    const adminId = String((await worker.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
    // What release 2 writes: Mona's membership is a guardian's, linked to Salma.
    await worker.sql(`UPDATE membership SET role = 'guardian' WHERE user_id = '${ids[MONA.username]}' AND space_id = '${spaceId}'`);
    await worker.sql(`INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at) VALUES ('link-1', '${spaceId}', '${ids[MONA.username]}', '${ids[SALMA.username]}', '${adminId}', 0)`);
    // From R2-d: a lesson-view row, and the setting switched on.
    if (await tableExists('lesson_view_setting')) {
      await worker.sql(`INSERT INTO lesson_view_setting (space_id, enabled, enabled_since, told_confirmed, changed_by, changed_at) VALUES ('${spaceId}', 1, '2026-11-01', 1, '${adminId}', 0)`);
    }
    if (await tableExists('lesson_view')) {
      await worker.sql(`INSERT INTO lesson_view (space_id, lesson_id, learner_user_id, last_opened_on) VALUES ('${spaceId}', '${content.lesson}', '${ids[SALMA.username]}', '2026-11-02')`);
    }
    // From LMS wave 2 (W2-1, AT-3.3): Salma's done mark on her lesson.
    if (await tableExists('done_mark')) {
      await worker.sql(`INSERT INTO done_mark (space_id, lesson_id, learner_user_id, marked_at) VALUES ('${spaceId}', '${content.lesson}', '${ids[SALMA.username]}', 1951234567890)`);
    }
    // From LMS wave 3b (W3b-1, AT-5.5): an upload row, and the no-password person it added (the marker salt and a random hash).
    if (await tableExists('class_upload')) {
      await worker.sql(`INSERT INTO class_upload (id, space_id, uploaded_by, uploaded_at, lines_added, lines_refused) VALUES ('upload-1', '${spaceId}', '${adminId}', 1951234567890, 1, 0)`);
      await worker.sql(`INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES ('nopass-1', '${NO_PASSWORD.username}', '${NO_PASSWORD_HASH}', '${NO_PASSWORD.display_name}', '+201046480001', 0, 1)`);
      await worker.sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by, class_upload_id) VALUES ('nopass-m', '${spaceId}', 'nopass-1', 'learner', '${utcDatePlusDays(0)}', '${utcDatePlusDays(30)}', '${adminId}', 'upload-1')`);
    }
    // From R2-b: an exam of Mathematics with Salma's published mark (and its history row), and a draft of another exam.
    if (await tableExists('exam')) {
      const hadeer = ids[HADEER.username];
      await worker.sql(`INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at) VALUES ('exam-1', '${spaceId}', '${content.subject}', '${EXAM_TITLE}', '2026-11-12', 20, '${hadeer}', 0)`);
      await worker.sql(`INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at) VALUES ('exam-2', '${spaceId}', '${content.subject}', '${DRAFT_TITLE}', '2026-11-20', 10, '${hadeer}', 0)`);
      await worker.sql(`INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at) VALUES ('result-1', '${spaceId}', 'exam-1', '${ids[SALMA.username]}', 'marked', 17.5, 1, '${hadeer}', 1)`);
      await worker.sql(`INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at) VALUES ('result-2', '${spaceId}', 'exam-2', '${ids[SALMA.username]}', 'marked', 9, NULL, '${hadeer}', 1)`);
      await worker.sql(`INSERT INTO exam_result_history (id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at) VALUES ('history-1', 'result-1', NULL, NULL, 'marked', 17.5, NULL, '${hadeer}', 1)`);
    }
  });
  after(async () => {
    await worker?.stop();
  });

  it('the release 2 migrations are applied to the database the old code runs on', async () => {
    const applied = (await worker.sql('SELECT name FROM d1_migrations ORDER BY id')).map((r) => String(r.name));
    assert.ok(applied.includes('0007_guardians.sql'), `applied: ${applied.join(', ')}`);
    assert.ok(applied.includes('0008_exams.sql'), `applied: ${applied.join(', ')}`);
    for (const t of ['exam', 'exam_result', 'exam_result_history']) assert.ok(await tableExists(t), `${t} exists`);
    // From R2-d: lesson views, with a row and the setting switched on (before above).
    assert.ok(applied.includes('0010_lesson_views.sql'), `applied: ${applied.join(', ')}`);
    assert.equal(await count('SELECT COUNT(*) AS n FROM lesson_view'), 1, 'a lesson-view row');
    assert.equal(await count('SELECT COUNT(*) AS n FROM lesson_view_setting WHERE enabled = 1'), 1, 'the setting switched on');
    assert.ok(await tableExists('guardian_link'));
    assert.equal(await count("SELECT COUNT(*) AS n FROM membership WHERE role = 'guardian'"), 1, 'a guardian membership row');
  });

  it('old code shows the guardian nothing: no learner, no subject, no lesson, no file', async () => {
    const mona = await signedIn(worker.url, MONA.username, MONA.password);
    const home = await mona.get(`/s/${spaceId}`);
    assert.ok([200, 403].includes(home.status), `the space home answers (${home.status})`);
    const text = await home.text();
    for (const word of SEEN_ONLY_BY_SALMA) assert.ok(!text.includes(word), `the guardian's home shows no ${word}`);
    for (const path of [`/learn/${content.subject}`, `/read/${content.lesson}`, `/file/${content.pdf}`, '/admin', '/admin/people', '/publish', '/linked', `/linked/${ids[SALMA.username]}`]) {
      const res = await mona.get(`/s/${spaceId}${path}`);
      assert.ok([403, 404].includes(res.status), `${path}: refused or absent (${res.status})`);
      const body = await res.text();
      assert.ok(!body.startsWith('%PDF'), `${path}: no file`);
      for (const word of SEEN_ONLY_BY_SALMA) assert.ok(!body.includes(word), `${path}: shows no ${word}`);
    }
    for (const path of ['/home', '/account']) {
      const body = await (await mona.get(path)).text();
      for (const word of SEEN_ONLY_BY_SALMA) assert.ok(!body.includes(word), `${path}: shows no ${word}`);
    }
  });

  it('old code exposes the guardian to nobody and the learner keeps her own view', async () => {
    const salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    const home = await (await salma.get(`/s/${spaceId}`)).text();
    assert.ok(home.includes('Mathematics'), 'the learner still sees her subject');
    assert.ok(!home.includes(MONA.display_name), 'and nothing of the guardian');
    assert.equal((await salma.get(`/s/${spaceId}/read/${content.lesson}`)).status, 200, 'the learner opens her lesson');
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const [who, c, paths] of [
      ['the publisher', hadeer, [`/s/${spaceId}`, `/s/${spaceId}/publish/edit/${content.subject}`]],
      ['the admin', admin, [`/s/${spaceId}`, `/s/${spaceId}/admin/people`, `/s/${spaceId}/admin/topics/${content.subject}`]],
    ] as const) {
      for (const path of paths) {
        const body = await (await (c as Client).get(path)).text();
        assert.ok(!body.includes(MONA.display_name) && !body.includes(MONA.username), `${who}, ${path}: nothing of the guardian`);
      }
    }
  });

  it('old code shows no exam and no mark to anyone: the learner, the guardian, the publisher, the admin', async () => {
    if (!(await tableExists('exam'))) return;
    assert.equal(await count('SELECT COUNT(*) AS n FROM exam_result'), 2, 'a published mark and a draft are stored');
    const people = [
      ['the learner', await signedIn(worker.url, SALMA.username, SALMA.password), [`/s/${spaceId}`, `/s/${spaceId}/learn/${content.subject}`, `/s/${spaceId}/results`, `/s/${spaceId}/results/result-1`]],
      ['the guardian', await signedIn(worker.url, MONA.username, MONA.password), [`/s/${spaceId}`, `/s/${spaceId}/linked/${ids[SALMA.username]}`, `/s/${spaceId}/results/result-1`]],
      ['the publisher', await signedIn(worker.url, HADEER.username, HADEER.password), [`/s/${spaceId}`, `/s/${spaceId}/publish/edit/${content.subject}`, `/s/${spaceId}/publish/edit/${content.subject}/marks`, `/s/${spaceId}/publish/marks/exam-1`]],
      ['the admin', await signedIn(worker.url, ADMIN.username, ADMIN.password), [`/s/${spaceId}`, `/s/${spaceId}/admin/people`, `/s/${spaceId}/admin/topics/${content.subject}`]],
    ] as const;
    for (const [who, c, paths] of people) {
      for (const path of paths) {
        const body = await (await (c as Client).get(path)).text();
        for (const word of MARKS_SHOWN_TO_NOBODY) assert.ok(!body.includes(word), `${who}, ${path}: shows no ${word}`);
      }
    }
  });

  it('W2 AT-3.3 old code shows nobody anything of a done mark, writes none and deletes none', async () => {
    assert.ok(await tableExists('done_mark'), 'the rollback job gave the old code the done-mark migration');
    const marks = async () => (await worker.sql('SELECT space_id, lesson_id, learner_user_id, marked_at FROM done_mark'))
      .map((r) => [r.space_id, r.lesson_id, r.learner_user_id, Number(r.marked_at)]);
    const before = await marks();
    assert.deepEqual(before, [[spaceId, content.lesson, ids[SALMA.username], 1951234567890]], 'Salma\'s done mark is stored');
    const people = [
      ['the learner', await signedIn(worker.url, SALMA.username, SALMA.password), [`/s/${spaceId}`, `/s/${spaceId}/learn/${content.subject}`, `/s/${spaceId}/read/${content.lesson}`]],
      ['the guardian', await signedIn(worker.url, MONA.username, MONA.password), [`/s/${spaceId}`, `/s/${spaceId}/linked/${ids[SALMA.username]}`]],
      ['the publisher', await signedIn(worker.url, HADEER.username, HADEER.password), [`/s/${spaceId}`, `/s/${spaceId}/publish/edit/${content.subject}`]],
      ['the admin', await signedIn(worker.url, ADMIN.username, ADMIN.password), [`/s/${spaceId}`, `/s/${spaceId}/admin/people`, `/s/${spaceId}/admin/topics/${content.subject}`]],
    ] as const;
    for (const [who, c, paths] of people) {
      for (const path of paths) {
        const body = await (await (c as Client).get(path)).text();
        for (const sign of ['done-state', 'data-done', 'Mark as done', 'Mark as not done', '1951234567890', '1951234567']) {
          assert.ok(!body.includes(sign), `${who}, ${path}: nothing of the done mark (${sign})`);
        }
      }
    }
    assert.deepEqual(await marks(), before, 'old code wrote no done mark and deleted none');
  });

  it('W3b AT-5.5 old code shows nothing of an upload, refuses the no-password person as a wrong password, and its reset link sets the password', async () => {
    assert.ok(await tableExists('class_upload'), 'the rollback job gave the old code the upload migration');
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const path of [`/s/${spaceId}`, `/s/${spaceId}/admin/people`, `/s/${spaceId}/admin/people/nopass-1`, `/s/${spaceId}/admin/upload`]) {
      const body = await (await admin.get(path)).text();
      for (const sign of ['upload-1', 'class_upload', 'No password yet', 'بلا كلمة مرور', 'Add from a spreadsheet', 'إضافة من جدول', 'AAAAAAAAAAAAAAAAAAAAAA']) {
        assert.ok(!body.includes(sign), `the admin, ${path}: nothing of an upload (${sign})`);
      }
    }
    // Sign-in: the no-password person is refused exactly as Hadeer with a wrong password (the same answer, the same full hash).
    const attempt = async (username: string, password: string) => {
      const c = new Client(worker.url);
      const started = performance.now();
      const res = await c.post('/signin', { username, password });
      const ms = performance.now() - started;
      return { status: res.status, body: (await res.text()).split(username).join('<user>'), ms };
    };
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const wrong = [await attempt(HADEER.username, 'not-her-password'), await attempt(HADEER.username, 'password123')];
    const none = [await attempt(NO_PASSWORD.username, ''), await attempt(NO_PASSWORD.username, 'password123'), await attempt(NO_PASSWORD.username, NO_PASSWORD.display_name)];
    for (const n of none) {
      assert.equal(n.status, wrong[1].status, 'the same status as a wrong password');
      assert.equal(n.body, wrong[1].body, 'the same page as a wrong password');
    }
    const ratio = median(none.slice(1).map((n) => n.ms)) / median(wrong.map((x) => x.ms));
    assert.ok(ratio > 0.4 && ratio < 2.5, `the refusal takes as long as a wrong password (the full hash runs): ratio ${ratio.toFixed(2)}`);
    // The old code's reset link (the admin's person page) still sets a password, and the person then signs in.
    const issued = await admin.post(`/s/${spaceId}/admin/people/nopass-1/link`, {});
    assert.equal(issued.status, 200, 'the admin issues a reset link for the no-password person');
    const token = /\/r\/([A-Za-z0-9_-]{20,})/.exec(await issued.text())?.[1];
    assert.ok(token, 'the link is shown once');
    const set = await new Client(worker.url).post(`/r/${token}`, { username: NO_PASSWORD.username, new_password: 'nopass-new-pass' });
    assert.equal(set.status, 200, 'the link sets the password');
    const signin = await new Client(worker.url).post('/signin', { username: NO_PASSWORD.username, password: 'nopass-new-pass' });
    assert.equal(signin.status, 302, 'the person signs in with the password they set');
    assert.notEqual(String((await worker.sql("SELECT password_hash FROM user WHERE id = 'nopass-1'"))[0].password_hash).split('$')[2], 'AAAAAAAAAAAAAAAAAAAAAA', 'a real hash now');
    assert.equal(await count("SELECT COUNT(*) AS n FROM class_upload WHERE id = 'upload-1'"), 1, 'the upload row is untouched');
    assert.equal(await count("SELECT COUNT(*) AS n FROM membership WHERE class_upload_id = 'upload-1'"), 1, 'the membership keeps its upload id');
  });

  it('old code writes no lesson-view row and deletes nothing release 2 stored', async () => {
    const before = await release2Rows();
    const salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    for (let i = 0; i < 2; i++) {
      for (const path of [`/learn/${content.subject}`, `/read/${content.lesson}`, `/file/${content.pdf}`]) {
        assert.equal((await salma.get(`/s/${spaceId}${path}`)).status, 200);
      }
    }
    const mona = await signedIn(worker.url, MONA.username, MONA.password);
    await mona.get(`/s/${spaceId}`);
    assert.deepEqual(await release2Rows(), before, 'the same rows, nothing added, nothing deleted');
    assert.equal(before.guardian_link, 1);
    assert.equal(before.guardian_membership, 1);
    assert.deepEqual([before.lesson_view, before.lesson_view_setting], [1, 1], 'Salma\'s opens wrote no lesson-view row, and the stored one stays');
    if (await tableExists('done_mark')) {
      assert.equal(before.done_mark, 1, 'Salma\'s done mark is still there, and old code wrote no other');
      const kept = await worker.sql('SELECT space_id, lesson_id, learner_user_id, marked_at FROM done_mark');
      assert.deepEqual(kept.map((r) => [r.space_id, r.lesson_id, r.learner_user_id, Number(r.marked_at)]), [[spaceId, content.lesson, ids[SALMA.username], 1951234567890]], 'unchanged');
    }
    if (await tableExists('exam')) {
      assert.deepEqual([before.exam, before.exam_result, before.exam_result_history], [2, 2, 1], 'the exams, marks and history are all still there');
      const published = await worker.sql(`SELECT mark, published_at FROM exam_result WHERE id = 'result-1'`);
      assert.deepEqual(published.map((r) => [Number(r.mark), Number(r.published_at)]), [[17.5, 1]], 'unchanged');
    }
  });

  it('W4 AT-5.3 old code opens every lesson of a subject set in order (no lock) and writes nothing to the setting', async () => {
    const column = await worker.sql("SELECT name FROM pragma_table_info('subject') WHERE name = 'chapters_in_order'");
    assert.equal(column.length, 1, 'the rollback job gave the old code the wave 4 migration');
    await worker.sql(`UPDATE subject SET chapters_in_order = 1 WHERE id = '${content.subject}'`);
    const setting = async () => (await worker.sql('SELECT id, chapters_in_order AS v FROM subject ORDER BY id')).map((r) => [r.id, Number(r.v)]);
    const before = await setting();
    assert.ok(before.some(([id, v]) => id === content.subject && v === 1), 'Mathematics is set in order');
    // Wave 4's markup by its ids (a bare "order-box" also matches today's CSS "border-box").
    const lockSigns = ['Locked', 'data-locked', 'id="order-box"', 'id="locked-lesson"', 'id="order-state"', 'Open in order', 'Opens when', 'Go to:', 'مغلق', 'تُفتح', 'بالترتيب'];
    // Fractions is not done by Salma: wave 4 code would lock Decimals; old code opens it.
    const salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    const outline = await salma.get(`/s/${spaceId}/learn/${content.subject}`);
    assert.equal(outline.status, 200);
    const outlineBody = await outline.text();
    assert.ok(outlineBody.includes(`/read/${later}`), 'the later chapter\'s lesson is a link on the outline');
    const read = await salma.get(`/s/${spaceId}/read/${later}`);
    assert.equal(read.status, 200, 'the later lesson opens');
    const readBody = await read.text();
    assert.ok(readBody.includes('Tenths and hundredths'), 'with its material');
    for (const [where, body] of [['outline', outlineBody], ['lesson', readBody]] as const) {
      for (const sign of lockSigns) assert.ok(!body.includes(sign), `${where}: no lock (${sign})`);
    }
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const [c, path] of [[hadeer, `/s/${spaceId}/publish/edit/${content.subject}`], [admin, `/s/${spaceId}/admin/topics/${content.subject}`]] as const) {
      const body = await (await c.get(path)).text();
      assert.ok(!body.includes('id="order-state"'), `${path}: no setting card in old code`);
      // Wave 4's setting addresses do not exist in old code: nothing is written.
      const res = await c.post(`${path}/order`, { state: 'off' });
      assert.ok(res.status >= 400, `${path}/order is not an address of old code (${res.status})`);
    }
    assert.deepEqual(await setting(), before, 'old code wrote nothing to the setting');
  });

  it('W5 AT-5.3 old code shows no announcement anywhere, has no announcement address and writes nothing to the table', async () => {
    assert.ok(await tableExists('announcement'), 'the rollback job gave the old code the wave 5 migration');
    const texts = ['Quiz moved to Sunday (rollback).', 'Parents evening (rollback).'];
    for (const [i, [role, body]] of [['publisher', texts[0]], ['admin', texts[1]]].entries()) {
      await worker.sql(`INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at) VALUES ('ann-${i}', '${spaceId}', '${content.subject}', '${body}', '${role}', '2026-11-1${i}T08:00:00.000Z')`);
    }
    const rows = async () => (await worker.sql('SELECT * FROM announcement ORDER BY id')).map((r) => JSON.stringify(r));
    const before = await rows();
    const signs = [...texts, 'id="announcements"', 'ann-item', 'Announcements', 'الإعلانات', '/announcements'];
    const salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const editor = `/s/${spaceId}/publish/edit/${content.subject}`;
    const topic = `/s/${spaceId}/admin/topics/${content.subject}`;
    for (const [who, c, path] of [
      ['Salma', salma, `/s/${spaceId}`], ['Salma', salma, `/s/${spaceId}/learn/${content.subject}`], ['Salma', salma, `/s/${spaceId}/read/${content.lesson}`],
      ['Hadeer', hadeer, editor], ['Hadeer', hadeer, `/s/${spaceId}/learn/${content.subject}`], ['Amal', admin, topic], ['Amal', admin, `/s/${spaceId}/learn/${content.subject}`],
    ] as const) {
      const res = await c.get(path);
      assert.equal(res.status, 200, `${who} ${path}`);
      const body = await res.text();
      for (const sign of signs) assert.ok(!body.includes(sign), `${who} ${path}: no announcement (${sign})`);
    }
    // Wave 5's addresses do not exist in old code: nothing is written.
    for (const [c, path] of [[hadeer, editor], [admin, topic]] as const) {
      for (const [method, sub] of [['POST', '/announcements'], ['GET', '/announcements/ann-0'], ['POST', '/announcements/ann-0'], ['POST', '/announcements/ann-1/remove']] as const) {
        const res = method === 'GET' ? await c.get(path + sub) : await c.post(path + sub, { body: 'Written by old code?' });
        assert.ok(res.status >= 400, `${method} ${path}${sub} is not an address of old code (${res.status})`);
      }
    }
    assert.deepEqual(await rows(), before, 'old code wrote nothing to the announcement table and deleted nothing');
  });

  // LMS wave 6 (W6-1a, product-contract v2 on PIL-257, AT-5.3): stored due dates on a lesson and a chapter.
  it('W6 AT-5.3 old code shows no due date anywhere, has no due-dates address and writes no due date', async () => {
    // Each table named: D1 refuses pragma_table_info over its own _cf_ tables (SQLITE_AUTH, CI run 44885855489).
    const columns = await worker.sql("SELECT 'chapter' AS t FROM pragma_table_info('chapter') WHERE name = 'due_on' UNION ALL SELECT 'lesson' FROM pragma_table_info('lesson') WHERE name = 'due_on'");
    assert.deepEqual(columns.map((r) => String(r.t)), ['chapter', 'lesson'], 'the rollback job gave the old code the wave 6 migration');
    const chapter = String((await worker.sql(`SELECT chapter_id AS c FROM lesson WHERE id = '${content.lesson}'`))[0].c);
    await worker.sql(`UPDATE lesson SET due_on = '2026-12-12' WHERE id = '${content.lesson}'`);
    await worker.sql(`UPDATE chapter SET due_on = '2026-12-13' WHERE id = '${chapter}'`);
    const dates = async () => (await worker.sql("SELECT 'chapter' AS k, id, due_on FROM chapter UNION ALL SELECT 'lesson', id, due_on FROM lesson ORDER BY 1, 2")).map((r) => JSON.stringify(r));
    const before = await dates();
    const signs = ['2026-12-12', '2026-12-13', 'id="due-dates"', 'id="todo"', 'due-', 'Due dates', 'مواعيد الإنجاز', '/due'];
    const salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const editor = `/s/${spaceId}/publish/edit/${content.subject}`;
    const topic = `/s/${spaceId}/admin/topics/${content.subject}`;
    for (const [who, c, path] of [
      ['Salma', salma, `/s/${spaceId}`], ['Salma', salma, `/s/${spaceId}/learn/${content.subject}`], ['Salma', salma, `/s/${spaceId}/read/${content.lesson}`],
      ['Hadeer', hadeer, editor], ['Hadeer', hadeer, `/s/${spaceId}/learn/${content.subject}`], ['Amal', admin, topic],
    ] as const) {
      const res = await c.get(path);
      assert.equal(res.status, 200, `${who} ${path}`);
      const body = (await res.text()).replace(/<style>[\s\S]*?<\/style>/g, '');
      for (const sign of signs) assert.ok(!body.includes(sign), `${who} ${path}: no due date (${sign})`);
    }
    // Wave 6's addresses do not exist in old code: nothing is written.
    for (const [c, path] of [[hadeer, editor], [admin, topic]] as const) {
      for (const [method, sub] of [['GET', '/due'], ['POST', `/due/lesson/${content.lesson}`], ['POST', `/due/chapter/${chapter}`]] as const) {
        const res = method === 'GET' ? await c.get(path + sub) : await c.post(path + sub, { due_on: '2026-12-20' });
        assert.ok(res.status >= 400, `${method} ${path}${sub} is not an address of old code (${res.status})`);
      }
    }
    assert.deepEqual(await dates(), before, 'old code wrote no due date and deleted none');
  });
});
