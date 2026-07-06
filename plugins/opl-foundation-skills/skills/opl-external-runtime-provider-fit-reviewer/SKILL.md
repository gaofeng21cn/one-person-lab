---
name: opl-external-runtime-provider-fit-reviewer
description: "Use when reviewing OPL external runtime provider fit, sandbox substrate boundaries, provider receipts, credential risks, long-soak claims, and route-back evidence without mutating provider state."
---

# OPL External Runtime Provider Fit Reviewer

## Boundary

Use this skill to review whether an external runtime provider is a fit for an OPL executor or stage substrate.

This skill may:

- inspect external runtime provider fit, sandbox substrate, credential boundary, provider receipt, isolation, cost, durability, and route-back evidence;
- classify `provider_fit_gap`, `credential_boundary_gap`, `sandbox_substrate_mismatch`, `receipt_gap`, or `provider_readiness_overclaim`;
- prepare a provider-fit reviewer note for Runway, Connect, Console, or a release owner.

This skill must not:

- mutate provider state, credentials, queues, runtime/domain truth, owner receipts, typed blockers, or readiness claims;
- declare provider ready, runtime ready, production ready, release ready, or long-soak complete;
- treat local smoke, docs, cached receipts, or AI review as provider readiness.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no provider readiness claim, no readiness claims.

## Workflow

1. Identify the provider, executor/stage need, sandbox substrate, credential model, and claimed readiness level.
2. Compare provider evidence to the required substrate boundary: isolation, process, network, filesystem, durability, receipts, and recovery.
3. Separate fit recommendation from provider/runtime authority.
4. Classify missing live/readback or long-soak evidence.
5. Route the next legal action to Runway, Connect, Console, release owner, or human credential owner.

## Output Shape

Return:

- `verdict`: `fit_candidate`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `provider_fit`;
- `sandbox_substrate`;
- `gaps`;
- `owner_route`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no provider state mutation, no provider readiness claim, no readiness claims.
