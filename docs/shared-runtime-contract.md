**English** | [中文](./shared-runtime-contract.zh-CN.md)

# Shared Runtime Contract

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

These are cross-domain runtime requirements.
They define what the runtime layer must expose structurally, not what any one domain decides about artifacts, review, or delivery truth.

## What It Does Not Own

This contract does not:

- define a domain-specific object model
- define a domain-specific artifact schema
- define a domain's gate / audit / delivery truth
- let `OPL` bypass a `Domain Gateway` and take over a domain harness
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

## Relationship To Hermes

What `Hermes` contributes most convincingly today is a mature runtime substrate implementation.

The more accurate statement is therefore:

- a `Hermes`-backed runtime substrate is a preferred future implementation direction for the `Shared Runtime Contract`
- `Hermes` is not the whole `UHS`
- `Hermes` does not replace the `OPL Gateway`, any `Domain Gateway`, or any `Domain Harness OS`

In short, `Hermes` is better suited to own “how the system keeps running” than “what counts as a gate, an audit trail, or domain truth.”

## Current Truth

As of the current public mainline, the true state remains:

- top-level formal entry is still `CLI-first`
- `MCP` remains the supported protocol layer
- the default local deployment shape is still a `Codex`-default host-agent runtime
- the `Shared Runtime Contract` is still being frozen and progressively landed
- a `Hermes`-backed runtime substrate remains an explicit implementation direction, not a landed public fact

## Implementation Boundary

As long as the upper-layer contracts stay intact, the `Shared Runtime Contract` can later be implemented through different deployment shapes:

- the current local `host-agent runtime`
- a future `Hermes`-backed managed runtime
- a future platform-hosted execution plane

What may change is the runtime substrate implementation, not:

- `OPL` federation semantics
- the formal-entry matrix
- domain-gateway boundaries
- domain-owned artifact / audit / delivery truth

## Place In The Four-Repo Family

- `one-person-lab`
  - defines the public language and boundary of this contract
- `med-autoscience`
  - adopts and validates it on the medical `Research Ops` line
- `redcube-ai`
  - adopts and validates it on the visual-deliverable line
- `med-autogrant`
  - adopts and validates it on the grant-runtime line

This contract is therefore the runtime-alignment surface shared by the four repositories, not a private implementation detail owned by one of them.
