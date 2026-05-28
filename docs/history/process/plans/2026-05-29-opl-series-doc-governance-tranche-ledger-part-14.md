# OPL series docs governance tranche ledger part 14

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_14`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、executor contract、readiness oracle、runtime provider contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 executor adapter support reference：`docs/references/runtime-substrate/family-executor-adapter-defaults.md`。该文档仍有 dated `2026-05-20` current-state note、`当前冻结默认` 口径和三仓状态映射，容易让人把 support prose 当成 backend 列表、repo 状态或非默认 executor 安装状态的机器真相。

目标是保留 durable executor boundary：`Codex CLI` 是默认第一公民 executor；`hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 显式非默认 backend/interface；非默认 executor 只承诺连接、生命周期、回执、审计和 fail-closed，不承诺与 Codex CLI 行为、质量、工具语义或 resume 等价。同时把机器真相归回 `contracts/opl-framework/family-executor-adapter-defaults.json`、`src/agent-executor.ts`、stage attempt launch gate、CLI/API 和 conformance read-model。

## Fresh evidence

本轮 live evidence 使用 part 14 worktree：

- `contracts/opl-framework/family-executor-adapter-defaults.json`：默认 executor 为 `codex_cli` / `autonomous` / local Codex default；canonical executor backends 为 `codex_cli`、`hermes_agent`、`claude_code`、`antigravity_cli`；executor registry 的 non-default equivalence 是 `connectivity_lifecycle_receipt_audit_only`；stage-level policy fields 包括 `executor_kind`、`model`、`reasoning_effort`、`provider`、`executor_binding_ref`、`executor_labels`、`required_capabilities` 与 `receipt_requirements`。
- `src/agent-executor.ts`：`AGENT_EXECUTOR_KINDS` 与合同 backend 对齐；`resolveAgentExecutorKind` 默认回落到 `codex_cli`；非默认 policy 缺少 `executor_binding_ref` 时抛出 fail-closed contract error；executor envelope 明确 non-default 只走 receipt/audit，不声明 reasoning/tool/resume/quality equivalence，且 `fallback_allowed=false`。
- `tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts`：默认 attempt launch 选择 `codex_cli` / `default_codex_cli`；`hermes_agent` 缺少 binding ref 时 attempt blocked，原因是 `non_default_executor_binding_ref_missing`；显式 binding ref 后才能进入 queued launch invocation。
- `opl executor doctor --executor codex_cli --json`：当前本机 `codex_cli` ready，binary 来自 PATH，capabilities 包括 `codex_exec`、`json_output`、`session_id`，executor envelope 标记 `selected_executor_is_default_quality_path=true` 且 fallback 不允许。
- `opl executor doctor --executor hermes_agent --json` 与 `opl executor doctor --executor antigravity_cli --json`：当前本机 binary 未配置，返回 `surface_not_found`，`fallback_allowed=false`。这只证明当前本机不能执行该 adapter 且不允许 silent fallback，不证明 adapter 已退役。
- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked，structural conformance passed；authority boundary 禁止 OPL 写 domain truth、memory body 或授权 quality/export，conformance report 不能声明 domain ready。

## Changes

- Replaced the dated `2026-05-20` current-state paragraph with a stable "current reading" section.
- Reframed the document from prose-frozen defaults to support-reference explanation; machine truth now points to contract/source/CLI/read-model.
- Replaced the frozen "three repo current mapping" section with a stable family-reading sequence.
- Clarified that non-default executor doctor missing-binary output is local diagnostics plus fail-closed evidence, not a retirement claim and not a Codex fallback license.
- Reworded "three domain repos" contract guidance to admitted domain / agent repos so the reference matches the current four-repo conformance family including OMA.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `contracts/opl-framework/family-executor-adapter-defaults.json`
- `src/agent-executor.ts`
- `tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`

Edited:

- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-14.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue OPL runtime-substrate support/reference coverage for documents that still mix support role with dated current-state notes, proof snapshots, receipt ids, counters or old proof status strings.
- `docs/references/runtime-substrate/opl-runtime-manager-target.md` has current landing-state prose and should be checked against Runtime Manager contracts, provider read-model and native helper status.
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md` still has `状态锚点: 2026-05-14`; future pass should confirm it remains active support for explicit non-default executor evaluation, not a dated current-state freeze.
- MAS dirty owner-route/currentness lane, RCA dirty native-PPT lane and App dirty remote-backed release lane remain external owner work and were not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage, prioritizing `opl-runtime-manager-target.md`, `family-runtime-attempt-contract.md`, `hermes-agent-truth-reset-and-target-state.md` and `hermes-agent-executor-evaluation.md`.
- Preserve durable support/reference content; only remove stale current-state counters, dated proof claims, obsolete readiness wording or duplicate contract authority.
- Avoid MAS/RCA/App dirty lanes unless explicitly taking ownership.
