# OPL series docs governance tranche ledger part 8

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_8`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 Agent Lab runtime support reference 污染：`docs/runtime/opl-agent-lab-control-plane.md` 是 active runtime 支撑文档，但仍保留一段 `2026-05-17 校准` 的 dated proof 口吻，把 MAS/MAG/RCA 三仓当时的 repo-native verification lane 状态冻结在 runtime 支撑正文中。

目标是让该 runtime 文档只保留长期有效的 Agent Lab longline 读法和 domain/OPL 测试责任分界；单次日期校准、proof 语境和历史过程回到 history/provenance。

## Fresh evidence

本轮 live evidence 使用当前 OPL main checkout：

- `opl agent-lab longline --json`：`suite_result.status=passed`，3 个 longline task，3 个 run passed，0 blocked，7 个 recovery probe passed，3 个 scorecard passed；`promotion_safety_ready_count=0`、`promotable_candidate_count=0`，authority boundary 仍全部禁止 domain truth、memory body、artifact mutation、owner receipt 与 production/domain ready claim。
- `opl agent-lab workbench --json`：`status=ready_for_app_workbench_consumption`，`app_workbench_consumption_ready=true`，longline summary 被 workbench 消费为 refs-only read model。
- `opl agent-lab mechanism --json`：`status=review_pending`，机制候选仍依赖风险分级、independent AI reviewer、version ledger、canary 和 rollback refs；fixture/generated receipt 不授权真实 promotion。
- `opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab --format json`：`finding_count=0`，active truth health `pass`。该结果只作为结构健康信号，不替代上述 live CLI/read-model。

These values prove the dated `2026-05-17` calibration paragraph is no longer the right active-support shape. The durable truth is the longline CLI boundary plus domain-owned authority split, not the date-specific verification-lane snapshot.

## Changes

- Replaced the Agent Lab runtime doc's `2026-05-17 校准` paragraph with a stable `longline` read-model rule.
- Kept the durable boundary: OPL Agent Lab owns framework-level longline orchestration / recovery / no-forbidden-write regression; MAS/MAG/RCA keep scorer, owner receipt fixture, artifact authority and domain truth tests.
- Did not edit source, contracts, tests, MAS/RCA dirty lanes, App release docs, or active truth owner docs.

## Coverage

Reviewed:

- `docs/runtime/opl-agent-lab-control-plane.md`
- `docs/runtime/README.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/current-development-lines.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`

Edited:

- `docs/runtime/opl-agent-lab-control-plane.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-8.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Other active/support runtime references may still include dated proof paragraphs, concrete receipt ids, or old read-model counters outside history.
- `docs/runtime/opl-agent-lab-control-plane.md` still contains many current machine-entry descriptions; any future slimming must be semantic and live-evidence backed, not a mechanical date-string removal.
- MAS and RCA main checkouts still contain external dirty lanes and were not touched.

## Next tranche write scope

- Continue OPL support/reference paragraph coverage, prioritizing docs that mix active support role with dated proof ledger or concrete receipt snapshots.
- Re-run fresh read-model before touching documents that mention Agent Lab, Developer Mode, App/operator workbench, production evidence, default callers, longline, or mechanism promotion.
- Avoid MAS/RCA dirty lanes unless explicitly taking ownership.
