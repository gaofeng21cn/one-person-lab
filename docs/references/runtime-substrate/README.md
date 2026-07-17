# Runtime Substrate 参考索引

Purpose: `references_runtime_substrate_index`
State: `support_reference`

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读行为必须使用合同、源码、CLI/API 行为、runtime ledger、生成产物或 `human_doc:*` 语义标识。

本目录收纳 runtime、provider、executor、product-entry 与迁移参考。生命周期状态按内容角色判断，长期落点服从 OPL-family canonical docs taxonomy。

当前 owner surfaces：

- [OPL 当前开发线路](../../active/current-development-lines.md)：framework-first 内容级执行地图。
- [OPL 系列项目开发主参考](../../active/opl-family-development-reference.md)：跨 OPL、MAS、MAG、RCA 与 OPL-owned App/workbench 目标的主开发读法；固定全局计划、单仓计划、上收清单、同名 docs taxonomy 和过时兼容面退役规则。
- [OPL 开发文档组合整理](../../active/development-document-portfolio.md)：按内容判断旧 runtime / product-entry / migration 文档应吸收、保留、降级、退役还是归档。
- [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.md)：完整 stage-led、以 Agent executor 为最小执行单位的智能体运行框架的总入口。
- [OPL 与 Foundry Agents 理想目标态](./opl-family-agent-ideal-state.md)：描述 OPL Framework、Foundry Agents、workspace/runtime artifact root 与 One Person Lab App 的 north-star 目标边界。
- [OPL Family 理想系统评估](./opl-family-ideal-system-assessment.md)：从平台工程、durable runtime、agent runtime、observability、design system 和 delivery metrics 的成熟经验出发，评估 OPL 基座、App、MAS/MAG/RCA/OMA 与品牌一致性的 north-star 目标态。
- [AI-first / executor-first 长期优化调研入口](./ai-first-executor-first-long-horizon-optimization.md)：固定 Codex-first 薄框架调研提示词、外部成熟框架经验吸收规则、OPL/MAS/MAG/RCA/OMA 设计审计重点与下一轮 conformance / evidence 优化方向。
- [标准智能体 domain-owned extension 合同](./standard-agent-domain-owned-extension-contracts.md)：解释 OPL 通用 engine 与 domain-owned conformance profile、evaluation suite、adapter 和 operator projection 的扩展边界。
- [Temporal family runtime provider 支撑参考](./temporal-family-runtime-provider-plan.md)：production online runtime 必需 provider 的支撑边界与动态证据入口。
- [OPL Runtime Manager 目标形态](./opl-runtime-manager-target.md)：provider readiness、native helper、state index 与 operator projection 的当前支撑参考；它不替代 family runtime provider，也不授权 OPL 写 domain truth。

本目录中的 legacy evaluation references 仍可能提到 gateway-first、frontdoor、federation、host-agent、Hermes-first 或较早 direct-entry 计划。保留在这里的条件是它们仍服务当前 runtime/provider/executor 边界审计；任何旧 provider、Gateway、frontdoor、compatibility、direct-entry 或 host-agent-only 叙述都只能按 history/provenance/negative-guard 阅读，不能恢复成 active plan、active interface 或 compatibility promise。

2026-05-11 / 2026-05-14 内容级整理后，早期 direct-entry、Hermes-first、host-agent-only、managed-runtime checklist、vertical online-agent platform、Hermes runtime-substrate benchmark 和 MAS cutover 整文档已经迁入 [Runtime Substrate 历史归档](../../history/runtime-substrate/README.md)。本目录继续只保留当前 runtime/provider/executor support references，以及仍需靠近 current roadmap 的 migration / evaluation 参考。

复用本目录内容前：

1. 先按正文判断当前内容角色。
2. 如果它描述旧 topology 或旧计划，按 superseded 处理。
3. 如果它描述当前 provider-backed stage execution，先与 roadmap 和核心五件套核对。
4. 不要让测试或脚本依赖这些文件的叙述措辞或标题。
