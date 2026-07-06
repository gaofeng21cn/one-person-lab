---
name: opl-agent-package-trust-reviewer
description: "Use when reviewing OPL agent package trust, manifest digest, carrier exposure, dependency refs, provenance, install claims, and registry wording without mutating package state."
---

# OPL Agent Package Trust Reviewer

## Boundary

Use this skill to review agent package trust evidence before a package, carrier, or registry action is accepted by the real package owner.

This skill may:

- inspect agent package trust material, manifest digest, dependency refs, carrier exposure, provenance, and registry candidate wording;
- classify `trust_risk`, `manifest_digest_missing`, `dependency_ref_gap`, `carrier_exposure_ambiguous`, or `install_ready_overclaim`;
- prepare a package trust review for Pack, Connect, Console, or the owning program.

This skill must not:

- install packages, mutate registry/lock/provider/runtime/domain truth, write owner receipts, create typed blockers, or make readiness claims;
- declare install-ready, release-ready, domain-ready, App-ready, or production-ready;
- turn source presence, manifest shape, docs, or AI review into package authority.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no install-ready claim, no readiness claims.

## Workflow

1. Identify package id, manifest digest, carrier, dependency refs, and intended exposure.
2. Check provenance and trust evidence before install or sync wording.
3. Separate registry discovery from install authority and owner acceptance.
4. Classify missing trust evidence or overclaim.
5. Route the review to Pack, Connect, Console, or the owning package/program owner.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `trust_risk`;
- `manifest_digest`;
- `owner_route`;
- `allowed_language`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no package mutation, no install-ready claim, no readiness claims.
