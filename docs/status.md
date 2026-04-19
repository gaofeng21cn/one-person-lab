# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person research lab 的顶层 family gateway、headless adapter / API truth、CLI 产品入口与模块目录。
- 当前公开认知保持三层：`家族入口面 -> 产品家族 -> 当前实现 / 模块`。
- `OPL` 持有 family-level adapter surfaces、模块目录、shared helper 与 machine-readable contract；domain runtime ownership 继续留在各自仓库。
- `Codex` 是默认交互与执行宿主；`Hermes-Agent` 是显式备用模式与在线网关。
- 当前活跃 domain agent 模块是 `MAS`、`MAG`、`RCA`；thesis 与 review 模块保持定义阶段。

## 当前默认入口与 adapter 主线

- 当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell，默认前门是 `opl`。
- family-level 产品入口继续围绕同一套 gateway、progress/files surfaces、workspace registry、session ledger 与模块目录展开。
- `Initialize OPL`、environment/modules settings、workspace root 与 system maintenance 现在共用同一套 headless adapter truth，不再分散成首启脚本和长期设置两套口径。
- `opl web` 继续暴露本地 frontdesk adapter root 与 machine-readable surfaces，供 external overlay 或自动化入口消费。
- GUI 主线保持 `external overlay repo -> OPL headless adapter / API surfaces`；`OPL` 主仓继续不跟踪 repo-local GUI 壳实现。
- `Hermes Kernel Integration` 的冻结选择是 `external kernel, managed by OPL product packaging`。
- 这条产品入口路径把用户留在 `OPL` 家族入口面里，不要求用户先手工安装并理解 `Hermes-Agent`。
- 家族级入口真相继续分成 `operator entry`、`agent entry`、`product entry` 三层。
- 家族默认执行器继续冻结在 `Codex CLI autonomous`，沿用本地 `Codex` 默认配置。
- `Hermes-native` 继续只作为实验路线存在，目标是完整的 Hermes AIAgent agent loop，不是一条 chat relay，也不是一步一步 chat。
- `opl <request...>` 继续作为同一入口之上的 quick ask 路径；`opl ask` 默认走 `Codex`，`opl chat` 与显式 executor 配置可以进入 `Hermes-Agent` 备用在线路径。
- `Onyx` 只作为上游 benchmark / overlay target 出现在参考与规划文档中；当前 repo-tracked truth 仍以 `opl web` 和 OPL adapter surfaces 为准。
- domain product entry、domain runtime 与最终 deliverables 继续留在 admitted domain 一侧。

## 当前交互模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通 Codex 对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认对话模式 |
| 通用 Codex 任务 | Codex task runner | 本地文件工作、命令执行、验证、多步任务 | 默认执行模式 |
| 专用智能体模块 | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃模块家族 |

## 当前产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 公开状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 医学基金方向判断、申请书写作、作者侧模拟评审 | 活跃 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `Thesis Foundry` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Foundry` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前模块目录

| 模块 | 仓库 | 用户面职责 | 当前状态 |
| --- | --- | --- | --- |
| `MAS` | `Med Auto Science` | 医学科研、证据整理、论文交付 | 活跃 |
| `MAG` | `Med Auto Grant` | 基金申请、申请书写作与作者侧基金工作 | 活跃 |
| `RCA` | `RedCube AI` | 汇报、幻灯片、视觉交付 | 活跃 |
| thesis module | Planned | 学位论文与答辩准备 | 定义阶段 |
| review module | Planned | 审稿、回复和修回 | 定义阶段 |

## 当前维护边界

- AI / 维护者核心工作集保持在 `project / architecture / invariants / decisions / status`。
- 默认公开 docs 保持在 `README*` 与 `docs/README*`。
- `contracts/` 只保留 machine-readable contract surface。
- `docs/references/` 承接参考级配套文档；`docs/specs/` 与 `docs/plans/` 承接设计与计划记录；`docs/history/` 承接历史归档。
- 当前 admitted domain surface 是 `MedAutoScience`、`MedAutoGrant` 与 `RedCube AI`；formal entry 保持在本地 `TypeScript CLI`-first / gateway contract surface，runtime ownership 继续留在 admitted domain 一侧。
- workspace root 与 update channel 当前都落在 `OPL` 自己的状态面里，external overlay 继续只消费这层已落地 truth。

## 参考入口

- `docs/references/README.md`
- `docs/history/README.md`
