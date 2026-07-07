---
name: opl-code-quality-remediation-reviewer
description: "Use when reviewing opl quality details --json, Sentrux output, or line-budget sidecars to decide whether code quality remediation is needed, how to make the smallest fix, and when findings stay advisory."
---

# OPL Code Quality Remediation Reviewer

Use this skill to turn `opl quality details --json`, Sentrux output, line-budget sidecars, or related structure findings into an AI-first remediation brief.

## Boundary

This skill may:

- inspect `opl quality details --json`, Sentrux gate/check output, line-budget reports, diffs, source refs, and focused test refs;
- classify findings as `must_fix_regression`, `smallest_refactor`, `test_gap`, `advisory_only`, `baseline_or_rules_gap`, or `not_actionable`;
- recommend the smallest source change, deletion, split, or test/readback needed for the owning lane.

This skill must not:

- create a quality score, Sentrux verdict, CI verdict, release verdict, owner receipt, typed blocker, or readiness claim;
- mutate runtime/provider/domain truth, queues, owner surfaces, quality baselines, or rules;
- treat line budget, Sentrux output, docs, tests, or AI judgment as domain/product readiness.

No-authority language: no owner receipts, no typed blockers, no human gates, no artifact authority, no quality verdict, no runtime mutation, no provider mutation, no readiness claims.

## Workflow

1. Identify the quality sidecar refs, compare ref, changed files, and lane objective.
2. Separate blocking regressions from advisory structure findings.
3. Prefer deletion, reuse, stdlib/native behavior, or the smallest local refactor before adding abstractions.
4. Route baseline/rules/policy questions to the owning quality surface instead of inventing a new score.
5. Recommend focused verification tied to the changed file or command.

## Output Shape

Return:

- `quality_refs`;
- `finding_class`;
- `affected_files`;
- `must_fix_now`: yes/no with reason;
- `smallest_remediation`;
- `advisory_or_owner_route`;
- `verification_command`;
- `no_authority_caveat`: no quality score, no Sentrux verdict, no CI/release/readiness claim, no owner receipts, no typed blockers.
