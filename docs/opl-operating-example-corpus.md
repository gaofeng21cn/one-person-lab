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

## Current Example Set

### 1. Governance decision

- File: [`../examples/opl-gateway/governance-decision-record.json`](../examples/opl-gateway/governance-decision-record.json)
- Shows a top-level decision record above domain-owned review truth.

### 2. Cross-domain review index

- File: [`../examples/opl-gateway/cross-domain-review-index.json`](../examples/opl-gateway/cross-domain-review-index.json)
- Shows how `OPL` indexes required review surfaces and blocking gates across domains without duplicating review truth.

### 3. Publish readiness signal

- File: [`../examples/opl-gateway/publish-readiness-signal.json`](../examples/opl-gateway/publish-readiness-signal.json)
- Shows a pre-publish readiness index before domain-owned publish truth exists.

### 4. Publish outcome index

- File: [`../examples/opl-gateway/publish-outcome-index.json`](../examples/opl-gateway/publish-outcome-index.json)
- Shows a top-level index of a domain-owned publish / release / export / submission outcome.

### 5. Promotion candidate signal

- File: [`../examples/opl-gateway/promotion-candidate-signal.json`](../examples/opl-gateway/promotion-candidate-signal.json)
- Shows a post-publish promotion-readiness signal above domain-owned outcome truth.

### 6. Promotion surface index

- File: [`../examples/opl-gateway/promotion-surface-index.json`](../examples/opl-gateway/promotion-surface-index.json)
- Shows public-surface references and blockers after a domain-owned outcome already exists.

## Reading Rule

Read these examples as **contract-level operating-record walkthroughs**, not executable workflows.

If an example references review, publish, promotion, or public-channel truth, that truth remains inside the owning domain system through `domain_truth_refs`.
Any follow-on action still routes through `domain_gateway`; this corpus never authorizes harness bypass, direct venue submission, or direct public posting.

## Governing Contracts

- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Related Companions

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## Completion Definition

The operating example corpus is acceptable only when:

- each example stays machine-readable
- governance examples validate directly against the frozen governance-audit schema
- publish / promotion examples validate directly against the frozen publish-promotion schema
- examples stay illustrative, non-governing, and non-executing
- examples do not transfer review, publish, or promotion truth into `OPL`
- any follow-on action still routes through `domain_gateway`
