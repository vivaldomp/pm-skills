---
name: egp-sdd-builder
description: Create or update a Software Design Document (SDD). Use when the user wants to design the technical solution, architecture, C4 diagrams, components, data model, APIs, security, observability, or testing strategy derived from a PRD. Writes .product/sdd/sdd.md with inline Mermaid diagrams (and optional exports to .product/diagrams/).
metadata:
  author: Vivaldo
  version: "0.1.0"
---

# egp-sdd-builder

Build or update the SDD at `.product/sdd/sdd.md` from the shared template,
derived from the PRD.

## Inputs
- Template: `${CLAUDE_PLUGIN_ROOT}/shared/templates/sdd-template.md`
- PRD: `.product/prd/prd.md` (read for requirements to satisfy)
- SRS (SRS mode): `.product/srs/srs.md` — the canonical `FR`/`NFR` source when it exists
- SAD (SAD mode): `.product/sad/sad.md` — the canonical macro-architecture and `AR-NNN` source when it exists
- References: `${CLAUDE_PLUGIN_ROOT}/shared/references/{concepts,structures,questioning-protocol,openui-guide}.md`

## Steps
- **If these steps were not surfaced on invocation (006 H1):** read this `SKILL.md`
  directly and follow the Steps/Rules below — invocation output is host-dependent.

1. If `.product/prd/prd.md` is missing, warn the user that the SDD should follow
   a PRD, and offer to run `egp-prd-builder` first (do not hard-block).
2. Read the SDD template and the requirements source. **SRS mode** — when `.product/srs/srs.md`
   exists — the canonical `FR-NNN`/`NFR-NNN` live in the SRS; **otherwise** they live in the PRD.
   **SAD mode** — when `.product/sad/sad.md` exists — the macro-architecture and the canonical
   `AR-NNN` table live in the **SAD**, so §3 Architecture Overview **references** the SAD's
   `AR-NNN` and C4 Context/Container instead of enumerating them, and this SDD focuses on C3
   Component design, APIs, schemas, and code-level design, mapping its components to the SAD's
   `AR-NNN`. **No-SAD mode** (default) — the SDD owns `AR-NNN` and the C4 Context/Container
   diagrams as before, mapping the requirement source's `FR-NNN` to `AR-NNN`. The SDD builder
   does not move content itself — the SDD→SAD migration is `egp-sad-builder`'s job; the SDD
   builder only honors the active mode.
3. Fill each required section per `questioning-protocol.md`. When authoritative
   source is provided — mapped content from `egp-import`, or source supplied by the
   user — use **derive-then-confirm mode**: derive the sections, present one confirmation batch (see the one-confirmation-batch contract in `questioning-protocol.md`), and ask only about genuine gaps. Otherwise ask gap questions
   (pause after every 4 questions and summarize remaining gaps).
4. Author diagrams as **inline Mermaid** in `sdd.md`:
   - **Recommend a set.** Read the PRD/SDD and pick diagram archetypes from the
     catalog in `${CLAUDE_PLUGIN_ROOT}/shared/references/structures.md`
     ("Diagram archetypes (Mermaid)"), driven by the system's shape — e.g. auth
     handshake → `sequenceDiagram`, background jobs → `stateDiagram-v2`,
     privacy/LGPD data crossing zones → `flowchart` DFD with `subgraph` trust
     boundaries, multi-store → `erDiagram`/deployment. Present the recommended set
     with a one-line rationale each and let the user confirm or adjust.
   - **Draft** Mermaid source for each chosen type (`C4Context`/`C4Container`/
     `C4Component`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, `flowchart`).
     Avoid the conversion footguns: no `;` in `sequenceDiagram` lines, and line breaks
     in node labels use `<br/>` with the label quoted — never a literal `\n`
     (feedback 005 #1/#3).
   - **Present for approval.** Show the Mermaid source in the conversation, and
     offer a rendered preview: write the drafts to a scratch markdown file and run
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/mermaid-preview.js" <scratch.md> <preview.html>`
     (use a temporary path like the system temp dir for both the scratch markdown
     and preview HTML, not `.product/`), served via the preview server (`start-server.sh`).
     Mermaid is vendored locally, so the preview works offline.
     The served preview URL is mandatory for approval; the standalone HTML file
     (`node scripts/mermaid-preview.js <draft.md> <out.html>`) is only an offline
     fallback, never a substitute for the reviewer-facing URL.
     Iterate until the user approves.
   - **Write** the approved ` ```mermaid ` blocks inline into the relevant `sdd.md`
     sections (§3 Architecture Overview, §7 Flows and Behavior). These inline blocks
     are the source of truth.
   - **Approval bar — ALL diagrams (B1/B3, feedback 005 P0/#6):** Every diagram —
     net-new and derived alike — MUST be rendered in the preview server and explicitly
     approved before it is written into `sdd.md`. Derivation is NOT assumed faithful:
     conversion introduces footguns (semicolons, literal `\n`, quoting). Start the
     server, print the `http://…` preview URL, and STOP for the reviewer's approval or
     change requests — do not batch-confirm diagrams and do not write them until
     approved. (Derive-then-confirm still covers section *text*, never diagrams.)
     Present the preview as a **clickable Markdown link** (the server's `markdown_link`
     field), never a raw URL. For a portable, un-breakable artifact (006 A2): once the
     diagrams render in the preview, capture each `<svg>` and assemble a JS-free page
     with `mermaid-preview.js --static <out.html> <a.svg> ...`.
   - **Optionally export** standalone files to `.product/diagrams/{c4,sequence,state,data,deployment,flow}/`
     only if the user wants separate artifacts.
5. For UI/frontend sections, author OpenUI Lang in `.product/design/*.openui`
   and render with `${CLAUDE_PLUGIN_ROOT}/scripts/openui-render.js` to `.product/design/*.html`.
6. Identify decisions with significant trade-offs and flag them as ADR
   candidates; hand each to `egp-adr-builder`. Reference resulting `ADR-NNN`
   in the SDD's "Referenced ADRs" section.
7. On finalize, populate the YAML front-matter (`title`, `status`, `version`,
   `owner`, `date`) — bump `version` and refresh `date` on an update — write
   the SDD, and record unresolved gaps in Open Questions.
8. Suggest running `egp-doc-sync` to refresh the traceability matrix. The SDD's
   §16 Requirement Coverage Index is generated by that step (between the COVERAGE-INDEX
   markers) — do not hand-author it.

## Rules
- Every major design choice should map back to a PRD requirement or an ADR.
- Cover failure modes, security, observability, and operations — not only happy paths.
- When a template subsection does not apply (e.g. Backend for Frontend), emit its
  heading with an `n/a` body rather than omitting it, so `validate-structure` stays
  clean (feedback 005 #9).
- **ID ownership (006 D):** Only the **owning** document puts an ID in a first
  table cell — SRS owns `FR`/`NFR`, SAD owns `AR`, each ADR owns itself.
  **Referencing** documents cite IDs in prose or in a **non-first column**. Any
  cross-doc reference/coverage table MUST be wrapped in generated markers
  (`COVERAGE-INDEX` / `ADR-INDEX` / `ADR-STATUS`) so `lint-ids` strips it.
- **Coverage tables are generated (006 D):** Emit requirement-coverage and
  AR-realization tables inside `COVERAGE-INDEX` markers (generated form), NOT as
  hand-authored first-cell ID tables. The SDD references `FR`/`NFR`/`AR`; it never
  re-defines them in a first cell.
- **Output language (006 G):** If `.product/import-state.json` has `outputLanguage`,
  write all prose in it; if it has `codeAndJargon`, keep identifiers, code, and
  technical jargon in that language. Absent → match the user's language.

## Guards
- **`docs/` is read-only.** Never write under `docs/` — it is the import source. All authored
  artifacts live under `.product/`.
- **Version bump** (document `version` front-matter): patch = typo/clarification/formatting,
  no requirement change; minor = new section/requirement/ADR added (backward-compatible);
  major = restructure, or removed/renamed requirements.
