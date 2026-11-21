// One layout for every page: language and direction from the label context,
// phone-width first. Every word comes from the label function `t`.
import { html, raw } from 'hono/html';
import { dirFor, type Label, type LabelKey, type Lang } from '../labels.ts';

export type Html = ReturnType<typeof html>;

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;background:#f6f7f9;color:#1b1f24;line-height:1.5}
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;background:#fff;border-bottom:1px solid #e3e6ea}
.brand{font-weight:700;color:#1b1f24;text-decoration:none}
.space-header{display:flex;align-items:center;gap:12px;padding:16px;color:#fff}
.space-header img{width:56px;height:56px;object-fit:contain;background:#fff;border-radius:10px;padding:4px}
.space-header h1{margin:0;font-size:1.5rem}
main{max-width:640px;margin:0 auto;padding:16px}
h1,h2{line-height:1.25}
h2{font-size:1.15rem;margin:24px 0 8px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:16px;margin:12px 0}
form.stack{display:flex;flex-direction:column;gap:12px}
label{display:flex;flex-direction:column;gap:4px;font-weight:600}
.hint{font-weight:400;color:#57606a;font-size:.9rem}
input,select,button{font:inherit;padding:10px 12px;border:1px solid #c9ced6;border-radius:8px;background:#fff}
input[type=color]{padding:2px;height:44px;width:88px}
button{background:#1f6feb;color:#fff;border:0;font-weight:600;cursor:pointer}
.bar button{background:transparent;color:#1f6feb;border:1px solid #c9ced6;padding:6px 10px}
.error{background:#fdecea;color:#8a1c12;border:1px solid #f5c2bd;border-radius:8px;padding:10px 12px}
.message{font-size:1.15rem;font-weight:600}
.code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:1.6rem;letter-spacing:.08em;direction:ltr;unicode-bidi:isolate;background:#fff8e1;border:1px dashed #d4a72c;border-radius:8px;padding:12px;text-align:center}
.tiles{list-style:none;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.tiles li{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:20px 12px;text-align:center;font-weight:700;font-size:1.1rem}
.list{list-style:none;padding:0;margin:0}
.list li{padding:10px 0;border-bottom:1px solid #eef0f3}
.muted{color:#57606a;font-size:.9rem}
.nowrap{white-space:nowrap}
.meter{height:8px;background:#eef0f3;border-radius:4px;overflow:hidden}
.meter span{display:block;height:100%;background:#2da44e}
main{overflow-wrap:anywhere}
.nav{display:flex;flex-wrap:wrap;gap:0 4px;margin:0;padding:0 8px;background:#fff;border-bottom:1px solid #e3e6ea}
.nav a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:0 8px;color:#1b1f24;text-decoration:none}
.nav a[aria-current=page]{font-weight:700;color:#0b3d91;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:6px}
.trail{display:flex;flex-wrap:wrap;gap:4px 8px}
.items{list-style:none;padding:0;margin:0}
.items .title{font-weight:700;margin:2px 0 8px}
.items .open{display:inline-block;margin-inline-end:12px}
.items img.preview{display:block;max-width:100%;min-width:96px;height:auto;margin:0 0 8px;border-radius:8px;border:1px solid #e3e6ea;image-rendering:auto}
.note{white-space:pre-wrap;background:#fffdf3;border:1px solid #f0e3b3;border-radius:8px;padding:10px 12px}
.done{background:#e8f5ec;color:#0f5132;border:1px solid #badbcc;border-radius:8px;padding:10px 12px}
.draft{background:#fff8e1;color:#5c4400;border:1px solid #f0d58a;border-radius:8px;padding:10px 12px}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
h3{font-size:1.05rem;margin:0}
textarea{font:inherit;padding:10px 12px;border:1px solid #c9ced6;border-radius:8px;resize:vertical}
button.secondary{background:#fff;color:#8a1c12;border:1px solid #c9ced6}
form.move,form.move-inner{display:inline-flex;gap:4px;margin:0}
form.move button,form.move-inner button{background:#fff;color:#1f6feb;border:1px solid #c9ced6;padding:4px 12px;font-size:1.1rem;line-height:1.2}
button:disabled{opacity:.35;cursor:default}
form.inline-add{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}
form.inline-add label{flex:1 1 180px}
.tiles li a{display:block;color:inherit;text-decoration:none}
.share{display:flex;gap:8px;margin:12px 0}
.share>*{flex:1 1 0;min-width:0;text-align:center}
a.button{display:inline-block;padding:10px 12px;border-radius:8px;background:#1f6feb;color:#fff;font-weight:600;text-decoration:none}
a.button.whatsapp{background:#1a7f37}
fieldset.checks{border:1px solid #e3e6ea;border-radius:8px;display:flex;flex-direction:column;gap:6px;padding:8px 12px;margin:0;min-width:0}
fieldset.checks input{min-width:0}
fieldset.checks legend{font-weight:600;padding:0 4px}
label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400}
.items form.move{margin-top:8px}
.share form{display:flex}
#end-confirm .share>a,#unlink-confirm .share>a{display:flex;align-items:center;justify-content:center}
.row form{margin:0}
.share form button{flex:1}
details.card>summary{cursor:pointer;font-weight:600}
.marks{list-style:none;padding:0;margin:0;background:#fff;border:1px solid #e3e6ea;border-radius:12px}
.marks>li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:10px 12px;border-bottom:1px solid #eef0f3}
.marks .who{flex:1 1 9em;min-width:0}
.marks .who .name{display:block;font-weight:600}
.marks label.mark{flex-direction:row;align-items:center;gap:6px;font-weight:400}
.marks input.mark{width:5.5em}
.marks .row-error{flex-basis:100%;margin:0}
.marks .group{flex-basis:100%}
.marks .value{font-weight:700}
.result .score{font-weight:700;font-size:1.15rem}
button.plain,a.button.plain{background:#fff;color:#1f6feb;border:1px solid #c9ced6}
a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #1b1f24;outline-offset:2px}
main.wide{max-width:1040px}
.cards{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.cards>li.card{margin:0;display:flex;flex-direction:column;gap:4px}
.cards h2{margin:0;font-size:1.25rem}
.cards h2 a{display:inline-flex;align-items:center;min-height:44px}
.cards p{margin:0}
a.button.start{margin-top:auto;display:flex;align-items:center;justify-content:center;min-height:48px;text-align:center;background:#1a5fd0}
.cards .count{margin-bottom:8px}
@media (min-width:700px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
.fold-all{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.fold-all a.button{display:inline-flex;align-items:center;min-height:44px}
a.button.view-as{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px}
details.fold{padding:0}
details.fold>summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:48px;padding:8px 16px}
details.fold>summary::-webkit-details-marker{display:none}
details.fold .head{flex:1 1 auto;min-width:0}
details.fold .count{flex:0 0 auto;font-weight:400}
details.fold>ol,details.fold>p{margin:0;padding:0 16px 12px}
details.fold .list li{padding:0}
details.fold .list a{display:flex;align-items:center;min-height:44px}
.mark::before{content:"\\25B8";display:inline-block}
[dir=rtl] .mark::before{content:"\\25C2"}
details[open]>summary .mark::before{content:"\\25BE"}
.title-block h1{margin-bottom:4px}
.title-block p{margin:0}
.way-on{display:flex;flex-direction:column;gap:12px;margin:24px 0 8px}
.pager{display:flex;flex-direction:column;gap:12px}
.pager:empty{display:none}
a.go{position:relative;display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:48px;padding:12px 16px;border:1px solid #c9ced6;border-radius:12px;background:#fff;color:#1a5fd0;font-weight:600;text-decoration:none}
a.go.next{min-height:64px;padding-inline-end:48px;background:#1a5fd0;border-color:#1a5fd0;color:#fff;font-size:1.05rem}
a.go.prev{padding-inline-start:48px}
a.go .line2{font-weight:400;font-size:.9rem}
a.go .arrow{position:absolute;top:50%;transform:translateY(-50%);font-size:1.25rem;inset-inline-end:16px}
a.go.prev .arrow{inset-inline-end:auto;inset-inline-start:16px}
@media (min-width:700px){.pager{flex-direction:row-reverse}.pager.ends{flex-direction:row}.pager>a.go{flex:1 1 0;min-width:0}}
.notice-card p{margin:0 0 8px}
.notice-card form{margin:0}
.notice-card button{min-height:44px;min-width:88px}
.notice-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px;margin:12px 0}
.notice-line p{margin:0}
.notice-line details[open]{flex-basis:100%}
.notice-line summary{display:inline-flex;align-items:center;min-height:44px;cursor:pointer;color:#1a5fd0;text-decoration:underline}
.lang-switch{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:#0b3d91;font-weight:600}
.forgot{margin:20px 0 0;font-size:1rem}
.owner-recovery{margin:16px 0 0;padding-top:8px;border-top:1px solid #e3e6ea;font-size:.875rem}
.owner-recovery a,.recover-who a{display:inline-flex;align-items:center;min-height:44px;color:#0b3d91}
.recover-who{margin:0 0 8px}
a.latest-result{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;min-height:44px;margin:4px 0 8px;padding:10px 12px;border:1px solid #c9ced6;border-radius:10px;background:#fff;color:#1b1f24;text-decoration:none}
a.latest-result .what{font-weight:600}
a.latest-result .score{font-size:1.35rem;font-weight:700;color:#0b3d91;line-height:1.2}
a.latest-result .tag{display:inline-block;padding:0 8px;border-radius:999px;background:#e8f5ec;color:#0f5132;font-size:.875rem;font-weight:600}
a.latest-result.none{color:#3d444d}
.activity-row{display:flex;flex-wrap:wrap;align-items:center;gap:0 16px;margin:0 0 8px}
.activity-row p{margin:0}
.activity-row a.activity-link{display:inline-flex;align-items:center;min-height:44px}
.add-new>h2{margin:0 0 12px}
.choices{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.choices a.choice{display:flex;align-items:center;justify-content:center;min-height:48px;height:100%;padding:8px 12px;border:1px solid #c9ced6;border-radius:10px;background:#fff;color:#0b3d91;font-weight:600;text-align:center;text-decoration:none}
.choices a.choice[aria-expanded=true]{background:#0b3d91;border-color:#0b3d91;color:#fff}
@media (min-width:700px){.choices{grid-template-columns:repeat(4,minmax(0,1fr))}}
.add-new form{margin:16px 0 0;padding:0;border:0}
.add-new form[hidden]{display:none}
.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.form-actions a.cancel{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:#0b3d91}
.field-error{margin:0}
/* wave 5 announcements */
#announcements{border-inline-start:4px solid #1a5fd0}
#announcements:focus{outline:3px solid #1b1f24;outline-offset:4px}
#announcements>h2{margin:0 0 8px}
#announcements .ann-status:focus{outline:3px solid #1b1f24;outline-offset:2px}
.ann-help{margin:0 0 8px;color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
.ann-form{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.ann-form label{font-weight:600}
.ann-form textarea{width:100%;min-height:96px;font:inherit;padding:8px;border:1px solid #8c959f;border-radius:8px}
.ann-form textarea[aria-invalid=true]{border:2px solid #b42318}
.ann-count{margin:0;color:#57606a;font-size:.9rem}
.ann-count.ann-over{color:#b42318;font-weight:600}
.ann-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.ann-actions button,.ann-actions a{min-height:44px;min-width:44px}
.ann-actions a{display:inline-flex;align-items:center;justify-content:center;padding:0 12px;color:#0b3d91}
.ann-list{list-style:none;margin:12px 0 0;padding:0}
.ann-item{padding:12px 0;border-top:1px solid #e3e6ea}
.ann-item>p{margin:0}
.ann-text{white-space:pre-line;overflow-wrap:anywhere}
.ann-by{margin:4px 0 0;color:#57606a;font-size:.9rem}
.ann-old{color:#57606a;font-size:.9rem}
.ann-controls{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}
.ann-controls a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:#0b3d91}
.ann-empty{margin:12px 0 0;color:#57606a}
.ann-quote{white-space:pre-line;overflow-wrap:anywhere;margin:12px 0;padding:8px 12px;border-inline-start:4px solid #c9ced6;background:#fff}
.ann-form button.secondary{color:#0b3d91;border-color:#8c959f}
.ann-block .ann-list{margin:8px 0 0}
.ann-block .ann-item:first-of-type{border-top:0;padding-top:4px}
.ann-meta{min-width:0}
.ann-older{margin:8px 0 0;border-top:1px solid #e3e6ea}
.ann-older>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:600;color:#0b3d91}
.ann-older>.ann-list{margin:0}
.ann-older .ann-item:first-of-type{border-top:0}
.ann-where{margin:0}
.ann-where-link{display:inline-block;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;padding:10px 0;font-weight:600;color:#0b3d91;overflow-wrap:anywhere}
.ann-home .ann-by{margin:0}
.ann-home .ann-text{margin:4px 0 0}
.ann-full{color:#0b3d91;overflow-wrap:anywhere}
/* wave 6 due dates */
#due-dates{border-inline-start:4px solid #57606a}
#due-dates>h2{margin:0 0 8px}
.due-help{margin:0 0 8px;color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
.due-set{margin:0}
.due-link{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;padding:8px 12px;border:1px solid #8c959f;border-radius:8px;background:#fff;color:#0b3d91;font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.due-back a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:#0b3d91}
.due-list,.due-sub{list-style:none;margin:0;padding:0}
.due-sub{padding-inline-start:24px;border-inline-start:2px solid #e3e6ea;margin-inline-start:8px}
.due-item{min-width:0}
.due-item:focus,.due-status:focus{outline:3px solid #1b1f24;outline-offset:2px}
.due-row{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:12px;margin:0 0 12px;min-width:0}
.due-row>p{margin:0 0 6px}
.due-title{font-weight:700;overflow-wrap:anywhere}
.due-kind{color:#57606a;font-weight:400}
.due-value,.due-empty{color:#57606a;font-size:.9rem}
.due-form{display:flex;flex-direction:column;gap:6px;margin:8px 0 0;min-width:0}
.due-form label{display:block;font-weight:600;overflow-wrap:anywhere}
.due-fields{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.due-fields input[type=date]{box-sizing:border-box;min-height:44px;min-width:0;max-width:100%;font:inherit;padding:6px 8px;border:1px solid #8c959f;border-radius:8px}
.due-fields input[aria-invalid=true]{border:2px solid #b42318}
.due-button{min-height:44px;min-width:44px}
.due-clear{margin:8px 0 0}
.due-clear .due-button{background:#fff;color:#0b3d91;border:1px solid #8c959f}
.due-error{margin:6px 0 0}
`;

export interface LayoutOptions {
  t: Label;
  lang: Lang;
  title: string;
  body: Html;
  signedIn?: boolean;
  header?: Html;
  /** A wider reading column for a page of cards (wave 1, the learner home: up to three columns on a desktop). */
  wide?: boolean;
  /** The language switch of a page outside any space (wave 1, L2, section 8.3): this page's own address. */
  switchFrom?: string;
  /** LMS wave 3a: a learner page drawn as a preview. The banner comes first, the
   * bottom line last; the product name and Sign out keep their text and place
   * and do nothing (contract sections 6.3 and 8.3). */
  preview?: { banner: Html; end: Html };
}

const INERT_ATTRS = raw(' aria-disabled="true" aria-describedby="preview-reason"');

/** The language switch: a link to the same page in the other language, named in that language (UX-12). */
function languageSwitch(t: Label, lang: Lang, path: string): Html {
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  return html`<a id="lang-switch" class="lang-switch" href="${path}?lang=${other}" lang="${other}" dir="${dirFor(other)}">${t('switchLanguage')}</a>`;
}

export function signOutForm(t: Label): Html {
  return html`<form id="signout" method="post" action="/signout"><button type="submit">${t('signOut')}</button></form>`;
}

export function layout({ t, lang, title, body, signedIn = false, header, wide = false, switchFrom, preview }: LayoutOptions): Html {
  const brand = preview
    ? html`<a class="brand" tabindex="0"${INERT_ATTRS}>${t('appName')}</a>`
    : html`<a class="brand" href="/">${t('appName')}</a>`;
  const signOut = !signedIn ? '' : preview
    ? html`<button id="signout" type="button"${INERT_ATTRS}>${t('signOut')}</button>`
    : signOutForm(t);
  return html`<!doctype html>
<html lang="${lang}" dir="${dirFor(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${t('appName')}</title>
<style>${raw(CSS)}</style>
</head>
<body>
${preview ? preview.banner : ''}<div class="bar">${brand}${signOut}${switchFrom ? languageSwitch(t, lang, switchFrom) : ''}</div>
${header ?? ''}
<main${wide ? html` class="wide"` : ''}>${body}</main>
${preview ? preview.end : ''}</body>
</html>`;
}

/** A product sentence whose inserted values are each wrapped in <bdi>, so a
 * date, a number or a name in the other script keeps its own order and does not
 * break across lines, in Arabic and in English. The words are unchanged. */
export function sentence(t: Label, key: LabelKey, vars: Record<string, string>): Html[] | string[] {
  return isolated(t, key, vars, (value) =>
    /[\p{L}]/u.test(value) ? html`<bdi>${value}</bdi>` : html`<bdi dir="ltr" class="nowrap">${value}</bdi>`);
}

/** A product sentence whose inserted values are Latin text written left to
 * right (such as http://): each is isolated with <bdi dir="ltr">, so an Arabic
 * sentence around it reads cleanly right-to-left. */
export function ltrSentence(t: Label, key: LabelKey, vars: Record<string, string>): Html[] | string[] {
  return isolated(t, key, vars, (value) => html`<bdi dir="ltr">${value}</bdi>`);
}

/** A product sentence whose inserted values are given as ready markup (each
 * already isolated by the caller), and whose words before the first value are
 * wrapped in <span class="what"> (the line's label, as "Latest result:"). */
export function marked(t: Label, key: LabelKey, values: Record<string, Html>): (Html | string)[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers)
    .split(/\u0001(\d+)\u0002/)
    .map((part, i) => (i % 2 === 1 ? values[names[Number(part)]] : i === 0 && part.trim() ? html`<span class="what">${part.trimEnd()}</span> ` : part));
}

function isolated(t: Label, key: LabelKey, vars: Record<string, string>, wrap: (value: string) => Html): Html[] | string[] {
  const names = Object.keys(vars);
  const marked = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, marked)
    .split(/\u0001(\d+)\u0002/)
    .map((part, i) => (i % 2 === 0 ? part : wrap(vars[names[Number(part)]]))) as Html[];
}

export function errorBox(message: string | undefined): Html | string {
  return message ? html`<p id="error" class="error" role="alert">${message}</p>` : '';
}

/** A page with one plain message (refusals, not found). */
export function messagePage(t: Label, lang: Lang, message: string, signedIn: boolean): Html {
  return layout({ t, lang, title: message, signedIn, body: html`<p class="message">${message}</p>` });
}
