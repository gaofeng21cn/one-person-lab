# OPL owner map retired vocabulary SSOT closeout

Owner: `One Person Lab`
Purpose: `owner_map_retired_vocabulary_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文是人读过程 closeout。当前机器真相继续归 `contracts/`、source、CLI/API behavior、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实 verification evidence。

本文记录 2026-06-06 OPL Doc 语义治理中 `retired vocabulary in active owner map` 主题的 Single Source of Truth 收敛。它不承担 active plan，不声明 domain ready、App release ready、production ready、physical delete authorized 或旧入口恢复。

## Scope

- `RUN_SNAPSHOT_TS`: `2026-06-06T07:28:54Z`
- `cwd`: `/Users/gaofeng/workspace/one-person-lab`
- Governance theme: `retired vocabulary in active owner map`
- Active owner-map SSOT: `docs/active/current-development-lines.md`
- Active plan SSOT: `docs/active/current-state-vs-ideal-gap.md`
- Retired-route provenance owners: `docs/history/README.md`、`docs/history/frontdoor-legacy/README.md`、`docs/history/runtime-substrate/README.md`、`docs/history/compatibility/README.md`、`docs/history/process/plans/README.md`
- Lifecycle policy owner: `docs/policies/docs-lifecycle-policy.md`
- Actual write scope: `docs/active/current-development-lines.md`、本文、`docs/history/process/README.md`、`docs/history/process/plans/README.md`
- Existing dirty source/test files in the checkout were not touched.

## SSOT Decision

`docs/active/current-development-lines.md` keeps the current owner map and direct-retirement readout. It should describe retired surfaces by semantic class and point to history/provenance owners instead of carrying a literal old-route vocabulary list in the active layer.

`docs/active/current-state-vs-ideal-gap.md` remains the only active plan owner for current goals, gaps, next-round baton and verification entry. It already states that retained old vocabulary is only allowed in history/provenance/negative-guard context and does not authorize physical deletion or readiness claims.

The exact old route names and their formation history belong in `docs/history/**`, especially the frontdoor, runtime-substrate and compatibility/gateway-federation history indexes. Those history owners already state that old route prose is provenance/tombstone only.

## Section Classification

| Classification | Section / content | Decision |
| --- | --- | --- |
| `covered_by_ssot` | Current owner map, completion interpretation and direct-retirement criteria | Keep in `docs/active/current-development-lines.md`. |
| `more_specific_detail` | Exact historical route names and old route formation history | Keep under `docs/history/**`; active docs only point to that layer. |
| `conflicts_with_ssot` | Active support paragraph carrying a literal list of retired route vocabulary | Rewrite as semantic retired-surface classes plus history/provenance pointer. |
| `history_or_provenance` | Frontdoor-era notes, runtime-substrate migration boards, gateway/federation compatibility corpus and process-plan indexes | Preserve in history; do not copy into active support. |
| `stale_or_superseded` | Any active wording that promotes retired route vocabulary to current topology, callable alias, compatibility facade or readiness claim | None found in this lane after rewrite; future occurrences must be demoted to history/provenance or handled by direct retirement. |
| `out_of_scope` | Existing source/test dirty files and broader OPL source cleanup | Not touched. |

## Changes

- `docs/active/current-development-lines.md`: replaced the literal retired-route vocabulary list in `Direct Retirement 读法` with semantic surface classes and a history/provenance pointer; also changed the support link phrase from old-route wording to retired-route wording.
- `docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md`: records this SSOT lane, classification, verification and remaining scope.
- `docs/history/process/README.md` and `docs/history/process/plans/README.md`: index this closeout.

## Verification

Completed after this closeout and index update:

- `rtk git diff --check -- docs/active/current-development-lines.md docs/history/process/README.md docs/history/process/plans/README.md docs/history/process/plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md`: passed.
- Merge-conflict marker scan over edited docs: passed with no matches.
- Targeted active-doc stale vocabulary scan for the original doctor finding: passed with no matches.
- `rtk /Users/gaofeng/.local/bin/opl-doc-doctor doctor . --format json`: passed with `finding_count=0` and `active_truth_health.status=pass`.

## Remaining Scope

This closeout covers one OPL main-repo semantic lane only. It does not claim full OPL docs portfolio completion and does not close the six-repo OPL series `/goal`.

Open carry-forward:

- OPL main repo still has unrelated dirty source/test files in the checkout; they remain outside this docs-only lane.
- Other OPL docs themes still need separate semantic lanes when selected from live truth and current SSOT owners.
- Other OPL series repos remain open for this global goal: `med-autoscience`、`med-autogrant`、`redcube-ai` beyond the active-baton tranche、`opl-meta-agent`、`one-person-lab-app`。
