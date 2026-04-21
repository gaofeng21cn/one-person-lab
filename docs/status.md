# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person lab 的顶层产品运行时、共享接口真相与 CLI 产品入口。
- 当前公开认知保持三层：`产品运行时 -> 产品家族 -> 当前实现 / 模块`。
- `OPL` 持有顶层共享运行时、智能体注册表、工作空间 / 会话 / 进度 / 交付物接口面，以及机器可读合同。
- `Codex` 是默认交互与执行宿主；`Hermes-Agent` 是备用模式与长期在线网关。
- 当前活跃领域智能体模块是 `MAS`、`MAG`、`RCA`；thesis 与 review 模块保持定义阶段。

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

这组资源是 GUI 外壳与 CLI 的共同产品真相。

## 当前默认入口

- 默认前门仍是 `opl`。
- `opl <request...>` 继续提供快速提问路径。
- GUI 主线保持 `独立界面仓 -> OPL Product API`。
- 当前优先基座是 `AionUI`；`Onyx` 只保留为备线参考。
- `opl web` 继续提供本地 API 服务和机器可读根载荷。

## 当前交互模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认 |
| 通用任务 | Codex | 本地文件工作、命令执行、验证、多步任务 | 默认 |
| 专用智能体 | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃 |

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

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
