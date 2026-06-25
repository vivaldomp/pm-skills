// tests/lint-ids.test.js
const test = require('node:test');
const assert = require('node:assert');
const l = require('../plugins/product-design-suite/scripts/lint-ids.js');

test('lintText flags ID-shaped tokens that miss the canonical form', () => {
  // 'NFR_P1' uses an underscore; 'FR-01X' has an uppercase trailing letter.
  const r = l.lintText('Good: FR-001 NFR-P1 C-3. Bad: NFR_P1 FR-01X.');
  assert.ok(r.malformed.includes('NFR_P1'));
  assert.ok(r.malformed.includes('FR-01X'));
});

test('lintText passes clean canonical text', () => {
  assert.deepEqual(l.lintText('FR-001 NFR-P1 AR-002 C-8 UAT-003 ADR-004').malformed, []);
});
