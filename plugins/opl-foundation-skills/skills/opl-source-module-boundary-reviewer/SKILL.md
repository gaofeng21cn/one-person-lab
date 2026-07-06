---
name: opl-source-module-boundary-reviewer
description: "Use when reviewing OPL source-module boundaries, public entrypoints, dependency direction, forbidden imports, owner alignment, and source placement without changing source truth."
---

# OPL Source Module Boundary Reviewer

## Boundary

Use this skill to review whether source belongs in the right OPL module and respects public entrypoint and dependency policy.

This skill may:

- inspect source-module boundary notes, import maps, module owner claims, public entrypoint use, and dependency direction;
- classify `wrong_owner_module`, `deep_import`, `forbidden_dependency`, `public_entrypoint_gap`, or `module_boundary_ambiguous`;
- write a route-back review describing the smallest source move, delete, or dependency correction to consider.

This skill must not:

- mutate source, contracts, queues, runtime/provider/domain truth, owner receipts, typed blockers, or readiness claims;
- approve source-module readiness, production readiness, or release readiness;
- create a second source-module truth outside the owning contract, source, and validation surfaces.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no source-module mutation, no readiness claims.

## Workflow

1. Identify the module owner being claimed and the caller/import path under review.
2. Check public entrypoint use before deep implementation imports.
3. Compare dependency direction against the owning policy or source-module map.
4. Separate a reviewer recommendation from a source change.
5. Route the finding to the module owner with the smallest correction and verification surface.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `source_module_boundary_findings`;
- `owner_module`;
- `smallest_correction`;
- `verification_surface`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no source-module mutation, no runtime truth, no readiness claims.
