---
name: opl-pack-capability-reviewer
description: "Use when reviewing OPL declarative packs, capability ABI, authority ABI, tool affordance, generated or hosted surface inputs, and whether professional methods, rubrics, or playbooks are being wrongly hardcoded. Helps prepare concise pack review findings while keeping pack compiler, schema, validator, and program source as authority."
---

# OPL Pack Capability Reviewer

Use this skill to review an OPL declarative pack or proposed pack delta. Keep the review source-only and refs-only: inspect the declared pack shape, identify boundary defects, and route fixes to the owning program surface.

## Boundary

- Treat pack compiler, schema, validator, and program source as program authority.
- Treat this skill as the AI review layer for capability design, ABI boundaries, surface inputs, and method-placement judgment.
- Keep professional method, rubric, playbook, critique, and routing logic in the appropriate Skill, stage prompt, or owner playbook unless the compiler/schema needs a stable lower-bound field.
- Do not write or sign owner receipts, typed blockers, domain truth, artifact authority, runtime queues, quality verdicts, or readiness claims.
- Do not treat a valid pack, generated surface, hosted surface, descriptor, or review note as owner acceptance, domain ready, runtime ready, release ready, or artifact authority.

## Workflow / Checklist

1. Identify the pack, owning program, capability refs, authority refs, tool affordance refs, generated or hosted surface inputs, and validation evidence available.
2. Separate stable declarative contract from AI method:
   - Put identity, refs, ABI fields, allowed writes, forbidden writes, and required evidence lower bounds in the pack/schema.
   - Keep domain reasoning, professional methods, rubrics, playbooks, prompt strategy, and reviewer heuristics out of compiler-owned fields unless they are only refs to owner material.
3. Review capability ABI:
   - inputs and outputs are explicit refs rather than hidden prose assumptions;
   - required and optional fields have clear owner and lifecycle;
   - generated/hosted surfaces receive enough source refs without becoming a second truth source.
4. Review authority ABI:
   - mutation, receipt, blocker, artifact, and owner-decision surfaces route to the named owner;
   - no pack field implies permission to write owner truth or sign acceptance;
   - no fallback path silently bypasses the authority owner.
5. Review tool affordance:
   - each tool/card/action names what it can read, write, request, or only reference;
   - side effects are represented as requested owner actions or receipt candidates, not completed owner acts;
   - connector or hosted output is treated as candidate refs until consumed by authority.
6. Classify findings as `schema_gap`, `capability_abi_gap`, `authority_abi_gap`, `tool_affordance_gap`, `method_hardcode_gap`, `surface_input_gap`, or `no_issue_found`.
7. Recommend the smallest route: pack field fix, schema/validator fix, source ref fix, Skill/prompt/playbook move, owner route clarification, or no change.

## Output Shape

Return:

- `review_target`: pack, program, and source refs inspected;
- `finding_class`: one or more classes with evidence refs;
- `root_cause`: concise explanation of the boundary problem or why none was found;
- `recommended_delta`: smallest pack/schema/validator/source or Skill-route change;
- `authority_boundary`: explicit no-authority caveat covering owner receipts, typed blockers, domain truth, artifact authority, and readiness claims;
- `verification`: validator, schema check, or review command/ref the owning program should rerun.
