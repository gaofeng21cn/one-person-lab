**English** | [中文](./opl-operating-record-catalog.zh-CN.md)

# OPL Operating Record Catalog

## Purpose

This document indexes the machine-readable catalog for the frozen `P5.M1` / `P5.M2` top-level operating record kinds.

Its job is to make operating-stage semantics, schema ownership, canonical example refs, and follow-on routing boundaries discoverable from one place without turning the catalog into a runtime manifest or a second source of truth.

## Machine Boundary

No current machine-readable `operating-record-catalog.json` contract is published in this repo. This document is a human-readable derived reference over the operating examples and current framework contracts.

## Non-Goals

This catalog does not:

- implement execution
- replace the governing schemas or prose docs
- restate full field-level schema truth
- own review, publish, promotion, or public-channel truth
- authorize direct publish, release, export, submission, or posting by `OPL`

## Catalog Fields

Each record-kind entry stays reference-level and carries only:

- `record_kind`
- `surface_layer`
- `governing_surface_id`
- `stage_boundary`
- `truth_mode`
- `schema_ref`
- `example_refs`
- `domain_truth_required`
- `follow_on_route_surface`

## Reference Catalog Coverage

### P5.M1 governance / audit kinds

- `routing_audit`
- `governance_decision`
- `publish_readiness_signal`
- `cross_domain_review_index`

### P5.M2 publish / promotion kinds

- `publish_outcome_index`
- `promotion_candidate_signal`
- `promotion_surface_index`

## Reading Rule

Read this catalog as a **derived reference map**, not as a governing execution contract.

The governing schemas and operating-surface docs remain authoritative.
The catalog only points to them and records the stage boundary at which each record kind becomes valid.
If a follow-on action exists, it must point to the current domain-owned capability entry or action-route ref. Historical entries may retain the legacy literal `domain_gateway` for provenance only; this catalog does not define it as an active compatibility route.

## Governing Sources

- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Surface Lifecycle Map](../operating-governance/opl-surface-lifecycle-map.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)

## Completion Definition

The operating-record catalog is acceptable only when:

- it covers all frozen `P5.M1` / `P5.M2` record kinds
- every `schema_ref` and `example_ref` resolves to an existing local artifact
- it stays non-executing and reference-only
- it does not shift truth ownership into `OPL`
- it keeps follow-on route values aligned to current domain-owned capability/action-route refs and treats legacy `domain_gateway` only as provenance
- it remains discoverable from the derived surface lifecycle map without becoming an execution stage
