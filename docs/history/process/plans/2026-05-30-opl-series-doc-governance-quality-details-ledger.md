# OPL Series Doc Governance Quality Details Ledger

Owner: `One Person Lab`
Purpose: `process_history_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 2026-05-30 自动化 tranche 的人读覆盖、验证和保留理由。机器 truth 继续归 source、contracts、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 repo state。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:37:46Z`
- Local snapshot time: `2026-05-30T02:37:46+0800`
- Governed scope: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`
- Tranche: OPL quality-details support-reference currentness cleanup.

## Frozen Inventory

| Repo | Snapshot state | Treatment |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `a2b2a0c87d82`; only root worktree; snapshot window includes previous OPL docs/source writes. | Safe for a docs-only support-reference tranche; no branch/worktree cleanup required. |
| `med-autoscience` | `main` dirty and ahead `origin/main` by 16 at `4e0ee8f4da74`; dirty files: `src/med_autoscience/controllers/real_paper_autonomy_soak_inventory.py`, `tests/test_real_paper_autonomy_soak_inventory.py`; `git fetch` failed with GitHub LibreSSL connection error; long-running structure/quality processes remain; `.venv` / `__pycache__` writes appeared in the snapshot window. | Retained. Requires separate semantic intake and cleanup discipline; no deletion or absorption in this tranche. |
| `med-autogrant` | `main` clean/synced at `3fc5041c645e`; only root worktree; remote-only `origin/feature/ai-narration-contracts` retained. | No current cleanup action. |
| `redcube-ai` | `main` clean/synced at `d95bcb832acb`; only root worktree; snapshot window includes broad native-PPT/runtime-program source, contracts, tests, docs and dist writes. | Retained as active/recent RCA lane; no deletion or absorption in this tranche. |
| `opl-meta-agent` | `main` clean/synced at `59e216dd37a3`; only root worktree. | No current cleanup action. |
| `one-person-lab-app` | Root `main` dirty/synced at `eadbde57adeb`; dirty remote-backed worktree `.worktrees/codex/full-first-run-stable-gate-20260525`; open PR REST fallback returned `[]`. | Retained because dirty and remote-backed. |

## Reviewed Surfaces

- `docs/references/current-support/opl-quality-details.md`
- `src/cli/cases/public-command-specs.ts`
- `src/quality-details/**`
- `tests/src/quality-details.test.ts`
- `tests/src/verification-test-governance.test.ts`
- `scripts/run-structural-quality-gate.sh`
- `scripts/verify.sh`
- `.github/actions/quality-details/action.yml`
- `.github/workflows/sentrux-advisory.yml`
- `.github/workflows/verify.yml`
- Fresh CLI/read-model samples:
  - `./bin/opl quality details --help`
  - `./bin/opl quality details --root . --format json --limit 2 --focus rules --compare-ref origin/main`

## Changes

- Added currentness routing to the support reference: CLI command shape is owned by public command specs/help; local blocking behavior is owned by verify/structural scripts and `.sentrux/rules.toml`; GitHub advisory behavior is owned by the composite action and advisory workflow.
- Clarified compare-ref behavior split: local structure gate can fall back from unavailable `origin/main` to `HEAD^` for sidecar diagnosis, while the GitHub composite action fetches/verifies `origin/*` compare refs and fails closed if the ref cannot be verified.
- Documented the composite action output split: Markdown goes to the step summary, JSON goes to `quality-details.json`, with separate markdown and JSON limits.

## Retirements

- Retired stale support-doc implication that one artifact finding count, baseline diff, triage target list, advisory upload, or action run can be read as stable structure health, release readiness, App readiness, domain readiness, Sentrux replacement, or merge policy.
- No source, contract, workflow, module, CLI entry, test file, worktree or branch was retired in this tranche.

## Coverage Ledger

- Reviewed source/contracts/tests/docs: listed under `Reviewed Surfaces`.
- Changed source/contracts/tests/docs: only `docs/references/current-support/opl-quality-details.md`, this ledger, and the process plans index.
- Archived/tombstoned/deleted docs: none.
- Preserved public surfaces: `opl quality details`, `.github/actions/quality-details`, Sentrux advisory workflow, Verify workflow and structure gate remain unchanged.
- Uncovered docs: remaining current-support, runtime-substrate and operating-governance references not named in this ledger.
- Remaining stale/retire candidates: support docs that still carry fixed counters, branch/SHA state, dated provider proof snapshots, local proof paths, stale MDS/provider wording, App release/user-path shortcuts, old package/image proof snapshots, or compatibility promises.
- Next tranche write scope: continue OPL support-reference cleanup, prioritizing `docs/references/current-support/opl-docker-webui-deployment.md`, remaining `docs/references/runtime-substrate/**`, and `docs/references/operating-governance/**`.

## Post Snapshot Activity

- Activity after `RUN_SNAPSHOT_TS` was not used to expand this tranche scope. MAS dirty/ahead state, RCA native-PPT recent writes, and App dirty root/full-first-run lanes remain next-heartbeat intake items unless explicitly taken over.

## Verification

- `rtk ./bin/opl quality details --help` confirmed the current public command shape.
- `rtk ./bin/opl quality details --root . --format json --limit 2 --focus rules --compare-ref origin/main` returned `surface_kind=opl_code_quality_details.v1`, `baseline_diff.compare_ref=origin/main`, `rules_findings=[]`.
- `rtk node --experimental-strip-types --test tests/src/quality-details.test.ts tests/src/verification-test-governance.test.ts` passed 16 tests / 0 failed.
- `rtk git diff --check` passed.
- `rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md` returned no matches.
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json` returned `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=182`.
- `rtk ./scripts/verify.sh line-budget` passed.
