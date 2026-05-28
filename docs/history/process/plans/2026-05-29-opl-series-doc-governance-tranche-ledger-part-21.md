# OPL series docs governance tranche ledger part 21

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_21`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App/operator read model、ledger oracle 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、contracts、source、CLI/API、runtime ledger 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL repo 内 OMA / New Agent template-consumption currentness 文档折回：

- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`

目标是把 standard-agent-template-consumption ledger 的第三条 verified replay receipt 折回 active/status 文档，同时保留 OPL refs-only / no-domain-ready / no-artifact-authority / no-production-ready 边界。

## Fresh Evidence

本轮 live evidence：

- `opl runtime standard-agent-template-consumption list --json`：`receipt_count=3`、`verified_receipt_ref_count=3`、`pending_verify_receipt_ref_count=0`；三条 receipt 分别是 `default-state-2026-05-28T08-20-35-619Z`、`repeat-replay-2026-05-28T13-00Z` 和 `repeat-replay-2026-05-28T21-02Z`。
- 三条 receipt 复用同一 replay evidence ref `opl://standard-agent-template-consumption/award-foundry/1f08050ae43f4de4` 与 cohort evidence ref `opl://standard-agent-template-consumption/cohort/bdedb36f26b54bdb`，说明这是 deterministic scaffold consumption replay 的独立 durable receipt，不是新 domain 内容差异。
- `opl runtime app-operator-drilldown --json`：OPL App/operator drilldown authority boundary 仍是 refs-only，不写 domain truth、不读 memory/artifact body、不执行 provider signal、不授权 quality/export verdict。
- `opl framework readiness --family-defaults --json`：OMA production consumption follow-through 读为 `production_consumption_ready=true`、`open_gate_count=0`、`pending_verify_long_soak_receipt_ref_count=0`、`typed_blocker_ref_count=0`；authority boundary 仍禁止 domain ready、production ready、artifact authority、quality/export verdict 和 domain truth write。

## Changes

- `docs/active/current-state-vs-ideal-gap.md`
  - Updated OMA / New Agent consumption progress from two verified standard-agent-template-consumption receipts to three verified receipts.
  - Preserved the boundary that replay receipt durability does not authorize MAS/MAG/RCA domain ready, artifact authority, production ready, owner receipt, or App live rendering claims.
- `docs/status.md`
  - Updated the current OMA template-consumption status paragraph and remaining-work bullet to include the third verified replay receipt.
  - Kept the wording scoped to refs-only replay evidence and default App/operator read-model visibility.

## Coverage

Reviewed:

- `docs/active/current-state-vs-ideal-gap.md` OMA / New Agent consumption progress row.
- `docs/status.md` OMA template-consumption current status paragraph and remaining-work bullet.
- `src/standard-agent-template-consumption-ledger.ts` and related CLI/read-model references via targeted search.
- Fresh standard-agent-template-consumption ledger, App/operator drilldown, and framework readiness outputs.

Edited:

- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-21.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned, or deleted in this tranche.

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning active/support docs for dated receipt counters that should move to live read-model or history ledgers.
- Continue support-reference cleanup in `docs/references/current-support/*`, `docs/references/operating-governance/*`, `docs/runtime/*`, and remaining roadmap subsections.
- Do not turn OMA replay receipts, App/operator projection, or framework readiness flags into MAS/MAG/RCA domain ready, App release ready, production ready, artifact authority, quality verdict, or default promotion claims.

## Next tranche write scope

- Continue OPL support-reference cleanup in small slices with fresh CLI/read-model evidence.
- Prioritize support docs still mixing durable target state with fixed receipt ids, local proof snapshots, branch/SHA state, old provider status, compatibility promises, or stale current anchors.
