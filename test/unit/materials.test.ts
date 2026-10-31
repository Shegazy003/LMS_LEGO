import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialFileHeaders } from '../../src/files.ts';
import { externalUrl } from '../../src/links.ts';

test('material files: a PDF and an image are served inline with the logo\'s safety headers', () => {
  const pdf = materialFileHeaders('pdf', 'application/pdf', '"e1"');
  assert.equal(pdf['content-type'], 'application/pdf');
  assert.equal(pdf['x-content-type-options'], 'nosniff');
  assert.equal(pdf['cache-control'], 'private, no-cache', 'the access check runs on every open');
  assert.equal(pdf.etag, '"e1"');
  assert.equal(pdf['content-disposition'], 'inline');
  assert.match(pdf['content-security-policy'], /sandbox/);
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']) {
    const img = materialFileHeaders('image', type, '"e2"');
    assert.equal(img['content-type'], type);
    assert.equal(img['content-disposition'], 'inline');
    assert.match(img['content-security-policy'], /sandbox/);
  }
});

test('material files: a stored type that does not match the kind is only ever downloaded, never shown', () => {
  for (const [kind, type] of [
    ['pdf', 'text/html'],
    ['pdf', 'image/png'],
    ['image', 'application/pdf'],
    ['image', 'text/html'],
    ['image', 'application/javascript'],
    ['image', ''],
  ] as const) {
    const h = materialFileHeaders(kind, type, '"e"');
    assert.equal(h['content-type'], 'application/octet-stream', `${kind} stored as ${type || '(none)'}`);
    assert.equal(h['content-disposition'], 'attachment');
    assert.equal(h['x-content-type-options'], 'nosniff');
  }
});

test('links: only http and https addresses become links', () => {
  assert.equal(externalUrl('https://www.youtube.com/watch?v=fractions101'), 'https://www.youtube.com/watch?v=fractions101');
  assert.equal(externalUrl('http://example.org/a b'), 'http://example.org/a%20b');
  assert.equal(externalUrl('  https://example.org/x  '), 'https://example.org/x');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '//example.org', 'example.org', '', 'https://']) {
    assert.equal(externalUrl(bad), null, bad);
  }
});
