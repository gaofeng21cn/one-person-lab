# OPL 当前状态

## 当前公开角色

- `OPL` 是 one-person research lab 的顶层 GUI 产品壳、family gateway 与模块目录。
- 当前公开认知保持三层：`产品壳 -> 产品家族 -> 当前实现 / 模块`。
- `Codex` 是默认交互与执行宿主；`Hermes-Agent` 是显式备用模式与在线网关。
- `OPL` 持有 family-level GUI、模块目录、shared helper 与 machine-readable contract；domain runtime ownership 继续留在各自仓库。
- 当前活跃 domain agent 模块是 `MAS`、`MAG`、`RCA`；thesis 与 review 模块保持定义阶段。

## 当前默认入口

- 当前默认入口是 `GUI 产品壳 -> 工作模式选择 -> Codex 对话 / Codex 任务 / 专用 domain agent`。
- 当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell，默认前门是 `opl`。
- `Hermes Kernel Integration` 的冻结选择是 `external kernel, managed by OPL product packaging`。
- 这条产品入口路径把用户留在 `OPL` 壳里，不要求用户先手工安装并理解 `Hermes-Agent`。
- 家族级入口真相继续分成 `operator entry`、`agent entry`、`product entry` 三层。
- 家族默认执行器继续冻结在 `Codex CLI autonomous`，沿用本地 `Codex` 默认配置。
- `Hermes-native` 继续只作为实验路线存在，目标是完整的 Hermes AIAgent agent loop，不是一条 chat relay，也不是一步一步 chat。
- `opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳，并把当前 workspace 接入 `OPL` 模块与项目 registry。
- `opl web` 是同一产品壳的本地浏览器 companion surface。
- `opl frontdesk environment`、`opl frontdesk modules` 与 `opl frontdesk module install|update|reinstall|remove` 负责环境与模块管理。
- `opl`、`opl "<request...>"`、`opl start --project <project_id> [--mode <mode_id>]`、`opl doctor`、`opl ask`、`opl chat` 与 `opl web` 共同组成当前顶层产品前门。
- `opl ask` 默认走 `Codex`；`opl chat`、`opl session resume`、显式 executor 配置和 GUI 模式切换可以进入 `Hermes-Agent` 备用在线路径。
- 当前 grouped command matrix 已经固定成：
  - `contract ...`：`validate|workstreams|workstream|domains|domain|surfaces|surface|handoff-envelope`
  - `domain ...`：`manifests|launch|resolve-request|explain-boundary`
  - `status ...`：`workspace|runtime|dashboard`
  - `workspace ...`：`projects|list|bind|activate|archive`
  - `frontdesk ...`：`manifest|entry-guide|readiness|environment|modules|module *|domain-wiring|hosted-bundle|hosted-package|service *|bootstrap`
  - `session ...`：`list|resume|logs|ledger`
- `runtime repair-gateway`
- GUI 的任务边栏应把 progress 状态和 files 交付区投射到当前 workspace。
- `opl <request...>` 继续作为同一入口之上的 quick ask 路径。
- 本地 web front desk pilot 已经落地；当前 GUI 主线冻结为 `Onyx-style Desktop shell + OPL web companion`，hosted / web 路线继续围绕 `OPL` 自有 truth surfaces 推进。

## GUI 工作模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通 Codex 对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认 GUI 模式 |
| 通用 Codex 任务 | Codex task runner | 本地文件工作、命令执行、验证、多步任务 | 默认执行模式 |
| 专用智能体模块 | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃模块家族 |

## 当前产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 公开状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 医学基金方向判断、申请书写作、作者侧模拟评审 | 活跃 |
| `Presentation Ops` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `Thesis Ops` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Ops` | Planned | 审稿、回复与修回 | 定义阶段 |

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
- family shared release 继续属于脚本与 contract 维护面，不再占默认公开状态页。
- 当前 admitted domain surface 是 `MedAutoScience`、`MedAutoGrant` 与 `RedCube AI`；formal entry 保持在本地 `TypeScript CLI`-first / gateway contract surface，runtime ownership 继续留在 admitted domain 一侧。

## 参考入口

- `docs/references/family-orchestration-contract-absorb-crewai.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`
- `docs/references/opl-frontdesk-delivery-board.md`
- `docs/history/omx/`

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- family release 漂移验证：`scripts/verify.sh family`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`
