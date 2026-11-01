// The cross-origin rule for every request that may change something (see the
// middleware in src/app.ts): it must carry this site's own Origin, exactly
// (scheme, host and port), or a browser's same-origin Sec-Fetch-Site.
export function isSameOrigin(requestUrl: string, origin: string | undefined, fetchSite: string | undefined): boolean {
  return fetchSite === 'same-origin' || origin === new URL(requestUrl).origin;
}
