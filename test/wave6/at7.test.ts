// LMS wave 6, W6-1c (product-contract v3 addendum on PIL-265, G5, AT-7.2 and
// AT-7.5): nobody else sees the guardian's view. AT-7.2 crawls, in Arabic and
// English, every page reachable by Mona, Laila Test, Tamer Test, Rania Test,
// Salma, Omar C, Amal, Hadeer and the owner, with W6-a, W6-b and Salma's mark
// present and lesson activity on (the candidate alone): on every guardian page
// the release 2 scans (AT-9d, AT-13a, AT-13b) and v2's AT-3.1 forbidden lists
// run unchanged on the page with `#guardian-todo` taken out (contract G9.1);
// inside the block an allow-list of elements, attributes and text; and no
// other page shows the block or its words. (Release 2's AT-15a runs on the
// whole page, unchanged, in job release-2-activity: there is no block while
// activity is off.) AT-7.5 checks that every existing CI step and the rollback
// job are W6-1b-main's, and that only the named test files changed; the CI run
// itself shows them passing. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '../support/http.ts';
import { UI } from '../../src/i18n/ui.ts';
import { TODO_AHEAD_DAYS } from '../../src/due.ts';
import { activityIn, annHits, doneHits, doneWords, exemptRemoved, isExemptPage, lockHits, resultsSection, todoHits, uploadHits, visible } from '../at13/pages.ts';
import {
  AT, ADMIN, HADEER, LAILA6, MONA, OMAR, RANIA6, SALMA, TAMER6, YARA6, as, clockAt, closeWave6, home, press, wave6World, withTamer, withW6b, withW6f, words,
  type W6a, type W6b, type Wave1World,
} from './world.ts';
import { allowListProblems, guardianTodoOf, todoOf, withoutGuardianTodo } from './todo.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
type Lang = 'ar' | 'en';
const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);
const LINKED = /^\/s\/[^/]+\/linked\/[^/?#]+(\?|$)/;

/** Every HTML page one client reaches from its home (the candidate). */
async function crawlOne(c: Client, url: string, limit = 600): Promise<{ path: string; status: number; body: string }[]> {
  const seen = new Set<string>();
  const out: { path: string; status: number; body: string }[] = [];
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await c.get(path);
    if (res.status >= 300 && res.status < 400) {
      await res.arrayBuffer();
      const to = (res.headers.get('location') ?? '').replace(url, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!(res.headers.get('content-type') ?? '').startsWith('text/html')) {
      await res.arrayBuffer();
      continue;
    }
    const body = await res.text();
    out.push({ path, status: res.status, body });
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `the crawl ends before ${limit} pages`);
  return out;
}

/** v2 AT-3.1's group words (any count), in both languages. */
const GROUP_WORDS: [string, RegExp][] = (['en', 'ar'] as const).flatMap((lang) => (['todoOverdue', 'todoToday', 'todoNext7'] as const).map((key): [string, RegExp] => [
  `${lang} ${key}`, new RegExp(UI[lang][key].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{days}', String(TODO_AHEAD_DAYS)).replace('{n}', '\\d+')),
]));

/** The guardian's own words as whole text nodes (the learner's todoTitle and todoCapped are not these). */
function guardianWordsIn(body: string): string[] {
  const nodes = body.replace(/<style>[\s\S]*?<\/style>/g, '').split(/<[^>]*>/).map((x) => x.replace(/&amp;/g, '&').trim()).filter(Boolean);
  const hits: string[] = [];
  for (const lang of ['en', 'ar'] as const) {
    const title = UI[lang].guardianTodoTitle.split('{name}')[0].trim();
    const capped = new RegExp(`^${UI[lang].guardianTodoCapped.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('\\{n\\}', '\\d+').replace('{n}', '\\d+')}$`);
    for (const n of nodes) {
      if (n === title) hits.push(`${lang} guardianTodoTitle`);
      if (n === UI[lang].guardianTodoNote) hits.push(`${lang} guardianTodoNote`);
      if (capped.test(n)) hits.push(`${lang} guardianTodoCapped`);
    }
  }
  if (/\bid="guardian-todo"/.test(body)) hits.push('the element #guardian-todo');
  return hits;
}

// ------------------------------------------------------------------ AT-7.2 ----
describe('W6 AT-7.2 privacy scans: outside the block the release 2 and v2 scans unchanged; inside it an allow-list; no other page shows it', { concurrency: false }, () => {
  let w: Wave1World;
  let a: W6a;
  let b: W6b;
  before(async () => {
    ({ w, a } = await wave6World({ activity: true }));
    await withW6f(w, a);
    b = await withW6b(w);
    await withTamer(w, b);
    assert.equal((await press(await as(w, SALMA, 'en'), w.school, a.L.L3, 'done')).status, 303, 'Salma marks L3');
  });
  after(() => closeWave6(w));

  it('W6 AT-7.2 every page of Mona, Laila Test, Tamer Test, Rania Test, Salma, Omar C, Amal, Hadeer and the owner, Arabic and English', async (t) => {
    t.diagnostic(`instant ${await clockAt(w, AT.noon)}`);
    const viewers = [['Mona', MONA], ['Laila Test', LAILA6], ['Tamer Test', TAMER6], ['Rania Test', RANIA6], ['Salma', SALMA], ['Omar C', OMAR], ['Amal', ADMIN], ['Hadeer', HADEER]] as const;
    const learners: Record<string, { person: { username: string; password: string; display_name: string }; space: { id: string } }> = {
      [w.ids[SALMA.username]]: { person: SALMA, space: w.school },
      [w.ids[OMAR.username]]: { person: OMAR, space: w.school },
      [w.ids[YARA6.username]]: { person: YARA6, space: { id: b.id } },
    };
    // AT-9d and AT-13b: no lesson or material title of the world, and no learner the viewer is not linked to, outside the block.
    const lessonWords = (await w.p.sql("SELECT title FROM lesson UNION SELECT title FROM material WHERE title IS NOT NULL")).map((r) => String(r.title)).filter((x) => x.length >= 6);
    const linksOf = async (username: string) => new Set((await w.p.sql(`SELECT u.display_name AS n FROM guardian_link gl JOIN user u ON u.id = gl.learner_user_id JOIN user g ON g.id = gl.guardian_user_id WHERE g.username = '${username}' AND gl.ended_at IS NULL`)).map((r) => String(r.n)));
    const learnerNames = (await w.p.sql("SELECT DISTINCT u.display_name AS n FROM membership m JOIN user u ON u.id = m.user_id WHERE m.role = 'learner'")).map((r) => String(r.n));
    let guardianPages = 0;
    let blocks = 0;
    let others = 0;
    for (const lang of ['ar', 'en'] as const) {
      const tt = words('school', lang);
      for (const [who, person] of [...viewers, ['owner', null] as const]) {
        const c = person ? await as(w, person, lang) : w.owner;
        if (!person) await c.post('/account/language', { lang });
        const linked = person ? await linksOf(person.username) : new Set<string>();
        for (const page of await crawlOne(c, w.p.url)) {
          const where = `${who} ${lang} ${page.path} (${page.status})`;
          if (!page.path.includes('/linked')) {
            others++;
            assert.deepEqual(guardianWordsIn(page.body), [], `${where}: not a guardian page: no block and none of its words`);
            continue;
          }
          if (!LINKED.test(page.path)) assert.equal(guardianTodoOf(page.body), null, `${where}: the block only on a linked learner's page`);
          // Inside the block (AT-7.2 allow-list), against the learner's own block at this instant.
          const g = guardianTodoOf(page.body);
          if (g) {
            blocks++;
            const learnerId = /\/linked\/([^/?#]+)/.exec(page.path)![1];
            const l = learners[learnerId];
            assert.ok(l, `${where}: a block for a learner of the world`);
            const lc = await as(w, l.person, lang);
            const own = todoOf(await (await lc.get(home(l.space))).text());
            assert.ok(own, `${where}: the learner has their own block`);
            const groups = own.groups.map((x) => {
              const n = Number(/\d+/.exec(x.heading.replace(String(TODO_AHEAD_DAYS), ''))![0]);
              return { heading: x.heading, more: x.more, capped: x.capped ? tt('guardianTodoCapped', { n: String(n - 10) }) : null, items: x.items.map((i) => ({ title: i.title, line: i.line })) };
            });
            assert.deepEqual(allowListProblems(g.block, { heading: tt('guardianTodoTitle', { name: l.person.display_name }), note: tt('guardianTodoNote'), groups }), [], `${where}: the allow-list inside the block`);
          }
          // Outside the block: the release 2 and v2 scans, unchanged.
          guardianPages++;
          const body = withoutGuardianTodo(page.body);
          if (!isExemptPage(page.path)) {
            const cut = exemptRemoved(body);
            assert.deepEqual(activityIn(visible(cut)).filter((h) => !h.startsWith('a ')), [], `${where}: AT-13a no lesson-activity phrase`);
            const { rest, strays } = resultsSection(cut);
            assert.deepEqual(strays, [], `${where}: AT-13a the results section holds digits only in its own forms`);
            assert.deepEqual(activityIn(visible(rest)), [], `${where}: AT-13a no date, count or time outside the results`);
            const text = visible(cut);
            assert.deepEqual(lessonWords.filter((x) => text.includes(x)), [], `${where}: AT-9d and AT-13b no lesson or material title`);
            assert.deepEqual(learnerNames.filter((n) => !linked.has(n) && n !== person?.display_name && text.includes(n)), [], `${where}: AT-9d no learner the viewer is not linked to`);
          }
          assert.deepEqual(doneHits(body, doneWords(false)), [], `${where}: W2 AT-2.4 no done mark`);
          assert.deepEqual(uploadHits(body), [], `${where}: no upload word`);
          assert.deepEqual(lockHits(body), [], `${where}: W4 AT-4.5 no lock state`);
          assert.deepEqual(annHits(body), [], `${where}: W5 AT-3.1 no announcement`);
          assert.deepEqual(todoHits(body), [], `${where}: v2 AT-3.1 no to-do state or due date`);
          assert.deepEqual(GROUP_WORDS.filter(([, re]) => re.test(visible(body))).map(([n]) => n), [], `${where}: v2 AT-3.1 no group word`);
        }
      }
    }
    t.diagnostic(`AT-7.2: ${guardianPages} guardian pages scanned with the block taken out, ${blocks} blocks checked against the allow-list, ${others} other pages without the block or its words`);
    assert.ok(blocks >= 8, `blocks checked (${blocks}): Mona, Laila Test (2), Rania Test and Tamer Test, in both languages`);
    assert.ok(guardianPages >= 20 && others >= 200, `the crawl reached the pages (${guardianPages} guardian, ${others} other)`);
  });

  it('W6 AT-7.2 self-check: the allow-list and the scans catch a link, a done count, a data attribute, another name and a date outside the block', () => {
    const ok = '<section id="guardian-todo" class="card todo-block">\n<h2 id="guardian-todo-heading">To do: <bdi>Salma Test</bdi></h2>\n<p class="muted">Read only. An item leaves the list when it is done.</p>\n<section class="todo-group" id="guardian-todo-overdue">\n<h3>Overdue (1)</h3>\n<ul class="todo-list"><li class="todo-item"><span class="due-title"><bdi>Practice L1</bdi></span>\n<p class="todo-line">Lesson · <bdi>Mathematics</bdi> · Due <bdi dir="ltr" class="due-date">2026-12-07</bdi></p></li></ul>\n</section>\n</section>';
    const expected = { heading: 'To do: Salma Test', note: 'Read only. An item leaves the list when it is done.', groups: [{ heading: 'Overdue (1)', more: null, capped: null, items: [{ title: 'Practice L1', line: 'Lesson · Mathematics · Due 2026-12-07' }] }] };
    assert.deepEqual(allowListProblems(ok, expected), []);
    assert.ok(allowListProblems(ok.replace('<bdi>Practice L1</bdi>', '<a href="/x"><bdi>Practice L1</bdi></a>'), expected).length >= 2, 'a link');
    assert.ok(allowListProblems(ok.replace('</p></li>', '</p><p class="todo-progress">Done: 1 of 2</p></li>'), expected).length >= 1, 'a done count');
    assert.ok(allowListProblems(ok.replace('<li class="todo-item">', '<li class="todo-item" data-item="x">'), expected).length >= 1, 'a data attribute');
    assert.ok(allowListProblems(ok.replace('Salma Test', 'Omar Test'), expected).length >= 1, 'another learner\'s name');
    assert.ok(allowListProblems(ok.replace('2026-12-07', '2026-12-01'), expected).length >= 1, 'another date');
    assert.ok(allowListProblems(ok.replace('</section>\n</section>', '<p>Opened 2026-12-01</p></section>\n</section>'), expected).length >= 1, 'an open date');
    assert.deepEqual(guardianWordsIn(`<p>x</p>${ok}`).sort(), ['en guardianTodoNote', 'en guardianTodoTitle', 'the element #guardian-todo'], 'the guardian words are found');
    assert.deepEqual(guardianWordsIn('<h2 id="todo-heading">To do</h2><p class="todo-capped">Other items not shown: 5. Every due date is in its subject outline.</p>'), [], 'the learner\'s own title and capped line are not the guardian\'s');
    assert.deepEqual(todoHits(withoutGuardianTodo(`<p>a</p>${ok}<p>b</p>`)), [], 'with the block taken out, the v2 scan passes');
    assert.ok(todoHits(`<p>a</p>${ok}`).length >= 1, 'with the block in, the v2 scan would not');
  });
});

// ------------------------------------------------------------------ AT-7.5 ----

/** The jobs of a workflow and each step's text (name, if, env, run, with), by a plain reading of its two-space layout. */
function stepsOf(yml: string): Map<string, Map<string, string>> {
  const jobs = new Map<string, Map<string, string>>();
  const text = yml.replace(/\r\n/g, '\n');
  const jobsAt = text.indexOf('\njobs:\n');
  let job: Map<string, string> | null = null;
  let step: string[] = [];
  const flush = () => {
    if (job && step.length) {
      const name = /^\s*- (?:name: (.+)|uses: (.+))$/m.exec(step.join('\n'));
      const key = name ? (name[1] ?? `uses ${name[2]}`) : step[0].trim();
      let k = key;
      for (let i = 2; job.has(k); i++) k = `${key} #${i}`;
      job.set(k, step.join('\n'));
    }
    step = [];
  };
  for (const line of text.slice(jobsAt + 7).split('\n')) {
    const j = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (j) {
      flush();
      job = new Map();
      jobs.set(j[1], job);
      continue;
    }
    if (/^ {6}- /.test(line)) {
      flush();
      step = [line];
    } else if (step.length && (/^ {7,}/.test(line) || line.trim() === '')) step.push(line);
    else if (job && /^ {4}\S/.test(line)) {
      flush();
      job.set(`(job) ${line.trim()}`, line);
    }
  }
  flush();
  return jobs;
}

/** The test files of a tree (relative paths, LF text). */
function testFiles(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(root, p).replace(/\\/g, '/'), readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  walk(join(root, 'test'));
  return out;
}

/** The existing test files W6-1c changes, each with its reason (contract G9 and the clock fix); any other change fails the step. */
const CHANGED_TESTS: Record<string, string> = {
  'test/wave6/base.test.ts': 'G9.2 (AT-3.1 allowed difference: #guardian-todo) and G9.5 (AT-3.4b: the linked learner\'s page +1)',
  'test/wave6/ux.test.ts': 'G9.4 (UX-64 keys and the new dueCardHelp value; UX-59 computes the same help line)',
  'test/wave6/world.ts': 'the W6-f world (new people and helpers only)',
  'test/wave6/todo.ts': 'the guardian block reader (new helpers only)',
  'test/wave5/base.test.ts': 'G9.5 (W5 AT-3.5 statement counts: the linked learner\'s page +1 while lesson activity is on)',
  'test/wave5/world.ts':'the 00:00 to 01:00 UTC clock flake of withAt2 (posting times inside the current UTC day)',
  'test/wave2/at2.test.ts': 'outside G9, for the Lead: W2 AT-2.5 code guard allows the second Learner maker linkedAsLearner',
  'test/wave2/at3.test.ts': 'outside G9, for the Lead: W2 AT-3.7 export list gains linkedAsLearner',
};

/** LMS wave 7, W7-1 (product-contract v2 on PIL-261, section 11): the existing test files W7-1 changes, each with its section 11
 * item. This step pins W6-1c's state against W6-1b-main, so wave 7's own allowed changes are named here (outside section 11:
 * this file itself, named in CANDIDATE READY for the Lead). */
const W7_CHANGED_TESTS: Record<string, string> = {
  'test/at13/pages.ts': 'W7 11.6: the quiz words, the quiz world addition and the scan',
  'test/at13/at13a.test.ts': 'W7 11.6: AT-13a gains the quiz words for guardian pages',
  'test/at13/at13b.test.ts': 'W7 11.6: AT-13b gains the quiz words for guardian pages',
  'test/guards/role-gates.test.ts': 'W7 11.6: role-gates lists the quiz addresses',
  'test/rollback/old-code.test.ts': 'W7 11.6: the AT-6.3 case',
  'test/wave3a/at3.test.ts': 'W7 11.1: the migration list gains 0016_quizzes.sql',
  'test/wave3a/at5.test.ts': 'W7 11.6: the job list gains wave-7',
  'test/wave1/at3-4.test.ts': 'W7 11.1: the migration list gains 0016_quizzes.sql',
  'test/l2/at5-5.test.ts': 'W7 11.1: the migration list gains 0016_quizzes.sql',
  'test/wave4/base.test.ts': 'W7 11.3: the quiz card on teacher pages and the wave 7 style block',
  'test/wave5/base.test.ts': 'W7 11.3: the quiz card on teacher pages and the wave 7 style block',
  'test/wave6/base.test.ts': 'W7 11.3 and 11.5: the quiz card on teacher pages and the wave 7 style block (also left out of AT-3.4b\'s size bound)',
  'test/wave4/ux.test.ts': 'W7 UX-77 (outside section 11, named in CANDIDATE READY): UX-49\'s deny list moved unchanged to test/wave4/world.ts so UX-77 imports it',
  'test/wave4/world.ts': 'W7 UX-77 (outside section 11, named in CANDIDATE READY): exports UX-49\'s deny list, unchanged',
  'test/wave6/base-guardian.test.ts':'W7 11.3: the quiz card on teacher pages and the wave 7 style block',
  'test/guards/space-isolation.test.ts': 'W7 addition (outside section 11, named in CANDIDATE READY): the space tables gain quiz and quiz_attempt, as each wave adds its tables',
  'test/guards/log-redaction.test.ts': 'W7 addition (outside section 11, named in CANDIDATE READY): the fixed events gain quiz write failed, as each wave adds its event',
  'test/guards/cross-origin.test.ts': 'W7-2 addition (section 11.6 in kind, named in CANDIDATE READY): the same-origin sweep gains the learner quiz POST addresses',
  'test/guards/removed-content.test.ts': 'W7-2 addition (section 11.6 in kind, named in CANDIDATE READY): the removed-content sweep gains the quiz id kind',
};
/** W7-1's additions to the workflow: the job wave-7 (W7 11.6) and the rollback job's AT-6.3 step (W7 11.6). */
const W7_JOBS = ['wave-7'];
const W7_ROLLBACK_STEP = /^W7 AT-6\.3 /;

describe('W6 AT-7.5 keep working: every existing CI step and the rollback job are W6-1b-main\'s; only the named test files changed', { concurrency: false }, () => {
  it('W6 AT-7.5 ci.yml and the test tree against W6-1b-main', (t) => {
    const baseRoot = process.env.LMS_BASE_ROOT ?? join(repo, '.base-w6c');
    const baseYml = join(baseRoot, '.github', 'workflows', 'ci.yml');
    assert.ok(existsSync(baseYml), `W6-1b-main's ci.yml at ${baseYml}`);
    const base = stepsOf(readFileSync(baseYml, 'utf8'));
    const cand = stepsOf(readFileSync(join(repo, '.github', 'workflows', 'ci.yml'), 'utf8'));
    assert.ok(base.size >= 10 && base.has('rollback') && base.has('wave-6'), `W6-1b-main's jobs read (${[...base.keys()].join(', ')})`);
    let steps = 0;
    for (const [job, list] of base) {
      const mine = cand.get(job);
      assert.ok(mine, `job ${job} is still there`);
      for (const [name, text] of list) {
        steps++;
        assert.equal(mine.get(name), text, `${job}: "${name}" is W6-1b-main's, unchanged`);
      }
      // W7-1: the rollback job's one added step (its AT-6.3 case) is wave 7's.
      if (job !== 'wave-6') assert.deepEqual([...mine.keys()].filter((k) => !(job === 'rollback' && W7_ROLLBACK_STEP.test(k))), [...list.keys()], `${job}: no step added or removed`);
    }
    assert.deepEqual([...cand.keys()].filter((j) => !W7_JOBS.includes(j)), [...base.keys()], 'the same jobs (and wave 7\'s job wave-7)');
    const added = [...cand.get('wave-6')!.keys()].filter((k) => !base.get('wave-6')!.has(k));
    for (const name of added) assert.match(name, /^(W6 AT-[67]\.|UX-8[012] |Check out W6-1b-main |Upload evidence)/, `wave-6: an added step is W6-1c's (${name})`);
    const baseTests = testFiles(baseRoot);
    const candTests = testFiles(repo);
    const changed = [...baseTests].filter(([p, text]) => candTests.has(p) && candTests.get(p) !== text).map(([p]) => p).sort();
    const removed = [...baseTests.keys()].filter((p) => !candTests.has(p));
    assert.deepEqual(removed, [], 'no test file removed');
    // W6-1c's named files all changed; any other changed file is one W7-1 names (section 11).
    assert.deepEqual(Object.keys(CHANGED_TESTS).filter((p) => !changed.includes(p)), [], 'every file W6-1c names is changed');
    assert.deepEqual(changed.filter((p) => !CHANGED_TESTS[p] && !W7_CHANGED_TESTS[p]), [], 'only the named test files changed (W6-1c\'s, and W7-1\'s)');
    t.diagnostic(`AT-7.5: ${steps} W6-1b-main steps unchanged in ${base.size} jobs (rollback included); ${added.length} steps added to wave-6; changed test files:\n${changed.map((p) => `${p}: ${CHANGED_TESTS[p] ?? W7_CHANGED_TESTS[p]}`).join('\n')}`);
  });
});
