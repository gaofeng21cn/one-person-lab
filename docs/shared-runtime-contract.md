**English** | [中文](./shared-runtime-contract.zh-CN.md)

# Shared Runtime Contract

> Current-status note (`2026-04-25`): this document is retained as a shared-boundary reference. The current public OPL mainline is `Codex-default session/runtime + explicit activation layer + MAS/MAG/RCA domain agents`; `MedDeepScientist` is a MAS-controlled backend companion, not a top-level OPL domain agent. Older `gateway / harness` wording below should be read as compatibility language for internal boundaries, not as the default public product model.

## Purpose

This document freezes the cross-domain runtime contract shared across the `OPL` ecosystem.
It answers “what a long-running runtime must expose in a stable way,” not “which execution plane happens to implement it today.”

This contract lives inside the `Unified Harness Engineering Substrate`, but it is not the whole substrate, and it is not a wrapper around any single open-source project.

## What It Owns

The `Shared Runtime Contract` owns the shared runtime objects and behavior surfaces required for long-running execution, including:

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron`
- `approval / interrupt / resume`
- `family event envelope`
- `family checkpoint lineage`
 - `product-entry runtime continuity discovery`

These are cross-domain runtime requirements.
They define what the runtime layer must expose structurally, not what any one domain decides about artifacts, review, or delivery truth.

## What It Does Not Own

This contract does not:

- define a domain-specific object model
- define a domain-specific artifact schema
- define a domain's gate / audit / delivery truth
- let `OPL` bypass a domain-agent entry and take over domain-owned runtime or delivery truth
- turn one concrete execution plane into current `OPL` public truth

## Current v1 Object Set

The first object set to keep explicit is:

1. `runtime profile`
   - `profile_id`
   - `runtime_home`
   - `subprocess_home`
   - `runtime_status_root`

2. `session substrate`
   - `session_id`
   - `parent_session_id`
   - `session_state`
   - `resume_pointer`
   - `interrupt_reason`

3. `gateway runtime status`
   - `gateway_state`
   - `active_runs`
   - `last_heartbeat`
   - `restart_requested`
   - `exit_reason`

4. `memory provider hook`
   - `prefetch`
   - `sync_turn`
   - `on_session_end`
   - `on_delegation`

5. `delivery / cron`
   - `job_id`
   - `delivery_target`
   - `next_run_at`
   - `output_record`
   - `silent_delivery`

6. `approval / interrupt / resume`
   - `approval_request_id`
   - `approval_scope`
   - `approval_decision`
   - `interrupt_reason`
   - `resume_allowed`

## Family Orchestration Companion Schemas

To avoid coupling the family runtime layer to one orchestration framework, the machine-readable companion schemas now frozen under this contract are:

1. `family event envelope`
   - shared event correlation, producer, session, and audit-reference envelope
2. `family checkpoint lineage`
   - shared checkpoint ancestry, resume, and state-reference envelope
3. `product-entry runtime continuity discovery`
   - shared `runtime inventory + task lifecycle + session continuity + progress projection + artifact inventory` discovery surface, with `runtime_control` / `runtime_loop_closure` as control references and repo-owned runtime-control projections still owned by domain repositories

These schemas live in `contracts/family-orchestration/`.
They freeze interoperability surfaces that multiple domain runtimes can adopt while still keeping runtime ownership and durable truth local to each domain repository.

## Relationship To CrewAI

`CrewAI` is being used here as a source of orchestration ideas, not as a required family runtime layer.

The current split is:

- absorb event correlation, checkpoint lineage, flow introspection, and human-gate pause / resume semantics at the contract layer
- do not standardize on `CrewAI` as the default `LLM`, `Agent`, `Crew`, or memory owner
- do not let `CrewAI` replace `Hermes-Agent`, `Codex CLI`, the OPL session/runtime entry, or any domain-agent entry

## Relationship To Hermes-Agent

What the upstream `Hermes-Agent` contributes most convincingly today is a mature runtime substrate implementation.

The more accurate statement is therefore:

- an upstream `Hermes-Agent`-backed runtime substrate is a preferred future implementation direction for the `Shared Runtime Contract`
- `Hermes-Agent` is not the whole `UHS`
- `Hermes-Agent` does not replace the OPL session/runtime entry, any domain-agent entry, or any domain-owned truth surface
- the preferred integration mode is `external kernel, managed by OPL product packaging` rather than a long-term fork or a user-managed prerequisite install

In short, `Hermes` is better suited to own “how the system keeps running” than “what counts as a gate, an audit trail, or domain truth.”

## Current Truth

As of the current public mainline, the true state remains:

- the default OPL entry is the local `opl` / `opl exec` / `opl resume` path with Codex-default semantics
- explicit activation routes only into admitted domain agents: `MAS`, `MAG`, and `RCA`
- `MCP` and other protocol surfaces remain supporting or domain-owned layers
- the `Shared Runtime Contract` is a reference contract under the current shared-boundary layer, not the default product entry
- the runtime-oriented family orchestration companion schemas now live in `contracts/family-orchestration/` and freeze the shared `event envelope + checkpoint lineage + product-entry runtime continuity discovery` semantics without turning them into one runtime owner
- the active four-repository public line is `one-person-lab + MAS + MAG + RCA`; `MDS` remains below MAS as a controlled runtime/backend companion
- an upstream `Hermes-Agent` runtime substrate remains an opt-in or future implementation direction for this contract, not the default OPL public fact

## Implementation Boundary

As long as the upper-layer contracts stay intact, the `Shared Runtime Contract` can later be implemented through different deployment shapes:

- the current local `host-agent runtime`
- a future upstream `Hermes-Agent`-backed managed runtime
- a future platform-hosted execution plane

In product terms, that preferred future shape means:

- a local open-source `OPL` entry can bootstrap and manage a supported external `Hermes` runtime for the user
- a future hosted `OPL` product can run the external `Hermes` kernel inside the platform

What may change is the runtime substrate implementation, not:

- `OPL` session/runtime and activation semantics
- the formal-entry matrix
- domain-agent boundaries
- domain-owned artifact / audit / delivery truth

## Place In The Four-Repo Family

- `one-person-lab`
  - defines the public language and boundary of this contract
- `med-autoscience`
  - adopts and validates it on the medical `Research Foundry` line
- `redcube-ai`
  - adopts and validates it on the visual-deliverable line
- `med-autogrant`
  - adopts and validates it on the grant-runtime line

This contract is therefore the runtime-alignment surface shared by the four repositories, not a private implementation detail owned by one of them.
