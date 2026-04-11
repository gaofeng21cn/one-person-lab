**English** | [中文](./shared-domain-contract.zh-CN.md)

# Shared Domain Contract

## Purpose

This document freezes the cross-domain product semantics and behavior contract used across the `OPL` ecosystem.
It answers “which public behavior surfaces multiple `Domain Harness OS` implementations should keep aligned,” not “whether they must all share one identical domain object model.”

This contract also lives inside the `Unified Harness Engineering Substrate`, but it is distinct from the `Shared Runtime Contract`.

## What It Owns

The `Shared Domain Contract` owns the shared upper-layer behavior semantics across domains, including:

- the formal-entry matrix
- the `per-run handle`
- the durable report surface
- the audit trail surface
- gate semantics
- the relationship between the current `Auto-only` mainline and any future `HITL` sibling / upper-layer product

These concerns define how the product is entered, observed, reviewed, and promoted in a stable way.
They do not define how runtime processes are hosted.

## Current v1 Shared Objects

The first objects and rules to keep aligned are:

1. formal-entry matrix
   - default formal entry `CLI`
   - `MCP` as the supported protocol layer
   - `controller` as an internal control surface only

2. `per-run handle`
   - every formal run should have a traceable identity
   - that identity should connect stably to report, audit, and delivery records

3. durable report
   - every formal run should leave a stable report surface
   - that report surface should support review, promotion, and historical comparison

4. audit trail
   - major stage transitions should remain reviewable
   - audit records should not depend on ephemeral chat context to be understandable

5. gate semantics
   - each gate should have a stable identity, evidence input, and status output
   - unfrozen judgment must not be rewritten as “gate passed” fact

6. no-bypass
   - top-level and cross-domain handoff should target `Domain Gateway` only
   - `OPL` must not be rewritten as the runtime owner of a domain harness

7. operating posture
   - current admitted mainlines remain `Auto-only`
   - any future `Human-in-the-loop` product should reuse stable modules as a sibling or upper-layer product rather than forcing same-repository dual-mode logic

## What It Does Not Own

This contract does not:

- unify every domain's internal object model
- unify the content structure of every domain artifact
- unify each domain's detailed review standard
- decide which concrete runtime substrate implementation must be used

## Relationship To The Shared Runtime Contract

The simplest split is:

- `Shared Runtime Contract`
  - freezes “how the system keeps running”
- `Shared Domain Contract`
  - freezes “how a formal run remains enterable, auditable, and promotable”

Both belong to the `UHS`, but they own different responsibilities.

## Current Truth

As of the current public mainline, this contract is already partially visible in the aligned four-repo wording:

- `CLI-first`
- `MCP-supported`
- `controller internal only`
- `Auto-only` mainline
- no-bypass to `Domain Gateway`

But the `per-run handle`, durable report, audit trail, and gate semantics are still being tightened into repo-verified behavior surfaces and should not be overstated as already fully unified across every repository.

## Place In The Four-Repo Family

- `one-person-lab`
  - defines the top-level language of this shared product contract
- `med-autoscience`
  - lands it as verified behavior on the research-runtime line
- `redcube-ai`
  - lands it as verified behavior on the visual-deliverable line
- `med-autogrant`
  - lands it as verified behavior on the grant-runtime line

This is therefore the top-level anchor for the “aligned behavior surfaces across the four repositories” that the ecosystem is moving toward.
