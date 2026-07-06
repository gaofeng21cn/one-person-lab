---
name: opl-app-first-run-ux-reviewer
description: "Use when reviewing OPL App first-run, onboarding, Core ready vs Full/background readiness, skip/defer wording, and whether users are incorrectly blocked before the App is safe to enter."
---

# OPL App First Run UX Reviewer

## Boundary

Use this skill to review first-run and onboarding UX against App-owned first-run policy.

This skill may:

- inspect first-run matrices, initialize output refs, shell copy, screenshots, and onboarding flow notes;
- classify `core_ready_blocked`, `full_readiness_overblock`, `background_maintenance_confusion`, `skip_wording_gap`, `defer_wording_gap`, or `beginner_copy_gap`;
- prepare a concise UX review that separates launch-blocking setup from post-Core readiness and maintenance.

This skill must not:

- mutate first-run state, install tools, run maintenance, sign owner receipts, create typed blockers, write runtime/provider/domain truth, or declare release/readiness;
- treat Full readiness, background maintenance, docs, tests, screenshots, or AI review as proof of packaged App readiness;
- make shell copy the source of first-run truth.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no provider truth, no App release-ready claim, no readiness claims.

## Workflow

1. Identify the first-run surface, audience, package type, initialize refs, and claimed user gate.
2. Separate Core ready / `ready_to_launch` requirements from Full readiness and background maintenance.
3. Check whether the UI blocks only on workspace root, Codex CLI, and usable model access unless the contract says otherwise.
4. Review skip/defer wording for plain user meaning: what is safe now, what continues later, and what action remains.
5. Flag raw technical fields, provider maintenance, Homebrew/CLT/Node/Git/module work, or diagnostics that dominate the beginner primary path.
6. Recommend the smallest copy, IA, or owner-route change needed to stop false blocking or false-ready wording.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `first_run_gate`;
- `core_ready_vs_full_readiness`;
- `wording_findings`;
- `user_blocking_risk`;
- `recommended_delta`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime truth, no provider truth, no App release-ready claim, no readiness claims.
