# One Person Lab App 仓库拆分 Closeout

Owner: `One Person Lab`
Purpose: `app_repo_split_closeout`
State: `history_closeout`
Machine boundary: 本文是人读迁移 closeout 与后续维护边界，不是机器接口。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、release artifact、runtime ledger、provider receipt 和 App 仓自己的 release / test contract。
Date: `2026-05-15`

Lifecycle: 本文记录 2026-05-15 App 仓库拆分 closeout 和剩余远端迁移检查项。当前 App/workbench owner boundary 回到 `docs/product/`、`docs/references/current-support/opl-gui-shell-adapter-boundary.md`、核心五件套、App 仓合同和真实 release artifact；本文不再作为 active plan 扩写。

## 结论

当前最终维护拓扑是三个仓 / 三个本地目录：

```text
/Users/gaofeng/workspace/one-person-lab/       # OPL Framework repo
/Users/gaofeng/workspace/opl-aion-shell/       # history-rich AionUI/OPL shell repo
/Users/gaofeng/workspace/one-person-lab-app/   # clean One Person Lab App product repo
```

远端目标拓扑与本地目录一致：

```text
gaofeng21cn/one-person-lab       # OPL Framework
gaofeng21cn/opl-aion-shell       # AionUI upstream-following shell fork
gaofeng21cn/one-person-lab-app   # clean App product repo
```

`one-person-lab` 继续作为 OPL Framework 仓，持有安装、初始化、runtime/contracts、module 管理、App 可消费机器接口，以及作为 Full 版 DMG 内 runtime/CLI/contracts 的 payload source。

`opl-aion-shell` 是 history-rich shell 仓。它保留 AionUI 历史与 contributors，继续跟随 `iOfficeAI/AionUi` upstream，并在仓根直接维护当前 OPL 品牌 AionUI shell。

`one-person-lab-app` 是干净 App 产品仓。默认分支只追踪 App 顶层产品、发布、测试、教程和合同文件；`shells/aionui` 是外部 checkout / 本地 symlink / CI checkout，指向 `gaofeng21cn/opl-aion-shell`，不把 AionUI 历史合并进 App 默认分支。

## 为什么不用旧 rename-in-place 路线

2026-05-15 发现当前 GitHub `one-person-lab-app` 是由 AionUI-derived `opl-aion-shell` 直接改名而来，因此 GitHub contributor 图会被 AionUI 历史贡献者占满。即使后续清理当前 contributor 视图，只要继续在同一 App 仓吸收 upstream AionUI 历史，问题会反复出现。

最终策略改为：

- 保留 `opl-aion-shell` 作为 AionUI/OPL shell 专用仓，承接 upstream intake 和 shell overlay。
- 新建或替换出一个干净 `one-person-lab-app` 仓，只保留 App-owned history。
- App 仓通过 `contracts/app-shell-adapter.json`、`scripts/ensure-active-shell.mjs` 和 `shells/aionui` 外部 checkout 消费 shell，而不是 vendor shell 源码历史。

## 仓库职责

### `one-person-lab`

保留：

- `opl` CLI、`opl exec`、`opl resume`、`opl system initialize`。
- Codex-default session/runtime、explicit activation layer、stage control plane、typed family queue。
- Temporal-backed family runtime provider、stage attempt ledger、human gate、resume、dead-letter、provider proof 和 runtime projection。
- `contracts/`、shared helper、domain discovery、standard domain-agent skeleton、module install、skill sync、package/runtime payload manifest。
- Framework 级测试矩阵：typecheck、fast/meta/artifact/fresh-install、runtime/provider、contracts、domain descriptor parity。
- App release discovery / install consumer surface。
- App 可消费的 machine-readable runtime / system / module / agent / workspace / session / progress / artifact 输出。
- Full DMG payload source：runtime/CLI/contracts 内容来源。

不再持有：

- App release/upload/build workflow。
- 标准 DMG、Full DMG、updater metadata 或 GitHub Release 发布入口。
- GUI source fork、Electron builder policy、App 页面状态测试、截图教程或用户教程。
- AionUI upstream intake 的实现目录。

### `opl-aion-shell`

持有：

- 当前 OPL 品牌 AionUI shell 源码。
- AionUI upstream remote、upstream intake、冲突解决和 OPL overlay 退役审计。
- Shell-local build scripts、Electron builder config、packaged runtime validation、bridge/runtime wiring、branding 和 GUI implementation。
- Shell-local tests、i18n、typecheck、lint、Docker/WebUI build 输入和 package validation。

不持有：

- App repo 的干净产品历史。
- App GitHub Release 发布入口、updater metadata source-of-truth 或用户教程 canonical 文档。
- OPL Framework runtime truth 或 MAS/MAG/RCA domain truth。

### `one-person-lab-app`

持有：

- One Person Lab App 的产品定义、README、用户文档、截图教程、发布说明和支持文档。
- App release contract、shell adapter contract、页面状态测试矩阵、首启测试矩阵。
- 标准 App 包、Full first-install 包、updater metadata、GitHub Release 上传、GUI smoke 和用户教程。
- App-root release wrapper、release asset normalization、Full package manifest、standard updater metadata guard。
- `shells/aionui` 外部 checkout 入口，但不追踪 AionUI 源码历史。

不持有：

- OPL Framework runtime truth。
- Domain truth、quality verdict、publication/fundability/visual/export authority。
- OPL provider implementation、generic queue、generic stage runner 或 domain memory body。
- AionUI upstream history 或 contributors。

## Clean App Repo 规则

`one-person-lab-app` 默认分支必须保持 clean App-owned history：

- `shells/aionui` 必须在 `.gitignore` 中。
- `git ls-files shells/aionui` 应为 `0`。
- App contract 声明 shell source 为 `gaofeng21cn/opl-aion-shell`。
- 默认验证先执行 `npm run ensure:shell`，再跑 App-root contracts / release / smoke lanes。
- App repo 可使用本地 symlink 指向 `/Users/gaofeng/workspace/opl-aion-shell`，CI 中使用 checkout action 拉取 `gaofeng21cn/opl-aion-shell` 到 `shells/aionui`。

当前本机 clean App repo：

```text
/Users/gaofeng/workspace/one-person-lab-app
shells/aionui -> /Users/gaofeng/workspace/opl-aion-shell
```

旧 history-rich App checkout 已收进本机隐藏备份：

```text
/Users/gaofeng/workspace/.opl-migration-backups/one-person-lab-app-history-rich-backup-20260515
```

## Release 边界

App repo 独占：

- 标准 DMG / ZIP / platform packages。
- Full 版 DMG。
- `latest*.yml` updater metadata。
- GitHub Release asset upload。
- GUI smoke、VM smoke、Docker/WebUI install docs 和用户图文教程。

Framework repo 只保留：

- App release discovery / install consumer surface。
- Full 版 DMG 需要的 runtime/CLI/contracts payload source。
- App 可消费的 CLI JSON、contracts、runtime snapshot、provider receipts 和 domain-owned projections。

Full 包在用户侧等价于 Full 版 DMG。Framework 是 Full DMG 内 runtime/CLI/contracts 的内容来源，不拥有 App 发布流程。

## AionUI Upstream 跟随

`opl-aion-shell` 是唯一 upstream-following shell 仓：

- `origin` 指向 `git@github.com:gaofeng21cn/opl-aion-shell.git`。
- `upstream` 指向 `https://github.com/iOfficeAI/AionUi.git`。
- AionUI upstream 更新进入显式 upstream-intake branch / worktree。
- 每次 intake 都比较 upstream delta、OPL overlay delta 和本地 dirty delta。
- OPL-specific 改动集中在 branding、Codex-default runtime wiring、environment management、release/update metadata、bridge adapters 和 packaging policy。
- upstream 已覆盖的本地深补丁应删除或收缩成薄 adapter。

App repo 不直接吸收 upstream AionUI commit；它只更新 active shell ref / checkout / release wrapper 以及 App-level contract。

## 远端迁移顺序

远端操作属于破坏性/可见发布面变更，应单独确认后执行：

1. 将当前 history-rich GitHub `gaofeng21cn/one-person-lab-app` 改回或迁成 `gaofeng21cn/opl-aion-shell`。
2. 新建干净 `gaofeng21cn/one-person-lab-app`。
3. 推送本地 clean App repo 到新的 `one-person-lab-app`。
4. 推送本地 `opl-aion-shell` shell-root 形态到 `opl-aion-shell`。
5. 删除、废弃或标记迁移前误发在污染 App repo 上的测试 release，例如 `v26.5.15`。
6. 在 clean App repo 上重新发布当天最新版，作为标准 DMG / Full DMG / updater metadata / GitHub Release 的迁移后 smoke。

## 验证矩阵

Framework repo：

```bash
npm run typecheck
npm run test:fast
npm run test:artifact
npm run test:fresh-install
node scripts/test-lanes.mjs assert-coverage
git diff --check
```

App repo：

```bash
npm run ensure:shell
bun install --cwd shells/aionui --frozen-lockfile
node scripts/validate-active-shell.mjs --quick
npm run test:release-boundary
node scripts/validate-release-boundary.mjs
node scripts/prepare-release-assets.mjs build-artifacts release-assets
node scripts/validate-release.mjs release-assets
```

Shell repo：

```bash
bun install --frozen-lockfile
bun run i18n:types
node scripts/check-i18n.js
bunx tsc --noEmit
bun run test
node scripts/validate-packaged-runtime.js --scan-all
git diff --check
```

真实发布前还必须跑：

- 标准 App package build。
- Full first-install package build and payload validation。
- updater metadata validation：standard updater 不选择 Full 包。
- 真实 `/Applications/One Person Lab.app` 启动 smoke。
- Docker/WebUI 安装流程 smoke。
- 干净 macOS VM 首启 smoke。

## 验收标准

- 本地顶层目录是 `one-person-lab`、`opl-aion-shell`、`one-person-lab-app`。
- `one-person-lab-app` 默认分支只追踪 App-owned 文件，不追踪 `shells/aionui`。
- `one-person-lab-app` contributor 图不被 AionUI 历史污染。
- `opl-aion-shell` 保留 AionUI 历史、contributors 和 upstream-following 能力。
- Framework repo 不保留 App release/upload/build workflow。
- App repo 独占标准 DMG、Full DMG、updater metadata、GitHub Release、GUI smoke 和用户教程。
- Framework 只作为 App 可消费机器接口 provider 和 Full DMG payload source。

## 下一步

1. 完成远端 repo rename/create/push 迁移，并在 clean App repo 上重新发布最新版测试 release。
2. 在 App repo 重新跑标准 DMG、Full DMG、release mock、真实 GUI smoke、Docker/WebUI 和干净 VM 首启流程。
3. 在 App repo 更新 macOS App 图文教程，沿用之前教程逻辑，但引用迁移后 clean release 和新截图。
4. 保持 `opl-aion-shell` upstream intake 只在 shell repo 发生；App repo 只更新 active shell checkout/ref 和 App-owned release/test/user docs。
