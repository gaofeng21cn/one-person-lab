# OPL series docs governance tranche ledger part 18

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_18`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、provider readiness oracle、App/operator read model 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内一个 north-star support reference：

- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`

目标是把理想目标态文档保持为 stable north-star / owner-boundary reference，移除固定日期与动态 current-state 锚点，不把 receipt id、worklist counter、provider proof snapshot、branch 状态或本机 binary 诊断写进目标态正文。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` 与 `TASTE.md`：当前工作纪律仍要求 OPL 作为 stage-led framework，`Codex CLI` 为第一公民 executor，Temporal-backed provider 为 production online runtime 必需 substrate，MAS/MAG/RCA 持有 domain truth / quality verdict / artifact authority / owner receipt。
- `docs/active/current-state-vs-ideal-gap.md`：当前 active owner 已承接完成进度、功能/结构差距、证据差距和下一轮 Agent prompt；north-star 参考不应保存 process closeout 或 volatile counters。
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`：roadmap 已提供 live read-model 读取规则，动态状态应从 framework readiness、App/operator drilldown、evidence worklist、conformance 和 default-caller read-model 读取。
- `opl framework readiness --family-defaults --json`：control plane available，hard blocker 0，provider cadence/capability SLO satisfied；open tail 0 仍不授权 domain ready、production ready、artifact authority 或 quality/export verdict。
- `opl agents conformance --family-defaults --json`：4 repos passed，0 blocked，structural conformance passed；production evidence tail separate。
- `opl agents default-callers --family-defaults --json`：32 generated/default caller surfaces，0 blocked surfaces，owner/typed-blocker、no-forbidden-write 和 tombstone/provenance evidence missing count 均为 0；这仍不授权 physical delete ready。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：open worklist 0，closed refs-only 316；`zero_open_worklist_is_completion_claim=false`、`domain_ready_authorized=false`、`production_ready_authorized=false`。
- `opl runtime app-operator-drilldown --json`：App/operator drilldown available，projection policy 为 refs-only，不读取 domain truth、memory body、artifact body 或 verdict。

## Changes

- `opl-family-agent-ideal-state.md`
  - Removed the fixed `Date` metadata from a north-star reference.
  - Added an explicit read rule that this document does not freeze dates, receipt ids, worklist counters, provider proof snapshots, branch state, or local binary diagnostics.
  - Reworded `当前家族` / `当前 Agent 家族目标边界` / `当前使用方式` labels into stable family / default-boundary wording.
  - Kept the durable target chain: Codex-first executor, explicit OPL activation, provider-backed runtime when durable orchestration is needed, selected domain-agent entry, and direct app skill as first-class domain path.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- fresh framework readiness / conformance / default-caller / evidence-worklist / App operator CLI outputs

Edited:

- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-18.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned, or deleted in this tranche.

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining Stale / Retire Candidates

- Continue scanning `docs/references/runtime-substrate/*`, `docs/references/current-support/*`, `docs/references/operating-governance/*`, `docs/runtime/*`, and active/support docs for fixed dates, receipt ids, local-machine proof snapshots, branch/SHA state, stale `current` anchors, old provider status, or compatibility promises.
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` still contains substantial roadmap state and should only be edited with fresh contract/source/read-model evidence; this tranche did not re-cover the whole roadmap.
- RCA dirty native-PPT lane, App dirty release lane, and MAS quality-route worktree remain external active lanes and were not touched.

## Next Tranche Write Scope

- Continue OPL support-reference coverage, preferring small slices that can be verified against live contracts/source/tests/read-model.
- Candidate slices: `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`, `docs/references/current-support/*`, `docs/references/operating-governance/*`, and roadmap sections that still mix durable target state with dated proof snapshots.
- Before editing any support doc that mentions provider readiness, App/operator projection, stage production evidence, default-caller deletion, GraphFlow/GFL, CrewAI, Hermes, Runtime Manager or family ideal state, re-run the fresh CLI/read-model commands and keep dynamic counters out of stable target text.
