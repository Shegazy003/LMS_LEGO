import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_MAX_BYTES, materialBodyTooLarge, sniffMaterial } from '../../src/files.ts';
import { moveItem } from '../../src/publishing.ts';

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};

test('lesson files: a PDF and PNG, JPEG, WebP and GIF images are recognised by their content', () => {
  assert.deepEqual(sniffMaterial(text('%PDF-1.7\n%âãÏÓ\n1 0 obj')), { kind: 'pdf', type: 'application/pdf' });
  assert.deepEqual(sniffMaterial(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)), { kind: 'image', type: 'image/png' });
  assert.deepEqual(sniffMaterial(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16)), { kind: 'image', type: 'image/jpeg' });
  assert.deepEqual(sniffMaterial(join(text('RIFF'), bytes(0x24, 0, 0, 0), text('WEBPVP8 '))), { kind: 'image', type: 'image/webp' });
  assert.deepEqual(sniffMaterial(text('GIF89a\x01\x00\x01\x00')), { kind: 'image', type: 'image/gif' });
  assert.deepEqual(sniffMaterial(text('GIF87a\x01\x00\x01\x00')), { kind: 'image', type: 'image/gif' });
});

test('lesson files: anything else is refused, whatever its name or declared type', () => {
  for (const [what, b] of [
    ['an SVG drawing (it can carry scripts)', text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['an SVG with an XML declaration', text('<?xml version="1.0"?><svg/>')],
    ['a web page', text('<!doctype html><html><body>hi</body></html>')],
    ['plain text', text('This is plain text pretending to be a PDF.')],
    ['a Word or zip file', bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 6, 0)],
    ['a Windows program', text('MZ\x90\x00\x03\x00')],
    ['a RIFF file that is not WebP (a WAV sound)', join(text('RIFF'), bytes(0x24, 0, 0, 0), text('WAVEfmt '))],
    ['a PDF signature that is not at the start', text(' %PDF-1.7')],
    ['an empty file', bytes()],
    ['a truncated PNG signature', bytes(0x89, 0x50, 0x4e)],
  ] as const) {
    assert.equal(sniffMaterial(b), null, what);
  }
});

test('lesson files: at most 25 MB; a request body far over that is refused before it is read', () => {
  assert.equal(MATERIAL_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(materialBodyTooLarge(undefined), false, 'no length given: the file size is checked after reading');
  assert.equal(materialBodyTooLarge(String(MATERIAL_MAX_BYTES)), false, 'a 25 MB file with its form fits');
  assert.equal(materialBodyTooLarge(String(MATERIAL_MAX_BYTES + 512 * 1024)), false, 'room for the form around a 25 MB file');
  assert.equal(materialBodyTooLarge(String(MATERIAL_MAX_BYTES + 2 * 1024 * 1024)), true);
  assert.equal(materialBodyTooLarge(String(100 * 1024 * 1024)), true);
  assert.equal(materialBodyTooLarge('not a number'), true, 'an unreadable length is refused');
});

test('reordering: an item moves one place up or down; at the ends nothing changes', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(ids, 'c', 'up'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveItem(ids, 'b', 'down'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveItem(ids, 'a', 'up'), ids, 'the first cannot go higher');
  assert.deepEqual(moveItem(ids, 'd', 'down'), ids, 'the last cannot go lower');
  assert.deepEqual(moveItem(ids, 'zz', 'up'), ids, 'an unknown id changes nothing');
  assert.deepEqual(ids, ['a', 'b', 'c', 'd'], 'the input is not changed');
});
