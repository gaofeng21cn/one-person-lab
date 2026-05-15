# OPL Operating Example Corpus

## 目的

这份文档索引已冻结 `P5.M1` 与 `P5.M2` operating surface 的 canonical machine-readable operating-record examples。

它的目标是：在不把 example 误读成 workflow runtime 或 truth surface 的前提下，让顶层 governance、review-index、publish-readiness、publish-outcome 与 promotion-surface record 更容易被检查。

## 非目标

这组 corpus 不负责：

- 实现 runtime
- 执行 review、publish、release、export、submission 或 promotion action
- 替代正式的 operating-surface contract
- 声称自己拥有 review truth、publish truth、promotion truth 或 public-channel posting truth
- 授权 `OPL` 直接执行 publish、release、export、submission 或 posting

这些 example 只是 illustrative 的 operating-record walkthrough。

## Former Example Set

### 1. Governance decision

- Former artifact：`examples/opl-framework/governance-decision-record.json`（已从 active repo artifact set 退役）
- 展示位于 domain-owned review truth 之上的顶层 decision record。

### 2. Cross-domain review index

- Former artifact：`examples/opl-framework/cross-domain-review-index.json`（已从 active repo artifact set 退役）
- 展示 `OPL` 如何索引跨 domain 所需的 review surface 与 blocking gate，而不复制 review truth。

### 3. Publish readiness signal

- Former artifact：`examples/opl-framework/publish-readiness-signal.json`（已从 active repo artifact set 退役）
- 展示在 domain-owned publish truth 形成之前的 pre-publish readiness index。

### 4. Publish outcome index

- Former artifact：`examples/opl-framework/publish-outcome-index.json`（已从 active repo artifact set 退役）
- 展示对 domain-owned publish / release / export / submission outcome 的顶层索引。

### 5. Promotion candidate signal

- Former artifact：`examples/opl-framework/promotion-candidate-signal.json`（已从 active repo artifact set 退役）
- 展示建立在 domain-owned outcome truth 之上的 post-publish promotion-readiness signal。

### 6. Promotion surface index

- Former artifact：`examples/opl-framework/promotion-surface-index.json`（已从 active repo artifact set 退役）
- 展示在 domain-owned outcome 已存在之后，对 public surface reference 与 blocker 的顶层索引。

## 阅读规则

这些 example 必须被理解成 **contract-level operating-record walkthroughs**，而不是 executable workflow。

只要 example 引用了 review、publish、promotion 或 public-channel truth，这些 truth 仍然通过 `domain_truth_refs` 留在对应 domain system 内部。
任何后续 action 都必须指向当前 domain-owned capability entry 或 action-route ref。历史 example 仍可能包含 legacy literal `domain_gateway`，但这组 corpus 不把它保留成 active compatibility route，也不授权 harness bypass、direct venue submission 或 direct public posting。

## 上位合同

- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Gateway Acceptance Test Spec](../opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../../../contracts/opl-framework/README.md)

## 相关配套示例

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## 完成定义

只有当下面这些条件都成立时，这组 operating example corpus 才算合格：

- former artifact 名称只保留 provenance 语义，不再作为可点击 active repo path
- corpus 保持 illustrative、non-governing、non-executing
- corpus 不把 review、publish 或 promotion truth 上收给 `OPL`
- active schema 与行为 truth 必须来自当前 contracts/source/CLI 行为
- 任何后续 action 都指向当前 domain-owned capability/action-route refs，而不是把 `domain_gateway` 保留成 compatibility value
