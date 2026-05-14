**English** | [中文](./opl-routed-safety-example-corpus.zh-CN.md)

# OPL Routed-Safety Example Corpus

## Purpose

This document indexes historical machine-readable examples for explicit non-success routing states from the archived `OPL Routed Action Gateway` corpus.

Its goal is to make top-level routing safety discoverable and reviewable without turning failure examples into a runtime.

## Non-Goals

This corpus does not:

- implement a runtime
- invent fallback routing
- create a handoff payload when routing is unresolved
- move canonical truth into `OPL`

The examples are illustrative safety compositions only.
For the current `Phase 1 / G3 thin handoff planning freeze hardening`, they remain planning-level contract examples rather than runtime behavior.

## Former Example Set

### 1. Ambiguous task

- Former artifact: `examples/opl-framework/ambiguous-task-routing.json` (retired from the active repo artifact set)
- Shows how `OPL` keeps routing unresolved when a request mixes `research_ops` and `presentation_ops` semantics without enough clarification.

### 2. Unknown domain

- Former artifact: `examples/opl-framework/unknown-domain-routing.json` (retired from the active repo artifact set)
- Shows how `OPL` returns `unknown_domain` when a candidate workstream is top-level recognizable but no current domain-owned capability entry owns it.

### 3. Refusal

- Former artifact: `examples/opl-framework/refusal-routing.json` (retired from the active repo artifact set)
- Shows how `OPL` refuses a top-level request that tries to bypass the domain-owned action boundary.

## Reading Rule

Read these examples as **contract-level safety walkthroughs**, not executable workflows.

If routing is unresolved or refused, no handoff payload is built and no domain truth is created by `OPL`.
These examples only show how the frozen G3 and P5.M1 layers record that boundary safely.

## Governing Contracts

- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)

## Completion Definition

The routed-safety corpus is acceptable only when:

- former artifact names remain provenance-only and are not clickable active repo paths
- examples do not imply hidden best-effort routing or direct harness fallback
- examples do not move canonical truth into `OPL`
- current routing behavior is read from active contracts/source/CLI behavior, not this historical corpus
