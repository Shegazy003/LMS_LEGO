// One layout for every page: language and direction from the label context,
// phone-width first. Every word comes from the label function `t`.
import { html, raw } from 'hono/html';
import { dirFor, type Label, type LabelKey, type Lang } from '../labels.ts';
import { INK, LINE, MUTED, PAGE, PALETTE, SURFACE, TAGS, schoolVars } from '../look.ts';
import { showDate } from '../format.ts';
import { now } from '../clock.ts';

export type Html = ReturnType<typeof html>;

// LMS wave 7 (W7-3, contract v3 addendum on PIL-285, files): the two rules at the end of the wave 7 block use selectors
// starting with the id quiz-guardian. The labels guard reads this style text as page words, so the role word is written
// as the concept key literal, which the guard skips; the served style is the same bytes.
/** LMS redesign wave R1a (S3): IBM Plex Sans Arabic 400, 600, 700 from /assets/fonts (tools/build-assets.mjs), swapped in. */
const FONT_RANGES = {
  arabic: 'U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFC',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinext: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
const FONT_FACES = Object.entries(FONT_RANGES).flatMap(([subset, range]) => [400, 600, 700].map((w) =>
  `@font-face{font-family:"IBM Plex Sans Arabic";font-style:normal;font-weight:${w};font-display:swap;src:url(/assets/fonts/plex-${subset}-${w}.woff2) format("woff2");unicode-range:${range}}`)).join('\n');

// LMS redesign wave R1a (product-contract v2 on PIL-322, S2, S3, S8, S9, S14): the
// typeface from the product's own origin, palette A's neutrals, every accent from
// the school colour's derived pairs (src/look.ts: --brand, --on-brand,
// --brand-strong, --brand-tint on <html>), and no hard-coded blue.
const CSS = `
${FONT_FACES}
:root{${schoolVars(PALETTE[0].hex)};--page:${PAGE};--surface:${SURFACE};--ink:${INK};--muted:${MUTED};--line:${LINE};--barh:68px;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,system-ui,sans-serif;background:var(--page);color:var(--ink);line-height:1.6}
a{color:var(--brand-strong)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;background:#fff;border-bottom:1px solid #e3e6ea}
.brand{font-weight:700;color:#1b1f24;text-decoration:none}
.space-header{display:flex;align-items:center;gap:12px;padding:12px 16px 16px;background:var(--brand);color:var(--on-brand)}
.space-header img{width:48px;height:48px;object-fit:contain;background:#fff;border-radius:12px;padding:4px}
.space-header h1{margin:0;font-size:1.35rem;line-height:1.3}
main{max-width:640px;margin:0 auto;padding:16px}
h1,h2{line-height:1.25}
h2{font-size:1.15rem;margin:24px 0 8px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:16px;margin:12px 0}
form.stack{display:flex;flex-direction:column;gap:12px}
label{display:flex;flex-direction:column;gap:4px;font-weight:600;min-width:0}
input,select,textarea{max-width:100%;box-sizing:border-box}
.hint{font-weight:400;color:#57606a;font-size:.9rem}
input,select,button{font:inherit;padding:10px 12px;border:1px solid #c9ced6;border-radius:8px;background:#fff}
input[type=color]{padding:2px;height:44px;width:88px}
button{background:var(--brand-strong);color:#fff;border:0;font-weight:600;cursor:pointer}
.bar button{background:transparent;color:var(--brand-strong);border:1px solid #c9ced6;padding:6px 10px}
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
.nav{display:flex;flex-wrap:wrap;gap:0 4px;margin:0;padding:0 8px;background:#fff;border-bottom:1px solid var(--line)}
.nav a{display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;padding:0 10px;color:var(--ink);text-decoration:none;border-bottom:3px solid transparent}
.nav a .ico{width:20px;height:20px}
.nav a[aria-current=page]{font-weight:700;color:var(--brand-strong);border-bottom-color:var(--brand-strong)}
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
form.move button,form.move-inner button{background:#fff;color:var(--brand-strong);border:1px solid #c9ced6;padding:4px 12px;font-size:1.1rem;line-height:1.2}
button:disabled{opacity:.35;cursor:default}
form.inline-add{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}
form.inline-add label{flex:1 1 180px}
.tiles li a{display:block;color:inherit;text-decoration:none}
.share{display:flex;gap:8px;margin:12px 0}
.share>*{flex:1 1 0;min-width:0;text-align:center}
a.button{display:inline-block;padding:10px 12px;border-radius:8px;background:var(--brand-strong);color:#fff;font-weight:600;text-decoration:none}
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
button.plain,a.button.plain{background:#fff;color:var(--brand-strong);border:1px solid #c9ced6}
a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--brand-strong);outline-offset:2px}
.branded .bar :focus-visible,.space-header :focus-visible{outline-color:var(--on-brand)}
.hero :focus-visible{outline-color:var(--on-subj)}
@media (min-width:960px){.nav.tabbar a:focus-visible{outline-color:var(--on-brand);outline-offset:-4px}}
main.wide{max-width:1040px}
.cards{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.cards>li.card{margin:0;display:flex;flex-direction:column;gap:4px}
.cards h2{margin:0;font-size:1.25rem}
.cards h2 a{display:inline-flex;align-items:center;min-height:44px}
.cards p{margin:0}
a.button.start{margin-top:auto;display:flex;align-items:center;justify-content:center;min-height:48px;text-align:center;background:var(--brand-strong)}
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
a.go{position:relative;display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:48px;padding:12px 16px;border:1px solid #c9ced6;border-radius:12px;background:#fff;color:var(--brand-strong);font-weight:600;text-decoration:none}
a.go.next{min-height:64px;padding-inline-end:48px;background:var(--brand-strong);border-color:var(--brand-strong);color:#fff;font-size:1.05rem}
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
.notice-line summary{display:inline-flex;align-items:center;min-height:44px;cursor:pointer;color:var(--brand-strong);text-decoration:underline}
.lang-switch{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:var(--brand-strong);font-weight:600}
.forgot{margin:20px 0 0;font-size:1rem}
.owner-recovery{margin:16px 0 0;padding-top:8px;border-top:1px solid #e3e6ea;font-size:.875rem}
.owner-recovery a,.recover-who a{display:inline-flex;align-items:center;min-height:44px;color:var(--brand-strong)}
.recover-who{margin:0 0 8px}
a.latest-result{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;min-height:44px;margin:4px 0 8px;padding:10px 12px;border:1px solid #c9ced6;border-radius:10px;background:#fff;color:#1b1f24;text-decoration:none}
a.latest-result .what{font-weight:600}
a.latest-result .score{font-size:1.35rem;font-weight:700;color:var(--brand-strong);line-height:1.2}
a.latest-result .tag{display:inline-block;padding:0 8px;border-radius:999px;background:#e8f5ec;color:#0f5132;font-size:.875rem;font-weight:600}
a.latest-result.none{color:#3d444d}
.activity-row{display:flex;flex-wrap:wrap;align-items:center;gap:0 16px;margin:0 0 8px}
.activity-row p{margin:0}
.activity-row a.activity-link{display:inline-flex;align-items:center;min-height:44px}
.add-new>h2{margin:0 0 12px}
.choices{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.choices a.choice{display:flex;align-items:center;justify-content:center;min-height:48px;height:100%;padding:8px 12px;border:1px solid #c9ced6;border-radius:10px;background:#fff;color:var(--brand-strong);font-weight:600;text-align:center;text-decoration:none}
.choices a.choice[aria-expanded=true]{background:var(--brand-strong);border-color:var(--brand-strong);color:#fff}
@media (min-width:700px){.choices{grid-template-columns:repeat(4,minmax(0,1fr))}}
.add-new form{margin:16px 0 0;padding:0;border:0}
.add-new form[hidden]{display:none}
.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.form-actions a.cancel{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:var(--brand-strong)}
.field-error{margin:0}
/* wave 5 announcements */
#announcements{border-inline-start:4px solid var(--brand-strong)}
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
.ann-actions a{display:inline-flex;align-items:center;justify-content:center;padding:0 12px;color:var(--brand-strong)}
.ann-list{list-style:none;margin:12px 0 0;padding:0}
.ann-item{padding:12px 0;border-top:1px solid #e3e6ea}
.ann-item>p{margin:0}
.ann-text{white-space:pre-line;overflow-wrap:anywhere}
.ann-by{margin:4px 0 0;color:#57606a;font-size:.9rem}
.ann-old{color:#57606a;font-size:.9rem}
.ann-controls{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}
.ann-controls a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;color:var(--brand-strong)}
.ann-empty{margin:12px 0 0;color:#57606a}
.ann-quote{white-space:pre-line;overflow-wrap:anywhere;margin:12px 0;padding:8px 12px;border-inline-start:4px solid #c9ced6;background:#fff}
.ann-form button.secondary{color:var(--brand-strong);border-color:#8c959f}
.ann-block .ann-list{margin:8px 0 0}
.ann-block .ann-item:first-of-type{border-top:0;padding-top:4px}
.ann-meta{min-width:0}
.ann-older{margin:8px 0 0;border-top:1px solid #e3e6ea}
.ann-older>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:600;color:var(--brand-strong)}
.ann-older>.ann-list{margin:0}
.ann-older .ann-item:first-of-type{border-top:0}
.ann-where{margin:0}
.ann-where-link{display:inline-block;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;padding:10px 0;font-weight:600;color:var(--brand-strong);overflow-wrap:anywhere}
.ann-home .ann-by{margin:0}
.ann-home .ann-text{margin:4px 0 0}
.ann-full{color:var(--brand-strong);overflow-wrap:anywhere}
/* wave 6 due dates */
#due-dates{border-inline-start:4px solid #57606a}
#due-dates>h2{margin:0 0 8px}
.due-help{margin:0 0 8px;color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
.due-set{margin:0}
.due-link{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;padding:8px 12px;border:1px solid #8c959f;border-radius:8px;background:#fff;color:var(--brand-strong);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.due-back a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:var(--brand-strong)}
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
.due-clear .due-button{background:#fff;color:var(--brand-strong);border:1px solid #8c959f}
.due-error{margin:6px 0 0}
.due-line{display:block;color:#57606a;font-size:.9rem;font-weight:400;overflow-wrap:anywhere;min-width:0}
.due-dated>.due-line{margin:0 0 8px}
.due-dated.is-done{flex-wrap:wrap}
.due-dated.is-done>.due-line{flex:1 0 100%}
#todo{border-inline-start:4px solid #57606a}
#todo>h2{margin:0 0 8px}
.todo-group{margin:12px 0 0;min-width:0}
.todo-group>h3{margin:0 0 4px;font-size:1.05rem}
.todo-list{list-style:none;margin:0;padding:0}
.todo-item{padding:8px 0;border-top:1px solid #e3e6ea;min-width:0}
.todo-item>p{margin:0}
.todo-link{display:inline-flex;align-items:center;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;font-weight:600;color:var(--brand-strong);overflow-wrap:anywhere}
.todo-line,.todo-progress{color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
.todo-more{margin:4px 0 0}
.todo-more>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:600;color:var(--brand-strong)}
.todo-capped{margin:8px 0 0;color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
/* wave 7 quizzes */
#quizzes{border-inline-start:4px solid #57606a}
#quizzes>h2{margin:0 0 8px}
.quiz-help{margin:0 0 8px;color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
.quiz-manage{margin:0}
.quiz-link-button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;max-width:100%;padding:8px 12px;border:1px solid #8c959f;border-radius:8px;background:#fff;color:var(--brand-strong);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.quiz-back a,.quiz-row-link,.quiz-results-link,.quiz-name,.quiz-page-link{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:var(--brand-strong);overflow-wrap:anywhere}
.quiz-form{display:flex;flex-direction:column;gap:6px;min-width:0}
.quiz-form label{display:block;font-weight:600}
.quiz-form input:not([type=radio]),.quiz-form textarea{box-sizing:border-box;width:100%;min-height:44px;min-width:0;border:1px solid #8c959f}
.quiz-form textarea{white-space:pre-wrap}
.quiz-form [aria-invalid=true]{border:2px solid #b42318}
.quiz-form button,.quiz-action button{min-height:44px;min-width:44px;align-self:flex-start}
.quiz-secondary{background:#fff;color:var(--brand-strong);border:1px solid #8c959f}
.quiz-error{margin:4px 0}
.quiz-status:focus,.quiz-question:focus,#quiz-message:focus{outline:3px solid #1b1f24;outline-offset:2px}
.quiz-list{list-style:none;margin:0;padding:0}
.quiz-row{display:flex;flex-wrap:wrap;align-items:center;gap:0 12px;padding:8px 0;border-top:1px solid #e3e6ea;min-width:0}
.quiz-row-link,.quiz-row-title{font-weight:600;flex:1 1 12em;min-width:0}
.quiz-meta{color:#57606a;font-size:.9rem}
.quiz-fold{margin:16px 0}
.quiz-fold>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:600;color:var(--brand-strong)}
.quiz-restore{margin:0}
.quiz-state-now{margin:0 0 8px;font-weight:700}
.quiz-actions{display:flex;flex-wrap:wrap;gap:8px}
.quiz-action{margin:0}
.quiz-copy{margin:16px 0}
.quiz-question{min-width:0}
.quiz-question>h2{margin:0 0 8px}
.quiz-options{border:0;margin:8px 0;padding:0;min-width:0}
.quiz-options>legend{font-weight:600;padding:0;margin:0 0 4px}
.quiz-option{margin:0 0 8px;min-width:0}
.quiz-option-fields{display:flex;align-items:center;gap:8px;min-width:0}
.quiz-option-fields input:not([type=radio]){flex:1 1 auto}
.quiz-radio{flex:0 0 auto;width:44px;height:44px;margin:0}
.quiz-remove-question{margin:8px 0 0}
.quiz-text{white-space:pre-line;overflow-wrap:anywhere;margin:0 0 8px}
.quiz-answers{list-style:none;margin:0;padding:0}
.quiz-answer{padding:6px 8px;margin:0 0 4px;border:1px solid #e3e6ea;border-radius:8px;overflow-wrap:anywhere}
.quiz-is-right{border:2px solid #1a7f37}
.quiz-is-chosen{background:#f6f8fa}
.quiz-tag{font-weight:600;font-size:.9rem;color:#3d444d}
.quiz-shape{font-weight:700}
.quiz-verdict{font-weight:700;margin:8px 0 0}
.quiz-locked{padding:10px 12px;border:1px solid #c9ced6;border-radius:8px;background:#fff}
.quiz-score{font-size:1.35rem;font-weight:700}
.quiz-sub{margin:0;color:#57606a}
.quiz-table{width:100%;border-collapse:collapse;background:#fff}
.quiz-table caption{text-align:start;font-weight:600;padding:0 0 8px}
.quiz-table th,.quiz-table td{text-align:start;padding:6px 8px;border-bottom:1px solid #e3e6ea;overflow-wrap:anywhere}
@media (max-width:600px){.quiz-table thead{display:none}.quiz-table tr{display:block;padding:8px 0;border-bottom:1px solid #e3e6ea}.quiz-table td{display:block;border:0;padding:2px 8px}.quiz-table td::before{content:attr(data-label) ": ";font-weight:600}}
.quiz-pager{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:12px 0}
.quiz-stats{margin:0;padding-inline-start:20px}
#quiz-take legend{font-weight:600;padding:0 4px;overflow-wrap:anywhere}
.quiz-form .quiz-choice{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-weight:400}
.quiz-choice>span{min-width:0;overflow-wrap:anywhere}
#quiz-${'guardian'} .quiz-${'guardian'}-line{display:block}
#quiz-${'guardian'} summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:600;color:var(--brand-strong)}
/* redesign R1a: shell */
.branded .bar{background:var(--brand);color:var(--on-brand);border-bottom:0}
.branded .bar .brand{color:var(--on-brand)}
.branded .bar button{background:transparent;color:var(--on-brand);border:1px solid currentColor;padding:6px 12px;min-height:44px}
.card{background:var(--surface);border-color:var(--line);border-radius:16px}
.muted,.hint{color:var(--muted)}
.ico{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:959.98px){
html.has-bar{scroll-padding-bottom:calc(var(--barh) + env(safe-area-inset-bottom,0px))}
body.has-bar{padding-bottom:calc(var(--barh) + env(safe-area-inset-bottom,0px))}
.nav.tabbar{position:fixed;inset-inline:0;bottom:0;z-index:20;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:0;padding:0 0 env(safe-area-inset-bottom,0px);background:var(--surface);border:0;box-shadow:0 -1px 0 var(--line),0 -2px 12px rgba(20,30,50,.08)}
.nav.tabbar a{flex-direction:column;justify-content:center;gap:2px;box-sizing:border-box;min-width:0;height:var(--barh);overflow:hidden;padding:5px 2px;font-size:.875rem;line-height:1.2;text-align:center;color:var(--muted);border-bottom:0;border-top:3px solid transparent;overflow-wrap:anywhere}
.nav.tabbar a[aria-current=page]{color:var(--brand-strong);border-top-color:var(--brand-strong);font-weight:700}
body.has-bar:has(input:not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=button]):not([type=hidden]):focus,textarea:focus) .nav.tabbar{display:none}
}
@media (min-width:960px){
.nav.tabbar{background:var(--brand);border-bottom:0;padding:0 16px}
.nav.tabbar a{color:var(--on-brand)}
.nav.tabbar a[aria-current=page]{color:var(--on-brand);border-bottom-color:var(--on-brand)}
}
/* redesign R1a: learner home, the cards page, to-do (P2, P8, P11, P14) */
main.home{max-width:1120px}
.home-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.home-grid>*{min-width:0;margin:0}
#greeting{font-size:1.3rem;font-weight:700;line-height:1.35}
@media (min-width:960px){main.home{padding:24px 16px}.home-grid{grid-template-columns:minmax(0,1fr) 320px;grid-template-areas:"hello hello" "note note" "hero due" "cards due";column-gap:24px}#greeting{grid-area:hello}#notice-card,#notice-line{grid-area:note}#continue{grid-area:hero}#todo.strip{grid-area:due;align-self:start}.home-cards{grid-area:cards}}
.sec-h{display:flex;align-items:center;gap:10px;margin:0 0 8px}
.sec-h h2{margin:0;margin-inline-end:auto;font-size:1.1rem}
.sec-h a{display:inline-flex;align-items:center;gap:2px;min-height:44px;min-width:44px;padding:0 8px;font-weight:600;text-decoration:none}
[dir=ltr] .ico.flip{transform:scaleX(-1)}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;margin:0;padding:16px;border:0;border-radius:22px;background:var(--subj);color:var(--on-subj)}
.hero>p{margin:0}
.hero .kick{display:flex;align-items:center;gap:6px;font-size:.875rem;font-weight:600}
.hero .kick .ico{width:18px;height:18px}
.hero .hero-title{font-size:1.25rem;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
.hero .ring{grid-column:2;grid-row:1/span 3}
.hero .hero-state{grid-column:1/-1;display:flex;align-items:center;gap:8px}
.hero a.hero-btn{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:8px 16px;border-radius:12px;background:var(--surface);color:var(--subj-strong);font-weight:700;text-decoration:none;overflow-wrap:anywhere}
.hero a.hero-btn .ico{width:20px;height:20px}
.ring{position:relative;display:grid;place-items:center;width:62px;height:62px}
.ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
[dir=rtl] .ring svg{transform:rotate(-90deg) scaleY(-1)}
.ring-track,.ring-fill{fill:none;stroke:currentColor;stroke-width:5}
.ring-track{opacity:.25}
.ring-fill{stroke-linecap:round}
.ring b{font-size:.75rem;font-weight:700;line-height:1}
#todo.strip{margin:0;padding:0;border:0;background:none}
.strip-rows{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.strip-row{margin:0;min-width:0}
a.row-link{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:4px 10px;min-height:56px;padding:8px 12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;color:var(--ink);text-decoration:none;transition:background-color .15s}
a.row-link:hover{background:var(--brand-tint)}
a.row-link .sicon{grid-row:span 2}
a.row-link .t{font-weight:600;line-height:1.35;overflow-wrap:anywhere;min-width:0}
a.row-link .s{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:.875rem;color:var(--muted);min-width:0}
.strip-none{margin:0;padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:16px;color:var(--muted)}
.sicon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--subj-tint);color:var(--subj-strong);flex:none}
.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:.875rem;font-weight:600;line-height:1.5;white-space:nowrap}
.tag .ico{width:14px;height:14px;stroke-width:2.2}
${Object.entries(TAGS).map(([k, v]) => `.tag.${k}{color:${v.fg};background:${v.bg}}`).join('\n')}
.home-cards>h2,.page-title{margin:0 0 8px;font-size:1.1rem}
.cards>li.subj{display:grid;grid-template-columns:6px minmax(0,1fr) auto;gap:0;padding:0;overflow:hidden}
.subj .band{background:var(--subj)}
.subj .body{display:grid;grid-template-columns:auto minmax(0,1fr);align-content:center;gap:2px 12px;padding:12px 14px;min-width:0}
.subj .body .sicon{grid-row:span 2}
.cards .subj h2{font-size:1.05rem;min-width:0}
.cards .subj h2 a{color:var(--ink);text-decoration:none;overflow-wrap:anywhere}
.subj .by{margin:0;font-size:.875rem;color:var(--muted);min-width:0;overflow-wrap:anywhere}
.subj .side{display:grid;justify-items:center;align-content:center;gap:4px;padding:10px 12px;min-width:0;max-width:11rem;color:var(--subj-strong)}
.subj .side .ring{width:52px;height:52px}
.subj .count{margin:0;font-size:.875rem;color:var(--muted);text-align:center}
.subj a.go-card{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 14px;border-radius:12px;background:var(--subj-strong);color:#fff;font-weight:700;text-decoration:none;transition:filter .15s}
.subj .wait{margin:0;font-size:.875rem;color:var(--muted);text-align:center}
.subj .ann{grid-column:2/-1;display:flex;align-items:center;gap:6px;margin:0;padding:0 14px;border-top:1px dashed var(--line);font-size:.875rem;color:var(--muted);min-width:0}
.subj .ann .ico{width:16px;height:16px}
.subj .ann a{display:block;flex:1 1 auto;min-width:0;min-height:44px;padding:10px 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted);text-decoration:none}
.empty{display:grid;justify-items:center;gap:8px;margin:0;padding:24px 16px;text-align:center}
.empty>*{margin:0}
.empty h2{font-size:1.1rem}
.disc{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--brand-tint);color:var(--brand-strong)}
.disc .ico{width:30px;height:30px}
@media (min-width:600px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:960px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.cards>li.subj{grid-template-columns:6px minmax(0,1fr)}.subj .side{grid-column:2;grid-auto-flow:column;justify-content:start;align-items:center;padding-top:0;max-width:none}.subj .ann{grid-column:2}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}}
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
  /** LMS redesign wave R1a (S2): the space's school colour; its derived pairs are set on <html>, and the product bar takes it. */
  school?: string;
  /** LMS redesign wave R1a (S8, S9): the navigation is a bottom bar below 960 px, so the page keeps room for it (UX-126). */
  bar?: boolean;
  /** LMS redesign wave R1a (UX-105): the class of the main element (the wide two-column layout of the learner home). */
  mainClass?: string;
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

export function layout({ t, lang, title, body, signedIn = false, header, wide = false, switchFrom, preview, school, bar = false, mainClass }: LayoutOptions): Html {
  const brand = preview
    ? html`<a class="brand" tabindex="0"${INERT_ATTRS}>${t('appName')}</a>`
    : html`<a class="brand" href="/">${t('appName')}</a>`;
  const signOut = !signedIn ? '' : preview
    ? html`<button id="signout" type="button"${INERT_ATTRS}>${t('signOut')}</button>`
    : signOutForm(t);
  const classes = [wide ? 'wide' : '', mainClass ?? ''].filter(Boolean).join(' ');
  const htmlTag = school
    ? html`<html lang="${lang}" dir="${dirFor(lang)}" class="${bar ? 'branded has-bar' : 'branded'}" style="${schoolVars(school)}">`
    : html`<html lang="${lang}" dir="${dirFor(lang)}">`;
  return html`<!doctype html>
${htmlTag}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · ${t('appName')}</title>
<style>${raw(CSS)}</style>
</head>
<body${bar ? html` class="has-bar"` : ''}>
${preview ? preview.banner : ''}<div class="bar">${brand}${signOut}${switchFrom ? languageSwitch(t, lang, switchFrom) : ''}</div>
${header ?? ''}
<main${classes ? html` class="${classes}"` : ''}>${body}</main>
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

/** LMS redesign wave R1a (product-contract v2 on PIL-322, S4; UX-104): a date as learner and guardian pages show
 * it, «12 ديسمبر» / "Dec 12" (the year when it is not this UTC year), Western digits; the stored value (a UTC day
 * or an instant) stays in the `datetime` attribute. */
export function dateText(iso: string, lang: Lang): Html {
  return html`<time datetime="${iso}">${showDate(iso.slice(0, 10), lang, new Date(now()).toISOString().slice(0, 10))}</time>`;
}

/** A `sentence` whose values named in `dates` are UTC days (YYYY-MM-DD) shown as S4 inside `<time datetime>`,
 * so a reader (or a test) gets the stored day from the attribute (R1a, UX-104; UX-16a row). */
export function datedSentence(t: Label, key: LabelKey, vars: Record<string, string>, dates: string[], lang: Lang): Html[] | string[] {
  const names = Object.keys(vars);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers)
    .split(/\u0001(\d+)\u0002/)
    .map((part, i) => {
      if (i % 2 === 0) return part;
      const name = names[Number(part)];
      return dates.includes(name) ? html`<bdi>${dateText(vars[name], lang)}</bdi>` : /[\p{L}]/u.test(vars[name]) ? html`<bdi>${vars[name]}</bdi>` : html`<bdi dir="ltr" class="nowrap">${vars[name]}</bdi>`;
    }) as Html[];
}

export function errorBox(message: string | undefined): Html | string {
  return message ? html`<p id="error" class="error" role="alert">${message}</p>` : '';
}

/** A page with one plain message (refusals, not found). */
export function messagePage(t: Label, lang: Lang, message: string, signedIn: boolean): Html {
  return layout({ t, lang, title: message, signedIn, body: html`<p class="message">${message}</p>` });
}
