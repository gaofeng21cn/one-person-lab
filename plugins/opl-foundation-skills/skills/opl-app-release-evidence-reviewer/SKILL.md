---
name: opl-app-release-evidence-reviewer
description: "Use when reviewing OPL App release evidence, release cohort refs, updater/readback refs, smoke results, user-path evidence, and release-ready wording without claiming App release readiness."
---

# OPL App Release Evidence Reviewer

## Boundary

Use this skill to review App release evidence before a release owner consumes it.

This skill may:

- inspect App release evidence, release cohort refs, updater metadata, checksum/readback refs, smoke refs, user-path refs, rollback refs, and release wording;
- classify `release_evidence_gap`, `cohort_ref_missing`, `user_path_gap`, `rollback_gap`, `wrong_release_authority`, or `app_release_ready_overclaim`;
- prepare a refs-only release evidence review for the App/release owner.

This skill must not:

- publish releases, mutate updater metadata, manage cloud resources, credentials, endpoints, runtime queues, provider attempts, owner receipts, typed blockers, or release ledgers;
- declare App release ready, live ready, production ready, Brand L5, provider ready, runtime ready, or domain ready;
- treat local smoke, docs, tests, package artifacts, or AI review as release authority.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no provider attempts, no credential or endpoint lifecycle, no App release-ready claim, no readiness claims.

## Workflow

1. Identify the release channel, cohort, artifact, updater/readback surface, owner, and exact release claim.
2. Group refs by class: artifact, checksum, updater, install, smoke, user path, rollback, owner acceptance, or reviewer note.
3. Check whether each ref supports the release claim and whether any required owner/ref class is missing.
4. Separate structural/package evidence from release authority and live evidence.
5. Route the smallest legal next action to App release owner, updater owner, runtime owner, or human gate.

## Output Shape

Return:

- `verdict`: `owner_route_candidate`, `hold`, or `route_back`;
- `release_refs`;
- `release_evidence_gap`;
- `claim_fit`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no release mutation, no App release-ready claim, no readiness claims.
