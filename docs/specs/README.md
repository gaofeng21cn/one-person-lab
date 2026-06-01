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
| `opl-domain-onboarding-contract.md` | `active_support` | Domain admission owner | 候选 domain-agent 准入、truth ownership、entry surface、execution model 和 stage selection readiness 审阅支撑。 |
| `shared-runtime-contract.md` | `active_support` | OPL shared runtime owner | OPL 与 domain repo 之间的 shared runtime 边界支撑；机器真相归 contracts/source/runtime evidence。 |
| `shared-domain-contract.md` | `active_support` | OPL shared domain owner | Domain truth、quality verdict、artifact authority、receipt refs 和 projection 边界支撑。 |

旧 Product API / ACP / frontdoor 规格不从本目录恢复；历史规格从 [过程历史规格归档](../history/process/specs/) 进入。

## 收录规则

新的活跃规格只有在仍定义当前 runtime 或 product boundary，且无法更适合地落在核心五件套、`docs/active/`、`docs/references/` 或机器可读合同时，才进入本目录。

规格完成、被吸收或被替代后，应迁入 `docs/history/process/specs/`，并写明当前 owner 与归档理由。
