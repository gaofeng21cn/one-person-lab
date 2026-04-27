# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person lab 的顶层 `Codex-default session runtime`、显式 activation 层，以及跨仓 shared modules / contracts / indexes 的归属层。
- 当前公开认知保持三层：`产品运行时 -> 产品家族 -> 当前实现 / 模块`。
- `OPL` 持有 Codex-default session/runtime、智能体注册表、工作空间 / 会话 / 进度 / 交付物接口面，以及机器可读合同。
- `OPL` 继续持有 family-level shared modules、shared contracts 与 shared indexes 的顶层语义与注册面。
- `OPL Runtime Manager` 已冻结为 thin product-managed adapter：它管理外部 `Hermes-Agent` 的 provision、profile、task registration、诊断、恢复入口、Rust native helper catalog 与高频状态索引，但不承担 scheduler/session/memory kernel。
- `Codex` 是唯一默认交互与执行宿主；`Hermes-Agent` 只在显式切换时作为备选 runtime。
- 当前活跃实现是三个独立 `domain agent` 仓：`MAS`、`MAG`、`RCA`；thesis 与 review 模块保持定义阶段。

## 当前主线产品模型

当前主线公开模型统一为：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

这组资源是 `opl` 与 OPL-branded AionUI GUI/WebUI 的共同产品真相。
其中 `agents` 资源已经开始消费各 domain 仓 repo-owned 的 `domain agent entry spec`，而不是只由 OPL 顶层静态描述。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前最短一键安装入口：默认安装或配置 `Codex CLI` 与 `Hermes-Agent`，安装 `MAS`、`MDS`、`MAG`、`RCA`，同步短名 Codex skills，并以保守 managed 模式同步推荐 companion skills；其中 `MDS` 是 `MAS` 的隐藏运行依赖，不进入首页 domain-agent 入口。若 OPL 品牌 GUI 已安装则尝试打开，macOS 上未安装时会自动下载并安装匹配当前平台的 release DMG 后再打开；历史 8787 Product API service 模块已退役。
- `opl system` / `opl system initialize` 现在把 `Codex CLI` 当作受管 runtime dependency：报告实际命中的 binary path、raw version、parsed version、最低版本策略、版本状态、PATH 候选与冲突 issue。低于最低版本或存在候选版本冲突时不会报告为 ready；缺少可读 Codex config 不再单独阻塞首启，只在可读时展示继承到的模型与 provider 信息。当前默认最低版本是 `0.125.0`，可用 `OPL_MIN_CODEX_CLI_VERSION` 覆盖。
- 这几个入口默认继承 `Codex` 语义；只有显式 runtime switch 或显式 domain activation 才进入不同语义。
- `opl skill sync` 负责把家族 domain app skill pack 同步到 Codex 环境，供默认 `opl` / `opl exec` / `opl resume` 直接使用；默认 sibling repo 发现已经按 workspace/worktree 布局自动解析，不再依赖 `OPL_FAMILY_WORKSPACE_ROOT`。
- `opl module install --module <module_id>` 现在走完整闭环：clone 到 OPL-managed modules root，执行仓库 bootstrap，同步对应 skill pack，再跑仓库健康检查。
- `opl packages manifest` 现在暴露 OPL Packages 机器消费面：WebUI Docker 镜像、native helper GHCR 包，以及 MAS/MDS/MAG/RCA 模块源码归档坐标。Git repo 仍保留为安装 fallback。
- `opl system initialize` 是当前一键配置安装的聚合面：同时暴露 workspace root、Codex / Hermes runtime dependencies、domain modules、推荐 companion skills、OPL 品牌 GUI shell、local support service 与下一步动作；没有显式 workspace root 时默认使用用户 Home 目录。
- `opl runtime manager` 是当前 Runtime Manager 的机器可读 projection：它展示 OPL 管理外部 `Hermes-Agent` substrate 的 owner split、非目标、v1 domain registration registry、Rust native helper lifecycle、native helper target 与 state index target；Rust helper 源码、doctor/repair/prebuild 脚本和 Cargo workspace 已进入 npm package surface；当 helper 可发现时，它会调用 native doctor / state indexer / artifact indexer / runtime watch，并把 `opl_runtime_manager_native_state_projection` 写入 `OPL_STATE_DIR/runtime-manager/native-state-index.json`，同时报告 TTL、history、failure、last-success、freshness、结构化 diff 与 history GC preserved/removed 状态。
- Rust native helper 的生产化门禁已经进入仓库验证面：`native:doctor`、prebuild check、`npm pack --dry-run`、Rust tests/build、state cache 与 MAS/MAG family smoke 共同构成 native lane；CI 使用 fixture family smoke 验证 MAS/MAG 已声明的 `opl_runtime_manager_registration` 与 `native_helper_consumption.proof_surface` 投影，本地集成机继续可以对真实 MAS/MAG sibling workspace 做只读 indexing / registration / proof smoke。
- 推荐 companion skills 当前包括 `superpowers`、`officecli`、`ui-ux-pro-max` 和 Codex native Office skill 组；它们不改变 OPL runtime 语义，只作为 MAS / MAG / RCA 工作流的增强能力。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`；如需切换到其他本地状态根目录，使用 `OPL_STATE_DIR`。
- `Codex` 中显式调用 `OPL` 与其 domain agents 是并列的一等使用方式。
- Domain app 通过各自仓库提供的本地 CLI / 程序 / 脚本 / contract 与 skill pack 接入；`OPL` 负责统一同步与发现。
- GUI / Web 主线保持 `外部 shell -> OPL session runtime`。
- 当前 GUI 交付物是 `opl-aion-shell` 维护的 OPL 品牌桌面壳，它基于 AionUI codebase 做 OPL 裁剪与品牌化；原版 AionUI app 不算 OPL GUI。OPL 一键安装负责打开已安装 GUI，macOS 上缺失时自动消费 one-person-lab GitHub Release 里的 OPL 品牌预编译 DMG；只有缺少匹配平台 / 架构 artifact 时才回退源码构建。
- `OPL GUI` 预编译包指 Electron-builder 产出的 OPL 品牌 `.dmg` / `.exe` / `.deb` 分发文件及 `latest*.yml` updater metadata；这些 release artifact 由 `opl-aion-shell` 构建，再通过 `npm run gui:release` 上传到 `one-person-lab` GitHub Release。
- App 内自动更新按 OPL 日期版本判断；GUI/AionUI 基线版本只作为关于页和维护诊断信息展示。
- 本地 8787 `Product API` / `opl web` 模块已退役；WebUI 路径由 OPL-branded AionUI shell 提供。

## 当前交互模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认 |
| 通用任务 | Codex | 本地文件工作、命令执行、验证、多步任务 | 默认 |
| 专用智能体 / domain agent | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃 |

## 当前产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 公开状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 基金方向判断、申请书写作、修订工作 | 活跃 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `Thesis Foundry` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Foundry` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前维护边界

- AI / 维护者核心工作集保持在 `project / architecture / invariants / decisions / status`。
- 默认公开文档保持在 `README*` 与 `docs/README*`。
- `contracts/` 只保留机器可读合同面。
- `docs/references/` 承接参考级配套文档；`docs/specs/` 与 `docs/plans/` 承接设计与计划记录；`docs/history/` 承接历史归档。
- 历史 `gateway / federation / routed-action` 语料已经退到 reference / compatibility 层，不再作为默认实现依据。
- 历史 `frontdesk / readiness / entry-guide / domain-wiring` 公开语义已经退出当前主线，只保留在参考或历史层。
- 本地 Product API projection 已退役，避免把历史 adapter 面误导成当前产品主线。
- 自有完整长期常驻 runtime sidecar 不是当前 active work；当前只通过 Runtime Manager 冻结可迁移边界。只有外部 `Hermes-Agent` 不能表达 OPL 必需的 task/wakeup/approval/audit/product isolation contract 时，才评估 promotion。
- 各 domain 仓的 `gateway / harness` 继续作为内部分层语言存在；对外公开主语优先写成独立 `domain agent` 与其 `agent entry / direct entry`。

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
