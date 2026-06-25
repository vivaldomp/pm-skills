// tests/id-conventions.test.js
const test = require('node:test');
const assert = require('node:assert');
const c = require('../plugins/product-design-suite/scripts/id-conventions.js');

test('classify recognizes every canonical prefix incl constraints', () => {
  assert.equal(c.classify('FR-001'), 'FR');
  assert.equal(c.classify('C-7'), 'C');
  assert.equal(c.classify('NFR-P1'), 'NFR');     // category-lettered (A1)
  assert.equal(c.classify('UAT-005'), 'UAT');
});

test('parseMember splits category letters from the number', () => {
  assert.deepEqual(c.parseMember('NFR-PR1'), { prefix: 'NFR', cat: 'PR', num: '1', suf: '' });
  assert.deepEqual(c.parseMember('FR-003a'), { prefix: 'FR', cat: '', num: '3', suf: 'a' });
});

test('classify returns null for non-ids', () => {
  assert.equal(c.classify('FRX-9'), null);
  assert.equal(c.classify('service/002'), null);
});

test('familyOf includes the dash and any category for range expansion', () => {
  assert.equal(c.familyOf('NFR-P1'), 'NFR-P');
  assert.equal(c.familyOf('FR-003'), 'FR-');
});

test('PREFIXES contains constraints', () => {
  assert.ok(c.PREFIXES.includes('C'));
});
