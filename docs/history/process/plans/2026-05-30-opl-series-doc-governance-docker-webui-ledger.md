# OPL Series Doc Governance Docker WebUI Ledger

Owner: `One Person Lab`
Purpose: `process_history_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 2026-05-30 自动化 tranche 的人读覆盖、验证和保留理由。机器 truth 继续归 source、contracts、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App release evidence 和真实 repo state。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-05-29T18:46:40Z`
- Local snapshot time: `2026-05-30T02:46:40+0800`
- Governed scope: `one-person-lab`, `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`
- Tranche: OPL Docker/WebUI support-reference currentness cleanup.

## Frozen Inventory

| Repo | Snapshot state | Treatment |
| --- | --- | --- |
| `one-person-lab` | `main` clean/synced at `4236518e8eb2`; only root worktree; snapshot window includes previous OPL docs/source writes. | Safe for a docs-only support-reference tranche; no branch/worktree cleanup required. |
| `med-autoscience` | `main` dirty and ahead `origin/main` by 16 at `4e0ee8f4da74`; dirty files include `docs/active/mas-ideal-state-gap-plan.md`, `docs/status.md`, `src/med_autoscience/controllers/real_paper_autonomy_soak_inventory.py`, and `tests/test_real_paper_autonomy_soak_inventory_cases/test_workspace_root_discovery.py`; long-running structure/quality processes remain. | Retained. Requires separate semantic intake and cleanup discipline; no deletion or absorption in this tranche. |
| `med-autogrant` | `main` clean/synced at `3fc5041c645e`; only root worktree; remote-only `origin/feature/ai-narration-contracts` retained. | No current cleanup action. |
| `redcube-ai` | `main` clean/synced at `d95bcb832acb`; only root worktree, but snapshot window includes broad native-PPT/runtime-program source, contracts, tests, docs and dist writes. | Retained as active/recent RCA lane; no deletion or absorption in this tranche. |
| `opl-meta-agent` | `main` clean/synced at `59e216dd37a3`; only root worktree. | No current cleanup action. |
| `one-person-lab-app` | Root `main` dirty/synced at `eadbde57adeb`; dirty remote-backed worktree `.worktrees/codex/full-first-run-stable-gate-20260525` / `codex/full-first-run-stable-gate-20260525`; open PR REST fallback returned `[]`. | Retained because dirty and remote-backed. |

## Reviewed Surfaces

- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/README.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `.github/workflows/packages.yml`
- `src/package-distribution.ts`
- `src/local-codex-defaults.ts`
- `src/cli/cases/system-public-command-specs.ts`
- `tests/src/cli/cases/package-distribution.test.ts`
- `tests/src/cli/cases/system-install.test.ts`
- App/shell evidence from `one-person-lab-app`: `shells/aionui/Dockerfile`, `.github/workflows/desktop-release.yml`, `contracts/app-first-run-test-matrix.json`, `shells/aionui/packages/web-cli/src/index.ts`, `shells/aionui/packages/web-host/src/static-server.unit.test.ts`, and `shells/aionui/packages/web-host/src/backend-launcher.ts`.
- Fresh CLI/read-model sample: `./bin/opl packages manifest --json`.

## Changes

- Clarified that the Dockerfile runtime command executes the packaged binary `./aionui-web/aionui-web start --remote --port 3000`, not an OPL CLI entrypoint.
- Added the current App release Docker smoke boundary: image build, image size record, container start, HTTP `/`, and `/manifest.webmanifest`; auth/session and resetpass behavior remain shell-owned implementation truth.
- Added `AIONUI_REMOTE` as a shell-supported remote alias while keeping `AIONUI_ALLOW_REMOTE` as the recommended deployment variable.
- Expanded the Codex profile variable table to include `OPL_CODEX_MODEL_PROVIDER` and `OPL_CODEX_PROVIDER_NAME`, matching `bootstrapLocalCodexDefaults`.

## Retirements

- Retired stale support-doc implication that App Docker smoke proves auth/session, App release readiness, Full payload readiness, provider readiness, companion skill availability, no-auth mode, or Codex automatic initialization.
- Retired stale entrypoint shorthand that obscured the packaged `aionui-web` binary path used by the current Dockerfile.
- No source, contract, workflow, module, CLI entry, test file, worktree or branch was retired in this tranche.

## Coverage Ledger

- Reviewed source/contracts/tests/docs: listed under `Reviewed Surfaces`.
- Changed source/contracts/tests/docs: only `docs/references/current-support/opl-docker-webui-deployment.md`, this ledger, and the process plans index.
- Archived/tombstoned/deleted docs: none.
- Preserved public surfaces: WebUI Docker image coordinates, OPL packages manifest, App Docker release smoke, shell web-cli runtime variables and auth/session routes remain unchanged.
- Uncovered docs: remaining current-support, runtime-substrate and operating-governance references not named in this ledger.
- Remaining stale/retire candidates: support docs that still carry fixed counters, branch/SHA state, dated provider proof snapshots, local proof paths, stale MDS/provider wording, App release/user-path shortcuts, old package/image proof snapshots, or compatibility promises.
- Next tranche write scope: continue OPL support-reference cleanup, prioritizing `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`, remaining `docs/references/runtime-substrate/**`, and `docs/references/operating-governance/**`.

## Post Snapshot Activity

- Activity after `RUN_SNAPSHOT_TS` was not used to expand this tranche scope. MAS dirty/ahead state, RCA native-PPT recent writes, and App dirty root/full-first-run lanes remain next-heartbeat intake items unless explicitly taken over.
- GitHub network reads had transient failures during intake (`SSL_ERROR_SYSCALL`, EOF, connection reset), but retry/fallback returned open PR `[]` for the six repos.

## Verification

- `rtk ./bin/opl packages manifest --json` confirmed current `webui_docker_image` coordinates, `module_install_update_source=git_checkout`, `package_consumption_status=packages_defined_not_consumed_by_install_update`, and bundled Codex default profile.
- `rtk git diff --check` passed.
- `rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs/**/*.md` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts tests/src/cli/cases/system-install.test.ts` passed.
- `rtk /Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json` returned no findings.
- `rtk ./scripts/verify.sh line-budget` passed.
