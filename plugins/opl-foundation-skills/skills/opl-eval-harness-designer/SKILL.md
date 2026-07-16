---
name: opl-eval-harness-designer
description: Design domain-neutral Foundry EvalSpec cases, gates, protected-test requirement categories, failure taxonomies, and EvidenceBundle expectations. Use when creating or reviewing evaluation semantics for an AgentBlueprint without taking over protected tests, execution, qualification, or Owner acceptance.
---

# OPL Eval Harness Designer

## Boundary

Keep three owners distinct:

- OMA owns `EvalSpec` semantics inside an `AgentBlueprint`.
- Target Owner owns protected test bodies, domain acceptance, permissions, and production adoption.
- OPL Evaluation Runtime owns the frozen test plan, isolated execution, independent review, aggregation, and `EvidenceBundle`.

Use this Skill to design observable cases, score gates, protected-test requirement categories, failure taxonomy, and evidence expectations. Do not reveal or synthesize protected test bodies, execute a suite, qualify a candidate, write a version/activation pointer, sign an Owner decision, or claim readiness.

## Workflow

1. Bind the design to target agent/domain identity, objective, acceptance criteria, non-goals, authority boundary, and blueprint behavior.
2. State each behavior under test as an observable outcome, not an implementation preference.
3. Build the smallest useful public case set:
   - `happy_path`: expected successful behavior;
   - `boundary`: permission, authority, memory, artifact, or capability edge;
   - `negative`: forbidden claim, missing source, stale identity, or wrong owner route;
   - `regression`: a known failure or newly diagnosed failure class.
4. Declare protected requirements only as category plus minimum case count. Never include protected prompts, fixtures, expected answers, or individual results in OMA-facing data.
5. Define required gates with metric, operator, threshold, weight/required status, and baseline regression tolerance. Candidate and baseline must use the same frozen plan.
6. Define failure classes that OMA can diagnose from aggregate evidence, such as semantic defect, source/evidence defect, authority overclaim, capability/tool mismatch, safety regression, cost/latency regression, and evaluation-integrity failure.
7. Require an evaluator/reviewer identity independent from the OMA design attempt and evidence refs sufficient to reproduce the verdict inside OPL authority.

## Output

Return:

- public case definitions and weights;
- protected requirement categories and minimum counts;
- gate definitions and baseline comparison policy;
- failure taxonomy and aggregate evidence shape;
- evaluator independence requirements;
- explicit Owner-only decisions and forbidden claims.

The result is an `EvalSpec` design candidate, not a frozen plan, `EvidenceBundle`, qualification, activation, or production verdict.
