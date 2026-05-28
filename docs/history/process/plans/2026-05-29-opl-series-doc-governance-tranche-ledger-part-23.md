# OPL series docs governance tranche ledger part 23

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_23`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App/operator read model、ledger oracle 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、contracts、source、CLI/API、runtime ledger 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL repo operating-governance 支撑文档里的 dated domain-memory read-model 快照：

- `docs/references/operating-governance/family-domain-memory-governance.md`

目标是退役固定 `2026-05-28` / `2026-05-12` 读数、固定 memory/writeback/worklist counters 和旧 provider status 快照，把长期文本改成 currentness policy 与稳定 refs-only authority boundary；具体计数只留在本 history ledger。

## Fresh Evidence

本轮 live evidence：

- `opl domain-memory list --json`：`surface_kind=opl_family_domain_memory_index`，`resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`；runtime receipt evidence 读为 `closeout_count=903`、`consumed_memory_ref_count=1`、`writeback_receipt_ref_count=4`、`rejected_write_count=723`、`opl_writes_memory_body=false`。
- `opl runtime app-operator-drilldown --json`：projection available，policy 为 refs-only/no domain truth/memory body/artifact body/verdict；summary 读为 `memory_ref_count=0`、`memory_writeback_ref_count=24`、`ref_family_memory_ref_count=24`、`domain_external_verified_memory_writeback_receipt_ref_count=23`。Authority boundary 仍禁止 OPL 写 domain truth、读/写 memory body、读 artifact body、mutate artifact、授权 quality/submission/export verdict 或执行 domain action/provider signal。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_blocked_refs_only_attention`、`hard_blocker_count=0`、`operator_actionable_attention_tail_count=0`、`operator_payload_required_attention_tail_count=0`、`domain_blocked_attention_tail_count=562`，provider cadence/capability SLO satisfied，`can_claim_domain_ready=false`、`can_claim_production_ready=false`。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：`open_worklist_item_count=0`、`closed_refs_only_item_count=316`、open safe-action payload-required/free 都为 0；`domain_ready_authorized=false`、`production_ready_authorized=false`，zero-open-worklist 不是 completion/domain-ready/production-ready claim，blocked refs-only attention remains。

## Changes

- `docs/references/operating-governance/family-domain-memory-governance.md`
  - Removed the fixed date/status header.
  - Replaced dated live read-model and proof snapshots with a currentness policy listing fresh read-model commands.
  - Reframed durable interpretation around descriptor/locator/receipt projection and App/operator memory/writeback refs, while preserving that OPL cannot hold memory body, perform retrieval/apply, accept/reject writeback, write domain truth, close quality gates, or turn zero-open-worklist into domain memory completion.
  - Kept MAS DM002 memory consumption as historical provenance without freezing old counters.

## Coverage

Reviewed:

- `docs/references/operating-governance/family-domain-memory-governance.md` metadata, live read-model calibration, dated proof, completion progress and next closeout sequence.
- Fresh domain-memory list, App/operator drilldown, framework readiness and evidence-worklist outputs.
- `docs/references/operating-governance/README.md` currentness policy from part 22 to keep semantics aligned.

Edited:

- `docs/references/operating-governance/family-domain-memory-governance.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-23.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning support docs for fixed receipt ids, branch/SHA snapshots, local proof paths, old provider status and fixed read-model counters.
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`, `docs/references/current-support/opl-release-packages-modular-distribution.md`, remaining `docs/references/current-support/*`, and support docs under `docs/runtime/*` still need small-slice currentness cleanup.
- Keep domain memory body, accept/reject, fundability/visual quality judgment and artifact authority in MAS/MAG/RCA; OPL docs must stay on locator/proposal/receipt/freshness/rejected-writeback projection.

## Next tranche write scope

- Continue OPL support-reference cleanup in small slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics or compatibility wording.
