# OPL Series Operating Governance Index Ledger

Owner: `One Person Lab`
Purpose: `process_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 automation-2 本轮 operating-governance index foldback。当前 truth 继续归 active owner docs、contracts/source/tests、CLI/read-model、runtime ledger 和 domain-owned manifests。

## Run Scope

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:01:56Z`
- 本轮 tranche: `one-person-lab` operating-governance index foldback after structure advisory scope cleanup。
- 覆盖文档: `docs/references/operating-governance/README.md`、`docs/references/operating-governance/family-structure-advisory-report.md`、`docs/history/process/plans/2026-05-30-opl-series-doc-governance-structure-advisory-ledger.md`、core docs and active gap plan as support reads.
- 覆盖机器面: `scripts/family-structure-advisory.mjs` and `tests/src/family-structure-advisory.test.ts`.

## Frozen Inventory

- `one-person-lab`: clean/synced at `e19b9e1d6752`; only root worktree; snapshot-window recent writes came from prior automation OPL docs tranche.
- `med-autoscience`: clean but ahead `origin/main` by 16 at `4e0ee8f4da74`; long-running structure / quality details processes retained.
- `med-autogrant`: clean/synced at `3fc5041c645e`; snapshot-window recent docs / marketplace writes retained.
- `redcube-ai`: root had post-snapshot head movement and unmerged native-PPT/RCA conflicts; multiple dirty worktrees retained and classified as protected/post-snapshot activity.
- `opl-meta-agent`: clean/synced at `59e216dd37a3`; snapshot-window docs portfolio write retained.
- `one-person-lab-app`: root dirty/synced at `eadbde57adeb`; full-first-run remote-backed worktree dirty and retained.
- Open PRs: all six repos read as `[]`.

## Change

`docs/references/operating-governance/README.md` now reflects the current role of `family-structure-advisory-report.md`: `active_support_dated_snapshot`, with default command scope corrected to the current six OPL series repos and exact findings still requiring fresh refresh before reuse.

No source, contracts, tests, workflows, CLI entries, modules, interfaces, or public machine-readable surfaces changed in this tranche.

## Verification

- `rtk git diff --check`: passed.
- `rtk rg -n "^(<<<<<<<|>>>>>>>|=======)" docs/references/operating-governance/README.md docs/history/process/plans/2026-05-30-opl-series-doc-governance-operating-index-ledger.md docs/history/process/plans/README.md`: no matches.
- `python3 /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`: `finding_count=0`, `active_truth_health=pass`.
- `node --experimental-strip-types --test tests/src/family-structure-advisory.test.ts`: 4 passed / 0 failed.
- `rtk ./scripts/verify.sh line-budget`: passed.

## Carry Forward

- Continue checking support indexes after each reference-doc cleanup so stale lifecycle state does not remain in the index.
- Non-OPL structure advisory findings still require clean or explicitly owner-approved refresh before commit-bound foldback.
- Snapshot-retained lanes remain for MAS ahead-main work, RCA dirty/post-snapshot native-PPT conflict work, MAG/OMA recent writes, and App dirty root/full-first-run worktree.
