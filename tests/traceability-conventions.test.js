const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'plugins', 'product-design-suite');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('sdd template ships the coverage-index markers and an appendices section', () => {
  const tpl = read('shared/templates/sdd-template.md');
  assert.match(tpl, /COVERAGE-INDEX:START/);
  assert.match(tpl, /COVERAGE-INDEX:END/);
  assert.match(tpl, /## 16\. Requirement Coverage Index/);
  assert.match(tpl, /## 17\. Appendices/);
});
