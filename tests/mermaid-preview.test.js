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

test('renderPreview neutralizes a </script> sequence inside injected mermaidJs', () => {
  const html = m.renderPreview(['flowchart TD\n A-->B'], { mermaidJs: 'a</script><script>alert(1)' });
  assert.ok(!/a<\/script>/.test(html), 'raw </script> must be escaped to <\\/script>');
  assert.match(html, /a<\\\/script>/);
});

test('renderStaticSvgPage builds a JS-free page, one figure per svg (006 A2)', () => {
  const html = m.renderStaticSvgPage(['<svg id="a">A</svg>', '<svg id="b">B</svg>'], { title: 'Diagrams' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.equal((html.match(/<figure>/g) || []).length, 2);
  assert.ok(html.includes('<svg id="a">A</svg>'));
  assert.ok(html.includes('<svg id="b">B</svg>'));
  assert.ok(!/<script/i.test(html), 'static page must contain no script');
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VENDOR = path.join(__dirname, '..', 'plugins/product-design-suite/scripts/vendor/mermaid.min.js');
const CLI = path.join(__dirname, '..', 'plugins/product-design-suite/scripts/mermaid-preview.js');

test('vendored mermaid asset is present and substantial', () => {
  assert.ok(fs.existsSync(VENDOR), 'vendor/mermaid.min.js must exist');
  assert.ok(fs.statSync(VENDOR).size > 100000, 'vendored mermaid should be > 100KB');
});

test('CLI renders a self-contained preview from a markdown file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'));
  const md = path.join(dir, 'in.md');
  const out = path.join(dir, 'out.html');
  fs.writeFileSync(md, '```mermaid\nflowchart TD\n A-->B\n```\n');
  execFileSync('node', [CLI, md, out]);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /class="mermaid"/);
  assert.ok(!/(src|href)=("|')https?:\/\//.test(html));
});

test('CLI prints the absolute output path for the one-shot render (B2)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-'));
  const md = path.join(dir, 'in.md');
  const out = path.join(dir, 'out.html');
  fs.writeFileSync(md, '```mermaid\nflowchart TD\nA-->B\n```\n');
  const res = execFileSync('node', [CLI, md, out], { encoding: 'utf8' });
  assert.match(res, new RegExp(out.replace(/[.\\]/g, '\\$&')));
  assert.ok(fs.existsSync(out));
});

test('buildVerifyPage inlines mermaid, embeds blocks, exposes result element', () => {
  const html = m.buildVerifyPage(['flowchart TD\n A-->B'], '/*LIB*/');
  assert.match(html, /\/\*LIB\*\//);
  assert.match(html, /id="__pds_result"/);
  assert.match(html, /mermaid\.render/);
  assert.match(html, /flowchart TD/);
});

test('buildVerifyPage neutralizes a stray closing script tag in the lib', () => {
  const html = m.buildVerifyPage([], '</script><script>alert(1)</script>');
  assert.ok(!/<\/script><script>alert/.test(html));
});

test('parseVerifyResult reads html-escaped JSON from the result element', () => {
  const payload = JSON.stringify([{ ok: true, svg: '<svg id="a">x</svg>' }, { ok: false, error: 'Syntax error' }]);
  const escaped = payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dump = `<html><body><pre id="__pds_result">${escaped}</pre></body></html>`;
  const out = m.parseVerifyResult(dump);
  assert.equal(out.length, 2);
  assert.equal(out[0].ok, true);
  assert.match(out[0].svg, /<svg id="a">x<\/svg>/);
  assert.equal(out[1].ok, false);
});

test('parseVerifyResult returns null when the element is absent', () => {
  assert.equal(m.parseVerifyResult('<html><body>nothing</body></html>'), null);
});

test('findBrowser finds a binary on a synthetic PATH and respects CHROME_PATH', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-br-'));
  const bin = path.join(dir, 'chromium');
  fs.writeFileSync(bin, '#!/bin/sh\n'); fs.chmodSync(bin, 0o755);
  assert.equal(m.findBrowser({ PATH: dir }), bin);
  assert.equal(m.findBrowser({ PATH: '' }), null);
  const explicit = path.join(dir, 'chromium');
  assert.equal(m.findBrowser({ CHROME_PATH: explicit, PATH: '' }), explicit);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--verify falls back to lint with a loud marker when no browser is present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-vf-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, '```mermaid\nflowchart TD\n A[Start] --> B[End]\n```\n');
  // Empty PATH + no CHROME_PATH ⇒ findBrowser() === null. Run node by absolute path.
  const out = execFileSync(process.execPath, [CLI, '--verify', file],
    { encoding: 'utf8', env: { PATH: '' } });
  assert.match(out, /render NOT verified — no browser found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--verify (no browser) exits nonzero when the lint finds a footgun', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-vf-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, '```mermaid\nsequenceDiagram\n  A->>B: do; then\n```\n');
  let code = 0;
  try {
    execFileSync(process.execPath, [CLI, '--verify', file], { encoding: 'utf8', env: { PATH: '' } });
  } catch (e) { code = e.status; }
  assert.equal(code, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Integration: only runs where a real browser exists. Skipped otherwise.
test('runVerify reports a broken block by index when a browser is available', (t) => {
  const m2 = require('../plugins/product-design-suite/scripts/mermaid-preview.js');
  if (!m2.findBrowser()) { t.skip('no system browser'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-vf-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file,
    '```mermaid\nflowchart TD\n A-->B\n```\n```mermaid\nflowchart TD\n A--> -- broken\n```\n');
  const r = m2.runVerify(file);
  assert.ok(Array.isArray(r.results) && r.results.length === 2);
  assert.equal(r.results[0].ok, true);
  assert.equal(r.results[1].ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
