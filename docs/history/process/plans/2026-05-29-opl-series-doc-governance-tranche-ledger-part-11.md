# OPL series docs governance tranche ledger part 11

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_11`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract、research prompt authority 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 AI-first / executor-first long-horizon support reference 污染：`docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md` 是 research prompt / audit entry，但其长期目标、当前系统评估、family agent audit 和下一轮方向段落仍把 `2026-05-26` live read-model counters、zero-open worklist 和 blocked envelope 数字写成当前支撑事实。

目标是保留该文档的长期 AI-first / executor-first 过滤规则、外部项目吸收规则和审计重点，同时把 App/OMA/conformance/framework readiness/evidence-worklist 状态全部改为 fresh CLI/read-model 读取规则。动态 counters 只记录在本 history ledger。

## Fresh evidence

本轮 live evidence 使用当前 OPL main checkout：

- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`，hard blocker `0`，provider cadence window `window_cadence_satisfied`，provider capability `capability_slo_satisfied`；当前仍有 operator actionable payload-required tail 和 domain-blocked refs-only attention，authority boundary 禁止 domain ready、production ready、artifact authority、quality/export verdict 和 domain truth write。
- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked，`structural_conformance_status=passed`；production evidence tail 仍单独报告，conformance report 不能声明 domain ready。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：`open_worklist_item_count=3`、payload-required item `3`、domain-dispatch workorder `3`、closed refs-only item `309`，`domain_ready_authorized=false`、`production_ready_authorized=false`。三条 open workorder 均为 MAS domain-dispatch refs-only record route，等待 domain/App/live owner receipt、owner-chain/no-regression ref 或 domain-owned typed blocker；OPL 不自造 owner refs。
- `opl runtime app-operator-drilldown --json`：provider cadence/capability satisfied；current control state 仍投影 running provider attempts；domain-dispatch evidence 当前暴露 3 个 payload-required record route；App user path、Developer Mode、OMA 和 Codex App runtime evidence 等 refs-only gates 的状态只能从 fresh drilldown 读取，均不授权 App release ready、domain ready 或 production ready。

These values prove the support reference should not freeze dated App/OMA/conformance/worklist/readiness counters. The durable truth is the AI-first / executor-first design rule plus the live-read-model authority boundary.

## Changes

- Replaced the long-term optimization goal's dated `2026-05-26` App/OMA/conformance/worklist snapshot with a stable fresh-read-model rule.
- Rewrote the current-system evaluation bullet so `framework readiness` is read from live CLI output instead of freezing stale blocker/envelope counters.
- Reframed the OMA audit row so OMA counters and production-consumption ready state are explicitly fresh read-model evidence only, not target-domain or family production authority.
- Rewrote the next-round direction and `evidence_after_contract` paragraphs to require rerunning live read-model before citing App user-path, OMA production-consumption, zero-open worklist, positive open worklist, blocked refs-only envelope, or typed blocker evidence.
- Did not edit source, contracts, tests, MAS/RCA dirty lanes, App release docs, or active truth owner docs.

## Coverage

Reviewed:

- `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`
- `TASTE.md`

Edited:

- `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-11.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue OPL runtime-substrate support/reference coverage for docs that mix active support role with dated read-model counters, proof snapshots, receipt ids, or old proof status strings.
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` and `docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md` retain dated boundary notes for history-bound support; future passes should confirm they remain provenance/negative-guard, not current readiness claims.
- MAS dirty domain-dispatch / AI-reviewer source/test lane and RCA dirty native-PPT lane remain external owner work and were not touched.

## Next tranche write scope

- Continue OPL runtime-substrate support/reference coverage, prioritizing documents that still need live-read-model wording for provider SLO, evidence worklist, App/operator drilldown, framework readiness, domain-dispatch, Temporal residency, Developer Mode, OMA consumption or production evidence.
- If a candidate document is a research prompt, preserve the stable prompt/filtering content and only remove stale current-state counters or claims.
- Avoid MAS/RCA dirty lanes unless explicitly taking ownership.
