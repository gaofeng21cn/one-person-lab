# OPL series docs governance tranche ledger part 47

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_47`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Dockerfile、WebUI runtime env contract、Codex config writer、App Docker smoke gate、package manifest、App release readiness oracle、domain truth、artifact authority、quality verdict、owner receipt 或 production readiness oracle。当前 truth 回到 `docs/references/current-support/opl-docker-webui-deployment.md`、核心五件套、contracts、source、tests、CLI/read-model、runtime ledger、`one-person-lab-app` release / first-run contracts、workflows、tests、`opl-aion-shell` Dockerfile / web-cli / web-host 和真实 image evidence。
Date: `2026-05-29`

## Scope

本轮继续处理 Docker/WebUI support reference 中的 Codex env currentness：

- `docs/references/current-support/opl-docker-webui-deployment.md`
- process ledger index

目标是保留 WebUI container runtime env 与 OPL CLI / Codex managed profile 的真实边界：plain `one-person-lab-webui` 镜像启动时只消费 shell-owned WebUI runtime env；`OPL_CODEX_*`、`CODEX_HOME` 和 `OPL_WORKSPACE_ROOT` 只有在显式运行 OPL CLI configure / install / bootstrap 路径或预置 Codex config 时才生效。不要把向 WebUI entrypoint 传入 `OPL_CODEX_*` 写成 Codex 默认配置已经自动初始化。

## Fresh Evidence

本轮 live evidence：

- OPL repo
  - `src/local-codex-defaults.ts` 的 `bootstrapLocalCodexDefaults` 从 `OPL_CODEX_MODEL`、`OPL_CODEX_REASONING_EFFORT`、`OPL_CODEX_BASE_URL`、`OPL_CODEX_API_KEY` 等 env 读取，并写入 `resolveLocalCodexConfigPath()` 指向的 `CODEX_HOME/config.toml` 或 `$HOME/.codex/config.toml`。
  - `src/cli/cases/system-public-command-specs.ts` 的 `system configure-codex --api-key-stdin` 调用同一 bootstrap 路径；`src/system-installation/turnkey.ts` 在 install / initialize 路径中调用 bootstrap，不是 WebUI image entrypoint。
  - `.github/workflows/packages.yml` 的 WebUI image job 从 `one-person-lab-app#main:shells/aionui` 构建并推送 GHCR image，只传 `VITE_OPL_DEFAULT_LANGUAGE=zh-CN` build arg。
  - `src/package-distribution.ts` 的 `webui_docker_image` 只声明 GHCR 坐标和 `latest` alias；package manifest 没有声明 WebUI container 会自动配置 Codex。
  - `tests/src/cli/cases/package-distribution.test.ts` 只覆盖 package coordinates、module package current source、codex default profile manifest 和 package discipline，不把 profile env 写成 WebUI runtime behavior。
- `one-person-lab-app` live read, read-only because the App repo had unrelated local modifications:
  - `contracts/app-first-run-test-matrix.json` 的 `docker_webui_smoke` 只要求 Docker image 从 active AionUI shell Dockerfile 构建、容器暴露 3000、HTTP `/` 和 `/manifest.webmanifest` 返回 200。
  - `.github/workflows/desktop-release.yml` 的 `docker-webui-smoke` checkout active shell、build image、run container、curl `/` 和 `/manifest.webmanifest`，并上传 index / manifest / image-size artifacts。
  - `contracts/app-release-channel.json` 与 release tests 把 Docker/WebUI smoke 放在 App stable release gate 中，但没有把 `/api/auth/user` 或 OPL Codex env bootstrap 作为 stable release readiness 替代 gate。
- `opl-aion-shell` live read, read-only because the shell checkout had unrelated local modifications:
  - Dockerfile runtime stage 设置 `PORT=3000`、`AIONUI_ALLOW_REMOTE=1`、`AIONUI_DATA_DIR=/data`，并以 `./aionui-web/aionui-web start --remote --port 3000` 启动。
  - `packages/web-cli/src/index.ts` 的 start path 消费 `AIONUI_DATA_DIR`、`AIONUI_LOG_DIR`、`AIONUI_PORT` / `PORT`、`AIONUI_ALLOW_REMOTE` / `AIONUI_REMOTE`，不读取 `OPL_CODEX_MODEL`、`OPL_CODEX_BASE_URL` 或 `OPL_CODEX_API_KEY`。
  - `packages/web-host/src/static-server.ts` 反向代理 `/api/*` 和 auth endpoints；`packages/web-host/src/static-server.unit.test.ts` 覆盖 `/api/auth/user` reverse-proxy。

## Changes

- `docs/references/current-support/opl-docker-webui-deployment.md`
  - Currentness policy 加入 `src/local-codex-defaults.ts` / `opl system configure-codex` 作为 Codex profile 写入路径，并明确不要从 Docker/WebUI reference 推导 Codex 自动初始化。
  - Docker image env boundary 明确 `OPL_CODEX_*` profile 输入不是 plain WebUI image 推荐入口。
  - 将“容器中的 Codex 默认配置”改为“Codex 默认配置边界”，说明 plain WebUI image entrypoint 只读取 shell-owned WebUI runtime env。
  - 移除 plain `docker run` 和 Compose WebUI service 示例中的 `HOME`、`OPL_WORKSPACE_ROOT`、`CODEX_HOME` 和 `OPL_CODEX_*` 变量。
  - 增加显式 OPL CLI configure-codex 示例，要求在包含 OPL CLI 的安装或维护步骤中写入 `CODEX_HOME/config.toml`，再复用同一 `/data` / `CODEX_HOME` volume。
  - 验证段补充 `/api/auth/user` 是 shell-owned auth/session implementation check，App stable Docker/WebUI release gate 当前只验证 image build、HTTP `/` 和 `/manifest.webmanifest`。
  - 运行维护说明改为：只有显式运行 OPL CLI / Codex CLI 时才把 workspace、Codex 配置和 cache 放入受管 volume，不再暗示 WebUI entrypoint 会自动配置 Codex。
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-47.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 47 index row.

No source, machine-readable contracts, tests, workflows, App repo files, shell repo files, runtime ledgers, provider state, image build, or package manifest output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/current-support/opl-docker-webui-deployment.md`
- `.github/workflows/packages.yml`
- `src/package-distribution.ts`
- `src/local-codex-defaults.ts`
- `src/cli/cases/system-public-command-specs.ts`
- `src/system-installation/turnkey.ts`
- `tests/src/cli/cases/package-distribution.test.ts`
- `one-person-lab-app/contracts/app-first-run-test-matrix.json`
- `one-person-lab-app/contracts/app-release-channel.json`
- `one-person-lab-app/docs/release/README.md`
- `one-person-lab-app/docs/testing/README.md`
- `one-person-lab-app/.github/workflows/desktop-release.yml`
- `one-person-lab-app/scripts/plan-release-candidate.ts`
- `one-person-lab-app/tests/release/app-release-boundary.test.ts`
- `opl-aion-shell/Dockerfile`
- `opl-aion-shell/package.json`
- `opl-aion-shell/packages/web-cli/src/index.ts`
- `opl-aion-shell/packages/web-host/src/static-server.ts`
- `opl-aion-shell/packages/web-host/src/static-server.unit.test.ts`
- part 37 and part 46 process ledgers

Edited:

- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-47.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, workflows, App release files, shell files or tests were archived, tombstoned or deleted in this tranche.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `21891008` before part47 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part47-docker-webui-codex-env`.
- Branch: `codex/opl-doc-governance-20260529-part47-docker-webui-codex-env`, based on root `main`.
- App repo retained unrelated local modifications and was read-only in this tranche.
- `opl-aion-shell` retained unrelated local modifications and was read-only in this tranche.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for App release evidence, VM gate, active-shell path, package payload, Codex profile, provider evidence and Docker/WebUI wording that freezes App-owned or shell-owned dynamic facts.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**` and public docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Verification

Fresh verification before absorb:

- `npm ci` was required because the isolated worktree lacked `node_modules`; it exited `0` and ran `npm run build`. npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md .github`.
- Stale Docker/WebUI Codex env scan returned no matches for retired/default-entry wording in `docs/references/current-support/opl-docker-webui-deployment.md`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- Focused package / Codex configure / verification-surface tests passed: `node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts tests/src/cli/cases/system-install.test.ts tests/src/verification-command-surfaces.test.ts` reported `tests 39`, `pass 39`, `fail 0`.

## Next tranche write scope

- Prefer another small current-support, specs, runtime/product or public-doc currentness tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc / contract / focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
