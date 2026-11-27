// LMS redesign wave R1a (S12): records test/redesign/baseline.json on the code
// in LMS_BASE_ROOT (main d1a5ae3: a folder holding its src/ and migrations/).
// Not a CI step: run once by hand; the file it writes is handed in with R1a's
// first commit and read by the budget step (AT-R1a.6a).
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { r1aWorld } from './world.ts';
import { measureAll } from './budget.ts';

it('records the d1a5ae3 baseline', { skip: !process.env.LMS_BASE_ROOT }, async () => {
  const w = await r1aWorld({ root: process.env.LMS_BASE_ROOT });
  try {
    const b = await measureAll(w);
    assert.ok(b.home.queries > 0 && b.home.htmlBytes > 0);
    const out = { commit: 'd1a5ae33b67c0de818e06f53900d4cbf848181d8', world: 'test/redesign/world.ts as سلمى, clock 2026-11-27', ...b };
    writeFileSync(fileURLToPath(new URL('./baseline.json', import.meta.url)), `${JSON.stringify(out, null, 2)}\n`);
  } finally {
    await w.close();
  }
});
