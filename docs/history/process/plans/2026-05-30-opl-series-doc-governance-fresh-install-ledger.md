# OPL Series Doc Governance Fresh Install Ledger

Owner: `One Person Lab`
Purpose: `process_history_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 2026-05-30 自动化 tranche 的人读覆盖、验证和保留理由。机器 truth 继续归 source、contracts、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App release evidence 和真实 repo state。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T19:02:29Z`
- Local snapshot time: `2026-05-30T03:02:29+0800`
- Governed scope: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`
- Tranche: OPL fresh-install / GUI first-launch support-reference currentness cleanup.

## Frozen Inventory

| Repo | Snapshot state | Treatment |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `c4b4b0fda3ec`; only root worktree; snapshot window includes previous automation docs writes and `.officecli/config.json`. | Safe for a docs-only support-reference tranche; no branch/worktree cleanup required. |
| `med-autoscience` | `main` clean but ahead `origin/main` by 17 at `9a225c4e`; snapshot window includes real-paper autonomy soak inventory source/tests/docs writes; long-running structure/quality processes remain. | Retained. Requires separate semantic intake and cleanup discipline; no deletion, push, absorption or branch cleanup in this tranche. |
| `med-autogrant` | `main` clean/synced at `3fc5041`; remote-only non-codex `origin/feature/ai-narration-contracts` retained. | No current cleanup action. |
| `redcube-ai` | Root `main` clean/synced at `d95bcb8`; extra worktree `/Users/gaofeng/workspace/redcube-ai-opl-evidence-tranche` on `codex/rca-evidence-scaleout-20260530` at same SHA; snapshot window includes broad native-PPT/evidence writes. | Retained as recent RCA lane; no deletion or absorption in this tranche. |
| `opl-meta-agent` | `main` clean/synced at `59e216d`; only root worktree. | No current cleanup action. |
| `one-person-lab-app` | Root `main` dirty/synced at `eadbde5`; dirty files include App shell candidate contract, active/status docs, AG-UI candidate verification, GUI inventory and shell candidate validator; dirty remote-backed worktree `.worktrees/codex/full-first-run-stable-gate-20260525` retained; open PR fallback returned `[]`. | Read-only evidence source for App-owned first-run/release surfaces. Dirty and remote-backed lanes are retained. |

## Reviewed Surfaces

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `package.json`
- `scripts/verify.sh`
- `scripts/fresh-install-smoke.mjs`
- `src/system-installation/initialize.ts`
- `src/system-installation/first-run-contract.ts`
- `src/system-installation/turnkey.ts`
- `src/cli/modules/public-payloads.ts`
- `tests/src/fresh-install-smoke.test.ts`
- `tests/src/cli/cases/system-install.test.ts`
- `tests/src/cli/cases/system-management.test.ts`
- App read-only evidence from `one-person-lab-app`: `contracts/app-first-run-test-matrix.json`, `.github/workflows/desktop-release.yml`, `.github/workflows/opl-first-run-vm.yml`, `tests/release/app-release-boundary.test.ts`, `tests/release/release-readiness-summary.test.ts`, `contracts/app-release-channel.json`, `contracts/app-gui-product-contract.json`, `scripts/validate-active-shell.ts`, and `scripts/plan-release-candidate.ts`.
- Fresh CLI/read-model samples:
  - `node --experimental-strip-types scripts/fresh-install-smoke.mjs --vm-artifacts-only`
  - `./bin/opl system initialize --json`

## Changes

- Added a durable owner split: OPL owns CLI clean-room fresh-install contracts and `system_initialize` machine output; App owns first-run rendering, standard / Full release profiles, clean VM workflow, one-shot App installer, Docker/WebUI release gate, release readiness summary and packaged GUI route smoke.
- Clarified that App release evidence must not be read back into OPL as a fresh-install CLI gate, fixed runner contract, fixed artifact set, or release readiness claim.
- Updated the local clean-room section to include family runtime provider full-readiness assertions and the `--vm-artifacts-only` smoke output boundary.
- Clarified the App VM layer as command-reference support only; real invocation shape, release input, runner labels, guest user / SSH key, Tart source VM, graphics mode, retention and upload strategy remain App-owned.
- Added the current repair/log event boundary: `runtime_manager_repair_*` remains runtime manager log history, `family_runtime_provider_repair_*` is the provider-specific event family, and `online_management_*` remains retired.

## Retirements

- Retired stale support-doc implication that App Standard / Full VM evidence, assistant-route smoke, one-shot installer, Docker/WebUI smoke, release-readiness summary, runner label, artifact path or release cohort can be treated as OPL main-repo `npm run test:fresh-install` coverage.
- Retired stale support-doc implication that `online_management_*` remains a first-run readiness, provider proof or App automation surface.
- No source, contract, workflow, module, CLI entry, test file, worktree or branch was retired in this tranche.

## Coverage Ledger

- Reviewed source/contracts/tests/docs: listed under `Reviewed Surfaces`.
- Changed source/contracts/tests/docs: only `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`, this ledger, and the process plans index.
- Archived/tombstoned/deleted docs: none.
- Preserved public surfaces: `opl system initialize --json`, `opl install`, `opl system configure-codex`, `opl system startup-maintenance`, `opl system reconcile-modules`, first-run JSONL log contract, GUI accessibility labels, App release workflows and App release evidence contracts remain unchanged.
- Uncovered docs: remaining current-support, runtime-substrate and operating-governance references not named in this ledger.
- Remaining stale/retire candidates: support docs that still carry fixed counters, branch/SHA state, dated provider proof snapshots, local proof paths, stale MDS/provider wording, App release/user-path shortcuts, old package/image proof snapshots, or compatibility promises.
- Next tranche write scope: continue OPL support-reference cleanup, prioritizing remaining `docs/references/runtime-substrate/**`, `docs/references/operating-governance/**`, and fresh intake for MAS ahead 17, App dirty root/full-first-run, and RCA native-PPT/evidence lanes.

## Post Snapshot Activity

- Activity after `RUN_SNAPSHOT_TS` was not used to expand this tranche scope. MAS ahead/process state, RCA evidence worktree/recent writes, and App dirty root/full-first-run lanes remain next-heartbeat intake items unless explicitly taken over.
- App repo was used only as read-only evidence for App-owned first-run/release contracts and workflows.

## Verification

- `rtk node --experimental-strip-types scripts/fresh-install-smoke.mjs --vm-artifacts-only` confirmed the OPL VM artifact list boundary.
- `rtk ./bin/opl system initialize --json` confirmed `ready_to_launch=true`, `blocking_items=[]`, `maintenance_items=["family_runtime_provider"]`, `family_runtime_provider.provider_kind=temporal`, and `family_runtime_provider.ready=false` with `temporal_worker_not_ready` on this machine. This is a current sample, not a stable release readiness claim.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/system-install.test.ts tests/src/fresh-install-smoke.test.ts` passed 24 tests / 0 failed.
- `rtk git diff --check` passed.
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md` returned no matches.
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json` returned `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=184`.
- `rtk ./scripts/verify.sh line-budget` passed.
