# OPL Gateway Contracts

This directory is the repository-local materialization of the `G1` federation contract for `One Person Lab`.

It does **not** implement a runtime.
It freezes machine-readable gateway surfaces that later discovery and routed-action layers can consume.

## Governing documents

- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Read-Only Discovery Gateway（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Gateway Rollout](../../docs/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/opl-gateway-rollout.zh-CN.md)

## Files

- `workstreams.json` — machine-readable workstream registry
- `domains.json` — machine-readable domain registry
- `routing-vocabulary.json` — shared routing vocabulary groups
- `handoff.schema.json` — JSON Schema for the frozen G1 handoff payload

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

## Materialization note

The prose docs describe canonical contract intent using `opl/...` surface names.
This directory is the concrete materialization for the current repository while preserving the same contract shape.
