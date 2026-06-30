# 007 — Issues & Improvement Suggestions for `product-design-suite` (egp-product-workflow)

Context: running the PRD → SRS → SAD → SDD → ADR workflow against `PRODUCT.md`.
The SAD diagram approval gate produced a preview page, but **the diagrams did
not render** (blank figures in the browser). Below are the root-cause findings
and concrete fixes for the upstream plugin.

Environment observed:
- Plugin: `product-design-suite@0.1.1`
- Vendored Mermaid: `11.15.0` (`scripts/vendor/mermaid.min.js`)
- Node: v24.13.1
- Renderer: `scripts/mermaid-preview.js` (default, client-side mode)

---

## Issue 1 — The diagram preview is client-side-only and never verifies a successful render (P0)

### Symptom
The reviewer opens the served preview URL and sees an empty page / blank
figures. The workflow still treats the link as "ready for approval".

### Root cause
`mermaid-preview.js` (default mode) emits the raw diagram source inside
`<pre class="mermaid">` and relies on the browser to render it at load time:

```js
`<script>${mermaidJs}</script>` +
`<script>mermaid.initialize({startOnLoad:true});</script>`
```

There is **no pre-render and no validation**. If Mermaid throws while parsing a
diagram, the figure stays blank and nothing is surfaced back to the agent or the
user. The generated 3.2 MB HTML contained **zero pre-rendered diagram SVGs**
(only incidental icon SVGs from the bundle), confirming rendering is deferred
entirely to the client.

### Suggested fix
- Add a **headless render step** (e.g. Playwright/Puppeteer already available in
  the environment, or `@mermaid-js/mermaid-cli`) that renders each block to SVG
  *before* presenting the link.
- Make the **static SVG page the default** for the approval gate. The code
  already has `renderStaticSvgPage(svgs, ...)`, but it requires SVGs "captured
  from the live preview" — there is no automated capture step, so `--static`
  cannot actually be produced today without a human opening the browser first.
  Close that loop with the headless renderer.
- **Fail loudly**: if any block fails to render, the gate must NOT present an
  approval link. It should report *which* diagram failed and the parse error.

### Acceptance
The approval gate only ever shows a link whose figures are guaranteed non-empty;
a parse failure blocks the gate and names the offending diagram.

---

## Issue 2 — C4 diagram syntax (`C4Context` / `C4Container`) is fragile and likely the concrete failure here (P0/P1)

### Symptom
The SAD template defaults its §3/§4 diagrams to `C4Context` and `C4Container`.
These are the blocks that failed to render.

### Root cause
Mermaid's C4 diagram support is still flagged **experimental** and is the most
common source of silent render failures across Mermaid 11.x. The
`sad-template.md` hard-codes C4 syntax as the only option, so every SAD inherits
the most failure-prone diagram type.

### Suggested fix (pick one or combine)
- Pin and **smoke-test the vendored Mermaid version against the exact C4 snippets
  shipped in the templates** as part of plugin CI, so a Mermaid bump that breaks
  C4 is caught upstream.
- Provide a **flowchart-based C4-style fallback** (subgraphs as boundaries) in
  the template, and let the builder prefer it when C4 fails to parse.
- At minimum, document C4 as opt-in and surface a clear note when a C4 block
  fails so the agent can auto-fall-back to `flowchart`.

### Acceptance
A SAD never ships a blank §3/§4; if C4 cannot render, the workflow substitutes a
rendering equivalent and tells the user.

---

## Issue 3 — `mermaid-lint.js` crashes on a single-file path (P2)

### Symptom
Linting a single draft file throws:

```
Error: ENOTDIR: not a directory, scandir '.../sad-diagrams.md'
    at walk (scripts/mermaid-lint.js:48)
```

### Root cause
`mermaid-lint.js` assumes its argument is a directory and calls `readdirSync`
on it. It cannot lint the scratch draft the SAD builder is told to create
("write the drafts to a scratch markdown file").

### Suggested fix
Accept both a file and a directory: `statSync(arg).isDirectory()` → walk;
otherwise lint the single file. This lets the builder validate the scratch draft
before rendering.

### Acceptance
`node mermaid-lint.js <file.md>` lints that file; `<dir>` still walks the tree.

---

## Issue 4 — The approval gate trusts "server started", not "diagrams rendered" (P1)

### Symptom
`start-server.sh` returns a `markdown_link` immediately; the workflow presents it
as the approval artifact. Server-up ≠ diagrams-rendered.

### Root cause
The gate's success signal is "the preview server is serving the newest screen",
which is independent of whether Mermaid actually produced any figures.

### Suggested fix
Tie the gate's "ready" state to a **positive render signal** (SVG count > 0 and
== number of source blocks) emitted by the headless render in Issue 1. Only then
hand the link to the user.

---

## Issue 5 — Gap handling should be interactive, with an explicit "continue or finalize?" checkpoint (process, P1)

### What happened
In derive-then-confirm mode the builders derived everything and dumped the
remaining gaps into the document's **Open Questions** table, then moved on. The
user had to notice the gaps themselves. The `questioning-protocol.md` already
mandates a "Pause after every 4 questions … *Continue answering, or finalize the
document now?*" checkpoint, but in derive-then-confirm mode this checkpoint is
effectively skipped — gaps are batched silently instead of asked.

### Suggested fix
- **Always question the user about open gaps**, even in derive-then-confirm mode.
  After presenting the one confirmation batch, the builder should *actively ask*
  the genuine-gap questions rather than only listing them in a table.
- Make the **"Continue resolving gaps, or finalize now?"** checkpoint an explicit
  interactive prompt (a real question to the user, e.g. via the host's
  question/multiple-choice UI) — not a sentence buried in prose. Offer it:
  - after every N gap questions (the existing cadence), **and**
  - whenever the builder is about to finalize a document with unresolved gaps.
- When the user chooses to finalize with gaps open, record them explicitly in
  Open Questions (already specified) — but the *choice* must be the user's,
  surfaced as a question, not the default.

### Rationale
The user explicitly asked for this: the workflow should, whenever possible, ask
whether they want to keep closing gaps or stop. Today the protocol describes the
intent but the derive-then-confirm path lets builders bypass the human
checkpoint.

### Acceptance
No document is finalized with open gaps unless the user was asked, in an explicit
interactive prompt, "continue resolving gaps or finalize now?" and chose to
finalize.

---

## Summary / priority

| # | Issue | Priority | Type |
| --- | --- | --- | --- |
| 1 | Preview is client-side-only, no render verification | P0 | Tooling |
| 2 | C4 diagram syntax fragile / no fallback | P0/P1 | Templates + tooling |
| 3 | `mermaid-lint.js` crashes on a file path | P2 | Tooling |
| 4 | Gate trusts "server up", not "diagrams rendered" | P1 | Workflow |
| 5 | Gap handling must be interactive with continue/finalize checkpoint | P1 | Workflow/process |

Recommended order: 3 (quick) → 1 → 2 → 4 → 5.
