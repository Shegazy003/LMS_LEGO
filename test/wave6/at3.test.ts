// LMS wave 6, W6-1b (product-contract v2 on PIL-257, AT-3.2 and AT-3.3): the
// reading staff see the outline's due lines but no to-do block, and the wave 3a
// preview shows the list exactly as a learner with no done marks sees it.
// (AT-3.1 compares pages with W5-main and lives in base.test.ts; AT-3.4b too.)
// One describe per labelled expectation, each its own CI step, each on a fresh
// world with the clock pinned (W6-c). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utcDatePlusDays } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import {
  ADMIN, AT, HADEER, NOUR6, SALMA, as, closeWave6, home, subjectPath, wave6World, withW6b,
  type W6a, type Wave1World,
} from './world.ts';
import { cardSubjectsOf, dueLinesOf, listed, stripOf, todoOf, todoPath } from './todo.ts';

/** GET a page (expects 200), as HTML. */
async function html(c: { get(p: string): Promise<Response> }, path: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${path} answers 200`);
  return res.text();
}

/** The to-do block's own markup, or null (any section#todo: staff pages have neither the strip nor the block). */
const todoMarkup = (doc: string) => /<section id="todo"[\s\S]*?<\/section>/.exec(doc)?.[0] ?? null;

/** LMS redesign R1a (UX-34/UX-54/UX-62 rows): the home's #todo is the due-soon strip; a preview shows it as the learner's, "see all" inert. */
const stripMarkup = (doc: string) => stripOf(doc)?.markup ?? null;

/** A preview page's addresses as the learner's (wave 3a's preview prefix and its from= return path removed). */
const unpreviewed = (doc: string, spaceId: string) =>
  doc.split(`/s/${spaceId}/preview`).join(`/s/${spaceId}`).replace(/(\?|&amp;)from=[^"#&]*/g, '').replace(/"\/s\/([^"?]+)&amp;/g, '"/s/$1?');

/** The subjects of a home's cards. */
const cardSubjects = (doc: string) => new Set(cardSubjectsOf(doc));

const previewHome = (s: { id: string }) => `/s/${s.id}/preview?from=home`;
const previewSubject = (s: { id: string }, subjectId: string) => `/s/${s.id}/preview/learn/${subjectId}?from=home`;

// ------------------------------------------------------------------ AT-3.2 ----
describe('W6 AT-3.2 reading staff: Amal\'s and Hadeer\'s own Mathematics page shows the learner\'s due lines; their admin and publisher homes no to-do block; a person who is both a learner and an admin sees their own block on their learner home only', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => ({ w } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-3.2 due lines on the staff\'s own subject page equal Salma\'s; no to-do block on any staff home; Amal, also a learner in Nile Test Space, has her block there only', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const salma = await as(w, SALMA, lang);
      const amal = await as(w, ADMIN, lang);
      const hadeer = await as(w, HADEER, lang);
      const learnerLines = dueLinesOf(await html(salma, subjectPath(s, s.math)));
      assert.ok(learnerLines.size >= 8, `${lang}: Salma's outline has its due lines (${learnerLines.size})`);
      for (const [who, c] of [['Amal', amal], ['Hadeer', hadeer]] as const) {
        assert.deepEqual([...dueLinesOf(await html(c, subjectPath(s, s.math)))], [...learnerLines], `${lang} ${who}: the same due lines as the learner, in the same order`);
      }
      for (const [who, c, paths] of [['Amal', amal, [home(s), `/s/${s.id}/admin`]], ['Hadeer', hadeer, [home(s), `/s/${s.id}/publish`]]] as const) {
        for (const path of paths) assert.equal(todoMarkup(await html(c, path)), null, `${lang} ${who} ${path}: no to-do block`);
      }
    }
    // Amal: admin of the School space, and a learner of Nile Test Space's subject (W6-b, no marks).
    const nile = await withW6b(w);
    await seed(w.p.url, { spaceId: nile.id, grantedBy: 'nadia.w4', memberships: [{ username: ADMIN.username, role: 'learner', valid_until: utcDatePlusDays(60) }] });
    await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6-amal-nile', '${nile.id}', '${nile.subject}', '${w.ids[ADMIN.username] ?? (await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id}')`);
    const amal = await as(w, ADMIN, 'en');
    const nileHome = await html(amal, home(nile));
    assert.ok(stripOf(nileHome), 'Amal\'s learner home in Nile Test Space shows the due-soon strip');
    const v = todoOf(await html(amal, todoPath(nile))); // R1a: the full list is the to-do page
    assert.ok(v, 'Amal\'s learner home in Nile Test Space shows her to-do block');
    assert.deepEqual([...listed(v)], [nile.N1], 'built from her own (absent) marks: N1, and not the locked K2 or N3');
    for (const path of [home(s), `/s/${s.id}/admin`]) assert.equal(todoMarkup(await html(amal, path)), null, `Amal's School ${path}: still no to-do block`);
    t.diagnostic(`AT-3.2 due lines on the Mathematics page: ${dueLinesOf(await html(amal, subjectPath(s, s.math))).size} for Salma, Amal and Hadeer alike; Amal's Nile home lists ${[...listed(v)].join(', ')}`);
  });
});

// ------------------------------------------------------------------ AT-3.3 ----
describe('W6 AT-3.3 preview is exact: the preview home\'s block equals Nour Test\'s with the same subjects; the preview subject page\'s due lines equal hers; an unpublished subject\'s preview shows its dates; no preview request writes', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  before(async () => ({ w, a } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-3.3 (a) to (d), Hadeer and Amal, Arabic and English', async (t) => {
    t.diagnostic(`instant ${new Date(AT.noon).toISOString()}`);
    const s = w.school;
    const writes: string[] = [];
    let seenReads = 0;
    let previewing = false;
    w.p.faults!.set({
      seen: (sql) => {
        if (!previewing) return;
        if (/^\s*(SELECT|WITH)\b/i.test(sql)) seenReads++;
        else writes.push(sql);
      },
    });
    const preview = async (c: { get(p: string): Promise<Response> }, path: string) => {
      previewing = true;
      try {
        return await html(c, path);
      } finally {
        previewing = false;
      }
    };
    try {
      for (const lang of ['ar', 'en'] as const) {
        const hadeer = await as(w, HADEER, lang);
        const amal = await as(w, ADMIN, lang);
        const nour = await as(w, NOUR6, lang);
        // (a) Hadeer previews exactly Mathematics, the subject Nour Test is assigned: the blocks are the same, byte for byte.
        const hp = await preview(hadeer, previewHome(s));
        assert.deepEqual([...cardSubjects(hp)], [s.math], `${lang}: Hadeer's preview has the Mathematics card only`);
        const nourHome = await html(nour, home(s));
        assert.deepEqual([...cardSubjects(nourHome)], [s.math], `${lang}: Nour Test is assigned Mathematics only`);
        const nb = stripMarkup(nourHome);
        assert.ok(nb, `${lang}: Nour Test has a to-do block`);
        assert.equal(unpreviewed(stripMarkup(hp) ?? '', s.id), nb, `${lang}: Hadeer's preview block is byte-identical to Nour Test's (preview addresses normalised)`);
        // Amal previews every published subject: Nour Test's block lacks Arabic grammar's G1, the preview's has it.
        const ap = await preview(amal, previewHome(s));
        const subjects = cardSubjects(ap);
        assert.ok(subjects.has(s.math) && subjects.has(s.arabic), `${lang}: Amal's preview has Mathematics and Arabic grammar`);
        assert.ok(stripOf(ap)!.ids.includes(a.G1), `${lang}: Amal's preview lists G1`);
        assert.ok(!listed(todoOf(await html(nour, todoPath(s)))).has(a.G1), `${lang}: Nour Test's list does not`);
        assert.notEqual(unpreviewed(stripMarkup(ap) ?? '', s.id), nb, `${lang}: so the two blocks differ`);
        // (b) The preview subject page's due lines equal Nour Test's.
        const nourLines = [...dueLinesOf(await html(nour, subjectPath(s, s.math)))];
        assert.ok(nourLines.length >= 8, `${lang}: Nour Test's outline has its due lines`);
        for (const [who, c] of [['Hadeer', hadeer], ['Amal', amal]] as const) {
          assert.deepEqual([...dueLinesOf(await preview(c, previewSubject(s, s.math)))], nourLines, `${lang} ${who}: the preview subject page's due lines are Nour Test's`);
        }
      }
      // (a) again: Nour Test assigned exactly the subjects of Amal's preview: the blocks are the same.
      const amal = await as(w, ADMIN, 'en');
      const ap = await preview(amal, previewHome(s));
      const nourId = w.ids[NOUR6.username];
      for (const subject of cardSubjects(ap)) {
        if (subject === s.math) continue;
        await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w6-nour-${subject}', '${s.id}', '${subject}', '${nourId}')`);
      }
      const nour = await as(w, NOUR6, 'en');
      const nourHome = await html(nour, home(s));
      assert.deepEqual([...cardSubjects(nourHome)], [...cardSubjects(ap)], 'Nour Test now has exactly the preview\'s subjects');
      assert.equal(unpreviewed(stripMarkup(ap) ?? '', s.id), stripMarkup(nourHome), 'Amal\'s preview block is byte-identical to Nour Test\'s with the same subjects');
      // (c) An unpublished subject's preview shows its dates as the learner will see them once published.
      const hadeer = await as(w, HADEER, 'en');
      await w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`);
      const draft = [...dueLinesOf(await preview(hadeer, previewSubject(s, s.math)))];
      assert.ok(draft.length >= 8, `the unpublished subject's preview shows its due lines (${draft.length})`);
      await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`);
      assert.deepEqual([...dueLinesOf(await html(nour, subjectPath(s, s.math)))], draft, 'once published, the learner sees the same lines');
      // (d) No preview request wrote anything.
      assert.ok(seenReads > 20, `the statement spy saw the preview requests' reads (${seenReads})`);
      assert.deepEqual(writes, [], 'no preview request writes anything');
      t.diagnostic(`AT-3.3 preview blocks equal Nour Test's (Hadeer: Mathematics; Amal: ${cardSubjects(ap).size} subjects); due lines equal; unpublished preview ${draft.length} lines; preview statements: ${seenReads} reads, ${writes.length} writes`);
    } finally {
      w.p.faults!.set({});
    }
  });
});
