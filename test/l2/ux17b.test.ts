// UX-17b (ux-plan v2 on PIL-210, L2): every new label on the guardian home and
// the lesson editor that names a role or a thing comes from the space's kit,
// checked in all three kits (School, Company, University) in both languages:
// "Add <material>", and the card's subjects and lesson-activity link; no word
// of another kit appears; the no-hardcoded-labels guard passes on the source.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { signedIn } from '../support/seed.ts';
import { hasWord } from '../support/browser.ts';
import { findHardCoded } from '../guards/no-hardcoded-labels.test.ts';
import { COMPANY_ADMIN, UNIVERSITY_ADMIN, activity } from '../wave1/world.ts';
import { wordsOnly } from './pages.ts';
import { HADEER, MONA, RANIA, SAMIR, browserAs, editorPath, go, l2World, linkedHome, words, type L2World } from './world.ts';
import { CONCEPTS, KIT_WORDS } from '../../src/labels.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const KITS = ['school', 'company', 'university'] as const;
type Kit = (typeof KITS)[number];

/** Every word of the other kits that this kit does not share. */
function otherWords(kit: Kit, lang: 'ar' | 'en'): string[] {
  const all = (k: Kit) => [...CONCEPTS, ...KIT_WORDS].map((key) => words(k, lang)(key));
  const own = new Set(all(kit));
  return [...new Set(KITS.filter((k) => k !== kit).flatMap(all))].filter((x) => !own.has(x) && ![...own].some((o) => o.includes(x)));
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('UX-17b kit words on guardian and editor pages (three kits)', { concurrency: false }, () => {
  let w: L2World;
  let browser: Browser;
  before(async () => {
    w = await l2World({ story: true, kits: true });
    await activity(w, true, await signedIn(w.p.url, COMPANY_ADMIN.username, COMPANY_ADMIN.password), w.company.id);
    await activity(w, true, await signedIn(w.p.url, UNIVERSITY_ADMIN.username, UNIVERSITY_ADMIN.password), w.university.id);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the label guard passes on every source file L2 changes (and every other)', () => {
    const offences = files(join(root, 'src')).filter((f) => !f.endsWith(join('kits', 'seed.ts')))
      .map((f) => [relative(root, f), findHardCoded(readFileSync(f, 'utf8'))] as const).filter(([, hits]) => hits.length);
    assert.deepEqual(offences, []);
  });

  for (const kit of KITS) {
    for (const lang of ['ar', 'en'] as const) {
      it(`${kit} ${lang}: "Add <material>" and the guardian card's words come from the ${kit} kit; no other kit's word`, async () => {
        const t = words(kit, lang);
        const space = kit === 'school' ? w.school : kit === 'company' ? w.company : w.university;
        const publisher = kit === 'school' ? HADEER : { ...HADEER, username: kit === 'company' ? 'hadeer.trainer' : 'hadeer.lecturer' };
        const guardian = kit === 'school' ? MONA : kit === 'company' ? RANIA : SAMIR;
        const forbidden = otherWords(kit, lang);

        const ed = await browserAs(browser, w, publisher, { lang });
        await go(ed.page, w, editorPath(space, space.lessons['Adding fractions'], '?add=file'));
        const heading = (await ed.page.locator('#add-new > h2').innerText()).trim();
        assert.equal(heading, t('addMaterial'));
        assert.ok(heading.includes(t('material')), `the ${kit} kit's material word (${t('material')})`);
        const edText = await wordsOnly(ed.page);
        assert.deepEqual(forbidden.filter((x) => hasWord(edText, x)), [], `${kit} ${lang} editor: no other kit's word`);
        await ed.ctx.close();

        const g = await browserAs(browser, w, guardian, { lang });
        await go(g.page, w, linkedHome(space));
        const card = g.page.locator('#linked > section.card').first();
        assert.equal((await card.locator('h3').innerText()).trim(), t('subject'), 'the subjects under the kit\'s word');
        assert.equal((await card.locator('a.activity-link').innerText()).trim(), t('lessonActivity'), 'the activity link in the kit\'s words');
        assert.ok(await card.locator('.last-opened').count(), 'Last opened, while on');
        // The welcome line names the guardian (data, as today, outside a <bdi>).
        const gText = (await wordsOnly(g.page)).split(guardian.display_name).join(' ');
        assert.deepEqual(forbidden.filter((x) => hasWord(gText, x)), [], `${kit} ${lang} guardian home: no other kit's word`);
        await g.ctx.close();
      });
    }
  }
});
