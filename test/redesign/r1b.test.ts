// LMS redesign wave R1b (product-contract v2 on PIL-322, S7 and section 7;
// ux-plan UX-101): the responsible teacher chooses a subject's colour and icon
// from the fixed sets (D6) on the Look card of the subject editor; learners see
// the chosen look on their home cards, the "continue" hero and My subjects.
// AT-R1b.1 to AT-R1b.4, in the seeded Arabic world (test/redesign/world.ts),
// in process. The Look card's layout and live sample are in r1b-ux.test.ts.
// Made-up data only.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  HERO_LESSON, HOME, ID, KHALED, MATH, MONA, SALMA, SUBJECTS, SUBJECTS_PAGE, YOUSSEF, r1aWorld, type R1aWorld,
} from './world.ts';
import { Client } from '../support/http.ts';
import { ICONS, PALETTE, autoColour, lookOf, subjectColours } from '../../src/look.ts';

/** The element with this id, start tag to its matching end tag (as home.test.ts reads it). */
export function elementById(page: string, id: string): string | null {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>`).exec(page);
  if (!open) return null;
  const re = new RegExp(`<${open[1]}\\b[^>]*>|</${open[1]}>`, 'g');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m = re.exec(page); m; m = re.exec(page)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return page.slice(open.index, m.index + m[0].length);
  }
  return null;
}

const repo = fileURLToPath(new URL('../..', import.meta.url));
const EDITOR = (subjectId: string) => `/s/${ID.space}/publish/edit/${subjectId}`;
const LOOK = (subjectId: string) => `${EDITOR(subjectId)}/look`;
const ORDER = (subjectId: string) => `${EDITOR(subjectId)}/order`;
const SAVED = 'تمّ حفظ الشكل';

/** The card of one subject on a learner page (home or My subjects). */
function cardOf(page: string, subjectId: string): string {
  const m = new RegExp(`<li class="card subj" data-subject="${subjectId}"[\\s\\S]*?</li>`).exec(page);
  assert.ok(m, `the card of ${subjectId}`);
  return m[0];
}

/** The colour (palette hex, as the page writes it) and the icon a fragment shows for its subject. */
function shownLook(fragment: string): { colour: string; icon: string } {
  const colour = /--subj:(#[0-9a-f]{6})/i.exec(fragment)?.[1] ?? '';
  const icon = /<span class="sicon"><svg[^>]*data-icon="([a-z-]+)"/.exec(fragment)?.[1] ?? /class="kick"><svg[^>]*data-icon="([a-z-]+)"/.exec(fragment)?.[1] ?? '';
  return { colour, icon };
}
const hexOf = (key: string) => subjectColours(PALETTE.find((p) => p.key === key)!.hex).subject;
const autoHex = (subjectId: string) => subjectColours(autoColour(subjectId).hex).subject;

function stored(w: R1aWorld, subjectId: string): { look_colour: unknown; look_icon: unknown } | null {
  const row = w.sql('SELECT look_colour, look_icon FROM subject WHERE id = ?', subjectId)[0];
  return row ? { look_colour: row.look_colour, look_icon: row.look_icon } : null;
}

describe('AT-R1b sets and resolving (units)', () => {
  it('AT-R1b.0 the sets hold 12 colour keys c01 to c12 and the 16 icon keys of UX-101; lookOf reads NULL and unknown keys as automatic', () => {
    assert.deepEqual(PALETTE.map((p) => p.key), Array.from({ length: 12 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`));
    assert.deepEqual(ICONS.map((i) => i.key), ['book', 'calculator', 'flask', 'pen-book', 'letters', 'globe', 'map', 'landmark', 'palette', 'music', 'ball', 'computer', 'leaf', 'atom', 'heart', 'lightbulb']);
    for (const i of ICONS) assert.ok(i.ar && i.en, `${i.key} has an Arabic and an English name`);
    const auto = lookOf('s-1', null, null);
    assert.deepEqual({ colour: auto.colour.key, icon: auto.icon, chosenColour: auto.chosenColour, chosenIcon: auto.chosenIcon }, { colour: autoColour('s-1').key, icon: 'book', chosenColour: null, chosenIcon: null });
    const odd = lookOf('s-1', 'zz9', 'nope');
    assert.deepEqual({ colour: odd.colour.key, icon: odd.icon, chosenColour: odd.chosenColour, chosenIcon: odd.chosenIcon }, { colour: autoColour('s-1').key, icon: 'book', chosenColour: null, chosenIcon: null });
    const chosen = lookOf('s-1', 'c05', 'flask');
    assert.deepEqual({ colour: chosen.colour.key, icon: chosen.icon, chosenColour: chosen.chosenColour, chosenIcon: chosen.chosenIcon }, { colour: 'c05', icon: 'flask', chosenColour: 'c05', chosenIcon: 'flask' });
  });
});

describe('AT-R1b.1 choose and see', { concurrency: false }, () => {
  let w: R1aWorld;
  before(async () => { w = await r1aWorld(); });
  after(async () => { await w?.close(); });

  it('AT-R1b.1a the responsible publisher saves colour c05 and icon flask: «تمّ حفظ الشكل», both keys stored, the sample card shows them', async () => {
    assert.deepEqual(stored(w, MATH.id), { look_colour: null, look_icon: null }, 'automatic before');
    const mona = await w.as(MONA);
    const res = await mona.post(LOOK(MATH.id), { colour: 'c05', icon: 'flask' });
    assert.equal(res.status, 303);
    const to = res.headers.get('location') ?? '';
    assert.ok(to.startsWith(EDITOR(MATH.id) + '?'), `back to the editor (${to})`);
    assert.deepEqual(stored(w, MATH.id), { look_colour: 'c05', look_icon: 'flask' });
    const page = await (await mona.get(to)).text();
    const card = elementById(page, 'look') ?? '';
    assert.ok(card.includes(SAVED), 'the Look card says «تمّ حفظ الشكل»');
    const sample = elementById(page, 'look-sample') ?? '';
    assert.deepEqual(shownLook(sample), { colour: hexOf('c05'), icon: 'flask' }, 'the sample shows the saved look');
    assert.match(card, /<input[^>]*name="colour"[^>]*value="c05"[^>]*checked|<input[^>]*checked[^>]*name="colour"[^>]*value="c05"/, 'c05 is the checked colour');
    assert.match(card, /<input[^>]*name="icon"[^>]*value="flask"[^>]*checked|<input[^>]*checked[^>]*name="icon"[^>]*value="flask"/, 'flask is the checked icon');
  });

  it('AT-R1b.1b سلمى\'s card, hero and My subjects show the chosen colour band and icon', async () => {
    const salma = await w.as(SALMA);
    const home = await (await salma.get(HOME)).text();
    assert.deepEqual(shownLook(cardOf(home, MATH.id)), { colour: hexOf('c05'), icon: 'flask' }, 'home card');
    const hero = elementById(home, 'continue') ?? '';
    assert.ok(hero.includes(`/read/${HERO_LESSON.id}`), 'the hero is الرياضيات\'s');
    assert.deepEqual(shownLook(hero), { colour: hexOf('c05'), icon: 'flask' }, 'hero');
    const mine = await (await salma.get(SUBJECTS_PAGE)).text();
    assert.deepEqual(shownLook(cardOf(mine, MATH.id)), { colour: hexOf('c05'), icon: 'flask' }, 'My subjects card');
    for (const s of SUBJECTS.slice(1, 8)) assert.deepEqual(shownLook(cardOf(home, s.id)), { colour: autoHex(s.id), icon: 'book' }, `${s.title} stays automatic`);
  });

  it('AT-R1b.1c يوسف\'s card and My subjects show the same look', async () => {
    const youssef = await w.as(YOUSSEF);
    const home = await (await youssef.get(HOME)).text();
    assert.deepEqual(shownLook(cardOf(home, MATH.id)), { colour: hexOf('c05'), icon: 'flask' }, 'home card');
    const mine = await (await youssef.get(SUBJECTS_PAGE)).text();
    assert.deepEqual(shownLook(cardOf(mine, MATH.id)), { colour: hexOf('c05'), icon: 'flask' }, 'My subjects card');
  });

  it('AT-R1b.1d choosing "Automatic" stores both NULL and the automatic colour and book icon return', async () => {
    const mona = await w.as(MONA);
    const res = await mona.post(LOOK(MATH.id), { colour: 'auto', icon: 'auto' });
    assert.equal(res.status, 303);
    assert.deepEqual(stored(w, MATH.id), { look_colour: null, look_icon: null });
    const page = await (await mona.get(res.headers.get('location') ?? '')).text();
    assert.ok((elementById(page, 'look') ?? '').includes(SAVED));
    assert.deepEqual(shownLook(elementById(page, 'look-sample') ?? ''), { colour: autoHex(MATH.id), icon: 'book' }, 'the sample is automatic again');
    for (const who of [SALMA, YOUSSEF]) {
      const c = await w.as(who);
      const home = await (await c.get(HOME)).text();
      assert.deepEqual(shownLook(cardOf(home, MATH.id)), { colour: autoHex(MATH.id), icon: 'book' }, `${who.display_name}: home card`);
      const mine = await (await c.get(SUBJECTS_PAGE)).text();
      assert.deepEqual(shownLook(cardOf(mine, MATH.id)), { colour: autoHex(MATH.id), icon: 'book' }, `${who.display_name}: My subjects`);
    }
    const hero = elementById(await (await (await w.as(SALMA)).get(HOME)).text(), 'continue') ?? '';
    assert.deepEqual(shownLook(hero), { colour: autoHex(MATH.id), icon: 'book' }, 'hero');
  });
});

describe('AT-R1b.2 refusals store nothing', { concurrency: false }, () => {
  let w: R1aWorld;
  const OTHER = 'r1b-subj-other-space';
  const GONE = 'r1b-subj-gone';
  before(async () => {
    w = await r1aWorld();
    // A look already chosen, so "unchanged" is a real pair.
    w.run("UPDATE subject SET look_colour = 'c02', look_icon = 'globe' WHERE id = ?", MATH.id);
    // A subject of the other space, with this space's teacher named as its publisher.
    w.run('INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES (?, ?, ?, ?, 1)', OTHER, ID.otherSpace, 'مادة المدرسة الأخرى', MONA.id);
    w.run("UPDATE subject SET look_colour = 'c09', look_icon = 'atom' WHERE id = ?", OTHER);
    // A subject that was there and is gone (no row).
    w.run('INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES (?, ?, ?, ?, 0)', GONE, ID.space, 'مادة محذوفة', MONA.id);
    w.run('DELETE FROM subject WHERE id = ?', GONE);
  });
  after(async () => { await w?.close(); });

  const KEYS = [
    ['AT-R1b.2a an unknown colour key', { colour: 'c13', icon: 'flask' }],
    ['AT-R1b.2b an unknown icon key', { colour: 'auto', icon: 'rocket' }],
    ['AT-R1b.2c a valid colour with an unknown icon', { colour: 'c05', icon: 'nope' }],
    ['AT-R1b.2c a missing icon field', { colour: 'c05' }],
  ] as const;
  for (const [name, fields] of KEYS) {
    it(`${name} is refused (400, beside the group, as the editor's other forms refuse a value outside their set) and both columns read back unchanged`, async () => {
      const mona = await w.as(MONA);
      const before = stored(w, MATH.id);
      const res = await mona.post(LOOK(MATH.id), fields as Record<string, string>);
      assert.equal(res.status, 400);
      const order = await mona.post(ORDER(MATH.id), { state: 'maybe' });
      assert.equal(order.status, 400, 'the order form refuses a value outside its set with 400 too');
      const page = await res.text();
      const refusal = elementById(page, 'look-refusal') ?? '';
      assert.ok(refusal.length > 0 && (elementById(page, 'look') ?? '').includes(refusal), 'the refusal sits in the Look card');
      assert.deepEqual(stored(w, MATH.id), before);
      assert.deepEqual(before, { look_colour: 'c02', look_icon: 'globe' });
    });
  }

  /** The person and subject of each refused request, and how the editor's order form answers the same request. */
  const PEOPLE_CASES: [string, () => Promise<Client>, string][] = [
    ['AT-R1b.2d a subject of another space', () => w.as(MONA), OTHER],
    ['AT-R1b.2e a deleted subject', () => w.as(MONA), GONE],
    ['AT-R1b.2f a teacher who is not the responsible publisher', () => w.as(KHALED), MATH.id],
    ['AT-R1b.2g a learner', () => w.as(SALMA), MATH.id],
    ['AT-R1b.2h signed out', async () => new Client(w.url), MATH.id],
  ];
  for (const [name, who, subjectId] of PEOPLE_CASES) {
    it(`${name} is refused as the order form refuses it, and both columns read back unchanged`, async () => {
      const before = { math: stored(w, MATH.id), other: stored(w, OTHER), gone: stored(w, GONE) };
      const c = await who();
      const res = await c.post(LOOK(subjectId), { colour: 'c05', icon: 'flask' });
      const body = await res.text();
      const order = await c.post(ORDER(subjectId), { state: 'on' });
      const orderBody = await order.text();
      assert.ok(res.status >= 300, `refused (${res.status})`);
      assert.equal(res.status, order.status, 'the same status as the order form');
      assert.equal(res.headers.get('location'), order.headers.get('location'), 'the same redirect, if any');
      if (res.status !== 303) assert.equal(body, orderBody, 'the same page as the order form');
      // The order form refused too, so nothing of its own was written either.
      assert.deepEqual({ math: stored(w, MATH.id), other: stored(w, OTHER), gone: stored(w, GONE) }, before);
      assert.deepEqual(before.math, { look_colour: 'c02', look_icon: 'globe' });
      assert.deepEqual(before.other, { look_colour: 'c09', look_icon: 'atom' });
      assert.equal(before.gone, null);
    });
  }
});

describe('AT-R1b.3 safety', { concurrency: false }, () => {
  let w: R1aWorld;
  before(async () => { w = await r1aWorld(); });
  after(async () => { await w?.close(); });

  it('AT-R1b.3a a row with look_colour zz9 and look_icon nope renders the automatic colour and book icon with status 200, nothing logged', async () => {
    w.run("UPDATE subject SET look_colour = 'zz9', look_icon = 'nope' WHERE id = ?", MATH.id);
    w.p.worker.clearLog();
    const salma = await w.as(SALMA);
    for (const path of [HOME, SUBJECTS_PAGE]) {
      const res = await salma.get(path);
      assert.equal(res.status, 200, path);
      const page = await res.text();
      assert.deepEqual(shownLook(cardOf(page, MATH.id)), { colour: autoHex(MATH.id), icon: 'book' }, path);
      if (path === HOME) assert.deepEqual(shownLook(elementById(page, 'continue') ?? ''), { colour: autoHex(MATH.id), icon: 'book' }, 'hero');
    }
    const editor = await (await w.as(MONA)).get(EDITOR(MATH.id));
    assert.equal(editor.status, 200);
    const page = await editor.text();
    assert.deepEqual(shownLook(elementById(page, 'look-sample') ?? ''), { colour: autoHex(MATH.id), icon: 'book' }, 'the sample');
    assert.match(elementById(page, 'look') ?? '', /<input[^>]*name="colour"[^>]*value="auto"[^>]*checked/, '"Automatic" is the checked colour');
    assert.deepEqual(w.p.worker.log(), [], 'nothing logged');
    assert.deepEqual(stored(w, MATH.id), { look_colour: 'zz9', look_icon: 'nope' }, 'reading changes nothing');
  });

  it('AT-R1b.3b two saves of different looks sent back to back end with the second look whole; sent together, the stored pair is always one save\'s whole pair', async () => {
    const mona = await w.as(MONA);
    const A = { colour: 'c05', icon: 'flask' };
    const B = { colour: 'c09', icon: 'atom' };
    for (let i = 0; i < 5; i++) {
      const [first, second] = i % 2 ? [B, A] : [A, B];
      // Back to back: the second is sent the moment the first is answered (sent at once, below, either may land last).
      const one = await mona.post(LOOK(MATH.id), first);
      const two = await mona.post(LOOK(MATH.id), second);
      assert.equal(one.status, 303);
      assert.equal(two.status, 303);
      assert.deepEqual(stored(w, MATH.id), { look_colour: second.colour, look_icon: second.icon }, `round ${i + 1}: the second look, whole`);
    }
    for (let i = 0; i < 10; i++) {
      const got = await Promise.all([mona.post(LOOK(MATH.id), A), mona.post(LOOK(MATH.id), B)]);
      assert.deepEqual(got.map((r) => r.status), [303, 303]);
      const s = stored(w, MATH.id);
      assert.ok([JSON.stringify({ look_colour: 'c05', look_icon: 'flask' }), JSON.stringify({ look_colour: 'c09', look_icon: 'atom' })].includes(JSON.stringify(s)), `together ${i + 1}: a whole pair (${JSON.stringify(s)})`);
    }
  });

  it('AT-R1b.3c the copy and export paths of subject rows: the list is empty (every INSERT INTO subject outside the editor creates a new subject or seeds a test, none copies a row)', () => {
    /** S7 Copies: the paths that copy or export subject rows (the PR lists them): none at d1a5ae3 or fbf9c69. */
    const COPY_PATHS: string[] = [];
    assert.deepEqual(COPY_PATHS, []);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|mjs|js|sql)$/.test(e.name)) {
          const text = readFileSync(p, 'utf8');
          for (const m of text.matchAll(/INSERT INTO subject\b(?!_)[^;`'"]*/g)) hits.push(`/${relative(repo, p).replace(/\\/g, '/')}: ${m[0].slice(0, 90)}`);
        }
      }
    };
    for (const d of ['src', 'scripts', 'tools', 'migrations']) walk(join(repo, d));
    // Each remaining hit is a new subject (admin "add subject": no look, so automatic) or the test-build seed; neither reads another subject row.
    assert.deepEqual(hits.map((h) => h.split(':')[0]).sort(), ['/src/admin.ts', '/src/test-hooks.ts']);
    for (const h of hits) assert.ok(!/SELECT/i.test(h), `${h}: inserts values, copies no row`);
    const admin = readFileSync(join(repo, 'src', 'admin.ts'), 'utf8');
    assert.match(admin, /INSERT INTO subject \(id, space_id, title, publisher_user_id, is_published\) VALUES \(\?, \?, \?, \?, 0\)/, 'admin creates a new draft subject (look automatic)');
    // No subject row leaves the product as a file (no backup or export download of subjects).
    const app = readFileSync(join(repo, 'src', 'app.ts'), 'utf8');
    assert.ok(!/content-disposition[^\n]*(subject|backup|export)/i.test(app), 'no subject export download');
  });
});

describe('AT-R1b.4 migration 0018', () => {
  type Row = Record<string, unknown>;
  const lf = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const schemaOf = (db: DatabaseSync) =>
    (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT IN ('d1_migrations', 'sqlite_sequence') AND name NOT LIKE 'sqlite_autoindex%' ORDER BY type, name").all() as Row[]).map((r) => ({ ...r }));
  const columnsOf = (db: DatabaseSync, table: string) => (db.prepare(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`).all() as Row[]).map((r) => ({ ...r }));
  /** A database with the migration files up to `last` applied as Wrangler records them. */
  function migrated(last: string): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
    for (const f of readdirSync(join(repo, 'migrations')).filter((n) => n.endsWith('.sql') && n <= last).sort()) {
      db.exec(lf(join(repo, 'migrations', f)));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
    }
    return db;
  }
  const MIGRATION = '0018_subject_look.sql';
  const DOWN = join(repo, 'migrations-down', '0018_subject_look.down.sql');

  it('AT-R1b.4a 0018 only adds the two nullable columns look_colour and look_icon to subject', () => {
    const files = readdirSync(join(repo, 'migrations')).filter((n) => n.endsWith('.sql')).sort();
    assert.equal(files.at(-1), MIGRATION, '0018 is the newest migration');
    const statements = lf(join(repo, 'migrations', MIGRATION)).replace(/--[^\n]*/g, '').split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    assert.deepEqual(statements, ['ALTER TABLE subject ADD COLUMN look_colour TEXT', 'ALTER TABLE subject ADD COLUMN look_icon TEXT']);
    const base = migrated('0017_chapter_opening.sql');
    const cand = migrated(MIGRATION);
    const added = columnsOf(cand, 'subject').filter((c) => !columnsOf(base, 'subject').some((b) => b.name === c.name));
    assert.deepEqual(added, [
      { name: 'look_colour', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { name: 'look_icon', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    ]);
    const b = schemaOf(base);
    const c = schemaOf(cand);
    for (const r of b) if (r.name !== 'subject') assert.deepEqual(c.find((x) => x.name === r.name), r, `${String(r.name)}: unchanged`);
    assert.equal(c.length, b.length, 'no new table or index');
  });

  it('AT-R1b.4b the down script, outside migrations/, restores the d1a5ae3 schema and record on a copy with rows; applying 0018 again gives the R1b schema', async () => {
    assert.ok(readdirSync(join(repo, 'migrations')).every((n) => !n.includes('.down.')), 'no down script in migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(repo, f), 'utf8')), `${f} does not refer to the down script`);
    // d1a5ae3's migrations are this checkout's 0001 to 0017 (R1a changed no stored data; their hashes are pinned in wave 1 AT-3.4).
    const base = migrated('0017_chapter_opening.sql');
    const cand = migrated(MIGRATION);
    const { worldRows } = await import('./world.ts');
    for (const [q, ...params] of await worldRows({ look: true })) cand.prepare(q).run(...params);
    assert.equal(Number((cand.prepare('SELECT COUNT(*) AS n FROM subject WHERE look_colour IS NOT NULL').get() as Row).n), 1, 'the seeded world has one chosen look');
    const tables = schemaOf(base).filter((r) => r.type === 'table').map((r) => String(r.name));
    const snapshot = () => Object.fromEntries(tables.map((t) => [t, (cand.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all() as Row[]).map((r) => {
      const { look_colour: _a, look_icon: _b, ...rest } = { ...r };
      return t === 'subject' ? rest : { ...r };
    })]));
    const rowsBefore = snapshot();
    cand.exec(lf(DOWN));
    assert.deepEqual(schemaOf(cand), schemaOf(base), 'the schema is exactly d1a5ae3\'s');
    for (const t of tables) assert.deepEqual(columnsOf(cand, t), columnsOf(base, t), `${t}: d1a5ae3's columns`);
    assert.deepEqual(cand.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => (r as Row).name), base.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => (r as Row).name), 'Wrangler\'s record is d1a5ae3\'s');
    assert.deepEqual(snapshot(), rowsBefore, 'every row is unchanged but the two dropped columns');
    cand.exec(lf(join(repo, 'migrations', MIGRATION)));
    assert.deepEqual(schemaOf(cand), schemaOf(migrated(MIGRATION)), 'a later forward apply gives the R1b schema again');
  });

  it('AT-R1b.4c the README\'s deploy note says migration 0018 is applied before the R1b Worker, and how to roll back', () => {
    const text = readFileSync(join(repo, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const part = text.slice(text.indexOf('**Subject look (LMS redesign R1b):**'));
    assert.ok(part.startsWith('**Subject look (LMS redesign R1b):**'), 'an R1b entry');
    for (const phrase of ['apply migration 0018 before deploying the R1b Worker', 'migrations-down/0018_subject_look.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script', 'NULL means automatic']) {
      assert.ok(part.includes(phrase), `the README says: ${phrase}`);
    }
  });
});
