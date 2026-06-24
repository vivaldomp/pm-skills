const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'plugins', 'product-design-suite');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('pm-import skill exists with valid front-matter (name == dir)', () => {
  const s = read('skills/pm-import/SKILL.md');
  assert.match(s, /^---\nname: pm-import\n/);
  assert.match(s, /\ndescription:/);
});

test('pm-import documents ingest, mapping, gap report, SRS reference, read-only, and hand-off', () => {
  const s = read('skills/pm-import/SKILL.md');
  assert.match(s, /classif/i);
  assert.match(s, /map/i);
  assert.match(s, /\.product\/import-gap-report\.md/);
  assert.match(s, /SRS/);
  assert.match(s, /read-only/i);
  assert.match(s, /derive-then-confirm/i);
});

test('pm-import command exists and routes to the skill', () => {
  const s = read('commands/pm-import.md');
  assert.match(s, /pm-import/);
});
