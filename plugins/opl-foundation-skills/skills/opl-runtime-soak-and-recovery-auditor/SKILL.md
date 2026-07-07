---
name: opl-runtime-soak-and-recovery-auditor
description: "Use when auditing OPL runtime/provider environment fit, runtime environment bundles, native helper diagnostics, long-soak evidence, recovery attempts, provider observations, no-regression refs, and route-back decisions without mutating runtime or provider state."
---

# OPL Runtime Soak And Recovery Auditor

## Boundary

Use this skill to audit runtime/provider evidence before Runway, Console, or a release owner consumes it. It is the consolidated reviewer for provider fit, runtime environment bundle proof, native helper diagnostics, long-soak windows, and recovery evidence.

This skill may:

- inspect runtime provider fit, sandbox substrate boundaries, credential risk refs, runtime environment descriptor, materialized root/cache/lock/bundle manifest, reproducibility receipts, native helper/sysprobe/state-index refs, recovery attempts, provider observations, no-regression refs, failure windows, recovery playbooks, and route-back refs;
- classify `provider_fit_gap`, `credential_boundary_gap`, `environment_bundle_gap`, `native_helper_diagnostic_gap`, `soak_evidence_gap`, `recovery_gap`, `provider_observation_gap`, `no_regression_gap`, `owner_route_gap`, or `runtime_ready_overclaim`;
- prepare a refs-only audit note that distinguishes observed recovery from readiness.

Optional helper: `kernel.py` provides deterministic runtime/ref normalization, soak checklist, gap classification, and forbidden-claim lint helpers.
It is stdlib-only, writes nothing, performs no network or subprocess calls, and does not mutate runtime state or claim readiness.

This skill must not:

- submit, wait, harvest, redrive, retry, mutate runtime queues, write provider attempts, manage cloud resources, credentials, endpoints, helper repairs, owner receipts, typed blockers, or readiness ledgers;
- declare runtime ready, provider ready, live ready, production ready, Brand L5, App release ready, or recovery complete;
- treat a clean queue, a single smoke, docs, or AI review as long-soak or recovery authority.

No-authority language: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no credential or endpoint lifecycle, no runtime readiness claim, no readiness claims.

## Workflow

1. Identify the runtime surface, provider/substrate, environment bundle, helper diagnostic ref, soak window, recovery path, claimed outcome, and consuming owner.
2. Group refs by class: provider fit, credential boundary, environment bundle, native helper diagnostic, long-soak, recovery attempt, provider observation, no-regression, failure, owner acceptance, or reviewer note.
3. Check whether the refs prove sustained operation, recovery behavior, reproducible environment materialization, helper diagnosis, or only a structural/readback condition.
4. Flag missing duration, missing recovery event, stale provider observation, hidden failure, helper authority overclaim, credential risk, environment reproducibility gap, or owner-route ambiguity.
5. Recommend the smallest legal route: collect evidence, route to Runway/Console/release owner, route to native-helper owner, or hold the claim.

## Output Shape

Return:

- `verdict`: `owner_route_candidate`, `hold`, or `route_back`;
- `reviewed_refs`;
- `soak_and_recovery_assessment`;
- `runtime_provider_and_environment_assessment`;
- `gaps`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime queue writes, no provider attempts, no runtime readiness claim, no readiness claims.
