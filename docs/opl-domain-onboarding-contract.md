**English** | [中文](./opl-domain-onboarding-contract.zh-CN.md)

# OPL Domain Onboarding Contract

## Purpose

This document freezes the domain-onboarding contract for the `OPL Gateway`.

Its goal is to define when a new domain system may be formally admitted into the `OPL` federation without blurring ownership, routing, or truth boundaries.

The target is not to add domain names early and clarify them later.
The target is to require explicit boundary material before official inclusion.

## Relationship To G1, G2, And G3

Domain onboarding is downstream of the already frozen gateway layers:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- the machine-readable contract surfaces in [`../contracts/opl-gateway/README.md`](../contracts/opl-gateway/README.md)

If the top-level registry, discovery, and routed-action layers are not stable, domain onboarding should not proceed.

## Machine-Readable Companion

- [`../contracts/opl-gateway/domain-onboarding-readiness.schema.json`](../contracts/opl-gateway/domain-onboarding-readiness.schema.json)
- [`../examples/opl-gateway/domain-onboarding-readiness.json`](../examples/opl-gateway/domain-onboarding-readiness.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

This schema materializes the onboarding-readiness record as a non-executing contract surface.
It does not admit domains automatically, and it does not replace the prose review gate in this document.
The example record is illustrative only and does not count as a formal domain admission.
The candidate-domain backlog is the upstream blocker surface for under-definition workstreams; it records what is still missing before an onboarding-readiness record can even exist. For the human-readable companion, see [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md).

## Core Promise

A new domain may be officially included in `OPL` only when:

- its registry identity is explicit
- its truth ownership is explicit
- its public gateway / harness boundary is explicit
- its review surfaces are explicit
- top-level discovery and routing can point to it without prose-only guesswork

`OPL` must not accept “placeholder first, boundary later” onboarding.

## Non-Goals

This contract does not:

- turn `OPL` into the runtime owner of a new domain
- let a domain exist only as an internal implementation detail under `OPL`
- admit a domain based only on a product name, repository link, or future intent
- allow a family name to stand in for workstream semantics without an explicit top-level mapping

## Required Onboarding Package

### 1. Registry Material

A new domain must provide a complete registry package.

#### Required domain registry entry

The domain entry must define all `G1` domain fields:

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

#### Required workstream registry entry

If the new domain owns a new OPL workstream, it must also provide a complete workstream entry with all `G1` workstream fields:

- `workstream_id`
- `label`
- `status`
- `description`
- `domain_id`
- `entry_mode`
- `primary_families`
- `top_level_intents`
- `notes`

If the new domain becomes the owner of an already defined workstream, that ownership transfer must still be made explicit in the workstream registry.

#### Required routing vocabulary impact

The onboarding package must state whether the new domain:

- reuses the existing routing vocabulary without extension
- requires new `intent_id`, `delivery_kind`, `review_kind`, or other top-level vocabulary entries

No vocabulary expansion may be implied only in prose.

### 2. Public Documentation Surface

A new domain must provide public, reviewable documentation that makes the boundary legible from outside the runtime.

At minimum, the onboarding package must provide:

- a public domain README or equivalent gateway entry document
- an explicit statement that the domain is a `domain gateway` above its own `harness`
- an explicit statement that the domain remains independently usable and is not merely an internal `OPL` module
- an explanation of the workstream(s), deliverable objects, and review semantics the domain owns
- enough public wording for `OPL` docs to link to the domain without inventing its identity

## 3. Truth Ownership Declaration

A new domain must explicitly declare what truth it owns.

That declaration must be precise enough that readers can tell:

- which runtime truth remains inside the domain
- which run / delivery / audit / review records belong to the domain
- what `OPL` may index or route across
- what `OPL` may not claim as canonical truth

No domain may be officially admitted while truth ownership remains ambiguous.

## 4. Review Surface Declaration

A new domain must expose explicit review surfaces, not just execution claims.

The onboarding package must identify:

- what human review surfaces exist
- what publish or release gates exist
- what quality-regression or comparable review hooks exist
- how top-level `OPL` discovery and routed handoff refer to those review semantics

If a domain cannot explain how work is reviewed, it is not ready for official federation admission.

## Formal Inclusion Gate

A domain is formally includable in `OPL` only when all of the following are true:

1. **Registry complete**  
   The required registry entries are present and internally consistent.

2. **Boundary explicit**  
   The domain README and top-level OPL docs can describe the domain without ambiguity.

3. **Truth ownership explicit**  
   Canonical truth remains inside the domain and is not silently rehomed to `OPL`.

4. **Discovery ready**  
   `G2` discovery can identify the domain, its owned workstream(s), and the correct entry surface.

5. **Routing ready**  
   `G3` routed action semantics can route into the domain gateway with explicit evidence and without bypassing the domain gateway.

6. **Review ready**  
   The domain exposes explicit review semantics and not just an execution path.

7. **Cross-domain wording aligned**  
   `OPL`, the domain README, and any linked public surfaces use the same top-level role language.

If any of these fail, the domain may still be under discussion, but it is not yet formally included.

## Hard Prohibitions

The following are not allowed:

- adding a domain name to `OPL` navigation before the boundary package exists
- admitting a domain whose truth ownership is still “to be decided”
- treating an existing domain harness as if it automatically defines a new domain gateway
- treating a family or profile name as if it automatically defines a top-level workstream
- describing a domain as officially onboarded before discovery and routing surfaces are updated

## Minimal Onboarding Review Questions

Before official inclusion, the top-level review should be able to answer:

- What workstream(s) does this domain own?
- What gateway surface does it expose?
- What harness surface sits below it?
- What truth remains canonical inside the domain?
- What families are inside the domain but not automatically equal to an OPL workstream?
- How does `OPL` discover and route into it?
- Why is this a new domain rather than just a family inside an existing domain?

If these questions cannot be answered clearly, the onboarding is not ready.

## Completion Definition

The domain onboarding contract is satisfied only when future domain admissions can be reviewed against a stable top-level gate instead of ad hoc wording.
