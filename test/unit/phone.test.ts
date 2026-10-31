import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseMobile, normaliseCountryCode } from '../../src/phone.ts';

test('phone: a local Egyptian number is stored in international form', () => {
  assert.equal(normaliseMobile('01012345678', '+20'), '+201012345678');
  assert.equal(normaliseMobile('010 1234 5678', '+20'), '+201012345678');
  assert.equal(normaliseMobile('010-1234-5678', '+20'), '+201012345678');
});

test('phone: numbers already in international form keep their own country code', () => {
  assert.equal(normaliseMobile('+201012345678', '+20'), '+201012345678');
  assert.equal(normaliseMobile('00201012345678', '+20'), '+201012345678');
  assert.equal(normaliseMobile('+966 50 123 4567', '+20'), '+966501234567');
});

test('phone: numbers that cannot be normalised are refused', () => {
  for (const bad of ['', '   ', 'abc', '12', '0', '01', '+', '+0123456789', '010-ABCD-5678', '+1234567890123456', '0101234567890123']) {
    assert.equal(normaliseMobile(bad, '+20'), null, `expected refusal for "${bad}"`);
  }
});

test('phone: without a default country code only international input is accepted', () => {
  assert.equal(normaliseMobile('+201012345678'), '+201012345678');
  assert.equal(normaliseMobile('01012345678'), null);
});

test('phone: country codes', () => {
  assert.equal(normaliseCountryCode('+20'), '+20');
  assert.equal(normaliseCountryCode('20'), '+20');
  assert.equal(normaliseCountryCode(' +966 '), '+966');
  for (const bad of ['', '+', '+0', '0020', 'eg', '+12345']) {
    assert.equal(normaliseCountryCode(bad), null, `expected refusal for "${bad}"`);
  }
});
