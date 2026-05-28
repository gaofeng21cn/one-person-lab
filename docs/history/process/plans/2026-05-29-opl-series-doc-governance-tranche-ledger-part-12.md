# OPL series docs governance tranche ledger part 12

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_12`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract、readiness oracle 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 managed-runtime three-layer support reference：`docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md` 是人读 owner-split 支撑参考，但正文仍保留 dated `2026-05-14` current-state note，并把“参考文档”写成冻结 machine-readable contract 的载体。

目标是让该文档保留三层 owner split 的 durable 解释，同时把机器合同归回 `contracts/opl-framework/managed-runtime-three-layer-contract.json`、读取实现归回 `src/managed-runtime-contract.ts`、当前 family/conformance/readiness/worklist/App projection 归回 fresh CLI/read-model。

## Fresh evidence

本轮 live evidence 使用 part 12 worktree：

- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked，`structural_conformance_status=passed`；authority boundary 禁止 OPL 写 domain truth、memory body 或授权 quality/export，conformance report 不能声明 domain ready。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`，control plane available，hard blocker counts 均为 0，provider cadence/capability SLO satisfied；仍有 operator attention / refs-only domain-blocked attention，authority boundary 禁止 domain ready、production ready、artifact authority、quality/export verdict 和 domain truth write。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：当前 `open_worklist_item_count=1`、payload-required item `1`、closed refs-only item `312`，`domain_ready_authorized=false`、`production_ready_authorized=false`；open route 只表示等待 domain/App/live owner payload 或 typed blocker。
- `opl runtime app-operator-drilldown --json`：provider cadence/capability SLO satisfied，App/operator drilldown 仍为 refs-only projection；当前 domain-dispatch actionable route 可为 0，同时 blocked / superseded / receipt refs 继续作为 attention 或 history 投影；App/user path、Codex App runtime、Developer Mode 和 OMA 读面均不授权 release ready、domain ready 或 production ready。
- `contracts/opl-framework/managed-runtime-three-layer-contract.json` 是实际 machine-readable owner envelope；`src/managed-runtime-contract.ts` 与 `tests/src/opl-managed-runtime-three-layer-contract.test.ts` 消费并验证该合同。support reference 不能替代这些机器面。

## Changes

- Replaced dated `2026-05-14` current-state note with a stable "current reading" section.
- Reframed the document from "this reference freezes the machine-readable contract" to "this reference explains the owner split; machine truth lives in contracts/source/CLI/read-model".
- Removed the frozen three-domain landing list from the support reference. The current default family is read through fresh conformance/readiness/App/worklist commands, not from prose.
- Added a stable family-reading sequence and explicit rule that worklist counters, blocked envelopes, receipt counts, attempt ids and App/operator counters are dynamic.
- Kept the durable non-goal: `Hermes-Agent` is not restored as default runtime substrate.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/current-development-lines.md`
- `docs/status.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `contracts/opl-framework/managed-runtime-three-layer-contract.json`
- `src/managed-runtime-contract.ts`
- `tests/src/opl-managed-runtime-three-layer-contract.test.ts`

Edited:

- `docs/references/runtime-substrate/opl-managed-runtime-three-layer-contract.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-12.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue OPL runtime-substrate support/reference coverage for documents that still mix support role with dated current-state notes, proof snapshots, receipt ids, counters or old proof status strings.
- `docs/runtime/stage-graph-route-transition-runtime.md` still has `Date: 2026-05-26` and current capability language; future pass should confirm it remains active_support without frozen counters or stale proof claims.
- `docs/references/runtime-substrate/opl-runtime-manager-target.md` contains current landing-state prose and should be checked against fresh Runtime Manager contracts/read-model before further edits.
- MAS dirty owner-route/currentness lane, RCA dirty native-PPT lane and App dirty remote-backed release lane remain external owner work and were not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage, prioritizing `stage-graph-route-transition-runtime.md`, `opl-runtime-manager-target.md`, `family-runtime-attempt-contract.md`, `family-executor-adapter-defaults.md`, `hermes-agent-truth-reset-and-target-state.md` and `hermes-agent-executor-evaluation.md`.
- Preserve durable support/reference content; only remove stale current-state counters, dated proof claims, obsolete readiness wording or duplicate contract authority.
- Avoid MAS/RCA/App dirty lanes unless explicitly taking ownership.
