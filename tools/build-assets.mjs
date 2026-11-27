// LMS redesign wave R1a (product-contract v2 on PIL-322, S3; ux-plan UX-95):
// builds the Worker's static assets folder (wrangler.jsonc "assets") before
// every `wrangler dev` and `wrangler deploy` (wrangler.jsonc "build"). It copies
// the chosen typeface, IBM Plex Sans Arabic, weights 400, 600 and 700 (Arabic,
// Latin and Latin-extended subsets, WOFF2), from the exact-pinned npm package
// @fontsource/ibm-plex-sans-arabic (SIL OFL 1.1), with its licence file beside
// them, and the cache rule. The fonts are served from the product's own origin
// as static assets, never inside the Worker script. No font file is kept in the
// repository: the package is the source (package-lock.json pins it).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(root, 'dist', 'static');
export const WEIGHTS = [400, 600, 700];
export const SUBSETS = { arabic: 'arabic', latin: 'latin', 'latin-ext': 'latinext' };
/** One year: far above the 30 days of S3; the file names change with the package version only by a new build. */
export const CACHE = 'public, max-age=31536000, immutable';

/** Copies a file unless the same bytes are already there: several `wrangler dev`
 * may build at once (test files in parallel), so nothing is deleted or rewritten needlessly. */
function put(from, to) {
  if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) return;
  copyFileSync(from, to);
}

export function buildAssets(out = OUT) {
  const pkg = dirname(createRequire(import.meta.url).resolve('@fontsource/ibm-plex-sans-arabic/package.json'));
  const fonts = join(out, 'assets', 'fonts');
  mkdirSync(fonts, { recursive: true });
  for (const [subset, short] of Object.entries(SUBSETS)) {
    for (const w of WEIGHTS) put(join(pkg, 'files', `ibm-plex-sans-arabic-${subset}-${w}-normal.woff2`), join(fonts, `plex-${short}-${w}.woff2`));
  }
  put(join(pkg, 'LICENSE'), join(fonts, 'OFL.txt'));
  const headers = `/assets/fonts/*\n  Cache-Control: ${CACHE}\n  X-Content-Type-Options: nosniff\n`;
  const file = join(out, '_headers');
  if (!existsSync(file) || readFileSync(file, 'utf8') !== headers) writeFileSync(file, headers);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`static assets in ${buildAssets()}`);
}
