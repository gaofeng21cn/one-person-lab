---
name: opl-runtime-task-awareness-reviewer
description: "Use when reviewing OPL Runtime page, current task, and user-task-status UX for owner-delta-first display, diagnostic demotion, and action visibility without taking runtime or domain authority."
---

# OPL Runtime Task Awareness Reviewer

## Boundary

Use this skill to review runtime and current-task UX projections before App or shell owners change the display or action language.

This skill may:

- inspect App runtime bridge refs, user-task-status projections, current-owner-delta slices, task awareness refs, action catalogs, screenshots, and shell copy;
- classify `owner_delta_missing`, `provider_diagnostic_frontloaded`, `ledger_detail_frontloaded`, `action_visibility_overreach`, `currentness_overclaim`, or `domain_authority_leak`;
- prepare a concise reviewer note that keeps user-facing task awareness separate from provider, ledger, and diagnostic detail.

This skill must not:

- execute actions, mutate runtime queues, provider attempts, ledgers, domain truth, artifact bodies, owner receipts, typed blockers, or App state;
- declare runtime ready, provider ready, domain ready, App release ready, current, live, or production ready;
- treat provider completion, ledger detail, raw drilldown, screenshots, tests, or AI review as runtime or domain truth.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no provider attempts, no domain truth, no artifact authority, no action execution claim, no readiness claims.

## Workflow

1. Identify the Runtime page or current-task surface, projection refs, action refs, and claimed user state.
2. Check that the first screen answers `next_safe_action_or_none`, current owner, required delta, accepted return shape, readiness false flags, and count summary.
3. Verify provider readiness, ledger detail, raw drilldown, and internal diagnostics are secondary or on-demand.
4. Check action visibility: show only App action refs or dry-run/receipt previews that the projection permits.
5. Flag any UI that turns provider/ledger/internal state into user-visible task count, domain progress, owner receipt, typed blocker, currentness, or readiness.
6. Recommend the smallest display, wording, drilldown, or owner-route delta.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `owner_delta_fit`;
- `diagnostic_ordering`;
- `action_visibility`;
- `overclaim_risk`;
- `recommended_delta`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime truth, no provider attempts, no domain truth, no artifact authority, no action execution claim, no readiness claims.
