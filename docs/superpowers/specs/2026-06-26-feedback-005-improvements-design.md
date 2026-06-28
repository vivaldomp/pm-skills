# Design — feedback-005 improvements (`product-design-suite`)

**Date:** 2026-06-26
**Source:** `docs/feedbacks/005-improvements.md`
**Approach:** zero-dependency (no `package.json`/`node_modules` introduced)

## Context & verification

The feedback was written against `v0.1.1`. Two claims were checked against
current `master` before scoping:

- **#2b (inlined preview "breaks", `mermaid is not defined`) is NOT reproducible.**
  Served over HTTP and loaded in a real browser, the current `mermaid-preview.js`
  output renders: `typeof mermaid === 'object'`, one `<svg>` produced, no
  `Syntax error` (only a harmless favicon 404). The "switch to external `src`"
  rewrite is therefore dropped — it would add complexity (serving the 3.2 MB
  vendor file through the preview server) with no benefit.
- **Hard constraint: the plugin is strictly zero-dependency.** No `package.json`,
  no `node_modules`, mermaid is vendored, tests run on bare `node --test`. The
  feedback's #2 recommendation (`@mermaid-js/parser` / `jsdom` / Playwright) would
  break that model and the CI story, so it is out of scope (see Skipped).

#1, #3, and #4 were confirmed present in current code.

## Decisions

- Close the "broken diagram reached UAT" bug class **without a new dependency**:
  strengthen the rule-based lint (#1, #3) and make the browser preview + approval
  **mandatory for all diagrams** (P0/#6).
- Include polish items #8, #9, #7.
- Drop #2 (dependency gate) and #2b (not reproducible).

## Changes

### 1. `skills/egp-sdd-builder/SKILL.md` — P0, #6, #9 (prose only)

- **Mandatory preview + approval for every diagram.** Remove the derived-diagram
  batch-confirm exemption *for diagrams* from Step 4 (B1/B3). The builder must
  start the preview server, render, print the `http://…` URL, and **stop for
  explicit approval** before writing any ` ```mermaid ` block into `sdd.md` —
  derived diagrams included. Section *text* keeps derive-then-confirm; only
  diagrams lose the exemption.
- **Author-time footgun notes** in the diagram guidance: node-label line breaks
  use `<br/>` with the label quoted (never literal `\n`); no `;` inside
  `sequenceDiagram` statement lines.
- **#9:** when a template subsection is inapplicable (e.g. Backend for Frontend),
  emit a `n/a` stub for its heading rather than omitting it, so
  `validate-structure` (warn-level) stays quiet. No code change.

### 2. `scripts/mermaid-lint.js` — #1, #3 (+ tests)

- **#1:** inside a `sequenceDiagram` block, flag `;` on **any** non-empty
  statement line (notes, `alt`/`loop`/`par`/`opt`/`activate`), not only arrow
  message lines. Exclude the diagram-type line itself.
- **#3:** inside `graph`/`flowchart` blocks, flag a literal `\n` occurring inside
  a `[...]` / `(...)` / `{...}` node label.
- Both remain deliberately heuristic. Keep/extend the `// ponytail:`-style note
  that this is not a parser; ceiling = a real parser only if a dependency is ever
  permitted.

### 3. `scripts/lint-ids.js` — #4 (→ #5 auto-resolves) (+ tests)

- Before computing **definitions** (`tableDefIds` / `defSeen`):
  - strip the three generated marker blocks from the text —
    `COVERAGE-INDEX:START..END`, `ADR-INDEX:START..END`, `ADR-STATUS:START..END`;
  - skip the generated file `traceability.md` entirely.
- Only *authored* duplicate definitions then count toward
  `definitionDuplicates`, so a valid generated doc set reaches a green gate.
- Cross-doc *mentions* (`duplicates`, informational) are unchanged.
- **#5** needs no further change: `consistency-gate.js` already classifies checks
  into `error` vs `warn` and only fails on `error`; once #4 stops false-flagging,
  a valid doc set passes.

### 4. `#8` dates — builder SKILLs (prose)

- Add one guard line, surfaced in the prd/srs/sad/sdd/adr builders (prefer a
  single shared reference line referenced by each): never fabricate front-matter
  `date:`; if a date is not supplied by the workflow/context, ask the user or use
  the real current date — do not guess.

### 5. `#7` import steps — doc only

- Root cause is host-specific (a skill not emitting its body on invocation), not a
  reproducible code bug. Add a one-line fallback note to the import skill: if a
  skill does not present its steps on invocation, read its `SKILL.md` directly.

## Verification

- `node --test tests/*.test.js` is green.
- New test cases:
  - `tests/mermaid-lint.test.js`: a `;` inside a `Note over` line is flagged (#1);
    a literal `\n` inside a flowchart node label is flagged (#3).
  - `tests/lint-ids.test.js`: an ID appearing only inside a generated marker block
    and/or only in `traceability.md` is **not** reported as a duplicate definition
    (#4), while a genuine authored duplicate still is.

## Skipped (with rationale)

- **#2** headless parse/render gate — requires a Node dependency; conflicts with
  the zero-dependency model. Covered instead by strengthened lint (#1/#3) plus the
  now-mandatory browser review (P0/#6).
- **#2b** external-`src` preview — inline preview verified rendering correctly on
  current `master`; nothing to fix.
