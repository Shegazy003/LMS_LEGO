// LMS redesign wave R1a (product-contract v2 on PIL-322, S2, S6, S7; ux-plan
// UX-94, UX-100): the colour engine and the status tags' colour pairs, as
// pure units. AT-R1a.1 (a) to (c) and the unit half of UX-100.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INK, PAGE, SURFACE, PALETTE, TAGS, autoColour, contrast, fnv1a32, schoolColours, subjectColours,
} from '../../src/look.ts';

/** The 16-steps-per-channel grid (4,096 colours) plus the six named colours of AT-R1a.1a. */
function grid(): string[] {
  const steps = Array.from({ length: 16 }, (_, i) => i * 17);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const out: string[] = [];
  for (const r of steps) for (const g of steps) for (const b of steps) out.push(`#${hex(r)}${hex(g)}${hex(b)}`);
  return out;
}
const NAMED = ['#E9A020', '#F5E663', '#1F5FAD', '#2E7D4F', '#FFFFFF', '#000000'];

describe('AT-R1a.1 readable colours (units)', () => {
  it('AT-R1a.1a UX-94 readable text on any school colour: the 4,096-colour grid and the six named colours', () => {
    const colours = [...grid(), ...NAMED];
    assert.equal(colours.length, 4096 + 6);
    const bad: string[] = [];
    for (const c of colours) {
      const s = schoolColours(c);
      if (contrast(s.onSchool, c) < 4.5) bad.push(`${c} onSchool ${s.onSchool}`);
      if (contrast('#FFFFFF', s.schoolStrong) < 4.5) bad.push(`${c} white on schoolStrong ${s.schoolStrong}`);
      if (contrast(s.schoolStrong, PAGE) < 4.5) bad.push(`${c} schoolStrong ${s.schoolStrong} on the page`);
      if (contrast(s.schoolStrong, SURFACE) < 4.5) bad.push(`${c} schoolStrong ${s.schoolStrong} on the surface`);
      if (contrast(INK, s.schoolTint) < 4.5) bad.push(`${c} ink on schoolTint ${s.schoolTint}`);
      for (const v of Object.values(s)) assert.match(v, /^#[0-9a-f]{6}$/i);
    }
    assert.deepEqual(bad, []);
  });

  it('AT-R1a.1b UX-94 twelve subject colours: every palette entry meets the S2 pairs', () => {
    assert.equal(PALETTE.length, 12);
    assert.deepEqual(PALETTE.map((p) => p.key), ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12']);
    assert.equal(new Set(PALETTE.map((p) => p.hex.toLowerCase())).size, 12, 'twelve different colours');
    for (const p of PALETTE) {
      const s = subjectColours(p.hex);
      assert.ok(contrast(s.onSubject, p.hex) >= 4.5, `${p.key} onSubject`);
      assert.ok(contrast(s.subjectStrong, PAGE) >= 4.5, `${p.key} subjectStrong on the page`);
      assert.ok(contrast(s.subjectStrong, SURFACE) >= 4.5, `${p.key} subjectStrong on white`);
      assert.ok(contrast(INK, s.subjectTint) >= 4.5, `${p.key} ink on subjectTint`);
    }
  });

  it('AT-R1a.1c fnv1a32 matches five fixed vectors', () => {
    // The published FNV-1a 32-bit test vectors (UTF-8 bytes).
    assert.equal(fnv1a32(''), 0x811c9dc5);
    assert.equal(fnv1a32('a'), 0xe40c292c);
    assert.equal(fnv1a32('b'), 0xe70c2de5);
    assert.equal(fnv1a32('foo'), 0xa9f37ed7);
    assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  });

  it('AT-R1a.1c autoColour of the seeded subject ids is the same across 3 calls in 3 orders', async () => {
    const { SUBJECTS } = await import('./world.ts');
    const ids = SUBJECTS.map((s) => s.id);
    assert.ok(ids.length >= 8);
    const orders = [ids, [...ids].reverse(), [...ids.slice(3), ...ids.slice(0, 3)]];
    const maps = orders.map((o) => new Map(o.map((id) => [id, autoColour(id).key])));
    for (const id of ids) {
      assert.equal(maps[1].get(id), maps[0].get(id));
      assert.equal(maps[2].get(id), maps[0].get(id));
      assert.equal(autoColour(id).key, PALETTE[fnv1a32(id) % 12].key);
    }
  });
});

describe('UX-100 status tags words icon contrast (units)', () => {
  it('UX-100 six states: text on its tint at least 4.5 : 1 and icon at least 3 : 1, on both page surfaces', () => {
    assert.deepEqual(Object.keys(TAGS).sort(), ['done', 'due', 'late', 'locked', 'opens', 'today']);
    for (const [state, pair] of Object.entries(TAGS)) {
      assert.ok(contrast(pair.fg, pair.bg) >= 4.5, `${state} text on its tint`);
      // The icon is drawn in the text colour: at least 3 : 1 on its tint and on both page surfaces.
      assert.ok(contrast(pair.fg, pair.bg) >= 3, `${state} icon on its tint`);
      assert.ok(contrast(pair.fg, PAGE) >= 3 && contrast(pair.fg, SURFACE) >= 3, `${state} icon on the page surfaces`);
    }
  });
});
