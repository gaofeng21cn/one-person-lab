# OPL series docs governance tranche ledger part 27

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_27`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App release oracle、Docker image manifest、WebUI auth contract、GUI VM proof、companion payload manifest 或 domain authority。当前 truth 回到 `docs/references/current-support/*`、核心五件套、contracts、source、CLI/API、runtime ledger、App release evidence、`one-person-lab-app` release/testing contracts、`opl-aion-shell` Dockerfile / web-cli source 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL current-support 支撑文档里的 Fresh Install / GUI 首启 / Docker WebUI / default companion skill currentness：

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-default-skill-ecosystem.md`

目标是保留稳定 owner boundary 和操作入口，同时退役未实现的 Docker no-auth 变量、历史 `ALLOW_REMOTE` / `DATA_DIR` 示例、WebUI 镜像默认内置 Full runtime / `officecli` / `/opt/opl/skills` 的错误假设，Fresh Install 文档中把 recommended skills / GUI shell 混入 core launch gate 的过时表述，以及 fresh-install 合同里把 native helpers 固定写成 maintenance item 的 stale expectation。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/fresh-install-test-matrix.json`：OPL fresh-install 矩阵仍冻结 CLI clean-room 场景、GUI accessibility labels、first-run JSONL 默认路径、App VM command shape 和 VM artifact requirements。
- `scripts/fresh-install-smoke.mjs -- --vm-artifacts-only`：输出 `opl_clean_vm_first_launch_artifacts`，required runner 为 self-hosted macOS VM runner，工件为 first-run JSONL、OPL state、`system-initialize.json`、`modules.json`、首启截图和 unified log。
- `src/system-installation/initialize.ts`：`native_helpers` checklist item 是 optional；只有 `environment.native_helpers.health_status !== 'ready'` 时 severity 才是 `maintenance`，ready 时 severity 为 `info`。`setup_flow.maintenance_items` 从 checklist severity 动态生成。
- `scripts/fresh-install-smoke.mjs`：CLI clean-room 场景仍断言 clean user / compatible Codex / outdated Codex / ready baseline / offline module install blocker；`ready_baseline` 的 `ready_to_launch=true` 只依赖 fake compatible Codex、Codex config 和 git-backed managed module fixtures，family runtime provider / recommended skills 留在 maintenance。native helpers 继续作为 optional checklist / repair action surface 暴露，并且只在 live helper health 不是 ready 时作为 conditional maintenance item。
- `.github/workflows/verify.yml`：OPL 主仓 `Verify` workflow 仍有独立 fresh-install job，执行 `npm run test:fresh-install`。
- `one-person-lab-app/docs/release/README.md` 和 `docs/testing/README.md`：App repo owns standard/Full release package, first-run GUI proof, VM smoke, Docker/WebUI HTTP smoke, user-path evidence bundle, updater metadata and release validation; OPL only owns CLI/runtime/contracts/projection payload source.
- `one-person-lab-app/contracts/app-first-run-test-matrix.json` / `app-product-profile.json` / `app-install-exposure-policy.json`：Core launch gate remains workspace root + Codex CLI + Codex config; recommended skills, companion install, domain modules, provider, native helpers, CLT and ecosystem updates are Full readiness or background maintenance after `ready_to_launch`; Standard and Full VM release evidence now includes `artifacts/assistant-route-smoke-summary.json`.
- `one-person-lab-app/scripts/plan-release-candidate.ts` / `scripts/validate-release-boundary.ts` / `tests/release/app-release-boundary.test.ts`：Standard and Full VM lanes include `--assistant-route-smoke`; Docker/WebUI release gate remains build from `shells/aionui`, start on port 3000, HTTP `/` 200 and HTTP `/manifest.webmanifest` 200.
- `opl-aion-shell/Dockerfile`：runtime image sets `AIONUI_ALLOW_REMOTE=1` and `AIONUI_DATA_DIR=/data`, exposes `3000`, and starts `./aionui-web/aionui-web start --remote --port 3000`. It does not set `ALLOW_REMOTE`, `DATA_DIR`, `OPL_WEBUI_AUTH_MODE`, `AIONUI_WEBUI_AUTH_MODE`, `OPL_PACKAGED_SKILLS_ROOT`, or copy `/opt/opl/skills`.
- `opl-aion-shell/packages/web-cli/src/index.ts` and `scripts/webui.ts`: WebUI data / remote envs are `AIONUI_DATA_DIR`, `AIONUI_ALLOW_REMOTE`, `AIONUI_REMOTE`, `AIONUI_PORT`, `PORT`, and `AIONUI_LOG_DIR`; auth endpoints are proxied to backend and no OPL no-auth env is implemented.
- `opl-aion-shell/packages/web-host/src/static-server.unit.test.ts`: `/api/auth/user` is reverse-proxied to backend; static Web host does not provide a local built-in no-auth user.
- `opl-aion-shell/scripts/pack-web-cli.js`: web-cli package copies the compiled web binary, static renderer output and bundled aioncore; it does not package `officecli` or companion skills. Current Dockerfile also does not expose `VITE_OPL_DEFAULT_LANGUAGE` as a build arg.
- OPL `src/install-companions.ts` / `src/install-companions/catalog.ts`: `OPL_PACKAGED_SKILLS_ROOT` and `OPL_FULL_RUNTIME_HOME/skills` are valid OPL managed skill sources, but they are explicit runtime / managed payload inputs, not proof that every WebUI Docker image contains those payloads.

## Changes

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
  - Corrected core readiness to `workspace root + Codex CLI + Codex API config`.
  - Reframed GUI / VM commands as App-owned workflow / contract truth, leaving runner labels, Tart source VM, guest SSH user, Node injection and release profile to App evidence rather than freezing them in OPL support prose.
- `contracts/opl-framework/fresh-install-test-matrix.json`, `src/system-installation/first-run-contract.ts`, `scripts/fresh-install-smoke.mjs`
  - Replaced fixed `native_helpers` maintenance expectations with `expected_conditional_maintenance_items`.
  - Kept native helpers as optional initialize/checklist surface whose maintenance inclusion depends on live helper health and checkout-local helper availability.
  - Added the current App VM release evidence boundary for `artifacts/assistant-route-smoke-summary.json`.
- `docs/references/current-support/opl-docker-webui-deployment.md`
  - Removed unsupported `VITE_OPL_DEFAULT_LANGUAGE` build-arg guidance.
  - Replaced stale `ALLOW_REMOTE` / `DATA_DIR` examples with current `AIONUI_ALLOW_REMOTE` / `AIONUI_DATA_DIR`.
  - Deleted the unsupported trusted no-auth section and removed the fake `opl-webui-noauth` expected response.
  - Clarified that auth/session behavior is backend-owned and proxied by Web host.
  - Removed the claim that the current WebUI Docker image installs `officecli` or exposes `/opt/opl/skills` by default.
- `docs/references/current-support/opl-default-skill-ecosystem.md`
  - Retained `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` as valid managed payload inputs.
  - Clarified that current WebUI Docker image cannot be assumed to include `officecli` or `/opt/opl/skills` unless Dockerfile / workflow / image manifest explicitly provides that payload.

## Coverage

Reviewed:

- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-default-skill-ecosystem.md`
- `docs/references/current-support/README.md`
- `contracts/opl-framework/fresh-install-test-matrix.json`
- `scripts/fresh-install-smoke.mjs`
- `.github/workflows/verify.yml`
- `.github/workflows/packages.yml`
- `src/install-companions.ts`
- `src/install-companions/catalog.ts`
- `src/system-installation/initialize.ts`
- `src/system-installation/first-run-contract.ts`
- `scripts/fresh-install-smoke.mjs`
- `one-person-lab-app/docs/release/README.md`
- `one-person-lab-app/docs/testing/README.md`
- `one-person-lab-app/contracts/app-first-run-test-matrix.json`
- `one-person-lab-app/contracts/app-product-profile.json`
- `one-person-lab-app/contracts/app-install-exposure-policy.json`
- `opl-aion-shell/Dockerfile`
- `opl-aion-shell/packages/web-cli/src/index.ts`
- `opl-aion-shell/scripts/webui.ts`
- `opl-aion-shell/scripts/pack-web-cli.js`
- `opl-aion-shell/packages/web-host/src/static-server.unit.test.ts`

Edited:

- `contracts/opl-framework/fresh-install-test-matrix.json`
- `scripts/fresh-install-smoke.mjs`
- `src/system-installation/first-run-contract.ts`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-default-skill-ecosystem.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-27.md`
- `docs/history/process/plans/README.md`

No App release files, Aion shell files, modules, runtime source behavior or interfaces were modified in this tranche. OPL contract / smoke runner changes only remove stale expectations and keep the current `system initialize` behavior unchanged.

## Remaining stale / retire candidates

- Continue scanning current-support docs for old release IDs, stale env var aliases, implied Docker / Full DMG payload equivalence, fake no-auth / compatibility examples, local proof paths and dated runner assumptions.
- Continue OPL support-reference cleanup in `docs/references/current-support/opl-quality-details.md`, `opl-test-lane-governance.md` and any remaining support docs that still mix operation reference with dynamic release/runtime evidence.
- Do not edit or absorb current `one-person-lab-app`, `opl-aion-shell` or `redcube-ai` dirty lanes unless explicitly taking ownership.

## Next tranche write scope

- Prefer another small OPL support/reference tranche backed by fresh source / contract / workflow evidence, or switch to App paragraph-level governance only after App dirty release/testing lane is safe or explicitly assigned.
- Keep dynamic VM runner names, release candidate IDs, Docker image contents, App release readiness and companion payload manifests out of stable OPL support prose unless proven from the owning repo and machine-readable artifact.
