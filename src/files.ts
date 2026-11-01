// Logo upload rules: PNG, JPEG or SVG, recognised by content (not by file name
// or the browser's declared type), at most 1 MB. Lesson file rules are below.

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

/** File types a lesson file may be shown as. Anything else stored under a
 * material is only ever offered as a download, never shown in our origin. */
const MATERIAL_TYPES: Record<'pdf' | 'image', readonly string[]> = {
  pdf: ['application/pdf'],
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
};

/** Headers for a lesson file (PDF or image): the logo's safety headers
 * (nosniff, sandbox, no-cache so the access check runs on every open), shown
 * inline when the stored type fits the kind, otherwise a download. Chromium's
 * PDF viewer renders under the sandbox policy (checked by hand, 31 Oct 2026). */
export function materialFileHeaders(kind: 'pdf' | 'image', storedType: string, etag: string): Record<string, string> {
  const shown = MATERIAL_TYPES[kind].includes(storedType);
  return {
    ...fileHeaders(shown ? storedType : 'application/octet-stream', etag),
    'content-disposition': shown ? 'inline' : 'attachment',
  };
}

// Lesson file upload rules (AT-3, hosting decision: PDF and image only, at
// most 25 MB). The kind and the stored type come from the file's first bytes,
// never from its name or the browser's declared type.
// - Accepted: PDF, PNG, JPEG, WebP and GIF. GIF is a plain picture format with
//   no active content, every browser shows it, and teachers use animated GIFs.
// - Refused: SVG. It is an XML document that can carry scripts and outside
//   references; a logo (owner only, 1 MB) may be SVG, but lesson files come
//   from every publisher and are opened directly, so they are pictures only.
export const MATERIAL_MAX_BYTES = 25 * 1024 * 1024;
/** Room for the form's other fields and multipart framing around the file. */
const FORM_SLACK_BYTES = 1024 * 1024;
export type MaterialFileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

const at = (bytes: Uint8Array, offset: number, sig: number[]) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

export function sniffMaterial(bytes: Uint8Array): { kind: 'pdf' | 'image'; type: MaterialFileType } | null {
  if (at(bytes, 0, PDF)) return { kind: 'pdf', type: 'application/pdf' };
  if (at(bytes, 0, PNG)) return { kind: 'image', type: 'image/png' };
  if (at(bytes, 0, JPEG)) return { kind: 'image', type: 'image/jpeg' };
  if (at(bytes, 0, RIFF) && at(bytes, 8, WEBP)) return { kind: 'image', type: 'image/webp' };
  if (at(bytes, 0, GIF87) || at(bytes, 0, GIF89)) return { kind: 'image', type: 'image/gif' };
  return null;
}

/** A request whose declared length is far over the limit is refused before
 * its body is read, so an oversized upload never fills the Worker's memory.
 * Without a declared length the file's own size is checked after reading. */
export function materialBodyTooLarge(contentLength: string | undefined): boolean {
  if (contentLength === undefined) return false;
  const n = Number(contentLength);
  return !Number.isFinite(n) || n > MATERIAL_MAX_BYTES + FORM_SLACK_BYTES;
}
