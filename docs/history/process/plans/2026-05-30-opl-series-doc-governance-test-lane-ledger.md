# OPL Series Doc Governance Test Lane Ledger

Owner: `One Person Lab`
Purpose: `process_history_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 2026-05-30 自动化 tranche 的人读覆盖、验证和保留理由。机器 truth 继续归 source、contracts、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 repo state。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:27:14Z`
- Local snapshot time: `2026-05-30T02:27:14+0800`
- Governed scope: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`
- Tranche: OPL test lane support-reference currentness cleanup.

## Frozen Inventory

| Repo | Snapshot state | Treatment |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `5458e8d80d6c`; only root worktree; recent writes in the previous automation docs/source tranche. | Safe for a docs-only support-reference tranche; no branch/worktree cleanup required. |
| `med-autoscience` | `main` clean but ahead `origin/main` by 16 at `4e0ee8f4da74`; `git fetch` failed with GitHub LibreSSL connection error; long-running `scripts/verify.sh structure` and `opl quality details --root med-autoscience` processes remain. | Retained. Requires separate semantic intake; no deletion or absorption in this tranche. |
| `med-autogrant` | `main` clean/synced at `3fc5041c645e`; only root worktree; remote-only `origin/feature/ai-narration-contracts` retained. | No current cleanup action. |
| `redcube-ai` | `main` clean/synced at `d95bcb832acb`; only root worktree, but snapshot window includes broad native-PPT/runtime-program source, contracts, tests and docs writes; an RCA native-PPT focused test process appeared after the snapshot. | Retained as active/recent RCA lane; no deletion or absorption in this tranche. |
| `opl-meta-agent` | `main` clean/synced at `59e216dd37a3`; only root worktree. | No current cleanup action. |
| `one-person-lab-app` | Root `main` dirty/synced at `eadbde57adeb`; dirty remote-backed worktree `.worktrees/codex/full-first-run-stable-gate-20260525`; open PR REST fallback returned `[]`. | Retained because dirty and remote-backed. |

## Reviewed Surfaces

- `docs/references/current-support/opl-test-lane-governance.md`
- `package.json`
- `scripts/test-lanes.mjs`
- `scripts/verify.sh`
- `scripts/run-parallel-test-lanes.sh`
- `scripts/run-structural-quality-gate.sh`
- `.github/workflows/verify.yml`
- `.github/workflows/sentrux-advisory.yml`
- `docs/history/process/plans/README.md`
- Fresh diagnostic sample: `./bin/opl quality details --root . --format json --limit 3 --focus rules --compare-ref origin/main`

## Changes

- Added an explicit currentness policy to the test lane governance reference: lane membership, test file lists, CI pass/fail state, Sentrux baseline numbers and quality details counters must be read from fresh machine surfaces.
- Split stable role prose into `scripts/test-lanes.mjs` lanes and `scripts/verify.sh` lanes, adding current `fast-parallel`, `meta`, `family`, `lint`, `typecheck` and `line-budget` semantics.
- Clarified that GitHub `Verify` does not run `artifact` or `full` as independent jobs; those remain local / clean-clone release-style verification entries.
- Extended skip-scan guidance to `tests/src` and `tests/built`, matching the active tracked-test boundary used by `assert-coverage`.

## Retirements

- Retired stale support-doc implication that the lane table was complete without `meta` / `fast-parallel` and `verify.sh`-only lanes.
- Retired any reading of this support doc as a CI pass oracle, frozen test-file inventory, Sentrux replacement, merge policy, release readiness proof, or domain readiness proof.
- No source, contract, workflow, module, CLI entry, test file, worktree or branch was retired in this tranche.

## Coverage Ledger

- Reviewed source/contracts/tests/docs: listed under `Reviewed Surfaces`.
- Changed source/contracts/tests/docs: only `docs/references/current-support/opl-test-lane-governance.md`, this ledger, and the process plans index.
- Archived/tombstoned/deleted docs: none.
- Preserved public surfaces: all lane names and commands remain in machine owners; this doc only explains current maintenance semantics.
- Uncovered docs: remaining current-support, runtime-substrate and operating-governance references not named in this ledger.
- Remaining stale/retire candidates: support docs that still carry fixed counters, branch/SHA state, dated provider proof snapshots, local proof paths, stale MDS/provider wording, App release/user-path shortcuts, or compatibility promises.
- Next tranche write scope: continue OPL support-reference cleanup, prioritizing `docs/references/current-support/opl-quality-details.md`, `docs/references/current-support/opl-docker-webui-deployment.md`, remaining `docs/references/runtime-substrate/**`, and `docs/references/operating-governance/**`.

## Post Snapshot Activity

- RCA native-PPT focused test process appeared after `RUN_SNAPSHOT_TS`; it was recorded to avoid interference and did not expand this tranche scope.
- Any repo state, branch, worktree, remote, process or dirty-file activity after `RUN_SNAPSHOT_TS` belongs to the next heartbeat intake unless it blocks this tranche directly.

## Verification

- `rtk node scripts/test-lanes.mjs list` confirmed live lane registry includes `smoke`, `fast`, `fast-parallel`, `read-model-gates`, `meta`, `regression`, `integration`, `artifact` and `fresh-install`.
- `rtk node scripts/test-lanes.mjs assert-coverage` passed: all 214 active test files are assigned to a test lane.
- `rtk git diff --check` passed.
- `rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md` returned no matches.
- `rg -n 'test\\.skip|describe\\.skip' tests/src tests/built` returned no matches.
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json` returned `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=181`.
- `rtk ./scripts/verify.sh line-budget` passed.
