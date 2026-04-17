# OPL Managed Runtime Three-Layer Contract

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
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = med-autoscience`
  - `executor_owner = med_deepscientist`
- `redcube-ai`
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = redcube_ai`
  - `executor_owner = codex_cli`
- `med-autogrant`
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = med-autogrant`
  - `executor_owner = med-autogrant`

## Non-goals

- not a runtime control plane
- not a shared truth store
- not a claim that all domains already share one executor implementation
