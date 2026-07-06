---
name: opl-workspace-handoff-writer
description: "Use when writing or reviewing OPL Workspace handoff packets, source refs, artifact refs, workspace briefings, missing-input route-back notes, and owner-route packets while keeping locator, path, and artifact-unit truth in Workspace or program-owned surfaces."
---

# OPL Workspace Handoff Writer

## Boundary

- Treat OPL Workspace and the owning program surface as the authority for locators, paths, artifact units, source refs, workspace state, and owner routes.
- Use this skill only to read, organize, explain, and package existing refs for a handoff or route-back.
- Do not invent, mutate, normalize, or relocate source/artifact truth.
- Do not write owner receipts, typed blockers, domain truth, artifact authority, runtime queues, provider state, or readiness claims.
- If the needed locator, artifact unit, source ref, or owner route is missing, prepare a route-back packet instead of guessing.

## Workflow

1. Identify the handoff kind: `workspace_briefing`, `source_artifact_handoff`, `missing_input_route_back`, `owner_route_packet`, or `review_only`.
2. Read the smallest authoritative Workspace/program refs available for:
   - workspace or program id;
   - source refs and artifact refs;
   - artifact unit identity and location;
   - current owner route and expected consumer;
   - allowed and forbidden write surfaces.
3. Separate facts from AI interpretation. Keep exact locators and artifact refs as copied refs; summarize only their role and relevance.
4. Check for missing inputs before writing the packet: absent ref, ambiguous path, stale source, mismatched owner, unowned artifact unit, or forbidden authority surface.
5. For missing inputs, produce a route-back with the owner, missing ref, why it blocks handoff, and the smallest legal next action.
6. For a valid handoff, write a concise packet that lets the next owner find the source and artifact without treating this skill as the source of truth.

## Output Shape

Return:

- `handoff_kind`;
- `workspace_or_program_ref`;
- `source_refs` and `artifact_refs`;
- `artifact_units`;
- `owner_route`;
- `briefing`: what the next owner needs to know;
- `missing_inputs`: exact gaps, or `none`;
- `forbidden_claims`: no owner receipts, no typed blockers, no domain truth, no artifact authority, no readiness claims.
