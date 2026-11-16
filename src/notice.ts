// The learner’s lesson-activity notice, told in full once, then folded (LMS
// wave 1, task L1; product-contract v2 on PIL-210, section 7). The release 2
// rule is unchanged: while the space’s switch is on, the learner is told on
// their home and on each lesson page; while it is off, nothing is shown.
//
// "Once" is per account, per space, per browser and per switch-on, with no
// server data: the page shows the full card when the request carries no
// cookie for this account holding the current switch-on marker (the setting’s
// changed_at tick, which every switch-on renews, also twice on one day), and
// sets one; otherwise it shows the folded line. The cookie holds that tick
// only: no name, no content. A browser that refuses cookies is told in full
// every time (the safe side).

/** One year, in seconds. */
const YEAR = 365 * 24 * 60 * 60;

export type NoticeForm = 'full' | 'folded';

export const noticeCookieName = (spaceId: string, userId: string) => `lms_notice_${spaceId}_${userId}`;

/** The cookie’s attributes: the space’s path only, never read by script, Secure on the live https address (as the session cookie). */
export function noticeCookieOptions(spaceId: string, https: boolean) {
  return { path: `/s/${spaceId}`, httpOnly: true, secure: https, sameSite: 'Lax' as const, maxAge: YEAR };
}

/** Which form this request gets, given the cookie it carries and the current switch-on marker. */
export const noticeFormFor = (carried: string | undefined, marker: string): NoticeForm => (carried === marker ? 'folded' : 'full');
