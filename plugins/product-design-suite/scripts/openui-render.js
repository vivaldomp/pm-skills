function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- expression parser: string | number | bool | null | array | object | call | ref ---
class P {
  constructor(s) { this.s = s; this.i = 0; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  value() {
    this.ws();
    const c = this.s[this.i];
    if (c === '"') return this.string();
    if (c === '[') return this.array();
    if (c === '{') return this.object();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    const id = this.ident();
    if (id === 'true') return { t: 'bool', v: true };
    if (id === 'false') return { t: 'bool', v: false };
    if (id === 'null') return { t: 'null' };
    this.ws();
    if (this.s[this.i] === '(') return { t: 'call', type: id, args: this.argList() };
    return { t: 'ref', name: id };
  }
  string() { this.i++; let out = ''; while (this.s[this.i] && this.s[this.i] !== '"') { if (this.s[this.i] === '\\') this.i++; out += this.s[this.i++]; } this.i++; return { t: 'str', v: out }; }
  number() { const st = this.i; if (this.s[this.i] === '-') this.i++; while (/[0-9.]/.test(this.s[this.i])) this.i++; return { t: 'num', v: Number(this.s.slice(st, this.i)) }; }
  ident() { this.ws(); const st = this.i; while (/[A-Za-z0-9_]/.test(this.s[this.i])) this.i++; return this.s.slice(st, this.i); }
  array() { this.i++; const a = []; this.ws(); if (this.s[this.i] === ']') { this.i++; return { t: 'arr', items: a }; } while (true) { a.push(this.value()); this.ws(); if (this.s[this.i] === ',') { this.i++; continue; } break; } this.ws(); if (this.s[this.i] === ']') this.i++; return { t: 'arr', items: a }; }
  object() { this.i++; const o = {}; this.ws(); if (this.s[this.i] === '}') { this.i++; return { t: 'obj', entries: o }; } while (true) { const k = this.ident(); this.ws(); if (this.s[this.i] === ':') this.i++; o[k] = this.value(); this.ws(); if (this.s[this.i] === ',') { this.i++; continue; } break; } this.ws(); if (this.s[this.i] === '}') this.i++; return { t: 'obj', entries: o }; }
  argList() { this.i++; const a = []; this.ws(); if (this.s[this.i] === ')') { this.i++; return a; } while (true) { a.push(this.value()); this.ws(); if (this.s[this.i] === ',') { this.i++; continue; } break; } this.ws(); if (this.s[this.i] === ')') this.i++; return a; }
}

function parseOpenUI(src) {
  const defs = {};
  let rootId = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const id = line.slice(0, eq).trim();
    defs[id] = new P(line.slice(eq + 1)).value();
    if (rootId === null) rootId = id;
  }
  if (defs.root) rootId = 'root';
  return { rootId, defs };
}

function resolve(node, defs) {
  let n = node, guard = 0;
  while (n && n.t === 'ref' && guard++ < 100) n = defs[n.name];
  return n;
}
function txt(node, defs) {
  const n = resolve(node, defs);
  if (!n) return '';
  if (n.t === 'str') return esc(n.v);
  if (n.t === 'num' || n.t === 'bool') return esc(n.v);
  return renderNode(n, defs);
}
function kids(node, defs) {
  const n = resolve(node, defs);
  if (!n) return '';
  if (n.t === 'arr') return n.items.map(x => renderNode(x, defs)).join('');
  return renderNode(n, defs);
}

const COMPONENTS = {
  Root: (a, d) => `<div class="ui-root">${kids(a[0], d)}</div>`,
  Section: (a, d) => `<section class="ui-section">${kids(a[0], d)}</section>`,
  Grid: (a, d) => `<div class="ui-grid">${kids(a[0], d)}</div>`,
  Card: (a, d) => `<div class="ui-card">${a.map(x => renderNode(x, d)).join('')}</div>`,
  Navbar: (a, d) => `<nav class="ui-nav"><span class="ui-brand">${txt(a[0], d)}</span><span class="ui-links">${kids(a[1], d)}</span></nav>`,
  Link: (a, d) => {
    const raw = txt(a[1], d);
    const safe = /^(?:https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(raw) ? raw : '#';
    return `<a class="ui-link" href="${safe}">${txt(a[0], d)}</a>`;
  },
  StatCard: (a, d) => `<div class="ui-stat"><div class="ui-stat-label">${txt(a[0], d)}</div><div class="ui-stat-value">${txt(a[1], d)}</div><div class="ui-stat-trend">${txt(a[2], d)}</div></div>`,
  Heading: (a, d) => `<h2 class="ui-heading">${txt(a[0], d)}</h2>`,
  Text: (a, d) => `<p class="ui-text">${txt(a[0], d)}</p>`,
  Button: (a, d) => `<button class="ui-btn">${txt(a[0], d)}</button>`,
  Input: (a, d) => `<label class="ui-field"><span>${txt(a[0], d)}</span><input placeholder="${txt(a[1], d)}"/></label>`,
  Form: (a, d) => `<form class="ui-form">${kids(a[0], d)}</form>`,
};

function renderNode(node, defs) {
  const n = resolve(node, defs);
  if (!n) return '';
  switch (n.t) {
    case 'str': return esc(n.v);
    case 'num': case 'bool': return esc(n.v);
    case 'arr': return n.items.map(x => renderNode(x, defs)).join('');
    case 'call': {
      const fn = COMPONENTS[n.type];
      return fn ? fn(n.args, defs) : `<!-- unknown component ${esc(n.type)} -->`;
    }
    default: return '';
  }
}

const CSS = `*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#f5f7fa;color:#1c2733}
.ui-root{max-width:1024px;margin:0 auto;padding:1rem}
.ui-nav{display:flex;justify-content:space-between;align-items:center;background:#fff;padding:.75rem 1rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem}
.ui-brand{font-weight:700}.ui-links a{margin-left:1rem;text-decoration:none;color:#3b6ea5}
.ui-section{background:#fff;padding:1rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem}
.ui-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}
.ui-card{background:#fff;padding:1rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.ui-stat{background:#fff;padding:1rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.ui-stat-label{font-size:.8rem;color:#667}.ui-stat-value{font-size:1.6rem;font-weight:700}.ui-stat-trend{font-size:.8rem;color:#888}
.ui-heading{margin:.2rem 0 .8rem}.ui-btn{background:#3b6ea5;color:#fff;border:0;padding:.5rem 1rem;border-radius:6px;cursor:pointer}
.ui-field{display:block;margin:.5rem 0}.ui-field input{display:block;width:100%;padding:.5rem;border:1px solid #ccd;border-radius:6px}`;

function renderOpenUI(src) {
  const { rootId, defs } = parseOpenUI(src);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI Mockup</title><style>${CSS}</style></head><body>${renderNode(defs[rootId], defs)}</body></html>`;
}

module.exports = { parseOpenUI, renderOpenUI };

if (require.main === module) {
  const fs = require('node:fs');
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) { console.error('usage: openui-render.js <in.openui> <out.html>'); process.exit(1); }
  fs.writeFileSync(outPath, renderOpenUI(fs.readFileSync(inPath, 'utf8')));
  console.log(`Wrote ${outPath}`);
}
