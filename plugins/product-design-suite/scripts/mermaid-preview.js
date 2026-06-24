const fs = require('node:fs');
const path = require('node:path');

const VENDOR_MERMAID = path.join(__dirname, 'vendor', 'mermaid.min.js');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Inner source of every ```mermaid fenced block, in document order.
function extractMermaidBlocks(markdown) {
  const re = /```mermaid[ \t]*\r?\n([\s\S]*?)```/g;
  const out = [];
  let mm;
  while ((mm = re.exec(String(markdown || ''))) !== null) {
    out.push(mm[1].replace(/\s+$/, ''));
  }
  return out;
}

// Self-contained preview page. mermaidJs is inlined (no external src), so the
// page renders offline / in restricted networks.
function renderPreview(blocks, opts = {}) {
  const title = opts.title || 'Diagram Preview';
  // Guard against a stray </script> inside the minified lib closing the tag early.
  const mermaidJs = String(opts.mermaidJs || '').replace(/<\/script>/gi, '<\\/script>');
  const figures = (blocks || []).length
    ? blocks.map((code, i) =>
        `<figure><figcaption>Diagram ${i + 1}</figcaption>` +
        `<pre class="mermaid">${esc(code)}</pre></figure>`).join('\n')
    : '<p class="empty">No mermaid diagrams found.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#fff}` +
    `h1{font-size:1.2rem}figure{margin:0 0 2rem}` +
    `figcaption{font-size:.8rem;color:#666;margin-bottom:.4rem}.empty{color:#666}</style>` +
    `</head><body><h1>${esc(title)}</h1>${figures}` +
    `<script>${mermaidJs}</script>` +
    `<script>mermaid.initialize({startOnLoad:true});</script>` +
    `</body></html>`;
}

module.exports = { extractMermaidBlocks, renderPreview };

if (require.main === module) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('usage: mermaid-preview.js <input.md> <out.html>');
    process.exit(1);
  }
  const markdown = fs.readFileSync(inPath, 'utf8');
  const mermaidJs = fs.existsSync(VENDOR_MERMAID) ? fs.readFileSync(VENDOR_MERMAID, 'utf8') : '';
  const blocks = extractMermaidBlocks(markdown);
  fs.writeFileSync(outPath, renderPreview(blocks, { title: path.basename(inPath), mermaidJs }));
  console.log(`Wrote ${outPath} (${blocks.length} diagram${blocks.length === 1 ? '' : 's'})`);
}
