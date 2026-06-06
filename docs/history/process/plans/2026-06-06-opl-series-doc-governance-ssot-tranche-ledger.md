# OPL series docs governance SSOT tranche ledger

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_ssot_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 OPL series 文档治理 tranche ledger。当前机器真相继续归各 repo 的 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence 和 repo-local active owner docs。

本文记录 `RUN_SNAPSHOT_TS=2026-06-06T07:28:54Z` 后本轮 OPL Doc 治理已经落地的五个高信心 SSOT lane，以及 App 用户指南同面再生成验证。它不关闭六仓全局 `/goal`，不声明任何 repo production ready、domain ready、App release ready 或 physical delete authorized。

## Scope

Default OPL series scope:

- `/Users/gaofeng/workspace/one-person-lab`
- `/Users/gaofeng/workspace/med-autoscience`
- `/Users/gaofeng/workspace/med-autogrant`
- `/Users/gaofeng/workspace/redcube-ai`
- `/Users/gaofeng/workspace/opl-meta-agent`
- `/Users/gaofeng/workspace/one-person-lab-app`

This tranche edited:

- `/Users/gaofeng/workspace/redcube-ai`
- `/Users/gaofeng/workspace/one-person-lab`
- `/Users/gaofeng/workspace/med-autogrant`
- `/Users/gaofeng/workspace/opl-meta-agent`
- `/Users/gaofeng/workspace/one-person-lab-app`

No contracts / tests were intentionally edited in this tranche. The OPL main checkout already had unrelated dirty source/test files before the OPL docs lane; they were not touched. During the MAG lane, `src/med_autogrant/product_entry_parts/opl_owner_payload_response.py` and `tests/product_entry_cases/test_opl_owner_payload_response.py` appeared dirty after the docs lane started; they were left untouched as external source/test changes. During the App lane, same-surface user-guide source/generated artifact/generator changes appeared outside the initial SSOT guard edit; they were audited as a separate regeneration boundary and validated through the repo-native user-guide generation commands.

## Completed Lanes

| Repo | Semantic theme | SSOT owner | Peer docs / evidence surfaces | Classification outcome | Edited docs | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `redcube-ai` | `active truth baton` | `docs/active/rca-ideal-state-gap-plan.md` | `docs/docs_portfolio_consolidation.md`、core five docs、runtime-program contracts、foundry/private-surface/source-morphology/production-acceptance contracts | Allowed structured next-round baton in active SSOT; kept long prompt templates, proof transcripts, run/probe ids and closeout evidence in history/provenance. | `docs/active/rca-ideal-state-gap-plan.md`、`docs/docs_portfolio_consolidation.md`、`docs/history/process/README.md`、`docs/history/process/2026-06-06-rca-active-baton-ssot-closeout.md` | RedCube `opl-doc-doctor` passed with `finding_count=0`; `git diff --check` passed; edited-doc conflict-marker scan passed. |
| `one-person-lab` | `retired vocabulary in active owner map` | `docs/active/current-development-lines.md` for owner map; `docs/active/current-state-vs-ideal-gap.md` for active plan | `docs/history/README.md`、`docs/history/frontdoor-legacy/README.md`、`docs/history/runtime-substrate/README.md`、`docs/history/compatibility/README.md`、`docs/policies/docs-lifecycle-policy.md` | Replaced literal retired-route vocabulary list in active support with semantic retired-surface classes plus history/provenance pointer; exact old route names stay in history/tombstone owners. | `docs/active/current-development-lines.md`、`docs/history/process/README.md`、`docs/history/process/plans/README.md`、`docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md` | OPL `opl-doc-doctor` passed with `finding_count=0`; targeted active-doc stale vocabulary scan passed; scoped `git diff --check` passed; edited-doc conflict-marker scan passed. |
| `med-autogrant` | `explicit non-default executor receipt boundary` | Machine truth: `contracts/runtime-program/current-program.json`、`contracts/private_functional_surface_policy.json`、`src/med_autogrant/critique_executor.py`、executor tests; docs owner: `docs/active/mag-ideal-state-cross-repo-gap-plan.md` plus `docs/specs/specs_lifecycle_map.md` / `docs/specs/README.md` for specs placement | `docs/specs/2026-04-13-critique-codex-cli-executor-current-truth.md`、`docs/specs/2026-04-13-full-grant-authoring-executor-current-truth.md`、`docs/specs/2026-04-12-schema-backed-product-entry-and-routing-contract-current-truth.md`、`docs/status.md`、`docs/project.md`、`docs/invariants.md`、`docs/history/specs/README.md` | Kept `codex_cli` as default executor truth; kept `hermes_agent` only as explicit non-default OPL receipt/proof lane; hardened support specs so hosted runtime, Gateway/federation and compatibility bridge wording cannot be read as current target. | `docs/specs/2026-04-13-critique-codex-cli-executor-current-truth.md`、`docs/specs/2026-04-13-full-grant-authoring-executor-current-truth.md`、`docs/specs/2026-04-12-schema-backed-product-entry-and-routing-contract-current-truth.md`、`docs/history/docs-portfolio-coverage-ledger/README.md`、`docs/history/docs-portfolio-coverage-ledger/2026-06-06-mag-executor-receipt-boundary-ssot-closeout.md` | MAG `opl-doc-doctor` passed with `finding_count=0`; `git diff --check` passed; edited-doc conflict-marker scan passed; current-doc targeted stale scan leaves only active truth statements or explicit `不表示 ...` guards. |
| `opl-meta-agent` | `script-to-pack hygiene and wrapper no-resurrection` | Machine truth: `runtime/authority_functions/meta-agent-authority-functions.json`、`contracts/functional_privatization_audit.json`、`contracts/default_caller_deletion_evidence.json`、`tests/source-purity.test.ts`、`package.json`; human-doc owner: `docs/active/opl-private-implementation-migration-inventory.md` | `docs/status.md`、`docs/active/opl-meta-agent-ideal-state-gap-plan.md`、`docs/docs_portfolio_consolidation.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/history/process/2026-06-05-oma-active-progress-and-retired-fixture-audit.md` | Compressed duplicate script-to-pack detail in status/active plan into SSOT pointers; private inventory remains the per-script classification and retirement-gate owner; no retired wrapper, compatibility facade, Agent Lab runner, promotion gate, workbench or generated shell wording was restored. | `docs/status.md`、`docs/active/opl-meta-agent-ideal-state-gap-plan.md`、`docs/history/process/README.md`、`docs/history/process/2026-06-06-oma-script-to-pack-ssot-closeout.md` | OMA `opl-doc-doctor` passed with `finding_count=0`; `git diff --check` passed; edited-doc conflict-marker scan passed; targeted scan confirms status/active plan point to private inventory plus machine gates instead of carrying a second per-script owner map. |
| `one-person-lab-app` | `macOS install user-guide source versus generated artifacts` | Content SSOT: `docs/user-guides/macos-app-install.guide.json`; screenshot/provenance SSOT: `docs/user-guides/macos-app-install-assets.json` and generated verification records; generator owner: `scripts/user-guide-data.ts` and `scripts/build-user-guide-*`; active App plan: `docs/active/app-ideal-state-gap-plan.md` | `docs/user-guides/README.md`、`docs/user-guides/macos-app-install.md`、`docs/user-guides/site/index.html`、`docs/user-guides/*.pdf`、`docs/user-guides/*.pptx`、`README*`、`docs/release/README.md`、`docs/docs_portfolio_consolidation.md` | Added a direct-reader guard that generated Markdown/PDF/PPTX/HTML are artifacts derived from guide source and screenshot manifest; audited the guide-source / generated-artifact / slide-generator same-surface changes; regenerated artifacts from the SSOT inputs instead of treating generated outputs as edit owners. | `docs/user-guides/README.md`、`docs/user-guides/macos-app-install.guide.json`、generated Markdown/HTML/PDF/PPTX and verification JSON、`scripts/build-user-guide-slides.ts`、`docs/history/process/README.md`、`docs/history/process/2026-06-06-app-user-guide-ssot-closeout.md` | App `npm run docs:macos-guide` passed; App `npm run docs:macos-guide:slides` passed after aligning slide typography verification metadata; App `opl-doc-doctor` passed with `finding_count=0`; `git diff --check` passed; edited-doc conflict-marker scan passed; targeted scan confirms source-like generated metadata is guarded back to `macos-app-install.guide.json` plus regeneration. |

## Coverage Classification

| Classification | This tranche readout |
| --- | --- |
| `covered_by_ssot` | RedCube active completion plan, OPL current owner-map direct-retirement readout, MAG default-executor truth, OMA script-to-pack / no-resurrection truth, and App install guide source/generated-artifact truth now have a single active/machine owner each; App generated guide artifacts were rederived from the guide source and screenshot manifest. |
| `more_specific_detail` | RedCube docs lifecycle support keeps the structured baton rule; OPL retired-route history indexes keep exact old route/provenance wording; MAG support specs keep only bounded executor/product-entry subsections; OMA private inventory keeps detailed per-script classification; App README/release docs keep high-level install links and release boundary without owning guide content. |
| `conflicts_with_ssot` | RedCube old "no next Agent prompt template" wording and OPL active support literal old-route list were rewritten to align with SSOT-first governance. MAG had no machine-truth conflict after direct-reader wording hardening. |
| `history_or_provenance` | RedCube, OPL, OMA and App wrote dated closeout records under `docs/history/process/**`; MAG wrote its closeout under `docs/history/docs-portfolio-coverage-ledger/**`. Old route names, prompt templates, proof transcripts, run/probe details, Gateway/Hermes/provider proof wording, hosted-runtime nonproof, retired OMA fixture details and App generated-guide artifact provenance remain outside active truth. |
| `stale_or_superseded` | No physical module/interface/test/workflow deletion was authorized in this tranche. Retired-surface physical cleanup remains gated by replacement owner, no-active-caller proof, owner receipt / typed blocker, no-forbidden-write and tombstone/provenance. |
| `out_of_scope` | `med-autoscience` dirty-state governance, App release cohort evidence lane, OMA non-script themes, MAG non-executor themes, RedCube non-baton themes, OPL unrelated source/test dirty files and MAG external source/test dirty files. |

## Remaining Scope

Uncovered in this tranche:

- `med-autoscience`: requires fresh dirty-state / owner intake before writing.
- `med-autogrant`: executor receipt boundary lane closed; product-entry/package authority, source/workspace lifecycle, delivery lifecycle, runtime topology and broader docs portfolio remain separate lanes.
- `opl-meta-agent`: script-to-pack / no-resurrection lane closed; pack README support indexes, registry/App evidence tail, target patch-loop evidence and public README narrative remain separate lanes.
- `one-person-lab-app`: user-guide SSOT guard and same-surface regeneration verification lane closed. Release cohort evidence, Homebrew/updater boundary, runtime page, public README install narrative and broader docs portfolio remain separate lanes.
- `redcube-ai`: active baton lane closed; delivery lifecycle、source readiness、runtime topology、product/operator support、public narrative、policy/spec/reference currentness and stale physical surface retirement remain separate lanes.
- `one-person-lab`: retired vocabulary owner-map lane closed; broader docs themes remain separate lanes and unrelated source/test dirty files remain outside this tranche.

Recommended next write scope:

1. `one-person-lab-app` release cohort evidence versus release-ready claims lane after confirming release evidence owner state.
2. `opl-meta-agent` domain-pack README support-index lane if checkout remains clean.
3. `med-autogrant` product-entry/package authority lane after resolving or explicitly ignoring its external source/test dirty changes.
4. `med-autoscience` only after fresh dirty-state intake and owner-boundary decision.

## Verification Summary

- RedCube docs-only verification: passed as recorded in `redcube-ai/docs/history/process/2026-06-06-rca-active-baton-ssot-closeout.md`.
- OPL main docs-only verification: passed as recorded in `docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md`.
- MAG docs-only verification: passed as recorded in `med-autogrant/docs/history/docs-portfolio-coverage-ledger/2026-06-06-mag-executor-receipt-boundary-ssot-closeout.md`.
- OMA docs-only verification: passed as recorded in `opl-meta-agent/docs/history/process/2026-06-06-oma-script-to-pack-ssot-closeout.md`.
- App docs / generated-user-guide verification: passed as recorded in `one-person-lab-app/docs/history/process/2026-06-06-app-user-guide-ssot-closeout.md`; `npm run docs:macos-guide` and `npm run docs:macos-guide:slides` both passed.
- Global six-repo verification was not run because this was a focused tranche, not full portfolio completion.
