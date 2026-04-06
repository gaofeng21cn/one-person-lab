**English** | [中文](./shared-foundation-ownership.zh-CN.md)

# Shared Foundation Ownership

## Purpose

This document clarifies who manages the `Shared Foundation` in `OPL`.

The goal is to remove one recurring ambiguity:

- `OPL` does define the shared foundation language
- but `OPL` does not automatically become the single runtime truth store for every shared object

This is an ownership-and-boundary document.
It is not a new execution surface, and it is not a new domain-admission contract.

## Core Judgment

The correct split is:

- `OPL` owns the top-level semantic, indexing, identity, and cross-domain reuse rules for shared-foundation objects
- each `domain gateway` and `domain harness` owns the canonical truth, mutation, audit writeback, and delivery truth for domain-local objects
- humans or private workspaces may still own source materials that have not yet been formalized into domain truth

So “shared foundation is centrally managed” should be read as:

- centrally governed at the top-level language layer

Not as:

- centrally mutated
- centrally versioned as the only truth
- centrally replacing domain-owned stores

## Ownership Layers

### `OPL` owns

At the top level, `OPL` may own:

- shared object classes and naming rules
- top-level identifiers and reference shapes
- shared asset and memory categories
- cross-domain reuse expectations
- index/catalog surfaces that help humans and Agents discover reusable objects
- handoff expectations for what may be passed into a domain

### `Domain gateway + harness` owns

Each domain remains responsible for:

- canonical object truth inside the workstream
- domain-local mutation and version history
- runtime writeback and audit traces
- domain-specific review truth
- domain-specific delivery truth

### `Human / private workspace` may own

Not every useful shared object should immediately become domain truth.
Humans or private workspaces may still own:

- private notes
- source files not yet admitted into a formal workstream
- private reference collections
- draft materials still below formal domain governance

## Asset Ownership Split

| Object class | `OPL` owns | Domain owns | Human/private may own | Must not move into `OPL` by default |
| --- | --- | --- | --- | --- |
| `data assets` | top-level identity, category, reference shape, cross-domain reuse rules | canonical datasets, derived study assets, mutation history, audit truth | raw exports, staging files, pre-admission materials | canonical runtime data truth |
| `references` | shared reference categories, reusable top-level reference index, cross-domain citation semantics | study-local usage, domain-local annotation, evidence packaging context | private reading lists, notes, preliminary collections | domain-specific evidence truth |
| `templates` | shared template classes, top-level template identity, reusable cross-domain template index | domain-specific instantiation and workflow-local adaptation | draft templates before formal adoption | template execution ownership inside a domain |
| `delivery assets` | top-level discoverability, cross-domain relation hints, delivery-kind semantics | formal deliverable truth, exports, submission/publish artifacts, reviewable outputs | draft files before formal delivery admission | final delivery truth or release ownership |

## Memory Ownership Split

| Memory class | `OPL` owns | Domain owns | Human/private may own | Must not move into `OPL` by default |
| --- | --- | --- | --- | --- |
| `topic memory` | reusable top-level topic identity, cross-workstream topic index, stable topic vocabulary | domain-local evidence chains tied to studies, runs, or deliverables | exploratory notes and early framing | domain-local evidence truth |
| `review memory` | cross-domain summary/index language only when needed for discoverability | full review history, review state, review decisions, domain-specific review writeback | private reviewer notes, temporary comments | canonical review truth |
| `venue memory` | strongest candidate for top-level shared indexing and reusable semantics | domain-local venue fit decisions tied to concrete work products | personal preference notes not yet formalized | domain-specific submission truth |

## Integration With Domain Gateways

The intended flow is:

1. A human or Agent starts from `OPL` with a top-level request.
2. `OPL` identifies which shared-foundation objects are relevant at the semantic/index layer.
3. `OPL` routes the request into the correct `domain gateway` with references, not with top-level truth replacement.
4. The target domain resolves the concrete objects it actually owns.
5. The domain writes back its own runtime truth, review truth, and delivery truth to domain-owned surfaces.
6. `OPL` may retain top-level references, summaries, or auditable routing signals, but not the domain's canonical object truth.

For example:

- `OPL` may know that a research manuscript, a figure bundle, and a venue-preference memory are relevant to a presentation request
- but `RedCube AI` still owns the visual-deliverable truth once the task enters `Presentation Ops`
- and `MedAutoScience` still owns the research asset truth that produced the upstream manuscript or figure bundle

## Relationship To Future Shared Indexes

The rollout already allows future:

- shared asset index
- shared memory index

If these surfaces are added later, the default interpretation should remain:

- index-first
- reference-only unless explicitly upgraded by a later contract
- never an automatic transfer of canonical truth from domains into `OPL`

That means a future shared index may improve discoverability and reuse, but it still should not become:

- the only truth registry
- the mutation owner for domain assets
- the review owner for domain review state
- the publish/release owner for domain deliverables

### Readiness Before Public Admission

A future `shared asset index` or `shared memory index` should not appear on the current `OPL` public surface until a later explicit contract freezes, at minimum:

- what object classes and identifiers the index is actually allowed to cover
- the owner split and governing refs for every indexed object family
- a reference-only / non-executing control mode
- explicit no-truth-shift, no-mutation-ownership, and no-review/publication-takeover rules
- review and acceptance coverage across the public-surface index, supporting boundary surfaces, and acceptance spec

Until those readiness conditions are frozen, any shared-index mention stays roadmap-level only.
It is not a current public-entry surface, not a routed surface, not an execution surface, and not a truth-owner surface.

## Non-Goals And Anti-Regressions

This ownership model does not allow:

- `OPL` becoming a monolithic shared-foundation runtime
- `OPL` becoming the single truth store for all assets or memory
- `OPL` taking domain-owned review truth, runtime truth, or publication truth
- `shared asset index` becoming a mutation owner
- `shared memory index` becoming a replacement for domain review or workspace evidence
- reducing `MedAutoScience` or `RedCube AI` to private implementation details under `OPL`
- bypassing a domain gateway because a top-level shared object exists

## Current Practical Reading

At the current repository stage:

- the shared foundation is primarily frozen as top-level language and boundary documentation
- this repository does not yet materialize a full shared asset index or shared memory index
- that absence does not mean the ownership split is undefined

The current reading should therefore be:

- `OPL` already owns the shared-foundation control language
- domains already own their concrete truth surfaces
- future shared indexes, if added, should stay aligned with that same split unless a later explicit contract says otherwise

## Companion Closeout

- [Shared-Foundation Ownership / Readiness Closeout](./opl-shared-foundation-ownership-readiness-closeout.md)
