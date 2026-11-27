// LMS redesign wave R1a (product-contract v2 on PIL-322, S2, S6, S7; ux-plan
// UX-94, UX-100): the colour engine. Pure: from the space's school colour (any
// hex the owner picks) and from each subject's colour (one of the 12 fixed
// palette entries) it derives readable pairs, per request. No colour of a
// learner or guardian page is written anywhere else.

/** Base palette A, "cool neutral" (the prototype's): page background, card surface, text. */
export const PAGE = '#F3F5F9';
export const SURFACE = '#FFFFFF';
export const INK = '#19202C';
export const MUTED = '#566175';
export const LINE = '#E0E5EE';

/** The twelve subject colours (S7; ux-plan UX-101 names). Stored as keys only (wave R1b). */
export const PALETTE: readonly { key: string; hex: string; ar: string; en: string }[] = [
  { key: 'c01', hex: '#2F6FD0', ar: 'أزرق', en: 'Blue' },
  { key: 'c02', hex: '#138A72', ar: 'فيروزي', en: 'Turquoise' },
  { key: 'c03', hex: '#B5476B', ar: 'وردي غامق', en: 'Deep pink' },
  { key: 'c04', hex: '#7A4FD1', ar: 'بنفسجي', en: 'Violet' },
  { key: 'c05', hex: '#C26A12', ar: 'برتقالي', en: 'Orange' },
  { key: 'c06', hex: '#2E7D4F', ar: 'أخضر', en: 'Green' },
  { key: 'c07', hex: '#1F3A6B', ar: 'كحلي', en: 'Navy' },
  { key: 'c08', hex: '#6B7A1F', ar: 'زيتوني', en: 'Olive' },
  { key: 'c09', hex: '#1C7C8C', ar: 'أزرق مخضر', en: 'Teal' },
  { key: 'c10', hex: '#4F6B85', ar: 'رمادي أزرق', en: 'Slate' },
  { key: 'c11', hex: '#8E3A9E', ar: 'أرجواني', en: 'Purple' },
  { key: 'c12', hex: '#8A5A3B', ar: 'بني', en: 'Brown' },
];

/** The six status tags (S6): text and icon colour on a light tint. */
export const TAGS = {
  late: { fg: '#B42318', bg: '#FDECEA' },
  today: { fg: '#8A5200', bg: '#FFF4DE' },
  due: { fg: '#3949AB', bg: '#ECEEFB' },
  done: { fg: '#1E7B45', bg: '#E6F4EC' },
  locked: { fg: '#4F5A6B', bg: '#EEF0F4' },
  opens: { fg: '#3949AB', bg: '#ECEEFB' },
} as const;
export type TagState = keyof typeof TAGS;

// ------------------------------------------------------------- contrast ----
type Rgb = [number, number, number];

function rgbOf(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hexOf = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio of two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ------------------------------------------------------------ derivation ----
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** White or black, whichever is higher on the colour (always at least 4.5 : 1). */
const onColour = (hex: string): string => (contrast('#FFFFFF', hex) >= contrast('#000000', hex) ? '#FFFFFF' : '#000000');

/** The colour darkened in steps, same hue, until white text on it and it as text
 * on the page and on a card both reach 4.5 : 1 (checked on the rounded hex). */
function strongOf(hex: string): string {
  const [h, s, l0] = toHsl(rgbOf(hex));
  const ok = (c: string) => contrast('#FFFFFF', c) >= 4.5 && contrast(c, PAGE) >= 4.5 && contrast(c, SURFACE) >= 4.5;
  for (let l = l0; l > 0; l -= 0.01) {
    const c = hexOf(fromHsl(h, s, Math.max(0, l)));
    if (ok(c)) return c;
  }
  return '#000000';
}

/** A light tint (12 % of the colour on white); ink text on it stays far above 4.5 : 1. */
function tintOf(hex: string): string {
  const [r, g, b] = rgbOf(hex);
  const mix = (v: number) => 255 - (255 - v) * 0.12;
  return hexOf([mix(r), mix(g), mix(b)]);
}

/** S2: the school colour's pairs (header, main buttons, links, rings, nav, focus, highlights). */
export function schoolColours(hex: string): { school: string; onSchool: string; schoolStrong: string; schoolTint: string } {
  const school = hexOf(rgbOf(validHex(hex)));
  return { school, onSchool: onColour(school), schoolStrong: strongOf(school), schoolTint: tintOf(school) };
}

/** S2: a subject colour's pairs (hero, band, card cue, icon tile). */
export function subjectColours(hex: string): { subject: string; onSubject: string; subjectStrong: string; subjectTint: string } {
  const subject = hexOf(rgbOf(validHex(hex)));
  return { subject, onSubject: onColour(subject), subjectStrong: strongOf(subject), subjectTint: tintOf(subject) };
}

/** A stored colour that is not a 6-digit hex is read as the product's default blue (never an error). */
const validHex = (hex: string): string => (/^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : PALETTE[0].hex);

// ------------------------------------------------------ automatic colour ----
/** FNV-1a, 32-bit, over the UTF-8 bytes of the text (S7). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** S7: a subject with no chosen colour takes PALETTE[fnv1a32(id) mod 12], so every viewer and order agrees. */
export const autoColour = (subjectId: string) => PALETTE[fnv1a32(subjectId) % PALETTE.length];

/** The CSS custom properties of a subject surface, for a style attribute. */
export function subjectVars(subjectId: string): string {
  const c = subjectColours(autoColour(subjectId).hex);
  return `--subj:${c.subject};--on-subj:${c.onSubject};--subj-strong:${c.subjectStrong};--subj-tint:${c.subjectTint}`;
}

/** The CSS custom properties of the school colour, for the page's root. */
export function schoolVars(hex: string): string {
  const c = schoolColours(hex);
  return `--brand:${c.school};--on-brand:${c.onSchool};--brand-strong:${c.schoolStrong};--brand-tint:${c.schoolTint}`;
}
