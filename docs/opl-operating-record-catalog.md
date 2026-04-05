**English** | [中文](./opl-operating-record-catalog.zh-CN.md)

# OPL Operating Record Catalog

## Purpose

This document indexes the machine-readable catalog for the frozen `P5.M1` / `P5.M2` top-level operating record kinds.

Its job is to make operating-stage semantics, schema ownership, canonical example refs, and follow-on routing boundaries discoverable from one place without turning the catalog into a runtime manifest or a second source of truth.

## Machine-Readable Artifact

- [`../contracts/opl-gateway/operating-record-catalog.json`](../contracts/opl-gateway/operating-record-catalog.json)

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

## Current Catalog Coverage

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
If a follow-on action exists, it still routes through `domain_gateway` only.

## Governing Sources

- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)

## Completion Definition

The operating-record catalog is acceptable only when:

- it covers all frozen `P5.M1` / `P5.M2` record kinds
- every `schema_ref` and `example_ref` resolves to an existing local artifact
- it stays non-executing and reference-only
- it does not shift truth ownership into `OPL`
- it keeps `domain_gateway` as the only follow-on route surface
- it remains discoverable from the derived surface lifecycle map without becoming an execution stage
