const NODE_W = 160, NODE_H = 70, GAP = 70, PAD = 40;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function layout(nodes) {
  return nodes.map((n, i) => ({ ...n, x: PAD + i * (NODE_W + GAP), y: PAD }));
}

function renderSvg(spec) {
  const nodes = layout(spec.nodes || []);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const count = Math.max(nodes.length, 1);
  const width = PAD * 2 + count * NODE_W + (count - 1) * GAP;
  const height = PAD * 2 + NODE_H + 40;
  const edges = (spec.edges || []).map(e => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return '';
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
    const x2 = b.x, y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    const label = e.label ? `<text x="${mx}" y="${y1 - 8}" text-anchor="middle" font-size="11" fill="#555">${esc(e.label)}</text>` : '';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888" marker-end="url(#arrow)"/>${label}`;
  }).join('');
  const boxes = nodes.map(n =>
    `<g><rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="#eef3fb" stroke="#3b6ea5"/>` +
    `<text x="${n.x + NODE_W / 2}" y="${n.y + NODE_H / 2 - 4}" text-anchor="middle" font-size="13" font-weight="bold">${esc(n.label)}</text>` +
    `<text x="${n.x + NODE_W / 2}" y="${n.y + NODE_H / 2 + 14}" text-anchor="middle" font-size="10" fill="#666">${esc(n.kind || '')}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#888"/></marker></defs>` +
    `${edges}${boxes}</svg>`;
}

function renderDiagram(spec) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(spec.title || 'Diagram')}</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#fff}h1{font-size:1.2rem}</style></head>` +
    `<body><h1>${esc(spec.title || 'Diagram')}</h1>${renderSvg(spec)}</body></html>`;
}

module.exports = { renderSvg, renderDiagram };

if (require.main === module) {
  const fs = require('node:fs');
  const [specPath, outPath] = process.argv.slice(2);
  if (!specPath || !outPath) { console.error('usage: diagram-render.js <spec.json> <out.html>'); process.exit(1); }
  fs.writeFileSync(outPath, renderDiagram(JSON.parse(fs.readFileSync(specPath, 'utf8'))));
  console.log(`Wrote ${outPath}`);
}
