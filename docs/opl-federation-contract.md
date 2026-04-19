**English** | [中文](./opl-federation-contract.zh-CN.md)

# OPL Federation Contract

## Purpose

This document freezes the `G1` contract for the `OPL Gateway`.

Its purpose is to define the minimum machine-readable contract needed before `OPL` can become a real routed gateway.

This is still a contract-first phase.
It does not imply that the top-level gateway runtime is already implemented.

## G1 Scope

`G1` is complete only when these pieces are frozen:

- a workstream registry
- a domain registry
- a routing vocabulary
- a stable handoff payload between `OPL` and domain gateways

The target is not a full execution stack.
The target is a stable top-level contract that later implementations can consume without re-inventing the control language.

## Canonical Future Registry Files

The intended machine-readable surfaces are:

- `opl/workstreams.json`
- `opl/domains.json`
- `opl/routing-vocabulary.json`
- `opl/handoff.schema.json`

These file paths are the canonical intent of the contract.
They may be materialized later in a docs site, registry package, or gateway repo, but the contract shape should stay stable.

For the current repository-local materialization, see [OPL Gateway Contracts](../contracts/opl-gateway/README.md).

Current repository materialization:

- [`../contracts/opl-gateway/workstreams.json`](../contracts/opl-gateway/workstreams.json)
- [`../contracts/opl-gateway/domains.json`](../contracts/opl-gateway/domains.json)
- [`../contracts/opl-gateway/routing-vocabulary.json`](../contracts/opl-gateway/routing-vocabulary.json)
- [`../contracts/opl-gateway/handoff.schema.json`](../contracts/opl-gateway/handoff.schema.json)

## Workstream Registry

Each workstream entry should define:

- `workstream_id`
- `label`
- `status`
- `description`
- `domain_id`
- `entry_mode`
- `primary_families`
- `top_level_intents`
- `notes`

### Suggested Schema

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

Each domain entry should define:

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

### Suggested Schema

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

The `OPL Gateway` should not route by vague product names alone.
It should route using a shared vocabulary.

### Required Vocabulary Groups

- `intent_id`
- `workstream_id`
- `domain_id`
- `request_kind`
- `target_kind`
- `delivery_kind`
- `review_kind`
- `entry_mode`

### Suggested Vocabulary

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

Once `OPL` routes into a domain, the handoff payload should be explicit and auditable.

### Required Fields

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

### Suggested Payload

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

## Routing Rules

The top-level router should follow these rules:

- route by `workstream semantics` first
- route by `domain ownership` second
- route by `family/profile preference` third
- never bypass a domain gateway and target a domain harness directly

Special rule:

- `xiaohongshu` may route to `RedCube AI`
- but it must not be auto-labeled as `presentation_ops` unless the top-level semantics really match that workstream

## Completion Definition For G1

`G1` is complete when:

- the registry fields are frozen
- the routing vocabulary is frozen
- the handoff payload is frozen
- later implementations can materialize the same contract without redefining these concepts

`G1` is not complete if:

- domain ownership is still ambiguous
- top-level and domain vocabularies still conflict
- the router still depends on prose-only interpretation
