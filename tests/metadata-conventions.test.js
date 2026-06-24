const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'plugins', 'product-design-suite');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// Returns the YAML front-matter body (text between the opening and closing ---),
// or null if the file does not start with a front-matter block.
function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

test('all three templates open with a YAML front-matter block', () => {
  for (const f of ['prd-template.md', 'sdd-template.md', 'adr-template.md']) {
    const text = read(path.join('shared/templates', f));
    assert.ok(text.startsWith('---\n'), `${f} must start with front-matter`);
    assert.ok(frontMatter(text), `${f} must have a closing --- delimiter`);
  }
});

test('PRD and SDD front-matter declare the five metadata fields', () => {
  for (const f of ['prd-template.md', 'sdd-template.md']) {
    const fm = frontMatter(read(path.join('shared/templates', f)));
    for (const key of ['title', 'status', 'version', 'owner', 'date']) {
      assert.match(fm, new RegExp('^' + key + ':', 'm'), `${f} front-matter needs ${key}`);
    }
  }
});

test('ADR front-matter declares scalar and relationship fields', () => {
  const fm = frontMatter(read('shared/templates/adr-template.md'));
  const keys = ['id', 'title', 'status', 'date', 'author', 'reviewers',
                'supersedes', 'superseded-by', 'amends', 'amended-by',
                'related-prd', 'related-sdd', 'related-adrs'];
  for (const key of keys) {
    assert.match(fm, new RegExp('^' + key + ':', 'm'), `ADR front-matter needs ${key}`);
  }
});

test('ADR template drops the Metadata section and renumbers Context to 1', () => {
  const tpl = read('shared/templates/adr-template.md');
  assert.doesNotMatch(tpl, /## \d+\. Metadata/);
  assert.match(tpl, /## 1\. Context/);
  assert.match(tpl, /## 7\. References/);
  assert.match(tpl, /## Status History/);
});
