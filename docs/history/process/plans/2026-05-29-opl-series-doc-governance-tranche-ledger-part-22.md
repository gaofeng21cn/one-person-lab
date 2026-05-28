# OPL series docs governance tranche ledger part 22

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_22`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App/operator read model、ledger oracle 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、contracts、source、CLI/API、runtime ledger 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL repo operating-governance 支撑文档里的 dated App/operator read-model 快照：

- `docs/references/operating-governance/README.md`
- `docs/references/operating-governance/family-product-operator-projection.md`

目标是退役固定日期、固定 route/worklist/action 计数和旧 payload-required 快照，把长期文本改成 currentness policy 与稳定 authority boundary；具体计数只留在本 history ledger。

## Fresh Evidence

本轮 live evidence：

- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_blocked_refs_only_attention`、`hard_blocker_count=0`、`operator_actionable_attention_tail_count=0`、`operator_payload_required_attention_tail_count=0`、`domain_blocked_attention_tail_count=561`，provider cadence/capability SLO satisfied。该读面仍禁止 domain ready、production ready、artifact authority 和 quality/export verdict。
- `opl runtime app-operator-drilldown --json`：projection available，policy 为 refs-only/no domain truth/memory body/artifact body/verdict。Fresh summary 读到 `stage_attempt_count=25`、`operator_action_route_count=317`、`operator_executable_route_count=67`、`stage_production_evidence_receipt_action_route_count=11`、`stage_production_evidence_receipt_record_requires_domain_or_app_payload_count=0`、`domain_dispatch_evidence_current_default_actionable_attempt_count=0`、App release / production ready claim false，`codex_app_drives_long_running_tasks=false`。
- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked；production evidence tail reported separately, not a structural pass condition。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：`open_worklist_item_count=0`、`closed_refs_only_item_count=316`、open safe-action payload-required/free 都为 0；`domain_ready_authorized=false`、`production_ready_authorized=false`，zero-open-worklist 不是 completion/domain-ready/production-ready claim，blocked refs-only attention remains。

## Changes

- `docs/references/operating-governance/README.md`
  - Replaced the fixed 2026-05-28 calibration paragraph with a currentness policy listing the live read-model commands.
  - Reframed the durable interpretation around framework readiness, conformance, evidence-worklist and app-operator drilldown authority boundaries instead of frozen counters.
- `docs/references/operating-governance/family-product-operator-projection.md`
  - Replaced the fixed App/operator route/action snapshot with a currentness policy.
  - Preserved the stable operator projection role and explicit false/guard boundaries for release ready, production ready, Codex App long-running driver, domain ready and zero-open-worklist semantics.

## Coverage

Reviewed:

- `docs/references/operating-governance/README.md` live read-model calibration paragraph.
- `docs/references/operating-governance/family-product-operator-projection.md` purpose/currentness paragraph and operator projection semantics.
- Fresh framework readiness, App/operator drilldown, agents conformance and evidence-worklist outputs.

Edited:

- `docs/references/operating-governance/README.md`
- `docs/references/operating-governance/family-product-operator-projection.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-22.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning support docs for fixed receipt ids, branch/SHA snapshots, local proof paths, old provider status and fixed read-model counters.
- `docs/references/operating-governance/family-domain-memory-governance.md` still contains a dated memory read-model calibration and should be refreshed from fresh `opl domain-memory list --json` / App/operator evidence before editing.
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`, `opl-release-packages-modular-distribution.md` and support docs under `docs/runtime/*` still need small-slice currentness cleanup.

## Next tranche write scope

- Continue OPL support-reference cleanup in small slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics or compatibility wording.
