**English** | [中文](./opl-routed-action-gateway.zh-CN.md)

# OPL Routed Action Gateway

## Purpose

This document freezes the `G3` contract for the `OPL Gateway`.

`G3` is the first phase where `OPL` may accept a top-level action request and route it into the correct domain gateway.

The goal is not to create a monolithic runtime.
The goal is to make top-level routing explicit, auditable, and safe.

## Relationship To G1 And G2

`G3` builds on:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

If `G1` is not frozen, or if `G2` discovery semantics are still ambiguous, `G3` should not proceed.

## Core Promise

At `G3`, an agent should be able to:

- submit a top-level request to `OPL`
- receive an explicit routing decision
- build a stable handoff payload for the target domain gateway
- record an auditable routing trace

It must still **not**:

- bypass a domain gateway
- target a domain harness directly
- move canonical truth ownership into `OPL`

## Required Operations

The minimum routed-action gateway must expose these operations:

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
  "decision": {
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

Suggested response:

```json
{
  "version": "g3",
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
  "audit_record": {
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
  "decision": {
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
  "decision": {
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
  "decision": {
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

`OPL` must never use `G3` routing to jump directly into a domain harness.

The only allowed next formal entry surface after a successful top-level route is:

```text
OPL Gateway -> Domain Gateway
```

Not:

```text
OPL Gateway -> Domain Harness OS
```

## Source-Of-Truth Rules

At `G3`, `OPL` may own:

- the routing decision
- the handoff payload
- the top-level audit trace

At `G3`, `OPL` may not own:

- domain-private runtime state
- domain canonical truth
- domain-internal replay history as if it were top-level truth

## Machine-Readable Contract

The machine-readable schema for this layer lives at:

- [`../contracts/opl-gateway/routed-actions.schema.json`](../contracts/opl-gateway/routed-actions.schema.json)

Canonical routed-safety examples for the non-success states live at:

- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## Completion Definition

`G3` is complete when:

- `route_request`, `build_handoff_payload`, and `audit_routing_decision` are frozen as stable operations
- refusal, unknown-domain, and ambiguous-task handling are explicit
- routed outputs can be expressed without prose-only interpretation
- the contract still forbids bypassing domain gateways

`G3` is not complete when:

- routing still depends on free-form prose alone
- the top-level gateway invents ownership where none is registered
- the top-level gateway bypasses a domain gateway to hit a harness directly
