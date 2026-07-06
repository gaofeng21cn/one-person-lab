---
name: opl-eval-harness-designer
description: "Use when designing OPL Foundry Lab eval harnesses, scorecards, task cases, failure taxonomies, promotion/hold evidence, and candidate evaluation packets for agents, skills, prompts, or work orders without claiming owner acceptance or readiness."
---

# OPL Eval Harness Designer

Use this skill to design a source-only Foundry Lab evaluation harness. The output should make agent or Skill behavior testable and reviewable; it does not promote the candidate by itself.

## Boundary

- Treat Foundry Lab or the owning program as authority for harness execution, scorecards, promotion decisions, rollback, and receipt refs.
- Use this skill only to design task cases, score criteria, failure taxonomy, evidence shape, and promotion/hold briefing inputs.
- Do not write owner receipts, typed blockers, domain truth, artifact authority, runtime queues, readiness claims, release claims, production claims, or promotion decisions.
- Do not treat harness pass, scorecard pass, candidate patch, or AI review as owner acceptance, domain readiness, runtime readiness, or release readiness.

## Workflow

1. Identify evaluation target: agent, Skill, prompt, work-order envelope, tool route, or candidate patch.
2. State the behavior under test as observable outcomes, not implementation preference.
3. Build the smallest useful case set:
   - `happy_path`: expected successful behavior;
   - `boundary`: allowed/forbidden write set, authority split, or evidence-class edge;
   - `negative`: forbidden claim, missing source, stale ref, or wrong owner route;
   - `regression`: known failure mode when available.
4. Define the scorecard with pass/hold criteria:
   - required inputs inspected;
   - correct owner and authority boundary;
   - output shape complete;
   - evidence matched to claim class;
   - forbidden claims absent;
   - no unnecessary scope expansion.
5. Classify failures as:
   - `contract_defect`;
   - `case_defect`;
   - `skill_prompt_defect`;
   - `source_boundary_defect`;
   - `evidence_mismatch`;
   - `authority_overclaim`;
   - `executor_behavior_defect`.
6. Define promotion or hold evidence as refs the real owner can inspect: harness command, scorecard result, candidate diff, failure summary, residual risk, and owner route.

## Output Shape

Return:

- `eval_target`;
- `behavior_under_test`;
- `task_cases`;
- `scorecard`;
- `failure_taxonomy`;
- `promotion_or_hold_evidence`;
- `rerun_command_or_owner_ref`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no domain truth, no artifact authority, no runtime queues, no readiness/release/production claims.
