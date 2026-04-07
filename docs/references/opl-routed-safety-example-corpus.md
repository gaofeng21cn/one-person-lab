**English** | [中文](./opl-routed-safety-example-corpus.zh-CN.md)

# OPL Routed-Safety Example Corpus

## Purpose

This document indexes the canonical machine-readable examples for the explicit non-success routing states in the frozen `OPL Routed Action Gateway`.

Its goal is to make top-level routing safety discoverable and reviewable without turning failure examples into a runtime.

## Non-Goals

This corpus does not:

- implement a runtime
- invent fallback routing
- create a handoff payload when routing is unresolved
- move canonical truth into `OPL`

The examples are illustrative safety compositions only.

## Current Example Set

### 1. Ambiguous task

- File: [`.../examples/opl-gateway/ambiguous-task-routing.json`](.../examples/opl-gateway/ambiguous-task-routing.json)
- Shows how `OPL` keeps routing unresolved when a request mixes `research_ops` and `presentation_ops` semantics without enough clarification.

### 2. Unknown domain

- File: [`.../examples/opl-gateway/unknown-domain-routing.json`](.../examples/opl-gateway/unknown-domain-routing.json)
- Shows how `OPL` returns `unknown_domain` when a candidate workstream is top-level recognizable but no registered domain gateway currently owns it.

### 3. Refusal

- File: [`.../examples/opl-gateway/refusal-routing.json`](.../examples/opl-gateway/refusal-routing.json)
- Shows how `OPL` refuses a top-level request that tries to bypass the domain gateway boundary.

## Reading Rule

Read these examples as **contract-level safety walkthroughs**, not executable workflows.

If routing is unresolved or refused, no handoff payload is built and no domain truth is created by `OPL`.
These examples only show how the frozen G3 and P5.M1 layers record that boundary safely.

## Governing Contracts

- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Gateway Contracts](.../contracts/opl-gateway/README.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)

## Completion Definition

The routed-safety corpus is acceptable only when:

- each example stays machine-readable
- routed-action and governance-audit sub-objects validate against the frozen schemas where applicable
- examples do not imply hidden best-effort routing or direct harness fallback
- examples do not move canonical truth into `OPL`
