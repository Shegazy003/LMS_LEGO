// Logo upload rules: PNG, JPEG or SVG, recognised by content (not by file name
// or the browser's declared type), at most 1 MB.

export const LOGO_MAX_BYTES = 1024 * 1024;
export type LogoType = 'image/png' | 'image/jpeg' | 'image/svg+xml';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

export function sniffLogo(bytes: Uint8Array): LogoType | null {
  if (bytes.length >= PNG.length && startsWith(bytes, PNG)) return 'image/png';
  if (bytes.length >= JPEG.length && startsWith(bytes, JPEG)) return 'image/jpeg';
  // SVG: text whose first element (after an optional BOM, XML declaration,
  // comments and doctype) is <svg.
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 2048)).replace(/^﻿/, '');
  const rest = head.replace(/^(\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, '');
  if (/^<svg[\s>/]/i.test(rest)) return 'image/svg+xml';
  return null;
}

/** Headers for serving a stored file. The sandbox policy keeps scripts inside
 * an SVG from ever running, even when the file is opened directly. "no-cache"
 * makes the browser ask every time, so the access check always runs (an ended
 * membership cannot keep seeing files from its cache); the ETag lets an
 * unchanged file answer 304 without sending it again. */
export function fileHeaders(type: string, etag: string): Record<string, string> {
  return {
    'content-type': type,
    etag,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'cache-control': 'private, no-cache',
  };
}
