# OPL series docs governance tranche ledger part 52

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_52`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Agent Lab control-plane contract、Developer Mode route contract、mechanism promotion contract、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 Agent Lab source、tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Agent Lab 的过宽公共常量导出面：

- `src/agent-lab-control-read-models.ts`
- `src/agent-lab-developer-mode.ts`
- `src/agent-lab-promotion.ts`
- process ledger index

目标是把 fallow 标出的、只在本文件内消费的 Agent Lab authority / route-builder / risk-tier 常量收回为 module-private constants，同时保持 read-model 输出结构不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part52, `unused_exports=181` from part51 memory.
  - after part52, `unused_exports=177`.
  - `unused_files=0`
  - `unused_dependencies=0`
  - `unresolved_imports=0`
  - `private_type_leaks=0`
  - `boundary_violations=0`
- CodeGraph caller checks for `AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY`, `DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY`, `DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER`, and `MECHANISM_RISK_TIERS` returned no external callers.
- `rg -n "\b(AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY|DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY|DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER|MECHANISM_RISK_TIERS)\b" src tests docs package.json`
  - after the change, outside this history ledger all four names appear only inside their owning source files.
  - tests do not import these constants directly.
- Focused Agent Lab tests cover the public builders that still embed these constants into read-model output.

## Changes

- `src/agent-lab-control-read-models.ts`
  - Changed `AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY` from exported constant to module-private constant.
- `src/agent-lab-developer-mode.ts`
  - Changed `DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY` from exported constant to module-private constant.
  - Changed `DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER` from exported constant to module-private constant.
- `src/agent-lab-promotion.ts`
  - Changed `MECHANISM_RISK_TIERS` from exported constant to module-private constant.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-52.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 52 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/agent-lab-control-read-models.ts`
- `src/agent-lab-developer-mode.ts`
- `src/agent-lab-promotion.ts`
- `tests/src/agent-lab-complete.test.ts`
- `tests/src/agent-lab-maturity-controls.test.ts`
- `docs/history/process/plans/README.md`
- fresh fallow summary
- CodeGraph caller output for the target Agent Lab constants

Edited:

- `src/agent-lab-control-read-models.ts`
- `src/agent-lab-developer-mode.ts`
- `src/agent-lab-promotion.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-52.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Four TypeScript helper constants were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `74482cd2` before part52 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part52-unused-agent-lab-constants`.
- Branch: `codex/opl-doc-governance-20260529-part52-unused-agent-lab-constants`, based on root `main`.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed.
- `node --test --experimental-strip-types tests/src/agent-lab-complete.test.ts tests/src/agent-lab-maturity-controls.test.ts` reported `tests 13`, `pass 13`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported `All 212 active test files are assigned to a test lane.`
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=177`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Nearby Agent Lab ledger/file-path exports remain candidates, but each reader/export should be checked against CLI/read-model and tests before de-exporting.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
