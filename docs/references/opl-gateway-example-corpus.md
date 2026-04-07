**English** | [中文](./opl-gateway-example-corpus.zh-CN.md)

# OPL Gateway Example Corpus

## Purpose

This document indexes the canonical machine-readable examples for the frozen `OPL Gateway` contract stack.

Its goal is to make the current gateway surface easier to discover and reuse without turning examples into a runtime.
It is a companion index, not a new contract layer.

## Non-Goals

This corpus does not:

- implement a runtime
- execute a domain harness
- claim canonical domain truth
- replace the underlying contracts

The examples are illustrative contract compositions only.

## Current Example Set

### 1. Research submission flow

- File: [`.../examples/opl-gateway/research-ops-submission.json`](.../examples/opl-gateway/research-ops-submission.json)
- Shows how a `research_ops` request composes:
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

### 2. Presentation publish / promotion flow

- File: [`.../examples/opl-gateway/presentation-ops-publish.json`](.../examples/opl-gateway/presentation-ops-publish.json)
- Shows how a `presentation_ops` request composes:
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

## Reading Rule

Read the examples as **contract-level walkthroughs**, not executable workflows.
This corpus is illustrative and non-governing.

If an example references a domain outcome, that outcome remains domain-owned truth.
`OPL` only carries the top-level routing, governance, and publish/promotion indexes defined by the frozen contracts.

## Governing Contracts

- [OPL Federation Contract](../opl-federation-contract.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Contracts](.../contracts/opl-gateway/README.md)

## Related Companion

- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## Completion Definition

The example corpus is acceptable only when:

- each example stays machine-readable
- schema-governed sub-objects validate against the frozen schemas where applicable
- examples do not imply direct harness execution
- examples do not move canonical truth into `OPL`
