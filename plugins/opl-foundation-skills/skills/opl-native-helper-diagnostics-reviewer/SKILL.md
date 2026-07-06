---
name: opl-native-helper-diagnostics-reviewer
description: "Use when reviewing OPL native helper diagnostics, sysprobe/state-index refs, helper envelopes, repair recommendations, and boundary risks without running repair or owning runtime truth."
---

# OPL Native Helper Diagnostics Reviewer

## Boundary

Use this skill to review native helper diagnostic output before a runtime, App, or framework owner acts on it.

This skill may:

- inspect native helper diagnostics, sysprobe refs, state-index refs, helper envelopes, error classes, repair recommendations, and stale-index risk;
- classify `native_helper_envelope_gap`, `state_index_stale`, `diagnostic_scope_gap`, `repair_recommendation_gap`, or `helper_authority_overclaim`;
- prepare a refs-only diagnostic review that routes the next action to the owning helper/runtime surface.

This skill must not:

- run repair, refresh indexes, manage cloud resources, credentials, endpoints, runtime queues, provider attempts, owner receipts, typed blockers, or runtime truth;
- declare native helper healthy, runtime ready, provider ready, live ready, App release ready, Brand L5, or production ready;
- treat helper diagnostics, cache hits, or AI review as source/domain/runtime authority.

No-authority language: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no credential or endpoint lifecycle, no native-helper health claim, no readiness claims.

## Workflow

1. Identify the native helper, diagnostic command/output, envelope version, indexed surface, consuming owner, and claimed repair or health state.
2. Check whether the diagnostic envelope includes scope, timestamp, source refs, error class, and no-authority caveat.
3. Separate helper/index observations from domain-owned durable truth and runtime authority.
4. Classify stale, incomplete, malformed, or overbroad diagnostics.
5. Route the next legal action to native helper owner, runtime owner, App owner, or domain owner.

## Output Shape

Return:

- `verdict`: `diagnostic_usable`, `hold`, or `route_back`;
- `diagnostic_refs`;
- `native_helper_assessment`;
- `gaps`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no native-helper health claim, no readiness claims.
