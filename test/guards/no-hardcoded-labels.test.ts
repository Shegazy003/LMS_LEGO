// Every user-facing word must come through the one label function, reading the
// space's kit. This test fails if any canonical concept word from any seed kit
// (in Arabic or English) is written directly into a page template or into the
// product dictionary, instead of being looked up with label('<concept>').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_KITS } from '../../src/kits/seed.ts';
import { CONCEPTS } from '../../src/labels.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const src = join(root, 'src');
// The seed kits are where the words are defined; everything else must look them up.
const DEFINITIONS = new Set([join(src, 'kits', 'seed.ts')]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const stripMarks = (s: string) => s.replace(/[ً-ْٰـ]/g, '');

function forbiddenWords(): string[] {
  const words = new Set<string>();
  for (const kit of SEED_KITS) {
    for (const lang of ['ar', 'en'] as const) {
      for (const value of Object.values(kit.labels[lang])) words.add(stripMarks(value as string));
    }
  }
  return [...words];
}

/** Text a user could see: the contents of string and template literals, with
 * ${…} expressions, HTML tags and label('key') lookups removed. Module paths in
 * import/export statements and literals that are exactly a canonical concept
 * key (an identifier such as 'subject', not a word on a page) are not text. */
export function visibleText(source: string): string {
  const withoutLookups = source
    .replace(/\b(?:label|t)\(\s*(['"`])[A-Za-z]+\1/g, '')
    .replace(/\b(from|import)\s*(['"])[^'"\n]*\2/g, '');
  const pieces: string[] = [];
  const literal = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of withoutLookups.matchAll(literal)) {
    const piece = m[1] ?? m[2] ?? m[3] ?? '';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\s/i.test(piece)) continue; // SQL, never shown
    if ((CONCEPTS as readonly string[]).includes(piece)) continue; // a key, never shown
    pieces.push(piece.replace(/\$\{[^}]*\}/g, ' '));
  }
  return stripMarks(pieces.join('\n').replace(/<[^>]*>/g, ' '));
}

export function findHardCoded(source: string, words = forbiddenWords()): string[] {
  const text = visibleText(source);
  const found: string[] = [];
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isArabic = /[؀-ۿ]/.test(word);
    const pattern = isArabic
      ? new RegExp(`(?<![\\p{L}\\p{M}])(?:ال|وال|بال|لل|و|ب|ل)?${escaped}(?![\\p{L}\\p{M}])`, 'u')
      : new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?:s|es)?(?![\\p{L}\\p{N}_])`, 'iu');
    if (pattern.test(text)) found.push(word);
  }
  return found;
}

test('labels guard: the scanner catches a hard-coded role word (self-check)', () => {
  assert.deepEqual(findHardCoded('const page = html`<h2>Teachers</h2>`;'), ['Teacher']);
  assert.ok(findHardCoded("const s = '<p>المعلّم</p>';").includes('معلم'));
  assert.deepEqual(findHardCoded("const ok = html`<h2>${t('publisher')}</h2>`;"), []);
  assert.deepEqual(findHardCoded('<div class="card">'), []);
  assert.deepEqual(findHardCoded("db.prepare('SELECT id FROM session WHERE id = ?')"), []);
  // Identifiers are not page words: module paths, names like lms_session, concept keys.
  assert.deepEqual(findHardCoded("import { x } from './auth/session.ts';"), []);
  assert.deepEqual(findHardCoded("export const COOKIE = 'lms_session';"), []);
  assert.deepEqual(findHardCoded("const keys = ['publisher', 'subject', 'lesson'] as const;"), []);
  // ...but the same words written as text are still caught.
  assert.deepEqual(findHardCoded("const s = 'Your session ended';"), ['Session']);
  assert.deepEqual(findHardCoded('html`<li>Subjects</li>`'), ['Subject']);
});

test('labels guard: no page template or product sentence hard-codes a canonical role word', () => {
  const all = files(src).filter((f) => !DEFINITIONS.has(f));
  const templates = all.filter((f) => f.includes(`${join('src', 'views')}`));
  assert.ok(templates.length >= 3, `expected page templates under src/views, found ${templates.length}`);
  const offences: string[] = [];
  for (const file of all) {
    const hits = findHardCoded(readFileSync(file, 'utf8'));
    if (hits.length) offences.push(`${relative(root, file)}: ${hits.join(', ')}`);
  }
  assert.deepEqual(offences, [], 'use label(<concept>) instead of writing these words');
});
