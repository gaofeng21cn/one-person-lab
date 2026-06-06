# OPL series docs governance SSOT tranche ledger

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_ssot_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 OPL series 文档治理 tranche ledger。当前机器真相继续归各 repo 的 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence 和 repo-local active owner docs。

本文记录 `RUN_SNAPSHOT_TS=2026-06-06T07:28:54Z` 后本轮 OPL Doc 治理已经落地的两个高信心 SSOT lane。它不关闭六仓全局 `/goal`，不声明任何 repo production ready、domain ready、App release ready 或 physical delete authorized。

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

No source / contracts / tests were intentionally edited in this tranche. The OPL main checkout already had unrelated dirty source/test files before the OPL docs lane; they were not touched.

## Completed Lanes

| Repo | Semantic theme | SSOT owner | Peer docs / evidence surfaces | Classification outcome | Edited docs | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `redcube-ai` | `active truth baton` | `docs/active/rca-ideal-state-gap-plan.md` | `docs/docs_portfolio_consolidation.md`、core five docs、runtime-program contracts、foundry/private-surface/source-morphology/production-acceptance contracts | Allowed structured next-round baton in active SSOT; kept long prompt templates, proof transcripts, run/probe ids and closeout evidence in history/provenance. | `docs/active/rca-ideal-state-gap-plan.md`、`docs/docs_portfolio_consolidation.md`、`docs/history/process/README.md`、`docs/history/process/2026-06-06-rca-active-baton-ssot-closeout.md` | RedCube `opl-doc-doctor` passed with `finding_count=0`; `git diff --check` passed; edited-doc conflict-marker scan passed. |
| `one-person-lab` | `retired vocabulary in active owner map` | `docs/active/current-development-lines.md` for owner map; `docs/active/current-state-vs-ideal-gap.md` for active plan | `docs/history/README.md`、`docs/history/frontdoor-legacy/README.md`、`docs/history/runtime-substrate/README.md`、`docs/history/compatibility/README.md`、`docs/policies/docs-lifecycle-policy.md` | Replaced literal retired-route vocabulary list in active support with semantic retired-surface classes plus history/provenance pointer; exact old route names stay in history/tombstone owners. | `docs/active/current-development-lines.md`、`docs/history/process/README.md`、`docs/history/process/plans/README.md`、`docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md` | OPL `opl-doc-doctor` passed with `finding_count=0`; targeted active-doc stale vocabulary scan passed; scoped `git diff --check` passed; edited-doc conflict-marker scan passed. |

## Coverage Classification

| Classification | This tranche readout |
| --- | --- |
| `covered_by_ssot` | RedCube active completion plan and OPL current owner-map direct-retirement readout now have a single active owner each. |
| `more_specific_detail` | RedCube docs lifecycle support keeps the structured baton rule; OPL retired-route history indexes keep exact old route/provenance wording. |
| `conflicts_with_ssot` | RedCube old "no next Agent prompt template" wording and OPL active support literal old-route list were rewritten to align with SSOT-first governance. |
| `history_or_provenance` | Both lanes wrote dated closeout records under `docs/history/process/**`; old route names, prompt templates, proof transcripts and run/probe details remain outside active docs. |
| `stale_or_superseded` | No physical module/interface/test/workflow deletion was authorized in this tranche. Retired-surface physical cleanup remains gated by replacement owner, no-active-caller proof, owner receipt / typed blocker, no-forbidden-write and tombstone/provenance. |
| `out_of_scope` | `med-autoscience` dirty-state governance, MAG/OMA/App docs portfolio lanes, RedCube non-baton themes and OPL unrelated source/test dirty files. |

## Remaining Scope

Uncovered in this tranche:

- `med-autoscience`: requires fresh dirty-state / owner intake before writing.
- `med-autogrant`: no lane selected in this tranche.
- `opl-meta-agent`: no lane selected in this tranche.
- `one-person-lab-app`: no lane selected in this tranche; note existing worktree state should be rechecked before writes.
- `redcube-ai`: active baton lane closed; delivery lifecycle、source readiness、runtime topology、product/operator support、public narrative、policy/spec/reference currentness and stale physical surface retirement remain separate lanes.
- `one-person-lab`: retired vocabulary owner-map lane closed; broader docs themes remain separate lanes and unrelated source/test dirty files remain outside this tranche.

Recommended next write scope:

1. `med-autogrant` docs portfolio lane if checkout remains clean: choose a semantic theme from its active truth owner and doctor/read-model output.
2. `opl-meta-agent` script-to-pack / active truth lane if checkout remains clean and ahead-state is understood.
3. `one-person-lab-app` release/user-path docs lane after confirming worktree and release-evidence owner state.
4. `med-autoscience` only after fresh dirty-state intake and owner-boundary decision.

## Verification Summary

- RedCube docs-only verification: passed as recorded in `redcube-ai/docs/history/process/2026-06-06-rca-active-baton-ssot-closeout.md`.
- OPL main docs-only verification: passed as recorded in `docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md`.
- Global six-repo verification was not run because this was a focused tranche, not full portfolio completion.
