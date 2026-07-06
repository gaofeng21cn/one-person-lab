---
name: opl-completion-audit-writer
description: "Use when writing or reviewing OPL Plan Completion Audit reports for full-plan, all-the-way, closeout, or completion claims. Helps map plan items to done/partial/not_started/blocked status, evidence class, gaps, next owner, and forbidden readiness or authority claims."
---

# OPL Completion Audit Writer

Use this skill to prepare a source-only Plan Completion Audit. The audit should test the user's original goal, accepted plan, work order, or committed runbook against fresh evidence; it must not redefine the plan around what was completed.

## Boundary

- Treat owner receipts, typed blockers, domain truth, artifact authority, runtime queues, release authority, and production readiness as owned by their real surfaces.
- Use this skill only to organize evidence, classify completion, identify gaps, and route next ownership.
- Do not write owner receipts, typed blockers, domain truth, artifact authority, runtime queues, readiness claims, release claims, or production claims.
- Do not turn docs, clean diffs, tests, candidate packets, read models, or refs-only evidence into owner acceptance or runtime readiness.

## Workflow

1. Identify the audit basis: latest user goal, original plan, accepted work order, runbook, contract, or lane objective.
2. Preserve the basis as the checklist. Do not replace it with the actual diff or a narrower summary.
3. For each item, assign one status:
   - `done`: the item has matching fresh evidence for the claim being made.
   - `partial`: some required work or evidence exists, but the item is not fully covered.
   - `not_started`: no meaningful item-specific delta is present.
   - `blocked`: a named owner, input, permission, source, or authority surface is required before it can move.
4. Match evidence class to claim class:
   - source or docs evidence for source-only changes;
   - command/test/build output for local implementation claims;
   - runtime/readback refs for runtime truth;
   - owner receipts or decisions for owner acceptance;
   - release authority for release or production claims.
5. For every `partial`, `not_started`, or `blocked` item, name the gap, next owner, legal next action, and verification that would move it.
6. Keep percentages conservative. Use `100%` only when evidence fully covers the item at its required claim level.

## Output Shape

Return:

- `audit_basis`: refs or plan text used as the checklist;
- `completion_table`: item, status, percent, fresh evidence, gap, next owner, next action;
- `forbidden_claims`: any readiness, release, production, owner acceptance, artifact authority, typed blocker, domain truth, or runtime queue claim not proven;
- `residual_risk`: evidence that could not be inspected or claims requiring another owner.
