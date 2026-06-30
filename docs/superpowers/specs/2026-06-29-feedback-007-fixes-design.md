# feedback-007 fixes — `product-design-suite` design

Date: 2026-06-29
Source: `docs/feedbacks/007-issues.md`
Branch: `feat/pm-feedback-007`

## Context

Running the PRD → SRS → SAD → SDD → ADR workflow, the SAD diagram approval gate
served a preview whose figures rendered blank, yet the workflow still treated the
link as ready for approval. The feedback raises five issues. Root-cause
investigation before designing changed two of them:

- **Issue 2 (C4 fragility) was misdiagnosed.** The SAD template's exact
  `C4Context` and `C4Container` snippets were headless-rendered against the
  vendored Mermaid 11.15.0 and produced valid output
  (`<svg … aria-roledescription="c4">`). C4 is not inherently broken here.
  Whatever blanked the reviewer's page was a parse error in the *real* diagram
  content that nothing surfaced — which is Issue 1. The fix is render
  verification that *names* a failing block, not removing C4 from the template.
- **The plugin is deliberately zero-dependency** (vendored Mermaid, hand-rolled
  WebSocket, no `node_modules`). The feedback assumes Playwright/Puppeteer is
  available; it is not installed. A **system browser**
  (`google-chrome`/`chromium` in `--headless --dump-dom` mode) renders Mermaid to
  SVG with zero new npm dependencies and was verified to work.

### Decisions locked during brainstorming

| Decision | Choice |
| --- | --- |
| Render engine | Detect a system browser; no new npm dependency. |
| No-browser fallback | Run the static lint; if clean, present the link with a loud `render NOT verified — no browser found` marker. Workflow proceeds. |
| C4 handling | Keep C4 as the template default; verify-driven reactive fallback to a flowchart equivalent only on a real, named parse failure. |

## Scope

Five fixes, ordered cheap → keystone. The render-verifier (Fix B) is the spine:
one mechanism resolves Issues 1, 2, and 4.

Recommended implementation order: A → B → C → D (lint first so the verifier can
reuse it for the no-browser path; verifier before the C4 and gate changes that
depend on its output).

---

## Fix A — `mermaid-lint.js` accepts a file *or* a directory (Issue 3, P2)

### Problem
`lintProductDiagrams(dir)` unconditionally calls `readdirSync` on its argument
(`mermaid-lint.js:48` via the `walk` closure, entered from the `require.main`
block at line 64). A single file path throws `ENOTDIR: not a directory,
scandir …`. The SAD builder is told to write drafts to a scratch markdown file,
so it cannot lint that draft.

### Change
In `lintProductDiagrams` (or the CLI entry), branch on `statSync(arg)`:
- `isDirectory()` → walk the tree (today's behavior, unchanged).
- otherwise → lint that single file (only when it ends in `.md`).

Roughly three lines. No change to `lintBlock` / `lintMarkdown`.

### Acceptance
`node mermaid-lint.js <file.md>` lints that file; `node mermaid-lint.js <dir>`
still walks the tree. Both keep the existing exit-code contract (nonzero on
findings).

---

## Fix B — headless render-verify (Issues 1 + 4, P0/P1) — keystone

### Problem
`mermaid-preview.js` (default mode) emits raw diagram source in
`<pre class="mermaid">` and defers all rendering to the browser at load time. No
pre-render, no validation: a parse failure leaves a blank figure and surfaces
nothing. Separately, `preview-server.cjs` `onListen` emits the `markdown_link`
on `server-started` — a signal independent of whether any figure rendered
(Issue 4). The gate trusts "server up", not "diagrams rendered".

### Change
Add a `--verify <input.md>` mode to `mermaid-preview.js`:

1. **Detect a browser.** Check `CHROME_PATH`, then the first of
   `google-chrome`, `chromium`, `chromium-browser`, `chrome`, `msedge` found on
   `PATH`.
2. **Build a verify page.** Inline the vendored Mermaid and, for each extracted
   block, run `await mermaid.render(id, code)` inside `try/catch`, collecting
   `[{ ok, error, svg }]` into a single known element
   (e.g. `<pre id="__pds_result">`). We control this output format, so no
   fragile DOM scraping of Mermaid's own output is needed.
3. **Render headless.** Run
   `<browser> --headless --disable-gpu --no-sandbox --virtual-time-budget=<ms> --dump-dom file://<tmp>`,
   capture stdout, extract `#__pds_result`, `JSON.parse` it.
4. **Report.** If any block has `ok:false`, or the count of valid SVGs is less
   than the number of source blocks, **exit nonzero and name each failing
   `Diagram N` with Mermaid's parse-error text**. On success, exit zero; when an
   output path is given, write the captured SVGs so the existing
   `renderStaticSvgPage` can assemble the JS-free `--static` page. This **closes
   the `--static` capture loop** Issue 1 flagged (today `--static` needs a human
   to open the browser first).
5. **No browser found.** Run Fix A's lint over the file; if clean, exit zero but
   print a loud `render NOT verified — no browser found` marker. If lint finds
   problems, exit nonzero as lint does today.

### Gate rewiring (Issue 4)
The SAD-builder diagram-approval gate presents the preview link **only after**
`--verify` succeeds (or the explicit no-browser-warning path). The
`server-started` / `markdown_link` emission is no longer treated as the gate's
success signal. `preview-server.cjs` itself is unchanged — verify is a pre-gate
CLI step; the change is in how the builder skill sequences it.

### Acceptance
The approval gate only ever shows a link whose figures verified non-empty (or a
clearly-labelled unverified link when no browser exists). A parse failure blocks
the gate and names the offending diagram with its error.

---

## Fix C — C4 stays default; reactive fallback (Issue 2, P0/P1)

### Problem
The feedback expected C4 to be the concrete failure. It renders fine here, so the
real risk is an *unsurfaced* parse failure in real C4 content — now caught by
Fix B.

### Change
No template change. The `egp-sad-builder` skill gains one rule: **when `--verify`
reports that a C4 block failed to parse, substitute a flowchart-subgraph
equivalent for that block and tell the user** (boundaries as subgraphs). The
fallback is reactive — it fires only on a real, named failure, never
pre-emptively.

### Acceptance
A SAD never ships a blank §3/§4: if a C4 block cannot render, the builder
substitutes a rendering equivalent and tells the user. Valid C4 is left intact.

---

## Fix D — interactive gap checkpoint in derive-then-confirm (Issue 5, P1)

### Problem
`questioning-protocol.md` mandates a *"Continue answering, or finalize the
document now?"* pause every 4 questions, but in derive-then-confirm / batch mode
builders derive everything and dump remaining gaps into the **Open Questions**
table, moving on. The human checkpoint is effectively skipped; the user has to
notice the gaps themselves.

### Change
Update `questioning-protocol.md` and the builder/workflow skills so the
checkpoint is an **explicit interactive prompt via the host's question UI** (not
a sentence buried in prose), fired:
- on the existing 4-gap-question cadence, **and**
- **mandatorily before finalizing any document that still has unresolved gaps.**

When the user chooses to finalize with gaps open, they are still recorded in Open
Questions (already specified) — but the *choice* is surfaced as a question, never
taken as the default. This applies in derive-then-confirm and batch/derive-all
modes, not only greenfield.

### Acceptance
No document is finalized with open gaps unless the user was asked, in an explicit
interactive prompt, "continue resolving gaps or finalize now?" and chose to
finalize.

---

## Testing

One runnable check per non-trivial fix, under the existing
`node --test tests/*.test.js` harness:

- **Fix A:** lint a single `.md` file (asserts no `ENOTDIR`, findings reported);
  lint a directory still walks.
- **Fix B:** feed one valid block + one deliberately-broken block; assert the
  broken `Diagram N` is named and exit is nonzero. Skip when no browser is
  present (guarded). Separately assert the no-browser fallback path prints the
  `render NOT verified` marker and respects lint exit codes.

Fixes C and D are skill/reference documentation changes; covered by the existing
convention tests where they assert on skill text, otherwise verified by review.

## Out of scope (YAGNI)

- No Puppeteer/Playwright (or any new npm) dependency.
- No template restructuring; C4 stays.
- No new server endpoints or `preview-server.cjs` protocol changes — verify is a
  pre-gate CLI step.
