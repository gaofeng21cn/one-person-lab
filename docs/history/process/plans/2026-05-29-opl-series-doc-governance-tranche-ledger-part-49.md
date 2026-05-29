# OPL series docs governance tranche ledger part 49

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_49`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 convergence-governance support reference、shared release contract、consumer pin truth、App release oracle、domain production release oracle、domain truth、artifact authority、quality verdict、owner receipt、physical-delete authorization 或 production readiness oracle。当前 truth 回到核心五件套、`contracts/family-release/shared-owner-release.json`、source、tests、fresh `npm run family:shared-release -- check`、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App/workbench projection 和真实 evidence。
Date: `2026-05-29`

## Scope

本轮继续处理 `docs/references/convergence-governance/**` 中剩余 fixed-date currentness 污染：

- `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`
- `docs/references/convergence-governance/series-doc-intake-template.md`
- `docs/references/convergence-governance/family-shared-release-maintenance.md`
- process ledger index

目标是让文档生命周期 playbook、series intake template 和 shared release maintenance reference 不再把 2026-05-28 读法、consumer pin 快照或单轮 fail-closed/counter 状态写成长效 support truth。动态 alignment、read-model 和 fail-closed 结果必须来自本轮 fresh command 或 runtime ledger，并进入 process ledger。

## Fresh Evidence

本轮 live evidence：

- `contracts/family-release/shared-owner-release.json`
  - contract kind: `family_shared_owner_release.v1`
  - owner repo: `one-person-lab`
  - owner commit: `c5d4a93bd4bb64adf1228ecf7f2a9038c7dce278`
  - consumers: `medautoscience`、`medautogrant`、`redcube`
  - target files: MAS/MAG `pyproject.toml` and `uv.lock`; RCA `packages/redcube-domain-entry/package.json` and `package-lock.json`
- `npm run family:shared-release -- check`
  - exited `1`, meaning current shared-release state is `drift_attention`, not closeout.
  - `medautoscience` remains stale in `/Users/gaofeng/workspace/med-autoscience`:
    - `pyproject.toml`: stale pin `e3fd0b6be41e858958d42ea400a3e63c4205ff8a`
    - `uv.lock`: stale pin `e3fd0b6be41e858958d42ea400a3e63c4205ff8a`
  - `medautogrant` remains aligned to `c5d4a93bd4bb64adf1228ecf7f2a9038c7dce278`.
  - `redcube` remains aligned to `c5d4a93bd4bb64adf1228ecf7f2a9038c7dce278`.
- `scripts/family-shared-release.mjs`
  - `check` inspects the declared contract consumers and target files.
  - `release` refuses owner commits that are not reachable from shared package remotes before rewriting contract or consumer pins.
- `tests/src/family-shared-release-discipline.test.ts`
  - covers contract shape, consumer repo count, tracked pin rewrite, explicit repo override sync/check behavior, and unpublished owner commit rejection.

## Changes

- `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`
  - Removed the fixed `Date: 2026-05-28` metadata line.
  - Replaced the dated read-model paragraph with a currentness policy.
- `docs/references/convergence-governance/series-doc-intake-template.md`
  - Replaced the dated family coverage read with a currentness policy.
  - Kept the owner/read-model/receipt/typed-blocker/non-authority boundary guidance.
- `docs/references/convergence-governance/family-shared-release-maintenance.md`
  - Replaced the dated currentness paragraph with a shared-release currentness policy.
  - Removed fixed `latest audited alignment` prose from the long-lived reference body.
  - Repointed dynamic owner commit / package locator / consumer alignment truth to the contract and live check command.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-49.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 49 index row.

No source, machine-readable contracts, tests, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/project.md`
- `docs/status.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`
- `docs/references/convergence-governance/series-doc-intake-template.md`
- `docs/references/convergence-governance/family-shared-release-maintenance.md`
- `docs/references/convergence-governance/README.md`
- `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
- `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`
- `contracts/family-release/shared-owner-release.json`
- `scripts/family-shared-release.mjs`
- `tests/src/family-shared-release-discipline.test.ts`
- fresh `npm run family:shared-release -- check`

Edited:

- `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`
- `docs/references/convergence-governance/series-doc-intake-template.md`
- `docs/references/convergence-governance/family-shared-release-maintenance.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-49.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, workflows, App release files, shell files or tests were archived, tombstoned or deleted in this tranche.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `97535a3a` before part49 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part49-convergence-support-currentness`.
- Branch: `codex/opl-doc-governance-20260529-part49-convergence-support-currentness`, based on root `main`.

## Remaining stale / retire candidates

- Continue scanning `docs/references/convergence-governance/*` after part49 for any remaining fixed-date counters, old fail-closed notes or reference-layer currentness overclaims.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Verification

Fresh verification before absorb:

- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md .github`.
- Stale convergence-governance scan returned no matches for retired fixed-date shared-release/read-model wording.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- `npm run family:shared-release -- check` exited `1`, confirming current `drift_attention`: MAS stale, MAG/RCA aligned.
- Focused shared-release / verification-surface tests passed: `node --experimental-strip-types --test tests/src/family-shared-release.test.ts tests/src/family-shared-release-discipline.test.ts tests/src/verification-command-surfaces.test.ts` reported `tests 33`, `pass 33`, `fail 0`.

## Next tranche write scope

- Prefer another small specs, runtime/product, public-doc or current-support currentness tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc / contract / focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
