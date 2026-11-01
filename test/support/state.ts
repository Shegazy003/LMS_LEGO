// What the product holds and what it runs, captured so that a test can say
// exactly what an action changed (AT-5: "the change is data only").
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { RunningWorker } from './worker.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** Tables that are not the product's data: D1's own bookkeeping, and the
 * product-wide request counter of the usage panel (every page view moves it). */
const NOT_DATA = new Set(['d1_migrations', 'usage_day']);

export type Snapshot = Record<string, string[]>;

/** Every row of every product table, as sorted JSON lines per table (two wrangler calls). */
export async function snapshot(worker: RunningWorker): Promise<Snapshot> {
  const tables = (await worker.sql("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"))
    .map((r) => String(r.name))
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('_cf_') && !NOT_DATA.has(n));
  const results = await worker.sqlAll(tables.map((t) => `SELECT * FROM "${t}"`).join('; '));
  const out: Snapshot = {};
  tables.forEach((t, i) => {
    out[t] = (results[i] ?? []).map((row) => JSON.stringify(row)).sort();
  });
  return out;
}

/** Rows that differ between two snapshots, per table. */
export function changes(before: Snapshot, after: Snapshot): Record<string, { removed: string[]; added: string[] }> {
  const out: Record<string, { removed: string[]; added: string[] }> = {};
  for (const t of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = new Set(before[t] ?? []);
    const a = new Set(after[t] ?? []);
    const removed = [...b].filter((x) => !a.has(x));
    const added = [...a].filter((x) => !b.has(x));
    if (removed.length || added.length) out[t] = { removed, added };
  }
  return out;
}

/** The SHA-256 of the production Worker bundle, built exactly as a deploy
 * would build it (wrangler deploy --dry-run; no account is used). */
export function productionBundleHash(): string {
  const out = mkdtempSync(join(tmpdir(), 'lms-lego-bundle-'));
  try {
    execFileSync(wrangler, ['deploy', '--dry-run', '--outdir', out], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: 'pipe',
    });
    const files = readdirSync(out).filter((f) => f.endsWith('.js')).sort();
    if (!files.length) throw new Error('the dry-run produced no bundle');
    return sha256(files.map((f) => readFileSync(join(out, f), 'utf8')).join('\n'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** The commit checked out, and any change on disk to the code or its configuration. */
export function codeIdentity(): { commit: string; uncommitted: string } {
  const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    commit: run(['rev-parse', 'HEAD']),
    uncommitted: run(['status', '--porcelain', '--', 'src', 'migrations', 'wrangler.jsonc', 'package.json', 'package-lock.json']),
  };
}

/** A valid 16x16 PNG of one solid colour, built in code (no binary fixture). */
export function solidPng(r: number, g: number, b: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 16 }, () => row));
  return Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}
