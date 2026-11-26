---
name: opl-workspace-handoff-writer
description: "Use when writing or reviewing OPL Workspace handoff packets, source-readiness audit sections, source refs, artifact refs, workspace briefings, missing-input route-back notes, and owner-route packets while keeping locator, path, artifact-unit, and source-readiness truth in Workspace or program-owned surfaces."
---

# OPL Workspace Handoff Writer

Use this skill for workspace handoff packets and for the retired `opl-workspace-source-readiness-auditor` capability as a `source_readiness_audit` mode/section. Keep the work source-only: read authoritative refs, identify gaps, and prepare the smallest handoff, route-back, or audit brief.

## Boundary

- Treat OPL Workspace and the owning program surface as the authority for locators, paths, artifact units, source refs, workspace state, and owner routes.
- Use this skill only to read, organize, explain, and package existing refs for a handoff or route-back.
- Do not invent, mutate, normalize, or relocate source/artifact truth.
- Do not write owner receipts, typed blockers, domain truth, artifact authority, runtime queues, provider state, or readiness claims.
- A clean source-readiness audit section is not owner acceptance, source readiness, runtime readiness, or domain truth.
- If the needed locator, artifact unit, source ref, or owner route is missing, prepare a route-back packet instead of guessing.

Optional helper: `kernel.py` provides stdlib-only deterministic workspace/source-ref normalization, audit skeleton/checklist builders, and authority-phrase linting. It is local support only: no file/network/subprocess use and no owner receipt, typed blocker, source mutation, runtime queue, or readiness authority.

## Workflow

1. Identify the handoff kind: `workspace_briefing`, `source_artifact_handoff`, `source_readiness_audit`, `missing_input_route_back`, `owner_route_packet`, or `review_only`.
2. Read the smallest authoritative Workspace/program refs available for:
   - workspace or program id;
   - source refs and artifact refs;
   - artifact unit identity and location;
   - freshness signals when auditing source readiness;
   - current owner route and expected consumer;
   - allowed and forbidden write surfaces.
3. Separate facts from AI interpretation. Keep exact locators and artifact refs as copied refs; summarize only their role and relevance.
4. Check for missing inputs before writing the packet: absent ref, ambiguous path, stale source, mismatched owner, unowned artifact unit, freshness unproven, owner-route gap, or forbidden authority surface.
5. For missing inputs, produce a route-back with the owner, missing ref, why it blocks handoff, and the smallest legal next action.
6. For `source_readiness_audit`, classify findings as `missing_source_ref`, `ambiguous_locator`, `artifact_unit_gap`, `freshness_unproven`, `owner_route_gap`, `forbidden_authority`, or `no_issue_found`.
7. For a valid handoff, write a concise packet that lets the next owner find the source and artifact without treating this skill as the source of truth.

## Output Shape

Return:

- `handoff_kind`;
- `workspace_or_program_ref`;
- `consumer`, when auditing source readiness;
- `source_refs` and `artifact_refs`;
- `artifact_units`;
- `owner_route`;
- `source_readiness_audit`: finding class with evidence refs, or `none`;
- `briefing`: what the next owner needs to know;
- `missing_inputs`: exact gaps, or `none`;
- `forbidden_claims`: no owner receipts, no typed blockers, no domain truth, no artifact authority, no source readiness claim, no readiness claims.
