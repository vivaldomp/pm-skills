const test = require('node:test');
const assert = require('node:assert');
const o = require('../plugins/product-design-suite/scripts/openui-render.js');

test('parseOpenUI resolves root and a call node', () => {
  const { rootId, defs } = o.parseOpenUI('root = Root([h])\nh = Heading("Hello")');
  assert.equal(rootId, 'root');
  assert.equal(defs.root.t, 'call');
  assert.equal(defs.root.type, 'Root');
  assert.equal(defs.h.type, 'Heading');
});

test('renderOpenUI renders nested components and text', () => {
  const html = o.renderOpenUI('root = Root([nav, body])\nnav = Navbar("Acme", [l1])\nl1 = Link("Home", "/")\nbody = Section([h, b])\nh = Heading("Dashboard")\nb = Button("Save")');
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Acme/);
  assert.match(html, /Dashboard/);
  assert.match(html, /<button[^>]*>Save<\/button>/);
  assert.match(html, /href="\/"/);
  assert.ok(!/src=("|')http/.test(html), 'no external resources');
});

test('renders a StatCard grid', () => {
  const html = o.renderOpenUI('root = Grid([s1, s2])\ns1 = StatCard("Revenue", "$1.2M", "up")\ns2 = StatCard("Users", "450k", "flat")');
  assert.match(html, /Revenue/);
  assert.match(html, /\$1\.2M/);
  assert.match(html, /450k/);
});

test('escapes HTML in text', () => {
  const html = o.renderOpenUI('root = Heading("<script>x</script>")');
  assert.ok(!/<script>x<\/script>/.test(html));
  assert.match(html, /&lt;script&gt;/);
});
