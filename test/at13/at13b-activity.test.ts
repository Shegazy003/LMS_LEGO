// AT-13b on the R2-d pages (contract product-contract-r2): the forbidden-string
// scan finds nothing on every page and response body a guardian or learner can
// reach with lesson activity on, in Arabic and English, including the
// dual-role person: the guardian's lesson-activity pages (every learner id
// typed), the learner's home and lesson pages with the notice. Forbidden
// (section 3): another person's mobile number or its digits beyond the last
// ones, any username but the viewer's own, any password, token or session
// value; and here, the name of a learner not linked to the viewer.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import { ADMIN, C, D, HADEER, KARIM, OTHER_ADMIN, SHIMAA } from '../at9/world.ts';
import { activityPath, open, switchOn } from '../at15/activity.ts';
import { A, B, G1, G2, crawl, guardianPaths, privacyWorld, useLanguage, type PrivacyWorld } from './pages.ts';

const EVERYONE = [ADMIN, OTHER_ADMIN, HADEER, SHIMAA, A, B, C, D, KARIM, G1, G2];
/** The learners whose activity a viewer may see (their own pages aside). */
const SEES: Record<string, string[]> = { [G1.username]: [A.username, B.username], [G2.username]: [A.username], [B.username]: [A.username, B.username], [A.username]: [A.username] };

function mobileForms(typed: string): string[] {
  const national = typed.replace(/\D/g, '').replace(/^0/, '');
  return [typed, national, `+20${national}`, `20${national}`, national.slice(-8)];
}
const cookieOf = (c: Client) => c.lastSetCookie.map((l) => l.match(/^lms_session=([^;]+)/)?.[1]).find(Boolean) ?? '';

describe('AT-13b the forbidden-string scan on the lesson-activity pages, with activity on, in Arabic and English', { concurrency: false }, () => {
  let w: PrivacyWorld;
  before(async () => {
    w = await privacyWorld();
    await switchOn(w);
    for (const who of [A, B, C]) assert.equal((await open(w, who)).status, 200);
  });
  after(async () => {
    await w?.close();
  });

  for (const viewer of [G1, G2, B, A]) {
    it(`${viewer.username}: every page and response body`, async () => {
      const c = new Client(w.p.url);
      assert.equal((await c.post('/signin', { username: viewer.username, password: viewer.password })).status, 302);
      const forbidden = new Map<string, string>();
      for (const p of [...EVERYONE, OWNER as { username: string; password: string; mobile: string }]) {
        forbidden.set(`${p.username}'s password`, p.password);
        if (p.username !== viewer.username && p !== OWNER) forbidden.set(`username ${p.username}`, p.username);
        mobileForms(p.mobile).forEach((f, i) => forbidden.set(`${p.username}'s mobile (form ${i})`, f));
      }
      forbidden.set('the session value', cookieOf(c));
      // C's name is "Omar Test" (shared with D): no viewer here is linked to C or D.
      forbidden.set('the name of C and D', C.display_name);
      if (!SEES[viewer.username].includes(B.username)) forbidden.set('the name of B', B.display_name);
      const typed = [
        ...Object.values(w.ids).map((id) => activityPath(w, id)),
        `/s/${w.spaceId}/read/${w.content.lesson}`, `/s/${w.spaceId}/admin/activity`, `/s/${w.spaceId}/admin/activity/off`,
      ];
      let scanned = 0;
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        for (const page of await crawl(c, ['/home', ...guardianPaths(w)], typed)) {
          scanned++;
          const lower = page.body.toLowerCase();
          const text = page.contentType.startsWith('text/');
          const hits = [...forbidden].filter(([name, value]) => value && (text || !name.includes('form 4')) && lower.includes(value.toLowerCase())).map(([name]) => name);
          assert.deepEqual(hits, [], `${lang} ${page.path} (${page.status})`);
        }
      }
      assert.ok(scanned >= 20, `${viewer.username}: bodies scanned ${scanned}`);
    });
  }
});
