// AT-13b (contract product-contract-r2, R2-a and R2-b pages): the forbidden-string scan
// finds nothing on every page and response body a guardian or learner can
// reach, in Arabic and English, including the dual-role person. Forbidden
// (section 3): any other person's mobile number or digits of it beyond the
// last digits, any username other than the viewer's own, any password, token
// or session value. (Marks and learner names in log lines are 13c.) From R2-b
// the world holds published results and a draft, the learners reach My results
// and their own result pages, every result address is typed as well, and each
// learner's score is forbidden to every other viewer (the draft's to all).
//
// Each viewer's pages are found by following the links on the pages from
// their home, plus the addresses a curious person could type: every guardian
// address with every person's id, and other people's subjects, lessons and
// files. Response bodies of refusals and files are scanned too.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { issueLink } from '../support/admin.ts';
import { ADMIN, C, D, HADEER, KARIM, OTHER_ADMIN, SHIMAA, personPath } from '../at9/world.ts';
import { OWNER } from '../support/seed.ts';
import { A, B, G1, G2, crawl, guardianPaths, privacyWorld, resultPaths, useLanguage, type PrivacyWorld } from './pages.ts';

const EVERYONE = [ADMIN, OTHER_ADMIN, HADEER, SHIMAA, A, B, C, D, KARIM, G1, G2];
// R2-b: each learner's published score, which only that learner may read (AT-11a); A's draft, which nobody may.
const SCORES: [string, string][] = [[A.username, '17 / 20'], [C.username, '12 / 20'], [D.username, '15.5 / 20'], ['nobody (A\'s draft)', '9 / 10']];

/** Every written form of a full mobile number, and its last eight digits (more than the four a page may show). */
function mobileForms(typed: string, countryCode = '20'): string[] {
  const national = typed.replace(/\D/g, '').replace(/^0/, '');
  return [typed, national, `+${countryCode}${national}`, `${countryCode}${national}`, national.slice(-8)];
}

const cookieOf = (c: Client) => c.lastSetCookie.map((l) => l.match(/^lms_session=([^;]+)/)?.[1]).find(Boolean) ?? '';

describe('AT-13b the forbidden-string scan finds nothing a guardian or learner can reach, in Arabic and English', { concurrency: false }, () => {
  let w: PrivacyWorld;
  const resetTokens: string[] = [];
  before(async () => {
    w = await privacyWorld();
    // Reset links that exist while the viewers look around (their tokens must never reach a page).
    for (const person of [A, G1]) {
      const issued = await issueLink(w.admin, personPath(w, w.ids[person.username]));
      assert.equal(issued.status, 200);
      resetTokens.push(issued.token);
    }
  });
  after(async () => {
    await w?.close();
  });

  for (const viewer of [G1, G2, B, A]) {
    it(`${viewer.username}: every page and response body, Arabic and English`, async () => {
      const c = new Client(w.p.url);
      assert.equal((await c.post('/signin', { username: viewer.username, password: viewer.password })).status, 302);
      const session = cookieOf(c);
      assert.ok(session, 'the session value is known to the test');
      const forbidden = new Map<string, string>();
      for (const p of [...EVERYONE, OWNER as { username: string; password: string; mobile: string }]) {
        forbidden.set(`${p.username}'s password`, p.password);
        // The owner's username is the plain word "owner", which pages may say; the owner's password and number are still scanned.
        if (p.username !== viewer.username && p !== OWNER) forbidden.set(`username ${p.username}`, p.username);
        mobileForms(p.mobile).forEach((f, i) => forbidden.set(`${p.username}'s mobile (${i === 4 ? 'last eight digits' : `form ${i}`})`, f));
      }
      forbidden.set('the session value', session);
      resetTokens.forEach((t, i) => forbidden.set(`reset token ${i}`, t));
      for (const [owner, score] of SCORES) if (owner !== viewer.username) forbidden.set(`the score of ${owner}`, score);

      const typed = [
        ...Object.values(w.ids).map((id) => `/s/${w.spaceId}/linked/${id}`),
        `/s/${w.spaceId}/learn/${w.content.arabic}`, `/s/${w.spaceId}/learn/${w.content.physics}`, `/s/${w.spaceId}/read/${w.content.lesson}`,
        `/s/${w.spaceId}/file/${w.content.pdf}`, `/s/${w.otherSpaceId}`, `/s/${w.otherSpaceId}/read/${w.content.otherLesson}`,
        `/s/${w.spaceId}/admin/people`, `/s/${w.spaceId}/admin/people/${w.ids[A.username]}`, `/home`, `/account`, `/account/language`,
        ...resultPaths(w),
      ];
      let scanned = 0;
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        for (const page of await crawl(c, ['/home', ...guardianPaths(w)], typed)) {
          scanned++;
          const lower = page.body.toLowerCase();
          // A file's bytes hold long digit runs of their own (a PDF's cross-reference table): there only whole numbers are looked for.
          const text = page.contentType.startsWith('text/');
          const hits = [...forbidden].filter(([name, value]) => value && (text || !name.includes('last eight')) && lower.includes(value.toLowerCase())).map(([name]) => name);
          assert.deepEqual(hits, [], `${lang} ${page.path} (${page.status})`);
        }
      }
      assert.ok(scanned >= 30, `${viewer.username}: bodies scanned ${scanned}`);
    });
  }
});
