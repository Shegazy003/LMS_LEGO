// scripts/deploy-result.mjs reads what `wrangler deploy` reported (the file
// Wrangler writes when WRANGLER_OUTPUT_FILE_PATH is set) and gives the deploy
// workflow the address and the version id to print and to smoke-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const script = () => import('../../scripts/deploy-result.mjs');
const line = (o: unknown) => JSON.stringify(o);
const VERSION = '6c0f2a52-8c3e-4b7a-9d55-2f0e1a7b9c11';

test('deploy result: the address and version id come from the deploy entry', async () => {
  const { deployResult } = await script();
  const text = [
    line({ type: 'wrangler-session', version: 1, wrangler_version: '4.149.0' }),
    line({ type: 'deploy', version: 1, worker_name: 'lms-lego', version_id: VERSION, targets: ['https://lms-lego.mesk.workers.dev'] }),
  ].join('\n');
  assert.deepEqual(deployResult(text), { url: 'https://lms-lego.mesk.workers.dev', version: VERSION });
});

test('deploy result: the address is read from the deploy log when the entry does not carry it', async () => {
  const { deployResult } = await script();
  const text = line({ type: 'deploy', version_id: VERSION, targets: [] });
  const log = `Uploaded lms-lego (3.1 sec)\nDeployed lms-lego triggers (0.9 sec)\n  https://lms-lego.mesk.workers.dev\nCurrent Version ID: ${VERSION}\n`;
  assert.deepEqual(deployResult(text, log), { url: 'https://lms-lego.mesk.workers.dev', version: VERSION });
});

test('deploy result: a missing deploy, version id or address is an error, never a silent pass', async () => {
  const { deployResult } = await script();
  assert.throws(() => deployResult(line({ type: 'wrangler-session' })), /no deploy/);
  assert.throws(() => deployResult(line({ type: 'deploy', targets: ['https://lms-lego.mesk.workers.dev'] })), /no version id/);
  assert.throws(() => deployResult(line({ type: 'deploy', version_id: VERSION, targets: ['https://evil.example'] })), /no workers.dev address/);
});
