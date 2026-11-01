#!/usr/bin/env node
// Reads what `wrangler deploy` reported and prints the deployed address and
// version id, as GitHub step outputs:
//   node scripts/deploy-result.mjs <wrangler output file> [deploy log] >> "$GITHUB_OUTPUT"
// The output file is the one Wrangler writes when WRANGLER_OUTPUT_FILE_PATH is
// set (one JSON object per line). The address is read from the deploy entry,
// or else from the deploy log Wrangler printed. Exit code 1, with a plain
// message, when the deploy entry, its version id or the address is missing.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WORKERS_DEV = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/;

export function deployResult(text, log = '') {
  const entries = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const deploy = entries.findLast((e) => e && e.type === 'deploy');
  if (!deploy) throw new Error('Wrangler reported no deploy');
  const version = typeof deploy.version_id === 'string' ? deploy.version_id : '';
  if (!/^[0-9a-f-]{8,}$/i.test(version)) throw new Error('Wrangler reported no version id');
  const url = JSON.stringify(deploy.targets ?? []).match(WORKERS_DEV)?.[0] ?? log.match(WORKERS_DEV)?.[0];
  if (!url) throw new Error('Wrangler reported no workers.dev address');
  return { url, version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const log = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : '';
    const { url, version } = deployResult(readFileSync(process.argv[2], 'utf8'), log);
    console.log(`url=${url}`);
    console.log(`version=${version}`);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
