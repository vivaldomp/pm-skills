const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const t = require('../plugins/product-design-suite/scripts/traceability.js');
const o = require('../plugins/product-design-suite/scripts/openui-render.js');
const d = require('../plugins/product-design-suite/scripts/diagram-render.js');

test('traceability over a sample .product links PRD->SDD->ADR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-'));
  fs.mkdirSync(path.join(dir, 'prd'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'sdd'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'adr'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'prd', 'prd.md'), 'FR-001 onboarding. NFR-002 latency.');
  fs.writeFileSync(path.join(dir, 'sdd', 'sdd.md'), 'AR-001 implements FR-001.');
  fs.writeFileSync(path.join(dir, 'adr', 'ADR-001-x.md'), 'Decision impacting FR-001.');
  const rows = t.buildMatrix(t.loadProduct(dir));
  const fr = rows.find(r => r.id === 'FR-001');
  assert.equal(fr.inSdd, true);
  assert.deepEqual(fr.adrs, ['ADR-001']);
  assert.equal(rows.find(r => r.id === 'NFR-002').inSdd, false);
});

test('renderers produce self-contained html', () => {
  const ui = o.renderOpenUI('root = Section([h])\nh = Heading("Hi")');
  const dg = d.renderDiagram({ title: 'X', nodes: [{ id: 'a', label: 'A' }], edges: [] });
  for (const html of [ui, dg]) {
    assert.match(html, /<!DOCTYPE html>/);
    assert.ok(!/(src|href)=("|')https?:\/\//.test(html));
  }
});
