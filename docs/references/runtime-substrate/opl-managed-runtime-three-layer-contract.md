# OPL Managed Runtime Three-Layer Contract

Status: `support_reference_updated`
Owner: `One Person Lab`
Machine boundary: human-readable boundary reference only. Machine-readable truth must use `contracts/`, source code, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, or App/workbench projections.

Current status note (2026-05-14): this document keeps the three-layer owner split as useful content, but the old `runtime_owner = upstream_hermes_agent` mapping is obsolete. The current OPL production online path is provider-backed runtime; the Temporal-backed provider is the required substrate. `hermes_agent` belongs to the current canonical executor backend set and is only usable as an explicit non-default executor adapter/backend; Hermes provider / Gateway / readiness / compatibility surfaces remain historical provenance, diagnostic vocabulary, or negative guards. The current implementation order lives in [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.zh-CN.md) and [Temporal Family Runtime Provider plan](./temporal-family-runtime-provider-plan.zh-CN.md).

This reference freezes the smallest shared machine-readable contract we want every admitted domain to converge on for managed runtime ownership.

It does not claim a shared runtime codebase already exists.
It only freezes the cross-domain contract shape that should stop drifting:

- `runtime_owner`
- `domain_owner`
- `executor_owner`
- `supervision_status_surface`
- `attention_queue_surface`
- `recovery_contract_surface`
- the canonical fail-closed rules

## Why this exists

When the hosted runtime owner and the domain supervision owner get blurred together, two recurring failures appear:

- the domain layer cannot tell whether the live run is paused, stale, or dead
- the domain layer starts bypassing runtime-owned work and tries to finish downstream actions itself

This contract keeps the boundary explicit:

- `runtime_owner`
  - hosted runtime lifecycle owner
- `domain_owner`
  - domain supervision / governance / gate owner
- `executor_owner`
  - concrete worker that actually performs the task

## Current admitted-domain alignment

- `med-autoscience`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = med-autoscience`
  - `executor_owner = codex_cli_via_mas_domain_entry`
- `redcube-ai`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = redcube_ai`
  - `executor_owner = codex_cli`
- `med-autogrant`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = med-autogrant`
  - `executor_owner = codex_cli_or_domain_declared_executor`

Here, `runtime_owner` means the OPL family provider / attempt ledger / readiness / projection owner; it does not mean OPL owns domain truth. `executor_owner` means the concrete stage executor carrier; the default remains `Codex CLI`, while each domain may declare a more specific executor in its own contract.

## Non-goals

- not a runtime control plane
- not a shared truth store
- not a claim that all domains already share one executor implementation
- not a path to revive `Hermes-Agent` as the default target runtime substrate
