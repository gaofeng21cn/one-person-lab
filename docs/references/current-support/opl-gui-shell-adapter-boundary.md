# OPL GUI Shell Adapter 边界说明

状态锚点：`2026-05-01`

## 结论

当前所有 GUI 相关的 fork、AionUI upstream 适配、品牌替换、界面裁剪、Electron 打包和 App 更新桥接，都应发生在 App-owned GUI shell 线里。迁移前的实现仓是 `opl-aion-shell`；目标形态是独立 `one-person-lab-app` 产品仓，并把当前 AionUI fork 放在 `shells/aionui/` 下作为 upstream-backed shell adapter。

`one-person-lab` 主仓不 fork GUI codebase。它持有 OPL 的运行时真相、安装与环境管理能力、模块与 skill 同步、机器可读合同、release version、Packages 坐标，以及 App / WebUI 共同消费的 CLI-backed 产品表面。

因此，未来切换到其他 GUI 的目标不是重写 OPL，而是替换当前 GUI adapter。只要新 GUI 消费同一组 OPL CLI / machine-readable surfaces，切换成本应主要集中在 UI adapter、打包和发布链路，不应扩散到 MAS/MAG/RCA 或 OPL runtime；MDS 只保留为 MAS 显式声明的可选 companion。

App 仓库拆分的活跃计划见 [One Person Lab App 仓库拆分计划](../../active/one-person-lab-app-repo-split-plan.md)。该计划要求避免把 AionUI 搬入后变成普通 vendored code：`shells/aionui/` 必须保留 history-preserving upstream intake、明确的 shell-local `AGENTS.md` 和 OPL overlay 退役审计。

## 当前分工

### `one-person-lab` 主仓

- 定义 `OPL` 的 Codex-default session/runtime、显式 activation、domain agent registry、workspace/session/progress/artifact surface。
- 提供 `opl install`、`opl system initialize`、`opl module *`、`opl skill *`、`opl packages manifest` 等 CLI-backed 能力。
- 管理 `Codex CLI`、`Hermes-Agent`、MAS/MAG/RCA、推荐 skills、native helper、Packages 与 release version；MDS 不作为默认安装模块。
- 发布用户下载入口：One Person Lab App 的 release artifact 放在 `one-person-lab` GitHub Releases。
- 为 GUI 提供可消费的机器可读输出；新增安装、修复、状态或更新能力时，先落到 CLI，再由 GUI 调用。

### `opl-aion-shell` / future `one-person-lab-app/shells/aionui`

- 持有当前桌面 App / WebUI 的实际 GUI codebase。
- 基于 AionUI codebase 做 OPL 品牌化、界面裁剪、主题、图标、设置页、环境管理、工作空间面板与对话体验。
- 负责跟随 AionUI upstream，解决 GUI 源码冲突，并保留必要的 OPL adapter 改动。
- 每次吸收 AionUI upstream 都应同时做本地补丁退役审计：upstream 已覆盖的深补丁应删除或收缩为薄 adapter，避免长期 fork delta 膨胀。
- 负责 Electron builder packaging policy，包括依赖裁剪、artifact 命名、updater metadata、packaged runtime 校验。
- 构建出的 `.dmg` / `.exe` / `.deb` / updater metadata 通过 OPL 发布流程上传到 `one-person-lab` release。
- 迁移后，App 顶层持有 release、testing、user-guide 和 active shell contract；AionUI upstream 代码与规则收缩到 `shells/aionui/`。

## 打包裁剪与 upstream 同步的关系

当前裁剪主要是打包阶段的 policy：Electron builder 选择哪些运行时文件进入 App 包，哪些 renderer-only、测试、文档、fixtures、上游无关 runtime 或平台无关二进制不进入包。

这类裁剪不改 upstream 源码本体，因此不会天然阻断后续同步 AionUI upstream。同步后需要重新跑 packaged runtime validation 和真实启动 smoke，确认没有把新的运行时依赖裁掉。

GUI fork 更新不是机械 rebase。标准 intake 目标是“吸收 upstream + 收缩本地 delta + 保留 OPL runtime 边界”：先比较 upstream delta、OPL overlay delta 和当前本地 dirty delta，再把 OPL 补丁分类为保留、upstream 已覆盖可退役、适配到新 upstream 结构或继续观察。

当前 GUI 仓的裁剪规则集中在 `opl-aion-shell/electron-builder.yml`，校验规则集中在 `opl-aion-shell/scripts/validate-packaged-runtime.js`。GUI 打包脚本应在生成 fresh `app.asar` 后自动执行 `--scan-all` 级别的 packaged runtime validation；发布前仍需真实启动一次 One Person Lab App。

迁移后，这些规则应由 App 顶层脚本调用 active shell 的等价命令，而不是把 active shell 的内部路径写成永久 App contract。

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

- `OPL` 主仓文档中提到 GUI 时，默认写成“当前 GUI shell / adapter”，不要把 AionUI 或 `opl-aion-shell` 写成 OPL runtime owner。
- `opl-aion-shell` 是当前 GUI 交付仓，不是用户主入口；目标迁移后，`one-person-lab-app` 是 App 产品仓，`shells/aionui` 是当前 GUI adapter。用户主入口仍是 release、`opl install` 和 One Person Lab App。
- GUI 新能力优先要求 OPL CLI 提供机器可读输出，再由 GUI 消费。
- Upstream AionUI 同步后，先解决源码冲突，再验证 OPL branding、Codex-default runtime、environment management、skill list、workspace panel、packaging trim 和 updater metadata。
- 如果用户只说“跟随 / 吸收 AionUI 最新版本”，默认按 `opl-aion-shell` 的标准 upstream-intake 流程执行，包括 live upstream 核对、patch matrix、本地补丁退役审计、验证、吸收到 `gaofeng/main` 和清理临时 worktree/branch。
- GUI upstream 同步的固定验证顺序是：同步 upstream、解决源码冲突、`dev/build`、打包、packaged runtime validation、真实 App startup smoke。
- 如果未来更换 GUI，新增一份迁移记录即可；核心 contract 和 domain module 不应因 GUI 更换而重写。
