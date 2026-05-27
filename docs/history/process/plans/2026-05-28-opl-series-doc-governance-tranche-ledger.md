# 2026-05-28 OPL Series Doc Governance Tranche Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-28`

## Tranche scope

本轮先盘点 OPL series 6 个 repo 的 `main`、worktree、branch、dirty/ahead/behind、远端 PR 线索和相关后台进程，然后处理确认 stale 且已并入 `main`/`origin/main` 的 codex 远端分支，并做一个低冲突文档治理 tranche。

文档治理主写入范围选择 `opl-meta-agent` 只读覆盖审计和 OPL 主仓历史 ledger。OMA 当前 README/docs 已有 repo-local coverage ledger，且本轮 live truth 未发现需要重写的 stale current truth；因此本轮只把跨仓状态、验证和剩余覆盖范围折回 OPL 主仓历史账本，不关闭全局 `/goal`。

## Repository status snapshot

| Repo | Main state after fetch | Worktree / branch state | Process / PR notes |
| --- | --- | --- | --- |
| `one-person-lab` | `main` clean, `0 behind / 0 ahead` before this ledger. | No extra local worktree. Recently written root checkout and live Temporal/provider-related processes were present. | No open PR found. Two stale codex remote branches were confirmed merged into `origin/main` and deleted. |
| `med-autoscience` | `main` clean at start and ahead of `origin/main`; after this run contains a focused local source-shape fix. | No extra local worktree. Live MAS/OPL quality and verify processes were observed. | No open PR found. Stale codex remote branch was confirmed merged into `origin/main` and deleted. Repo-level `scripts/verify.sh structure` remains blocked by existing ahead-main structural regression versus `origin/main`; do not push this main until that gate is closed. |
| `med-autogrant` | `main` clean, `0 behind / 27 ahead`. | No extra local worktree; no recent writes in the root checkout. | No open PR found. Stale `origin/codex/docs-lifecycle-mag` was confirmed merged into `origin/main` and deleted. |
| `redcube-ai` | `main` clean at start and ahead of `origin/main`; this run added one test registry baseline fix. | No extra local worktree; recent `.codegraph` write was ignored as index state. | No open PR found. Stale `origin/codex/docs-lifecycle-rca` was confirmed merged into `origin/main` and deleted. |
| `opl-meta-agent` | `main` clean, `0 behind / 6 ahead`. | No extra local worktree; no recent writes in the root checkout. | No open PR found. |
| `one-person-lab-app` | `main` clean, `0 behind / 7 ahead`. | `codex/full-first-run-stable-gate-20260525` is dirty and unmerged; `codex/release-telemetry-ci-fix` is clean but had recent writes and is unmerged. Both were retained. | No open PR found. Remote branches for the two retained lanes are unmerged and were not deleted. |

## Stale lane actions

Deleted remote branches after confirming `merged_main=true`, `merged_origin=true`, `ahead_main=0`, no open PR, and codex/automation stale ownership:

- `one-person-lab`: `origin/codex/opl-dm002-deadletter-dedupe-redrive-20260527`
- `one-person-lab`: `origin/codex/opl-temporal-provider-repair-managed-state-20260527`
- `med-autoscience`: `origin/codex/mas-dm002-blocked-closeout-stage-log-20260527`
- `med-autogrant`: `origin/codex/docs-lifecycle-mag`
- `redcube-ai`: `origin/codex/docs-lifecycle-rca`

Retained:

- `one-person-lab-app/.worktrees/codex/full-first-run-stable-gate-20260525`: dirty, unmerged, remote branch unmerged.
- `one-person-lab-app/.worktrees/codex/release-telemetry-ci-fix`: unmerged and had writes within the last hour.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | `AGENTS.md`, `TASTE.md`, OPL Doc Governance skill, `docs/active/current-state-vs-ideal-gap.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/opl-family-development-reference.md`, `docs/status.md`, existing process ledger index. | `opl_doc_doctor.py doctor`, git worktree/branch/dirty/ahead-behind checks, `gh pr list`, stale branch containment checks, active process scan. |
| `opl-meta-agent` | Root `README.md`, `README.zh-CN.md`, `docs/README.md`, core five, active gap plan, private implementation inventory, docs governance ledger, ideal-state reference, package scripts, contracts list, agent pack README/support tree, tests list. | `opl_doc_doctor.py doctor`, `npm test`, `npm run typecheck`, contract reads for `functional_structure_gap_count=0`, `domain_repo_retained_generic_surface_count=0`, `remaining_tail_kinds`, and pack required paths. |
| `med-autogrant` | Branch/docs lifecycle state only; existing ahead-main diff classified as already committed local work. | `opl_doc_doctor.py doctor`, `scripts/verify.sh`, git diff checks. |
| `redcube-ai` | Branch/docs lifecycle state plus fast-lane registry failure root cause. | `opl_doc_doctor.py doctor`, `npm run test:fast`; fixed stale fast count baseline after the newly absorbed fast lane reached 37 files. |
| `one-person-lab-app` | Branch/worktree/docs lifecycle state only; app body docs not edited due active release worktrees. | `opl_doc_doctor.py doctor`, `npm run test:release-boundary`, git diff checks. |
| `med-autoscience` | Branch/process/docs lifecycle state plus source-shape verification failure triage. | `opl_doc_doctor.py doctor`, `scripts/verify.sh structure`, focused owner-route closeout tests. |

## Edited documents

| File | Change |
| --- | --- |
| `docs/history/process/plans/2026-05-28-opl-series-doc-governance-tranche-ledger.md` | Added this cross-repo coverage ledger for the current tranche. |
| `docs/history/process/plans/README.md` | Added the new ledger to the historical plans index. |

## Archived / tombstoned / deleted documents

None. No README/docs path was proven stale enough to archive, tombstone, or delete in this tranche.

## Verification evidence

| Repo | Verification | Result |
| --- | --- | --- |
| `opl-meta-agent` | `npm test`; `npm run typecheck`; contract JSON reads. | `47 passed`; typecheck passed; functional privatization contract still reads `functional_structure_gap_count=0`, `domain_repo_retained_generic_surface_count=0`. |
| `redcube-ai` | `npm run test:fast` after updating the fast-lane baseline. | Passed: parallel fast batch `184 passed`, serialized route-heavy batches `9 passed`, `11 passed`, `9 passed`, `1 passed`. |
| `one-person-lab-app` | `npm run test:release-boundary`; `git diff --check origin/main..main`; `git diff --check`. | `65 passed`; diff checks clean. |
| `med-autogrant` | `scripts/verify.sh`; `git diff --check origin/main..main`; `git diff --check`. | `4 passed, 662 deselected`; `225 passed, 441 deselected, 154 subtests passed`; diff checks clean. |
| `med-autoscience` | `scripts/run-pytest-clean.sh -q tests/test_cli.py::test_domain_handler_dispatch_evidence_payload_projects_stage_attempt_closeout_typed_blocker tests/test_cli.py::test_domain_handler_dispatch_evidence_payload_projects_stage_attempt_owner_receipt_closeout`; `scripts/verify.sh structure`. | Focused owner-route closeout tests passed `2 passed`. Structure gate remains blocked by ahead-main complex-function total versus `origin/main`, though OPL quality details no longer reports new/worsened complex functions for the touched function after the split. |

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside the listed current-truth/support/history ledger sections remain unreviewed in this tranche.
- `med-autoscience`: content-level README/docs audit remains; structure-gate-blocked ahead-main state prevents push/closeout.
- `med-autogrant`: content-level README/docs audit remains beyond doctor/preflight and verification of current ahead main.
- `redcube-ai`: content-level README/docs audit remains beyond doctor/preflight and fast-lane verification.
- `opl-meta-agent`: current repo-root `README*` and `docs/**/*.md` were re-read for drift; future changes need a new ledger entry.
- `one-person-lab-app`: content-level README/docs audit remains, especially App release/user-guide/status docs, once active release worktrees are safe or explicitly handed over.

## Remaining stale / retire candidates

- `one-person-lab-app` retained unmerged branches require owner follow-up: one dirty stable-gate lane and one recently-written release telemetry lane.
- `med-autoscience` ahead-main structure gate must be closed before pushing; the current blocker is overall complex-function count versus `origin/main`, not the refactored closeout owner receipt helper.
- OMA remaining work is evidence/hygiene rather than doc-path retirement: repeat long-soak/App live render-runtime drilldown, more real target patch-loop owner receipt or typed blocker samples, standard target-agent handoff convergence, and script-to-pack / OPL primitive hygiene.
- OPL/MAS/MAG/RCA/App still need section-level portfolio audits before the global OPL series `/goal` can be closed.

## Next write scope

1. Close or explicitly route the `med-autoscience` structure gate before pushing its ahead main.
2. Continue App docs only after the two App release lanes are clean, merged, or explicitly assigned to this governance goal.
3. Otherwise choose a clean repo tranche: MAG or RCA support/history docs section audit, then fold current truth into each repo's active plan and leave a repo-local coverage ledger.
4. Keep each verified tranche separate from global completion; the global `/goal` remains open until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
