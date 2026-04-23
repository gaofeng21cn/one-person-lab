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
- 这几个入口默认继承 `Codex` 语义；只有显式 runtime switch 或显式 domain activation 才进入不同语义。
- `Codex` 中显式调用 `OPL` 与其 domain agents 是并列的一等使用方式。
- `@mas`、`@mag`、`@rca` 等 handle 属于显式 activation layer，背后继续落到各 domain 仓自己的 CLI / 程序 / 脚本 / contract。
- GUI / Web 主线保持 `外部 shell -> OPL session runtime`。
- 当前第一外部壳是 `AionUI`；`Onyx` 只保留为备线参考。
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
- 历史 `frontdesk / readiness / entry-guide / domain-wiring` 公开语义已经退出当前主线，只保留在参考或历史层。
- `Product API` 继续保留，但语义上降为 session runtime 的 projection surface。
- 各 domain 仓的 `gateway / harness` 继续作为内部分层语言存在；对外公开主语优先写成独立 `domain agent` 与其 `agent entry / direct entry`。

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
