# OPL App GUI Product Docs

Owner: `one-person-lab-app`
Purpose: `gui_product_docs_index`
State: `active`
Machine boundary: Human-readable product GUI definitions and review notes.
Machine-readable GUI truth stays in `contracts/`, page-state matrices, adapter
contracts, source, package manifests, smoke evidence, and release gates.

This directory points to the App-level GUI definition stack owned by the clean
`one-person-lab-app` product repo. These docs describe the target product
interaction and shell-independent GUI requirements; active shell implementations
consume them through App-owned contracts and validation gates.

## Reading Order

1. `one-person-lab-app/docs/product/gui/codex-to-opl-app-delta.md`: product
   additions, hidden surfaces, naming, and governance needed to turn Codex App
   into OPL App.
2. `one-person-lab-app/docs/product/gui/feature-inventory.md`: cross-shell GUI
   feature inventory, reference mapping, and verification category notes.
3. App contracts, page-state matrices, shell adapter contracts, source,
   package manifests, smoke evidence, and release gates for machine-readable
   GUI truth.

Hermes foreground-alternative material lives in
[`../shell-alternatives/`](../shell-alternatives/). Archived AGUI replay material
lives in `one-person-lab-app/docs/history/shell-candidates/`.
