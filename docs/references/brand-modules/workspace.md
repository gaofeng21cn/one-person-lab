# OPL Workspace

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 workspace schemas、source、CLI/API 行为、真实 workspace evidence、domain-owned artifact authority 和 App evidence。

## 品牌定位

`OPL Workspace` 是 OPL 的 workspace protocol 与文件生命周期模块。它不是一套目录命名偏好，而是把用户材料、共享资源、stage output、working artifacts、review、handoff、owner receipt 和 typed blocker 绑定到可检查、可恢复、可迁移的项目空间协议里。

一句话：`Workspace` 管“这个任务属于哪个 Workspace Group / Project Unit，stage 产物在哪里，哪些是 owner receipt / typed blocker，哪些只是 runtime 证据”。

## 设计理念

- 用户检查面优先：普通用户默认查看 project-local `artifacts/stage_outputs/<stage-id>/`、domain-owned product views、review 和 handoff，而不是 provider internals、runtime-state、SQLite 或 App projection。
- 机器协议优先：物理目录可以保留领域语义，但必须投影到统一 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`。
- Series-ready by default：`one_off`、`series`、`portfolio` 都使用 series-capable skeleton；一次性项目后续升级 series / portfolio 不搬已有 project root。
- Display alias 不改语义：MAS 保留 `studies/<study-id>` 命名但机器语义是 Project Unit；RCA/MAG/OMA 使用 `deliverables/<project-id>` 只是 domain display alias，不是新的 lifecycle。
- Runtime-state 降级为 backing/provenance：它不能替代 stage folder、owner receipt 或 typed blocker。
- Interface delegate 优先：Skill、MCP、App、OpenAI tool 和 AI SDK tool 只能通过 `opl workspace ensure` / `opl workspace interfaces` 暴露的 command contract 进入 workspace；不得自由猜测目录或绕过 workspace binding。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `workspace.yaml` | workspace identity、agent binding、mode、root policy。 |
| `workspace_index.json` | canonical topology、display labels、shared resources、indexed projects、generated refs 和用户检查 refs。 |
| `workspace_inspection.json` | 用户优先检查投影：当前 project、Stage Native roots、current pointer refs、authority false flags。 |
| `workspace_resource_inventory.json` | refs-only shared resource inventory：sources、materials、memory、brand/style roots 的 index，不保存 body。 |
| `workspace_group` | 一个 agent 或 portfolio 下的项目集合。 |
| `project_unit` | 一个 paper、study、grant、deck、agent target 或 deliverable project；`studies/` 与 `deliverables/` 都只是物理/display alias。 |
| `stage_artifact_unit` | 某个 stage 的用户可检查产出位置，默认落在 `<project-root>/artifacts/stage_outputs/<stage-id>/`。 |
| `stage_outputs_index.json` | project-local Stage Native 索引，记录 stage lifecycle protocol、folder refs、current pointer ref 和 refs-only authority boundary。 |
| `current_stage.json` | project-local 当前 stage 指针 projection；runtime 可写合法非空指针，workspace upgrade 只补缺失，不把它重置成空模板。 |
| `shared_resources` | sources、brand、visual memory、literature、data、style system 等共享材料。 |
| `inspection_roots` | App/用户默认可查看路径。 |

## 接口与文档

理想接口：

```text
opl workspace ensure --agent <id> --project <id> --json
opl workspace init --agent <id> --workspace <path> --json
opl workspace validate --workspace <path> --json
opl workspace doctor --workspace <path> --json
opl workspace adopt --agent <id> --workspace <path> --dry-run --json
opl workspace inspect --workspace <path> --json
opl workspace inventory --workspace <path> --json
opl workspace interfaces --json
```

理想文档：

```text
docs/references/brand-modules/workspace.md
docs/source/workspace-source-intake-boundary.md
contracts/opl-framework/workspace-topology-profile.schema.json
contracts/opl-framework/workspace-index.schema.json
contracts/opl-framework/agent-workspace-norm-contract.json
```

## 不做什么

- 不签 domain owner receipt。
- 不判断 artifact quality/export readiness。
- 不把 workspace index 当成 artifact body store。
- 不把 `workspace_inspection.json`、`workspace_resource_inventory.json`、`stage_outputs_index.json` 或 `current_stage.json` 当成 owner receipt、typed blocker、quality verdict 或 domain truth。
- 不把 runtime-state、SQLite sidecar、provider ledger 或 App projection 当成普通用户默认查看面。
- 不让 Skill/MCP/App/OpenAI/AI SDK 通过猜目录直接写 workspace。

## 成功标准

- App、CLI、Skill/MCP/OpenAI/AI SDK delegate 都以 `workspace ensure` 为默认 pre-task gate，并从 `workspace interfaces` 读取可调用 surface。
- 每个 project 都有用户可理解的 display label 和 inspection root。
- 每个 workspace 自动生成并索引 `workspace_inspection.json` 与 `workspace_resource_inventory.json`；每个 project 自动生成并索引 `artifacts/stage_outputs/stage_outputs_index.json` 与 `artifacts/stage_outputs/current_stage.json`。
- `workspace validate` / `doctor` 能检查 generated refs、inspection/resource inventory、stage outputs index/current pointer 的存在和协议形状；对合法 runtime projection 不做空模板覆盖。
- Existing directory adoption 先 dry-run，避免破坏用户文件。
- Workspace 可以独立检查结构健康，且不依赖 domain truth body。
