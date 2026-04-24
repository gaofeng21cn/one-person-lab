**English** | [中文](./opl-routed-action-gateway.zh-CN.md)

# OPL Routed Action Gateway

> Historical note (`2026-04-24`): this document is retained as the planning-only routed-action freeze from the gateway-first phase. Current `OPL` does not use this file as its default runtime/activation contract.

## Purpose

This document freezes the planning-only routed-action contract for the `OPL Gateway`.

It defines how `OPL` classifies a top-level action request, builds a handoff payload, and records the routing trace before control reaches an admitted domain gateway.
The current layer is planning-only. It does not grant runtime launch, mutation entry, or workspace write.
The machine-readable examples in this document keep the current `g3` schema version.

The goal is to make top-level routing explicit, auditable, and safe.

## Current Dependency Baseline

This contract builds on:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

These gateway-discovery surfaces provide the frozen dependency baseline for routed-action planning.

## Core Promise

At this planning-level contract, an agent should be able to:

- submit a top-level request to `OPL`
- receive an explicit routing decision
- build a stable handoff payload for the target `domain_gateway`
- record an auditable routing trace

It must still **not**:

- bypass a domain gateway
- target a domain harness directly
- move canonical truth ownership into `OPL`

The only allowed successful handoff target is `domain_gateway`. This no-bypass rule is hard, not advisory.

## Required Operations

The minimum routed-action planning-level contract must expose these operations:

- `route_request`
- `build_handoff_payload`
- `audit_routing_decision`

## Operation Definitions

### `route_request`

Purpose:

- classify a top-level action request into workstream semantics and determine the next formal entry surface

Required inputs:

- `request_id`
- `request_kind`
- `intent`
- `target`
- `goal`
- optional `materials`
- optional `constraints`
- optional `preferred_family`
- optional `preferred_profile`

Routing order:

1. route by `workstream semantics` first
2. route by `domain ownership` second
3. route by `family / profile preference` third

Suggested routed response:

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

Special rule:

- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may still route to `redcube`
- but `xiaohongshu` must not be auto-labeled as `presentation_ops` unless the top-level semantics truly match presentation material

### `build_handoff_payload`

Purpose:

- build the stable payload passed from `OPL` into the selected domain gateway

Required rule:

- this operation may run only after `route_request` returns `status = routed`
- the output must conform to [`../contracts/opl-gateway/handoff.schema.json`](../contracts/opl-gateway/handoff.schema.json)
- the only allowed successful target is `domain_gateway`; this operation is planning-only and may not launch a domain runtime

Suggested response:

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

Purpose:

- record the top-level routing decision and its evidence before the request enters a domain gateway

Required fields:

- `request_id`
- `decision_status`
- `request_summary`
- `request_kind`
- `resolved_workstream_id` or `candidate_workstreams`
- `resolved_domain_id` or `candidate_domains`
- `reason`
- `routing_evidence`
- `timestamp`

Suggested response:

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

## Handling Rules

### Refusal

Use refusal when the request itself violates the top-level boundary, for example:

- asking `OPL` to bypass the domain gateway and call a harness directly
- asking `OPL` to mutate domain-private truth before the route is established
- asking for an unsupported top-level action shape

Suggested refusal response:

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

### Unknown domain

Use `unknown_domain` when top-level semantics are sufficiently clear for a candidate workstream, but no registered domain currently owns that candidate workstream.

Suggested response:

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

### Ambiguous task

Use `ambiguous_task` when the request cannot yet be safely classified at the top level.

Required rule:

- do not invent a workstream
- do not invent a domain owner
- do not build a handoff payload

Suggested response:

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

## Hard Boundary

This layer routes only into a domain gateway.

The allowed next formal entry surface after a successful top-level route is:

```text
OPL Gateway -> Domain Gateway
```

The direct harness path stays outside this contract:

```text
OPL Gateway -> Domain Harness OS
```

## Source-Of-Truth Rules

At this planning layer, `OPL` owns:

- the routing decision
- the handoff payload
- the top-level audit trace

At this planning layer, domain gateways keep:

- domain-private runtime state
- domain canonical truth
- domain-internal replay history

## Machine-Readable Contract

The machine-readable schema for this layer lives at:

- [`../contracts/opl-gateway/routed-actions.schema.json`](../contracts/opl-gateway/routed-actions.schema.json)

At the current baseline, that schema stays in the planning dependency layer.

Canonical routed-safety examples for the non-success states live at:

- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.md)

## Planning Contract Completion Definition

This planning-only routed-action contract is complete when:

- `route_request`, `build_handoff_payload`, and `audit_routing_decision` are frozen as stable planning-level operations
- refusal, unknown-domain, and ambiguous-task handling are explicit
- routed outputs can be expressed without prose-only interpretation
- the only allowed successful handoff target remains `domain_gateway`
- the no-bypass rule still forbids bypassing domain gateways
- the schema remains a planning dependency rather than a launcher

This planning-only routed-action contract needs more work when:

- routing still depends on free-form prose alone
- the top-level gateway invents ownership where none is registered
- the top-level gateway bypasses a domain gateway to hit a harness directly
