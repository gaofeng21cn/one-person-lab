---
name: opl-app-settings-ia-reviewer
description: "Use when reviewing OPL App Settings Control Center IA, ordinary versus secondary/deep-link/advanced routes, user-task entry naming, and whether legacy routes are wrongly returned to ordinary navigation."
---

# OPL App Settings IA Reviewer

## Boundary

Use this skill to review Settings Control Center information architecture before App or shell owners change routes, slots, labels, or page adapters.

This skill may:

- inspect App settings control-plane refs, shell route behavior, page-state matrices, search entries, screenshots, and UX copy;
- classify `ordinary_route_gap`, `secondary_route_promotion`, `legacy_route_resurrection`, `advanced_diagnostics_leak`, `user_task_naming_gap`, or `shell_owned_ia_overclaim`;
- prepare a concise IA review that maps user tasks to ordinary routes and routes diagnostics or legacy surfaces away from normal navigation.

This skill must not:

- change settings registries, route resolvers, shell adapters, runtime state, owner receipts, typed blockers, or release evidence;
- treat shell-local labels, upstream tabs, docs, screenshots, or AI review as App Settings policy;
- promote About, Update, Theme, Local Services, Advanced, legacy runtime/system/model/agent/tools/webui routes, or diagnostics into ordinary navigation unless the App contract owns that change.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no settings policy mutation, no App release-ready claim, no readiness claims.

## Workflow

1. Identify the settings surface, route ids, user task, source refs, and current owner.
2. Classify routes as `ordinary`, `secondary_or_deep_link`, `advanced`, `legacy_redirect`, or `forbidden`.
3. Check ordinary navigation for user-task language and the App-owned route set.
4. Check that legacy routes redirect to App-owned pages and do not reappear as top-level tabs.
5. Check that diagnostics, raw refs, logs, developer profile, and implementation details stay collapsed or secondary.
6. Recommend the smallest legal IA, label, redirect, search, or owner-route delta.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `route_classification`;
- `ordinary_user_task_fit`;
- `legacy_or_advanced_risk`;
- `recommended_delta`;
- `owner_route`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime truth, no settings policy mutation, no App release-ready claim, no readiness claims.
