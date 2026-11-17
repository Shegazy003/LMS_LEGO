// LMS wave 3a, "View as <learner>" (product-contract v2 on PIL-216, sections 5,
// 6.3 and 8.3; ux-plan UX-18 to UX-21). The banner that starts every preview
// page and the bottom line that ends it. The learner page between them is
// drawn by the learner's own view functions (learn.ts, exams.ts); this file
// only frames it. Both elements are found by their own id (N1 of section 7.3).
//
// The banner never uses the space's theme colour (UX-18): it is a neutral,
// framed (dashed) region with the text tag "Preview", in the page's language,
// named through aria-labelledby, before the top navigation landmark (UX-21).
// Its "Back to where I was" is the first Tab stop of the page (UX-20) and the
// bottom line's is the last. Its own styles travel inside it, so the learner
// pages' shared stylesheet is unchanged.
import { html, raw } from 'hono/html';
import { dirFor, type Label, type Lang } from '../labels.ts';
import { sentence, type Html } from './layout.ts';
import type { PreviewFrame } from './space.ts';

/** What the scope line says (section 5). */
export type PreviewScope = 'admin-home' | 'publisher-home' | 'admin-one' | 'publisher-one' | 'owner';

const CSS = `
.preview-banner{margin:0;padding:10px 16px;background:#fff;color:#1b1f24;border:2px dashed #3d444d;font-size:.95rem;line-height:1.4}
.preview-banner p{margin:0 0 4px}
.preview-tag{display:inline-block;margin-inline-end:6px;padding:0 8px;border:2px solid #1b1f24;border-radius:6px;font-weight:700}
.preview-banner .preview-head{font-weight:600}
a.button.preview-back{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;margin-top:4px;background:#0b3d91;color:#fff}
.preview-end{max-width:640px;margin:8px auto 24px;padding:12px 16px;border:2px dashed #3d444d;background:#fff;color:#1b1f24}
.preview-end p{margin:0 0 8px}
[aria-disabled=true]{cursor:not-allowed;text-decoration:none;outline:1px dashed #57606a;outline-offset:2px}
`;

export interface BannerInput {
  t: Label;
  lang: Lang;
  scope: PreviewScope;
  /** The previewed subject is not published yet (AT-2.4). */
  unpublished?: boolean;
  /** The checked Back address (section 8.3). */
  back: string;
}

const SCOPE_KEY = {
  'admin-home': 'previewScopeAdmin',
  'publisher-home': 'previewScopePublisher',
  'admin-one': 'previewScopeOne',
  'publisher-one': 'previewScopeOne',
  owner: 'previewScopeOwner',
} as const;

/** The scope line (section 5), with "Space notices are not shown here." for a publisher. */
function scopeLine(t: Label, scope: PreviewScope): Html {
  const key = SCOPE_KEY[scope];
  const main = key === 'previewScopeOwner' ? t(key) : sentence(t, key, { subject: t('subject') });
  const publisher = scope === 'publisher-home' || scope === 'publisher-one';
  return html`<p data-line id="preview-scope">${main}${publisher ? html` ${t('previewNoNotice')}` : ''}</p>`;
}

export function previewBanner(v: BannerInput): Html {
  const { t, lang } = v;
  const unpublished = v.unpublished
    ? html`<p data-line id="preview-unpublished">${sentence(t, 'previewUnpublished', { learner: t('learner'), subject: t('subject') })}</p>`
    : '';
  return html`<section id="preview-banner" class="preview-banner" aria-labelledby="preview-tag" lang="${lang}" dir="${dirFor(lang)}"><style>${raw(CSS)}</style>
<p class="preview-head"><span data-line id="preview-tag" class="preview-tag">${t('previewTag')}</span> <span data-line>${sentence(t, 'previewBanner', { learner: t('learner') })}</span></p>
${v.scope ? scopeLine(t, v.scope) : ''}
${unpublished}
<p data-line id="preview-reason">${t('previewInert')}</p>
<p data-line><a id="preview-back" class="button preview-back" href="${v.back}">${t('previewBack')}</a></p>
</section>`;
}

/** The bottom line after the page's content (section 8.3). */
export function previewEnd(t: Label, lang: Lang, back: string): Html {
  return html`<div id="preview-end" class="preview-end" lang="${lang}" dir="${dirFor(lang)}"><p>${t('previewEnd')}</p><a id="preview-back-end" class="button preview-back" href="${back}">${t('previewBack')}</a></div>`;
}

/** An entry point of section 9: "View as <learner>", opening the preview in the same tab (UX-22).
 * The words sit in one <span>: in a flex button, the kit word's <bdi> would
 * otherwise be a flex item of its own, split from "View as" (UX-26). */
export function viewAsLink(t: Label, id: string, href: string): Html {
  return html`<a id="${id}" class="button plain view-as" href="${href}"><span>${sentence(t, 'viewAsLearner', { learner: t('learner') })}</span></a>`;
}

/** The address of a preview page with its `from` (section 8.3). */
export const previewPath = (spaceId: string, rest: string, from: string) => `/s/${spaceId}/preview${rest}?from=${encodeURIComponent(from)}`;

/** The whole frame of one preview page. */
export function previewFrame(v: BannerInput & { base: string; from: string | null }): PreviewFrame {
  return { base: v.base, from: v.from, banner: previewBanner(v), end: previewEnd(v.t, v.lang, v.back) };
}
