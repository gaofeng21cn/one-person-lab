# OPL series docs governance tranche ledger part 23

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_23`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、domain memory oracle、App/operator read model、ledger oracle 或 domain authority。当前 truth 回到 `docs/references/operating-governance/family-domain-memory-governance.md`、`docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL repo operating-governance 支撑文档里的 domain memory dated read-model 快照：

- `docs/references/operating-governance/family-domain-memory-governance.md`

目标是退役固定日期、固定 domain-memory receipt / App memory-writeback / worklist counter 和旧 provider status 快照，把长期文本改成 currentness policy 与稳定 authority boundary；具体计数只留在本 history ledger。

## Fresh Evidence

本轮 live evidence：

- `opl domain-memory list --json`：`resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`；runtime receipt evidence 读到 `closeout_count=903`、`consumed_memory_ref_count=1`、`writeback_receipt_ref_count=4`、`rejected_write_count=723`，且 `opl_writes_memory_body=false`。该读面只证明 OPL 可投影 domain-owned memory descriptor、locator、receipt refs 与 rejected writeback reason，不证明 OPL 持有 memory body。
- Per-domain list summary：MAG `mag_grant_strategy_memory`、MAS `mas_publication_route_memory` 与 RCA `rca_visual_pattern_memory` 的 receipt projection 均为 `descriptor_projection_only`；`retrieval_apply_landed=false`、`writeback_apply_landed=false`、`memory_body_migration_landed=false`。MAG runtime observed consumed memory ref 1 / writeback receipt ref 2；MAS runtime observed writeback receipt ref 2 / rejected write 718；RCA 当前仍是 descriptor proof contract landed / runtime writeback pending。
- `opl domain-memory migration-plan --domain mas --json`：MAS migration readiness 读为 `workspace_apply_closure_ready`，但 `opl_apply_allowed=false`，authority boundary 禁止 OPL 成为 memory store owner、domain truth owner、quality verdict owner、artifact authority、publication route decision owner 或 publication readiness owner。
- `opl runtime app-operator-drilldown --detail full --json`：summary 读到 `memory_ref_count=0`、`memory_writeback_ref_count=24`、`quality_ref_count=0`、`domain_dispatch_evidence_memory_writeback_ref_count=4`、`domain_external_verified_memory_writeback_receipt_ref_count=23`、`ref_family_memory_ref_count=24`。Full `memory_writeback_refs` projection policy 为 `memory_refs_and_writeback_receipts_only_no_memory_body`，writeback receipt refs 24，rejected write count 1，并明确 `can_read_memory_body=false`、`can_write_memory_body=false`、`can_accept_or_reject_memory_writeback=false`。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_blocked_refs_only_attention`、hard blocker 0、operator actionable / payload-required / payload-free attention tail 0、domain blocked attention tail 562，provider cadence/capability SLO satisfied。该读面仍禁止 domain ready、production ready、artifact authority 和 quality/export verdict。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：open worklist 0、closed refs-only item 316、open safe-action payload-required/free 都为 0，blocked refs-only envelope count 551；`zero_open_worklist_is_completion_claim=false`、`domain_ready_authorized=false`、`production_ready_authorized=false`。
- CodeGraph / source audit：`src/family-domain-memory.ts#buildReceiptProjection` 固定把 descriptor receipt projection 设为 `descriptor_projection_only`，并把 `retrieval_apply_landed`、`writeback_apply_landed`、`memory_body_migration_landed` 设为 false；`src/runtime-tray-app-operator-drilldown.ts#memoryWritebackRefs` 只合并 consumed memory refs 与 verified writeback receipt refs，并保留 refs-only / no-memory-body authority boundary。

## Changes

- `docs/references/operating-governance/family-domain-memory-governance.md`
  - Removed fixed `Date` metadata and added a currentness policy naming fresh domain-memory, App/operator, framework-readiness and evidence-worklist read models.
  - Replaced the dated `2026-05-28 live read-model` fixed counter block with stable live-read-model interpretation rules.
  - Kept the 2026-05-12 proof as provenance only and required fresh list / inspect / migration-plan before reusing it.
  - Reframed family-index completion so concrete resolved/missing counters live in read-models or history ledgers, not stable support prose.

## Coverage

Reviewed:

- `docs/references/operating-governance/family-domain-memory-governance.md` metadata, machine boundary, current live-read-model block, dated provenance block, current completion rows and next-stage wording.
- `docs/references/operating-governance/README.md` currentness policy from part 22 to keep operating-governance index alignment.
- Live `opl domain-memory list|migration-plan`, App/operator drilldown full memory section, framework readiness and evidence-worklist summary outputs.
- `src/family-domain-memory-contract.ts`, `src/family-domain-memory.ts` and `src/runtime-tray-app-operator-drilldown.ts` domain-memory / memory-writeback authority boundaries through CodeGraph and focused source read.

Edited:

- `docs/references/operating-governance/family-domain-memory-governance.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-23.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning support docs for fixed receipt ids, branch/SHA snapshots, local proof paths, old provider status and fixed read-model counters.
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`, `docs/references/current-support/opl-release-packages-modular-distribution.md`, `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md` and support docs under `docs/runtime/*` still need small-slice currentness cleanup.
- The domain-memory document still carries external calibration links from its original governance pass; they remain support context, not current machine truth.

## Next tranche write scope

- Continue OPL support-reference cleanup in small slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics or compatibility wording.
