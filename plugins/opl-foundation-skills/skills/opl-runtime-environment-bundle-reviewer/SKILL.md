---
name: opl-runtime-environment-bundle-reviewer
description: "Use when reviewing OPL runtime environment descriptor, materialized root, cache, lock, bundle manifest, reproducibility receipt, and environment proof wording without managing environments or providers."
---

# OPL Runtime Environment Bundle Reviewer

## Boundary

Use this skill to review runtime environment bundle evidence before Runway, Pack, App, or a domain consumer treats it as usable input.

This skill may:

- inspect environment descriptors, runtime locks, bundle manifests, materialized runtime roots, cache inventory, prune receipts, run-context refs, and reproducibility receipts;
- classify `descriptor_gap`, `lock_gap`, `manifest_digest_gap`, `materialization_receipt_gap`, `cache_pointer_risk`, `reproducibility_gap`, or `environment_ready_overclaim`;
- prepare a refs-only environment bundle review for OPL Runway, Pack, App, or the consuming domain owner.

This skill must not:

- materialize, prune, repair, install, run providers, mutate runtime roots, write provider attempts, create owner receipts, create typed blockers, or manage environments;
- declare domain ready, App release ready, provider ready, production ready, publication ready, or owner accepted;
- treat cache hits, docs, descriptor shape, bundle presence, or AI review as environment authority.

No-authority language: no owner receipts, no typed blockers, no domain truth, no provider attempts, no environment mutation, no App release-ready claim, no readiness claims.

## Workflow

1. Identify descriptor, lock, manifest, runtime root, cache pointer, receipt, run-context, platform, profile, and consuming owner.
2. Check whether lock and manifest digests match the claimed descriptor/profile/platform.
3. Separate materialization or verify receipts from domain, App release, provider, and production readiness.
4. Flag missing receipt, stale cache pointer, unprotected prune claim, host-workspace fallback, or reproducibility gap.
5. Route the smallest legal next action to Runway, Pack, App release owner, provider owner, or domain owner.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `bundle_assessment`;
- `gaps`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no environment mutation, no provider attempts, no App release-ready claim, no readiness claims.
