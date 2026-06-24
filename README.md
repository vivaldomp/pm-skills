# lpp-skills

Claude Code marketplace containing the **product-design-suite** plugin — a set of
Agent Skills that guide Product Managers through a sequential PRD -> SDD -> ADR
workflow with cross-document sync and framework-free HTML visualizations.

## Install
Add this repo as a plugin marketplace in Claude Code, then install
`product-design-suite`.

## Skills
- `lpp-product-workflow` — orchestrator (sequence + question cadence)
- `lpp-prd-builder`, `lpp-sdd-builder`, `lpp-adr-builder` — artifact builders
- `lpp-doc-sync` — cross-document impact + sync

## Commands
`/lpp-product`, `/lpp-prd`, `/lpp-sdd`, `/lpp-adr`

Generated artifacts are written to `.product/`.

## Development
Run validation and tests:
```bash
node tools/validate-plugin.js .
node --test          # auto-discovers tests/*.test.js (Node >= 18)
```
