# OPL series docs governance tranche ledger part 16

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_16`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、executor contract、provider readiness oracle、runtime proof 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内两个 Hermes runtime-substrate support references：

- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`

目标是保留 durable Hermes boundary：旧 Hermes provider / Gateway / proof-provider / readiness / compatibility surface 只作为 history/provenance/diagnostic/negative-guard 阅读；`hermes_agent` 只作为 canonical 显式非默认 executor adapter/backend，必须走 binding/receipt/audit/fail-closed，不承诺与 `Codex CLI` 行为、质量、工具语义或 resume 等价。

## Fresh evidence

本轮 live evidence：

- `contracts/opl-framework/family-executor-adapter-defaults.json`：canonical executor backends 包含 `codex_cli`、`hermes_agent`、`claude_code`、`antigravity_cli`；default executor 是 `codex_cli`；non-default equivalence 是 `connectivity_lifecycle_receipt_audit_only`；non-default executor requires explicit selection and forbids silent Codex fallback。
- `contracts/opl-framework/runtime-manager-contract.json`：Runtime Manager 是 provider-backed control plane / typed queue / stage attempt ledger / dispatch and projection boundary，不是 Hermes provider、Gateway、domain truth owner 或 executor-equivalence proof。
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`：当前 support reference 已把 executor machine truth 指回 contract、`src/agent-executor.ts`、stage attempt launch gate、CLI/API 与 conformance read-model。
- `opl executor doctor --executor codex_cli --json`：当前本机 `codex_cli` ready，binary 来自 PATH，capabilities 包含 `codex_exec`、`json_output`、`session_id`，executor envelope 标记 `selected_executor_is_default_quality_path=true` 且 `fallback_allowed=false`。
- `opl executor doctor --executor hermes_agent --json`：当前本机返回 `surface_not_found` / `hermes_agent_binary_missing`，`fallback_allowed=false`。这只证明当前环境不能执行该 adapter 且不允许 fallback，不证明 adapter 已退役或可以由 Codex 代跑。
- `opl agents conformance --family-defaults --json`：4 repos passed，0 blocked，structural conformance passed；production evidence tail 单独报告，不授权 domain ready。
- `opl framework readiness --family-defaults --json`：framework control plane available with blocked refs-only attention；hard blocker 0；provider cadence/capability SLO satisfied；authority boundary forbids domain ready、production ready、artifact authority、quality verdict 和 domain truth write。

## Changes

- `hermes-agent-truth-reset-and-target-state.md`
  - Replaced the dated `2026-05-14 更新` callout with a stable "当前读法" section pointing to executor contract, `src/agent-executor.ts`, stage launch gates, executor doctor, conformance, and framework readiness.
  - Reframed "当前四仓的真实状态" into "历史四仓误读来源", so OPL/RCA/MAS/MAG statements are read as provenance for the Hermes-first reset rather than current repo-state truth.
  - Preserved the durable rule that repo-local helper/shim/scaffold does not equal upstream Hermes-Agent integration.
- `hermes-agent-executor-evaluation.md`
  - Removed the fixed `状态锚点: 2026-05-14`.
  - Added "当前读法" that points to live contract/source/CLI/read-model instead of freezing local install/proof state.
  - Added a fail-closed note for missing non-default executor binary: missing `hermes_agent` only means current environment cannot execute it and fallback is disallowed; it is not a retirement claim or Codex fallback license.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/references/runtime-substrate/README.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `contracts/opl-framework/family-executor-adapter-defaults.json`
- `contracts/opl-framework/runtime-manager-contract.json`
- `src/agent-executor.ts` and `src/agent-lab-stage-executor-policy.ts` references discovered by `rg`
- executor doctor / conformance / framework readiness CLI outputs

Edited:

- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-16.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/references/runtime-substrate/*` for support docs that still mix current support role with receipt ids, fixed counters, branch/SHA state, local-machine proof or old provider status.
- Revisit older history / compatibility / convergence-governance entries only when active docs link to them as support references; otherwise keep them as provenance.
- RCA dirty native-PPT lane remains external owner work and was not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage by scanning remaining support docs for fixed dates, current-state proof snapshots, old provider status strings, or compatibility promises.
- Prefer `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`, `family-orchestration-contract-absorb-crewai.md`, and `opl-family-agent-ideal-state.md` only after re-reading their live owner boundaries and current support role.
- Re-run fresh `framework readiness`, `agents conformance`, `evidence-worklist`, `app-operator-drilldown`, and any target-specific CLI before editing docs that mention provider SLO, executor adapter, Runtime Manager, App/operator projection, Hermes, GraphFlow, CrewAI, or family ideal state.
