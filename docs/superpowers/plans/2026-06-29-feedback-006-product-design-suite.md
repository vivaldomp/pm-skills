# Feedback 006 — product-design-suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every improvement in `docs/feedbacks/006-improvements.md` — fix the diagram-serving corruption and the erDiagram lint false-positive, and harden the skills (mandatory clickable diagram gate, static-SVG artifact, ID ownership rule, import reconciliation pass, batch authoring, output-language setting, skill-step presentation, stop-server ergonomics).

**Architecture:** Five script changes (TDD with unit tests) plus six documentation changes to the skill/template Markdown. Scripts live in `plugins/product-design-suite/scripts/`; skills in `plugins/product-design-suite/skills/<name>/SKILL.md`; templates in `plugins/product-design-suite/shared/templates/`. Tests are Node's built-in `node:test`.

**Tech Stack:** Node.js (`node:test`, no framework), Bash, Markdown skills/templates.

## Global Constraints

- Run any single test file with: `node --test tests/<file>.test.js`. Run the whole suite with: `node --test tests/*.test.js`.
- No new runtime dependencies. Scripts stay dependency-free (the existing code is pure `node:` builtins + Bash).
- Static-SVG is "assemble" mode only — no bundled headless browser (puppeteer/mmdc).
- `markdown_link` label is generic English (`Open diagram preview`); builders localize via the output-language setting.
- Commit after each task. Branch is `feat/pm-feedback-006` (already created off `master`).
- For doc-only tasks, "verify" = a `grep` that the new wording landed + `node --test tests/*.test.js` stays green (the `*-conventions.test.js` structure tests must not regress).

---

### Task 1: Fix preview-server `$`-corruption (006 A1)

Root cause: `String.prototype.replace(needle, stringReplacement)` interprets `$&`/`` $` ``/`$'`/`$$` in the replacement. The served HTML inlines the 3.3 MB Mermaid bundle (full of `$`); passed as the *replacement* argument it gets corrupted → Mermaid never defines its global → every diagram breaks.

**Files:**
- Modify: `plugins/product-design-suite/scripts/preview-server.cjs:242` (`wrapInFrame`), `:391` (`</body>` injection), and `module.exports` block (`:694-701`)
- Test: `tests/preview-server.test.js`

**Interfaces:**
- Produces: `wrapInFrame(content: string): string` exported from `preview-server.cjs`.

- [ ] **Step 1: Write the failing test**

Add to `tests/preview-server.test.js` (after the existing tests):

```js
const srv = require('../plugins/product-design-suite/scripts/preview-server.cjs');

test('wrapInFrame inserts content verbatim even with $ replacement patterns (006 A1)', () => {
  const content = 'before ${e} $& $` $\' $$ <svg id="x">ok</svg> after';
  const html = srv.wrapInFrame(content);
  assert.ok(html.includes(content), 'content with $-sequences must appear verbatim, not interpreted');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview-server.test.js`
Expected: FAIL — `srv.wrapInFrame is not a function` (not yet exported).

- [ ] **Step 3: Make the fixes**

In `preview-server.cjs`, change `wrapInFrame` (line 242) to a function replacer:

```js
function wrapInFrame(content) {
  return renderBranding(frameTemplate).replace('<!-- CONTENT -->', () => content);
}
```

Change the `</body>` injection (line 391) to a function replacer:

```js
      html = html.replace('</body>', () => helperInjection + '\n</body>');
```

Add `wrapInFrame` to `module.exports` (the object at line 694):

```js
module.exports = {
  computeAcceptKey,
  encodeFrame,
  decodeFrame,
  browserLauncherForPlatform,
  wrapInFrame,
  OPCODES,
  MAX_FRAME_PAYLOAD_BYTES
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview-server.test.js`
Expected: PASS (all tests, including the existing `--check` parse test).

- [ ] **Step 5: Commit**

```bash
git add tests/preview-server.test.js plugins/product-design-suite/scripts/preview-server.cjs
git commit -m "fix(preview-server): function replacers so \$-sequences in served HTML are inert (006 A1)"
```

---

### Task 2: mermaid-lint erDiagram cardinality (006 C)

`erDiagram` cardinality tokens (`o{`, `}o`) are not block braces, but `lintBlock` counts `{`/`}` globally → valid erDiagrams fail with `unbalanced {}`.

**Files:**
- Modify: `plugins/product-design-suite/scripts/mermaid-lint.js:16-20`
- Test: `tests/mermaid-lint.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/mermaid-lint.test.js`:

```js
test('erDiagram with crow-foot cardinality is not flagged as unbalanced braces (006 C)', () => {
  const errs = m.lintBlock('erDiagram\n  telemetry_raw ||..o{ telemetry_summary : aggregates\n  user }o..|| account : owns');
  assert.ok(!errs.some(e => /unbalanced/.test(e)), `erDiagram cardinality must not trip brace check: ${errs.join(', ')}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mermaid-lint.test.js`
Expected: FAIL — an `unbalanced {}` error is present.

- [ ] **Step 3: Skip brace balancing for erDiagram**

In `mermaid-lint.js`, replace the bracket-balance loop (lines 16-20) so `{`/`}` is skipped for erDiagram:

```js
  // Deliberately-lightweight heuristic: counts all bracket pairs without parsing node-label content.
  // erDiagram cardinality uses brace tokens (o{, }o, |{, }|) that are NOT block braces, so skip {} there (006 C).
  const isEr = /^erDiagram\b/.test(lines[0]);
  const pairs = isEr ? [['[', ']'], ['(', ')']] : [['[', ']'], ['(', ')'], ['{', '}']];
  for (const [open, close] of pairs) {
    const o = (src.match(new RegExp('\\' + open, 'g')) || []).length;
    const c = (src.match(new RegExp('\\' + close, 'g')) || []).length;
    if (o !== c) errs.push(`unbalanced ${open}${close} (${o} open, ${c} close)`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mermaid-lint.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add tests/mermaid-lint.test.js plugins/product-design-suite/scripts/mermaid-lint.js
git commit -m "fix(mermaid-lint): skip {} balance check for erDiagram cardinality tokens (006 C)"
```

---

### Task 3: Static-SVG assemble mode in mermaid-preview (006 A2)

Add a JS-free page builder from already-rendered SVG strings (the portable artifact the agent hand-built). No renderer — input is captured SVGs.

**Files:**
- Modify: `plugins/product-design-suite/scripts/mermaid-preview.js` (add function, export, CLI branch)
- Test: `tests/mermaid-preview.test.js`

**Interfaces:**
- Produces: `renderStaticSvgPage(svgs: string[], opts?: {title?: string}): string` — self-contained HTML, one `<figure>` per SVG, **no `<script>`**.
- CLI: `mermaid-preview.js --static <out.html> <a.svg> <b.svg> ...` reads each SVG file in argv order and writes the assembled page.

- [ ] **Step 1: Write the failing test**

Add to `tests/mermaid-preview.test.js`:

```js
test('renderStaticSvgPage builds a JS-free page, one figure per svg (006 A2)', () => {
  const html = m.renderStaticSvgPage(['<svg id="a">A</svg>', '<svg id="b">B</svg>'], { title: 'Diagrams' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.equal((html.match(/<figure>/g) || []).length, 2);
  assert.ok(html.includes('<svg id="a">A</svg>'));
  assert.ok(html.includes('<svg id="b">B</svg>'));
  assert.ok(!/<script/i.test(html), 'static page must contain no script');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mermaid-preview.test.js`
Expected: FAIL — `m.renderStaticSvgPage is not a function`.

- [ ] **Step 3: Implement the function, export, and CLI branch**

In `mermaid-preview.js`, add after `renderPreview` (before `module.exports`):

```js
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
```

Update the export line:

```js
module.exports = { extractMermaidBlocks, renderPreview, renderStaticSvgPage };
```

Add a `--static` branch at the top of the `require.main === module` block (after `const [inPath, outPath] = process.argv.slice(2);` — restructure so `--static` is handled first):

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mermaid-preview.test.js`
Expected: PASS (all tests, including the existing CLI tests).

- [ ] **Step 5: Commit**

```bash
git add tests/mermaid-preview.test.js plugins/product-design-suite/scripts/mermaid-preview.js
git commit -m "feat(mermaid-preview): JS-free static-SVG assemble mode + --static CLI (006 A2)"
```

---

### Task 4: markdown_link in server JSON (006 B2)

Give the agent a ready-made clickable Markdown link so it can't mis-format the raw URL.

**Files:**
- Modify: `plugins/product-design-suite/scripts/preview-server.cjs` (`onListen` JSON at `:659-663`, and a `markdownLink()` helper near `companionUrl` at `:264`, plus `module.exports`)
- Test: `tests/preview-server.test.js`

**Interfaces:**
- Produces: `markdownLink(): string` returning `` `[Open diagram preview](<companionUrl()>)` ``; the `server-started` JSON gains a `markdown_link` field.

- [ ] **Step 1: Write the failing test**

Add to `tests/preview-server.test.js`:

```js
test('markdownLink wraps the companion URL as a clickable Markdown link (006 B2)', () => {
  const link = srv.markdownLink();
  assert.match(link, /^\[Open diagram preview\]\(http:\/\/.+\)$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview-server.test.js`
Expected: FAIL — `srv.markdownLink is not a function`.

- [ ] **Step 3: Add the helper, JSON field, and export**

In `preview-server.cjs`, add after `companionUrl()` (line 266):

```js
function markdownLink() {
  return '[Open diagram preview](' + companionUrl() + ')';
}
```

In `onListen`, add `markdown_link` to the info object (line 659-663):

```js
    const info = JSON.stringify({
      type: 'server-started', port: Number(PORT), host: HOST,
      url_host: URL_HOST, url: companionUrl(), markdown_link: markdownLink(),
      screen_dir: CONTENT_DIR, state_dir: STATE_DIR, idle_timeout_ms: IDLE_TIMEOUT_MS
    });
```

Add `markdownLink` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview-server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/preview-server.test.js plugins/product-design-suite/scripts/preview-server.cjs
git commit -m "feat(preview-server): emit ready-to-use markdown_link in server-started JSON (006 B2)"
```

---

### Task 5: stop-server --latest / no-arg mode (006 H2)

Let the agent stop "the server I started" without hunting the session dir out of the start JSON.

**Files:**
- Modify: `plugins/product-design-suite/scripts/stop-server.sh:9-14` (arg handling)
- Test: `tests/stop-server.test.js` (new)

**Interfaces:**
- Behavior: `stop-server.sh` with no positional dir, or `--latest`, resolves the newest session dir (`<project>/.product/preview/*` when `--project-dir <path>` is given, else `/tmp/pds-preview-*`) by `state/server.pid` mtime, then stops it. Explicit `stop-server.sh <session_dir>` still works.

- [ ] **Step 1: Write the failing test**

Create `tests/stop-server.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const STOP = 'plugins/product-design-suite/scripts/stop-server.sh';

test('stop-server.sh --latest resolves and stops the newest session (006 H2)', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'pds-proj-'));
  const stateDir = path.join(proj, '.product', 'preview', 'sess1', 'state');
  fs.mkdirSync(stateDir, { recursive: true });

  const idArg = 'a'.repeat(40); // matches [A-Za-z0-9_-]{32,64}
  const child = cp.spawn('node', ['-e', 'setInterval(()=>{}, 1e9)', `--pds-server-id=${idArg}`], { detached: true, stdio: 'ignore' });
  child.unref();
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(child.pid));
  fs.writeFileSync(path.join(stateDir, 'server-instance-id'), idArg);

  const r = cp.spawnSync('bash', [STOP, '--latest', '--project-dir', proj], { encoding: 'utf8' });
  assert.match(r.stdout, /"status": "stopped"/, r.stdout + r.stderr);

  // process is gone
  let alive = true;
  try { process.kill(child.pid, 0); } catch (e) { alive = false; }
  assert.equal(alive, false, 'sleeper process should be killed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stop-server.test.js`
Expected: FAIL — current script prints the usage error (no `--latest`/`--project-dir` handling), status is not `stopped`.

- [ ] **Step 3: Add resolution to stop-server.sh**

Replace lines 9-14 (`SESSION_DIR="$1"` … the usage `if` block) with:

```bash
# Resolve the session dir. Accepts an explicit positional <session_dir> (back-compat),
# or --latest / no args to pick the newest session under a search root (006 H2).
PROJECT_DIR=""
SESSION_DIR=""
WANT_LATEST="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --latest)      WANT_LATEST="true"; shift ;;
    *)             SESSION_DIR="$1"; shift ;;
  esac
done

resolve_latest() {
  local root="$1" d mt newest="" newest_mt=0
  shopt -s nullglob
  local candidates=()
  if [[ -n "$root" ]]; then candidates=("$root"/.product/preview/*/); else candidates=(/tmp/pds-preview-*/); fi
  for d in "${candidates[@]}"; do
    d="${d%/}"
    [[ -f "$d/state/server.pid" ]] || continue
    mt="$(stat -c %Y "$d/state/server.pid" 2>/dev/null || stat -f %m "$d/state/server.pid" 2>/dev/null || echo 0)"
    if (( mt >= newest_mt )); then newest_mt="$mt"; newest="$d"; fi
  done
  printf '%s\n' "$newest"
}

if [[ -z "$SESSION_DIR" || "$WANT_LATEST" == "true" ]]; then
  SESSION_DIR="$(resolve_latest "$PROJECT_DIR")"
  if [[ -z "$SESSION_DIR" ]]; then
    echo '{"status": "not_running", "note": "no session found"}'
    exit 0
  fi
fi
```

Also update the usage comment at the top (lines 2-3) to mention `[--latest] [--project-dir <path>]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/stop-server.test.js`
Then the regression guard: `node --test tests/preview-server.test.js` (it asserts stop-server.sh carries no `bare server.cjs` / no upstream identity — must stay green).
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add tests/stop-server.test.js plugins/product-design-suite/scripts/stop-server.sh
git commit -m "feat(stop-server): --latest / no-arg mode resolves newest session (006 H2)"
```

---

### Task 6: Reconciliation pass in egp-import (006 E)

`egp-import` has no concept of the source being partially obsolete vs. decisions made elsewhere. Add an optional reconciliation pass that produces a first-class overlay + supersedes links.

**Files:**
- Modify: `plugins/product-design-suite/skills/egp-import/SKILL.md` (Steps list + Outputs section)
- Test: none new (doc); guard with `tests/import-conventions.test.js` via the full suite.

- [ ] **Step 1: Add the reconciliation step**

In `egp-import/SKILL.md`, insert a new step in the Steps list, between "Map to templates" (step 3) and "Write gap report" (step 4), and renumber:

```markdown
4. **Reconcile against prior decisions (optional — 006 E).** When prior decisions
   (existing `.product/adr/*`, a prior `.product/`, or user-supplied "these
   decisions override the source") contradict the source, treat the source as
   partially obsolete. For each conflict, record which decision supersedes which
   source content. Do NOT carry superseded source content forward into any builder.
```

- [ ] **Step 2: Add the overlay output**

In the Outputs section of `egp-import/SKILL.md` (where `import-gap-report.md` and `import-map.json` are described), add:

```markdown
- **Reconciliation Overlay** (in `import-gap-report.md`): a first-class section
  listing each `source content → superseded by → decision (ADR-NNN / override)`
  conflict, with the resolved truth the builders must use.
- `import-map.json`: each affected target gains a `supersedes` array
  (`[{ "source": "<obsolete claim>", "by": "ADR-NNN | override", "resolved": "<truth>" }]`),
  mirroring the ADR supersedes/amends machinery. Builders MUST honor it.
```

- [ ] **Step 3: Verify**

Run: `grep -q 'Reconciliation Overlay' plugins/product-design-suite/skills/egp-import/SKILL.md && echo OK`
Expected: `OK`
Run: `node --test tests/*.test.js`
Expected: all pass (no regression).

- [ ] **Step 4: Commit**

```bash
git add plugins/product-design-suite/skills/egp-import/SKILL.md
git commit -m "docs(egp-import): optional reconciliation pass + supersedes overlay (006 E)"
```

---

### Task 7: Output-language setting (006 G)

Make output language a workflow setting every builder reads, instead of a per-prompt rule.

**Files:**
- Modify: `plugins/product-design-suite/skills/egp-import/SKILL.md` (import-state.json fields), `egp-product-workflow/SKILL.md` (set the fields), and each builder: `egp-prd-builder`, `egp-srs-builder`, `egp-sad-builder`, `egp-sdd-builder`, `egp-adr-builder` `SKILL.md` (read the fields)
- Test: none new (doc); full suite guard.

- [ ] **Step 1: Document the fields in egp-import**

In `egp-import/SKILL.md`, in the `import-state.json` description, add the two fields:

```markdown
- `outputLanguage` (optional, e.g. `"pt-BR"`): language for all prose output.
- `codeAndJargon` (optional, e.g. `"en"`): language to keep identifiers, code,
  and technical jargon in. Absent → builders match the user's language.
```

- [ ] **Step 2: Make the workflow set them**

In `egp-product-workflow/SKILL.md`, in the initialization/Rules section, add:

```markdown
- **Output language (006 G):** Ask once for the output language and write
  `outputLanguage` (and `codeAndJargon` if jargon/code should stay in another
  language) into `.product/import-state.json`. Every builder reads these — do not
  repeat the language rule per dispatch.
```

- [ ] **Step 3: Make every builder read them**

Add this identical line to the Rules section of each builder SKILL.md (`egp-prd-builder`, `egp-srs-builder`, `egp-sad-builder`, `egp-sdd-builder`, `egp-adr-builder`):

```markdown
- **Output language (006 G):** If `.product/import-state.json` has `outputLanguage`,
  write all prose in it; if it has `codeAndJargon`, keep identifiers, code, and
  technical jargon in that language. Absent → match the user's language.
```

- [ ] **Step 4: Verify**

Run:
```bash
for f in prd srs sad sdd adr; do grep -q 'Output language (006 G)' plugins/product-design-suite/skills/egp-${f}-builder/SKILL.md || echo "MISSING $f"; done; echo done
```
Expected: `done` with no `MISSING` lines.
Run: `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/product-design-suite/skills/egp-import/SKILL.md plugins/product-design-suite/skills/egp-product-workflow/SKILL.md plugins/product-design-suite/skills/egp-*-builder/SKILL.md
git commit -m "docs: output-language setting read by every builder (006 G)"
```

---

### Task 8: Duplicate-ID ownership rule (006 D)

Teach builders/templates the ownership rule so they stop putting canonical IDs first-cell in reference tables (which `lint-ids` rejects as duplicate definitions).

**Files:**
- Modify: `egp-srs-builder`, `egp-sad-builder`, `egp-sdd-builder`, `egp-adr-builder` `SKILL.md` (Rules); `shared/templates/srs-template.md`, `sad-template.md`, `sdd-template.md` (note above cross-doc tables)
- Test: none new (doc); full suite guard (`traceability-conventions.test.js`, `id-conventions.test.js`).

- [ ] **Step 1: Add the ownership rule to the builders**

Add this block to the Rules section of each of `egp-srs-builder`, `egp-sad-builder`, `egp-sdd-builder`, `egp-adr-builder` SKILL.md:

```markdown
- **ID ownership (006 D):** Only the **owning** document puts an ID in a first
  table cell — SRS owns `FR`/`NFR`, SAD owns `AR`, each ADR owns itself.
  **Referencing** documents cite IDs in prose or in a **non-first column**. Any
  cross-doc reference/coverage table MUST be wrapped in generated markers
  (`COVERAGE-INDEX` / `ADR-INDEX` / `ADR-STATUS`) so `lint-ids` strips it.
```

- [ ] **Step 2: Make the SDD builder emit coverage tables generated by default**

In `egp-sdd-builder/SKILL.md`, in the section about requirement-coverage / AR-realization tables, add:

```markdown
- **Coverage tables are generated (006 D):** Emit requirement-coverage and
  AR-realization tables inside `COVERAGE-INDEX` markers (generated form), NOT as
  hand-authored first-cell ID tables. The SDD references `FR`/`NFR`/`AR`; it never
  re-defines them in a first cell.
```

- [ ] **Step 3: Annotate the templates**

In `shared/templates/sdd-template.md` (and `srs-template.md` / `sad-template.md` where a cross-doc reference/coverage table appears), add a one-line HTML comment above each such table:

```markdown
<!-- 006 D: referencing table — cite IDs in a non-first column or wrap in COVERAGE-INDEX markers; do not define IDs here. -->
```

- [ ] **Step 4: Verify**

Run:
```bash
for f in srs sad sdd adr; do grep -q 'ID ownership (006 D)' plugins/product-design-suite/skills/egp-${f}-builder/SKILL.md || echo "MISSING $f"; done; echo done
```
Expected: `done` with no `MISSING`.
Run: `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/product-design-suite/skills/egp-srs-builder/SKILL.md plugins/product-design-suite/skills/egp-sad-builder/SKILL.md plugins/product-design-suite/skills/egp-sdd-builder/SKILL.md plugins/product-design-suite/skills/egp-adr-builder/SKILL.md plugins/product-design-suite/shared/templates/srs-template.md plugins/product-design-suite/shared/templates/sad-template.md plugins/product-design-suite/shared/templates/sdd-template.md
git commit -m "docs: explicit ID-ownership rule for first-cell definitions (006 D)"
```

---

### Task 9: Mandatory clickable diagram gate + single-screen + static capture (006 B1, B2, A2-doc)

The workflow still calls preview "optional" (line 43). Make it a hard gate, document single-newest-screen, require the clickable Markdown link, and document the static-SVG capture flow in the diagram-owning builders.

**Files:**
- Modify: `egp-product-workflow/SKILL.md:43` (step 5); `egp-sdd-builder/SKILL.md` and `egp-sad-builder/SKILL.md` (approval-bar section already at sdd `:64-70`, sad `:52-58`)
- Test: none new (doc); full suite guard.

- [ ] **Step 1: Rewrite the workflow preview step**

In `egp-product-workflow/SKILL.md`, replace step 5 ("**Preview (optional)** during iteration: …") with:

```markdown
5. **Diagram approval gate (mandatory — 006 B1).** Any document containing Mermaid
   MUST have its diagrams rendered in the preview server and explicitly approved
   before the document is marked done. The SDD/SAD builders own and enforce this
   gate. Present the server's `markdown_link` field as a **clickable Markdown link —
   never a raw copy-paste URL** — and start the server with `--open` after the user
   opts into review (still print the link as a headless/remote fallback).
   The server serves only the **single newest** `.html` screen (`getNewestScreen`);
   there is no multi-screen navigation, so to review several documents' diagrams at
   once, concatenate them into one screen file.
```

- [ ] **Step 2: Add clickable-link + static-capture to the SDD builder approval bar**

In `egp-sdd-builder/SKILL.md`, in the approval-bar block (around lines 64-70), append:

```markdown
  Present the preview as a **clickable Markdown link** (the server's `markdown_link`
  field), never a raw URL. For a portable, un-breakable artifact (006 A2): once the
  diagrams render in the preview, capture each `<svg>` and assemble a JS-free page
  with `mermaid-preview.js --static <out.html> <a.svg> ...`.
```

- [ ] **Step 3: Add the same to the SAD builder approval bar**

Apply the identical append to `egp-sad-builder/SKILL.md`'s approval-bar block (around lines 52-58).

- [ ] **Step 4: Verify**

Run:
```bash
grep -q 'Diagram approval gate (mandatory — 006 B1)' plugins/product-design-suite/skills/egp-product-workflow/SKILL.md && \
grep -q 'clickable Markdown link' plugins/product-design-suite/skills/egp-sdd-builder/SKILL.md && \
grep -q 'clickable Markdown link' plugins/product-design-suite/skills/egp-sad-builder/SKILL.md && echo OK
```
Expected: `OK`
Run: `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/product-design-suite/skills/egp-product-workflow/SKILL.md plugins/product-design-suite/skills/egp-sdd-builder/SKILL.md plugins/product-design-suite/skills/egp-sad-builder/SKILL.md
git commit -m "docs: mandatory clickable diagram gate, single-screen note, static capture (006 B1/B2/A2)"
```

---

### Task 10: Batch / derive-all mode + dependency order (006 F)

Document the inter-document dependency order and an opt-in batch mode.

**Files:**
- Modify: `egp-product-workflow/SKILL.md` (new section after the dispatch steps)
- Test: none new (doc); full suite guard.

- [ ] **Step 1: Add the batch-mode section**

In `egp-product-workflow/SKILL.md`, add a new section (after the Steps list):

```markdown
## Batch / derive-all mode (opt-in, 006 F)

Default mode is interactive derive-then-confirm, one builder at a time. For a full
suite, the user may request **batch / derive-all** mode:

- **Dependency order is explicit:** ADRs → SRS/SAD → SDD/PRD. ADR IDs must exist
  before docs cite them; the SAD mints `AR-NNN` the SDD references; the SRS owns
  `FR`/`NFR` the PRD/SDD reference. Author in this order.
- **Author derivable content first.** Produce everything derivable from the source +
  prior decisions without stopping, then surface the **consolidated** gap questions
  once at the end instead of interrupting per document.
- **Safe to parallelize across non-conflicting files** (different target docs),
  provided the dependency order above is respected. Still run the diagram approval
  gate (step 5) and the consistency gate before marking the suite done.
```

- [ ] **Step 2: Verify**

Run: `grep -q 'Batch / derive-all mode (opt-in, 006 F)' plugins/product-design-suite/skills/egp-product-workflow/SKILL.md && echo OK`
Expected: `OK`
Run: `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add plugins/product-design-suite/skills/egp-product-workflow/SKILL.md
git commit -m "docs(workflow): opt-in batch/derive-all mode with explicit dependency order (006 F)"
```

---

### Task 11: Skill-step presentation (006 H1)

Generalize the 005 egp-import note so behavior doesn't depend on the host surfacing skill content.

**Files:**
- Modify: each builder `SKILL.md` (`egp-prd-builder`, `egp-srs-builder`, `egp-sad-builder`, `egp-sdd-builder`, `egp-adr-builder`) and `egp-product-workflow/SKILL.md`
- Test: none new (doc); full suite guard.

- [ ] **Step 1: Add the orchestrator rule to the workflow**

In `egp-product-workflow/SKILL.md` Rules section, add:

```markdown
- **Inline the builder's steps (006 H1):** Skill invocation output is host-dependent.
  Before dispatching a builder, if its invocation does not surface its Steps/Rules,
  read the builder's `SKILL.md` directly and follow it. Never proceed on a one-line
  launch alone.
```

- [ ] **Step 2: Add the self-note to each builder**

Add to the top of the Steps/Rules section of each builder SKILL.md:

```markdown
- **If these steps were not surfaced on invocation (006 H1):** read this `SKILL.md`
  directly and follow the Steps/Rules below — invocation output is host-dependent.
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -q '006 H1' plugins/product-design-suite/skills/egp-product-workflow/SKILL.md || echo "MISSING workflow"
for f in prd srs sad sdd adr; do grep -q '006 H1' plugins/product-design-suite/skills/egp-${f}-builder/SKILL.md || echo "MISSING $f"; done
echo done
```
Expected: `done` with no `MISSING` lines above it.
Run: `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add plugins/product-design-suite/skills/egp-product-workflow/SKILL.md plugins/product-design-suite/skills/egp-*-builder/SKILL.md
git commit -m "docs: builders state their steps; orchestrator inlines SKILL.md if silent (006 H1)"
```

---

## Final verification

- [ ] **Run the full suite**

Run: `node --test tests/*.test.js`
Expected: all tests pass, 0 fail.

- [ ] **Confirm the feedback items are covered**

Cross-check against `docs/feedbacks/006-improvements.md`: 1a/1b (Task 9), 1c (Task 1), 1d (Task 9), static-SVG (Task 3 + Task 9), erDiagram lint (Task 2), reconciliation (Task 6), duplicate IDs (Task 8), batch mode (Task 10), language (Task 7), skill-step (Task 11), stop-server (Task 5), markdown_link (Task 4).
