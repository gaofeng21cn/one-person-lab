**English** | [中文](./opl-publish-promotion-operating-surface.zh-CN.md)

# OPL Publish / Promotion Operating Surface

## Purpose

This document freezes the minimum top-level publish / promotion operating surface for `OPL`.

Its goal is to define what `OPL` may legitimately index after domain-owned publish gates and domain-owned release / export / submission outcomes already exist.

The target is not a top-level publish runtime.
The target is a thin top-level operating layer that indexes publish outcomes, promotion candidates, and public-surface references while domain systems continue to own publish truth.

## Relationship To Earlier Gateway Layers

This operating surface is downstream of the already frozen layers:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- the machine-readable contracts in [`../contracts/opl-gateway/README.md`](../contracts/opl-gateway/README.md)

If those layers are not stable, this operating surface should not be treated as frozen.

## Boundary From P5.M1

`publish_readiness_signal` from `P5.M1` stops at this question:

- does the top-level request appear ready to enter a domain-owned publish gate?

This `P5.M2` surface begins only after a domain-owned publish / release / export / submission outcome already exists.

In short:

- `P5.M1` = readiness before domain-owned publish truth
- `P5.M2` = top-level indexing and promotion signaling after domain-owned publish truth

## Core Promise

At this layer, `OPL` may own only **top-level publish-outcome indexes, promotion-candidate signals, and promotion-surface indexes**.

It may not:

- become the owner of domain publish truth
- become the owner of domain release / export / submission truth
- become the owner of domain public-channel posting truth
- execute publish, submit, export, release, or promote directly
- bypass domain gateways to control harness execution directly

In short:

- `OPL` owns **top-level publish / promotion indexes and signals**
- each domain owns **publish truth, release truth, export truth, submission truth, artifact truth, and public-channel posting truth**

## Non-Goals

This operating surface does not:

- execute domain publish or promotion operations
- store canonical publish truth for a domain
- replace a domain's release / export / submission record with a top-level copy
- become the unified public-runtime entry for all publish flows
- turn domain gateways into implementation details

## Allowed Top-Level Record Kinds

The minimum top-level operating surface may record only the following kinds:

### 1. `publish_outcome_index`

Purpose:

- record a top-level index entry for a domain-owned publish / release / export / submission outcome
- expose stable references or public references without claiming outcome truth

This is an index of a domain-owned outcome.
It is not the canonical publish, release, export, or submission record itself.

### 2. `promotion_candidate_signal`

Purpose:

- record whether a domain-owned outcome appears ready to enter a domain-owned or human-owned promotion gate
- expose a top-level promotion-readiness signal without claiming promotion truth

This is a readiness signal only.
It does not mean the item is already promoted, announced, distributed, or posted on a public surface.

### 3. `promotion_surface_index`

Purpose:

- expose which public surfaces matter for one top-level request or one indexed outcome
- show where promotion is blocked or what human approval is still required

This remains an index/reference layer, not a duplicate of public-channel posting truth.

## Source-Of-Truth Rules

### What OPL May Own At This Layer

`OPL` may own:

- top-level publish-outcome indexes
- top-level promotion-candidate signals
- top-level promotion-surface indexes

### What Must Stay In The Domain

The following must remain domain-owned canonical truth:

- publish gate truth
- publish execution truth
- release results
- export results
- submission results
- artifact truth
- public-channel posting truth
- domain-private performance / metrics truth
- revision history for published or promoted artifacts

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

Every top-level publish / promotion record must point back to domain-owned truth.

This prevents `OPL` from being misread as the canonical owner of publish or promotion state.

### `publish_outcome_index` is not publish truth

`publish_outcome_index` may only index a domain-owned `publish`, `release`, `export`, or `submission` outcome.

It must not be used as:

- the canonical publish record
- the canonical release record
- the canonical export record
- the canonical submission record

### Promotion records also require an indexed domain-owned outcome

`promotion_candidate_signal` and `promotion_surface_index` may only exist above a domain-owned publish / release / export / submission outcome.

They must not be used to describe a pre-publish intention.

### `promotion_candidate_signal` is not promotion truth

`promotion_candidate_signal` may only say whether the indexed outcome appears ready to enter a promotion gate.

It must not be used as:

- a public posting event
- an announcement event
- a distribution result
- proof that promotion already happened

### Follow-on actions still route through `domain_gateway`

If any follow-on publish or promotion action is needed, `OPL` must still route through the domain gateway.

This operating surface may index the outcome or the target surface.
It must not submit, export, release, or post directly.

### `public_refs` are references, not top-level ownership

A top-level record may carry public references such as URLs or stable surface refs.

Those references remain an index layer.
They do not transfer ownership of the corresponding publish or promotion truth into `OPL`.

## Example Record Shapes

### Example: `publish_outcome_index`

```json
{
  "version": "p5.m2",
  "record_kind": "publish_outcome_index",
  "record_id": "opl-publish-2026-04-05-001",
  "request_id": "opl-2026-04-05-020",
  "workstream_id": "research_ops",
  "domain_id": "medautoscience",
  "summary": "Indexed the domain-owned manuscript submission outcome at the top level.",
  "status": "recorded",
  "evidence_refs": [
    "publish_gate=complete",
    "submission_package=sealed"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "submission_record",
      "ref": "medautoscience://submissions/study-002"
    }
  ],
  "recorded_at": "2026-04-05T07:10:00Z",
  "publish_outcome_index": {
    "outcome_kind": "submitted",
    "public_refs": []
  }
}
```

### Example: `promotion_candidate_signal`

```json
{
  "version": "p5.m2",
  "record_kind": "promotion_candidate_signal",
  "record_id": "opl-promo-2026-04-05-001",
  "request_id": "opl-2026-04-05-021",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "The released deck appears ready to enter the domain-owned promotion gate.",
  "status": "ready_for_next_gate",
  "evidence_refs": [
    "release_record=complete",
    "human_review=complete"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "release_record",
      "ref": "redcube://releases/deck-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "artifact_record",
      "ref": "redcube://artifacts/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T07:11:00Z",
  "promotion_candidate_signal": {
    "promotion_readiness": "ready_for_promotion_gate",
    "target_surfaces": [
      "project_landing",
      "announcement_post"
    ]
  }
}
```

### Example: `promotion_surface_index`

```json
{
  "version": "p5.m2",
  "record_kind": "promotion_surface_index",
  "record_id": "opl-surface-2026-04-05-001",
  "request_id": "opl-2026-04-05-021",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "Indexed the public surfaces and blockers for promoting the released deck.",
  "status": "needs_human_review",
  "evidence_refs": [
    "landing_page=ready",
    "announcement_copy=pending"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "release_record",
      "ref": "redcube://releases/deck-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "public_channel_record",
      "ref": "redcube://channels/project-landing/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T07:12:00Z",
  "promotion_surface_index": {
    "target_surfaces": [
      "project_landing",
      "announcement_post"
    ],
    "required_human_approval": true,
    "blocking_surface": "announcement_post",
    "public_refs": [
      {
        "surface_id": "project_landing",
        "ref": "https://example.org/decks/deck-002"
      }
    ]
  }
}
```

## Surface Shapes

The first top-level publish / promotion surface may appear as:

- docs-side operating references
- CLI-side operating queries
- MCP-side operating records

As with earlier layers, the contract matters more than the transport.

## Hard Prohibitions

Do not describe or implement this layer as:

- `OPL owns publish truth`
- `OPL owns promotion truth`
- `OPL executes publish or promotion`
- `OPL is the unified publish runtime entry`
- `OPL manages all public posting directly`
- domain gateways being reduced to implementation details

Do not add operations that:

- submit to a venue directly
- export or release directly
- post to a public channel directly
- mutate domain publish state directly
- mutate domain artifact truth directly
- call a harness executor directly

## Completion Definition

This operating surface is acceptably frozen only when:

- the allowed top-level record kinds are explicit
- the domain-owned truth boundary is explicit
- the machine-readable schema matches the public wording
- no top-level field can be mistaken for canonical publish or promotion truth ownership
- no-bypass semantics remain intact
