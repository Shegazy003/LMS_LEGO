// AT-13b (contract product-contract-r2, R2-a, R2-b and R2-c pages): the forbidden-string scan
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
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { issueLink } from '../support/admin.ts';
import { ADMIN, C, D, HADEER, KARIM, OTHER_ADMIN, SHIMAA, personPath } from '../at9/world.ts';
import { OWNER } from '../support/seed.ts';
import {
  A, B, G1, G2, UPLOADED, annHits, crawl, doneHits, doneWords, guardianPaths, lockHits, privacyWorld, resultPaths, todoHits, uploadHits, useLanguage, withAnnouncements, withDoneMarks, withDueDates, withLocks, withUpload, type PrivacyWorld,
} from './pages.ts';
import { corrected } from '../at12/corrections.ts';

const EVERYONE = [ADMIN, OTHER_ADMIN, HADEER, SHIMAA, A, B, C, D, KARIM, G1, G2];
// R2-b: each learner's published score, which only that learner may read (AT-11a); A's draft, which nobody may.
// R2-c: a guardian reads the scores of the learners linked to them (AT-11d): A's score is A's and her
// guardians' (G1, G2 and the dual-role B). Before the scan Hadeer corrects A's 17 to 18 with a reason
// (AT-12a): the previous value and the reason are forbidden to every guardian and learner.
const REASON = 'Question 4 re-marked after review';
const SCORES: [string[], string][] = [
  [[A.username, G1.username, G2.username, B.username], '18 / 20'], [[C.username], '12 / 20'], [[D.username], '15.5 / 20'],
  [[], '9 / 10'], [[], '17 / 20'], [[], REASON],
];

/** Every written form of a full mobile number, and its last eight digits (more than the four a page may show). */
function mobileForms(typed: string, countryCode = '20'): string[] {
  const national = typed.replace(/\D/g, '').replace(/^0/, '');
  return [typed, national, `+${countryCode}${national}`, `${countryCode}${national}`, national.slice(-8)];
}

const cookieOf = (c: Client) => c.lastSetCookie.map((l) => l.match(/^lms_session=([^;]+)/)?.[1]).find(Boolean) ?? '';

test('AT-13b done-mark scan self-check (LMS wave 2, AT-2.4): tags, done states and status lines are found; the own "Mark as done" of a learner is not', () => {
  const tag = '<p id="done-tag" class="done-tag" data-done="tag"><span aria-hidden="true">✓</span><span>Done</span></p>';
  assert.deepEqual(doneHits(tag, doneWords(false)), ['en doneTag', 'the tick marker data-done']);
  assert.deepEqual(doneHits(tag, doneWords(true)), ['the tick marker data-done'], 'for a learner the tag is found by its marker');
  assert.deepEqual(doneHits('<p role="status">وُضعت علامة &quot;تمّ&quot;.</p>', doneWords(true)), ['ar markedDone']);
  assert.deepEqual(doneHits('<button class="undo">Mark as not done</button>', doneWords(true)), ['en markNotDone']);
  // W2-1b: the outline's ticks and progress lines.
  const tick = '<li class="is-done"><span class="tick" data-done="lesson"><span aria-hidden="true">✓</span><span class="sr-only">Done</span></span><a href="/x">Adding</a></li>';
  assert.deepEqual(doneHits(tick, doneWords(false)), ['en doneTag', 'the tick marker data-done']);
  assert.deepEqual(doneHits(tick, doneWords(true)), ['the tick marker data-done'], 'for a learner the tick is found by its marker');
  assert.deepEqual(doneHits('<p id="done-progress">المُنجَز من الدروس: 3 من 5</p>', doneWords(true)), ['ar doneProgress']);
  assert.deepEqual(doneHits('<p>All done: 5 lessons</p>', doneWords(true)), ['en allDone', 'en chapterAllDone']);
  const own = '<form id="done-control" method="post"><button type="submit">وضع علامة &quot;تمّ&quot;</button></form><button>Mark as done</button>';
  assert.deepEqual(doneHits(own, doneWords(true)), [], 'the not-done button of a learner, their own');
  assert.deepEqual(doneHits(own, doneWords(false)).sort(), ['ar doneTag', 'ar markDone', 'en markDone'], 'on a guardian page even the button is found');
});

describe('AT-13b the forbidden-string scan finds nothing a guardian or learner can reach, in Arabic and English', { concurrency: false }, () => {
  let w: PrivacyWorld;
  const resetTokens: string[] = [];
  let uploadId = '';
  before(async () => {
    w = await privacyWorld();
    // Reset links that exist while the viewers look around (their tokens must never reach a page).
    for (const person of [A, G1]) {
      const issued = await issueLink(w.admin, personPath(w, w.ids[person.username]));
      assert.equal(issued.status, 200);
      resetTokens.push(issued.token);
    }
    await corrected(w, w.hadeer, w.exam, w.ids[A.username], { mark: '18', reason: REASON });
    // LMS wave 2 (W2-1, AT-2.4): A's done marks are present while the others look around.
    await withDoneMarks(w);
    // LMS wave 3b (W3b-1, AT-4.3): people added from a spreadsheet are present too.
    uploadId = await withUpload(w);
    // LMS wave 4 (W4-1a, AT-4.5): A's locks are present too (Arabic in order, its second chapter locked for A).
    await withLocks(w);
    // LMS wave 5 (W5-1b, AT-3.1): announcements on A's Arabic and on Mathematics are present too.
    await withAnnouncements(w);
    // LMS wave 6 (W6-1b, AT-3.1): due dates on A's Arabic and on Mathematics are present too (A's to-do block on her home).
    await withDueDates(w);
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
      for (const [readers, score] of SCORES) if (!readers.includes(viewer.username)) forbidden.set(`"${score}", which ${readers.join(', ') || 'nobody'} may read`, score);
      // LMS wave 3b (AT-4.3): the people added from a spreadsheet, their usernames and every form of their numbers.
      for (const p of UPLOADED) {
        forbidden.set(`username ${p.username}`, p.username);
        mobileForms(p.mobile).forEach((f, i) => forbidden.set(`${p.username}'s mobile (${i === 4 ? 'last eight digits' : `form ${i}`})`, f));
      }

      const typed = [
        `/s/${w.spaceId}/admin/upload`, `/s/${w.spaceId}/admin/upload/sheet.csv`, `/s/${w.spaceId}/admin/upload/${uploadId}`,
        ...Object.values(w.ids).map((id) => `/s/${w.spaceId}/linked/${id}`),
        `/s/${w.spaceId}/learn/${w.content.arabic}`, `/s/${w.spaceId}/learn/${w.content.physics}`, `/s/${w.spaceId}/read/${w.content.lesson}`,
        `/s/${w.spaceId}/file/${w.content.pdf}`, `/s/${w.otherSpaceId}`, `/s/${w.otherSpaceId}/read/${w.content.otherLesson}`,
        `/s/${w.spaceId}/admin/people`, `/s/${w.spaceId}/admin/people/${w.ids[A.username]}`, `/home`, `/account`, `/account/language`,
        ...resultPaths(w),
      ];
      // LMS wave 2 (AT-2.4): A's done marks reach nobody else; B is a learner too, so B's own "Mark as done" is B's.
      const done = viewer === A ? null : doneWords(viewer === B);
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
          if (text && done) assert.deepEqual(doneHits(page.body, done), [], `done marks: ${lang} ${page.path} (${page.status})`);
          // LMS wave 3b: nothing of an upload (no upload word, no "No password yet") on a guardian's or learner's page.
          if (text) assert.deepEqual(uploadHits(page.body), [], `upload words: ${lang} ${page.path} (${page.status})`);
          // LMS wave 4 (AT-4.5): A's locks reach nobody else (no lock word, reason, order line, Go to or marker); B is not assigned Arabic.
          if (text && viewer !== A) assert.deepEqual(lockHits(page.body), [], `lock state: ${lang} ${page.path} (${page.status})`);
          // LMS wave 5 (AT-3.1): no announcement on a guardian page: every page of G1 and G2, and the dual-role B's guardian pages.
          if (text && (viewer === G1 || viewer === G2 || (viewer === B && page.path.includes('/linked')))) assert.deepEqual(annHits(page.body), [], `announcements: ${lang} ${page.path} (${page.status})`);
          // LMS wave 6 (AT-3.1): no to-do state or due date on a guardian page (the same pages).
          if (text && (viewer === G1 || viewer === G2 || (viewer === B && page.path.includes('/linked')))) assert.deepEqual(todoHits(page.body), [], `to-do and due dates: ${lang} ${page.path} (${page.status})`);
        }
      }
      assert.ok(scanned >= 30, `${viewer.username}: bodies scanned ${scanned}`);
    });
  }

  // LMS wave 3a (contract section 11): Amal's preview home ("View as"), with the same
  // forbidden list, plus every learner's and guardian's name; the crawl stays inside the
  // preview (its pages, the files and the logo they load).
  it(`${ADMIN.username}: every preview page reachable from the preview home, Arabic and English`, async () => {
    const c = new Client(w.p.url);
    assert.equal((await c.post('/signin', { username: ADMIN.username, password: ADMIN.password })).status, 302);
    const session = cookieOf(c);
    assert.ok(session, 'the session value is known to the test');
    const forbidden = new Map<string, string>();
    for (const p of [...EVERYONE, OWNER as { username: string; password: string; mobile: string }]) {
      forbidden.set(`${p.username}'s password`, p.password);
      if (p.username !== ADMIN.username && p !== OWNER) forbidden.set(`username ${p.username}`, p.username);
      mobileForms(p.mobile).forEach((f, i) => forbidden.set(`${p.username}'s mobile (${i === 4 ? 'last eight digits' : `form ${i}`})`, f));
    }
    for (const p of [A, B, C, D, KARIM, G1, G2]) forbidden.set(`the name of ${p.username}`, p.display_name);
    forbidden.set('the session value', session);
    resetTokens.forEach((t, i) => forbidden.set(`reset token ${i}`, t));
    for (const [readers, score] of SCORES) forbidden.set(`"${score}", which ${readers.join(', ') || 'nobody'} may read`, score);

    const inside = (p: string) => p.startsWith(`/s/${w.spaceId}/preview`) || p.startsWith(`/s/${w.spaceId}/file/`) || p === `/s/${w.spaceId}/logo`;
    let scanned = 0;
    for (const lang of ['ar', 'en'] as const) {
      await useLanguage(c, lang);
      const pages = await crawl(c, [`/s/${w.spaceId}/preview?from=home`], [`/s/${w.spaceId}/preview/results?from=home`], 80, inside);
      assert.ok(pages.some((p) => p.path.startsWith(`/s/${w.spaceId}/preview/read/`) && p.status === 200), `${lang}: the crawl reached a preview lesson`);
      for (const page of pages) {
        scanned++;
        const lower = page.body.toLowerCase();
        const text = page.contentType.startsWith('text/');
        const hits = [...forbidden].filter(([name, value]) => value && (text || !name.includes('last eight')) && lower.includes(value.toLowerCase())).map(([name]) => name);
        assert.deepEqual(hits, [], `${lang} ${page.path} (${page.status})`);
        // LMS wave 2 (AT-2.4, AT-4.3): the preview draws only the inert "Mark as done", never a tick, tag or progress line.
        if (text) assert.deepEqual(doneHits(page.body, doneWords(true)), [], `done marks: ${lang} ${page.path} (${page.status})`);
      }
    }
    assert.ok(scanned >= 10, `${ADMIN.username} (preview): bodies scanned ${scanned}`);
  });
});
