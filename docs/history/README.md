# 历史归档索引

这里是 `One Person Lab` 已退役文档路线的统一归档入口。

仓库跟踪的历史材料只从这里进入。`docs/**` 只维护中文 canonical 内容；历史层中的旧双语方案、旧路径和旧命令只按 provenance 阅读，不再维护 docs 层双语镜像。
历史状态按内容判断；长期历史入口固定在 canonical `docs/history/`。任何计划、路线图或参考材料，如果仍把 gateway-first、frontdoor、federation、Hermes-first、host-agent、Product API 或 OMX 写成 active topology，而核心文档没有重新确认，就按历史材料理解。
当前产品真相、共享运行时边界和维护者工作入口统一回到：

- [仓库首页](../../README.md)
- [文档索引](../README.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [`docs/specs/`](../specs/) 下当前仍生效的 runtime / product-boundary 规格；当前无活跃 specs 时回到核心五件套和 `docs/active/`

当前归档路线：

- [兼容性历史归档](./compatibility/README.md)
- [Runtime Substrate 历史归档](./runtime-substrate/README.md)
- [过程历史归档](./process/README.md)
- [Frontdoor 历史资料](./frontdoor-legacy/README.md)
- [OMX 历史资料](./omx/README.md)

本轮内容级治理后，旧 domain admission tranche、Phase 1/2 activation package、gateway/routed-action examples 和 gateway-derived operating governance matrix 已从 `docs/references/` 迁入本历史层：

- [Domain Admission 过程归档](./process/domain-admission/README.md)
- [Gateway / Federation 样例语料归档](./compatibility/gateway-federation/examples-corpora/README.md)
- [Gateway-Derived Operating Governance 归档](./compatibility/gateway-federation/operating-governance/README.md)

Tombstone 规则：

- 退役路线只保留给来源追溯、迁移回顾和审计。
- 不因为历史文件里仍有命令、验收清单或旧路径示例，就恢复旧路线。
- 已迁入历史层的文档不得重新作为 active/reference owner 扩写；有用内容先吸收到当前 owner 文档，再保留原文作为 provenance。
- runtime / product-entry / migration 旧整文档如果已经被吸收，默认从 [Runtime Substrate 历史归档](./runtime-substrate/README.md) 进入。
- 已吸收的 shared-boundary framing 页面进入 [Shared Boundary 过程历史](./process/shared-boundary/README.md)。
- Product API / ACP native specs 已迁入 [过程历史归档](./process/README.md)，只保留历史形成过程。
- One Person Lab App 仓库拆分 closeout 已迁入 [过程历史归档](./process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)；当前 App/workbench 边界回到 `docs/product/`、App 仓合同和真实 release artifact。
- 当前完整 stage-led、以 Agent executor 为最小执行单位的智能体运行框架规划从 [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md) 进入。
