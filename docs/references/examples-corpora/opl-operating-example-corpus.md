**English** | [中文](./opl-operating-example-corpus.zh-CN.md)

# OPL Operating Example Corpus

## Purpose

This document indexes the canonical machine-readable operating-record examples for the frozen `P5.M1` and `P5.M2` surfaces.

Its goal is to make top-level governance, review-index, publish-readiness, publish-outcome, and promotion-surface records easier to inspect without turning examples into a workflow runtime or truth surface.

## Non-Goals

This corpus does not:

- implement a runtime
- execute review, publish, release, export, submission, or promotion actions
- replace the governing operating-surface contracts
- claim review truth, publish truth, promotion truth, or public-channel posting truth
- authorize direct publish, release, export, submission, or posting by `OPL`

The examples are illustrative operating-record walkthroughs only.

## Former Example Set

### 1. Governance decision

- Former artifact: `examples/opl-framework/governance-decision-record.json` (retired from the active repo artifact set)
- Shows a top-level decision record above domain-owned review truth.

### 2. Cross-domain review index

- Former artifact: `examples/opl-framework/cross-domain-review-index.json` (retired from the active repo artifact set)
- Shows how `OPL` indexes required review surfaces and blocking gates across domains without duplicating review truth.

### 3. Publish readiness signal

- Former artifact: `examples/opl-framework/publish-readiness-signal.json` (retired from the active repo artifact set)
- Shows a pre-publish readiness index before domain-owned publish truth exists.

### 4. Publish outcome index

- Former artifact: `examples/opl-framework/publish-outcome-index.json` (retired from the active repo artifact set)
- Shows a top-level index of a domain-owned publish / release / export / submission outcome.

### 5. Promotion candidate signal

- Former artifact: `examples/opl-framework/promotion-candidate-signal.json` (retired from the active repo artifact set)
- Shows a post-publish promotion-readiness signal above domain-owned outcome truth.

### 6. Promotion surface index

- Former artifact: `examples/opl-framework/promotion-surface-index.json` (retired from the active repo artifact set)
- Shows public-surface references and blockers after a domain-owned outcome already exists.

## Reading Rule

Read these examples as **contract-level operating-record walkthroughs**, not executable workflows.

If an example references review, publish, promotion, or public-channel truth, that truth remains inside the owning domain system through `domain_truth_refs`.
Any follow-on action must point to the current domain-owned capability entry or action-route ref. Historical examples may still contain the legacy literal `domain_gateway`, but this corpus does not preserve it as an active compatibility route and never authorizes harness bypass, direct venue submission, or direct public posting.

## Governing Contracts

- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

## Related Companions

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## Completion Definition

The operating example corpus is acceptable only when:

- former artifact names remain provenance-only and are not clickable active repo paths
- the corpus stays illustrative, non-governing, and non-executing
- the corpus does not transfer review, publish, or promotion truth into `OPL`
- active schema and behavior truth comes from current contracts/source/CLI behavior
- any follow-on action points to current domain-owned capability/action-route refs rather than preserving `domain_gateway` as a compatibility value
