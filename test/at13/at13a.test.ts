// AT-13a (contract product-contract-r2, R2-a): on every guardian page except
// the lesson-activity page (all its states), there is no lesson-activity
// phrase, open date, count or time (the scan of section 3). Before R2-d is
// built, no code path stores a lesson open.
//
// The lesson-activity phrases are the exact phrases of the feature, in both
// languages, not word stems: ordinary words such as "Open" are never hit. The
// lesson-activity page and the other exempt places (section 3) do not exist
// before R2-d, so the exempt list of dictionary keys is empty: any key that
// carries a phrase fails. R2-d adds its keys to EXEMPT_KEYS.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI } from '../../src/i18n/ui.ts';
import type { World } from '../at9/world.ts';
import { A, B, G1, G2, as, crawl, guardianPaths, privacyWorld, useLanguage, visible } from './pages.ts';
import { HADEER } from '../at9/world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

export const ACTIVITY_PHRASES = {
  en: ['Last opened on', 'No open recorded', 'Recording since', 'Lesson activity', 'which lessons you opened', 'Not opened', 'last opened', 'times opened'],
  ar: ['نشاط الدروس', 'آخر فتح', 'تاريخ آخر فتح', 'لم يُسجَّل فتح', 'لم يسجل فتح', 'التسجيل منذ', 'الدروس التي فتحتها', 'لم يُفتح', 'لم يفتح'],
};
/** Dictionary keys allowed to carry a phrase (the exempt pages of section 3). None before R2-d. */
export const EXEMPT_KEYS: string[] = [];

const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|(يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/i;

/** Every lesson-activity phrase, open date, count or time found in a text. */
export function activityIn(text: string): string[] {
  const hits: string[] = [];
  for (const p of ACTIVITY_PHRASES.en) if (text.toLowerCase().includes(p.toLowerCase())) hits.push(p);
  for (const p of ACTIVITY_PHRASES.ar) if (text.includes(p)) hits.push(p);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) hits.push('a date');
  if (MONTHS.test(text)) hits.push('a month name');
  if (/\b\d{1,2}:\d{2}\b/.test(text)) hits.push('a time of day');
  if (/[0-9٠-٩]/.test(text)) hits.push('a number (a count, a date or a time)');
  return hits;
}

test('AT-13a scan self-check: the phrases, dates, counts and times are found; ordinary words are not', () => {
  assert.ok(activityIn('Last opened on 3 Nov 2026').length >= 2);
  assert.ok(activityIn('آخر فتح في ٣ نوفمبر').length >= 2);
  assert.deepEqual(activityIn('Opened 3 times'), ['a number (a count, a date or a time)']);
  assert.deepEqual(activityIn('at 23:30'), ['a time of day', 'a number (a count, a date or a time)']);
  assert.deepEqual(activityIn('Open in a new tab · View · فتح · Mathematics'), [], 'ordinary words such as Open are not phrases');
});

test('AT-13a dictionary: no product sentence outside the exempt keys carries a lesson-activity phrase, in Arabic or English', () => {
  const offences: string[] = [];
  for (const lang of ['en', 'ar'] as const) {
    for (const [key, text] of Object.entries(UI[lang])) {
      if (EXEMPT_KEYS.includes(key)) continue;
      const hits = activityIn(text).filter((h) => !h.startsWith('a '));
      if (hits.length) offences.push(`${lang}.${key}: ${hits.join(', ')}`);
    }
  }
  assert.deepEqual(offences, []);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') || p.endsWith('.sql') ? [p] : [];
  });
}

test('AT-13a before R2-d: no table, statement or migration for lesson views exists in the product', () => {
  const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'migrations'))];
  assert.ok(files.length > 20);
  const found = files.filter((f) => /lesson_view|lesson_open|opened_on/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(found, [], 'R2-d adds the only write (AT-15); until then nothing names it');
});

describe('AT-13a the running product: guardian pages carry no activity, and opening lessons stores nothing', { concurrency: false }, () => {
  let w: World;
  before(async () => {
    w = await privacyWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('every page a guardian reaches (G1, G2 and the dual-role B), in Arabic and in English: no phrase, no date, no count, no time', async () => {
    let scanned = 0;
    for (const person of [G1, G2, B]) {
      const c = await as(w, person);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        const pages = await crawl(c, guardianPaths(w));
        for (const p of pages.filter((x) => x.contentType.startsWith('text/html') && x.path.includes('/linked'))) {
          scanned++;
          assert.deepEqual(activityIn(visible(p.body)), [], `${person.username} ${lang} ${p.path}`);
        }
      }
    }
    assert.ok(scanned >= 12, `guardian pages scanned: ${scanned}`);
  });

  it('a learner opening their subject, lesson and file (twice), and a guardian, admin and publisher looking, store nothing', async () => {
    const tables = (await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', 'usage_day', 'session')"))
      .map((r) => String(r.name));
    assert.ok(!tables.some((t) => /view|open|activity/i.test(t)), `no lesson-view table: ${tables.join(', ')}`);
    // One table at a time: parallel `wrangler d1 execute` calls on one local database fail at random.
    const rows = async () => {
      const all: Record<string, string[]> = {};
      for (const t of tables) all[t] = (await w.p.sql(`SELECT * FROM "${t}"`)).map((r) => JSON.stringify(r)).sort();
      return all;
    };
    const people = { a: await as(w, A), g1: await as(w, G1), hadeer: await as(w, HADEER) };
    const before = await rows();
    for (let i = 0; i < 2; i++) {
      for (const path of [`/learn/${w.content.math}`, `/read/${w.content.lesson}`, `/file/${w.content.pdf}`]) {
        assert.equal((await people.a.get(`/s/${w.spaceId}${path}`)).status, 200, `the learner opens ${path}`);
        await w.admin.get(`/s/${w.spaceId}${path}`);
        await people.hadeer.get(`/s/${w.spaceId}${path}`);
        await people.g1.get(`/s/${w.spaceId}${path}`);
      }
      await people.g1.get(`/s/${w.spaceId}/linked/${w.ids[A.username]}`);
    }
    assert.deepEqual(await rows(), before, 'no row written or changed anywhere');
  });
});
