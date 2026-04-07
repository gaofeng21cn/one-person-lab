[English](./opl-routed-action-gateway.md) | **中文**

# OPL Routed Action Gateway

## 目的

这份文档冻结 `OPL Gateway` 的 `G3` 合同。

`G3` 是 `OPL` 第一次可以接收顶层 action request，并把它路由到正确 domain gateway 的阶段。
在当前 `Phase 1`，这份文档只作为 `G3 thin handoff planning / pre-freeze` 的合同参考；它不表示当前仓库已经进入 routed-action implementation。

目标不是做成单体 runtime。
目标是把顶层路由做成显式、可审计、可安全执行的合同。

## 与 G1 / G2 的关系

`G3` 建立在下面这些东西之上：

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)

如果 `G1` 还没冻结，或者 `G2` discovery 语义仍然模糊，`G3` 不应继续推进。

## 核心承诺

在 `G3`，Agent 应该可以：

- 向 `OPL` 提交顶层 action request
- 拿到显式 routing decision
- 为目标 domain gateway 构建稳定 handoff payload
- 在请求进入 domain gateway 之前写下可审计的 routing trace

但它仍然**不能**：

- 绕过 domain gateway
- 直达 domain harness
- 把 canonical truth ownership 上收给 `OPL`

## 必需操作

最小 routed-action gateway 必须暴露这些操作：

- `route_request`
- `build_handoff_payload`
- `audit_routing_decision`

## 操作定义

### `route_request`

目的：

- 按 workstream 语义分类顶层 action request，并确定下一层正式入口面

必需输入：

- `request_id`
- `request_kind`
- `intent`
- `target`
- `goal`
- 可选 `materials`
- 可选 `constraints`
- 可选 `preferred_family`
- 可选 `preferred_profile`

路由顺序：

1. 先按 `workstream semantics` 路由
2. 再按 `domain ownership` 路由
3. 最后按 `family / profile preference` 路由

建议 routed 响应：

```json
{
  "version": "g3",
  "operation": "route_request",
  "payload": {
    "status": "routed",
    "request_id": "opl-2026-04-05-010",
    "request_kind": "create",
    "workstream_id": "presentation_ops",
    "domain_id": "redcube",
    "entry_surface": "domain_gateway",
    "recommended_family": "ppt_deck",
    "preferred_profile": "defense_deck",
    "confidence": "high",
    "reason": "The goal is a formal defense-ready presentation deliverable.",
    "routing_evidence": [
      "presentation_delivery intent",
      "ppt_deck directly maps to presentation_ops",
      "presentation_ops is owned by redcube"
    ]
  }
}
```

特殊规则：

- `ppt_deck` 直接映射 `presentation_ops`
- `xiaohongshu` 仍可能路由到 `redcube`
- 但除非顶层语义真的匹配 presentation material，否则不能自动标成 `presentation_ops`

### `build_handoff_payload`

目的：

- 构建从 `OPL` 传给目标 domain gateway 的稳定 payload

必需规则：

- 只有在 `route_request` 返回 `status = routed` 后，这个操作才允许执行
- 输出必须符合 [`../contracts/opl-gateway/handoff.schema.json`](../contracts/opl-gateway/handoff.schema.json)

建议响应：

```json
{
  "version": "g3",
  "operation": "build_handoff_payload",
  "payload": {
    "route_status": "routed",
    "handoff": {
      "request_id": "opl-2026-04-05-010",
      "workstream_id": "presentation_ops",
      "domain_id": "redcube",
      "request_kind": "create",
      "target_kind": "deliverable",
      "goal": "Produce a defense-ready lecture deck from the supplied research materials.",
      "materials": [
        {
          "kind": "paper",
          "ref": "workspace://refs/paper-01"
        }
      ],
      "constraints": [
        "audience=committee"
      ],
      "preferred_family": "ppt_deck",
      "preferred_profile": "defense_deck",
      "review_expectation": [
        "human_review",
        "publish_gate"
      ]
    }
  }
}
```

### `audit_routing_decision`

目的：

- 在请求进入 domain gateway 之前，把顶层 routing decision 及其 evidence 记录下来

必需字段：

- `request_id`
- `decision_status`
- `request_summary`
- `request_kind`
- `resolved_workstream_id` 或 `candidate_workstreams`
- `resolved_domain_id` 或 `candidate_domains`
- `reason`
- `routing_evidence`
- `timestamp`

建议响应：

```json
{
  "version": "g3",
  "operation": "audit_routing_decision",
  "payload": {
    "request_id": "opl-2026-04-05-010",
    "decision_status": "routed",
    "request_summary": "Create a defense-ready slide deck from the supplied research materials.",
    "request_kind": "create",
    "resolved_workstream_id": "presentation_ops",
    "resolved_domain_id": "redcube",
    "reason": "The requested output is a formal presentation deliverable.",
    "routing_evidence": [
      "presentation_delivery intent",
      "ppt_deck mapping",
      "redcube ownership"
    ],
    "timestamp": "2026-04-05T05:50:00Z"
  }
}
```

## 处理规则

### refusal

当请求本身违反顶层边界时，应返回 refusal，例如：

- 要求 `OPL` 绕过 domain gateway 直接调用 harness
- 要求 `OPL` 在路由未建立前先 mutation domain-private truth
- 顶层 action shape 本身不受支持

建议 refusal 响应：

```json
{
  "version": "g3",
  "operation": "route_request",
  "payload": {
    "status": "refused",
    "request_id": "opl-2026-04-05-011",
    "reason_code": "direct_harness_bypass",
    "reason": "OPL must route into a domain gateway and may not target a domain harness directly."
  }
}
```

### unknown-domain

当顶层语义已经足够清楚到可以命名一个 candidate workstream，但当前没有任何已注册 domain 正式拥有这个 candidate workstream 时，应返回 `unknown_domain`。

建议响应：

```json
{
  "version": "g3",
  "operation": "route_request",
  "payload": {
    "status": "unknown_domain",
    "request_id": "opl-2026-04-05-012",
    "workstream_id": "candidate_ops",
    "reason": "The candidate workstream semantics are recognizable, but no registered domain gateway currently owns this candidate workstream."
  }
}
```

### ambiguous-task

当顶层还无法安全分类该请求时，应返回 `ambiguous_task`。

必需规则：

- 不要凭空发明 workstream
- 不要凭空发明 domain owner
- 不要提前构建 handoff payload

建议响应：

```json
{
  "version": "g3",
  "operation": "route_request",
  "payload": {
    "status": "ambiguous_task",
    "request_id": "opl-2026-04-05-013",
    "candidate_workstreams": [
      "research_ops",
      "presentation_ops"
    ],
    "candidate_domains": [
      "medautoscience",
      "redcube"
    ],
    "reason": "The request mixes research packaging and presentation delivery semantics without enough information to route safely.",
    "required_clarification": [
      "Is the primary goal a formal research deliverable or a presentation deliverable?",
      "If visual delivery is primary, should the family be ppt_deck or another RedCube family?"
    ]
  }
}
```

## 硬边界

`OPL` 绝不能借 `G3` 路由直接跳进 domain harness。

成功顶层路由之后，唯一允许的下一层正式入口是：

```text
OPL Gateway -> Domain Gateway
```

而不是：

```text
OPL Gateway -> Domain Harness OS
```

## Source-Of-Truth 规则

在 `G3`，`OPL` 可以拥有：

- routing decision
- handoff payload
- 顶层 audit trace

在 `G3`，`OPL` 不可以拥有：

- domain-private runtime state
- domain canonical truth
- 把 domain-internal replay history 当成顶层真相

## Machine-Readable Contract

这一层的 machine-readable schema 位于：

- [`../contracts/opl-gateway/routed-actions.schema.json`](../contracts/opl-gateway/routed-actions.schema.json)

显式非成功路由状态的 canonical routed-safety examples 位于：

- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.zh-CN.md)

## 完成定义

只有满足下面条件，`G3` 才算完成：

- `route_request`、`build_handoff_payload`、`audit_routing_decision` 被冻结成稳定操作
- refusal / unknown-domain / ambiguous-task handling 被显式写清
- routed output 不再依赖 prose-only interpretation
- 这份合同仍然禁止绕过 domain gateway

下面这些情况说明 `G3` 还没完成：

- 路由仍然只靠自由 prose 解释
- 顶层 gateway 在未注册 ownership 的情况下自行发明 owner
- 顶层 gateway 绕过 domain gateway 直达 harness
