// LMS redesign wave R1a (product-contract v2 on PIL-322, S3; AT-R1a.4b, UX-95):
// the font files and their licence as the product serves them. In CI this runs
// on the real Worker under Wrangler (startProduct, runtime "workerd"), so
// wrangler.jsonc's "build" and "assets" and the `_headers` cache rule are what
// is proven; on the Builder's Windows machine it runs in process.
import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { startProduct, type Product } from '../support/product.ts';
// @ts-expect-error: a plain ES module (tools/build-assets.mjs) with no type file.
import { SUBSETS, WEIGHTS } from '../../tools/build-assets.mjs';

let p: Product;
before(async () => {
  p = await startProduct();
});
after(async () => {
  await p?.stop();
});

it('AT-R1a.4b UX-95 every font file answers 200 with max-age ≥ 2,592,000 s, total ≤ 450 KB; the OFL file is served', async (t) => {
  let total = 0;
  for (const short of Object.values(SUBSETS) as string[]) {
    for (const w of WEIGHTS as number[]) {
      const res = await fetch(`${p.url}/assets/fonts/plex-${short}-${w}.woff2`);
      assert.equal(res.status, 200, `plex-${short}-${w}`);
      const cache = res.headers.get('cache-control') ?? '';
      assert.ok(Number(/max-age=(\d+)/.exec(cache)?.[1] ?? 0) >= 2_592_000, `plex-${short}-${w}: ${cache}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'wOF2', `plex-${short}-${w} is WOFF2`);
      total += bytes.length;
    }
  }
  t.diagnostic(`runtime ${p.runtime}; fonts ${total} B`);
  assert.ok(total <= 450 * 1024, `fonts ${total} B`);
  const ofl = await fetch(`${p.url}/assets/fonts/OFL.txt`);
  assert.equal(ofl.status, 200);
  assert.match(await ofl.text(), /SIL OPEN FONT LICENSE/i);
});
