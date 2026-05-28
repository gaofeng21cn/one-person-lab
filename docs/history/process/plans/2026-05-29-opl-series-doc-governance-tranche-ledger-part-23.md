# OPL series docs governance tranche ledger part 23

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_23`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App/operator read model、ledger oracle 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL runtime naming support 文档里的 dated current-state anchor：

- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`

目标是移除固定 `2026-05-26` 状态说明，把长期文本改为 currentness policy 与稳定 runtime / owner boundary；动态 counters、receipt ids、provider proof snapshots、branch/SHA state 与本机 binary 诊断继续留在 live read-model 或 history ledger。

## Fresh Evidence

本轮 live evidence：

- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_blocked_refs_only_attention`、hard blocker 为 0，provider cadence / capability SLO satisfied；读面仍是 refs-only framework readiness summary，不授权 domain ready、production ready、artifact authority 或 quality/export verdict。
- `opl stages readiness --family-defaults --json`：4 个 domain、19 个 stage admitted、0 hard blocker；stage readiness 是 aggregate/admission summary，不能执行 stage、写 domain truth 或授权 domain/artifact/production ready。
- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked，production evidence tail 单独报告，不是 structural pass condition。
- `opl agents default-callers --family-defaults --json`：32 个 generated/default caller surface、0 blocked；physical delete、domain ready、production ready、quality verdict 与 artifact authority 均不由该 report 授权。
- `opl runtime app-operator-drilldown --json`：projection available，policy 为 refs-only/no domain truth/memory body/artifact body/verdict。Fresh summary 仍显示 Codex App 不驱动长跑任务，Temporal provider 作为 long-running driver substrate；App release / production ready claim 仍为 false。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：open worklist 为 0、closed refs-only worklist 为 316；zero-open-worklist 明确不是 completion、domain-ready 或 production-ready claim，blocked refs-only attention remains。

## Changes

- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
  - Replaced the fixed `2026-05-26` current-state note with a currentness policy.
  - Preserved stable boundary wording: Codex CLI first-class executor, provider-backed stage runtime for durable orchestration, Temporal as required production online substrate, Codex App as refs-only projection consumer, and MAS/MAG/RCA as domain truth / memory / artifact / quality / owner-receipt authorities.
  - Kept `opl-meta-agent` as new-agent builder / OPL-compatible Foundry Agent and `MedDeepScientist` as MAS-explicit provenance / fixture / archive / audit / upstream / parity reference only.

## Coverage

Reviewed:

- `docs/runtime/opl-runtime-naming-and-boundary-contract.md` full document.
- Runtime naming sections for `Host-Agent Runtime`, `Managed Runtime`, current family positioning, Codex App, MAS/MAG/RCA authority and MDS provenance.
- Fresh framework readiness, stages readiness, agents conformance, default-callers, App/operator drilldown and evidence-worklist outputs.

Edited:

- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-23.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/runtime/*` and support references for fixed dates, receipt ids, branch/SHA snapshots, local proof paths, old provider status and fixed read-model counters.
- `docs/references/operating-governance/family-domain-memory-governance.md` still needs a fresh memory/read-model currentness pass.
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md` and `docs/references/current-support/opl-release-packages-modular-distribution.md` still need small-slice currentness cleanup.

## Next tranche write scope

- Continue OPL support-reference cleanup in small verified slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics, old compatibility promises or stale current anchors.
