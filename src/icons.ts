// LMS redesign wave R1a (product-contract v2 on PIL-322, S5; ux-plan UX-96 to
// UX-100): the product's own line icons, drawn for the approved prototype v1
// and inlined (no other origin). Every icon sits beside its words and is
// hidden from screen readers; none is a control or a status on its own.
import { html, raw } from 'hono/html';

const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  books: '<path d="M4 5.5h5v14H4zM9 5.5h5v14H9z"/><path d="m14.5 6.2 4.6-1.2 3 13.5-4.6 1.2z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.5 1.2 1.2 2-2.2M3.5 12l1.2 1.2 2-2.2M3.5 17.5h3"/>',
  chart: '<path d="M4 20V10M10 20V5M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.2 7.5-5.2s6.3 1.6 7.5 5.2"/>',
  people: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c1-3.1 3.4-4.6 6.2-4.6s5.2 1.5 6.2 4.6"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.5c2.4 0 4 1.3 4.8 3.8"/>',
  chev: '<path d="m14.5 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.8v.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5h4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  /** The neutral subject icon ("book"), every subject's until a teacher chooses one (S7, wave R1b). */
  book: '<path d="M4 5.5c3-1.3 5.6-1.3 8 .5 2.4-1.8 5-1.8 8-.5v13c-3-1.3-5.6-1.3-8 .5-2.4-1.8-5-1.8-8-.5z"/><path d="M12 6v13"/>',
  // LMS redesign wave R1b (S7, UX-101): the other fifteen subject icons a teacher may choose (src/look.ts ICONS).
  calculator: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 6.5h8v3.5H8z"/><path d="M8 13.5h1M11.5 13.5h1M15 13.5h1M8 17h1M11.5 17h1M15 17h1"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5V9L5 18.5a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9V3.5"/><path d="M7.4 14.5h9.2"/>',
  'pen-book': '<path d="M4.5 4.5h9.5v15H4.5z"/><path d="M7.5 8.5h3.5M7.5 11.5h3.5"/><path d="m18.5 4.5 2 2-4.8 4.8-2.6.6.6-2.6z"/>',
  letters: '<path d="M3.5 19 8 6l4.5 13M5.1 14.5h5.8"/><path d="M14.8 12.4c1-1 3.6-1 4.3.4.4.8.3 6.2.3 6.2M19.4 15.6c-1.6-.4-4.6-.2-4.6 1.8 0 1.6 2.8 2 4.6.4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>',
  map: '<path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  landmark: '<path d="M3.5 9 12 4l8.5 5z"/><path d="M5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8M3.5 20h17"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.5-1.9-.4-1.3.4-2.6 1.8-2.6h1.9c1.9 0 3.3-1.4 3.3-3.4 0-5-3.8-9.1-8.5-9.1z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.3" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  music: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 4.2 3-1.6 5h-5.2l-1.6-5z"/><path d="M12 3.5v4M16.2 10.5l3.8-1.3M14.6 15.5l2.4 3.3M9.4 15.5 7 18.8M7.8 10.5 4 9.2"/>',
  computer: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19z"/><path d="M5 19c3-4 6-7 10-9.5"/>',
  atom: '<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>',
  lightbulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M8.6 14.5a6 6 0 1 1 6.8 0c-.8.7-1.4 1.8-1.4 3h-4c0-1.2-.6-2.3-1.4-3z"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** An inline icon, decorative: aria-hidden, never focusable. Flipped in RTL where it points (chevrons). */
export function icon(name: IconName, cls = ''): ReturnType<typeof html> {
  return html`<svg class="ico${cls ? ` ${cls}` : ''}" data-icon="${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${raw(PATHS[name])}</svg>`;
}

/** A decorative progress ring (UX-29: the progress is told in words beside it). */
export function ring(done: number, total: number, size = 52): ReturnType<typeof html> {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? Math.min(1, done / total) : 0;
  return html`<span class="ring" aria-hidden="true"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" focusable="false"><circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(1)}" class="ring-track"/><circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(1)}" class="ring-fill" stroke-dasharray="${(c * part).toFixed(1)} ${c.toFixed(1)}"/></svg><b>${done}/${total}</b></span>`;
}
