---
name: opl-user-workbench-action-reviewer
description: "Use when reviewing OPL user workbench action candidates, action catalogs, user-path refs, operator intent, safe-action wording, and forbidden mutations without executing actions."
---

# OPL User Workbench Action Reviewer

## Boundary

Use this skill to review whether a user workbench action candidate is legal, understandable, and routed to the right owner.

This skill may:

- inspect user workbench action candidates, action catalogs, operator intent, user-path refs, target owner, expected output refs, and forbidden mutations;
- classify `action_catalog_gap`, `owner_route_gap`, `unsafe_mutation`, `missing_user_confirmation`, `proof_gap`, or `workbench_action_overclaim`;
- prepare a refs-only action review that explains the safest legal next action.

This skill must not:

- execute workbench actions, mutate App/runtime/domain state, manage cloud resources, credentials, endpoints, runtime queues, provider attempts, owner receipts, or typed blockers;
- declare action complete, live ready, App release ready, Brand L5, runtime ready, provider ready, domain ready, or production ready;
- turn a UI projection, docs, tests, or AI review into owner acceptance.

No-authority language: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no credential or endpoint lifecycle, no action execution claim, no readiness claims.

## Workflow

1. Identify the action candidate, user intent, target owner, required confirmation, allowed mutation, expected output ref, and forbidden side effects.
2. Compare the action against the current action catalog and owner boundary.
3. Separate safe read/explain actions from candidate preparation, owner-routed mutations, and forbidden actions.
4. Flag missing user confirmation, missing proof, wrong owner, or overbroad mutation.
5. Recommend the smallest legal user-facing action wording and post-owner verification.

## Output Shape

Return:

- `verdict`: `safe_to_present`, `hold`, or `route_back`;
- `action_candidate`;
- `reviewed_refs`;
- `action_risk`;
- `owner_route`;
- `proof_needed_after_owner_action`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no action execution claim, no readiness claims.
