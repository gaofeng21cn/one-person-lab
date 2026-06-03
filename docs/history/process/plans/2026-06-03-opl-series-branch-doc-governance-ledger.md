# OPL Series Branch And Doc Governance Ledger

Owner: `One Person Lab`
Purpose: `automation_2_branch_doc_governance_ledger`
State: `history_only`
Machine boundary: 本文只记录 2026-06-03 automation-2 单轮分支/worktree 保洁与 docs-governance tranche。机器 truth 继续归各 repo 的 git state、source、contracts、tests、CLI/read-model、runtime ledgers、GitHub remote/PR state 和验证输出。

## Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-04T04:38:02+0800`.
- Governed scope: `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`.
- Final root `main` state after fetch/fast-forward/rebase:
  - `one-person-lab`: `main@d4403336`, aligned with `origin/main` before this ledger correction.
  - `med-autoscience`: `main@3b45de31`, clean and aligned with `origin/main`; MAS docs-only active-baton commit was pushed before final closeout.
  - `med-autogrant`: `main@487a1ec`, clean and aligned with `origin/main`; MAG docs-only active-baton commit was pushed before final closeout.
  - `redcube-ai`: `main@376a2bfc`, clean and aligned with `origin/main`; RCA docs-only active-baton commit was pushed before final closeout.
  - `opl-meta-agent`: `main@bfa1f3c`, clean and aligned with `origin/main`.
  - `one-person-lab-app`: `main@940a182`, clean and aligned with `origin/main`.
- Open PR check returned no open PRs for the inspected stale/active lane heads.

## Branch And Worktree Hygiene

Deleted one safe stale remote branch:

- `one-person-lab` `origin/codex/package-distribution-prepared-only-integration-20260602`
  - codex-named remote branch.
  - no open PR.
  - `git rev-list --right-only --cherry-pick --count main...origin/codex/package-distribution-prepared-only-integration-20260602` returned `0`.
  - deleted with `git push origin --delete codex/package-distribution-prepared-only-integration-20260602` and fetch/prune verified it was gone.

Retained remote branch candidates:

| Repo | Branch | Evidence | Reason retained |
| --- | --- | --- | --- |
| `one-person-lab` | `origin/fix/opl-temporal-worker-stale-repair-20260528` | `right_only_cherry_pick_count=0`, branch contains older runtime repair history | Non-codex/non-automation branch; no open PR but not proven safe to delete remotely under this automation's remote-owner rule. |
| `one-person-lab` | `origin/fix/progress-first-anti-spin-20260602` | `right_only_cherry_pick_count=0`, branch contains older progress-first runtime history | Non-codex/non-automation branch; no open PR but not proven safe to delete remotely. |
| `med-autoscience` | `origin/fix/progress-first-running-provider-suppression-20260602` | `right_only_cherry_pick_count=0`, branch contains older progress-first history | Non-codex/non-automation branch; no open PR but not proven safe to delete remotely. |
| `med-autogrant` | `origin/feature/ai-narration-contracts` | `right_only_cherry_pick_count=1` | Still has branch-only semantic content; must not delete or absorb without semantic review. |
| `one-person-lab-app` | `origin/codex/full-first-run-stable-gate-20260525` | `right_only_cherry_pick_count=3` | Codex-named but still has branch-only content; not proven superseded. |

Deleted safe local worktrees/branches:

| Repo | Worktree / branch | Evidence | Action |
| --- | --- | --- | --- |
| `one-person-lab` | `.worktrees/opl-stale-cleanup-20260603` / `opl-stale-cleanup-20260603` | Clean, no right-only commit after refreshed `main`, branch was contained by `main`, and no open PR was found. | Removed worktree and deleted local branch; no remote branch was deleted. |
| `one-person-lab-app` | `.worktrees/github-ci-20260603-app-nightly-evidence` / `fix/github-ci-20260603-app-nightly-evidence` | Clean, `HEAD@940a182` matched root `main` / `origin/main`, branch was contained by `main`, and no open PR was found. | Removed worktree and deleted local branch; no remote branch was deleted. |

Retained local worktrees/branches:

| Repo | Worktree / branch | Current evidence | Reason retained |
| --- | --- | --- | --- |
| `med-autoscience` | `.worktrees/github-ci-20260603-mas-ci-preflight` / `fix/github-ci-20260603-mas-ci-preflight` | Clean `HEAD@5ab10ea6`, one right-only commit over `origin/main`: `fix: classify stage pack contracts in CI preflight`; related `scripts/verify.sh ci-preflight` / pytest processes were still running. | Active CI-preflight lane with live processes; deletion prohibited. |
| `med-autogrant` | `.worktrees/mag-stale-cleanup-20260603` / `mag-stale-cleanup-20260603` | Clean `HEAD@b5619bd`, one right-only commit over `origin/main`; semantic content still unreviewed after prior dirty state. | Clean but unmerged and not semantically classified; retain for next-run absorb/supersede review. |
| `redcube-ai` | `.worktrees/github-ci-20260603-rca-ci` / `fix/github-ci-20260603-rca-ci` | Clean `HEAD@34f89066`, one right-only commit over `origin/main`: `fix: align RCA locator model tests`; recent process scan referenced this worktree. | Active CI lane; retain for next-run verification and absorb/supersede review. |

## OPL Doc Governance

Skill path used:

- `/Users/gaofeng/workspace/opl-doc-governance/skills/opl-doc-governance/SKILL.md`
- Canonical skill routed to `/Users/gaofeng/workspace/opl-doc-governance/skills/opl-doc/SKILL.md`
- Doctor fallback: `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`

Doctor preflight after root fast-forward showed active-truth shape drift in OPL, MAS, MAG and RCA:

- OPL `docs/active/current-state-vs-ideal-gap.md` lacked doctor-recognized `当前完成进度` and executable `下一轮 Agent prompt` markers.
- MAS `docs/active/mas-ideal-state-gap-plan.md` lacked doctor-recognized executable `下一轮 Agent prompt` markers.
- MAG `docs/active/mag-ideal-state-cross-repo-gap-plan.md` lacked doctor-recognized `当前完成进度` and executable `下一轮 Agent prompt` markers.
- RCA `docs/active/rca-ideal-state-gap-plan.md` lacked doctor-recognized `当前完成进度` and executable `下一轮 Agent prompt` markers, and had active-path `Hermes-first` vocabulary risk.

Fixes applied:

- `one-person-lab/docs/active/current-state-vs-ideal-gap.md`
  - renamed the active progress section to `当前完成进度`;
  - rewrote `当前 Baton` to `下一轮 Agent prompt`;
  - added explicit `Write scope`、`Non-goals`、`Live truth inputs`、`Required actions`、`Verification commands`、`Completion gate` and `Foldback target`;
  - replaced active-path retired vocabulary lists with compact `retired entry/runtime vocabulary` wording.
- `med-autoscience/docs/active/mas-ideal-state-gap-plan.md`
  - rewrote `近期完善计划` as `下一轮 Agent prompt`;
  - preserved the same MAS owner-delta action sequence while adding the executable prompt fields required by OPL Doc.
- `med-autogrant/docs/active/mag-ideal-state-cross-repo-gap-plan.md`
  - added doctor-recognized current completion progress and executable next-round Agent prompt fields.
- `redcube-ai/docs/active/rca-ideal-state-gap-plan.md`
  - added doctor-recognized current completion progress and executable next-round Agent prompt fields;
  - rewrote active-path `Hermes-first` vocabulary into retained provenance / explicit executor-adapter language.

## Coverage Ledger

This tranche was not a full portfolio coverage closeout. It covered the branch/worktree inventory, the 12 primary references at active-truth shape level, and targeted OPL/MAS active owner repairs. It did not section-audit every README/docs file.

| Repo | README/docs count | Active truth owner | Doctor result | Edited docs |
| --- | ---: | --- | --- | --- |
| `one-person-lab` | `202` | `docs/active/current-state-vs-ideal-gap.md` | pass, missing `0`, next_not_ready `0`, findings `0` | `docs/active/current-state-vs-ideal-gap.md`, this ledger, plans index |
| `med-autoscience` | `262` | `docs/active/mas-ideal-state-gap-plan.md` | pass, missing `0`, next_not_ready `0`, findings `0` | `docs/active/mas-ideal-state-gap-plan.md` |
| `med-autogrant` | `118` | `docs/active/mag-ideal-state-cross-repo-gap-plan.md` | pass, missing `0`, next_not_ready `0`, findings `0` | `docs/active/mag-ideal-state-cross-repo-gap-plan.md` |
| `redcube-ai` | `94` | `docs/active/rca-ideal-state-gap-plan.md` | pass, missing `0`, next_not_ready `0`, findings `0` | `docs/active/rca-ideal-state-gap-plan.md` |
| `opl-meta-agent` | `15` | `docs/active/opl-meta-agent-ideal-state-gap-plan.md` | pass, missing `0`, next_not_ready `0`, findings `0` | none |
| `one-person-lab-app` | `25` | `docs/active/app-ideal-state-gap-plan.md` | pass, missing `0`, next_not_ready `0`, findings `0` | none |

Archived / tombstoned / deleted docs this tranche:

- none. This tranche added a history ledger and updated the history index; no docs were archived, tombstoned, or deleted.

Uncovered docs:

- Full section-by-section coverage remains open for `202 + 262 + 118 + 94 + 15 + 25 = 716` README/docs files, minus the targeted primary active owners and OPL history ledger/index touched above.
- Remaining work must continue repo by repo from each active truth owner and docs portfolio entry rather than treating doctor pass as semantic completion.

Remaining stale / retire candidates:

- `med-autogrant` `origin/feature/ai-narration-contracts`: one branch-only semantic commit remains; requires MAG contract/product-entry/test review before absorb or supersede.
- `one-person-lab-app` `origin/codex/full-first-run-stable-gate-20260525`: three branch-only semantic commits remain; requires App release/guide evidence review before absorb or supersede.
- Local active worktrees listed above must be rechecked next run; OPL and App merged clean lanes were already removed in this tranche.

## Verification

Fresh verification run in this tranche:

- OPL Doc doctor on all six repos:
  - OPL: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
  - MAS: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
  - MAG: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
  - RCA: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
  - OMA: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
  - App: pass, `missing=0`, `next_not_ready=0`, `findings=0`.
- OPL docs-only checks:
  - `rtk git diff --check`
  - `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs`
- MAS docs-only checks:
  - `rtk git diff --check`
  - `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md README.zh-CN.md`
- MAG docs-only checks:
  - `rtk git diff --check`
  - `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md README.zh-CN.md`
- RCA docs-only checks:
  - `rtk git diff --check`
  - `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md`

No source, contract, runtime, release artifact, or domain behavior changed in this tranche, so no repo-native full runtime/test suite was required for the docs-only edits.

## Next-Round Write Scope

1. Re-run six-repo inventory first; these repos were actively moving during this tranche.
2. Reclassify and either absorb or retain the three local worktrees using fresh status, recent-write, process, PR and semantic diff evidence: MAS CI preflight, MAG cleanup, and RCA CI.
3. Review branch-only semantic content in MAG `origin/feature/ai-narration-contracts` and App `origin/codex/full-first-run-stable-gate-20260525`; decide absorb, supersede marker, or explicit retained owner.
4. Continue full README/docs section coverage from active truth owner docs and docs portfolio entries; keep coverage ledger current and avoid treating doctor pass as semantic completion.
5. Keep the global docs-governance `/goal` active until all six repo README/docs portfolios are section-covered and all remaining gaps are closed or carried into the next executable Agent prompt.
