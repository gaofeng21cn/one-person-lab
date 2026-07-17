---
name: opl-stagecraft-stage-designer
description: "Design OPL Stagecraft support for stage goal, prompt shaping, rubric, capability-use decisions, route-back reasoning, handoff, and receipt/blocker lower-bound design. Use when authoring or reviewing an OPL stage strategy or stage prompt wrapper while keeping Stagecraft contracts limited to descriptors, allowed/forbidden surfaces, and no-authority receipt/blocker lower bounds."
---

# OPL Stagecraft Stage Designer

Use this skill to design the AI-executed strategy around an OPL stage. Keep the split strict: Stagecraft contract defines auditable boundaries; this skill shapes the open-ended stage work.

## Boundary

Stagecraft contract may declare only:

- stage descriptor: identity, goal, inputs, outputs, owner route, and stage prompt refs;
- allowed and forbidden surfaces: what the executor may read, write, mutate, or only reference;
- receipt/blocker lower bound: minimum refs, evidence shape, handoff fields, and no-authority flags.

This skill may design:

- stage goal framing and prompt structure;
- stage strategy, decomposition, and route-back reasoning;
- rubric and review checklist;
- capability or tool use decision rules;
- handoff packet shape and receipt/blocker candidate lower bound.

This skill must not sign domain owner receipts, create typed blockers, issue quality verdicts, mutate artifact authority, write runtime queues, or claim domain/runtime/readiness status.

Optional helper: `kernel.py` provides stdlib-only deterministic stage-ref normalization, skeleton/checklist builders, and authority-phrase linting. It is local support only: no file/network/subprocess use and no owner receipt, typed blocker, readiness, runtime, or domain-truth authority.

## Workflow

1. Identify the owning stage, domain owner, intended executor, source refs, writable surfaces, and forbidden authority surfaces.
2. Separate contract lower bounds from AI strategy. Put stable identity, surface permissions, and minimum evidence fields in the Stagecraft descriptor; keep planning, critique, and routing methods in the skill/prompt layer.
3. Shape the prompt around the stage's real job:
   - goal and non-goals;
   - required inputs and expected output refs;
   - allowed capability/tool refs and when to use each;
   - evaluation rubric and route-back triggers;
   - handoff format with evidence refs, candidate refs, and no-authority notes.
4. Check the authority boundary before closeout: any owner receipt, typed blocker, human gate, quality verdict, artifact mutation, runtime queue write, or readiness claim must route to the owning surface instead of this skill.
5. Return the smallest useful stage design: descriptor fields, prompt outline, rubric, capability-use policy, handoff/receipt lower bound, and unresolved owner decisions.

## Output Contract

For each design, provide:

- `stage_descriptor_delta`: stable descriptor fields or refs to add/update;
- `prompt_strategy`: concise stage prompt outline and execution guidance;
- `rubric`: criteria for candidate quality and route-back;
- `capability_use_policy`: when to use, skip, or route a capability/tool;
- `handoff_lower_bound`: required refs for candidate artifact, evidence, owner route, receipt candidate, or blocker candidate;
- `authority_boundary`: explicit forbidden claims and owner surfaces that must consume the candidate.
