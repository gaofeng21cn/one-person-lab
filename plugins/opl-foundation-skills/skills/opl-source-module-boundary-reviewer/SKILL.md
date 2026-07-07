---
name: opl-source-module-boundary-reviewer
description: "Use when reviewing OPL source-module boundaries, public entrypoints, dependency direction, forbidden imports, owner alignment, source placement, shell/upstream capability intake, and domain private-tail retirement routes without changing source truth."
---

# OPL Source Module Boundary Reviewer

## Boundary

Use this skill to review whether source belongs in the right OPL module, respects public entrypoint and dependency policy, and should be retained, absorbed, redirected, tombstoned, or deleted through the correct owner route.

This skill may:

- inspect source-module boundary notes, import maps, module owner claims, public entrypoint use, dependency direction, upstream shell capability intake, and domain private scheduler/queue/session/workbench/status/update tail routes;
- classify `wrong_owner_module`, `deep_import`, `forbidden_dependency`, `public_entrypoint_gap`, `module_boundary_ambiguous`, `upstream_intake_route_gap`, `private_tail_retirement_gap`, or `delete_authority_gap`;
- write a route-back review describing the smallest source move, delete, or dependency correction to consider.

This skill must not:

- mutate source, contracts, queues, runtime/provider/domain truth, owner receipts, typed blockers, delete source, or readiness claims;
- approve source-module readiness, production readiness, or release readiness;
- create a second source-module truth outside the owning contract, source, and validation surfaces.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no source-module mutation, no readiness claims.

## Workflow

1. Identify the module owner being claimed and the caller/import path under review.
2. Check public entrypoint use before deep implementation imports.
3. Compare dependency direction against the owning policy or source-module map.
4. For upstream intake, classify `accept`, `adapt`, `redirect`, `reject`, or `requires_contract` without letting shell code own OPL truth.
5. For private-tail retirement, classify `retain`, `absorb`, `delete_candidate`, `tombstone`, or `owner_blocker`; physical delete still requires the owning source/runtime surface.
6. Separate a reviewer recommendation from a source change.
7. Route the finding to the module owner with the smallest correction and verification surface.

## Legacy Coverage

This reviewer covers the retired `opl-domain-private-tail-retirement-reviewer` and `opl-shell-upstream-intake-reviewer` entries. Private-tail retirement and shell/upstream intake are source-module ownership questions, not separate always-visible skill metadata.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `source_module_boundary_findings`;
- `owner_module`;
- `smallest_correction`;
- `verification_surface`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no source-module mutation, no runtime truth, no readiness claims.
