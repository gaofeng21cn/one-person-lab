# OPL series docs governance tranche ledger part 78

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_78`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 generated interface contract、domain truth、domain ready verdict、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、provider readiness oracle 或 production readiness oracle。当前 truth 回到 `contracts/opl-framework/domain-pack-compiler-contract.json`, `src/domain-pack-compiler.ts`, `src/standard-domain-agent-family-repos.ts`, CLI `opl agents interfaces --family-defaults`, focused generated-interface / readiness tests、live CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮收口 root checkout 已存在的 generated interface family-defaults lane，并把它归入当前 machine contract / source / docs：

- `contracts/opl-framework/domain-pack-compiler-contract.json`
- `contracts/opl-framework/public-surface-index.json`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/status.md`
- `src/agent-platform-surface-ownership.ts`
- `src/agent-readiness.ts`
- `src/cli/cases/public-command-specs.ts`
- `src/cli/modules/help-output.ts`
- `src/domain-pack-compiler.ts`
- `src/standard-domain-agent-conformance.ts`
- `src/standard-domain-agent-family-repos.ts`
- `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts`
- process ledger index

目标是让 generated interface 与 conformance / readiness / platform-surface family-defaults drilldown 对齐：

- 新增 `opl agents interfaces --family-defaults` family-wide generated interface report。
- 将默认 OPL family repo discovery 提取为共享 `src/standard-domain-agent-family-repos.ts`，消除 conformance 与 platform-surface 两处重复实现。
- 更新 contract、public surface index、help / command spec、readiness gate source command 和 current status wording。
- 保留 `--domain` 与 `--repo-dir` 的单仓 generated interface bundle 形状。

本轮不新增兼容 alias、facade、wrapper 或 domain-owned truth 写入面。

## Fresh Evidence

本轮 live evidence：

- Root checkout before part78 was synced to `origin/main` at `5e1516f8`, with only this unrelated dirty family-defaults lane present from the prior run.
- CodeGraph context surfaced the new shared family repo discovery module and `buildGeneratedAgentInterfaces` as the generated interface entry point.
- Focused source/test read:
  - `src/domain-pack-compiler.ts` now accepts exactly one selector: `--family-defaults`, `--domain`, or `--repo-dir`.
  - `src/standard-domain-agent-family-repos.ts` owns default repo discovery for MAS, MAG, RCA and OMA, with `OPL_FAMILY_WORKSPACE_ROOT` as the explicit workspace override.
  - `src/agent-platform-surface-ownership.ts` and `src/standard-domain-agent-conformance.ts` now reuse the shared discovery helper instead of carrying duplicate local implementations.
  - `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts` checks the family report shape, ready summary, OMA repo coverage, generated interface owner and negative authority boundary.
- Live CLI reads:
  - `bin/opl agents interfaces --family-defaults --json` returned `surface_kind=opl_generated_agent_interfaces_family_report`, `owner=one-person-lab`, `status=ready`, `total_domain_count=4`, `ready_domain_count=4`, and `blocked_domain_count=0`.
  - `bin/opl agents readiness --family-defaults --json` returned generated interface gate source command `opl agents interfaces --family-defaults --json`, with structural conformance passed and production evidence tail reported separately.

## Changes

- `src/domain-pack-compiler.ts`
  - Added `--family-defaults` selector support for generated interface reports.
  - Added family report summary and refs-only authority boundary.
  - Kept `--domain` and `--repo-dir` single bundle behavior unchanged.
- `src/standard-domain-agent-family-repos.ts`
  - Added shared default OPL family repo discovery.
- `src/agent-platform-surface-ownership.ts`
  - Reused shared default family repo discovery.
- `src/standard-domain-agent-conformance.ts`
  - Reused shared default family repo discovery.
- `src/agent-readiness.ts`
  - Pointed generated interface gate evidence at `opl agents interfaces --family-defaults --json`.
- `src/cli/cases/public-command-specs.ts` and `src/cli/modules/help-output.ts`
  - Updated usage/examples for the family-wide generated interface drilldown.
- `contracts/opl-framework/domain-pack-compiler-contract.json`
  - Added the generated interface family report contract surface.
- `contracts/opl-framework/public-surface-index.json`
  - Pointed the public generated interface surface at `--family-defaults`.
- `docs/active/production-framework-closure-gap-matrix.md` and `docs/status.md`
  - Updated current verification/read-model wording to name the family-wide generated interface drilldown.
- `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts`
  - Added focused coverage for the family-defaults generated interface report.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-78.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 78 index row.

No domain repo files, App repo files, shell repo files, runtime ledgers, provider state, quality verdicts, artifact bodies or owner receipts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-77.md`
- `contracts/opl-framework/domain-pack-compiler-contract.json`
- `contracts/opl-framework/public-surface-index.json`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/status.md`
- `src/domain-pack-compiler.ts`
- `src/standard-domain-agent-family-repos.ts`
- `src/agent-platform-surface-ownership.ts`
- `src/standard-domain-agent-conformance.ts`
- `src/agent-readiness.ts`
- `src/cli/cases/public-command-specs.ts`
- `src/cli/modules/help-output.ts`
- `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts`
- live generated interface and readiness CLI output
- CodeGraph context for the family repo discovery / generated interface area

Edited:

- `contracts/opl-framework/domain-pack-compiler-contract.json`
- `contracts/opl-framework/public-surface-index.json`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/status.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-78.md`
- `docs/history/process/plans/README.md`
- `src/agent-platform-surface-ownership.ts`
- `src/agent-readiness.ts`
- `src/cli/cases/public-command-specs.ts`
- `src/cli/modules/help-output.ts`
- `src/domain-pack-compiler.ts`
- `src/standard-domain-agent-conformance.ts`
- `src/standard-domain-agent-family-repos.ts`
- `tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One generated-interface family-wide drilldown surface was landed, and duplicate default family repo discovery implementations were retired into a shared helper.

## Branch / Worktree Hygiene

- This lane was already present as unrelated dirty work in the root checkout after part77.
- The root checkout was at `main` / `origin/main` `5e1516f8` before part78 closeout.
- Because the dirty lane itself had to be accounted for before further cleanup, part78 was completed directly in the root checkout and kept separate from fallow export cleanup candidates.

## Verification

Completed before commit:

- `node --test --experimental-strip-types tests/src/cli/cases/domain-pack-compiler-canonical-targets.test.ts tests/src/cli/cases/agents-conformance.test.ts tests/src/cli/cases/agent-platform-surface-ownership.test.ts tests/src/cli/cases/agent-readiness.test.ts` exited `0`, reporting `tests 17`, `pass 17`, `fail 0`.
- `npm run typecheck` exited `0`.
- `bin/opl agents interfaces --family-defaults --json` exited `0` and returned a ready family report for 4 default family repos.
- `bin/opl agents readiness --family-defaults --json` exited `0` and reported generated interface gate source command `opl agents interfaces --family-defaults --json`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- `npm run build` exited `0`.
- `npm run hygiene:fallow` exited `1` with expected remaining unrelated findings; summary still reported `unused_exports=112`, `unused_types=27`, `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `private_type_leaks=0`, `boundary_violations=0`, `duplicate_exports=7`, and `circular_dependencies=26`.
- `git diff --check` exited `0`.
- conflict-marker scan with line-start anchors returned no matches.
- `opl-doc-doctor doctor . --format json` exited `0`, returning `repo_profile=opl_framework`, `finding_count=0`, and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidate from prior read-only explorer: `temporalWorkerRuntimeModuleRoot` in `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`.
- Other candidate groups include test-only helper exports, managed install/update ledger helpers, and small source helper exports.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Resume source/export cleanup from fresh fallow output, preferably starting with a small Temporal provider part helper if live callers and retained public owner are clear.
- Keep tranches small: edit only the source module, support doc, contract or focused guard that owns the stale claim, then absorb to `main`, root-reverify and push.
