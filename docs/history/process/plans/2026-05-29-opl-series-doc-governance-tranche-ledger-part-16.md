# OPL series docs governance tranche ledger part 16

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_16`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、executor readiness oracle、provider proof 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内两份 Hermes runtime-substrate support references：

- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`

目标是保留 `hermes_agent` canonical 显式非默认 executor adapter/backend 的现行边界，同时把旧 Hermes provider / Gateway / readiness / compatibility / substrate 叙述改成稳定的 history/provenance/negative-guard 读法。本文不接管 MAS owner-route dirty lane、RCA native-PPT dirty lane、App release lane，也不修改 executor contract 或 source。

## Fresh evidence

本轮 live evidence 使用 part 17 worktree与主 checkout：

- `contracts/opl-framework/family-executor-adapter-defaults.json`：canonical executor backends 仍为 `codex_cli`、`hermes_agent`、`claude_code`、`antigravity_cli`；`hermes_agent` 是 experimental explicit non-default backend，并受 full-agent-loop proof / not-provider-or-gateway guardrail 约束。
- `src/agent-executor.ts` 与 tests：非默认 executor 缺 binary、缺 JSON receipt、缺 full-loop tool-event proof 时 fail closed；`fallback_allowed=false`。
- `opl executor doctor --executor codex_cli --json`：本机 `codex_cli` ready，binary `/opt/homebrew/bin/codex`，default quality path，fallback false。
- `opl executor doctor --executor hermes_agent --json`：当前本机 `hermes_agent` binary 未配置，返回 `surface_not_found` / `hermes_agent_binary_missing` / `fallback_allowed=false`；这是诊断事实，不把 adapter 退役，也不允许回退到 Codex。
- `contracts/opl-framework/runtime-manager-contract.json`：standard agent default runtime path 是 `opl_temporal_hosted_autonomous`；Temporal 是 production required provider，`local_sqlite` 只作 dev/CI/offline diagnostic baseline。
- `opl framework readiness --family-defaults --json`：framework control plane 可用，hard blocker 0，provider SLO cadence/capability satisfied；blocked refs-only attention 仍不授权 domain ready / production ready。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`：selected/effective provider `temporal`，selected executor `codex_cli`，open worklist 0，closed refs-only 315，`zero_open_worklist_is_completion_claim=false`，`domain_ready_authorized=false`，`production_ready_authorized=false`。

## Changes

- Replaced dated Hermes reset status wording with a currentness policy that points to executor/provider contracts, source, executor doctor, readiness and worklist read models.
- Reframed the old "当前四仓的真实状态" section as historical Hermes-misread boundary; per-repo current truth is now explicitly routed back to each repo's active truth, contracts/source/tests and receipt/read-model surfaces.
- Removed active-looking local-state claims from RedCube AI and MAG paragraphs; retained only the no-upstream-Hermes-substrate boundary.
- Replaced the Hermes executor evaluation date anchor with a live machine-entry currentness policy.
- Changed local-machine default model/reasoning wording into a contract/source/doctor read-model rule, so the support reference no longer freezes this host's Codex defaults.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/README.md`
- `docs/status.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- `contracts/opl-framework/family-executor-adapter-defaults.json`
- `contracts/opl-framework/runtime-manager-contract.json`
- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `src/agent-executor.ts`
- `src/agent-lab-stage-executor-policy.ts`
- related executor/stale-compat tests discovered by `rg`

Edited:

- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-16.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/references/runtime-substrate/*` for support docs that still mix current support role with fixed receipt ids, host-local proof snapshots, branch/SHA state, old provider status or active-looking migration instructions.
- Continue whole-portfolio coverage for OPL `docs/references/current-support/*` and `docs/references/operating-governance/*`; several still need section-level currentness checks against live contracts/tests/read-model.
- MAS dirty owner-route/currentness lane, RCA dirty native-PPT lane and any App release lane remain external owner work and were not touched.

## Next tranche write scope

- Prioritize remaining OPL runtime/reference support docs that mention provider proof, App/operator drilldown, current counters, release evidence, native helper lifecycle or stale `current` status anchors.
- Preserve durable executor / provider / diagnostic boundary; remove only stale current-state counters, dated proof claims, obsolete readiness wording or duplicate contract authority.
- Re-run fresh `framework readiness`, `agents conformance`, `evidence-worklist`, `executor doctor` and `app-operator-drilldown` before editing any document that names provider SLO, Runtime Manager, Hermes, executor adapter, stage progress, attempt proof or App/operator drilldown.
