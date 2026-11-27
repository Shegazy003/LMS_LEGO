// LMS redesign wave R1a: what every learner and guardian page says, as served
// in the seeded world (no browser). AT-R1a.1e (no hard-coded blue), AT-R1a.4d
// (no Arabic-Indic digit in ui.ts or on a page) and AT-R1a.4e / UX-104 (no
// YYYY-MM-DD in the visible text).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AHMED, HOME, ID, LAILA, SALMA, SUBJECTS, SUBJECTS_PAGE, TODO_PAGE, lessonPage, r1aWorld, subjectPage, textOf, type R1aWorld } from './world.ts';
import type { Client } from '../support/http.ts';

const BLUES = ['#1a5fd0', '#1f6feb', '#0b3d91'];
const INDIC = /[٠-٩۰-۹]/;
const ISO = /\d{4}-\d{2}-\d{2}/;

let w: R1aWorld;
/** path → served page, for every learner and guardian page reachable in the world. */
const pages = new Map<string, string>();

async function collect(c: Client, who: string, paths: string[]) {
  for (const path of paths) {
    const res = await c.get(path);
    assert.equal(res.status, 200, `${who} ${path}`);
    pages.set(`${who} ${path}`, await res.text());
  }
}
const hrefs = (page: string, re: RegExp) => [...new Set([...page.matchAll(/\shref="([^"#?]+)/g)].map((m) => m[1]).filter((h) => re.test(h)))];

before(async () => {
  w = await r1aWorld();
  const salma = await w.as(SALMA);
  const published = SUBJECTS.filter((s) => s.published);
  const lessons = published.flatMap((s) => s.chapters.flatMap((ch) => ch.lessons.slice(0, 1)));
  await collect(salma, 'salma', [HOME, SUBJECTS_PAGE, TODO_PAGE, `/s/${ID.space}/results`, ...published.map(subjectPage)]);
  const reachable = lessons.map(lessonPage);
  for (const path of reachable) {
    const res = await salma.get(path);
    if (res.status === 200) pages.set(`salma ${path}`, await res.text());
  }
  const results = pages.get(`salma /s/${ID.space}/results`)!;
  await collect(salma, 'salma', hrefs(results, new RegExp(`^/s/${ID.space}/results/.+`)).slice(0, 3));
  for (const who of [AHMED, LAILA]) {
    const c = await w.as(who);
    const res = await c.get(`/s/${ID.space}/linked`);
    if (res.status !== 200) continue;
    const page = await res.text();
    pages.set(`${who.key} /linked`, page);
    await collect(c, who.key, hrefs(page, new RegExp(`^/s/${ID.space}/linked/[^/]+(/activity)?$`)).slice(0, 4));
  }
});
after(async () => {
  await w?.close();
});

describe('AT-R1a.4 digits and dates on learner and guardian pages', () => {
  it('the scan covers the learner pages and at least one guardian page', () => {
    const keys = [...pages.keys()];
    assert.ok(keys.length >= 12, keys.join('\n'));
    assert.ok(keys.some((k) => k.includes('/read/')), 'a lesson page');
    assert.ok(keys.some((k) => k.includes('/results/')), 'a result page');
    assert.ok(keys.some((k) => k.includes('/linked')), 'a guardian page');
  });

  it('AT-R1a.4d UX-104 ui.ts and every rendered learner or guardian page contain no Arabic-Indic digit', () => {
    const ui = readFileSync(new URL('../../src/i18n/ui.ts', import.meta.url), 'utf8');
    assert.equal(INDIC.exec(ui)?.[0] ?? null, null, 'ui.ts');
    for (const [key, page] of pages) assert.equal(INDIC.exec(page)?.[0] ?? null, null, key);
  });

  it('AT-R1a.4e UX-104 no YYYY-MM-DD in the visible text of any learner or guardian page', () => {
    for (const [key, page] of pages) {
      const text = textOf(page);
      const hit = ISO.exec(text);
      assert.equal(hit ? text.slice(Math.max(0, hit.index - 40), hit.index + 20) : null, null, key);
    }
  });
});

describe('AT-R1a.1 colours on learner and guardian pages', () => {
  it('AT-R1a.1e UX-94 no learner or guardian page\'s CSS contains #1a5fd0, #1f6feb or #0b3d91', () => {
    for (const [key, page] of pages) {
      const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|\sstyle="([^"]*)"/g)].map((m) => m[1] ?? m[2]).join('\n').toLowerCase();
      for (const blue of BLUES) assert.ok(!css.includes(blue), `${key}: ${blue}`);
    }
  });
});
