// LMS redesign wave R1a (product-contract v2 on PIL-322, S12, S13): AT-R1a.6a
// (the home against test/redesign/baseline.json, recorded on d1a5ae3 in the
// same seeded world, and the shared CSS) and AT-R1a.6b (the built Worker
// bundle: compressed size and no font inside; the fonts are static assets).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { measure, PAGES } from './budget.ts';
import { HOME, SALMA, SUBJECTS, r1aWorld, type R1aWorld } from './world.ts';

const root = join(import.meta.dirname, '..', '..');
const baseline = JSON.parse(readFileSync(join(import.meta.dirname, 'baseline.json'), 'utf8')) as { commit: string; home: { queries: number; htmlBytes: number } };

let w: R1aWorld;
before(async () => {
  w = await r1aWorld();
});
after(async () => {
  await w?.close();
});

describe('AT-R1a.6 budgets', () => {
  it('AT-R1a.6a the home with 8 subjects: D1 queries ≤ baseline + 1 and HTML ≤ baseline + 25 KB; the shared CSS ≤ 48 KB', async () => {
    assert.equal(baseline.commit.slice(0, 7), 'd1a5ae3');
    assert.equal(SUBJECTS.filter((s) => s.published).length, 8, 'سلمى has 8 subjects');
    const home = await measure(w, PAGES.home);
    assert.ok(home.queries <= baseline.home.queries + 1, `queries ${home.queries} (baseline ${baseline.home.queries})`);
    assert.ok(home.htmlBytes <= baseline.home.htmlBytes + 25 * 1024, `HTML ${home.htmlBytes} B (baseline ${baseline.home.htmlBytes})`);
    const page = await (await (await w.as(SALMA)).get(HOME)).text();
    const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
    const bytes = Buffer.byteLength(css, 'utf8');
    assert.ok(bytes > 0 && bytes <= 48 * 1024, `shared CSS ${bytes} B`);
  });

  it('AT-R1a.6b the built Worker bundle is ≤ 3 MB compressed and contains no font file', { timeout: 300_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), 'r1a-bundle-'));
    try {
      const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
      execFileSync(bin, ['deploy', '--dry-run', '--outdir', out], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
      const files = readdirSync(out, { recursive: true }).map(String).filter((f) => statSync(join(out, f)).isFile());
      assert.ok(files.some((f) => f.endsWith('.js')), `bundle files: ${files.join(', ')}`);
      const code = files.filter((f) => !f.endsWith('.map'));
      const gz = code.reduce((n, f) => n + gzipSync(readFileSync(join(out, f))).length, 0);
      assert.ok(gz <= 3 * 1024 * 1024, `compressed ${gz} B`);
      for (const f of files) {
        assert.ok(!/\.(woff2?|ttf|otf)$/i.test(f), `${f}: a font file in the bundle`);
        const bytes = readFileSync(join(out, f));
        assert.equal(bytes.includes('wOF2'), false, `${f}: WOFF2 data inside`);
        assert.equal(bytes.includes('wOFF'), false, `${f}: WOFF data inside`);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
