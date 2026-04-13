# OPL Gateway 契约目录

这个目录是 `One Person Lab` 在当前仓库中的 `G1` federation contract materialization。

它冻结的是后续 discovery 层与 routed-action 层可消费的 machine-readable gateway surface。

## Shared-foundation ownership boundary

这些 contract 与 reference 工件只位于 shared-foundation 的 materialization 层。
`OPL` 在这里拥有的是顶层 contract 语言、索引方式与跨域复用规则；一旦 routed request 跨过 gateway 边界，runtime execution、canonical truth、review truth 与 publication truth 仍然由各 domain gateway / harness 持有。
因此，这个目录承担的是 discoverability / reviewability / acceptance alignment 所需的 gateway surface materialization。
围绕这一层命名的 `Unified Harness Engineering Substrate` 继续充当整个体系的共享架构上位语言。
当前在这套上位语言之下，长期在线运行部分正收敛为 `Shared Runtime Contract`，跨 domain 正式行为部分正收敛为 `Shared Domain Contract`。
更完整的 ownership split 可参考[共享基础结构](../../docs/shared-foundation.zh-CN.md)与[共享基础结构归属](../../docs/shared-foundation-ownership.zh-CN.md)。

## 当前基线与已吸收 follow-on 对齐

截至 `2026-04-11`，当前 `opl-mainline` 的公开主线仍停留在已 absorbed 的 `Phase 2 / Minimal admitted-domain federation activation package`，但 repo-tracked 的 formal entry 仍然是 `Phase 1` 那条本地 `TypeScript CLI`-first、read-only gateway baseline；它只读取这个目录中已经冻结的 contract 工件。
这条 transport 当前通过 Codex-only 本地会话完成规划、实现与验证，但这个目录并不会把 Codex 声明成产品 runtime substrate owner。
已完成的 `Phase 1 / G2 release-closeout` 已把 `G2 stable public baseline` 收口成稳定、单一、repo-tracked 的公开基线。
因此，即便公开主线已经吸收了这份最小 admitted-domain federation package，这条 repo-tracked 基线也仍然是当前 `OPL` 的 formal entry contract 与 public system surface。
已完成的 repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` 继续停留在 planning-contract closeout 层：当前目录冻结围绕 `route_request`、`build_handoff_payload`、`audit_routing_decision` 的 planning gate / planning-level contract。唯一允许的成功 handoff 目标仍只能是 `domain_gateway`；no-bypass 规则继续禁止直达 domain harness；`routed-actions.schema.json` 继续停留在 planning dependency 层。
repo-tracked 的 `Phase 1` candidate-domain closeout 顺序已冻结为 `Review Ops` 然后 `Thesis Ops`：这两条 candidate path 都继续停留在 domain admission、`G2` discovery readiness、`G3` routed-action readiness 与 handoff readiness 之下。
当前已 absorb 的前序门槛是 `Phase 1 exit + next-stage activation package freeze`；当前这份 `Minimal admitted-domain federation activation package` 也已经被吸收到 repo-tracked 顶层真相中，只对已经 admitted 的 `MedAutoScience` 与 `RedCube AI` domain surface 生效。当前没有新的 active follow-on tranche 打开；只有 admitted-domain 仓再落下新的 absorbed delta，或中央 reference surfaces 发生真实漂移时，下一次 central sync 才是诚实的。runtime ownership 继续保留在 admitted domain 一侧。
因此，当前 OPL 层的 repo-tracked formal entry 也仍然是这条本地 `TypeScript CLI`-first / read-only gateway surface。
这个交付目标把已有的顶层 contract language 继续维持为本地 CLI surface 可读取的合同入口；任何诚实的上游 `Hermes-Agent` rollout，仍然属于 domain 侧迁移目标，而不是当前 OPL 层既成事实。

## 当前参考同步配套文档

下面这些 reference-grade 配套文档用于冻结当前跨仓状态图与 Codex-only runtime 口径，并让当前目录与权威公开表面保持同步。
下面这组活跃参考以 `2026-04-11` 为日期锚点，并承担把 admitted-domain 最新 absorbed delta 持续回写到 `OPL` 顶层参考同步面的责任；这些参考面不会反向抬升为公开主线真相。

- [生态四仓统一状态总表](../../docs/references/ecosystem-status-matrix.md) — 当前四仓阶段/状态总览（中文内部参考）
- [Contract Convergence v1 执行板](../../docs/references/contract-convergence-v1-execution-board.md) — 当前统一 program、active phase 与离场条件（中文内部参考）
- [Codex-default Host-Agent Runtime 合同](../../docs/references/host-agent-runtime-contract.md) — 当前本地默认 runtime 口径（中文内部参考）
- [家族 Executor Adapter 默认口径](../../docs/references/family-executor-adapter-defaults.md) — 当前家族默认执行器路线与 `Hermes-native` guardrail（中文内部参考）
- [四仓执行器后续任务与 Hermes-Agent 备选执行器评估](../../docs/references/four-repo-executor-follow-up-and-hermes-evaluation.md) — 当前剩余执行器统一工作与 `Hermes-Agent` 备选执行器评估（中文内部参考）

## 历史迁移参考

这组文档仅保留为历史迁移与 offboarding 上下文。当前活跃执行主线继续通过 Codex-only 的公开表面来表达。

- [四仓统一开发运行合同](../../docs/references/development-operating-model.md) — `Codex Host` / `OMX` 运行纪律的历史迁移参考
- [四仓统一对齐检查表与任务板](../../docs/references/runtime-alignment-taskboard.md) — 已退役四仓收口清单的历史参考
- [OMX 历史资料索引](../../docs/history/omx/README.zh-CN.md) — 中文历史资料入口

## 上位文档

- [OPL Gateway Federation](../../docs/gateway-federation.md)
- [OPL Gateway Federation（中文）](../../docs/gateway-federation.zh-CN.md)
- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Operating Model](../../docs/operating-model.md)
- [OPL Operating Model（中文）](../../docs/operating-model.zh-CN.md)
- [Shared Runtime Contract](../../docs/shared-runtime-contract.md)
- [Shared Runtime Contract（中文）](../../docs/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/shared-domain-contract.md)
- [Shared Domain Contract（中文）](../../docs/shared-domain-contract.zh-CN.md)
- [Shared Foundation](../../docs/shared-foundation.md)
- [Shared Foundation（中文）](../../docs/shared-foundation.zh-CN.md)
- [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md)
- [Shared Foundation Ownership（中文）](../../docs/shared-foundation-ownership.zh-CN.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Read-Only Discovery Gateway（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Routed Action Gateway（中文）](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.md)
- [OPL Domain Onboarding Contract（中文）](../../docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../../docs/references/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../../docs/references/opl-publish-promotion-operating-surface.md)
- [OPL Publish / Promotion Operating Surface（中文）](../../docs/references/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../docs/references/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Acceptance Test Spec（中文）](../../docs/references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Rollout](../../docs/references/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/references/opl-gateway-rollout.zh-CN.md)
- [OPL Public Surface Index](../../docs/opl-public-surface-index.md)
- [OPL Public Surface Index（中文）](../../docs/opl-public-surface-index.zh-CN.md)
- [OPL Task Map](../../docs/task-map.md)
- [OPL Task Map（中文）](../../docs/task-map.zh-CN.md)
- [English](./README.md)

## 配套示例集

- [OPL Gateway Example Corpus](../../docs/references/opl-gateway-example-corpus.zh-CN.md) — 展示当前已冻结 gateway layers 如何做 canonical、illustrative 的 contract-level composition
- [OPL Routed-Safety Example Corpus](../../docs/references/opl-routed-safety-example-corpus.zh-CN.md) — 展示显式非成功 G3 路由状态的 canonical、illustrative safety walkthrough
- [OPL Operating Example Corpus](../../docs/references/opl-operating-example-corpus.zh-CN.md) — 为已冻结 P5.M1 / P5.M2 surface 提供 canonical 的独立 operating-record example

这三组示例都只是配套参考，不替代本目录中的 governing contracts。

## 配套参考 Surfaces

- [OPL Candidate Domain Backlog](../../docs/references/opl-candidate-domain-backlog.zh-CN.md) — 当前 under-definition workstream 的 reference-only machine-readable admission-blocker backlog
- [OPL Phase 1 Exit Activation Package](../../docs/references/opl-phase-1-exit-activation-package.zh-CN.md) — 当前 `Phase 1` 离场门槛、deferred surface 与最小下一阶段判断的 reference-grade freeze
- [OPL Minimal admitted-domain federation activation package](../../docs/references/opl-minimal-admitted-domain-federation-activation-package.zh-CN.md) — 仅面向已 admitted domain 的最小 stronger federation wording 的 reference-grade activation freeze
- [OPL Surface Lifecycle Map](../../docs/references/opl-surface-lifecycle-map.zh-CN.md) — 对当前已冻结 gateway / operating / supporting surfaces 的 derived machine-readable lifecycle 视图
- [OPL Surface Authority Matrix](../../docs/references/opl-surface-authority-matrix.zh-CN.md) — 对当前已冻结 OPL surfaces 与 linked domain public-entry surfaces 的 derived machine-readable authority split
- [OPL Surface Review Matrix](../../docs/references/opl-surface-review-matrix.zh-CN.md) — 对当前已冻结 OPL public / contract / supporting surfaces 的 derived machine-readable review obligation
- [Paperclip Control Plane Operator Guide](../../docs/references/paperclip-control-plane-operator-guide.md) — 可选下游 Paperclip bridge 的 operator loop、bootstrap 与 sync 使用说明

这些 backlog 与 mapping surfaces 都是 reference-only surface，继续作为本目录 governing contracts 的配套参考。

## 文件

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — 共享 routing vocabulary 与已冻结的 routing rules
- [`handoff.schema.json`](./handoff.schema.json) — 已冻结的 G1 handoff payload JSON Schema
- [`routed-actions.schema.json`](./routed-actions.schema.json) — 停留在 `Phase 1 / G3 thin handoff planning freeze hardening` closeout 边界上的 planning dependency；它是 planning-level contract 工件，不是 launcher，也不表示当前主线已进入 routed-action runtime
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — machine-readable domain onboarding readiness gate 的 JSON Schema
- [`family-executor-adapter-defaults.json`](./family-executor-adapter-defaults.json) — 当前家族默认 executor-adapter route 与硬 guardrail 的 machine-readable freeze
- [`paperclip-control-plane.schema.json`](./paperclip-control-plane.schema.json) — 可选 `OPL -> Paperclip` 下游 control-plane bridge surface 的 JSON Schema，覆盖 config / binding / status / bootstrap / task / gate / sync payload；未配置 `Paperclip` 时不影响 `OPL` 主入口运行
- [`governance-audit.schema.json`](./governance-audit.schema.json) — 已冻结的 P5.M1 governance / audit operating contract JSON Schema
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — 已冻结的 P5.M2 publish / promotion operating contract JSON Schema
- [`acceptance-matrix.json`](./acceptance-matrix.json) — 已冻结 gateway 与 operating surface 的 declarative acceptance matrix
- [`public-surface-index.json`](./public-surface-index.json) — 当前权威 OPL public surface 与链接 domain public entry 的 machine-readable index
- [`task-topology.json`](./task-topology.json) — 覆盖已收录与仍在定义中的 OPL workstream 的 machine-readable 顶层任务版图
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — 当前 under-definition workstream 的 machine-readable admission-blocker backlog
- [`phase-1-exit-activation-package.json`](./phase-1-exit-activation-package.json) — 当前 `Phase 1` 离场门槛、deferred surface 与最小下一阶段判断的 machine-readable freeze
- [`minimal-admitted-domain-federation-activation-package.json`](./minimal-admitted-domain-federation-activation-package.json) — 仅面向已 admitted domain 的最小 stronger federation wording 的 machine-readable activation freeze
- [`operating-record-catalog.json`](./operating-record-catalog.json) — 已冻结 P5.M1 / P5.M2 operating record kind 的 machine-readable reference catalog
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — 当前已冻结 gateway / operating / supporting surfaces 的 machine-readable derived lifecycle map
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — 当前已冻结 OPL surfaces 与 linked domain public-entry surfaces 的 machine-readable derived authority matrix
- [`surface-review-matrix.json`](./surface-review-matrix.json) — 当前已冻结 OPL public / contract / supporting surfaces 的 machine-readable derived review matrix

## 已冻结的当前映射

- `research_ops` 路由到 `medautoscience`
- `presentation_ops` 路由到 `redcube`
- `ppt_deck` 直接映射到 `presentation_ops`
- `xiaohongshu` 可以路由到 `redcube`，但不自动等于 `presentation_ops`

## 边界规则

- `OPL` 仍是顶层 gateway 与 federation surface。
- 路由发生后，domain gateway 仍保持独立可用。
- domain harness 始终位于 domain gateway 之下。
- canonical truth ownership 继续留在各自拥有它的 domain。
- successful routing 继续只经过 domain gateway。

## 当前范围

这个目录包含两类内容：

- 在公开 G1 contract 中已经冻结边界、并已正式收录的 workstream / domain registry 与 contract 工件
- derived / reference-only 的 task-topology 工件；它们可以提到仍在定义中的 workstream，但不会把这些 workstream 自动纳入 `G1`、`G2` 或 `G3`
- derived / reference-only 的 candidate-domain backlog 工件；它们只记录 admission boundary 还缺什么，不会虚构 placeholder domain 或 routed target
- 在先证明存在真实缺失边界之前，不额外新增独立的 candidate-domain-definition contract surface；当前 `task-topology + candidate-domain-backlog + domain-onboarding` 的组合就是现行定义路径

`Grant Ops`、`Review Ops`、`Thesis Ops` 等 planned workstream，在对应 domain 边界明确冻结之前，继续停留在 candidate-definition 路径上。
如果当前公开文档里提到 `Grant Foundry -> Med Auto Grant`，应把它表达成活跃的 grant-domain 业务仓路径，同时明确它在顶层 federation admission / handoff wording 上仍单独门控；它不会自动等于 admitted、discovery-ready、routed-action-ready 或 handoff-ready surface。

## Materialization 说明

上层 prose 文档用 `opl/...` 这样的 surface 名表达 canonical contract intent。
这个目录则是在当前仓库中的具体落地，同时保持同一 contract shape。
