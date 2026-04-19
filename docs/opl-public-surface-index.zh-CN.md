[English](./opl-public-surface-index.md) | **中文**

# OPL 公开界面索引

## 目的

这份文档索引当前 `OPL Gateway` 的权威公开界面。

它的作用是：让顶层 gateway 在 README、roadmap、rollout、contracts、acceptance、examples，以及链接出去的 domain gateway 公开入口之间更容易被发现。

它应被理解成一套双层 OPL 入口的当前公开界面地图。
面向用户的活跃前台已经是本地 `opl` shell 与 `opl web` pilot。
下层 formal gateway entry 仍然是这里索引的 CLI-first / gateway contract surface。
`MedAutoGrant`、`MedAutoScience` 与 `RedCube AI` 持有这份索引所链接的 admitted domain public-entry surface；历史 freeze 和 activation-package 上下文统一留在 `docs/references/`。
四仓当前阶段与成熟度判断，以 [生态四仓统一状态总表](./references/ecosystem-status-matrix.md) 作为内部参考同步锚点。

如果要看仓库级文档分层与参考级处理规则，请继续看 [文档索引](./README.zh-CN.md)。

## 机器可读工件

- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

当前 CLI-first、只读基线也可以通过下面这些命令暴露同一份工件：

- `list-surfaces`
- `get-surface`

## 覆盖范围

这个 index 聚焦于：

- 顶层 gateway 的 public-entry surface
- formal gateway contract 之上的用户前台层
- 冻结 federation boundary 的 contract surface
- 用于 review 与 discoverability 的 supporting/reference surface
- 仍由各 domain 自己持有 ownership 的 linked domain public-entry surface

## 共享基础结构归属边界

这个索引只位于 shared-foundation 的可发现性层。
`OPL` 在这里拥有的是顶层界面语言、索引方式与跨域导航提示；一旦工作跨过 domain 边界，runtime execution、canonical truth、review truth 与 publication truth 仍然由各 domain gateway / harness 持有。
因此，这份索引是用于可发现性与验收对齐的参考界面。
更完整的归属拆分可参考 [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)。

## 已索引的界面类别

### 1. OPL 公开入口界面

这类界面负责给顶层 gateway 做定位与导航：

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [OPL 任务版图](./task-map.zh-CN.md)
- [Gateway 落地路线](./references/opl-gateway-rollout.zh-CN.md)

在当前公开层，这组界面应和已落地的本地 `opl` shell 与 `opl web` pilot 一起理解：它们共同构成 formal-entry contract 之上的活跃前台。

### 2. OPL 合同界面

这类界面负责冻结 gateway 与 federation 边界：

- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [OPL 运行模型](./operating-model.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md)
- [OPL Gateway 契约面](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)（当前仅作为 planning-level 合同参考；历史 freeze 上下文统一留在 reference 文档）
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md) + `domain-onboarding-readiness.schema.json`
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.zh-CN.md)

### 3. OPL 参考级配套界面

这类界面负责提升审核与可发现性，但不变成执行层：

- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Phase 1 Exit Activation Package](./references/opl-phase-1-exit-activation-package.zh-CN.md)
- [OPL Minimal Admitted-Domain Federation Activation Package](./references/opl-minimal-admitted-domain-federation-activation-package.zh-CN.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./references/opl-operating-example-corpus.zh-CN.md)
- [OPL Operating Record Catalog](./references/opl-operating-record-catalog.zh-CN.md)
- [OPL Surface Lifecycle Map](./references/opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./references/opl-surface-authority-matrix.zh-CN.md)
- [OPL Surface Review Matrix](./references/opl-surface-review-matrix.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)

相关定位配套文档：

- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md) — 用于解释共享架构上位语言，而不是共享代码框架；当前也不单列进机器可读 indexed surface 集合
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md) — 用于冻结跨 domain 共享的运行合同
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md) — 用于冻结跨 domain 共享的正式行为合同

### 4. 已链接的 domain 公开入口界面

这些界面由 `OPL` 做顶层索引，但 ownership 仍留在各自 domain：

- `MedAutoGrant` 对应 `grant_ops`
- `MedAutoScience` 对应 `research_ops`
- `RedCube AI` 对应 `presentation_ops`

关键边界：

- `ppt_deck` 直接映射 `presentation_ops`
- `xiaohongshu` 仍可路由到 `redcube`，并在 OPL 顶层保留独立 visual family 语义
- 当前 linked domain public-entry set 已经是 `MedAutoGrant`、`MedAutoScience` 与 `RedCube AI`
- `Grant Ops` 已经通过已收录的 `MedAutoGrant` domain gateway 承接，`Thesis Ops` 与 `Review Ops` 继续停留在 candidate / onboarding 路径
- 剩余 under-definition workstream 的 admission blocker 继续记录在 candidate-domain backlog 中，并位于 onboarding gate 之下

## 阅读规则

这份索引必须被理解成 **界面地图**。

只要某个界面是 domain-owned，`OPL` 就索引它的 public entry role，而 runtime、review、release 与 submission truth 继续留在对应 domain system 内部。
如果某个界面是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，那么它承担 shared-foundation 层的 boundary/reference 作用。
如果某个界面是 `opl_task_map`，那么其中仍在定义中的 workstream 会继续停留在 candidate / onboarding 路径上，直到 registry 与 onboarding evidence 齐备。
如果某个界面是 `opl_candidate_domain_backlog`，那么它承担这些路径上的 admission-blocker reference 角色。
如果某处提到 `Grant Foundry -> Med Auto Grant`，应把它表达成由 `MedAutoGrant` 承接的已收录 `Grant Ops` domain gateway 入口。
任何后续可能出现的 follow-on route 也仍然只能 targeting `domain_gateway`，并继续受不得直达 harness 的 no-bypass 规则约束。
如果某个界面属于 routed-action prose 或 schema 这一层，那么它会继续停留在 planning-contract / planning-dependency 层。
如果某个界面属于 acceptance、matrix 或 example 这一层，那么它会继续停留在 discoverability / review companion 层。

## Gateway 上位文档

- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [OPL 运行模型](./operating-model.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway 契约面](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)（当前仅作为 planning-level 合同参考；历史 freeze 上下文统一留在 reference 文档）
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
- [OPL Phase 1 Exit Activation Package](./references/opl-phase-1-exit-activation-package.zh-CN.md)
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
- 它把 launcher/runtime authority 与 domain truth ownership 继续放在正确的 owning surface 上
