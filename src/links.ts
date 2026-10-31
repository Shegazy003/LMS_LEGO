// Outside addresses (video links, web links). Only http and https addresses
// become links; anything else (javascript:, data:, file:, a bare host) is
// never placed in a page as a link.
export function externalUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url.href;
}
