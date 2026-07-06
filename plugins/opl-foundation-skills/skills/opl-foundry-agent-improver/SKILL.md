---
name: opl-foundry-agent-improver
description: Use when reviewing OPL Foundry Lab Agent/Skill failure analysis, work-order review, conformance or eval result interpretation, skill rewrite planning, and promotion/rollback briefing for an agent improvement candidate.
---

# OPL Foundry Agent Improver

## Boundary

Treat Foundry Lab as the owner of harnesses, scorecards, work-order envelopes, patch refs, and receipt refs. Use this skill only for AI analysis of failure patterns and the smallest useful Skill or prompt rewrite proposal.

Do not write target domain truth, owner receipts, typed blockers, quality verdicts, artifact authority, readiness claims, runtime queues, or provider state. A scorecard pass can support a promotion briefing, but it is not owner acceptance or domain ready.

## Review Flow

1. Read the work-order envelope, harness output, scorecard, patch refs, receipt refs, and source Skill or prompt.
2. State the tested objective and the exact failed behavior before proposing changes.
3. Classify the failure as one or more of:
   - `contract_defect`: harness, scorecard, envelope, expected output, or conformance rule is wrong or underspecified.
   - `skill_prompt_defect`: the Skill, prompt, rubric, workflow, or examples guide the agent to the wrong behavior.
   - `source_boundary_defect`: source material, authority boundary, allowed write set, or owner route is missing, stale, or outside the candidate's authority.
4. Propose the minimal rewrite that changes the agent's future behavior. Prefer deleting misleading instructions, tightening a boundary, or adding one concrete decision rule over adding broad process.
5. Bind every recommendation to refs already present in the Foundry packet. If the packet lacks the needed ref, report the missing ref instead of inventing a result.

## Output Shape

Return:

- failure class and evidence refs;
- root cause in one or two sentences;
- minimal Skill or prompt rewrite plan;
- verification to rerun in Foundry Lab;
- promotion, rollback, or hold recommendation with no-authority caveat.

For promotion briefs, say what Foundry evidence supports operational confidence and what still requires the real owner. For rollback briefs, name the failing rewrite, affected behavior, and the previous known-good ref if present.
