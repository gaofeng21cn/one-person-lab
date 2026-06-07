# OPL GUI Shell Adapter 边界说明

Owner: `One Person Lab`
Purpose: `references_current_support_opl_gui_shell_adapter_boundary`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

Currentness policy：本文冻结 GUI shell / App / OPL runtime owner boundary，不冻结日期、release artifact、updater metadata、App state counters、App/operator route counts、provider proof snapshot、branch/SHA state 或本机 GUI smoke 结果。当前状态必须从 fresh `opl app state --profile fast --json`、`opl app state --profile full --json`、`opl runtime app-operator-drilldown --json`、`opl framework readiness --family-defaults --json`、`one-person-lab-app` release evidence 和 `opl-aion-shell` active-shell / packaged-runtime validation 读取。

稳定读法是：普通 GUI 页面状态默认消费 `opl_app_state.v1` fast profile，显式刷新消费 full profile，用户主动展开 operator diagnostic 才消费 `opl runtime app-operator-drilldown --detail full --json`。这些读面只证明 OPL 可生产 GUI-ready state/action 与 refs-only operator detail，不把 GUI shell、AionUI、App repo 或 release artifact 写成 runtime truth、domain truth、artifact body、memory body、quality/export verdict、App release ready 或 production ready owner。

## 结论

当前所有 GUI 相关的 AionUI upstream 适配、品牌替换、界面裁剪、Electron 打包和 shell overlay，都应发生在 `opl-aion-shell`。标准 DMG、Full 版 DMG、updater metadata、GitHub Release、GUI smoke、用户教程和 GUI runtime bridge 产品合同由 clean `one-person-lab-app` 产品仓独占。Framework 仓只保留 App 可消费机器接口、App release discovery consumer surface，以及作为 Full 版 DMG 内 runtime/CLI/contracts payload source。

`one-person-lab` 主仓不 fork GUI codebase。它持有 OPL 的运行时真相、安装与环境管理能力、模块与 skill 同步、机器可读合同、release version、Packages 坐标，以及 App / WebUI 共同消费的 CLI-backed 产品表面。

运行状态页遵循三层边界：`one-person-lab` 持有 `opl app state/action`、`opl runtime app-operator-drilldown` 和 refs-only action / drilldown 协议；`one-person-lab-app` 持有 GUI product truth、GUI runtime bridge 抽象、页面合同、release 包装和 active shell validation；`opl-aion-shell` 是当前 `aionui` implementation carrier，负责 renderer/bridge 实现。普通 GUI 页面状态默认读取 `opl app state --profile fast --json`，显式 full-state 诊断或 release evidence 才读取 `opl app state --profile full --json`，用户触发的完整 runtime / operator 展开才读取 `opl runtime app-operator-drilldown --detail full --json`。Shell 可以实现页面、发起 CLI 调用和渲染状态，但不能成为 runtime truth、domain truth、artifact body、memory body 或 quality/export verdict 的 owner。

因此，未来切换到其他 GUI 的目标不是重写 OPL，而是替换当前 GUI adapter。只要新 GUI 消费同一组 OPL CLI / machine-readable surfaces，切换成本应主要集中在 UI adapter、打包和发布链路，不应扩散到 MAS/MAG/RCA 或 OPL runtime；MDS 只保留为 MAS 显式声明的可选 companion。

App 仓库拆分 closeout 已归档到 [One Person Lab App 仓库拆分 Closeout](../../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)。当前维护规则是避免把 AionUI 历史合入 App 默认分支：`one-person-lab-app/shells/aionui` 必须是外部 checkout，history-preserving upstream intake、shell-local `AGENTS.md` 和 OPL overlay 退役审计留在 `opl-aion-shell`。

## 当前分工

### `one-person-lab` 主仓

- 定义 `OPL` 的 Codex-default session/runtime、显式 activation、domain agent registry、workspace/session/progress/artifact surface。
- 提供 `opl install`、`opl system initialize`、`opl connect modules`、`opl connect install|update|reinstall|remove|exec`、`opl connect sync-skills`、`opl connect packages manifest` 等 CLI-backed 能力。旧 `opl module *`、`opl skill list|sync`、`opl packages manifest` 已退役并 fail closed 到 Connect 替代入口。
- 管理 `Codex CLI`、MAS/MAG/RCA、推荐 skills、native helper、Packages 与 release discovery；MDS 不作为默认安装模块。
- 消费 `one-person-lab-app` GitHub Releases 中的 One Person Lab App release artifact，但不构建、不上传、不维护 updater metadata。
- 为 GUI 提供可消费的机器可读输出；新增安装、修复、状态或更新能力时，先落到 CLI，再由 GUI 调用。
- 持有 App 可读状态与 action 协议：普通 summary / refresh 读取 `opl app state --profile fast --json`，显式 full-state 诊断或 release evidence 读取 `opl app state --profile full --json`，App mutation 统一走 `opl app action execute --action <id> [--payload <json>] [--dry-run] --json`。
- `runtime_visualization_projection`、`runtime_tray_snapshot.app_operator_drilldown` 和 `opl runtime app-operator-drilldown --detail full --json` 继续作为 refs-only runtime/operator diagnostic detail；不再写成普通 GUI page-state 默认来源，也不把 GUI shell 的私有状态作为 runtime truth。

### `one-person-lab-app`

- 持有 App 产品入口、release 包装、用户可见文档、active shell contract、runtime bridge contract 和 active-shell validation。
- 通过 `contracts/app-runtime-bridge.json` 和 active shell contract 固化 GUI runtime bridge：OPL 是协议 owner，App 是 UI/bridge/product contract owner，当前 shell 是 replaceable implementation carrier。
- 可替换 active shell 或升级 GUI，但必须保持运行状态页只消费 OPL CLI / machine-readable projection，不直接读取 domain repo、runtime state file、artifact body 或 memory body。
- 验证 active shell 能实现合同，但不接管 OPL runtime truth、provider implementation、domain truth 或 action route authority。

### `opl-aion-shell`

- 持有当前桌面 App / WebUI 的实际 GUI codebase，并被 App repo 检出到 `shells/aionui`。
- 基于 AionUI codebase 做 OPL 品牌化、界面裁剪、主题、图标、设置页、环境管理、工作空间面板与对话体验。
- 实现 `one-person-lab-app/contracts/app-runtime-bridge.json` 声明的当前 `aionui` adapter，调用 OPL CLI 并渲染运行状态页。
- 负责跟随 AionUI upstream，解决 GUI 源码冲突，并保留必要的 OPL adapter 改动。
- 每次吸收 AionUI upstream 都应同时做本地补丁退役审计：upstream 已覆盖的深补丁应删除或收缩为薄 adapter，避免长期 fork delta 膨胀。
- 负责 Electron builder packaging policy，包括依赖裁剪、artifact 命名、updater metadata、packaged runtime 校验。
- 构建出的 `.dmg` / `.exe` / `.deb`、Full 版 DMG 和 updater metadata 由 App repo 包装并上传到 `one-person-lab-app` GitHub Release。
- 迁移后，App 顶层持有 release、testing、user-guide 和 active shell contract；AionUI upstream 代码与规则收缩到 `opl-aion-shell`。

## 打包裁剪与 upstream 同步的关系

当前裁剪主要是打包阶段的 policy：Electron builder 选择哪些运行时文件进入 App 包，哪些 renderer-only、测试、文档、fixtures、上游无关 runtime 或平台无关二进制不进入包。

这类裁剪不改 upstream 源码本体，因此不会天然阻断后续同步 AionUI upstream。同步后需要重新跑 packaged runtime validation 和真实启动 smoke，确认没有把新的运行时依赖裁掉。

GUI fork 更新不是机械 rebase。标准 intake 目标是“吸收 upstream + 收缩本地 delta + 保留 OPL runtime 边界”：先比较 upstream delta、OPL overlay delta 和当前本地 dirty delta，再把 OPL 补丁分类为保留、upstream 已覆盖可退役、适配到新 upstream 结构或继续观察。

当前 GUI shell 的 packaging contract 由 App 仓 `contracts/app-shell-adapter.json` 固化：active shell 根是 `shells/aionui`，Electron builder config 是 `packages/desktop/electron-builder.yml`，packaged runtime validator 是 `scripts/validate-packaged-runtime.js`。这些路径按 active shell 根解释；OPL 主仓文档只记录 owner boundary，不把 shell 内部目录形态写成 framework contract。

当前验证入口由 App 顶层 wrapper 与 release gate 持有：`validate:gui-shell` 先校验 active shell、准备标准 release payload，再通过 active shell 运行 GUI package；`validate:opl-package` / `test:packaged:bun` 通过 App wrapper 调用 active shell 的 `validate:opl-package`，当前 active shell 将其实现为 `node scripts/validate-packaged-runtime.js --scan-all`。发布前仍需真实启动一次 One Person Lab App；自动执行时机、内部 build script 名称和具体 package manager 继续以 App repo scripts、release workflow 和 active shell package scripts 的 fresh evidence 为准。

未来迁移到其他 GUI 时，应更新 App active shell contract 与 wrapper target，而不是在 OPL 主仓新增 shell-specific path、alias 或兼容 facade。

真正会增加长期分叉成本的是源代码层的深改，例如：

- 把 OPL 业务逻辑散落到大量 AionUI 原文件里。
- 删除 upstream 源模块而不是在 OPL adapter 层隐藏或绕开。
- 在 GUI 内复制 `opl install`、模块管理、skill 同步或 runtime 管理逻辑。
- 让 GUI 自己成为第二套 session/runtime truth。

## 未来切换 GUI 的成本

如果新 GUI 遵守现有边界，切换难度是中等可控：需要重做界面和 adapter，但不需要重写 OPL 内核。

最小切换工作包括：

1. 实现新的 GUI shell repo 或 GUI package。
2. 消费 OPL CLI / machine-readable outputs，而不是直接复制安装与环境管理逻辑。
3. 映射核心资源：`system`、`engines`、`modules`、`agents`、`workspaces`、`sessions`、`progress`、`artifacts`。
4. 实现设置页里的环境管理、模块更新、skill 同步、远程 WebUI 或浏览器入口。
5. 接入 One Person Lab release version、artifact 命名和 updater metadata。
6. 替换 `opl install` 的 GUI release asset 选择逻辑，让它下载新 GUI 的预编译包。
7. 跑相同的 packaged runtime validation、App 启动 smoke 和 Docker/WebUI smoke。

对 AionUI 2.0 这类大版本，推荐在 App 仓 `shells/aionui-next/` 或 `shells/<new-gui>/` 并行适配。只有 typecheck、测试、packaged runtime validation、页面状态测试和真实启动 smoke 通过后，才更新 App 顶层 active shell contract。

切换会变困难的情况是：新 GUI 不愿意消费 OPL CLI-backed surface，反而要求 OPL 改成它自己的内部数据模型、长期驻留服务或专用 API。那会把 GUI 选择反向污染 OPL runtime 边界，应避免。

## 后续维护规则

- `OPL` 主仓文档中提到 GUI 时，默认写成“当前 GUI shell / adapter”，不要把 AionUI、`opl-aion-shell` 或 `one-person-lab-app/shells/aionui` 写成 OPL runtime owner。
- `one-person-lab-app` 是 App 产品仓，`opl-aion-shell` 是当前 GUI shell repo。用户主入口仍是 release、`opl install` 和 One Person Lab App。
- GUI 新能力优先要求 OPL CLI 提供机器可读输出，再由 GUI 消费。
- Upstream AionUI 同步后，先解决源码冲突，再验证 OPL branding、Codex-default runtime、environment management、skill list、workspace panel、packaging trim 和 updater metadata。
- 如果用户只说“跟随 / 吸收 AionUI 最新版本”，默认按 `opl-aion-shell` 的标准 upstream-intake 流程执行，包括 live upstream 核对、patch matrix、本地补丁退役审计、验证、吸收到 shell main 和清理临时 worktree/branch。
- GUI upstream 同步的固定验证顺序是：同步 upstream、解决源码冲突、`dev/build`、打包、packaged runtime validation、真实 App startup smoke。
- 如果未来更换 GUI，新增一份迁移记录即可；核心 contract 和 domain module 不应因 GUI 更换而重写。
