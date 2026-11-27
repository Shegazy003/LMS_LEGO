// LMS-D9 (owner decision D9, PIL-320): the one change D9 makes to a page the earlier base comparisons crawl.
// The admin people page's appoint form (#appoint) gains a help line (R-3) and its role field starts on a
// disabled "Choose a role" placeholder with nothing preselected (R-1); the confirmation (R-2) only shows after an
// Appoint, which no crawl posts. On BOTH sides, inside #appoint only: the help line is taken out and the role
// <select> is reduced to its choosable options (value and label), so the selection and the placeholder are not
// compared but the three roles and their words still are. Everything else on every page stays byte-compared.
// R-1 to R-3 themselves are tested in test/d9/role.test.ts.

const APPOINT = /<form id="appoint"[\s\S]*?<\/form>/g;
const HELP = /\n[ \t]*<p id="role-help"[^>]*>[\s\S]*?<\/p>/;
const ROLE_SELECT = /<select name="role"[^>]*>([\s\S]*?)<\/select>/;
const OPTION = /<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g;

export function d9People(body: string): string {
  return body.replace(APPOINT, (form) =>
    form.replace(HELP, '').replace(ROLE_SELECT, (_all, options: string) => {
      const roles = [...options.matchAll(OPTION)].filter((m) => m[1] !== '' && !/\bdisabled\b/.test(m[2])).map((m) => `${m[1]}=${m[3]}`);
      return `<select name="role">[${roles.join('|')}]</select>`;
    }));
}
