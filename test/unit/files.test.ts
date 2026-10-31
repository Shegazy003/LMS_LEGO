import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffLogo, LOGO_MAX_BYTES } from '../../src/files.ts';

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);

test('logo: PNG, JPEG and SVG are recognised by their content, not their name', () => {
  assert.equal(sniffLogo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), 'image/png');
  assert.equal(sniffLogo(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), 'image/jpeg');
  assert.equal(sniffLogo(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
  assert.equal(
    sniffLogo(text('﻿<?xml version="1.0"?>\n<!-- logo -->\n<svg viewBox="0 0 1 1"/>')),
    'image/svg+xml',
  );
});

test('logo: anything else is refused', () => {
  assert.equal(sniffLogo(text('GIF89a......')), null);
  assert.equal(sniffLogo(text('%PDF-1.7')), null);
  assert.equal(sniffLogo(text('<html><body>hi</body></html>')), null);
  assert.equal(sniffLogo(text('just text')), null);
  assert.equal(sniffLogo(bytes()), null);
});

test('logo: size limit is 1 MB', () => {
  assert.equal(LOGO_MAX_BYTES, 1024 * 1024);
});
