# 活跃规格索引

Purpose: `specs_index`
State: `active_spec_support`

Status: `spec_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读行为必须使用 contracts、schema、source、CLI/API 行为、runtime ledger、生成产物或语义化 `human_doc:*` id。

本目录故意保持很小。它只收纳仍定义当前 runtime、domain admission、shared boundary 或 product-boundary 的活跃规格支撑。

当前真相先看：

- [文档索引](../README.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [OPL 当前开发线路](../active/current-development-lines.md)
- [OPL 开发文档组合整理](../active/development-document-portfolio.md)
- [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Codex-maxxing Operating Loop Adoption](../runtime/codex-maxxing-operating-loop-adoption.md)

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `standard-domain-agent-implementation.md` | `active_support` | OPL Framework / Foundry Kernel | 标准 Agent Pack、可选 helper、五仓参考矩阵和 OMA 新 Agent 生成规则；机器真相归 ABI/profile contracts 与 conformance source。 |
| `opl-domain-onboarding-contract.md` | `active_support` | Domain admission owner | 候选 domain-agent 准入、truth ownership、entry surface、execution model 和 stage selection readiness 审阅支撑。 |
| `shared-runtime-contract.md` | `active_support` | OPL shared runtime owner | OPL 与 domain repo 之间的 shared runtime 边界支撑；机器真相归 contracts/source/runtime evidence。 |
| `shared-domain-contract.md` | `active_support` | OPL shared domain owner | Domain truth、quality verdict、artifact authority、receipt refs 和 projection 边界支撑。 |

Workspace topology 的目录 schema 归 `contracts/opl-framework/workspace-topology-profile.schema.json`；workspace-local instance schema 归 `contracts/opl-framework/workspace-index.schema.json`；可执行 OPL Agent workspace 规范归 `contracts/opl-framework/agent-workspace-norm-contract.json`，并由 `contract validate`、`opl workspace interfaces`、真实 `workspace_index.json`、App workspace actions 和 `opl agents conformance` 同步消费。`workspace_index.json` 必须暴露 canonical topology、display labels、shared resource roles / manifest refs、indexed project roots、stage outputs root manifest refs、project lifecycle、generated refs、Stage Native 用户检查面和 authority false flags；`opl workspace validate` 是 fail-closed 结构门，`opl workspace doctor` 是只读诊断，`opl workspace adopt --dry-run|--apply` 支持既有目录采用，`opl workspace upgrade --apply` 原地刷新 OPL projections，`opl workspace project archive --apply` 只归档 indexed project lifecycle，`opl workspace export-map` / `health` 提供只读检查投影。Stage Native 默认用户检查面是 workspace-local `artifacts/stage_outputs` 与 domain-owned product views；workspace stage outputs root manifest 不是 `opl_stage_manifest`，不能替代 owner receipt / typed blocker；runtime-state 只做 backing/provenance，不是普通用户默认查看面。`opl actions export` 仍只导 domain-owned family action catalog；workspace ensure / initialization / validation / doctor / adoption / upgrade / project archive / export-map / health 是 OPL-owned framework action surface，MCP/Skill/OpenAI/AI SDK 只导 descriptor-only command contract，不恢复 standalone family MCP server。

旧 Product API / ACP / frontdoor 规格不从本目录恢复；历史规格从 [过程历史规格归档](../history/process/specs/) 进入。

## 收录规则

新的活跃规格只有在仍定义当前 runtime 或 product boundary，且无法更适合地落在核心五件套、`docs/active/`、`docs/references/` 或机器可读合同时，才进入本目录。

规格完成、被吸收或被替代后，应迁入 `docs/history/process/specs/`，并写明当前 owner 与归档理由。
