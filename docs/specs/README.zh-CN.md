# 活跃与保留规格索引

Status: `spec_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读行为必须使用 contracts、schema、source、CLI/API 行为、runtime ledger、生成产物或语义化 `human_doc:*` id。

本目录故意保持很小。它只收纳仍对维护有用的 runtime / product-boundary 设计文档；即使这些文档的活跃结论已经被新的 owner surface 吸收，也可以因为路径稳定性暂时保留在这里。

当前真相先看：

- [文档索引](../README.zh-CN.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [文档组合治理](../docs_portfolio_consolidation.md)
- [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `2026-04-20-opl-product-api-and-domain-agent-boundary-design.md` | `support_reference_retained_path` | 核心五件套与 stage-led framework roadmap | 八类产品资源模型已经被吸收。不要把历史本地 Product API service、`frontdoor` 或 `opl web` 恢复成当前用户入口。 |
| `2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md` | `support_reference_retained_path` | 核心五件套与 stage-led framework roadmap | session-runtime-first pivot 已经被吸收。ACP/Product API 语言只作 projection 支撑，除非当前合同重新确认。 |

## 收录规则

新的活跃规格只有在仍定义当前 runtime 或 product boundary，且无法更适合地落在核心五件套、`docs/active/`、`docs/references/` 或机器可读合同时，才进入本目录。

规格完成、被吸收或被替代后，应迁入 `docs/history/process/specs/`，或在本目录标成 retained path，并写明当前 owner 与阅读规则。
