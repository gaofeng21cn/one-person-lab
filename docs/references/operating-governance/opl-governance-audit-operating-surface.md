**English** | [中文](./opl-governance-audit-operating-surface.zh-CN.md)

# OPL Governance / Audit Operating Surface

State: `support_reference_legacy_derived`
Current owner: `docs/references/operating-governance/README.md`
Machine boundary: human-readable support only; machine-readable behavior must use contracts, schemas, source, CLI/API behavior, generated artifacts, or semantic `human_doc:*` ids.

## Purpose

This document freezes the minimum top-level governance / audit operating surface for `OPL`.

Its goal is to define what `OPL` may legitimately index after routing, onboarding, and acceptance evidence exists.

The target is not a monolithic runtime.
The target is a thin top-level operating layer that records governance signals, routing audit traces, and readiness indexes while domain systems continue to own runtime truth.
Legacy `gateway` wording in this document is provenance-only vocabulary from the archived surface IDs and example corpus. It is not an active compatibility interface. Current topology is stage-led with Agent executors as the minimum execution unit.

## Relationship To Earlier Gateway Layers

This operating surface was originally downstream of these now-archived historical layers:

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Gateway Contract Surface](../../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../../active/opl-domain-onboarding-contract.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- the machine-readable contracts in [`../../contracts/opl-framework/README.md`](../../../contracts/opl-framework/README.md)

Those layers are provenance inputs only. Current topology and owner boundaries remain governed by the core five, current contracts, source, CLI/API behavior, runtime ledgers, domain-owned manifests, and the stage-led framework roadmap.

## Core Promise

At this layer, `OPL` may own only **top-level governance records, routing audit traces, and readiness indexes**.

It may not:

- become the owner of domain runtime audit truth
- become the owner of domain review truth
- become the owner of artifact or publish truth
- bypass domain-owned capability entries to control harness execution directly

In short:

- `OPL` owns **top-level governance signal, routing audit, and readiness index**
- each domain owns **runtime audit truth, review truth, publish truth, and artifact truth**

## Non-Goals

This operating surface does not:

- execute domain review or publish operations
- store canonical audit truth for a domain
- replace domain review state with a top-level copy
- become the unified runtime entry for all execution
- turn domain-owned capability entries into implementation details

## Allowed Top-Level Record Kinds

The minimum top-level operating surface may record only the following kinds:

### 1. `routing_audit`

Purpose:

- record how `OPL` routed a request into a domain-owned capability entry
- preserve routing evidence and outcome at the top level

This is a top-level trace of the routing step, not the domain runtime audit record.

### 2. `governance_decision`

Purpose:

- record a top-level governance decision such as:
  - `continue`
  - `stop`
  - `reframe`
  - `gate`

This is the legitimate top-level governance language already implied by the shared foundation.
It records the governance outcome; it does not move continue/stop/reframe authority away from humans or domain-owned review signals.

### 3. `publish_readiness_signal`

Purpose:

- record whether a request appears ready to enter a domain-owned publish gate
- expose a top-level readiness signal without claiming domain publish truth

This is a readiness index only.
It does not mean the work is already published, exported, submitted, or canonically approved inside the domain.

### 4. `cross_domain_review_index`

Purpose:

- expose which review surfaces and gates matter across domains for one top-level request
- show where a request is blocked or what human review is still required

This remains an index/reference layer, not a duplicate of domain review truth.

## Source-Of-Truth Rules

### What OPL May Own At This Layer

`OPL` may own:

- top-level routing audit trace
- top-level governance decision records
- top-level publish-readiness signals
- cross-domain review / gate indexes

### What Must Stay In The Domain

The following must remain domain-owned canonical truth:

- runtime audit truth
- run logs
- event logs
- rerun history
- domain review state
- artifact truth
- publish execution truth
- release / export / submission results
- domain-private quality-regression truth

`OPL` may reference these through stable pointers.
It may not silently absorb them into top-level truth.

## Minimal Operating Record Shape

The minimum machine-readable envelope should carry:

- `version`
- `record_kind`
- `record_id`
- `request_id`
- `workstream_id`
- `domain_id`
- `summary`
- `status`
- `evidence_refs`
- `domain_truth_refs`
- `recorded_at`

The record kind may add kind-specific fields, but the envelope should stay top-level and coordination-focused.

## Required Boundary Semantics

### `domain_truth_refs` is mandatory

Every top-level governance / audit record must point back to domain-owned truth when such truth exists.

This prevents `OPL` from being misread as the canonical owner of runtime or publish state.

### Legacy `domain_gateway` is provenance-only

Archived examples may still contain the legacy literal `domain_gateway` for reviewability. Current prose and new machine-readable surfaces must use current domain-owned capability entry semantics instead of retaining that literal as a compatibility interface.

### Publish readiness is not publish truth

`publish_readiness_signal` must only say whether the top-level request appears ready to enter a domain-owned publish gate.

It must not be used as:

- a publication event
- a submission result
- a release result
- an export result
- domain approval truth

## Example Record Shapes

Canonical machine-readable operating examples for the frozen governance / audit records also live in the [OPL Operating Example Corpus](../examples-corpora/opl-operating-example-corpus.md) and its linked JSON files.
The cross-layer reference map for all frozen operating record kinds also lives in the [OPL Operating Record Catalog](../examples-corpora/opl-operating-record-catalog.md).
The inline shapes below remain the prose-side illustrations for this governing surface.

### Example: `routing_audit`

```json
{
  "version": "p5.m1",
  "record_kind": "routing_audit",
  "record_id": "opl-audit-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "Routed a defense-deck request into the RedCube domain-owned capability entry.",
  "status": "recorded",
  "evidence_refs": [
    "intent=presentation_delivery",
    "family=ppt_deck"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "routing_handoff",
      "ref": "redcube://handoffs/opl-2026-04-05-010"
    }
  ],
  "recorded_at": "2026-04-05T06:20:00Z",
  "routing_audit": {
    "routing_status": "routed",
    "entry_surface": "legacy_domain_gateway_identifier",
    "routing_decision_ref": "opl://routed-actions/opl-2026-04-05-010",
    "handoff_ref": "opl://handoffs/opl-2026-04-05-010"
  }
}
```

### Example: `governance_decision`

```json
{
  "version": "p5.m1",
  "record_kind": "governance_decision",
  "record_id": "opl-gov-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "research_ops",
  "domain_id": "medautoscience",
  "summary": "Top-level decision is to reframe before further domain execution.",
  "status": "needs_human_review",
  "evidence_refs": [
    "human_review=pending",
    "governance_signal=reframe"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "review_record",
      "ref": "medautoscience://reviews/study-001"
    }
  ],
  "recorded_at": "2026-04-05T06:21:00Z",
  "governance_decision": {
    "decision": "reframe",
    "decision_source": "human"
  }
}
```

### Example: `publish_readiness_signal`

```json
{
  "version": "p5.m1",
  "record_kind": "publish_readiness_signal",
  "record_id": "opl-publish-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "The request appears ready to enter the domain-owned publish gate.",
  "status": "ready_for_next_gate",
  "evidence_refs": [
    "human_review=complete",
    "baseline_review=complete"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "publish_gate_record",
      "ref": "redcube://publish-gates/deck-001"
    }
  ],
  "recorded_at": "2026-04-05T06:22:00Z",
  "publish_readiness_signal": {
    "readiness": "ready_for_domain_publish_gate"
  }
}
```

### Example: `cross_domain_review_index`

```json
{
  "version": "p5.m1",
  "record_kind": "cross_domain_review_index",
  "record_id": "opl-review-2026-04-05-001",
  "request_id": "opl-2026-04-05-011",
  "workstream_id": null,
  "domain_id": null,
  "summary": "The request spans research and presentation gates and still requires final human review.",
  "status": "needs_human_review",
  "evidence_refs": [
    "research_review=complete",
    "presentation_baseline=complete",
    "final_human_review=pending"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "review_record",
      "ref": "medautoscience://reviews/study-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "publish_gate_record",
      "ref": "redcube://publish-gates/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T06:23:00Z",
  "cross_domain_review_index": {
    "required_human_review": true,
    "blocking_gate": "final_human_review",
    "review_surface_refs": [
      "medautoscience://reviews/study-002",
      "redcube://publish-gates/deck-002"
    ]
  }
}
```

## Surface Shapes

The first top-level governance / audit surface may appear as:

- docs-side operating references
- CLI-side operating queries
- MCP-side operating records

As with earlier layers, the contract matters more than the transport.

## Hard Prohibitions

Do not describe or implement this layer as:

- `OPL stores canonical audit truth`
- `OPL owns publish state`
- `OPL executes domain review or publish`
- `OPL is the unified runtime entry`
- `OPL manages all runs directly`
- domain-owned capability entries being reduced to implementation details

Do not add operations that:

- start or stop a domain run directly
- write domain review state directly
- approve publish / export / submission directly
- call a harness executor directly
- mutate domain artifact truth directly

## Completion Definition

This operating surface is acceptably frozen only when:

- the allowed top-level record kinds are explicit
- the domain-owned truth boundary is explicit
- the machine-readable schema matches the public wording
- no top-level field can be mistaken for domain runtime truth ownership
- no-bypass semantics remain intact
