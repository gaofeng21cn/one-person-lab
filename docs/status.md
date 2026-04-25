# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person lab 的顶层 `Codex-default session runtime`、显式 activation 层，以及跨仓 shared modules / contracts / indexes 的归属层。
- 当前公开认知保持三层：`产品运行时 -> 产品家族 -> 当前实现 / 模块`。
- `OPL` 持有 Codex-default session/runtime、智能体注册表、工作空间 / 会话 / 进度 / 交付物接口面，以及机器可读合同。
- `OPL` 继续持有 family-level shared modules、shared contracts 与 shared indexes 的顶层语义与注册面。
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

这组资源是 `opl`、外部 GUI 壳与 `Product API` projection 的共同产品真相。
其中 `agents` 资源已经开始消费各 domain 仓 repo-owned 的 `domain agent entry spec`，而不是只由 OPL 顶层静态描述。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前最短一键安装入口：默认安装或配置 `Codex CLI` 与 `Hermes-Agent`，安装 `MAS`、`MAG`、`RCA`，同步短名 Codex skills，安装并打开本地 Product API service；若 OPL 品牌 GUI 已安装则尝试打开，未安装时返回匹配当前平台的 release package 信息，不负责静默下载安装 GUI。
- 这几个入口默认继承 `Codex` 语义；只有显式 runtime switch 或显式 domain activation 才进入不同语义。
- `opl skill sync` 负责把家族 domain app skill pack 同步到 Codex 环境，供默认 `opl` / `opl exec` / `opl resume` 直接使用；默认 sibling repo 发现已经按 workspace/worktree 布局自动解析，不再依赖 `OPL_FAMILY_WORKSPACE_ROOT`。
- `opl module install --module <module_id>` 现在走完整闭环：clone 到 OPL-managed modules root，执行仓库 bootstrap，同步对应 skill pack，再跑仓库健康检查。
- `opl system initialize` 是当前一键配置安装的聚合面：同时暴露 workspace root、Codex / Hermes runtime dependencies、domain modules、推荐 companion skills、OPL 品牌 GUI shell、local support service 与下一步动作。
- 推荐 companion skills 当前包括 `superpowers`、`officecli` 和 Codex native Office skill 组；它们不改变 OPL runtime 语义，只作为 MAS / MAG / RCA 工作流的增强能力。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`；如需切换到其他本地状态根目录，使用 `OPL_STATE_DIR`。
- `Codex` 中显式调用 `OPL` 与其 domain agents 是并列的一等使用方式。
- Domain app 通过各自仓库提供的本地 CLI / 程序 / 脚本 / contract 与 skill pack 接入；`OPL` 负责统一同步与发现。
- GUI / Web 主线保持 `外部 shell -> OPL session runtime`。
- 当前 GUI 交付物是 `opl-aion-shell` 维护的 OPL 品牌桌面壳，它基于 AionUI codebase 做 OPL 裁剪与品牌化；原版 AionUI app 不算 OPL GUI。OPL 一键安装只负责打开已安装 GUI 或报告匹配的 OPL 品牌预编译包信息；实际安装仍由用户或外层 installer 消费 GitHub Release artifact，只有缺少匹配平台 / 架构 artifact 时才回退源码构建。
- `OPL GUI` 预编译包指 Electron-builder 产出的 OPL 品牌 `.dmg` / `.exe` / `.deb` 分发文件及 `latest*.yml` updater metadata；这些 release artifact 应在 `opl-aion-shell` release 流程中预先构建并上传。
- `opl web` 与 `Product API` 继续提供 projection、debug 与 hosted adapter surface。

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
- `Product API` 继续保留，但语义上降为 session runtime 的 projection surface。
- 各 domain 仓的 `gateway / harness` 继续作为内部分层语言存在；对外公开主语优先写成独立 `domain agent` 与其 `agent entry / direct entry`。

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
