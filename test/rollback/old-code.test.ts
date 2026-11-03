// AT-14a (contract product-contract-r2, section 9): rollback holds. This file
// runs inside a checkout of the code that is live before release 2 (CI job
// "rollback": main at f3b1fa7, the H-1 version 528786a4, the rollback target),
// with release 2's migrations copied into that checkout's migrations/ folder,
// so the old code runs on a release 2 database. It uses only the old code's own
// test helpers (test/support/worker.ts, http.ts and seed.ts, unchanged since
// release 1.1).
//
// On that database there is a guardian membership row and a guardian link (and
// from R2-d a lesson-view row with the setting switched on, if those tables
// exist). Old code must show the guardian nothing (no learner, no subject, no
// lesson, no file), expose nothing to others, write no lesson-view row and
// delete nothing.
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

let worker: RunningWorker;
let spaceId = '';
let ids: Record<string, string> = {};
let content = { subject: '', lesson: '', pdf: '' };
const count = async (sql: string) => Number((await worker.sql(sql))[0].n);
const tableExists = async (name: string) => (await worker.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`)).length === 1;

/** The rows release 2 left, which old code must neither show nor delete. */
async function release2Rows(): Promise<Record<string, number>> {
  const out: Record<string, number> = {
    guardian_link: await count('SELECT COUNT(*) AS n FROM guardian_link'),
    guardian_membership: await count("SELECT COUNT(*) AS n FROM membership WHERE role = 'guardian'"),
  };
  for (const t of ['lesson_view', 'lesson_view_setting', 'exam', 'exam_result', 'exam_result_history']) {
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
        chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf('Pizza slices')), contentType: 'application/pdf' },
        ] }] }],
      }],
    });
    ids = s.users;
    const lesson = s.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'];
    content = { subject: s.subjects.Mathematics.id, lesson: lesson.id, pdf: lesson.materials.Worksheet };
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
  });
  after(async () => {
    await worker?.stop();
  });

  it('the release 2 migrations are applied to the database the old code runs on', async () => {
    const applied = (await worker.sql('SELECT name FROM d1_migrations ORDER BY id')).map((r) => String(r.name));
    assert.ok(applied.includes('0007_guardians.sql'), `applied: ${applied.join(', ')}`);
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
  });
});
