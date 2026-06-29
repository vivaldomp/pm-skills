# Feedback 006 — product-design-suite improvements

Improvement proposals for the `product-design-suite` plugin, collected from a real
end-to-end run (import → ADRs → SRS → SAD → SDD → PRD → doc-sync → consistency gate →
diagram preview) on the **Strata Control Tower** project.

Scope rule for this list: it only records things the agent had to **invent or work around
outside the explicit instructions of each skill/script** — i.e. gaps where the skills did
not tell the agent what to do, so behavior depended on the agent improvising. Content work
that was within a builder's remit is intentionally excluded.

Priority legend: **P1** = caused a broken/incorrect user-facing result · **P2** = caused
avoidable rework or inconsistency · **P3** = polish / ergonomics.

---

## P1 — Diagram preview is not presented as a clickable, validated gate (and it broke)

This is the most important item. It failed the same way more than once across sessions
(see also the older observations: *"Root endpoint returns response but missing diagram
content"*, *"Agent bypassed diagram approval gate by misinterpreting derived-diagram rule"*).

Three distinct sub-problems:

### 1a. The agent does not reliably present the preview server for validation
`egp-product-workflow` step 5 mentions the preview server as *optional* ("Preview
(optional) during iteration"). Because it reads as optional, the agent skipped it and just
wrote the rendered HTML to a temp dir the first time — the user had to push back ("você
sempre precisa abrir a preview para eu validar os diagramas").

**Proposed change:** make diagram presentation a **mandatory approval gate** in the
workflow and in `egp-sdd-builder`/`egp-sad-builder`: after authoring any document that
contains Mermaid, the skill MUST start the preview server, present it, and **block on
explicit user approval** before marking the document done. Word it as a gate, not an
option. The SDD/SAD builders should own this gate (they produce the diagrams).

### 1b. The user must be given a CLICKABLE link — not a copy-paste URL
The agent surfaced the raw URL (`http://localhost:PORT/?key=...`) as plain text and told the
user to paste it. The user explicitly does **not** want copy-paste.

**Proposed change:**
- The skill must instruct the agent to present the preview URL as a **Markdown link**
  (`[Abrir preview dos diagramas](http://localhost:PORT/?key=...)`) so the terminal renders
  it clickable. Plain-text URLs are not acceptable.
- `start-server.sh` already supports `--open` (auto-open browser). The skill should call it
  with `--open` *after* the user opts into review, and still print the clickable link as a
  fallback for headless/remote environments.
- The returned JSON from `start-server.sh` should ideally include a ready-to-use
  `markdown_link` field so the agent cannot get the formatting wrong.

### 1c. The diagrams broke / failed to render through the preview server
Confirmed in a real browser (Playwright): served through the plugin's preview server the
page threw `ReferenceError: mermaid is not defined` and `Invalid or unexpected token`, and
fragments of the Mermaid source (e.g. `${FAt}` as an `iframe sandbox` attribute, `${e}` as
fetched URLs) leaked into the DOM — i.e. all diagrams rendered broken. The **same on-disk
file served raw** (a trivial static server with no rewriting) rendered all 11 diagrams
perfectly (`window.mermaid` defined, 11 `<svg>` drawn).

Root cause is the **serving path**, not the diagrams:
- `scripts/mermaid-preview.js` inlines `vendor/mermaid.min.js` (~3.3 MB, mermaid 11.15.0,
  an esbuild bundle that sets `globalThis.mermaid` itself).
- `scripts/preview-server.cjs` post-processes the served HTML with `String.prototype.replace`
  (`html.replace('</body>', helperInjection + ...)` and the frame `replace('<!-- CONTENT -->', content)`).
  `String.replace` interprets `$`-sequences (`$&`, `` $` ``, `$'`, `$$`) in the replacement
  path, and a 3.3 MB minified Mermaid payload is full of `$` (its own `${...}` template
  literals). That corrupts the inlined script → Mermaid never defines the global → every
  diagram fails.

**Proposed changes (any one fixes it; ideally 1 + 2):**
1. In `preview-server.cjs`, never use a bare string as the replacement argument of
   `.replace()` on user/content HTML. Use a **function replacer**
   (`.replace(needle, () => injection)`) so `$` sequences in the payload are inert. Audit
   every `.replace('<!-- CONTENT -->', content)` and `.replace('</body>', ...)` for this.
2. `mermaid-preview.js` should offer (or default to) a **static-SVG render** mode: render
   each diagram to inline `<svg>` (no client-side Mermaid runtime). A JS-free page cannot be
   broken by the server's injection and renders identically everywhere. (This is exactly the
   workaround the agent had to build by hand — capturing the rendered SVGs and writing a
   JS-free `diagrams.html`.)
3. Serve content files by route (`GET /screens/<name>`) instead of only "newest screen at
   `/`", and have the agent extract diagrams to a self-contained page first.

### 1d. The server only serves the single newest screen (undocumented)
`getNewestScreen()` returns only the most recently modified `.html`; there is no multi-screen
navigation. The agent had to discover this empirically and concatenate 11 diagrams (SDD + SAD)
into one screen so they'd all show. Nothing in the skill explains this.

**Proposed change:** document the single-newest-screen behavior in the workflow's preview
step, and/or add a simple screen index/navigation to the server so multiple documents'
diagrams can be reviewed without manual concatenation.

---

## P1 — `mermaid-lint` false-positive on erDiagram crow's-foot cardinality

`scripts/mermaid-lint.js` counts `{` / `}` naively. Mermaid `erDiagram` relationship
cardinality uses brace tokens (`o{`, `}o`, e.g. `telemetry_raw ||..o{ telemetry_summary`),
which the counter reads as unbalanced block braces. The consistency gate failed with
`diagram 4: unbalanced {} (5 open, 4 close)` on a **valid** diagram. The agent had to add a
bogus balancing comment (`%% ... }`) purely to satisfy the linter — a hack that pollutes the
source and confused the user ("os diagramas estão quebrados").

**Proposed change:** make `mermaid-lint` aware of `erDiagram` — ignore braces inside
relationship/cardinality lines (the `|o`, `||`, `}o`, `}|`, `o{`, `o|` tokens), or skip brace
balancing entirely for `erDiagram` blocks. Better yet, validate by actually parsing with the
vendored Mermaid rather than counting characters.

---

## P2 — No guidance for reconciling a source doc against superseding prior decisions

The source (`PRODUCT.md`) conflicted with five later decisions that survived only in
memory/agent context (the files that held them — `CONTEXT.md`, `docs/adr/*` — were gone from
disk). `egp-import` is purely "classify + map + gap report"; it has **no concept** of "the
source is partially obsolete and must be reconciled against decisions made elsewhere." The
agent had to invent a **"Reconciliation Overlay"** section in the gap report and thread it
through every builder so they would not carry obsolete content (MongoDB, agent-POST telemetry,
inline feedback) forward.

**Proposed change:** add an optional **reconciliation pass** to `egp-import` /
`egp-product-workflow`: when prior decisions (existing ADRs, prior `.product/`, or
user-supplied "these decisions override the source") contradict the source, produce a
first-class *reconciliation overlay* in the gap report and `import-map.json`
(`supersedes` links per decision), and require each builder to honor it. The plugin already
has `supersedes`/`amends` machinery for ADRs — extend the same idea to source-vs-decision.

---

## P2 — Builders create cross-doc duplicate ID definitions that the gate then rejects

The consistency gate (`lint-ids.js`) treats **any ID in the first cell of a table** as a
"definition", so the same `FR`/`NFR`/`AR`/`ADR` ID defined (first-cell) in two docs is a
`duplicate-definition` failure. The builders, with no guidance on this, happily put canonical
IDs as first-cell in reference/traceability/coverage tables across the SRS, SAD, SDD and even
the gap report — producing **18 duplicate-definitions** that the agent had to clean up by
reordering columns (moving IDs out of first position) and relying on `COVERAGE-INDEX` markers.

**Proposed change:** teach the builder skills/templates the ownership rule explicitly:
- Only the **owning** document puts an ID in a first table cell (SRS owns `FR`/`NFR`, SAD owns
  `AR`, each ADR owns itself).
- **Referencing** documents must cite IDs in prose or in a **non-first column**.
- Any cross-doc reference/coverage table must be wrapped in the generated markers
  (`COVERAGE-INDEX` / `ADR-INDEX` / `ADR-STATUS`) so `lint-ids` strips it.
The SDD builder in particular should emit its requirement-coverage and AR-realization tables
in the generated-marker form by default, not hand-authored first-cell tables.

---

## P2 — No multi-document / dependency-aware authoring mode

The workflow dispatches builders one-at-a-time in interactive derive-then-confirm mode. For a
full suite (PRD + SRS + SAD + SDD + 7 ADRs) the agent had to improvise a **parallel,
dependency-ordered** authoring strategy via subagents (ADRs → SRS+SAD → SDD+PRD), because:
- the **ID dependency DAG** is implicit: SAD mints `AR-NNN` that the SDD must reference; SRS
  owns `FR`/`NFR` IDs the PRD/SDD reference; ADR IDs must exist before docs cite them.
- doing it sequentially and interactively for 11 documents is impractically slow.

**Proposed change:** add a documented "batch / derive-all" mode to `egp-product-workflow`
that (a) states the inter-document dependency order explicitly, (b) allows authoring all
derivable content first and surfacing only the consolidated gap questions at the end, and
(c) is safe to parallelize across non-conflicting files.

---

## P2 — Output language is not a first-class workflow setting

The whole suite had to be pt-BR prose with English jargon/code. Nothing in the skills carries
an output-language preference, so the agent had to inject the language rule into **every**
builder/subagent prompt by hand to keep it consistent. The agent ad-hoc extended
`import-state.json` with `outputLanguage` / `codeAndJargon`, but no builder reads those.

**Proposed change:** make output language a workflow-level setting (e.g. honored fields in
`import-state.json`: `outputLanguage`, `codeAndJargon`) that every builder reads and applies,
so language consistency does not depend on the agent remembering to repeat it.

---

## P3 — Skills do not reliably present their steps when invoked

`egp-import`'s own notes already acknowledge this ("If a skill does not present its steps when
invoked, read its `SKILL.md` directly … invocation output is host-dependent"). It happened
here: invoking the import skill returned only a one-line launch, so the agent had to read
`SKILL.md` from the plugin cache to proceed. This is fragile and host-dependent.

**Proposed change:** make each skill echo its concrete Steps/Rules on invocation (or have the
workflow orchestrator always read and inline the target builder's `SKILL.md`) so behavior does
not depend on the host surfacing skill content.

---

## P3 — `stop-server.sh` ergonomics and orphaned servers

- `stop-server.sh` requires the session dir as an argument and errors with a bare usage
  string when called without it; the session dir is non-obvious (it's embedded in the
  `start-server.sh` JSON). A `--latest` / no-arg "stop the server you started" mode would help.
- Preview servers default to a 4h idle timeout and survived across the session; cleanup was
  manual. Consider a project-scoped `stop-all` and surfacing the running server + its
  clickable link in workflow status so it is never silently left running.

---

## Summary of fixes ranked by impact

1. **preview-server.cjs**: replace string-replacement with function replacers (fixes the
   diagram-breaking corruption). *(P1)*
2. **Workflow/SDD/SAD builders**: make diagram preview a mandatory approval gate and present a
   **clickable Markdown link** (+ `--open`). *(P1)*
3. **mermaid-preview.js**: add static-SVG render mode so previews can't be broken by serving. *(P1)*
4. **mermaid-lint.js**: stop counting braces inside `erDiagram` cardinality tokens. *(P1)*
5. **egp-import / lint-ids guidance**: ownership rule for first-cell IDs; reconciliation
   overlay for source-vs-prior-decisions. *(P2)*
6. **Workflow**: documented dependency-ordered batch authoring + output-language setting. *(P2)*
7. **Skill step presentation** and **stop-server ergonomics**. *(P3)*
