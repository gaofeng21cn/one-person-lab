[English](./opl-operating-example-corpus.md) | **中文**

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

## 当前 Example Set

### 1. Governance decision

- 文件：[`../../examples/opl-gateway/governance-decision-record.json`](../../examples/opl-gateway/governance-decision-record.json)
- 展示位于 domain-owned review truth 之上的顶层 decision record。

### 2. Cross-domain review index

- 文件：[`../../examples/opl-gateway/cross-domain-review-index.json`](../../examples/opl-gateway/cross-domain-review-index.json)
- 展示 `OPL` 如何索引跨 domain 所需的 review surface 与 blocking gate，而不复制 review truth。

### 3. Publish readiness signal

- 文件：[`../../examples/opl-gateway/publish-readiness-signal.json`](../../examples/opl-gateway/publish-readiness-signal.json)
- 展示在 domain-owned publish truth 形成之前的 pre-publish readiness index。

### 4. Publish outcome index

- 文件：[`../../examples/opl-gateway/publish-outcome-index.json`](../../examples/opl-gateway/publish-outcome-index.json)
- 展示对 domain-owned publish / release / export / submission outcome 的顶层索引。

### 5. Promotion candidate signal

- 文件：[`../../examples/opl-gateway/promotion-candidate-signal.json`](../../examples/opl-gateway/promotion-candidate-signal.json)
- 展示建立在 domain-owned outcome truth 之上的 post-publish promotion-readiness signal。

### 6. Promotion surface index

- 文件：[`../../examples/opl-gateway/promotion-surface-index.json`](../../examples/opl-gateway/promotion-surface-index.json)
- 展示在 domain-owned outcome 已存在之后，对 public surface reference 与 blocker 的顶层索引。

## 阅读规则

这些 example 必须被理解成 **contract-level operating-record walkthroughs**，而不是 executable workflow。

只要 example 引用了 review、publish、promotion 或 public-channel truth，这些 truth 仍然通过 `domain_truth_refs` 留在对应 domain system 内部。
任何后续 action 仍然必须 route 到 `domain_gateway`；这组 corpus 不授权 harness bypass、direct venue submission 或 direct public posting。

## 上位合同

- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)

## 相关配套示例

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，这组 operating example corpus 才算合格：

- 每个 example 都保持 machine-readable
- governance examples 直接通过 frozen governance-audit schema 校验
- publish / promotion examples 直接通过 frozen publish-promotion schema 校验
- examples 保持 illustrative、non-governing、non-executing
- examples 不把 review、publish 或 promotion truth 上收给 `OPL`
- 任何后续 action 仍然必须 route 进 `domain_gateway`
