# OPL Series Doc Governance Ledger - Stage-Led Roadmap Support Reference

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_stage_led_roadmap_support_reference_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮文档治理覆盖、证据、阻塞与下一轮写入范围。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 与各 domain owner receipt。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T19:41:32Z`
- Local snapshot time: `2026-05-30T03:41:32+0800`
- Frozen scope: OPL series 6 repo inventory at snapshot only. Snapshot-after activity is next heartbeat intake and did not expand this tranche.

## Frozen Repo / Lane Inventory

| Repo | Snapshot state | Handling |
| --- | --- | --- |
| `one-person-lab` | Root `main` clean/synced at `4de27993f86c`; extra worktree `.worktrees/github-ci-20260530-opl-queuehold` on `fix/github-ci-20260530-opl-queuehold`, clean but ahead 1 / behind 1 relative to `origin/main`, with snapshot/proximal writes. | Root `main` selected for docs-only tranche. Queuehold lane retained as recent/unmerged lane. |
| `med-autoscience` | Root `main` clean but ahead `origin/main` by 17 at `9a225c4e3688`; `.worktrees/github-ci-20260530-mas-preflight` dirty in preflight contract source/test; `.worktrees/mas-physical-thinning-20260530` dirty across contracts/docs/source/tests and had snapshot/post-snapshot writes. | Retained as ahead/dirty/recent external lanes. |
| `med-autogrant` | Clean/synced at `3fc5041c645e`; remote-only non-codex `origin/feature/ai-narration-contracts`. | No write in this tranche. |
| `redcube-ai` | Root clean but ahead `origin/main` by 1 at `2f3e9ce9818d`; snapshot window had production-acceptance/runtime-program source/contracts/tests/docs writes plus build metadata. | Retained as ahead/recent external lane. |
| `opl-meta-agent` | Clean/synced at `59e216dd37a3`. | No write in this tranche. |
| `one-person-lab-app` | Root dirty/synced at `eadbde57adeb`; dirty remote-backed `.worktrees/codex/full-first-run-stable-gate-20260525` on `codex/full-first-run-stable-gate-20260525`. | Retained as dirty/remote-backed App lane. |

Open PR check returned `[]` for OPL, MAS, MAG and App. RCA and OMA GraphQL PR queries hit GitHub connection reset during initial inventory; they were not used to justify cleanup. Process scan showed long-running MAS `scripts/verify.sh structure` / `opl quality details` processes and the App actions runner service; no process belonged to this docs-only tranche.

## Tranche Scope

This tranche only governs the OPL runtime-substrate stage-led framework roadmap support reference:

- Edited: `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- Added: this ledger
- Updated: `docs/history/process/plans/README.md`
- Reviewed as context: `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/status.md`, `docs/architecture.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/README.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`.

No source, contract, test, workflow, worktree, branch, remote branch, App lane, MAS lane or RCA lane was absorbed or deleted.

## Fresh Evidence

Fresh read-model samples at this run:

- `./bin/opl framework readiness --family-defaults --json`: status `framework_control_plane_available_with_blocked_refs_only_attention`, hard blockers `0`, provider cadence window `window_cadence_satisfied`, capability SLO `capability_slo_satisfied`, blocked refs-only attention still present, and authority boundary still forbids domain ready / production ready / artifact authority / quality verdict claims.
- `./bin/opl stages readiness --family-defaults --json`: status `launch_warning`, domain count `4`, stage count `19`, admitted stage count `19`, hard blockers `0`, warnings `58`; stage readiness remains CLI summary / diagnostic lens only.
- `./bin/opl runtime app-operator-drilldown --json`: available refs-only App/operator read model; summary includes provider SLO satisfied, open app/user-path evidence gates `0`, Codex App runtime evidence gate `0`, OMA production consumption open gate `0`, while `app_release_user_path_release_ready_claimed=false`, `app_release_user_path_production_ready_claimed=false`, `codex_app_drives_long_running_tasks=false`, and next safe action was provider worker start due to worker not ready.
- `./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`: open worklist `0`, closed refs-only items `385`, zero-open worklist still reports blocked refs-only attention and explicitly says zero-open is not completion, domain ready, production ready, physical delete authorization or default-caller delete ready.
- `./bin/opl agents conformance --family-defaults --json`: structural conformance passed for 4 repos with 0 blockers and production evidence tails reported separately.
- `./bin/opl agents default-callers --family-defaults --json`: generated/default caller surface count `32`, blocked `0`, missing owner/typed-blocker `0`, missing no-forbidden-write `0`, missing tombstone/provenance `0`, while physical delete remains unauthorized by this projection.

## Changes

- Replaced the roadmap's fixed `分层完成度` table, shared-package SHA status, `已落地的 framework 能力`, `尚未完成的生产闭环`, and fixed `离理想生产级框架还有多远` current-state table with stable `支撑读法与动态证据入口` and `距离理想生产级框架的判断口径`.
- Kept roadmap as a support reference for owner split, runtime substrate, stage-led execution, domain skeleton, language/runtime dependency and retirement discipline.
- Moved current counters, per-domain snapshots, App/Aion evidence, MAS paper-line samples, shared package SHA and proof closeout narrative into this history ledger / live read-model boundary instead of the long-lived roadmap.

## Retirements / No-Resurrection Notes

- Retired reading the roadmap as a current completion table, live evidence ledger or active execution queue.
- Retired stale fixed shared package SHA / conformance counter / App-Aion snapshot / DM002-DM003-Obesity sample wording as current OPL family truth.
- Retired any reading that structural conformance, generated/default caller readiness, provider proof, App/user-path evidence, Codex App runtime evidence, OMA consumption, Developer Mode closeout, external evidence or cleanup ledger authorizes domain ready, production ready, quality/export verdict, artifact authority, owner receipt or domain repo physical delete.
- No public CLI entry, code module, test, workflow, worktree or branch was retired.

## Verification

Fresh verification completed for this docs-only tranche:

- `rtk git diff --check`: passed.
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md`: no matches.
- `rtk rg -n '2b08c7efd8acd80355e870087d4ce5be7b45d4d1|已落地的 framework 能力|尚未完成的生产闭环|functional_closure_ready_for_live_soak|Aion runtime workbench|2026-05-17' docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`: no matches.
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`: `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=187`.
- `rtk ./scripts/verify.sh line-budget`: passed.

## Coverage Ledger

- Snapshot repo inventory covered: all six default OPL series repos.
- Snapshot worktree/branch scope covered: OPL root and OPL/MAS/App retained worktrees plus RCA ahead root lane were classified.
- Source/contracts/tests/docs audited: OPL stage-led roadmap support reference, runtime-substrate index, ideal-state reference, active gap plan, core status/architecture and live read-model outputs listed above.
- Source/contracts/tests/docs changed: only the roadmap support reference, this ledger and history process index.
- Archived/tombstoned/deleted docs: none.
- Retired modules/interfaces/tests/entries: none.
- Retained public surfaces: `opl framework readiness`, `opl stages readiness`, `opl runtime app-operator-drilldown`, `opl family-runtime evidence-worklist`, `opl agents conformance`, `opl agents default-callers`.
- Uncovered docs in this tranche: remaining `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, `docs/runtime/**`, current-support docs and the other five repos' README/docs body-level audits.
- Snapshot blockers retained: OPL queuehold worktree, MAS ahead/dirty preflight lane, MAS dirty physical-thinning lane, RCA ahead/recent lane, App root dirty and App full-first-run worktree.
- `post_snapshot_activity`: MAS physical-thinning continued writing after snapshot; RCA and OPL queuehold had proximal writes; none expanded this tranche.
- Next write scope: continue OPL runtime-substrate / operating-governance support-reference cleanup for fixed counters, dated proof snapshots, branch/SHA anchors, local proof paths, stale provider/MDS wording, App release shortcuts and compatibility promises; separately fresh-intake MAS, RCA and App retained lanes before any absorb/cleanup decision.
