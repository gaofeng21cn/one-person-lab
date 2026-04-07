[English](./opl-public-surface-index.md) | **中文**

# OPL 公开界面索引

## 目的

这份文档索引当前 `OPL Gateway` 的权威公开界面。

它的作用是：让顶层 gateway 在 README、roadmap、rollout、contracts、acceptance、examples，以及链接出去的 domain gateway 公开入口之间更容易被发现。

它不是 runtime registry。
它应被理解为当前 Phase 1 gateway 基线下、面向 CLI-first / read-only discovery 的辅助索引。

如果要看仓库级文档分层与参考级处理规则，请继续看 [文档索引](./README.zh-CN.md)。

## 机器可读工件

- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

当前 CLI-first、只读基线也可以通过下面这些命令暴露同一份工件：

- `list-surfaces`
- `get-surface`

## 非目标

这个 index 不负责：

- 启动执行
- 注册 harness internals
- 把 canonical truth 上收给 `OPL`
- 把 domain system 写成内部模块

## 共享基础结构归属边界

这个索引只位于 shared-foundation 的可发现性层。
`OPL` 在这里拥有的是顶层界面语言、索引方式与跨域导航提示；一旦工作跨过 domain 边界，runtime execution、canonical truth、review truth 与 publication truth 仍然由各 domain gateway / harness 持有。
因此，这份索引只是用于可发现性与验收对齐的参考界面，不是 control plane、execution registry 或共享 truth store。
更完整的归属拆分可参考 [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)。

## 已索引的界面类别

### 1. OPL 公开入口界面

这类界面负责给顶层 gateway 做定位与导航：

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [OPL 任务版图](./task-map.zh-CN.md)
- [Gateway 落地路线](./references/opl-gateway-rollout.zh-CN.md)

### 2. OPL 合同界面

这类界面负责冻结 gateway 与 federation 边界：

- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [OPL 运行模型](./operating-model.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md) + `domain-onboarding-readiness.schema.json`
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.zh-CN.md)

### 3. OPL 参考级配套界面

这类界面负责提升审核与可发现性，但不变成执行层：

- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./references/opl-operating-example-corpus.zh-CN.md)
- [OPL Operating Record Catalog](./references/opl-operating-record-catalog.zh-CN.md)
- [OPL Surface Lifecycle Map](./references/opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./references/opl-surface-authority-matrix.zh-CN.md)
- [OPL Surface Review Matrix](./references/opl-surface-review-matrix.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)

相关定位配套文档：

- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md) — 用于解释共享 substrate 语言，但当前不单列进机器可读 indexed surface 集合

### 4. 已链接的 domain 公开入口界面

这些界面由 `OPL` 做顶层索引，但 ownership 仍留在各自 domain：

- `MedAutoScience` 对应 `research_ops`
- `RedCube AI` 对应 `presentation_ops`

关键边界：

- `ppt_deck` 直接映射 `presentation_ops`
- `xiaohongshu` 仍可路由到 `redcube`，但不自动等于 `presentation_ops`
- `Grant Ops`、`Review Ops`、`Thesis Ops` 可以在 task map 中以 under-definition workstream 出现，但这不代表它们已经变成正式收录 domain 或 routed target
- 这些 under-definition workstream 当前的 admission blocker 记录在 candidate-domain backlog 中，且仍位于 onboarding gate 之下

## 阅读规则

这份索引必须被理解成 **界面地图**，而不是 execution registry。

只要某个界面是 domain-owned，`OPL` 就只索引它的 public entry role。
canonical runtime truth、review truth、release truth 与 submission truth 仍然留在对应 domain system 内部。
如果某个界面是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，那么它也只是在 shared-foundation 层承担 boundary/reference 作用，不会把 canonical truth、mutation、review truth 或 publication truth 上收到 `OPL`。
如果某个界面是 `opl_task_map`，那么其中仍在定义中的 workstream 也只代表顶层语义候选，不代表它们已经通过 onboarding 与 registry 门槛。
如果某个界面是 `opl_candidate_domain_backlog`，那么它也只是一份 admission-blocker reference，并不代表 onboarding readiness、discovery readiness 或 routed-action readiness 已经具备。
如果某个界面是 `opl_gateway_rollout`，那么它仍然只是顶层 public-entry map，不会升级成 runtime authority engine 或 launcher。
如果某个界面属于 acceptance、matrix 或 example 这一层，那么它也仍然只是 discoverability / review companion，不会把其中列出的全部工件一并提升成 gate。

## Gateway 上位文档

- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [OPL 运行模型](./operating-model.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.zh-CN.md)

## 配套示例 / 审核 / 映射界面

这些配套界面只负责提升可发现性与可审核性，
不会升级成治理性 gateway 界面。
它们也不会因为被索引到这里，就自动变成 runtime controller、执行授权矩阵或统一 promotion gate。

- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./references/opl-operating-example-corpus.zh-CN.md)
- [OPL Operating Record Catalog](./references/opl-operating-record-catalog.zh-CN.md)
- [OPL Surface Lifecycle Map](./references/opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./references/opl-surface-authority-matrix.zh-CN.md)
- [OPL Surface Review Matrix](./references/opl-surface-review-matrix.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，public surface index 才算合格：

- 它保持 machine-readable
- 它区分 OPL-owned surface 与 domain-owned public entry
- 它把 derived 的 surface lifecycle map 暴露为 supporting/reference surface
- 它把 derived 的 surface authority matrix 暴露为 supporting/reference surface
- 它把 derived 的 surface review matrix 暴露为 supporting/reference surface
- 它把 candidate-domain backlog 暴露为位于 onboarding gate 之下的 supporting/reference surface
- 它把 `opl_operating_model`、`opl_shared_foundation` 与 `opl_shared_foundation_ownership` 暴露为 OPL-owned 的 contract/reference surface，而不是执行层
- 它把 task-map / task-topology surface 暴露出来，但不把仍在定义中的 workstream 升格成正式收录 domain
- 它不暗示 launcher、runtime 或 harness bypass
- 它不把 canonical truth 上收给 `OPL`
