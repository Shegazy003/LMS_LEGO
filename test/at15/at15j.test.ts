// AT-15j (contract product-contract-r2, R2-d): no leak elsewhere. The
// lesson-activity phrase scan (section 3) finds nothing outside the exempt
// pages, and nothing in logs. No notification, email or message is ever sent
// about an open.
//
// Exempt (section 3): (1) the guardian's lesson-activity page in every state,
// with the "not switched on" line on the guardian's learner page; (2) the
// admin's switch page and its switch-off step; (3) the learner's notice line;
// (4) the docs. The links that lead to (1) and (2) carry the feature's name
// and nothing else; like the notice line they are marked data-activity and
// taken out before the scan (exemptRemoved, test/at13/pages.ts).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { activityIn, crawl, exemptRemoved, isExemptPage, useLanguage, visible } from '../at13/pages.ts';
import { A, ADMIN, B, C, G1, G2, HADEER, SHIMAA, as } from '../at9/world.ts';
import { activityWorld, open, switchOn, type ActivityWorld } from './activity.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('AT-15j the phrase scan finds nothing outside the exempt pages, for every person, in Arabic and English', { concurrency: false }, () => {
  let w: ActivityWorld;
  before(async () => {
    w = await activityWorld();
    await switchOn(w);
    for (const who of [A, B]) assert.equal((await open(w, who)).status, 200);
  });
  after(async () => {
    await w?.close();
  });

  for (const person of [ADMIN, HADEER, SHIMAA, A, B, C, G1, G2]) {
    it(`${person.username}: every page reached from their home`, async () => {
      const c = await as(w, person);
      let scanned = 0;
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        const typed = [`/s/${w.spaceId}/read/${w.content.lesson}`, `/s/${w.spaceId}/linked/${w.ids[A.username]}/activity`, `/s/${w.spaceId}/admin/activity`];
        for (const page of (await crawl(c, [`/s/${w.spaceId}`, '/home', '/account'], typed, 120)).filter((p) => p.contentType.startsWith('text/html'))) {
          if (isExemptPage(page.path)) continue;
          scanned++;
          // A phrase is the only way an open date is ever shown ("Last opened on <date>"), so no phrase means no open date.
          const rest = visible(exemptRemoved(page.body));
          assert.deepEqual(activityIn(rest).filter((h) => !h.startsWith('a ')), [], `${person.username} ${lang} ${page.path}: no lesson-activity phrase`);
        }
      }
      assert.ok(scanned >= 6, `${person.username}: pages scanned ${scanned}`);
    });
  }
});

describe('AT-15j the logs carry no phrase and no open, and nothing is ever sent about an open', { concurrency: false }, () => {
  let p: InProcessWorker;
  before(async () => {
    p = await startInProcess();
  });
  after(() => p?.stop());

  it('a whole run (switch on, opens, guardian pages, switch off) logs nothing about lessons and makes no outside request', async () => {
    const outside: string[] = [];
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new Request(input, init).url;
      if (!url.startsWith(p.url + '/')) outside.push(url);
      return inner(input, init);
    }) as typeof fetch;
    try {
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
      for (let i = 0; i < 3; i++) assert.equal((await a.get(`/s/${spaceId}/read/${lesson}`)).status, 200);
      const g1 = await signedIn(p.url, G1.username, G1.password);
      assert.equal((await g1.get(`/s/${spaceId}/linked/${s.users[A.username]}/activity`)).status, 200);
      assert.equal((await admin.post(`/s/${spaceId}/admin/activity/off`, {})).status, 303);
      await p.settle();
      const log = p.log().join('\n');
      assert.deepEqual(activityIn(log).filter((h) => !h.startsWith('a ')), [], 'no phrase in the logs');
      for (const s2 of [lesson, 'Adding fractions', A.display_name]) assert.ok(!log.includes(s2), `no ${s2} in the logs`);
      assert.deepEqual(outside, [], 'no request leaves the product: no notification, email or message');
    } finally {
      globalThis.fetch = inner;
    }
  });

  it('the product has no code that sends anything: no mail, message or notification', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const q = join(dir, n);
      return statSync(q).isDirectory() ? files(q) : q.endsWith('.ts') ? [q] : [];
    });
    for (const f of files(join(root, 'src'))) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      assert.ok(!/\bfetch\s*\(|sendEmail|send_email|nodemailer|smtp|webhook|push\s*notification/i.test(code), `${f}: sends nothing`);
    }
  });
});
