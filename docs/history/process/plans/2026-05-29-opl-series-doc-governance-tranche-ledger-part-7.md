# OPL series docs governance tranche ledger part 7

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_7`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 runtime-substrate support reference 污染：`docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` 同时承担长期 roadmap 和 2026-05 proof/read-model snapshot ledger，导致 support reference 里冻结了旧 `operator_actionable_attention_tail_count=0`、旧 three-domain descriptor counters、Temporal residency proof counters、task-bound bridge counters 和 per-domain closeout details。

目标是让该 roadmap 只保留长期 stage-led framework owner split、开发顺序和 live read-model 读取规则；dated proof、receipt id、attempt id、old counters 和 per-domain closeout detail 回到 history/provenance。

## Fresh evidence

本轮 live read-model 使用当前嵌套 JSON schema：

- `opl framework readiness --family-defaults --json` -> `.framework_readiness.summary`：control plane available；hard blocker counts 为 0；`operator_actionable_attention_tail_count=3`，`operator_payload_required_attention_tail_count=3`，`operator_payload_free_attention_tail_count=0`；provider cadence/capability SLO satisfied；domain blocked refs-only attention 仍按 attention-only 分组读取。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` -> `.family_runtime_evidence_worklist.summary`：`open_worklist_item_count=3`、`open_safe_action_payload_required_item_count=3`、`open_safe_action_payload_free_item_count=0`、`domain_dispatch_evidence_workorder_count=3`、`stage_receipt_freshness_open_workorder_count=0`、`closed_refs_only_item_count=307`、`domain_dispatch_evidence_receipt_item_count=269`；`domain_ready_authorized=false`、`production_ready_authorized=false`。
- `opl agents conformance --family-defaults --json` -> `.standard_domain_agent_conformance.summary`：4 repos passed、0 blocked、`structural_conformance_status=passed`、`production_evidence_tail_count=4`。
- `opl agents default-callers --family-defaults --json` -> `.agent_default_caller_readiness.summary`：32 generated/default caller surfaces、0 blocked，owner/typed-blocker、no-forbidden-write、tombstone/provenance 缺口均为 0。

These values prove the 2026-05-26 and 2026-05-14 snapshot counters inside the roadmap are stale as current truth. They remain useful only as provenance for how the roadmap evolved.

## Changes

- Replaced the roadmap's `2026-05-26 live read-model 校准` and `2026-05-14 / 2026-05-17 dated proof 回顾` sections with `Live Read-Model 读取规则`.
- Kept stable rules: read current nested summaries, treat counters as dynamic, separate conformance/default-caller readiness from production evidence, keep zero/open worklist semantics bounded, and preserve false authority flags.
- Moved the detailed dated proof role to history by linking to `docs/history/process/plans/2026-05-18-opl-family-doc-process-history.md`.
- Did not edit source, contracts, tests, MAS/RCA dirty lanes, or active truth owner docs.

## Coverage

Reviewed:

- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/references/runtime-substrate/README.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/current-development-lines.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`

Edited:

- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-7.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Other support references may still carry dated proof sections, concrete receipt ids, or old read-model counters outside history.
- Core docs such as `docs/status.md` still contain many volatile examples; they may be current owner context and need a separate semantic pass, not a mechanical deletion.
- RCA native-PPT dirty implementation lane remains external owner work and was not touched.

## Next tranche write scope

- Continue OPL support/reference paragraph coverage, prioritizing docs that mix active support role with dated proof ledger.
- Avoid MAS/RCA dirty lanes unless explicitly taking ownership.
- Re-run fresh read-model before touching any document that mentions open worklist, domain-dispatch, provider proof, App release, OMA production-consumption, Developer Mode, or production readiness.
