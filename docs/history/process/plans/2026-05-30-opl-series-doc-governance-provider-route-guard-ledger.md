# OPL Series Doc Governance Ledger - Provider Route Guard Absorb

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_provider_route_guard_absorb_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮 OPL root clean-ahead runtime tranche 的覆盖、证据、验证与保留边界。机器真相继续归 `contracts/`、source、tests、CLI/API 行为、runtime ledger、provider receipt、App/operator projection 与 domain owner refs。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T20:49:41Z`
- Local snapshot time: `2026-05-30T04:49:41+0800`
- Frozen scope: OPL series 6 repo inventory at snapshot only. Snapshot-after activity belongs to next heartbeat intake and did not expand this tranche.

## Frozen Repo / Lane Inventory

| Repo | Snapshot state | Handling |
| --- | --- | --- |
| `one-person-lab` | Root `main` clean, ahead `origin/main` by 2 at `f00f12a8`; extra worktree `.worktrees/github-ci-20260530-opl-queuehold` clean but ahead 1 / behind 3. Snapshot-window writes touched runtime source, App/operator route tests, active docs and decisions. | Root clean-ahead runtime tranche selected for semantic review, ledger foldback, verification and push. Queuehold retained as unmerged lane. |
| `med-autoscience` | Root `main` clean, ahead `origin/main` by 18 at `e41b6b4b`; `.worktrees/github-ci-20260530-mas-preflight` dirty in preflight contract source/test. Long-running old quality/details / verify processes still present. | Retained as ahead/dirty/process-active MAS lane. |
| `med-autogrant` | Clean/synced at `f1dd6cb`; snapshot-window docs/marketplace writes from prior tranche. | No write in this tranche. |
| `redcube-ai` | Clean/synced at `d4a0171`; snapshot-window ledger/build metadata writes from prior RCA tranche. | No write in this tranche. |
| `opl-meta-agent` | Clean/synced at `312d623`; snapshot-window docs writes from prior OMA tranche. | No write in this tranche. |
| `one-person-lab-app` | Root dirty/synced at `eadbde5`; dirty remote-backed `.worktrees/codex/full-first-run-stable-gate-20260525` retained. | Retained as dirty/remote-backed App lane. |

Open PR checks returned `[]` for all six repos. Process scan showed App actions-runner service and old MAS quality/details / verify processes; no active OPL provider-route process was used as a cleanup or deletion signal.

## Tranche Scope

This tranche absorbs and governs the OPL root clean-ahead runtime commits:

- `030ddce4 fix(runtime): block guarded provider routes`
- `f00f12a8 fix(runtime): skip typed-blocker stage evidence defaults`

Reviewed source/test/docs surfaces:

- Source: `src/runtime-operator-action-execution.ts`, `src/runtime-operator-action-execution-parts/blocked-action-route.ts`, `src/runtime-tray-app-operator-drilldown-parts/provider-action-routes.ts`, `src/runtime-tray-app-operator-drilldown-parts/provider-worker-action-routes.ts`, `src/runtime-tray-app-operator-drilldown-parts/provider-scheduler-action-routes.ts`, `src/runtime-tray-app-operator-drilldown-parts/execution-bridge.ts`, `src/runtime-tray-app-operator-drilldown-parts/selected-safe-action-candidates.ts`, `src/family-runtime-temporal-provider.ts`, `src/family-runtime-temporal-readiness.ts`, `src/family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts`.
- Tests: `tests/src/cli/cases/runtime-app-operator-drilldown-provider-worker-actions.test.ts`, `tests/src/cli/cases/runtime-app-operator-stage-evidence-actions.test.ts`, `tests/src/cli/cases/family-runtime-provider-slo.test.ts`, `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts`.
- Docs: `docs/status.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/decisions.md`, this ledger and the process history index.

No MAS/MAG/RCA/OMA/App source, contracts, tests, docs, worktree or branch was absorbed or deleted in this tranche.

## Semantic Result

- App/operator provider worker safe-action routes now consume the provider worker mutation guard. If a git developer checkout targets the default shared state root without explicit isolation or override, `provider-worker:temporal:start|restart` projects `route_status=blocked_by_provider_worker_mutation_guard`, `default_actionable=false` and `can_submit_to_safe_action_shell=false`.
- Provider SLO proof routes that depend on the blocked worker repair inherit the same blocked route status and are not selected as default `next_safe_action`.
- `opl runtime action execute --action provider-slo:temporal:production-proof --dry-run` on such a blocked route returns `execution_status=blocked` / `execution_kind=blocked_safe_action_route` and does not execute worker or proof commands.
- App/operator default selection skips `stage_production_evidence_receipt_record` routes already closed by verified stage evidence receipt plus domain-owned typed blocker with `evidence_obligation_summary.open_count=0`. The route can remain visible in full detail / bridge provenance for later domain/App/live owner supersession by real success refs.
- These changes do not lower provider SLO requirements, do not execute domain action, do not write domain truth, do not create owner receipt, do not close expected receipt / monitor freshness, and do not claim domain ready or production ready.

## Retirements / No-Resurrection Notes

- Retired reading a developer-checkout shared-state provider proof route as an executable default action when the worker mutation guard blocks the required worker repair.
- Retired reading typed-blocker-closed stage evidence record routes as default next actions when no evidence obligation remains open.
- No public CLI entry, module, test, workflow, worktree or branch was retired. The durable current boundary was folded into `docs/status.md`, `docs/active/current-state-vs-ideal-gap.md` and `docs/decisions.md`.

## Verification

This ledger is paired with fresh verification for the runtime tranche:

- `rtk git diff --check`
- conflict-marker scan over `README* docs src tests`
- focused provider/action tests:
  - `rtk node --experimental-strip-types --test tests/src/cli/cases/runtime-app-operator-drilldown-provider-worker-actions.test.ts tests/src/cli/cases/runtime-app-operator-stage-evidence-actions.test.ts tests/src/cli/cases/family-runtime-provider-slo.test.ts tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts`
- OPL doc doctor:
  - `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`
- Repo-native verification:
  - `rtk ./scripts/verify.sh`

## Coverage Ledger

- Snapshot repo inventory covered: all six default OPL series repos.
- Snapshot worktree/branch scope covered: OPL root selected; OPL queuehold, MAS preflight and App full-first-run lanes retained with explicit blocker reasons.
- Source/contracts/tests/docs audited: OPL provider worker / scheduler safe-action route source, runtime action execute blocked route handling, selected safe-action default filtering, focused tests, active status/gap/decision docs.
- Source/contracts/tests/docs changed: OPL runtime source/tests and core docs already present in the clean-ahead commits; this tranche adds only the coverage ledger and history index foldback.
- Archived/tombstoned/deleted docs: none.
- Retired modules/interfaces/tests/entries: none.
- Retained public surfaces: `opl runtime app-operator-drilldown`, `opl runtime action execute`, `opl family-runtime worker start|repair`, `opl family-runtime residency proof`, `opl framework readiness`.
- Uncovered docs in this tranche: remaining OPL README/docs body-level audit outside this runtime slice and all other five repos' README/docs.
- Snapshot blockers retained: OPL queuehold ahead/behind lane; MAS root ahead 18 and dirty preflight worktree plus old quality/details processes; App dirty root and dirty remote-backed full-first-run worktree; MAG/RCA/OMA snapshot-window prior-tranche writes but clean/synced.
- `post_snapshot_activity`: only closeout-time verification/build metadata and any future writes after `RUN_SNAPSHOT_TS` are next heartbeat intake; they did not expand this tranche.
- Next write scope: after this push, fresh-intake OPL queuehold, MAS ahead/preflight lane and App dirty/root remote-backed lanes; continue OPL support docs only where fresh source/contracts/tests/read-model show stale counters, dated proof snapshots, branch/SHA anchors, provider/App shortcut claims or compatibility promises.
