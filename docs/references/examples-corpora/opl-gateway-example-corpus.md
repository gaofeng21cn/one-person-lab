**English** | [中文](./opl-gateway-example-corpus.zh-CN.md)

# OPL Gateway Example Corpus

State: `support_reference_legacy_derived`
Current owner: `docs/references/README.md`
Machine boundary: human-readable companion for example artifacts only.

## Purpose

This document indexes historical/legacy-derived machine-readable examples for the former `OPL Gateway` contract stack.

Its goal is to keep the legacy gateway examples discoverable for review, migration, and schema archaeology without turning examples into a runtime or current topology.
It is a companion index, not a new contract layer.
The current OPL topology is Codex-first and stage-led; these examples are contract walkthroughs and evidence material.

## Non-Goals

This corpus does not:

- implement a runtime
- execute a domain harness
- claim canonical domain truth
- replace the underlying contracts

The examples are illustrative contract compositions only.
For the current `Phase 1 / G3 thin handoff planning freeze hardening`, any routed-action fragments here stay at the planning-level contract layer and do not imply an activated launcher or runtime.

## Current Example Set

### 1. Research submission flow

- File: [`../../examples/opl-framework/research-ops-submission.json`](../../../examples/opl-framework/research-ops-submission.json)
- Shows how a `research_ops` request composes:
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

### 2. Presentation publish / promotion flow

- File: [`../../examples/opl-framework/presentation-ops-publish.json`](../../../examples/opl-framework/presentation-ops-publish.json)
- Shows how a `presentation_ops` request composes:
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

## Reading Rule

Read the examples as **contract-level walkthroughs**, not executable workflows.
This corpus is illustrative and non-governing.

If an example references a domain outcome, that outcome remains domain-owned truth.
`OPL` only carries the top-level routing, governance, and publish/promotion indexes defined by the retained compatibility contracts.

## Governing Contracts

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

## Related Companion

- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## Completion Definition

The example corpus is acceptable only when:

- each example stays machine-readable
- schema-governed sub-objects validate against the frozen schemas where applicable
- examples do not imply direct harness execution
- examples do not move canonical truth into `OPL`
