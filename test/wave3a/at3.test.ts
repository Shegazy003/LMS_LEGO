// W3a AT-3 (product-contract v2 on PIL-216, section 6): the preview changes
// nothing. One full preview journey (Amal and Hadeer in Arabic and English;
// the owner's home and My results in both) runs once, in a real browser, under
// the statement spy, between two snapshots of every row of every table. Each
// labelled expectation is its own CI step (--test-name-pattern "W3a AT-3.<n>");
// the journey runs once per step, on first use.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { OWNER } from '../support/seed.ts';
import {
  ADMIN, CONTROLS, HADEER, SALMA, activity, as, assertInert, browserAs, element, ownerPreview, previewHome, wave3aWorld, type Wave3aWorld,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
const ROOT = new URL('../../', import.meta.url);

/** The base commit's migrations (main 4092dff), by SHA-256 of their LF text (AT-3.5). */
const BASE_MIGRATIONS: Record<string, string> = {
  '0001_init.sql': '9e09a5e89657a55201ac7bd9e0a03ac79d388e510395b57f2e641ff3f12ab5df',
  '0002_learning.sql': '655945c07b14c9b778331d9f639ea2f695b7fda631edeabc6da736045d0c2a58',
  '0003_people.sql': '8f7625c337825becfa06897c1b4ba00f58fee6d44af423bf6b87649f50305a8e',
  '0004_person_language.sql': 'fa0f33c4fa39cb4b4abe424fde761b8dcc24898ea4a30675726b88091a0c415a',
  '0005_membership_ended.sql': 'eecf5948d126e9e6285bce02b9453093c548966d3ff0f0b855772bd4c2bcc4dd',
  '0006_content_removed.sql': 'ff6e1fda7f02b64b01d2ce9a76c204b267e28a5f985271ec843100d57d19cff3',
  '0007_guardians.sql': '7a71fa1935e390f757a62316d3e7130835b41b3e43b7966c30ccd77581ea25b9',
  '0008_exams.sql': '2cdd582036334b0d22af827ae2347c7379e0af26bbd33067ef5181daaba0041e',
  '0010_lesson_views.sql': '5cced02b9b0d13259d7ce148d67cad742293d201122f98a490eb8dd9bd10b95e',
  // LMS wave 2 (contract on PIL-225, section 11 item 2): the done-mark table.
  '0011_done_marks.sql': '4feabd782aca26c332b2282d93744198411dbe20fdef5b201cf006cebf47ab15',
  // LMS wave 3b (contract on PIL-232, section 10 item 1): the upload table and the membership column.
  '0012_class_upload.sql': '2a5b44991ede382449b6ca26a28a81eef40a4c2545cbe376690b247ba41939c6',
  // LMS wave 4 (contract on PIL-238, section 11 item 1): the subject's "open in order" column.
  '0013_chapters_in_order.sql': '51bae431600df24960efe0049a0430f7e68b8892b5aaa628ecf4e4dd3f71e242',
  // LMS wave 5 (contract on PIL-246, section 11 item 1): the announcement table and its index.
  '0014_announcements.sql': 'b7b7387ee238160e340767740316d07584d0949071c353757e2e38eec6bd154e',
};
/** The cookie names src/ sets today: the session, the device language and the learner's notice. */
const BASE_COOKIES = ['lms_lang', 'lms_notice_', 'lms_session'];

/** The two writes of section 6.2: the previewer's own session refresh and the usage flush. */
const ALLOWED_WRITES = [
  /^UPDATE session SET expires_at = \? WHERE id = \? AND expires_at > 0$/,
  /^INSERT INTO usage_day \(day, requests, writes\) VALUES \(\?, \?, \?\)\s+ON CONFLICT \(day\) DO UPDATE SET requests = requests \+ excluded\.requests, writes = writes \+ excluded\.writes$/,
];
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

type Snapshot = Record<string, string[]>;

interface Step {
  who: string;
  method: string;
  url: string;
  preview: boolean;
  setCookie: boolean;
  cacheControl: string | null;
}

interface Journey {
  before: Snapshot;
  after: Snapshot;
  schemaBefore: string;
  schemaAfter: string;
  previewers: Set<string>;
  statements: string[];
  steps: Step[];
  requests: number;
  usageGrowth: number;
  browsers: { who: string; cookiesBefore: string; cookiesAfter: string; storage: { local: number; session: number; idb: number } }[];
  postForms: string[];
  inert: { who: string; path: string; kind: string; html: string; moved: boolean }[];
  backs: { who: string; landed: string; expected: string }[];
}

let w: Wave3aWorld | undefined;
let browser: Browser | undefined;
let journey: Promise<Journey> | undefined;

after(async () => {
  await browser?.close();
  await w?.close();
});

async function snapshot(world: Wave3aWorld): Promise<Snapshot> {
  const out: Snapshot = {};
  const tables = await world.p.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`);
  // One table at a time (never in parallel; see test/support).
  for (const { name } of tables) {
    const rows = await world.p.sql(`SELECT * FROM "${name}"`);
    out[name as string] = rows.map((r) => JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))).sort();
  }
  return out;
}

const schemaOf = async (world: Wave3aWorld) =>
  JSON.stringify(await world.p.sql(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name`));

/** The owner's usage panel: stored requests plus what is not flushed yet (the panel's own request included). */
async function usageRequests(world: Wave3aWorld): Promise<number> {
  const doc = await (await world.owner.get('/owner')).text();
  const m = /data-usage="requests" data-value="(\d+)"/.exec(doc);
  assert.ok(m, 'the owner\'s usage panel shows the requests');
  return Number(m[1]);
}

/** Resolves once the page has not scrolled for three animation frames (at most two seconds). */
async function settled(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => {
    let last = -1;
    let same = 0;
    let frames = 0;
    const tick = () => {
      const y = window.scrollY;
      same = y === last ? same + 1 : 0;
      last = y;
      if (same >= 3 || ++frames > 120) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

/** Clicks, and presses Enter and Space on, every control of the page that is not a link out of it: the inert controls and the folds. */
async function clickEverything(page: Page, j: Journey, who: string, path: string): Promise<void> {
  const url = page.url();
  const doc = await page.content();
  for (const c of CONTROLS) {
    const e = element(doc, c.open);
    if (!e) continue;
    const sel = { brand: 'a.brand', 'sign-out': '#signout', 'my-account': '#nav-account', 'got-it': '#notice-fold button', done: '#done-control' }[c.kind];
    const target = page.locator(sel).first();
    // Chromium animates the scroll a Space press starts: a click aimed while it moves can land on the
    // element below (the done control sits right above Next, LMS wave 2). Wait until the page is still.
    await settled(page);
    // A real mouse click; forced, because Playwright waits for aria-disabled controls to become enabled.
    // Space on a focused control scrolls the page; a click racing that scroll is tried once more from the top.
    await target.click({ force: true }).catch(async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await target.click({ force: true }).catch(async (err: Error) => {
        const box = await target.boundingBox();
        const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        throw new Error(`${who} ${path} ${c.kind}: ${err.message.split('\n')[0]} (box ${JSON.stringify(box)}, scroll/client ${widths})`);
      });
    });
    await target.focus();
    await page.keyboard.press('Enter');
    await target.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(50);
    j.inert.push({ who, path, kind: c.kind, html: e.html, moved: page.url() !== url });
  }
  for (const summary of await page.locator('summary').all()) {
    await summary.click();
    await summary.click();
  }
  const forms = [...doc.matchAll(/<form\b[^>]*>/gi)].map((m) => m[0]).filter((f) => /method\s*=\s*["']?post/i.test(f));
  for (const f of forms) j.postForms.push(`${who} ${path}: ${f}`);
}

async function hrefs(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
}

async function run(): Promise<Journey> {
  w = await wave3aWorld();
  const world = w;
  browser = await chromium.launch();
  await activity(world, true);
  // LMS wave 2 (W2 AT-4.4): Salma holds two done marks during the journey, so the snapshots hold the done-mark table with rows.
  for (const [title, at] of [['Adding fractions', 1951234567890], ['Comparing fractions', 1951234599999]] as const) {
    await world.p.sql(`INSERT INTO done_mark (space_id, lesson_id, learner_user_id, marked_at) VALUES ('${world.school.id}', '${world.school.lessons[title]}', '${world.ids[SALMA.username]}', ${at})`);
  }
  const ownerId = String((await world.p.sql(`SELECT id FROM user WHERE username = '${OWNER.username}'`))[0].id);
  const j: Journey = {
    before: {}, after: {}, schemaBefore: '', schemaAfter: '', previewers: new Set([world.ids[ADMIN.username], world.ids[HADEER.username], ownerId]),
    statements: [], steps: [], requests: 0, usageGrowth: 0, browsers: [], postForms: [], inert: [], backs: [],
  };
  // Every browser signs in first: a sign-in is not part of the preview.
  const tabs = [];
  for (const who of [ADMIN, HADEER, OWNER]) {
    for (const lang of LANGS) tabs.push({ who, lang, tab: await browserAs(browser, world, who, { lang }) });
  }
  await as(world, ADMIN, 'en'); // a warm-up page view: the panel's reader is the owner's own client
  const spy = world.p.spy;
  assert.ok(spy, 'the statement spy runs on the in-process product (LMS_TEST_RUNTIME=in-process)');
  const usageBefore = await usageRequests(world);
  j.before = await snapshot(world);
  j.schemaBefore = await schemaOf(world);
  spy.start();
  for (const { who, lang, tab } of tabs) {
    const name = `${who.username} ${lang}`;
    const { ctx, page } = tab;
    const base = world.p.url;
    ctx.on('request', (r) => {
      if (!r.url().startsWith(base)) return;
      j.requests++;
      j.steps.push({ who: name, method: r.method(), url: r.url().slice(base.length), preview: /\/preview(?=[/?#]|$)/.test(r.url()), setCookie: false, cacheControl: null });
    });
    ctx.on('response', async (res) => {
      if (!res.url().startsWith(base)) return;
      const step = [...j.steps].reverse().find((s) => s.who === name && base + s.url === res.url());
      if (!step) return;
      const headers = await res.allHeaders();
      step.setCookie = 'set-cookie' in headers;
      step.cacheControl = headers['cache-control'] ?? null;
    });
    const cookiesBefore = JSON.stringify((await ctx.cookies()).map((c) => [c.name, c.value, c.path, c.expires]).sort());
    const visit = async (path: string) => {
      const res = await page.goto(base + path);
      assert.equal(res?.status(), 200, `${name}: ${path} answers 200`);
      await clickEverything(page, j, name, path);
    };
    const owner = who === OWNER;
    const start = owner ? ownerPreview(world.school) : previewHome(world.school, 'home');
    await visit(start);
    if (!owner) {
      const titles = await hrefs(page, 'li.card[data-subject] h2 a');
      const starts = await hrefs(page, 'li.card[data-subject] a.start');
      for (const t of titles) {
        await visit(t);
        const all = await hrefs(page, '#expand-all');
        if (all.length) {
          await visit(all[0]);
          await visit((await hrefs(page, '#collapse-all'))[0]);
        }
      }
      let pdfOpened = false;
      for (const s of starts) {
        await visit(s);
        for (let next = await hrefs(page, '#next-lesson'); next.length; next = await hrefs(page, '#next-lesson')) {
          if (!pdfOpened) pdfOpened = await openPdf(page);
          await visit(next[0]);
        }
        for (let prev = await hrefs(page, '#previous-lesson'); prev.length; prev = await hrefs(page, '#previous-lesson')) await visit(prev[0]);
      }
      assert.ok(pdfOpened, `${name}: one PDF material opened`);
    }
    await visit((await hrefs(page, '#nav-results'))[0]);
    const expected = await page.locator('#preview-back').getAttribute('href');
    await Promise.all([page.waitForEvent('load'), page.locator('#preview-back').click()]);
    j.backs.push({ who: name, landed: page.url().slice(base.length), expected: expected ?? '(none)' });
    const cookiesAfter = JSON.stringify((await ctx.cookies()).map((c) => [c.name, c.value, c.path, c.expires]).sort());
    // Storage is read on a preview page of the product's origin.
    await page.goto(base + start);
    const storage = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      idb: (await indexedDB.databases()).length,
    }));
    j.browsers.push({ who: name, cookiesBefore, cookiesAfter, storage });
  }
  j.statements = await spy.stop();
  j.after = await snapshot(world);
  j.schemaAfter = await schemaOf(world);
  // The panel's own request is counted in its value, so the second read is one more than the journey.
  j.usageGrowth = (await usageRequests(world)) - usageBefore - 1;
  for (const { tab } of tabs) await tab.ctx.close();
  return j;
}

/** Opens the lesson's first PDF material as a browser does (a GET from the page); true when one was opened. */
async function openPdf(page: Page): Promise<boolean> {
  const href = await page.locator('li[data-kind="pdf"] a.open').first().getAttribute('href').catch(() => null);
  if (!href) return false;
  const status = await page.evaluate(async (h) => (await fetch(h, { credentials: 'same-origin' })).status, href);
  assert.equal(status, 200, `the PDF ${href} opens`);
  return true;
}

// The journey takes minutes. In CI its record is kept in evidence/ (uploaded
// with the screenshots) for this run, so the AT-3.1 step makes it and the
// AT-3.2 to AT-3.5 steps of the same run judge the same record.
const RECORD = new URL('evidence/wave3a/at3-journey.json', ROOT);
const RUN = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT ?? '1'}` : null;

async function recorded(): Promise<Journey> {
  if (RUN && existsSync(RECORD)) {
    const saved = JSON.parse(readFileSync(RECORD, 'utf8')) as Journey & { run: string; previewerIds: string[] };
    if (saved.run === RUN) return { ...saved, previewers: new Set(saved.previewerIds) };
  }
  const j = await run();
  if (RUN) {
    mkdirSync(new URL('./', RECORD), { recursive: true });
    writeFileSync(RECORD, JSON.stringify({ ...j, run: RUN, previewerIds: [...j.previewers] }));
  }
  return j;
}

const theJourney = () => (journey ??= recorded());

/** A snapshot with the rows section 6.2 lets change taken out: usage_day, and the previewers' own session expiry. */
function steady(s: Snapshot, previewers: Set<string>): Snapshot {
  const out: Snapshot = {};
  for (const [table, rows] of Object.entries(s)) {
    if (table === 'usage_day') continue;
    out[table] = table === 'session'
      ? rows.map((r) => {
        const row = Object.fromEntries(JSON.parse(r) as [string, unknown][]);
        if (previewers.has(String(row.user_id))) row.expires_at = '(previewer)';
        return JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)));
      }).sort()
      : rows;
  }
  return out;
}

describe('W3a AT-3 the preview changes nothing', { concurrency: false }, () => {
  it('W3a AT-3.1 every row of every table is unchanged but usage_day and the previewers\' session expiry', async (t) => {
    const j = await theJourney();
    const a = steady(j.before, j.previewers);
    const b = steady(j.after, j.previewers);
    assert.deepEqual(Object.keys(b), Object.keys(a), 'the same tables');
    for (const table of Object.keys(a)) assert.deepEqual(b[table], a[table], `table ${table} is unchanged in number and value`);
    for (const table of ['lesson_view', 'exam_result', 'exam_result_history', 'lesson_view_setting', 'guardian_link', 'membership', 'user']) {
      assert.ok(table in a, `${table} is in the snapshot`);
    }
    t.diagnostic(`AT-3.1 the journey made ${j.requests} requests over ${j.browsers.length} browsers; usage requests grew by ${j.usageGrowth}`);
    assert.equal(j.usageGrowth, j.requests, 'usage_day.requests (stored plus not yet flushed) grows by exactly the journey\'s requests');
  });

  it('W3a AT-3.2 no preview request runs a write other than the session refresh and the usage flush', async (t) => {
    const j = await theJourney();
    const writes = j.statements.filter((s) => WRITE.test(s)).map((s) => s.replace(/\s+/g, ' ').trim());
    const other = writes.filter((s) => !ALLOWED_WRITES.some((re) => re.test(s.replace(/\s+/g, ' ')) || re.test(s)));
    t.diagnostic(`AT-3.2 ${j.statements.length} statements under the spy, ${writes.length} writes (session refresh and usage flush only)`);
    assert.deepEqual(other, [], 'no other INSERT, UPDATE, DELETE or REPLACE');
  });

  it('W3a AT-3.3 no Set-Cookie, Cache-Control: no-store, cookies and browser storage unchanged', async () => {
    const j = await theJourney();
    const preview = j.steps.filter((s) => s.preview);
    assert.ok(preview.length > 0, 'the journey made preview requests');
    for (const s of preview) {
      assert.equal(s.setCookie, false, `${s.who} ${s.url}: no Set-Cookie`);
      assert.equal(s.cacheControl, 'no-store', `${s.who} ${s.url}: Cache-Control: no-store`);
    }
    for (const b of j.browsers) {
      assert.equal(b.cookiesAfter, b.cookiesBefore, `${b.who}: the browser's cookies are those before the journey`);
      assert.deepEqual(b.storage, { local: 0, session: 0, idb: 0 }, `${b.who}: local storage, session storage and IndexedDB are empty`);
    }
  });

  it('W3a AT-3.4 GET or HEAD only, no post form, every control that would write or leave is inert', async () => {
    const j = await theJourney();
    const sent = j.steps.filter((s) => s.method !== 'GET' && s.method !== 'HEAD').map((s) => `${s.who} ${s.method} ${s.url}`);
    assert.deepEqual(sent, [], 'no request other than GET or HEAD, whatever is clicked');
    assert.deepEqual(j.postForms, [], 'no preview page holds a <form method="post">');
    assert.ok(j.inert.length > 0, 'the inert controls were clicked');
    for (const kind of ['brand', 'sign-out', 'my-account', 'got-it', 'done']) assert.ok(j.inert.some((x) => x.kind === kind), `${kind} was met and clicked`);
    for (const x of j.inert) {
      assertInert(x.html, `${x.who} ${x.path} ${x.kind}`);
      assert.equal(x.moved, false, `${x.who} ${x.path} ${x.kind}: click, Enter and Space do nothing`);
    }
    for (const b of j.backs) assert.equal(b.landed, b.expected, `${b.who}: "Back to where I was" leads back`);
  });
});

describe('W3a AT-3.5 no new stored data', () => {
  it('W3a AT-3.5 tables, columns, indexes, migrations and cookie names are those of the base commit', async () => {
    const files = readdirSync(new URL('migrations/', ROOT)).sort();
    assert.deepEqual(files, Object.keys(BASE_MIGRATIONS).sort(), 'the same migration files');
    for (const f of files) {
      const text = readFileSync(new URL(`migrations/${f}`, ROOT), 'utf8').replace(/\r\n/g, '\n');
      assert.equal(createHash('sha256').update(text).digest('hex'), BASE_MIGRATIONS[f], `${f} is unchanged`);
    }
    // The cookie names src/ knows: every lms_ name, and every setCookie call's name.
    const names = new Set<string>();
    const walk = (dir: URL) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
        else if (e.name.endsWith('.ts')) for (const m of readFileSync(new URL(e.name, dir), 'utf8').matchAll(/['"`](lms_[a-z_]*)/g)) names.add(m[1]);
      }
    };
    walk(new URL('src/', ROOT));
    assert.deepEqual([...names].sort(), BASE_COOKIES, 'no new cookie name in src/');
    // The schema the product runs with does not change during the journey (tables, columns, indexes).
    const j = await theJourney();
    assert.equal(j.schemaAfter, j.schemaBefore, 'the schema is unchanged by the journey');
  });
});
