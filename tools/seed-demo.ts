// LMS redesign wave R1a (product-contract v2 on PIL-322, S12): fills a LOCAL
// copy of the product with the seeded Arabic world the tests use
// (test/redesign/world.ts: school colour #E9A020, سلمى with 8 subjects,
// announcements, a quiz, results, a guardian), for the owner's look at the
// redesign on a phone and a computer. Made-up data only.
//
// It only ever writes Wrangler's LOCAL database and file store (`--local`);
// it never reaches the live product. It refuses a local database that already
// has people in it: start from an empty one (delete .wrangler/state).
//
//   node tools/seed-demo.ts                # for `npm run dev`
//   node tools/seed-demo.ts --env test     # for `npm run dev:test` (the clock can be fixed)
//
// Then sign in as salma.r1a / salma-r1a-pass-2026 (the learner; the other people
// and their passwords are in test/redesign/world.ts). The world's dates are
// around 27 November 2026: on a later day the to-do groups shift.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILES, PEOPLE, worldRows } from '../test/redesign/world.ts';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
const extra = process.argv.slice(2);
if (extra.some((a) => a === '--remote')) throw new Error('seed-demo writes the local copy only');

// On Windows the .cmd shim needs a shell, which splits arguments at spaces: quote them there.
const arg = (a: string) => (process.platform === 'win32' && /[\s*()]/.test(a) ? `"${a}"` : a);
const wrangler = (args: string[]) => execFileSync(bin, [...args, '--local', ...extra].map(arg), { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] });

/** A value as an SQL literal (text quoted, numbers as they are, NULL). */
const literal = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

wrangler(['d1', 'migrations', 'apply', 'lms-lego']);
const people = JSON.parse(wrangler(['d1', 'execute', 'lms-lego', '--json', '--command', 'SELECT COUNT(*) AS n FROM user'])) as { results: { n: number }[] }[];
if (Number(people[0]?.results[0]?.n ?? 0) > 0) throw new Error('the local database already has people: delete .wrangler/state and run again');

const dir = mkdtempSync(join(tmpdir(), 'lms-seed-'));
try {
  // LMS redesign R1b (S7, section 7): one subject with a chosen look (اللغة العربية: c03 + letters).
  const sql = (await worldRows({ look: true })).map(([q, ...params]) => {
    let i = 0;
    return q.replace(/\?/g, () => literal(params[i++])) + ';';
  });
  writeFileSync(join(dir, 'world.sql'), sql.join('\n') + '\n');
  wrangler(['d1', 'execute', 'lms-lego', '--file', join(dir, 'world.sql')]);
  for (const f of Object.values(FILES)) {
    const file = join(dir, f.key.replace(/\//g, '_'));
    writeFileSync(file, f.bytes());
    wrangler(['r2', 'object', 'put', `lms-lego-files/${f.key}`, '--file', file, '--content-type', f.type]);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`seeded: ${PEOPLE.length} people; sign in as salma.r1a`);
