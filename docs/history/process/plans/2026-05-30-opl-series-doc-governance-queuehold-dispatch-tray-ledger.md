# OPL Series Doc Governance Ledger - Queuehold Dispatch Tray Absorb

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_queuehold_dispatch_tray_absorb_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮 OPL queuehold clean-lane 吸收的覆盖、证据、验证、保留边界和下一轮入口。机器真相继续归 `contracts/`、source、tests、CLI/API 行为、runtime ledger、provider receipt、App/operator projection 与 domain owner refs。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T21:02:05Z`
- Local snapshot time: `2026-05-30T05:02:05+0800`
- Frozen scope: OPL series 6 repo inventory at snapshot only. Snapshot-after activity belongs to next heartbeat intake and did not expand this tranche.
- Selected lane: OPL clean queuehold worktree commit `c6a51ce5 Fix family runtime MAS dispatch and tray usage`, absorbed through isolated worktree `/tmp/opl-queuehold-absorb-20260530` from `origin/main`.

## Frozen Repo / Lane Inventory

| Repo | Snapshot state | Handling |
| --- | --- | --- |
| `one-person-lab` | Root `main` synced at `3e5b7c73` but dirty in `tests/src/cli/cases/family-runtime-evidence-worklist.test.ts`. Worktree `.worktrees/provider-scheduler-guard-20260530` was dirty/recent. Worktree `.worktrees/github-ci-20260530-opl-queuehold` was clean, ahead 1 / behind 6, with commit `c6a51ce5`. | Root and provider-scheduler dirty lanes retained. Queuehold clean commit selected, cherry-picked into isolated worktree for verification and push without mixing root dirty changes. |
| `med-autoscience` | Root clean ahead 18 at `e41b6b4b`; dirty preflight worktree in `src/med_autoscience/dev_preflight_contract.py` and `tests/test_dev_preflight_contract.py`; old quality/details and verify processes observed. | Retained as ahead/dirty/process-active MAS lane. |
| `med-autogrant` | Clean/synced at `f1dd6cb`; snapshot-window docs/marketplace writes from prior tranche. | No write in this tranche. |
| `redcube-ai` | Clean/synced at `d4a0171`; snapshot-window ledger/build metadata writes from prior RCA tranche. | No write in this tranche. |
| `opl-meta-agent` | Clean/synced at `312d623`; snapshot-window docs writes from prior OMA tranche. | No write in this tranche. |
| `one-person-lab-app` | Root dirty at `eadbde5` in shell candidate contracts, active/status/docs and validation script; dirty remote-backed `.worktrees/codex/full-first-run-stable-gate-20260525`. | Retained as dirty/remote-backed App lane. |

Open PR checks returned `[]` for all six repos. Any process or file activity observed after `RUN_SNAPSHOT_TS` was treated as `post_snapshot_activity` and was not used to expand the absorb scope.

## Tranche Scope

This tranche absorbs and governs the OPL queuehold commit after cherry-pick onto current `origin/main`:

- `8d3d85d6 Fix family runtime MAS dispatch and tray usage`

Reviewed source/test/docs surfaces:

- Source: `src/family-runtime-dispatch-command.ts`, `src/runtime-tray-stage-attempt-items.ts`, `src/family-runtime-stage-attempt-query.ts`, `src/family-runtime-stage-progress-log.ts`, `src/family-runtime-stage-attempt-usage.ts`, `src/runtime-tray-stage-attempt-workbench-parts/metadata.ts`.
- Tests: `tests/src/cli/cases/family-runtime.test.ts`, `tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts`, plus grep-backed coverage for `OPL_FAMILY_RUNTIME_MAS_DISPATCH`, `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH`, `model_route_cost_projection` and `stage_attempt_workbench`.
- Docs: `docs/decisions.md`, this ledger and the process history index.

No MAS/MAG/RCA/OMA/App source, contracts, tests, docs, worktree or branch was absorbed or deleted in this tranche.

## Semantic Result

- MAS family-runtime dispatch explicit override now accepts `OPL_FAMILY_RUNTIME_MAS_DISPATCH` before `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH`. The short key is the stable admitted-domain shorthand for operator wiring and tests; it is not a compatibility facade and does not change MAS authority.
- Non-MAS dispatch overrides remain domain-id based through `OPL_FAMILY_RUNTIME_${DOMAIN}_DISPATCH`.
- If no explicit MAS override is set, dispatch still uses the workspace-binding command when supplied, then the active OPL module locator for `medautoscience`.
- Stage attempt operator items now include `stage_attempt_workbench.model_route_cost_projection`, matching the existing attempt query, stage progress log, workbench summary and dead-letter item contract/test surfaces.
- These changes do not write MAS study truth, create MAS owner receipts, authorize publication quality, alter executor route selection, auto-degrade model route, or claim domain/production ready.

## Retirements / No-Resurrection Notes

- Retired the stale reading that only `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH` can override MAS dispatch.
- Retired the stale App/operator item projection gap where model route/cost details were available in workbench/query surfaces but absent from per-attempt tray items.
- No public CLI entry, module, workflow, worktree or branch was retired in this tranche. The original queuehold worktree/branch is retained until the pushed `main` absorb is rechecked and cleaned in a later heartbeat.

## Verification

This ledger is paired with fresh verification for the queuehold absorb:

- `rtk git diff --check`
- conflict-marker scan over `README* docs src tests`
- focused CLI tests:
  - `rtk node --experimental-strip-types --test tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts`
- OPL doc doctor:
  - `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /tmp/opl-queuehold-absorb-20260530 --format json`
- Repo-native verification:
  - `rtk ./scripts/verify.sh`

## Coverage Ledger

- Snapshot repo inventory covered: all six default OPL series repos.
- Snapshot worktree/branch scope covered: OPL queuehold clean lane selected; OPL root dirty test, OPL provider-scheduler dirty worktree, MAS dirty preflight lane and App dirty/root remote-backed lanes retained with explicit blocker reasons.
- Source/contracts/tests/docs audited: MAS dispatch command source, runtime tray stage-attempt item projection, existing dispatch and route/cost projection tests, decisions doc and history process index.
- Source/contracts/tests/docs changed: OPL dispatch source, runtime tray item source, `docs/decisions.md`, this history ledger and the process history index.
- Archived/tombstoned/deleted docs: none.
- Retired modules/interfaces/tests/entries: none.
- Retained public surfaces: `opl family-runtime tick`, `opl family-runtime queue hold`, `opl family-runtime attempt query`, `opl runtime snapshot`, `opl runtime app-operator-drilldown`.
- Uncovered docs in this tranche: remaining OPL README/docs body-level audit outside this narrow runtime slice and all other five repos' README/docs.
- Snapshot blockers retained: OPL root dirty evidence-worklist test, OPL provider-scheduler dirty/recent worktree, original OPL queuehold worktree pending later cleanup, MAS root ahead 18 and dirty preflight worktree plus old quality/details processes, App dirty root and dirty remote-backed full-first-run worktree, MAG/RCA/OMA snapshot-window prior-tranche writes but clean/synced.
- `post_snapshot_activity`: new writes/processes after `RUN_SNAPSHOT_TS` were recorded for next heartbeat only and did not expand this tranche.
- Next write scope: after this push, fresh-intake OPL provider-scheduler dirty lane, original queuehold worktree cleanup eligibility, MAS ahead/preflight lane and App dirty/root remote-backed lanes; choose one clean, semantically decidable tranche with fresh source/contracts/tests/docs evidence.
