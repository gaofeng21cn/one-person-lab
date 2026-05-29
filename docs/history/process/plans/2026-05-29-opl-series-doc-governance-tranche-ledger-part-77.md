# OPL series docs governance tranche ledger part 77

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_77`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 stage admission contract、stage attempt ledger contract、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、provider readiness oracle 或 production readiness oracle。当前 truth 回到 `src/family-runtime-stage-admission-gate.ts`, `src/family-runtime-stage-attempt-ledger.ts`, retained stage launch / closeout public surfaces、focused family-runtime stage tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 stage launch admission gate 和 stage attempt closeout ledger 的过时公共导出面：

- `src/family-runtime-stage-admission-gate.ts`
- `src/family-runtime-stage-attempt-ledger.ts`
- process ledger index

目标是收回 fallow 标出的 helper exports，同时保持当前 public stage launch gate 和 closeout ledger read surfaces 不变：

- 将 `buildStageAdmissionLaunchGateFromReview` 从 public export 收回为 module-private builder。
- 将 `stageAttemptCloseoutToPayload` 从 public export 收回为 module-private mapper。
- 保留 `buildStageAdmissionLaunchGate`, `StageAdmissionLaunchGateInput`, `StageAdmissionLaunchGateResult`, `createStageAttemptTable`, `stageAttemptToPayload`, `stageAttemptSignalToPayload`, `listStageAttemptCloseouts`, `latestStageAttemptCloseoutPacketsByAttempt`, `listStageAttempts`, `listStageAttemptRows`, `inspectStageAttemptPayload` and related retained stage attempt public surfaces unchanged.

本轮不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production`
  - before part77, `unused_exports=114` and `unused_types=27`.
  - target unused exports were `buildStageAdmissionLaunchGateFromReview` and `stageAttemptCloseoutToPayload`.
- `rg -n "buildStageAdmissionLaunchGateFromReview|stageAttemptCloseoutToPayload" . --glob '!node_modules/**' --glob '!dist/**'`
  - showed `buildStageAdmissionLaunchGateFromReview` appears only in `src/family-runtime-stage-admission-gate.ts` and is called by same-file retained public `buildStageAdmissionLaunchGate`.
  - showed `stageAttemptCloseoutToPayload` appears only in `src/family-runtime-stage-attempt-ledger.ts` and is called by same-file retained public `listStageAttemptCloseouts`.
- CodeGraph context for the closeout ledger surfaced `listStageAttemptCloseouts` as the retained public entry and `stageAttemptCloseoutToPayload` as the same-file mapper behind it.
- Focused source/test read:
  - `src/family-runtime.ts` and `src/family-runtime-provider-hosted-attempts.ts` consume retained `buildStageAdmissionLaunchGate`.
  - `src/family-runtime-stage-attempts.ts`, `src/family-runtime-stage-attempt-query.ts`, `src/family-domain-memory.ts`, and `src/production-functional-closeout.ts` consume retained `listStageAttemptCloseouts`.
  - `docs/status.md` and active/reference docs discuss `stage_launch_admission_gate` and typed closeout semantics, not these helper names.
  - focused family-runtime stage launch and closeout tests cover the retained public behavior through CLI/read-model surfaces.

## Changes

- `src/family-runtime-stage-admission-gate.ts`
  - Made `buildStageAdmissionLaunchGateFromReview` module-private.
- `src/family-runtime-stage-attempt-ledger.ts`
  - Made `stageAttemptCloseoutToPayload` module-private.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-77.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 77 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-76.md`
- `src/family-runtime-stage-admission-gate.ts`
- `src/family-runtime-stage-attempt-ledger.ts`
- retained stage launch gate and closeout consumer refs in `src/`
- focused family-runtime stage launch and closeout tests by reference search
- fresh fallow output
- CodeGraph context for closeout ledger mapper and retained public surface
- live `rg` references for target helpers and retained stage launch / closeout surfaces

Edited:

- `src/family-runtime-stage-admission-gate.ts`
- `src/family-runtime-stage-attempt-ledger.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-77.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two stage helper public surfaces were retired.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was aligned with `origin/main` at `22e7855b` before part77, but had unrelated dirty changes in `contracts/opl-framework/domain-pack-compiler-contract.json`, `src/agent-readiness.ts`, `src/cli/cases/public-command-specs.ts`, `src/cli/modules/help-output.ts`, `src/domain-pack-compiler.ts`, and `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts`.
- To avoid mixing or overwriting those changes, part77 was implemented in clean worktree `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part77-stage-ledger-helpers`.
- Branch: `codex/opl-doc-governance-20260529-part77-stage-ledger-helpers`, based on `22e7855b`.

## Verification

Completed in the part77 worktree before absorb:

- `npm ci` exited `0`, ran `npm run build`, and npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `node --test --experimental-strip-types tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts tests/src/cli/cases/family-runtime-stage-admission-contract-light.test.ts tests/src/cli/cases/workspace-domain.stages.test.ts tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/family-runtime-stage-attempts.test.ts tests/src/cli/cases/family-runtime-stage-attempt-query-closeout.test.ts tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts tests/src/family-runtime-temporal-terminal-sync.test.ts` exited `0`, reporting `tests 113`, `pass 113`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- fresh fallow summary reported `unused_exports=112` and `unused_types=27`; the command still exits non-zero because remaining unrelated dead-code, duplication and complexity findings are outside this tranche.
- `git diff --check` exited `0`.
- conflict-marker scan returned no matches.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`; worktree profile reported `tooling_repo` because of worktree path shape, so root checkout must be rechecked after absorb.

Root `main` must be rechecked after absorb without reverting unrelated dirty files.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidate from prior read-only explorer: `temporalWorkerRuntimeModuleRoot` in `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`.
- Other candidate groups include stage admission / ledger helpers, test-only helper exports, managed install/update ledger helpers, and small source helper exports.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Before the next root absorb, account for the unrelated domain-pack compiler dirty lane now present in the root checkout.
