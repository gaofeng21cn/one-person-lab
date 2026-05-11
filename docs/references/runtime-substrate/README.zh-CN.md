# Runtime Substrate 参考索引

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读行为必须使用合同、源码、CLI/API 行为、runtime ledger、生成产物或 `human_doc:*` 语义标识。

本目录收纳 runtime、provider、executor、product-entry 与迁移参考。治理规则按内容生命周期判断，不按文件名机械判断。

当前 owner surfaces：

- [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.zh-CN.md)：完整 Codex-first、stage-led 智能体运行框架的总入口。
- [Temporal family runtime provider 落地计划](./temporal-family-runtime-provider-plan.zh-CN.md)：生产 provider 候选的当前支撑计划。
- [OPL Runtime Manager 目标形态](./opl-runtime-manager-target.md)：provider readiness、native helper 和 state index 边界的当前支撑目标。

本目录中的 legacy references 仍可能提到 gateway-first、frontdoor、federation、host-agent、Hermes-first 或较早 direct-entry 计划。这些内容只保留给迁移回顾和来源追溯，不得覆盖 roadmap、核心五件套或当前机器可读合同。

复用本目录内容前：

1. 先按正文判断当前内容角色。
2. 如果它描述旧 topology 或旧计划，按 superseded 处理。
3. 如果它描述当前 provider-backed stage execution，先与 roadmap 和核心五件套核对。
4. 不要让测试或脚本依赖这些文件的叙述措辞或标题。
