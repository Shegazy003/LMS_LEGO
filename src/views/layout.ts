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
.nav{display:flex;gap:16px;margin:0 0 8px}
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
fieldset.checks{border:1px solid #e3e6ea;border-radius:8px;display:flex;flex-direction:column;gap:6px;padding:8px 12px;margin:0}
fieldset.checks legend{font-weight:600;padding:0 4px}
label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400}
.items form.move{margin-top:8px}
.share form{display:flex}
#end-confirm .share>a{display:flex;align-items:center;justify-content:center}
.share form button{flex:1}
details.card>summary{cursor:pointer;font-weight:600}
`;

export interface LayoutOptions {
  t: Label;
  lang: Lang;
  title: string;
  body: Html;
  signedIn?: boolean;
  header?: Html;
}

export function signOutForm(t: Label): Html {
  return html`<form id="signout" method="post" action="/signout"><button type="submit">${t('signOut')}</button></form>`;
}

export function layout({ t, lang, title, body, signedIn = false, header }: LayoutOptions): Html {
  return html`<!doctype html>
<html lang="${lang}" dir="${dirFor(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${t('appName')}</title>
<style>${raw(CSS)}</style>
</head>
<body>
<div class="bar"><a class="brand" href="/">${t('appName')}</a>${signedIn ? signOutForm(t) : ''}</div>
${header ?? ''}
<main>${body}</main>
</body>
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
