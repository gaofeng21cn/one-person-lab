---
name: opl-workspace-source-readiness-auditor
description: "Use when auditing OPL Workspace source readiness for source refs, locators, artifact units, owner routes, missing-input gaps, freshness evidence, and route-back briefs before a program or stage consumes workspace material."
---

# OPL Workspace Source Readiness Auditor

Use this skill to audit whether OPL Workspace source material is ready for an owner to consume. Keep the work source-only: read authoritative refs, identify gaps, and prepare the smallest route-back or readiness audit brief.

## OPL Owner Boundary

- Treat OPL Workspace and the owning program as authority for source registries, locators, artifact units, workspace state, owner routes, and source readiness truth.
- Treat this Skill as the AI-first audit layer for source coverage, ambiguity, freshness, missing inputs, and route-back wording.
- Do not sign `owner receipts`, create `typed blockers`, mutate source or artifact truth, write runtime queues, or declare `readiness`.
- A clean audit brief is not owner acceptance, source readiness, runtime readiness, or domain truth.

Optional helper: `kernel.py` provides stdlib-only deterministic workspace/source-ref normalization, audit skeleton/checklist builders, and authority-phrase linting. It is local support only: no file/network/subprocess use and no owner receipt, typed blocker, source mutation, runtime queue, or readiness authority.

## Workflow

1. Identify the workspace, program, expected consumer, source refs, artifact refs, and owner route being audited.
2. Read the smallest authoritative Workspace or program refs for locator identity, artifact unit identity, freshness signals, allowed writes, and forbidden authority surfaces.
3. Separate copied refs from AI interpretation. Do not normalize paths, invent source state, or relocate artifacts.
4. Classify findings as `missing_source_ref`, `ambiguous_locator`, `artifact_unit_gap`, `freshness_unproven`, `owner_route_gap`, `forbidden_authority`, or `no_issue_found`.
5. For each gap, write a route-back with the owner, missing evidence, why it blocks consumption, and the smallest legal next action.

## Output Shape

Return:

- `workspace_or_program_ref`;
- `consumer`;
- `source_refs` and `artifact_refs` inspected;
- `finding_class` with evidence refs;
- `route_back`: owner, missing ref, requested action, and expected proof;
- `authority_boundary`: no owner receipts, no typed blockers, no source readiness claim, no runtime/domain readiness claim.
