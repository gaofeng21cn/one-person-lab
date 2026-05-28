# OPL series docs governance tranche ledger part 9

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_9`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 shared runtime active spec 支撑污染：`docs/specs/shared-runtime-contract.md` 是 active spec support，但开头仍以 `2026-05-26` 冻结当前公开产品分层、运行主线、Foundry Agents 和 MDS 读法。

目标是让该 spec 只保留长期 shared runtime 边界，并把当前状态读取规则交回核心五件套、active owner docs 和 fresh CLI/read-model；单次日期校准和具体 counters 进入 history/provenance。

## Fresh evidence

本轮 live evidence 使用当前 OPL main checkout：

- `opl framework readiness --family-defaults --json`：`framework_readiness.summary` 读为 control plane available with operator attention，hard blockers 为 0，provider cadence / capability SLO satisfied；authority boundary 仍禁止 domain ready、production ready、artifact authority、quality/export verdict 和 domain action execution claim。
- `opl agents conformance --family-defaults --json`：`standard_domain_agent_conformance.summary` 读为 4 repos passed、0 blocked，`structural_conformance_status=passed`，production evidence tail 仍独立报告。
- `opl agents default-callers --family-defaults --json`：`agent_default_caller_readiness.summary` 读为 4 repos ready-domain-evidence-required，32 generated/default caller surfaces，0 blocked，0 missing owner/typed-blocker、no-forbidden-write 或 tombstone/provenance refs；该报告不授权 physical delete、domain ready、production ready、quality verdict 或 artifact authority。
- `opl runtime app-operator-drilldown --json`：App/operator read model 仍为 refs-only drilldown，provider cadence/capability satisfied，App release/user-path evidence open gate 为 0，Developer Mode scaleout follow-through open gate 为 0，OMA production-consumption projected；这些都不生成 release-ready、domain-ready 或 production-ready verdict。

These values support the stable shared-runtime contract boundary while showing why dated current-state prose should not remain in an active spec as frozen truth.

## Changes

- Replaced `docs/specs/shared-runtime-contract.md`'s dated `2026-05-26` current-state note with a live-reading rule.
- Kept the durable boundary: shared runtime remains stage-led and executor-first; current public layering and runtime line are read through core docs, active plans and live CLI/read-model.
- Did not edit source, contracts, tests, MAS/RCA dirty lanes, App release docs, or active truth owner docs.

## Coverage

Reviewed:

- `docs/specs/shared-runtime-contract.md`
- `docs/specs/README.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/current-development-lines.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`

Edited:

- `docs/specs/shared-runtime-contract.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-9.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Other active/support specs and references may still contain dated current-state notes, concrete receipt ids or stale counters outside history.
- `docs/specs/shared-runtime-contract.md` still carries legacy terms as current boundary explanation where appropriate; future changes must distinguish stable boundary vocabulary from dated proof ledger.
- MAS and RCA main checkouts still contain external dirty lanes and were not touched.

## Next tranche write scope

- Continue OPL specs/runtime/reference paragraph coverage, prioritizing docs that mix active support/spec role with dated current-state snapshots.
- Re-run fresh read-model before touching documents that mention shared runtime, provider SLO, generated/default callers, App/operator workbench, production evidence, or admitted domain agents.
- Avoid MAS/RCA dirty lanes unless explicitly taking ownership.
