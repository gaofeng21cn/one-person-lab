# OPL series docs governance tranche ledger part 10

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_10`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 Temporal provider active support 污染：`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md` 是 active support，但仍保留多段 `2026-05-14` / `2026-05-17` / `2026-05-26` proof snapshot、旧 worklist counter 和 provider proof status 口吻。

目标是让该 provider 支撑计划只保留长期有效的 Temporal provider owner split、live read-model 读取规则、production proof 边界和 domain soak 缺口；dated proof、receipt id、old counter 和 per-domain snapshot 只按 history/provenance 读取。

## Fresh evidence

本轮 live evidence 使用当前 OPL main checkout：

- `opl family-runtime service status --provider temporal --json`：managed local Temporal service `running`，server reachable，address `127.0.0.1:7233`。
- `opl family-runtime worker status --provider temporal --json`：Temporal worker `ready`，server reachable，managed worker source current，task queue `opl-stage-attempts`。
- `opl family-runtime residency proof --provider temporal --production --json`：`closeout_status=production_residency_proven`，required checks 覆盖 service reachable、worker ready、completed attempt、restart re-query、signal history、typed closeout required、missing closeout blocked、retry/dead-letter boundary 和 domain truth boundary；authority boundary 仍禁止 domain ready、quality verdict、artifact export 和 domain truth write。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`，hard blocker `0`，provider cadence window status `window_cadence_satisfied`，provider capability status `capability_slo_satisfied`；operator attention tail 与 domain-blocked refs-only attention 仍存在，不能写成 production/domain ready。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：`open_worklist_item_count=3`、payload-required item `3`、domain-dispatch workorder `3`、closed refs-only item `309`，`domain_ready_authorized=false`、`production_ready_authorized=false`，zero-open guards 仍显式禁止 completion/domain/production ready claim。
- `opl runtime app-operator-drilldown --json`：provider cadence/capability satisfied，current-control-state 仍投影 running provider attempts，domain-dispatch evidence 当前暴露 3 个 payload-required record route；App/operator drilldown 仍是 refs-only projection，不生成 release-ready、domain-ready 或 production-ready verdict。
- `opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab --format json`：`finding_count=0`，active truth health `pass`。该结果只作为结构健康信号，不替代上述 live CLI/read-model。

These values prove the Temporal provider support plan should not freeze older read-model counters. The durable truth is the provider/live-read-model boundary and authority split; the current counts are evidence for this tranche only and may change on the next read.

## Changes

- Replaced the conclusion paragraph's dated `2026-05-14` / `2026-05-26` counter snapshot with a stable live-read-model rule.
- Removed dated provider proof status strings such as `latest_proof_proven` / `proof_fresh` from active support prose.
- Rewrote P1/P2/P3 status paragraphs so dated paper-line and MAG/RCA attempt counters no longer act as current truth.
- Kept the durable boundary: Temporal is production-required provider substrate; OPL holds provider lifecycle / attempt ledger / projection; MAS/MAG/RCA keep domain truth, quality/export verdict, artifact authority and owner receipt.
- Did not edit source, contracts, tests, MAS/RCA dirty lanes, App release docs, or active truth owner docs.

## Coverage

Reviewed:

- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/runtime/README.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/status.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`

Edited:

- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-10.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Other runtime-substrate references may still carry dated status anchors or current-state paragraphs that should be converted to live-read-model rules.
- `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md` still contains 2026-05-26 read-model counters; it may be legitimate research prompt context, but needs a separate semantic pass.
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` and `opl-managed-runtime-three-layer-contract.md` retain dated boundary notes for history-bound support; future passes should confirm they remain provenance/negative-guard, not current readiness claims.
- MAS, RCA and App dirty lanes remain external owner work and were not touched.

## Next tranche write scope

- Continue OPL runtime-substrate support/reference coverage, prioritizing docs that mix active support role with dated read-model counters, receipt ids or proof snapshots.
- Re-run fresh read-model before touching documents that mention provider SLO, evidence worklist, App/operator drilldown, framework readiness, domain-dispatch, Temporal residency, Developer Mode, OMA consumption or production evidence.
- Avoid MAS/RCA/App dirty lanes unless explicitly taking ownership.
