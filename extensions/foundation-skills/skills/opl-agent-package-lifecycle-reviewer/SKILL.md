---
name: opl-agent-package-lifecycle-reviewer
description: "Use when reviewing OPL agent package trust plus lifecycle: manifest digest, provenance, dependency refs, carrier exposure, install/update/repair/rollback, dirty/developer/manual-required states, Codex reload proof, and owner routing."
---

# OPL Agent Package Lifecycle Reviewer

## Boundary

Use this skill to review package trust and lifecycle evidence together. This is the single OPL foundation reviewer for agent package manifest trust, provenance, carrier exposure, install/update/repair/rollback evidence, and Codex surface reload routing.

This skill may:

- inspect package manifest digest, provenance refs, dependency refs, carrier exposure, registry wording, install/update/repair/rollback refs, Settings action receipts, dirty checkout status, developer profile status, manual-required states, Codex surface reload proof, and lifecycle owner routes;
- classify `manifest_digest_gap`, `provenance_gap`, `dependency_ref_gap`, `carrier_exposure_gap`, `trust_wording_overclaim`, `install_receipt_gap`, `update_receipt_gap`, `repair_gap`, `rollback_gap`, `dirty_checkout_hold`, `developer_profile_hold`, `manual_required`, `codex_reload_gap`, or `owner_route_gap`;
- prepare a lifecycle review for Pack, Connect, Settings Control Center, Codex surface owner, or the package owner.

This skill must not:

- install, update, repair, roll back, mutate package state, refresh registries, reload Codex surfaces, create owner receipts, create typed blockers, or accept package trust;
- declare trust accepted, package install-ready, App release ready, domain ready, production ready, or owner accepted;
- treat a lifecycle action receipt, local smoke, docs, or AI review as package trust or release authority.

No-authority language: no owner receipts, no typed blockers, no package mutation, no trust verdict, no Codex reload execution, no install-ready claim, no readiness claims.

## Legacy Coverage

This consolidated reviewer covers the retired `opl-agent-package-trust-reviewer` entry. Keep trust, provenance, carrier exposure, lifecycle receipts, and Codex reload proof together here instead of restoring a separate trust metadata entry.

## AI-first / Contract-light Semantics

- Use package contracts and modules only for manifest identity, dependency refs, exposure policy, lifecycle receipts, rollback refs, recovery, and verification.
- Keep elastic lifecycle review in this Skill: separate trust from lifecycle action evidence, interpret dirty/developer/manual-required states, and route owner questions.
- If lifecycle proof is stale or missing, hold or route back instead of treating receipts, local smoke, or AI review as install-ready authority.

## Workflow

1. Identify package id, manifest ref, digest, source/provenance refs, dependency refs, carrier exposure, action type, action receipt, issue status, Codex reload proof, lifecycle owner, and trust owner.
2. Separate package trust evidence from lifecycle action evidence; neither substitutes for the other.
3. Check dirty/developer/manual-required states before accepting install/update/repair/rollback wording.
4. Confirm whether Codex surface reload is proved, pending, stale, or routed to the proper owner.
5. Route the smallest legal next action to Pack, Connect, Settings, Codex surface owner, package owner, or trust owner.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `lifecycle_assessment`;
- `trust_assessment`;
- `issue_status`;
- `codex_reload_proof`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no package mutation, no trust verdict, no install-ready claim, no readiness claims.
