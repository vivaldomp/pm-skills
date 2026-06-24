const test = require('node:test');
const assert = require('node:assert');
const m = require('../plugins/product-design-suite/scripts/mermaid-preview.js');

test('extractMermaidBlocks returns inner source of each mermaid fence in order', () => {
  const md = [
    '# Doc',
    '```mermaid',
    'flowchart TD',
    '  A --> B',
    '```',
    'prose',
    '```js',
    'const x = 1;',
    '```',
    '```mermaid',
    'sequenceDiagram',
    '  A->>B: hi',
    '```',
  ].join('\n');
  const blocks = m.extractMermaidBlocks(md);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /flowchart TD/);
  assert.match(blocks[0], /A --> B/);
  assert.match(blocks[1], /sequenceDiagram/);
  assert.ok(!blocks.join('\n').includes('const x'));
});

test('extractMermaidBlocks returns [] when there are no diagrams', () => {
  assert.deepEqual(m.extractMermaidBlocks('# Just text\nno fences here'), []);
});

test('renderPreview inlines provided mermaid js, one figure per block, no external resources', () => {
  const html = m.renderPreview(['flowchart TD\n A-->B', 'stateDiagram-v2\n [*] --> S'], { mermaidJs: '/*MERMAID-LIB*/' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /\/\*MERMAID-LIB\*\//);
  assert.equal((html.match(/class="mermaid"/g) || []).length, 2);
  assert.match(html, /mermaid\.initialize/);
  assert.ok(!/(src|href)=("|')https?:\/\//.test(html));
});

test('renderPreview escapes html-special chars in diagram source', () => {
  const html = m.renderPreview(['flowchart TD\n A[<b>x</b>] --> B'], { mermaidJs: '' });
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /&lt;b&gt;/);
});

test('renderPreview shows an empty-state when given no blocks', () => {
  const html = m.renderPreview([], { mermaidJs: '' });
  assert.match(html, /No mermaid diagrams found/);
});
