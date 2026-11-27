// LMS redesign wave R1a (product-contract v2 on PIL-322, S4; ux-plan UX-104):
// the one shared date formatter of learner and guardian pages. Dates stay UTC
// days (YYYY-MM-DD) underneath; only the display changes: day + month name,
// the year only when it is not the current UTC year, Western digits always.
// The relative words (today / tomorrow / yesterday) are for status tags only.
import type { Lang } from './labels.ts';

const MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

const RELATIVE = {
  ar: { today: 'اليوم', tomorrow: 'غدًا', yesterday: 'أمس' },
  en: { today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday' },
} as const;

/** A UTC day "YYYY-MM-DD" shown as «12 ديسمبر» / "Dec 12", with the year when it is not `today`'s year. */
export function showDate(iso: string, lang: Lang, today: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const day = String(Number(d));
  const month = MONTHS[lang][Number(mo) - 1];
  const sameYear = today.slice(0, 4) === y;
  if (lang === 'ar') return sameYear ? `${day} ${month}` : `${day} ${month} ${y}`;
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${y}`;
}

const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** today / tomorrow / yesterday relative to `today` (UTC days), or null. */
export function relativeDay(iso: string, today: string): 'today' | 'tomorrow' | 'yesterday' | null {
  const diff = Math.round((dayMs(iso) - dayMs(today)) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : null;
}

/** A tag's date: the relative word when it is one, otherwise showDate. */
export function dayLabel(iso: string, lang: Lang, today: string): string {
  const r = relativeDay(iso, today);
  return r ? RELATIVE[lang][r] : showDate(iso, lang, today);
}
