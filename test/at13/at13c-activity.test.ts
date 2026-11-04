// AT-13c on the R2-d pages (contract product-contract-r2): numbers stay masked
// as in release 1.1, and the H-1 no-secrets guard holds with the new pages and
// logs. The admin's switch page and its step, the guardian's lesson-activity
// pages and the learner's pages with the notice carry no person's number, not
// even its last digits; a run through the whole feature, in this process,
// logs nothing but fixed events, with no password, token, session, number,
// name or id (the guard itself runs in the same CI step,
// test/guards/log-redaction.test.ts).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { C, D, HADEER } from '../at9/world.ts';
import { activityPath, open, switchOn } from '../at15/activity.ts';
import { A, B, G1, G2, as, privacyWorld, useLanguage, visible, type PrivacyWorld } from './pages.ts';
import { ADMIN } from '../at9/world.ts';

const full = (typed: string) => {
  const national = typed.replace(/\D/g, '').replace(/^0/, '');
  return [national, `+20${national}`, `20${national}`, typed];
};

describe('AT-13c numbers stay masked on the lesson-activity pages', { concurrency: false }, () => {
  let w: PrivacyWorld;
  before(async () => {
    w = await privacyWorld();
    await switchOn(w);
    assert.equal((await open(w, A)).status, 200);
  });
  after(async () => {
    await w?.close();
  });

  it('no page of the feature carries any person\'s number, in Arabic or English', async () => {
    const people = [A, B, C, D, G1, G2, HADEER];
    const check = (where: string, html: string) => {
      for (const p of people) {
        for (const form of full(p.mobile)) assert.ok(!html.includes(form), `${where}: no number of ${p.username}`);
        assert.ok(!visible(html).includes(p.mobile.slice(-4)), `${where}: not even the last digits of ${p.username}`);
      }
    };
    const pages: [string, Awaited<ReturnType<typeof as>>, string][] = [
      ['the admin', w.admin, `/s/${w.spaceId}/admin/activity`], ['the admin', w.admin, `/s/${w.spaceId}/admin/activity/off`], ['the admin', w.admin, `/s/${w.spaceId}`],
      ['G1', await as(w, G1), activityPath(w, w.ids[A.username])], ['G1', await as(w, G1), activityPath(w, w.ids[B.username])], ['G1', await as(w, G1), `/s/${w.spaceId}/linked`],
      ['G2', await as(w, G2), activityPath(w, w.ids[A.username])], ['B', await as(w, B), activityPath(w, w.ids[A.username])],
      ['A', await as(w, A), `/s/${w.spaceId}`], ['A', await as(w, A), `/s/${w.spaceId}/read/${w.content.lesson}`],
    ];
    for (const lang of ['ar', 'en'] as const) {
      for (const [who, c, path] of pages) {
        await useLanguage(c, lang);
        const res = await c.get(path);
        assert.equal(res.status, 200, `${who} ${path}`);
        check(`${lang} ${who} ${path}`, await res.text());
      }
    }
  });
});

describe('AT-13c the logs of the whole feature hold no secret, name or id', { concurrency: false }, () => {
  let p: InProcessWorker;
  before(async () => {
    p = await startInProcess();
  });
  after(() => p?.stop());

  it('switch on, opens (one with a failed write), guardian pages, switch off: only fixed events are logged, and none holds a secret', async () => {
    const owner = await setUpOwner(p.url);
    const spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(p.url, {
      spaceId, grantedBy: ADMIN.username,
      people: [A, { ...G1, role: 'guardian' }].map((x) => ({ ...x, valid_until: utcDatePlusDays(30) })),
      links: [{ guardian: G1.username, learner: A.username }],
      subjects: [{ title: 'Mathematics', published: true, users: [A.username], chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions' }] }] }],
    });
    const lesson = s.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'].id;
    p.clearLog();
    const admin = await signedIn(p.url, ADMIN.username, ADMIN.password);
    assert.equal((await admin.post(`/s/${spaceId}/admin/activity`, { told: '1' })).status, 303);
    const a = await signedIn(p.url, A.username, A.password);
    p.setHooks({ rewrite: (sql, params) => { if (/^\s*INSERT INTO lesson_view\b/.test(sql)) throw new Error(`fault ${params.join(',')}`); return [sql, params]; } });
    assert.equal((await a.get(`/s/${spaceId}/read/${lesson}`)).status, 200);
    p.setHooks({});
    assert.equal((await a.get(`/s/${spaceId}/read/${lesson}`)).status, 200);
    const g1 = await signedIn(p.url, G1.username, G1.password);
    assert.equal((await g1.get(`/s/${spaceId}/linked/${s.users[A.username]}/activity`)).status, 200);
    assert.equal((await admin.post(`/s/${spaceId}/admin/activity/off`, {})).status, 303);
    await p.settle();
    const lines = p.log();
    assert.ok(lines.length >= 1, 'the failed write was logged');
    for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['event'], `a fixed event only: ${line}`);
    const log = lines.join('\n');
    for (const secret of [A.password, G1.password, ADMIN.password, A.mobile, G1.mobile, A.display_name, A.username, 'Adding fractions', lesson, s.users[A.username]]) {
      assert.ok(!log.includes(secret), `the log holds no ${secret}`);
    }
  });
});
