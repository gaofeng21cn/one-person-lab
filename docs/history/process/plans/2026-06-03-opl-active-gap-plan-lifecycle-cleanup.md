# OPL Active Gap Plan Lifecycle Cleanup

Owner: `One Person Lab`
Purpose: `history_process_active_gap_plan_lifecycle_cleanup`
State: `history_only`
Machine boundary: 本文是人读过程归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

## Scope

本轮覆盖 OPL active gap plan、docs lifecycle governance、active/history indexes。目标是把 active 文档从 dated proof ledger、receipt 流水和历史长清单中解耦，让 `docs/active/current-state-vs-ideal-gap.md` 重新只承担当前目标、差距、完成口径和下一轮 baton。

未改源码、contracts、tests 或 runtime state。

## Context Read

- `AGENTS.md`、`TASTE.md`
- `docs/README.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/policies/docs-lifecycle-policy.md`
- `docs/active/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/current-development-lines.md`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/active/standard-agent-private-platform-inventory.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`

## Cleanup

`docs/active/current-state-vs-ideal-gap.md` 之前同时承担 current gap plan、receipt ledger、App/runtime evidence recount、domain evidence recount、private-platform inventory excerpt 和 repeated forbidden-claim reminder。该形态会让 active plan 随每轮 evidence 增量继续膨胀，并让读者误以为旧 counter、receipt ref 或 cohort ref 是当前 truth。

本轮处理为：

- active gap plan 只保留目标态、功能/结构差距、测试/证据差距、当前 baton、forbidden claims 和验证入口。
- dated receipt refs、workorder counters、provider tick、safe-action record/verify、branch/worktree closeout、cohort id 细节不再保存在 active plan。
- 当前动态事实统一回到 live CLI/read-model、runtime ledger、App release evidence、domain owner receipt 或 typed blocker。
- `docs/docs_portfolio_consolidation.md`、`docs/active/README.md` 和本 history 索引同步声明 2026-06-03 active gap plan cleanup。

## Current Boundary

`open_worklist=0`、provider SLO satisfied、selected App cohort、verified refs-only receipt、conformance passed、generated default-caller evidence clean 或 cleanup ledger verified 都不能写成 completion、domain ready、App release ready 或 production ready。

旧 Hermes/Gateway/frontdoor/local-manager/MDS-default、compat alias、facade、wrapper、old CLI alias 和 compatibility-only tests 只能按 history/provenance/negative-guard 读取。active caller 迁走且 replacement proof 成立后，应直接删除或 tombstone，不新增兼容入口。

## Follow-Through

后续若某轮治理产生新的 durable rule，应提升到核心五件套、`docs/active/` owner 文档、policy/spec 或 contract。原始 proof、coverage tranche、line-count ledger、receipt 流水和 worktree closeout 进入 `docs/history/**`，不能追加回 active gap plan。

## Verification

- `git diff --check`
- strict conflict-marker scan over `docs/**/*.md`
- targeted active-doc stale wording scan outside `docs/history/**`
