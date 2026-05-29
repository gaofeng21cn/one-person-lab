# OPL series docs governance tranche ledger part 43

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_43`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 UHS authority、shared runtime contract、shared domain contract、runtime provider proof、domain admission gate、domain truth、quality verdict、artifact authority、App release gate 或 production readiness oracle。当前 truth 回到 `docs/public/unified-harness-engineering-substrate.md`、核心五件套、active gap plan、`docs/specs/shared-runtime-contract.md`、`docs/specs/shared-domain-contract.md`、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。
Date: `2026-05-29`

## Scope

本轮处理 `Unified Harness Engineering Substrate` public support doc 的 currentness drift：

- `docs/public/unified-harness-engineering-substrate.md`
- process ledger index

目标是让 UHS public support 文档保持公开叙事和 shared-boundary 读法，不再把 Shared Runtime / Shared Domain 合同写成“正在收敛”的旧过渡状态，也不让本文冻结 provider readiness、domain coverage、worklist counter 或 production readiness。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` / `TASTE.md`
  - OPL 当前主链路仍是 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain agent entry`。
  - 过时模块、接口、alias、facade、wrapper、兼容测试和过时文档在 replacement / no-active-caller / provenance 证据成立后直接退役，不保留兼容面。
- 核心五件套和 active gap plan
  - `OPL Framework -> One Person Lab App -> Foundry Agents` 是当前产品分层。
  - `Codex CLI` 是第一公民 executor；Temporal-backed provider 是 production online runtime 的必需 substrate。
  - MAS/MAG/RCA 持有 domain truth、quality/export verdict、artifact authority、memory body、owner receipt 和 direct app skill path。
  - Provider proof、generated surface、refs-only ledger verified、doctor clean 或 workorder accounting closed 都不能写成 domain ready、App release ready 或 production ready。
- `docs/specs/README.md`
  - `shared-runtime-contract.md` 与 `shared-domain-contract.md` 均是 `active_support` 规格支撑，不是未来待收敛计划。
- `docs/specs/shared-runtime-contract.md`
  - Shared Runtime Contract 已作为 stage-led、以 Agent executor 为最小执行单位的 OPL Framework 共享边界参考保留；当前运行主线、Foundry Agent 覆盖、MDS 读法和 counters 必须从核心五件套、active gap plan 与 fresh CLI/read-model 读取。
- `docs/specs/shared-domain-contract.md`
  - Shared Domain Contract 已作为共享 domain 行为边界参考保留；公开产品分层、admitted Foundry Agents、MDS 读法、standard skeleton、family orchestration schemas 和 no-bypass 边界必须从核心五件套、active gap plan、contracts/source/tests 与 fresh CLI/read-model 读取。
- `docs/public/README.md`
  - UHS 是公开支撑文档，不作为当前实现 oracle。

## Changes

- `docs/public/unified-harness-engineering-substrate.md`
  - Added a currentness rule limiting the document to public UHS narrative and shared-boundary reading.
  - Replaced stale "正在收敛为" wording with active-support contract wording for Shared Runtime Contract and Shared Domain Contract.
  - Clarified that shared contracts are current support surfaces whose machine truth still returns to contracts, source, tests, CLI/read-model, runtime ledger and domain-owned evidence.
  - Reworded the long-term product section so Shared Runtime / Shared Domain "承接" active support readings instead of being future landing queues.

No source, machine-readable contracts, tests, CLI behavior, runtime ledger, App repo files, domain repo files or release artifacts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/public/README.md`
- `docs/public/unified-harness-engineering-substrate.md`
- `docs/specs/README.md`
- `docs/specs/shared-runtime-contract.md`
- `docs/specs/shared-domain-contract.md`
- process ledger index

Edited:

- `docs/public/unified-harness-engineering-substrate.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-43.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue checking remaining public/support docs for future-tense wording that should now point to active support contracts, contracts/source/tests/read-model, or history/tombstone.
- Continue checking App release/package/fresh-install support docs if fresh App contracts/scripts/tests/workflows show stale release, runner, package channel, active-shell path, image payload or validation timing assumptions.
- Continue checking `docs/specs/**`, `docs/references/domain-admission/**`, `docs/runtime/**`, and `docs/product/**` for frozen counters, Gateway/frontdoor/routed-action readiness pollution, compatibility alias language or prose path machine-interface drift.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this docs-governance tranche.
- First focused test attempt failed before dependency install with `ERR_MODULE_NOT_FOUND` for `@temporalio/client`; root cause was missing `node_modules` in the isolated worktree, and `package.json` lists `@temporalio/client` as a dependency.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md`.
- Focused tests passed after dependency install: `node --experimental-strip-types --test tests/src/cli/cases/contracts-help.test.ts tests/src/verification-command-surfaces.test.ts` reported `tests 59`, `pass 59`, `fail 0`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue small evidence-backed docs governance slices. Strong candidates are remaining public/support docs with stale future-tense shared-boundary wording, App release/package/fresh-install support docs, and runtime/product support docs that still freeze dynamic read-model counters or retired interface wording.
