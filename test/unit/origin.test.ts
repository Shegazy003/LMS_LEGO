// The cross-origin rule (src/origin.ts) is an exact match on scheme, host and
// port. The live sweep (test/guards/cross-origin.test.ts) posts every form
// from near origins too; this covers the one case local emulation cannot show:
// `wrangler dev`'s proxy rewrites any Origin on the same host to the Worker's
// own origin whatever its scheme, so "another scheme" is checked here (and on
// the live https address by the deploy smoke check, scripts/smoke-check.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../../src/origin.ts';

const LIVE = 'https://lms-lego.mesk.workers.dev/signin';

test('origin: the product\'s own origin, or a browser\'s same-origin Sec-Fetch-Site, is accepted', () => {
  assert.equal(isSameOrigin(LIVE, 'https://lms-lego.mesk.workers.dev', undefined), true);
  assert.equal(isSameOrigin(LIVE, undefined, 'same-origin'), true);
});

test('origin: near origins are refused (null, another scheme, another port, a subdomain, a parent domain, no origin)', () => {
  for (const origin of [
    'null',
    'http://lms-lego.mesk.workers.dev',
    'https://lms-lego.mesk.workers.dev:8443',
    'https://evil.lms-lego.mesk.workers.dev',
    'https://mesk.workers.dev',
    'https://lms-lego.mesk.workers.dev.evil.example',
    'https://lms-lego.mesk.workers.dev/',
    '',
    undefined,
  ]) {
    assert.equal(isSameOrigin(LIVE, origin, undefined), false, `refused: ${origin}`);
    assert.equal(isSameOrigin(LIVE, origin, 'cross-site'), false, `refused with cross-site: ${origin}`);
    assert.equal(isSameOrigin(LIVE, origin, 'same-site'), false, `refused with same-site (a sibling subdomain): ${origin}`);
  }
});
