# OPL Gateway Contracts

This directory is the repository-local materialization of the `G1` federation contract for `One Person Lab`.

It does **not** implement a runtime.
It freezes machine-readable gateway surfaces that later discovery and routed-action layers can consume.

## Governing documents

- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Read-Only Discovery Gateway（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Routed Action Gateway（中文）](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../../docs/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../../docs/opl-publish-promotion-operating-surface.md)
- [OPL Publish / Promotion Operating Surface（中文）](../../docs/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../docs/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Acceptance Test Spec（中文）](../../docs/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Rollout](../../docs/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/opl-gateway-rollout.zh-CN.md)
- [中文说明](./README.zh-CN.md)

## Files

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — shared routing vocabulary groups plus frozen routing rules
- [`handoff.schema.json`](./handoff.schema.json) — JSON Schema for the frozen G1 handoff payload
- [`routed-actions.schema.json`](./routed-actions.schema.json) — JSON Schema for the frozen G3 routed action contract
- [`governance-audit.schema.json`](./governance-audit.schema.json) — JSON Schema for the frozen P5.M1 governance / audit operating contract
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — JSON Schema for the frozen P5.M2 publish / promotion operating contract
- [`acceptance-matrix.json`](./acceptance-matrix.json) — declarative acceptance matrix for the frozen gateway and operating surfaces

## Frozen current mappings

- `research_ops` routes to `medautoscience`
- `presentation_ops` routes to `redcube`
- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may route to `redcube`, but does not automatically equal `presentation_ops`

## Boundary rules

- `OPL` remains the top-level gateway and federation surface.
- Domain gateways remain independently usable after routing.
- Domain harnesses stay below domain gateways.
- This directory does not create canonical truth ownership above domains.
- This directory does not authorize bypassing a domain gateway to reach a harness.

## Current scope

This directory includes only the workstreams and domains whose boundaries are already frozen in the public G1 contract.

Planned workstreams such as `Grant Ops`, `Review Ops`, and `Thesis Ops` remain outside this directory until their domain boundaries are explicitly frozen.

## Materialization note

The prose docs describe canonical contract intent using `opl/...` surface names.
This directory is the concrete materialization for the current repository while preserving the same contract shape.
