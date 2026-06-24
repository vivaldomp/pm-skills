const test = require('node:test');
const assert = require('node:assert');
const d = require('../plugins/product-design-suite/scripts/diagram-render.js');

const spec = {
  title: 'C4 Context',
  nodes: [{ id: 'u', label: 'User', kind: 'person' }, { id: 's', label: 'System', kind: 'system' }],
  edges: [{ from: 'u', to: 's', label: 'uses' }],
};

test('renderSvg emits an svg with node labels and an arrow marker', () => {
  const svg = d.renderSvg(spec);
  assert.match(svg, /<svg/);
  assert.match(svg, /User/);
  assert.match(svg, /System/);
  assert.match(svg, /marker id="arrow"/);
  assert.match(svg, /uses/);
});

test('renderDiagram wraps svg in self-contained html with no external src', () => {
  const html = d.renderDiagram(spec);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /C4 Context/);
  assert.ok(!/src=("|')http/.test(html), 'must not load external resources');
});

test('escapes angle brackets in labels', () => {
  const svg = d.renderSvg({ nodes: [{ id: 'a', label: '<b>x</b>' }], edges: [] });
  assert.ok(!svg.includes('<b>x</b>'));
  assert.match(svg, /&lt;b&gt;/);
});
