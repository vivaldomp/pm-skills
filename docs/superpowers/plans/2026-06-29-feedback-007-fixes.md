# feedback-007 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five feedback-007 issues in `product-design-suite`: a lint crash on file paths, the absence of render verification before the diagram approval gate, C4 fallback, and a skipped interactive gap checkpoint.

**Architecture:** A new `--verify` mode in `mermaid-preview.js` renders each Mermaid block to SVG via a detected **system browser** (zero new npm deps) and reports per-diagram pass/fail; the SAD/SDD builder gate is rewired to require that signal. `mermaid-lint.js` learns to accept a file or a directory. Two documentation fixes (C4 reactive fallback, interactive gap checkpoint) update the builder skills and the shared questioning protocol.

**Tech Stack:** Node.js (`node:test`, `node:child_process`, `node:fs`), vendored Mermaid 11.15.0, system Chrome/Chromium in `--headless --dump-dom` mode. No new dependencies.

## Global Constraints

- **Zero new npm dependencies.** No Puppeteer/Playwright. Use a detected system browser or fall back to lint.
- **Test runner:** `node --test tests/*.test.js` (Node 24; no root `package.json`). Tests use `node:test` + `node:assert` and `require('../plugins/product-design-suite/scripts/<file>')`.
- **Plugin script root:** `plugins/product-design-suite/scripts/`. Vendored Mermaid at `scripts/vendor/mermaid.min.js`.
- **Browser detection order:** `CHROME_PATH` env, then `google-chrome`, `chromium`, `chromium-browser`, `chrome`, `msedge` on `PATH`.
- **No-browser fallback:** run the lint; if clean, exit 0 with a literal `render NOT verified — no browser found` marker; if lint finds problems, exit nonzero.
- **C4 stays the SAD template default** — no template change; fallback is reactive only.
- Commit after each task. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `mermaid-lint.js` accepts a file or a directory (Issue 3)

**Files:**
- Modify: `plugins/product-design-suite/scripts/mermaid-lint.js` (`lintProductDiagrams`, lines 44-59; CLI block 63-68)
- Test: `tests/mermaid-lint.test.js`

**Interfaces:**
- Produces: `lintProductDiagrams(target)` now accepts a `.md` file path OR a directory; returns the same `[{ file, errors }]` shape. Exit-code contract unchanged (nonzero on findings).

- [ ] **Step 1: Write the failing test**

Add to `tests/mermaid-lint.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('lintProductDiagrams accepts a single file path without ENOTDIR (007 #3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-lint-'));
  const file = path.join(dir, 'draft.md');
  fs.writeFileSync(file, '```mermaid\nsequenceDiagram\n  A->>B: do; then\n```\n');
  const out = m.lintProductDiagrams(file); // must NOT throw ENOTDIR
  assert.equal(out.length, 1, 'one file with findings');
  assert.ok(out[0].errors.some(e => /semicolon/.test(e)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('lintProductDiagrams still walks a directory tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-lint-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '```mermaid\nflowchart TD\n A[x --> B\n```\n');
  const out = m.lintProductDiagrams(dir);
  assert.ok(out.some(r => r.errors.some(e => /unbalanced/.test(e))));
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mermaid-lint.test.js`
Expected: FAIL — the single-file test throws `ENOTDIR: not a directory, scandir`.

- [ ] **Step 3: Write minimal implementation**

In `mermaid-lint.js`, replace `lintProductDiagrams` (lines 44-59) with:

```js
function lintProductDiagrams(target) {
  const out = [];
  const lintFile = p => {
    const errs = lintMarkdown(fs.readFileSync(p, 'utf8'));
    if (errs.length) out.push({ file: p, errors: errs });
  };
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.md')) lintFile(p);
    }
  };
  if (fs.existsSync(target) && fs.statSync(target).isFile()) lintFile(target);
  else walk(target);
  return out;
}
```

(The CLI block at line 64 already passes `process.argv[2]` straight through, so a file argument now works unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mermaid-lint.test.js`
Expected: PASS (all, including the two new tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/product-design-suite/scripts/mermaid-lint.js tests/mermaid-lint.test.js
git commit -m "fix(mermaid-lint): accept a file path, not only a directory (007 #3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure render-verify helpers in `mermaid-preview.js` (Issue 1, part 1)

**Files:**
- Modify: `plugins/product-design-suite/scripts/mermaid-preview.js` (add helpers + exports)
- Test: `tests/mermaid-preview.test.js`

**Interfaces:**
- Produces:
  - `findBrowser(env = process.env): string | null` — absolute path to a browser binary or `null`.
  - `buildVerifyPage(blocks: string[], mermaidJs: string): string` — HTML that renders each block via `mermaid.render` and writes `[{ ok, svg }|{ ok:false, error }]` as JSON into `<pre id="__pds_result">`.
  - `parseVerifyResult(dumpedHtml: string): Array<{ok, svg?, error?}> | null` — reads and HTML-unescapes that element's JSON.

- [ ] **Step 1: Write the failing test**

Add to `tests/mermaid-preview.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mermaid-preview.test.js`
Expected: FAIL — `m.buildVerifyPage is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `mermaid-preview.js`, add near the top after the existing `require`s:

```js
const os = require('node:os');
const { execFileSync } = require('node:child_process');

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
```

Extend `module.exports` (line 58) to add the new names:

```js
module.exports = { extractMermaidBlocks, renderPreview, renderStaticSvgPage,
  findBrowser, buildVerifyPage, parseVerifyResult };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mermaid-preview.test.js`
Expected: PASS (all, including the five new tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/product-design-suite/scripts/mermaid-preview.js tests/mermaid-preview.test.js
git commit -m "feat(mermaid-preview): render-verify helpers (browser detect, verify page, result parse) (007 #1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `--verify` CLI mode with no-browser fallback (Issues 1 + 4)

**Files:**
- Modify: `plugins/product-design-suite/scripts/mermaid-preview.js` (add `runVerify`, export it, add CLI branch)
- Test: `tests/mermaid-preview.test.js`

**Interfaces:**
- Consumes (Task 2): `findBrowser`, `buildVerifyPage`, `parseVerifyResult`, plus existing `extractMermaidBlocks`, `renderStaticSvgPage`, `VENDOR_MERMAID`.
- Produces: `runVerify(inPath): { browser: string|null, blocks: string[], results: Array|null }`. CLI: `mermaid-preview.js --verify <input.md> [out.html]` — exit 0 when every block rendered (and writes the JS-free static page when `out.html` is given), exit 1 when any block failed or the result was unreadable. With no browser: lint; exit 0 + `render NOT verified — no browser found` marker if clean, exit 1 if lint finds problems.

- [ ] **Step 1: Write the failing tests**

Add to `tests/mermaid-preview.test.js`:

```js
const { execFileSync } = require('node:child_process');
const PREVIEW = path.join(__dirname, '..', 'plugins', 'product-design-suite', 'scripts', 'mermaid-preview.js');

test('--verify falls back to lint with a loud marker when no browser is present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-vf-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, '```mermaid\nflowchart TD\n A[Start] --> B[End]\n```\n');
  // Empty PATH + no CHROME_PATH ⇒ findBrowser() === null. Run node by absolute path.
  const out = execFileSync(process.execPath, [PREVIEW, '--verify', file],
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
    execFileSync(process.execPath, [PREVIEW, '--verify', file], { encoding: 'utf8', env: { PATH: '' } });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/mermaid-preview.test.js`
Expected: FAIL — `--verify` is an unknown mode (falls through to the `<input> <out>` usage error), and `runVerify` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `mermaid-preview.js`, add `runVerify` after `parseVerifyResult`:

```js
// Headless-render every block in inPath. Returns the browser used (or null),
// the source blocks, and the per-block results (or null if unreadable).
function runVerify(inPath) {
  const blocks = extractMermaidBlocks(fs.readFileSync(inPath, 'utf8'));
  const browser = findBrowser();
  if (!browser) return { browser: null, blocks, results: null };
  const mermaidJs = fs.existsSync(VENDOR_MERMAID) ? fs.readFileSync(VENDOR_MERMAID, 'utf8') : '';
  const tmp = path.join(os.tmpdir(), `pds-verify-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, buildVerifyPage(blocks, mermaidJs));
  let dump = '';
  try {
    dump = execFileSync(browser,
      ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=10000',
       '--dump-dom', 'file://' + tmp],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
  }
  return { browser, blocks, results: parseVerifyResult(dump) };
}
```

Add `runVerify` to `module.exports`. Then add the CLI branch at the **top** of the `if (require.main === module)` block (before the existing `--static` check):

```js
  if (argv[0] === '--verify') {
    const [, inPath, outPath] = argv;
    if (!inPath) {
      console.error('usage: mermaid-preview.js --verify <input.md> [out.html]');
      process.exit(1);
    }
    const r = runVerify(inPath);
    if (r.browser === null) {
      const { lintMarkdown } = require('./mermaid-lint.js'); // lazy: avoids require cycle
      const errs = lintMarkdown(fs.readFileSync(inPath, 'utf8'));
      if (errs.length) {
        for (const e of errs) console.error(e);
        console.error('mermaid-verify: lint errors (render not verified)');
        process.exit(1);
      }
      console.log('mermaid-verify: render NOT verified — no browser found (lint clean)');
      process.exit(0);
    }
    if (!r.results) {
      console.error('mermaid-verify: could not read render result from the browser');
      process.exit(1);
    }
    const failed = r.results.map((x, i) => ({ i, x })).filter(o => !o.x.ok);
    if (failed.length || r.results.length < r.blocks.length) {
      for (const o of failed) console.error(`Diagram ${o.i + 1} failed to render: ${o.x.error}`);
      if (r.results.length < r.blocks.length) {
        console.error(`only ${r.results.length}/${r.blocks.length} diagrams produced output`);
      }
      console.error('mermaid-verify: render FAILED');
      process.exit(1);
    }
    if (outPath) {
      const abs = path.resolve(outPath);
      fs.writeFileSync(abs, renderStaticSvgPage(r.results.map(x => x.svg), { title: path.basename(outPath) }));
      console.log(`mermaid-verify: ${r.results.length} diagram(s) rendered — wrote ${abs} (JS-free; open directly).`);
    } else {
      console.log(`mermaid-verify: ${r.results.length} diagram(s) rendered OK.`);
    }
    process.exit(0);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mermaid-preview.test.js`
Expected: PASS. The no-browser tests run everywhere; the integration test runs only where a browser exists (otherwise reported as skipped).

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/*.test.js`
Expected: All pass / skipped; no failures.

- [ ] **Step 6: Commit**

```bash
git add plugins/product-design-suite/scripts/mermaid-preview.js tests/mermaid-preview.test.js
git commit -m "feat(mermaid-preview): --verify mode renders headlessly and names failing diagrams (007 #1/#4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rewire the SAD/SDD diagram gate + C4 reactive fallback (Issues 2 + 4)

**Files:**
- Modify: `plugins/product-design-suite/skills/egp-sad-builder/SKILL.md` (step 5 / approval-bar block, lines ~44-65)
- Modify: `plugins/product-design-suite/skills/egp-sdd-builder/SKILL.md` (its analogous diagram-gate text)
- Test: `tests/sad-conventions.test.js`

**Interfaces:**
- Consumes (Task 3): the `mermaid-preview.js --verify <scratch.md>` CLI and its exit-code contract.
- Produces: gate wording that requires a successful `--verify` (or the explicit no-browser path) before the approval link is presented, plus the C4-failure fallback rule.

- [ ] **Step 1: Write the failing test**

Add to `tests/sad-conventions.test.js`:

```js
test('egp-sad-builder requires render-verify before the approval link and a C4 fallback (007)', () => {
  const s = read('skills/egp-sad-builder/SKILL.md');
  assert.match(s, /--verify/, 'gate must run mermaid-preview.js --verify');
  assert.match(s, /render NOT verified|no browser found/, 'must document the no-browser fallback');
  assert.match(s, /flowchart[^\n]*subgraph|subgraph[^\n]*boundar/i, 'must document the C4→flowchart fallback');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sad-conventions.test.js`
Expected: FAIL — `--verify` not present in the skill text.

- [ ] **Step 3: Edit `egp-sad-builder/SKILL.md`**

In step 5, replace the approval-bar paragraph that currently reads (lines ~59-65, beginning "Start the server, present the `markdown_link`…") so that verification precedes the link. The block must end up containing:

```markdown
   **Verify the render before presenting the link (007 #1/#4).** Before serving the
   preview, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mermaid-preview.js" --verify <scratch.md>`.
   - Exit 0 with "N diagram(s) rendered OK" → every block rendered; proceed to serve
     the preview and present the `markdown_link` as a clickable Markdown link for approval.
   - Exit 1 with "Diagram N failed to render: …" → a block did not parse. Fix it and
     re-verify. **Do NOT present an approval link for a failed render** — server-up is
     not the success signal; a verified render is.
   - "render NOT verified — no browser found" → no system browser is installed; the lint
     ran instead. Present the link but tell the reviewer the figures were **not**
     render-verified in this environment.

   **C4 fallback (007 #2):** if `--verify` names a `C4Context`/`C4Container` block as
   failed, substitute a `flowchart`-with-`subgraph` boundaries equivalent for that block,
   re-verify, and tell the user you fell back from C4. Leave C4 blocks that verify intact.

   For a portable artifact, pass an output path to capture the JS-free static page in the
   same step: `mermaid-preview.js --verify <scratch.md> <out.html>` writes it from the
   rendered SVGs (this closes the former manual `--static` capture step).
```

Keep the existing "clickable Markdown link, never a raw URL" requirement.

- [ ] **Step 4: Mirror the change in `egp-sdd-builder/SKILL.md`**

Find the SDD builder's diagram-preview/approval paragraph (it references `mermaid-preview.js` / `start-server.sh`) and insert the same **Verify the render before presenting the link** and **C4 fallback** wording, adjusted to the SDD's scratch-file phrasing. The `--verify` command and the three exit-state bullets must be identical.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/sad-conventions.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/product-design-suite/skills/egp-sad-builder/SKILL.md plugins/product-design-suite/skills/egp-sdd-builder/SKILL.md tests/sad-conventions.test.js
git commit -m "docs(builders): gate requires render-verify; C4 reactive fallback (007 #2/#4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Interactive gap checkpoint in derive-then-confirm (Issue 5)

**Files:**
- Modify: `plugins/product-design-suite/shared/references/questioning-protocol.md`
- Modify: `plugins/product-design-suite/skills/egp-sad-builder/SKILL.md` (finalize step 8 — gate finalize-with-gaps on the checkpoint)
- Test: `tests/sad-conventions.test.js`

**Interfaces:**
- Produces: protocol text making the "continue resolving gaps or finalize now?" prompt an explicit interactive question (host question UI) fired on the 4-question cadence AND before finalizing any document with unresolved gaps — in derive-then-confirm and batch modes, not only greenfield.

- [ ] **Step 1: Write the failing test**

Add to `tests/sad-conventions.test.js`:

```js
test('questioning-protocol mandates an interactive finalize-with-gaps checkpoint (007 #5)', () => {
  const s = read('shared/references/questioning-protocol.md');
  assert.match(s, /before finaliz/i, 'must require a checkpoint before finalizing with gaps');
  assert.match(s, /interactive|question UI|multiple-choice/i, 'checkpoint must be an explicit interactive prompt');
  assert.match(s, /derive-then-confirm|batch/i, 'must apply beyond greenfield');
});
```

(`read` and the `shared/...` path resolution already exist in this test file; confirm `read` resolves `shared/references/...` — the helper joins from the plugin root, same root used for `skills/...`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sad-conventions.test.js`
Expected: FAIL — "before finaliz" not present.

- [ ] **Step 3: Edit `questioning-protocol.md`**

After the derive-then-confirm section (after line 43, before "## The one-confirmation-batch contract"), add:

```markdown
## Interactive gap checkpoint (007 #5)

The "Continue resolving gaps, or finalize now?" decision is an **explicit
interactive prompt** — asked through the host's question / multiple-choice UI,
never a sentence buried in prose. It fires:

- on the 4-question cadence (Rule 4 above), **and**
- **mandatorily before finalizing any document that still has unresolved gaps** —
  including in derive-then-confirm and batch / derive-all modes, not only greenfield.

Even when a builder has derived every section it can, it MUST still ask the
genuine-gap questions interactively rather than only listing them in Open
Questions. Finalizing with gaps open is recorded in Open Questions only **after**
the user is asked and chooses to finalize — it is never the default.
```

Also extend Rule 4 (line 12) so the pause explicitly references the interactive prompt: append to the sentence "— ask this through the host's question UI, not as prose."

- [ ] **Step 4: Edit `egp-sad-builder/SKILL.md` finalize step**

In step 8 ("On finalize, …"), insert before writing the file: "Before finalizing with any unresolved gap, run the interactive gap checkpoint (see `questioning-protocol.md` → *Interactive gap checkpoint*); finalize with gaps only on the user's explicit choice."

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/sad-conventions.test.js`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `node --test tests/*.test.js`
Expected: All pass / skipped; no failures.

- [ ] **Step 7: Commit**

```bash
git add plugins/product-design-suite/shared/references/questioning-protocol.md plugins/product-design-suite/skills/egp-sad-builder/SKILL.md tests/sad-conventions.test.js
git commit -m "docs(protocol): explicit interactive gap checkpoint before finalize (007 #5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full suite once more: `node --test tests/*.test.js` — expect zero failures.
- [ ] Manual smoke (where a browser exists): write a scratch `.md` with one valid and one broken Mermaid block; run `node plugins/product-design-suite/scripts/mermaid-preview.js --verify scratch.md` and confirm it exits 1 and names the broken diagram.
- [ ] Confirm no `node_modules` / `package.json` was added (zero-dependency constraint held): `git status --porcelain | grep -E 'package(-lock)?\.json|node_modules' || echo clean`.
