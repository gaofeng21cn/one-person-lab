# OPL Series Docs Governance Scope SSOT Closeout

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_scope_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL Doc governance tranche 的 SSOT 决策、覆盖范围、验证和下一轮候选。当前机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 fresh command output。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-14T23:48:06Z` / `2026-06-15T07:48:06+0800`
- Scope: six repo frozen inventory covered `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`.
- Initial repo state: all six `main` branches were even with `origin/main` after fetch. `one-person-lab-app` had a coherent local validator split; `one-person-lab` was clean.
- Post-snapshot activity: `one-person-lab-app` validator split was verified, committed and pushed as `b515e93 refactor(active-shell): split GUI framework surface validator`.

## Candidate Gates

| candidate | value gate | safety gate | outcome |
| --- | --- | --- | --- |
| App active-shell validator split | Existing coherent local change split GUI product authority / framework surface validation out of a monolithic validator without adding public product surface. | Same write set only in App validator files; `validateAppGuiProductContract` remains the external entry; `npm run validate:active-shell` passed. | Landed in App repo. |
| OPL docs governance scope SSOT | `docs/docs_portfolio_consolidation.md` still mixed old four-repo taxonomy wording with the current six-repo governance scope. | Docs-only lane; SSOT owner and peer docs identifiable; no runtime or domain truth changes. | Landed in OPL docs owner and peer docs. |
| Concrete stale / retirement scan | Literal scan covered old `four repo`, `frontdoor`, `gateway`, `compat`, `fallback`, `wrapper`, `alias` families across README/docs/contracts/source/tests. | Most hits were history/tombstone, negative guards, or active no-resurrection tests; no safe source deletion candidate had no-active-caller proof inside this tranche. | Carried forward; next tranche should pick a focused source/test surface with active caller proof. |

## SSOT Lane

- Semantic theme: OPL series docs governance scope and canonical taxonomy boundary.
- Single Source of Truth: `docs/docs_portfolio_consolidation.md`.
- Why it wins: it is the repo-owned docs lifecycle governance entry with `Purpose: docs_lifecycle_governance`; `docs/README.md`, `docs/policies/docs-lifecycle-policy.md`, and `docs/active/opl-family-development-reference.md` are peer entry / policy / support surfaces.

## Peer Classification

| document | classification | action |
| --- | --- | --- |
| `docs/docs_portfolio_consolidation.md` | SSOT owner; contained stale four-repo scope wording. | Rewrote current conclusion and directory-status table to separate six-repo governance scope from OPL/MAS/MAG/RCA strict canonical taxonomy. Added OMA/App repo-specific governance rows. |
| `docs/README.md` | `covered_by_ssot` entry pointer with stale narrow scope wording. | Thinned cross-repo docs governance rule to point to the SSOT and summarize six-repo scope / four-repo taxonomy split. |
| `docs/policies/docs-lifecycle-policy.md` | `covered_by_ssot` policy support with stale narrow scope wording. | Rewrote the current policy opening to match SSOT and avoid implying OMA/App are outside governance. |
| `docs/active/opl-family-development-reference.md` | `more_specific_detail` for owner layering and domain/App responsibilities. | Updated review date and docs-structure section so it keeps strict taxonomy guidance while naming OMA/App scope explicitly. |
| Historical `four-repo` references under `docs/history/**` | `history_or_provenance`. | Left untouched; those files are dated provenance, not current SSOT. |

## Verification Boundary

- Docs-only verification is sufficient for the OPL docs lane: `git diff --check`, conflict marker scan, and targeted stale-scope scan.
- This tranche does not claim OPL series governance complete. Six-repo README/docs body-level coverage remains open.
- This tranche does not alter runtime truth, domain truth, App release readiness, owner receipts, typed blockers, physical delete authorization, or production-ready status.

## Next Write Scope

- Prefer a focused concrete retirement lane with source/test caller proof, not another broad wording pass.
- Good next candidates:
  - OPL source/test stale-surface lane selected from `gateway/frontdoor/compat/fallback/wrapper/alias` literal scan, proving no active caller before delete.
  - App active-shell validator/source-shape continuation only if `scripts/validate-active-shell/*` still exposes a clear oversized semantic owner after the fresh App commit.
  - MAS/MAG/RCA/OMA private-platform residue candidates only after reading their repo-local AGENTS/TASTE, owner contracts, active callers, and repo-native validators.
