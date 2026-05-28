# OPL series docs governance tranche ledger part 15

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_15`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、readiness oracle、provider proof 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内两个 runtime-substrate support references：

- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`

目标是保留 durable Runtime Manager / attempt contract boundary，同时移除支撑文档里容易冻结的 current landing-state、fixture/proof snapshot、readiness wording 和 evidence-tail completion 口径。本文不接管 `family-executor-adapter-defaults.md`，因为 part 14 已在 `413b20e2` 折回 main；也不触碰 MAS domain-dispatch / AI-reviewer dirty lane 或 RCA native-PPT dirty lane。

## Fresh evidence

本轮 live evidence 使用 part 15 worktree：

- `contracts/opl-framework/runtime-manager-contract.json`：Runtime Manager owns provider selection、typed family queue、stage attempt ledger、dispatch contracts、profile wiring、diagnostics、task registration hydration、status projection、optional native helper catalog 和 state indexes；domain repos keep truth / quality authority。
- `contracts/opl-framework/native-helper-contract.json` 与 `package.json`：native helper lifecycle 由 `native:build`、`native:doctor`、`native:prebuild*`、`native:repair`、`native:test` 和 `native:family-smoke` 支撑；helper non-goals 明确不是 scheduler kernel、session/memory store、domain truth owner、concrete executor 或 Python domain logic replacement。
- `contracts/opl-framework/family-runtime-attempt-contract.json`、`docs/runtime/README.md` 和 related tests：`stage_progress_log` 与 `attempt_true_path_proof` 是 refs-only progress / true-path surfaces，绑定 attempt query、queue inspect、App drilldown、Temporal visibility 和 debug refs；不授权 long-soak、domain ready、artifact authority、owner receipt 或 quality verdict。
- `opl framework readiness --family-defaults --json`：framework control plane available with blocked refs-only attention；framework hard blocker 0；provider SLO cadence/capability satisfied；domain blocked attention and typed blocker refs remain refs-only attention; authority boundary forbids domain ready / production ready / artifact authority / quality verdict。
- `opl agents conformance --family-defaults --json`：4 repos passed, 0 blocked, structural conformance passed；production evidence tail is reported separately and does not authorize domain ready。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：selected/effective provider `temporal`, selected executor `codex_cli`, zero open worklist but `zero_open_worklist_is_completion_claim=false`, `domain_ready_authorized=false`, `production_ready_authorized=false`。
- `opl runtime app-operator-drilldown --json`：App/operator drilldown available; summary exposes dynamic `stage_progress_log`, `attempt_true_path_proof`, provider SLO, runtime manager route support and blocked/domain evidence counters; authority boundary remains refs-only and forbids domain action execution, body access, artifact mutation, quality/export/submission verdict。

## Changes

- Replaced `opl-runtime-manager-target.md`'s frozen current landing-state paragraph with a currentness policy that points to contracts/source/tests/CLI/read-model.
- Reframed the "当前要落地的最小面" section into "当前读法与机器入口", mapping Runtime Manager contract, provider-backed runtime, route support, evidence worklist, native helper lifecycle, and stage progress/true path surfaces to their live owners and boundaries.
- Retired the active-looking Hermes cron bridge wording into history/provenance/negative-guard semantics; Temporal-backed provider remains the required production substrate.
- Added currentness policy to `family-runtime-attempt-contract.md`, making clear that attempt count, running/blocked state, Temporal visibility, `stage_progress_log`, `attempt_true_path_proof`, worklist and drilldown counters must be read from live CLI/read-model rather than frozen prose.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/README.md`
- `docs/status.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/runtime/README.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `contracts/opl-framework/runtime-manager-contract.json`
- `contracts/opl-framework/native-helper-contract.json`
- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `package.json`
- related runtime/App/operator tests discovered by `rg`

Edited:

- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-15.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue OPL runtime-substrate support/reference coverage for `hermes-agent-truth-reset-and-target-state.md` and `hermes-agent-executor-evaluation.md`; both should be checked for dated state anchors, Hermes provider/readiness residue, proof snapshots, and compatibility wording.
- Continue scanning `docs/references/runtime-substrate/*` for support docs that still mix current support role with receipt ids, fixed counters, branch/SHA state, local-machine proof or old provider status.
- MAS dirty owner-route/currentness lane, RCA dirty native-PPT lane and any App release lane remain external owner work and were not touched.

## Next tranche write scope

- Prioritize `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` and `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`.
- Preserve durable executor / provider / diagnostic boundary; remove only stale current-state counters, dated proof claims, obsolete readiness wording or duplicate contract authority.
- Re-run fresh `framework readiness`, `agents conformance`, `evidence-worklist` and `app-operator-drilldown` before editing any document that names provider SLO, Runtime Manager, Hermes, executor adapter, stage progress, attempt proof or App/operator drilldown.
