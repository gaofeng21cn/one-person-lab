[English](./opl-federation-contract.md) | **中文**

# OPL Federation Contract

> 历史说明（`2026-04-24`）：这份文档保留的是 gateway-first 阶段的旧冻结件。当前 `OPL` 主线已经收口为 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`。不要把这份文件当成默认实现依据；当前真相请回到 [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[关键决策](./decisions.md) 与 [合同目录说明](../contracts/README.md)。

## 目的

这份文档冻结 `OPL Gateway` 的 `G1` 契约。

它的目标是在 `OPL` 变成真实 routed gateway 之前，先把最小机器可读合同定义清楚。

这仍然是 contract-first 阶段。
它不意味着顶层 gateway runtime 已经实现完成。

## G1 范围

只有下面四部分都冻结，`G1` 才算完成：

- workstream registry
- domain registry
- routing vocabulary
- `OPL` 到各 domain gateway 的稳定 handoff payload

目标不是完整执行栈。
目标是先把顶层控制语言冻结下来，让后续实现不需要再重造一轮概念。

## 未来的 Canonical Registry 文件

理想的机器可读表面是：

- `opl/workstreams.json`
- `opl/domains.json`
- `opl/routing-vocabulary.json`
- `opl/handoff.schema.json`

这些路径表达的是契约意图。
后面它们可以落在 docs site、registry package 或 gateway repo 中，但契约形状应尽量保持稳定。

当前仓库内的 materialization 见 [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)。

当前仓库中的落地位置：

- [`../contracts/opl-gateway/workstreams.json`](../contracts/opl-gateway/workstreams.json)
- [`../contracts/opl-gateway/domains.json`](../contracts/opl-gateway/domains.json)
- [`../contracts/opl-gateway/routing-vocabulary.json`](../contracts/opl-gateway/routing-vocabulary.json)
- [`../contracts/opl-gateway/handoff.schema.json`](../contracts/opl-gateway/handoff.schema.json)

## Workstream Registry

每个 workstream entry 应定义：

- `workstream_id`
- `label`
- `status`
- `description`
- `domain_id`
- `entry_mode`
- `primary_families`
- `top_level_intents`
- `notes`

### 建议结构

```json
{
  "version": "g1",
  "workstreams": [
    {
      "workstream_id": "research_ops",
      "label": "Research Foundry",
      "status": "active",
      "description": "Formal research work from data governance to manuscript and submission delivery.",
      "domain_id": "medautoscience",
      "entry_mode": "domain_gateway",
      "primary_families": [],
      "top_level_intents": [
        "research_progression",
        "submission_delivery",
        "data_asset_governance"
      ],
      "notes": "Maps directly to MedAutoScience."
    },
    {
      "workstream_id": "presentation_ops",
      "label": "Presentation Foundry",
      "status": "emerging",
      "description": "Formal lecture, report, and defense material delivery.",
      "domain_id": "redcube",
      "entry_mode": "domain_gateway",
      "primary_families": [
        "ppt_deck"
      ],
      "top_level_intents": [
        "presentation_delivery",
        "lecture_materials",
        "defense_materials"
      ],
      "notes": "ppt_deck maps directly; xiaohongshu does not automatically equal Presentation Foundry."
    }
  ]
}
```

## Domain Registry

每个 domain entry 应定义：

- `domain_id`
- `label`
- `project`
- `role`
- `gateway_surface`
- `harness_surface`
- `standalone_allowed`
- `owned_workstreams`
- `non_opl_families`
- `canonical_truth_owner`

### 建议结构

```json
{
  "version": "g1",
  "domains": [
    {
      "domain_id": "medautoscience",
      "label": "MedAutoScience",
      "project": "med-autoscience",
      "role": "research_ops_gateway",
      "gateway_surface": "Research Foundry Gateway",
      "harness_surface": "Medical Research Domain Harness OS",
      "standalone_allowed": true,
      "owned_workstreams": [
        "research_ops"
      ],
      "non_opl_families": [],
      "canonical_truth_owner": [
        "research_runs",
        "study_deliveries",
        "data_asset_mutations"
      ]
    },
    {
      "domain_id": "redcube",
      "label": "RedCube AI",
      "project": "redcube-ai",
      "role": "visual_deliverable_gateway",
      "gateway_surface": "Visual Deliverable Gateway",
      "harness_surface": "Visual Deliverable Domain Harness OS",
      "standalone_allowed": true,
      "owned_workstreams": [
        "presentation_ops"
      ],
      "non_opl_families": [
        "xiaohongshu"
      ],
      "canonical_truth_owner": [
        "deliverable_runs",
        "review_state",
        "artifact_truth"
      ]
    }
  ]
}
```

## Routing Vocabulary

`OPL Gateway` 不应该只靠模糊产品名路由。
它应该使用共享 vocabulary。

### 必需词汇组

- `intent_id`
- `workstream_id`
- `domain_id`
- `request_kind`
- `target_kind`
- `delivery_kind`
- `review_kind`
- `entry_mode`

### 建议词汇

```json
{
  "version": "g1",
  "request_kind": [
    "discover",
    "plan",
    "create",
    "review",
    "rerun",
    "publish"
  ],
  "target_kind": [
    "workspace",
    "study",
    "deliverable",
    "topic",
    "publication"
  ],
  "delivery_kind": [
    "research_delivery",
    "presentation_delivery",
    "social_visual_delivery"
  ],
  "review_kind": [
    "human_review",
    "baseline_review",
    "publish_gate",
    "quality_regression"
  ],
  "entry_mode": [
    "docs_only",
    "read_only_gateway",
    "routed_action_gateway",
    "domain_gateway"
  ]
}
```

## Handoff Payload

当 `OPL` 开始把请求路由到某个 domain 时，handoff payload 必须显式且可审计。

### 必需字段

- `request_id`
- `workstream_id`
- `domain_id`
- `request_kind`
- `target_kind`
- `goal`
- `materials`
- `constraints`
- `preferred_family`
- `preferred_profile`
- `review_expectation`

### 建议 payload

```json
{
  "request_id": "opl-2026-04-05-001",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "request_kind": "create",
  "target_kind": "deliverable",
  "goal": "Produce a defense-ready lecture deck from the supplied research materials.",
  "materials": [
    {
      "kind": "paper",
      "ref": "workspace://refs/paper-01"
    },
    {
      "kind": "brief",
      "ref": "workspace://briefs/defense-brief"
    }
  ],
  "constraints": [
    "audience=committee",
    "max_length=20_slides"
  ],
  "preferred_family": "ppt_deck",
  "preferred_profile": "defense_deck",
  "review_expectation": [
    "human_review",
    "publish_gate"
  ]
}
```

## Routing 规则

顶层 router 应遵守：

- 先按 `workstream semantics` 路由
- 再按 `domain ownership` 路由
- 最后按 `family / profile preference` 路由
- 永远不要绕过 domain gateway 直达 domain harness

特殊规则：

- `xiaohongshu` 可以路由到 `RedCube AI`
- 但除非顶层语义真的匹配，否则不能自动标成 `presentation_ops`

## G1 完成定义

只有满足下面条件，`G1` 才算完成：

- registry 字段被冻结
- routing vocabulary 被冻结
- handoff payload 被冻结
- 后续实现可以直接消费这些契约，而不必重定义概念

下面这些情况说明 `G1` 还没完成：

- domain ownership 仍不清楚
- 顶层词汇和 domain 词汇仍冲突
- router 仍然依赖 prose-only 解读
