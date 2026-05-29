# OPL Series Doc Governance Ledger - AI-first Optimization Reference

Owner: `One Person Lab`
Purpose: `opl_series_doc_governance_ai_first_optimization_reference_ledger`
State: `historical_archive`
Machine boundary: 本文只记录本轮文档治理覆盖、证据、阻塞与下一轮写入范围。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 与各 domain owner receipt。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T19:16:25Z`
- Local snapshot time: `2026-05-30T03:16:25+0800`
- Frozen scope: OPL series 6 repo inventory at snapshot only. Snapshot-after activity is recorded as next heartbeat intake and does not expand this tranche.

## Frozen Repo / Lane Inventory

| Repo | Snapshot state | Handling |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `00d00708708c`; extra worktree `.worktrees/github-ci-20260530-opl-queuehold` on `fix/github-ci-20260530-opl-queuehold`, behind main by 1, dirty `src/family-runtime-dispatch-command.ts`, recent writes in snapshot window. | Root `main` is this docs-only tranche owner. Dirty/recent queuehold lane retained. |
| `med-autoscience` | Root clean but ahead `origin/main` by 17 at `9a225c4e`; worktree `.worktrees/github-ci-20260530-mas-preflight` dirty in `src/med_autoscience/dev_preflight_contract.py` and `tests/test_dev_preflight_contract.py`. | Retained as frozen blocker / external active lane. |
| `med-autogrant` | Clean/synced at `3fc5041`. | No write in this tranche. |
| `redcube-ai` | Root clean/synced at `d95bcb8`; worktree `/Users/gaofeng/workspace/redcube-ai-opl-evidence-tranche` on `codex/rca-evidence-scaleout-20260530`, dirty contracts/docs/src/tests evidence-scaleout lane. | Retained as dirty/recent lane. |
| `opl-meta-agent` | Clean/synced at `59e216d`. | No write in this tranche. |
| `one-person-lab-app` | Root dirty/synced at `eadbde5` with six dirty files; dirty remote-backed worktree `.worktrees/codex/full-first-run-stable-gate-20260525`. | Retained as dirty/remote-backed App lane. |

## Tranche Scope

This tranche only governs `one-person-lab` runtime-substrate support reference text:

- Reviewed and edited: `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`
- Reviewed as owner/currentness context: `TASTE.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/references/runtime-substrate/README.md`, `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`, `docs/docs_portfolio_consolidation.md`
- History foldback: this ledger and `docs/history/process/plans/README.md`

No source, contract, test, workflow, worktree, branch, remote branch, App lane, MAS lane or RCA lane was absorbed or deleted in this tranche.

## Live Truth Used

- `docs/invariants.md` owns the stable AI-first / executor-first / contract-light constraints, Surface Budget, AI Capability Aperture and external framework boundary.
- `docs/decisions.md` records the active AI-first / contract-light decision and the rule that external frameworks only contribute governance vocabulary, not runtime, planner, proof assistant, workflow compiler or domain verdict authority.
- `docs/docs_portfolio_consolidation.md` and `docs/references/runtime-substrate/README.md` classify the target document as support reference, not active truth, current readiness evidence, release gate or next-run baton.
- The active truth / gap owner remains `docs/active/current-state-vs-ideal-gap.md`; dynamic readiness, worklist, App user-path, OMA production-consumption and MAS/MAG/RCA owner-chain state must be re-read from fresh CLI/read-model and owner receipts.

## Changes

- Retired the fixed `Date: 2026-05-29` anchor from the support reference.
- Added a `Currentness policy` section that forbids freezing branch/SHA, counters, readiness, App release state, OMA state, domain owner-chain state, provider proof state or next action in this reference.
- Reframed `当前系统评估` into stable audit language: durable criteria and audit risks instead of a frozen live-state assessment.
- Reframed `下一轮可执行方向` into long-horizon optimization candidates plus intake criteria; execution priority must be derived from fresh live gates each run.
- Preserved the external framework absorption table and AI-first / executor-first prompt while making clear that external frameworks do not enter OPL runtime truth, planner, proof assistant, workflow compiler or domain authority.

## Retirements / No-Resurrection Notes

- Retired reading this support reference as current readiness, App release readiness, OMA production-consumption status, MAS/MAG/RCA owner-chain status, provider proof state or next-run action queue.
- Retired dated `current system assessment` wording as a source of live truth.
- No code module, interface, test, workflow, public CLI entry or branch was retired.

## Verification

Commands were run after the edit on `one-person-lab` `main`:

- `rtk git diff --check`
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md`
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`
- `rtk ./scripts/verify.sh line-budget`

Verification results are recorded in the automation memory for this run.

## Coverage Ledger

- Snapshot repo inventory covered: all six default OPL series repos.
- Snapshot worktree/branch scope covered: OPL root and dirty/recent/remote-backed lanes in OPL, MAS, RCA and App were classified.
- Source/contracts/tests/docs audited: target support reference plus OPL core currentness owner docs listed above.
- Source/contracts/tests/docs changed: only the target support reference, this ledger and history process index.
- Archived/tombstoned/deleted docs: none.
- Retired modules/interfaces/tests/entries: none.
- Retained public surfaces: all public surfaces retained; this tranche only corrected support-reference role/currentness.
- Uncovered docs in this tranche: remaining `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, and other support docs still require section-by-section audit under future heartbeats.
- Snapshot blockers retained: OPL queuehold worktree, MAS ahead/dirty preflight lane, RCA evidence-scaleout worktree, App root dirty and App full-first-run worktree.
- `post_snapshot_activity`: any writes, PRs, processes, branches or dirty files appearing after `RUN_SNAPSHOT_TS` are next heartbeat intake only and were not used to expand this tranche.
- Next write scope: continue OPL runtime-substrate / operating-governance support-reference cleanup for fixed counters, dated proof snapshots, branch/SHA anchors, local proof paths, stale provider/MDS wording, App release shortcuts and compatibility promises; separately fresh-intake MAS, RCA and App retained lanes before any absorb/cleanup decision.
