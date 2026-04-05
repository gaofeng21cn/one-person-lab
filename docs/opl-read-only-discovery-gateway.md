**English** | [中文](./opl-read-only-discovery-gateway.zh-CN.md)

# OPL Read-Only Discovery Gateway

## Purpose

This document freezes the `G2` target for the `OPL Gateway`.

`G2` is the first phase where `OPL` becomes a real entry surface, but only in a read-only discovery sense.

The goal is not to mutate domain state.
The goal is to let humans and agents ask the top-level gateway what system they should use, what a workstream means, and how a request maps into a domain.

## Relationship To G1

`G2` consumes the `G1` contract.

That means this discovery gateway is defined on top of:

- [OPL Federation Contract](./opl-federation-contract.md)
- the [workstream registry](../contracts/opl-gateway/workstreams.json)
- the [domain registry](../contracts/opl-gateway/domains.json)
- the [routing vocabulary](../contracts/opl-gateway/routing-vocabulary.json)
- the materialized machine-readable artifacts in [`../contracts/opl-gateway/README.md`](../contracts/opl-gateway/README.md)

If `G1` is not frozen, `G2` should not proceed.

## Core Promise

At `G2`, an agent should be able to ask:

- what workstreams exist?
- what domain system owns this workstream?
- which families map directly to that workstream?
- does this task belong to `MedAutoScience`, `RedCube AI`, or neither?
- what is the correct next entry surface?

And receive a stable, machine-readable answer without touching domain internals.

## Non-Goals

`G2` does not:

- create deliverables
- mutate workspaces
- start runs
- bypass domain gateways
- own canonical runtime truth

It is discovery-only.

## Required Read-Only Operations

The minimum discovery gateway should expose these operations:

- `list_workstreams`
- `get_workstream`
- `list_domains`
- `get_domain`
- `resolve_request_surface`
- `explain_domain_boundary`

## Operation Definitions

### `list_workstreams`

Purpose:

- return all registered workstreams with their top-level owner and status

Suggested response:

```json
{
  "version": "g2",
  "workstreams": [
    {
      "workstream_id": "research_ops",
      "label": "Research Ops",
      "status": "active",
      "domain_id": "medautoscience"
    },
    {
      "workstream_id": "presentation_ops",
      "label": "Presentation Ops",
      "status": "emerging",
      "domain_id": "redcube"
    }
  ]
}
```

### `get_workstream`

Purpose:

- return the full registered meaning of one workstream

Suggested response:

```json
{
  "version": "g2",
  "workstream": {
    "workstream_id": "presentation_ops",
    "label": "Presentation Ops",
    "status": "emerging",
    "domain_id": "redcube",
    "primary_families": [
      "ppt_deck"
    ],
    "top_level_intents": [
      "presentation_delivery",
      "lecture_materials",
      "defense_materials"
    ],
    "notes": "ppt_deck maps directly; xiaohongshu does not automatically equal Presentation Ops."
  }
}
```

### `list_domains`

Purpose:

- return all registered domain gateways and their owned workstreams

Suggested response:

```json
{
  "version": "g2",
  "domains": [
    {
      "domain_id": "medautoscience",
      "gateway_surface": "Research Ops Gateway",
      "owned_workstreams": [
        "research_ops"
      ]
    },
    {
      "domain_id": "redcube",
      "gateway_surface": "Visual Deliverable Gateway",
      "owned_workstreams": [
        "presentation_ops"
      ]
    }
  ]
}
```

### `get_domain`

Purpose:

- return the formal meaning of one domain gateway

Suggested response:

```json
{
  "version": "g2",
  "domain": {
    "domain_id": "redcube",
    "project": "redcube-ai",
    "gateway_surface": "Visual Deliverable Gateway",
    "harness_surface": "Visual Deliverable Harness OS",
    "standalone_allowed": true,
    "owned_workstreams": [
      "presentation_ops"
    ],
    "non_opl_families": [
      "xiaohongshu"
    ]
  }
}
```

### `resolve_request_surface`

Purpose:

- classify a top-level request into the most likely workstream and domain surface

Required inputs:

- `intent`
- `target`
- `goal`
- optional `preferred_family`

Suggested response:

```json
{
  "version": "g2",
  "resolution": {
    "request_kind": "discover",
    "workstream_id": "presentation_ops",
    "domain_id": "redcube",
    "entry_surface": "domain_gateway",
    "recommended_family": "ppt_deck",
    "confidence": "high",
    "reason": "The goal is a defense-oriented presentation deliverable."
  }
}
```

Special rule:

- if the request is for `xiaohongshu`, the domain may still resolve to `redcube`
- but the workstream must not auto-resolve to `presentation_ops` unless the top-level semantics truly match presentation material

### `explain_domain_boundary`

Purpose:

- explain why a task belongs to one domain and not another

Suggested response:

```json
{
  "version": "g2",
  "boundary_explanation": {
    "request_summary": "Prepare a defense-ready slide deck for a thesis committee.",
    "resolved_domain": "redcube",
    "rejected_domains": [
      {
        "domain_id": "medautoscience",
        "reason": "Research evidence may feed the task, but the requested output is a visual deliverable."
      }
    ]
  }
}
```

## Source-Of-Truth Rules

At `G2`, the gateway reads from:

- the `G1` federation contract
- the top-level workstream and domain registries

It does not read domain-private runtime state as if that were top-level truth.

It may link to domain surfaces.
It may not mutate domain truth.

## Surface Shapes

The first `G2` surface may appear as:

- docs-site navigation
- CLI discovery commands
- MCP discovery tools

All three are acceptable if they keep the same contract.

The contract matters more than the transport.

## Completion Definition

`G2` is complete when:

- discovery requests can be answered through machine-readable outputs
- the top-level gateway can resolve domain ownership without prose-only reasoning
- no mutation path is required for the discovery workflow
- domain gateways remain the next formal entry surface after discovery

`G2` is not complete when:

- the gateway still answers only with free-form prose
- domain ownership is still ambiguous
- the gateway starts mutating domain state
