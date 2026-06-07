# OPL Workspace

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 workspace schemas、source、CLI/API 行为、真实 workspace evidence、domain-owned artifact authority 和 App evidence。

## 品牌定位

`OPL Workspace` 是 OPL 的项目与文件管理模块。它把用户材料、共享资源、stage output、working artifacts、review、handoff、owner receipt 和 typed blocker 放在一个可检查、可恢复、可迁移的项目空间里。

一句话：`Workspace` 管“这个任务的文件在哪里、哪些是输入、哪些是 stage 产物、哪些可交付、哪些只是 runtime 证据”。

## 设计理念

- 用户检查面优先：普通用户应看到 project、sources、stage outputs、reviews、handoff 和 deliverables，而不是 provider internals。
- 机器 topology 优先：物理目录可以保留领域语义，但必须投影到统一 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`。
- Series-ready by default：一次性项目也使用可升级成 series / portfolio 的 skeleton。
- Runtime-state 降级为 backing/provenance：它不能替代 stage folder、owner receipt 或 typed blocker。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `workspace.yaml` | workspace identity、agent binding、mode、root policy。 |
| `workspace_index.json` | canonical topology、display labels、shared resources、indexed projects。 |
| `workspace_group` | 一个 agent 或 portfolio 下的项目集合。 |
| `project_unit` | 一个 paper、grant、deck、agent target 或 deliverable project。 |
| `stage_artifact_unit` | 某个 stage 的用户可检查产出位置。 |
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
- 不把 runtime-state 当成普通用户默认查看面。

## 成功标准

- App、CLI、Skill/MCP delegate 都以 `workspace ensure` 为默认 pre-task gate。
- 每个 project 都有用户可理解的 display label 和 inspection root。
- Existing directory adoption 先 dry-run，避免破坏用户文件。
- Workspace 可以独立检查结构健康，且不依赖 domain truth body。
