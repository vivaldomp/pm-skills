const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VENDOR_MERMAID = path.join(__dirname, 'vendor', 'mermaid.min.js');

const BROWSER_CANDIDATES = ['google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge'];

// Absolute path to a usable system browser, or null. CHROME_PATH wins; else
// scan PATH for the first known binary. No npm dependency — the plugin stays
// dependency-free (007 render-engine decision).
function findBrowser(env = process.env) {
  if (env.CHROME_PATH && fs.existsSync(env.CHROME_PATH)) return env.CHROME_PATH;
  const dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const name of BROWSER_CANDIDATES) {
    for (const dir of dirs) {
      const full = path.join(dir, name);
      try { fs.accessSync(full, fs.constants.X_OK); return full; } catch (e) { /* keep looking */ }
    }
  }
  return null;
}

// Page that renders each block headlessly via mermaid.render and writes a JSON
// array of {ok, svg} | {ok, error} into a known element. We own this format, so
// the verifier reads structured results instead of scraping Mermaid's own DOM.
function buildVerifyPage(blocks, mermaidJs) {
  const js = String(mermaidJs || '').replace(/<\/script>/gi, '<\\/script>');
  const data = JSON.stringify(blocks || []);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
    `<pre id="__pds_result"></pre>` +
    `<script>${js}</script>` +
    `<script>(async()=>{` +
    `try{mermaid.initialize({startOnLoad:false});}catch(e){}` +
    `const blocks=${data};const out=[];` +
    `for(let i=0;i<blocks.length;i++){` +
    `try{const r=await mermaid.render('pdsv'+i,blocks[i]);out.push({ok:true,svg:r.svg});}` +
    `catch(e){out.push({ok:false,error:String(e&&e.message||e)});}` +
    `}` +
    `document.getElementById('__pds_result').textContent=JSON.stringify(out);` +
    `})();</script></body></html>`;
}

function htmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Extract and parse the JSON the verify page wrote. Browsers serialize text
// nodes with &, <, > escaped; unescape before JSON.parse. Returns null on any
// problem so the caller can report "could not read render result".
function parseVerifyResult(dumpedHtml) {
  const mm = String(dumpedHtml).match(/<pre id="__pds_result">([\s\S]*?)<\/pre>/);
  if (!mm) return null;
  const json = htmlUnescape(mm[1]).trim();
  if (!json) return null;
  try { return JSON.parse(json); } catch (e) { return null; }
}

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

// JS-free page assembled from already-rendered SVG strings (006 A2). The SVGs are
// captured from the live preview; no client-side runtime, so no serving path can
// break it. Inputs are trusted rendered SVG markup and are inlined as-is.
function renderStaticSvgPage(svgs, opts = {}) {
  const title = opts.title || 'Diagram Preview';
  const figures = (svgs || []).length
    ? (svgs || []).map((svg, i) =>
        `<figure><figcaption>Diagram ${i + 1}</figcaption>${String(svg == null ? '' : svg)}</figure>`).join('\n')
    : '<p class="empty">No diagrams.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#fff}` +
    `h1{font-size:1.2rem}figure{margin:0 0 2rem}` +
    `figcaption{font-size:.8rem;color:#666;margin-bottom:.4rem}.empty{color:#666}svg{max-width:100%}</style>` +
    `</head><body><h1>${esc(title)}</h1>${figures}</body></html>`;
}

module.exports = { extractMermaidBlocks, renderPreview, renderStaticSvgPage,
  findBrowser, buildVerifyPage, parseVerifyResult };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--static') {
    const [, outPath, ...svgPaths] = argv;
    if (!outPath || !svgPaths.length) {
      console.error('usage: mermaid-preview.js --static <out.html> <a.svg> [b.svg ...]');
      process.exit(1);
    }
    const svgs = svgPaths.map(p => fs.readFileSync(p, 'utf8'));
    const abs = path.resolve(outPath);
    fs.writeFileSync(abs, renderStaticSvgPage(svgs, { title: path.basename(outPath) }));
    console.log(`Wrote ${abs} (${svgs.length} static svg${svgs.length === 1 ? '' : 's'}) — JS-free; open directly.`);
    process.exit(0);
  }
  const [inPath, outPath] = argv;
  if (!inPath || !outPath) {
    console.error('usage: mermaid-preview.js <input.md> <out.html>');
    process.exit(1);
  }
  const markdown = fs.readFileSync(inPath, 'utf8');
  const mermaidJs = fs.existsSync(VENDOR_MERMAID) ? fs.readFileSync(VENDOR_MERMAID, 'utf8') : '';
  const blocks = extractMermaidBlocks(markdown);
  const abs = path.resolve(outPath);
  fs.writeFileSync(abs, renderPreview(blocks, { title: path.basename(inPath), mermaidJs }));
  console.log(`Wrote ${abs} (${blocks.length} diagram${blocks.length === 1 ? '' : 's'}) — open this file directly; no server needed.`);
}
