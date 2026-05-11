# 活跃规格索引

Status: `spec_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读行为必须使用 contracts、schema、source、CLI/API 行为、runtime ledger、生成产物或语义化 `human_doc:*` id。

本目录故意保持很小。它只收纳仍定义当前 runtime 或 product boundary 的活跃规格。

当前真相先看：

- [文档索引](../README.zh-CN.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [OPL 当前开发线路](../active/current-development-lines.zh-CN.md)
- [OPL 开发文档组合整理](../active/development-document-portfolio.zh-CN.md)
- [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| 当前无活跃规格 | `empty_active_spec_set` | 核心五件套、`docs/active/`、runtime-substrate roadmap 和 machine-readable contracts | 不从旧 specs 恢复 Product API / ACP / frontdoor 语义；历史规格从 [过程历史规格归档](../history/process/specs/) 进入。 |

## 收录规则

新的活跃规格只有在仍定义当前 runtime 或 product boundary，且无法更适合地落在核心五件套、`docs/active/`、`docs/references/` 或机器可读合同时，才进入本目录。

规格完成、被吸收或被替代后，应迁入 `docs/history/process/specs/`，并写明当前 owner 与归档理由。
