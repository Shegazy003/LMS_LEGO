// LMS wave 5, W5-1b (product-contract v2 on PIL-246, AT-3.1 to AT-3.4): only
// the subject's own people see an announcement, and the preview shows it
// exactly. One world (wave 4's, lesson activity on, with W5-a and W5-b) is
// crawled twice in the same order, by Amal, Hadeer, Mona, the owner, Salma and
// the people of Nile Test Space, in Arabic and English: once with no Mesk
// School announcement stored, once with AT-2's. The pages AT-3.1 names must be
// byte-identical between the two crawls (after the AT-4 normalising: the
// owner's "usage today" block). AT-3.5 (reads) is in base.test.ts, beside
// main's counts. AT-3.4 (e), the wave 3a journey with announcements present, is
// test/wave3a/at3.test.ts run with LMS_W5_ANNOUNCEMENTS=1. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER } from '../support/seed.ts';
import type { Client } from '../support/http.ts';
import type { Lang } from '../../src/labels.ts';
import {
  ADMIN, AT2_ARABIC, AT2_MATH, FARES, HADEER, LINA4, MONA, NADIA, RANA5, SALMA, annBlock, as, blockTexts, cardLines, home, learnerBlockOf, post,
  publisherAnn, subjectPath, wave4World, withAt2, withNile5, withW5a, type Wave1World,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** The AT-4 normalising inside one product: the owner's "usage today" block (its counts move with every request). */
const normalised = (body: string) => body.replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]');
/** Preview addresses back to the learner's (contract AT-3.4: "after normalising preview addresses"). */
const unpreview = (html: string) => html.replace(/\/preview\/learn\//g, '/learn/').replace(/(\?|&amp;|&)from=[^"#&]*/g, '');

interface Got { who: string; lang: Lang; path: string; status: number; body: string }

const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);

/** Every page reachable from one start by links (GET), one at a time, in a stable order. */
async function crawl(c: Client, who: string, lang: Lang, start = '/', limit = 500): Promise<Got[]> {
  const seen = new Set<string>();
  const out: Got[] = [];
  const queue = [start];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await c.get(path);
    const type = res.headers.get('content-type') ?? '';
    const body = type.startsWith('text/') ? await res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
    out.push({ who, lang, path, status: res.status, body });
    if (res.status >= 300 && res.status < 400) {
      const to = (res.headers.get('location') ?? '').replace(/^https?:\/\/[^/]+/, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!type.startsWith('text/html')) continue;
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `${who} ${lang}: the crawl ends before ${limit} pages`);
  return out;
}

interface World {
  w: Wave1World;
  nile: Awaited<ReturnType<typeof withNile5>>;
  people: { who: string; c: Client; space?: string }[];
}

async function crawlAll(x: World): Promise<Got[]> {
  const out: Got[] = [];
  for (const lang of LANGS) {
    for (const p of x.people) {
      assert.equal((await p.c.post('/account/language', { lang })).status, 303);
      out.push(...(await crawl(p.c, p.who, lang)));
    }
  }
  return out;
}

/** The pages AT-3.1 names: every guardian page (Mona's), every owner page, every lesson and file page (Salma's and the previews'), every page of Nile Test Space. */
function named(g: Got, x: World): string | null {
  if (g.who === 'Mona') return 'guardian page';
  if (g.who === 'owner') return 'owner page';
  if (/\/(read|file)\//.test(g.path)) return 'lesson or file page';
  if (g.path.startsWith(`/s/${x.nile.id}`) || ['Nadia', 'Fares', 'Lina'].includes(g.who)) return 'page of space W5-b';
  return null;
}

describe('W5 AT-3 only the subject\'s own people see it; the preview shows it exactly', { concurrency: false }, () => {
  let x: World;
  let before0: Got[];
  let after1: Got[];
  before(async () => {
    const w = await wave4World({ activity: true });
    try {
      await withW5a(w);
      const nile = await withNile5(w);
      x = {
        w, nile,
        people: [
          { who: 'Amal', c: await as(w, ADMIN, 'en') },
          { who: 'Hadeer', c: await as(w, HADEER, 'en') },
          { who: 'Mona', c: await as(w, MONA, 'en') },
          { who: 'owner', c: await as(w, OWNER, 'en') },
          { who: 'Salma', c: await as(w, SALMA, 'en') },
          { who: 'Nadia', c: await as(w, NADIA, 'en') },
          { who: 'Fares', c: await as(w, FARES, 'en') },
          { who: 'Lina', c: await as(w, LINA4, 'en') },
        ],
      };
      await crawlAll(x); // a warm-up: notices told once, lesson opens recorded, sessions refreshed
      before0 = await crawlAll(x);
      await withAt2(w);
      after1 = await crawlAll(x);
    } catch (err) {
      await w.close();
      throw err;
    }
  });
  after(() => x?.w.close());

  it('W5 AT-3.1 no guardian, owner, lesson or file page and no page of Nile Test Space shows an announcement text or block; each is byte-identical to the same page with no announcements', (t) => {
    const texts = [...AT2_MATH, AT2_ARABIC].map(escaped);
    let compared = 0;
    const kinds: Record<string, number> = {};
    // The teachers' crawls reach more pages after (each item's edit and remove pages); every named page is in both.
    const key = (g: Got) => `${g.who} ${g.lang} ${g.path}`;
    const earlier = new Map(before0.map((g) => [key(g), g]));
    for (const g of after1) {
      const kind = named(g, x);
      if (!kind) continue;
      const b = earlier.get(key(g));
      assert.ok(b, `${key(g)} (${kind}) was reached with no announcements too`);
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      compared++;
      for (const s of texts) assert.ok(!g.body.includes(s), `${g.who} ${g.lang} ${g.path} (${kind}): no Mesk School announcement text`);
      const nileOwn = g.path.startsWith(`/s/${x.nile.id}/learn/`) || g.path === `/s/${x.nile.id}` || g.path.startsWith(`/s/${x.nile.id}/publish/edit/`) || g.path.startsWith(`/s/${x.nile.id}/admin/topics/`) || g.path.startsWith(`/s/${x.nile.id}/preview`);
      if (kind !== 'page of space W5-b' || !nileOwn) assert.ok(!g.body.includes('id="announcements"'), `${g.who} ${g.lang} ${g.path} (${kind}): no announcement block`);
      assert.equal(g.status, b.status, `${g.who} ${g.lang} ${g.path}: the same status`);
      assert.equal(normalised(g.body), normalised(b.body), `${g.who} ${g.lang} ${g.path} (${kind}): byte-identical to the page with no announcements`);
    }
    const later = new Set(after1.map(key));
    for (const b of before0.filter((g) => named(g, x))) assert.ok(later.has(key(b)), `${key(b)} is reached with announcements too`);
    t.diagnostic(`AT-3.1 ${compared} named pages compared: ${JSON.stringify(kinds)}`);
    for (const k of ['guardian page', 'owner page', 'lesson or file page', 'page of space W5-b']) assert.ok((kinds[k] ?? 0) > 0, `${k}s were crawled`);
    assert.ok(after1.some((g) => g.who === 'owner' && /\/owner\/spaces\/[^/]+\/preview/.test(g.path)), 'the owner\'s kit preview was crawled');
    assert.ok(after1.some((g) => g.who === 'Mona' && /\/linked\/[^/]+\/activity/.test(g.path)), 'Mona\'s activity page was crawled');
    // Nile's own announcement stays in Nile Test Space (W5-b).
    for (const g of after1.filter((y) => !y.path.startsWith(`/s/${x.nile.id}`))) assert.ok(!g.body.includes('Nile field trip on Thursday.'), `${g.who} ${g.path}: no Nile text outside Nile`);
  });

  it('W5 AT-3.2 no announcement block anywhere holds the writer\'s display name, mobile number or email, or any learner\'s name', async () => {
    const users = (await x.w.p.sql('SELECT display_name, mobile, username FROM user')) as { display_name: string; mobile: string; username: string }[];
    const forbidden = users.flatMap((u) => [u.display_name, u.mobile, u.mobile.replace(/^\+20/, '0'), u.mobile.slice(-8)]).filter((v) => v && v.length >= 4);
    let blocks = 0;
    for (const g of after1) {
      const block = annBlock(g.body);
      if (!block) continue;
      blocks++;
      for (const v of forbidden) assert.ok(!block.includes(escaped(v)), `${g.who} ${g.lang} ${g.path}: the block holds no "${v}"`);
      assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(block.replace(/<[^>]+>/g, ' ')), `${g.who} ${g.path}: no email address in the block`);
    }
    assert.ok(blocks > 20, `blocks were scanned (${blocks})`);
  });

  it('W5 AT-3.3 Amal\'s and Hadeer\'s own /learn page for Mathematics shows the block a learner sees; their admin and publisher homes are unchanged', async () => {
    const s = x.w.school;
    for (const lang of LANGS) {
      const salma = annBlock(await (await (await as(x.w, SALMA, lang)).get(subjectPath(s, s.math))).text());
      assert.ok(salma, `${lang}: Salma's block`);
      for (const who of [ADMIN, HADEER]) {
        const own = annBlock(await (await (await as(x.w, who, lang)).get(subjectPath(s, s.math))).text());
        assert.equal(own, salma, `${who.username} ${lang}: the same block as Salma's`);
      }
    }
    for (const who of ['Amal', 'Hadeer']) {
      for (const lang of LANGS) {
        const a = after1.find((g) => g.who === who && g.lang === lang && g.path === `/s/${s.id}`)!;
        const b = before0.find((g) => g.who === who && g.lang === lang && g.path === `/s/${s.id}`)!;
        assert.ok(a && b, `${who} ${lang}: the home was crawled`);
        assert.equal(normalised(a.body), normalised(b.body), `${who} ${lang}: the ${who === 'Amal' ? 'admin' : 'publisher'} home is unchanged`);
        assert.ok(!a.body.includes('id="announcements"'), `${who} ${lang}: no block on that home`);
      }
    }
  });

  it('W5 AT-3.4 (a) to (d) the preview subject page and home show the learner\'s blocks exactly, an unpublished subject\'s as once published, and no preview request writes', async () => {
    const w = x.w;
    const s = w.school;
    const spy = w.p.spy!;
    const writes: string[] = [];
    const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
    const ALLOWED = /^\s*(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?(session|usage\w*)\b/i;
    const preview = async (c: Client, path: string) => {
      spy.start();
      const res = await c.get(path);
      const body = await res.text();
      writes.push(...(await spy.stop()).filter((q) => WRITE.test(q) && !ALLOWED.test(q)));
      assert.equal(res.status, 200, path);
      return body;
    };
    for (const lang of LANGS) {
      const salma = await as(w, SALMA, lang);
      const rana = await as(w, RANA5, lang);
      const amal = await as(w, ADMIN, lang);
      const hadeer = await as(w, HADEER, lang);
      // (a) the preview subject page.
      const learnerBlock = annBlock(await (await salma.get(subjectPath(s, s.math))).text());
      for (const [who, c] of [['Amal', amal], ['Hadeer', hadeer]] as const) {
        const block = annBlock(await preview(c, `/s/${s.id}/preview/learn/${s.math}?from=home`));
        assert.ok(block, `${who} ${lang}: the preview subject page has the block`);
        assert.equal(unpreview(block), learnerBlock, `(a) ${who} ${lang}: byte-identical to Salma's`);
      }
      // (b) the preview home: Amal's from every published subject (Salma has them all); Hadeer's from Mathematics only (Rana Test has exactly that).
      // LMS redesign R1a (UX-55 row): the home's block became each card's line; the preview's lines equal the learner's.
      const lines = (html: string) => [...cardLines(html).values()].map((l) => [l.subject, l.ann, l.raw]);
      const amalHome = lines(await preview(amal, `/s/${s.id}/preview?from=home`));
      const salmaHome = lines(await (await salma.get(home(s))).text());
      assert.ok(amalHome.length && salmaHome.length, `${lang}: both homes have card lines`);
      assert.deepEqual(amalHome, salmaHome, `(b) Amal ${lang}: the preview home's lines equal Salma's (assigned every published subject)`);
      const hadeerHome = lines(await preview(hadeer, `/s/${s.id}/preview?from=home`));
      const ranaHome = lines(await (await rana.get(home(s))).text());
      assert.ok(hadeerHome.length && ranaHome.length, `${lang}: Hadeer's preview and Rana Test's home lines`);
      assert.deepEqual(hadeerHome, ranaHome, `(b) Hadeer ${lang}: the preview home's lines equal Rana Test's (assigned exactly Mathematics)`);
      assert.ok(!hadeerHome.some((l) => l[2] === escaped(AT2_ARABIC)), `(b) Hadeer ${lang}: not Arabic grammar's (not hers)`);
    }
    // (b) a world where Salma is not assigned every published subject: a new subject, published, not hers, with the newest announcement.
    const extra = 'w5-extra-subject';
    await w.p.sql(`INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES ('${extra}', '${s.id}', 'Extra club', NULL, 1)`);
    await post(w.admin, `/s/${s.id}/admin/topics/${extra}/announcements`, 'Extra club meets on Friday.');
    for (const lang of LANGS) {
      const salmaHome = cardLines(await (await (await as(w, SALMA, lang)).get(home(s))).text());
      const amalHome = cardLines(await preview(await as(w, ADMIN, lang), `/s/${s.id}/preview?from=home`));
      assert.ok(![...salmaHome.values()].some((l) => l.text === 'Extra club meets on Friday.'), `(b) ${lang}: Salma's home lacks the other subject's announcement`);
      assert.equal(amalHome.get(extra)?.text, 'Extra club meets on Friday.', `(b) ${lang}: the preview's card of that subject has it`);
    }
    // (c) an unpublished subject: Physics (Hadeer's) with an announcement; its preview shows it as a learner sees it once published.
    const hadeer = await as(w, HADEER, 'en');
    await post(hadeer, publisherAnn(s, s.physics), 'Physics starts next month.');
    const previews: Record<string, string> = {};
    for (const [who, c] of [['Amal', await as(w, ADMIN, 'en')], ['Hadeer', hadeer]] as const) {
      const block = annBlock(await preview(c, `/s/${s.id}/preview/learn/${s.physics}?from=home`));
      assert.ok(block, `(c) ${who}: the unpublished subject's preview shows its block`);
      assert.deepEqual(blockTexts(learnerBlockOf(block)), ['Physics starts next month.'], `(c) ${who}`);
      previews[who] = unpreview(block);
    }
    const salma = await as(w, SALMA, 'en');
    assert.equal((await salma.get(subjectPath(s, s.physics))).status, 403, '(c) unpublished: Salma gets today\'s 403');
    await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.physics}'`);
    const published = annBlock(await (await salma.get(subjectPath(s, s.physics))).text());
    for (const who of ['Amal', 'Hadeer']) assert.equal(previews[who], published, `(c) ${who}: the preview showed exactly what Salma sees once it is published`);
    await w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.physics}'`);
    // (d) no preview request wrote anything.
    assert.deepEqual(writes, [], '(d) under the statement spy no preview request writes (but the session refresh and the usage count)');
  });
});
