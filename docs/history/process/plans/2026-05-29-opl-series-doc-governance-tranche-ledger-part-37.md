# OPL series docs governance tranche ledger part 37

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_37`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Dockerfile、WebUI release gate、package workflow contract、App release truth、runtime provider contract、Codex config policy 或 image manifest。当前 truth 回到 `contracts/`、source、tests、核心五件套、CLI/read-model、App repo contracts/workflows、active shell Dockerfile/web-cli/web-host 和真实 image evidence。
Date: `2026-05-29`

## Scope

本轮处理 Docker/WebUI 与 release/package 支撑文档的 currentness drift：

- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- process ledger index

目标是把 WebUI 镜像发布面拆成两个当前 owner：App repo 继续持有 App/WebUI 产品发布、用户入口和 Docker smoke release gate；OPL 主仓只持有 package manifest 中的 GHCR 镜像坐标，以及 `.github/workflows/packages.yml` 从 App repo active shell checkout 构建/推送 WebUI image 的机器通道。旧 headless Product API、Docker 镜像内置 Full runtime payload、Codex 配置初始化、Temporal/provider payload、companion bundle 和 no-auth 环境变量均不得作为当前 Docker/WebUI 默认事实复活。

## Fresh Evidence

本轮 live evidence：

- `.github/workflows/packages.yml`
  - `webui-image` job 使用 `docker/build-push-action@v6`。
  - build context 是 `https://github.com/gaofeng21cn/one-person-lab-app.git#main:shells/aionui`。
  - tags 是 `ghcr.io/<owner>/one-person-lab-webui:<OPL_RELEASE_VERSION>` 与 `latest`。
  - `VITE_OPL_DEFAULT_LANGUAGE=zh-CN` 只是当前 build arg，不是部署合同。
- `src/package-distribution.ts`
  - `packages.webui_docker_image.image` 与 `aliases` 只声明 GHCR 坐标。
  - `module_install_update_source` 仍是 `git_checkout`，`package_consumption_status` 仍是 `packages_defined_not_consumed_by_install_update`。
- `tests/src/cli/cases/package-distribution.test.ts`
  - 只锁定 manifest 坐标、模块包消费状态和 git-checkout current source，没有把 WebUI 镜像内容写成 provider/Codex/Full payload。
- `src/system-installation/environment.ts` 与 focused system tests
  - 当前 GUI lane 是 `aionui_remote_webui`，`local_product_api_retired=true`。
  - `opl help` 不暴露旧 `web`、`web bundle`、`web package` 或 Product API service 命令。
- `one-person-lab-app` live surfaces
  - `shells/aionui` 是指向 `gaofeng21cn/opl-aion-shell` 的外部 active shell checkout。
  - `contracts/app-first-run-test-matrix.json` 的 `docker_webui_smoke` 从 `shells/aionui` 构建 Docker image，期望容器 3000 端口、`/` 和 `/manifest.webmanifest` 可用。
  - `.github/workflows/desktop-release.yml` 的 `docker-webui-smoke` checkout active shell、构建 `one-person-lab-webui:<version>` 并 curl 验证。
- `opl-aion-shell` live surfaces via App symlink
  - Dockerfile runtime stage 复制 `dist-web-cli/staging/aionui-web`，设置 `PORT=3000`、`AIONUI_ALLOW_REMOTE=1`、`AIONUI_DATA_DIR=/data`，并以 `./aionui-web/aionui-web start --remote --port 3000` 启动。
  - `scripts/webui.ts` 记录 `AIONUI_PORT`、`AIONUI_ALLOW_REMOTE`、`AIONUI_DATA_DIR`、`AIONUI_LOG_DIR`、`AIONUI_STATIC_DIR`、`AIONUI_BACKEND_BIN` 和 `AIONUI_BACKEND_BUNDLED_DIR` 等 shell-owned runtime variables。

## Changes

- `docs/references/current-support/opl-docker-webui-deployment.md`
  - Currentness policy 加入 OPL package workflow 和 `src/package-distribution.ts`，同时明确这些 surface 不给出 provider readiness 或 release readiness。
  - 当前 WebUI 边界改成 App release truth owner + OPL GHCR coordinate/package workflow owner 的双边界。
  - Docker 镜像说明拆开 App Docker smoke gate 与 OPL GHCR publish path。
  - 明确镜像默认内容只有 AionUI web-cli / SPA / bundled backend / browser entry，不包含 Full runtime payload、`officecli`、companion bundle、Temporal/provider payload 或 Codex 配置初始化。
  - 把 `VITE_OPL_DEFAULT_LANGUAGE=zh-CN` 标为当前 workflow build arg，不写成部署合同。
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - `.github/workflows/packages.yml` 机器入口补充 WebUI image 来自 `one-person-lab-app#main:shells/aionui`。
  - Docker/WebUI 发布物内容从过度宽泛的 `OPL WebUI runtime / Codex 配置初始化 / Temporal-backed provider refs` 收窄为 active AionUI shell image 内容，并要求 runtime/env/auth/session 回到 active shell Dockerfile / web-cli / web-host、App Docker smoke 和 image manifest。
  - 维护规则明确 WebUI GHCR 发布不接管 App release / user-path truth，模块 Packages install/update 仍未成为当前安装更新机制。

No workflow, source code, tests, App repo files, shell repo files, runtime ledger, provider state, image build, or package manifest output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/status.md`
- `.github/workflows/packages.yml`
- `src/package-distribution.ts`
- `src/system-installation/environment.ts`
- `tests/src/cli/cases/package-distribution.test.ts`
- `tests/src/cli/cases/system-install.test.ts`
- `tests/src/cli/cases/system-management.test.ts`
- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- `docs/references/current-support/opl-default-skill-ecosystem.md`
- `docs/references/current-support/README.md`
- `one-person-lab-app` README / contracts / release workflow / release boundary tests relevant to active shell and Docker WebUI smoke
- `opl-aion-shell` Dockerfile and webui CLI source via App active-shell symlink
- prior process ledger part 36 and process ledger index

Edited:

- `docs/references/current-support/opl-docker-webui-deployment.md`
- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-37.md`
- `docs/history/process/plans/README.md`

## Remaining stale / retire candidates

- Continue scanning current-support docs for stale App release fixed-version anchors, VM runner assumptions, GUI shell/App boundary drift, Docker/WebUI image payload claims and package channel overclaims.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS wording starts acting as active truth instead of support/reference or history provenance.
- Packages/GHCR module install/update remains a future machine channel until live source/tests/App environment management consume the channel manifest.

## Verification

Fresh verification before absorb:

- Initial focused test attempt before dependency install failed during module import because the fresh worktree had no `node_modules` and Node could not resolve `@temporalio/client`; this was an environment/dependency state failure, not a changed assertion failure.
- `rtk npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md contracts scripts src tests .github` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/package-distribution.test.ts tests/src/cli/cases/system-install.test.ts tests/src/cli/cases/system-management.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 53`, `pass 53`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue current-support cleanup in small evidence-backed slices, prioritizing remaining GUI shell/App boundary or App release support docs if fresh source/contracts/tests still show stale release, runner, image payload or package channel assumptions.
