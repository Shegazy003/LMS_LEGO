// Measurements for the L1 UX floor (ux-plan v2 on PIL-210, "How items are
// checked"), run in the page: boxes, the WCAG 2 contrast ratio from
// getComputedStyle (text colour against the nearest ancestor with an opaque
// background), font sizes, focus rings, overflow.
import type { Page } from 'playwright';

export interface Measured {
  selector: string;
  text: string;
  width: number;
  height: number;
  fontPx: number;
  contrast: number;
}

/** Size, font size and contrast of every element matching a selector. */
export async function measure(page: Page, selector: string): Promise<Measured[]> {
  return page.evaluate((sel) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] === 1)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    return [...document.querySelectorAll(sel)].map((el) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const a = lum(rgb(cs.color).slice(0, 3));
      const b = lum(background(el));
      return {
        selector: sel,
        text: ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        width: box.width,
        height: box.height,
        fontPx: parseFloat(cs.fontSize),
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  }, selector);
}

/** Whether the page scrolls sideways, and every element whose text overflows its own box. */
export async function overflow(page: Page): Promise<{ sideways: number; clipped: string[] }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clipped: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const e = el as HTMLElement;
      if (e.closest('script, style') || !e.innerText?.trim()) continue;
      if (getComputedStyle(e).display === 'inline') continue; // an inline box has no width of its own to overflow
      if (e.scrollWidth > e.clientWidth + 1) clipped.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${e.className}: ${e.innerText.slice(0, 40)}`);
    }
    return { sideways: root.scrollWidth - root.clientWidth, clipped };
  });
}

/** One Tab press: what has focus now, whether it is visible, and its focus ring. */
export interface Focused {
  id: string;
  tag: string;
  text: string;
  visible: boolean;
  ringPx: number;
  ringContrast: number;
  region: string;
}

export async function tab(page: Page): Promise<Focused> {
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { id: '', tag: 'body', text: '', visible: false, ringPx: 0, ringContrast: 0, region: '' };
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const back = (e: Element | null): number[] => {
      for (let x = e?.parentElement ?? null; x; x = x.parentElement) {
        const c = rgb(getComputedStyle(x).backgroundColor);
        if (c.length >= 3 && (c.length === 3 || c[3] === 1)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const ring = cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) : 0;
    const a = lum(rgb(cs.outlineColor).slice(0, 3));
    const b = lum(back(el));
    const region = el.closest('#top-nav') ? 'top-nav' : el.closest('#trail') ? 'trail' : el.closest('#notice-card, #notice-line') ? 'notice'
      : el.closest('#items') ? 'materials' : el.closest('#lesson-nav') ? 'lesson-nav' : el.closest('#fold-all') ? 'fold-all'
        : el.closest('#outline') ? 'outline' : el.closest('#my-list') ? 'cards' : el.closest('main') ? 'content' : 'chrome';
    return {
      id: el.id, tag: el.tagName.toLowerCase(), text: (el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      visible: box.width > 0 && box.height > 0 && cs.visibility !== 'hidden' && !el.closest('details:not([open]) > :not(summary)'),
      ringPx: ring, ringContrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), region,
    };
  });
}
