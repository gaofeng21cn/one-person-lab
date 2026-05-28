# OPL series docs governance tranche ledger part 17

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_17`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、provider readiness oracle、App/operator read model 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内一个 runtime-substrate support reference：

- `docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md`

目标是保留 durable CrewAI 吸收结论：OPL 只吸收 orchestration contract pattern，不引入 CrewAI runtime、planner、memory owner、executor 或 domain authority；旧 `gateway + federation` 和“四仓 adoption 顺序”只按 history/provenance/negative-guard 阅读。

## Fresh evidence

本轮 live evidence：

- `contracts/family-orchestration/`：当前包含 family event envelope、checkpoint lineage、action graph/catalog、human gate、product-entry manifest v2、Stage Kernel、proof/graph/registry/source/replay 和 Derived Diagnostic Lens schemas。
- `docs/architecture.md` 与 `docs/status.md`：当前读法把 `family-stage-control-plane`、stage admission、proof/replay/cohort/runtime-budget 等 surface 定义为 Stage Kernel / Derived Diagnostic Lenses；它们只投影 warning、recommendation、typed blocker、human gate 或 route-back ref，不授权 domain ready、quality verdict、artifact authority 或 production ready。
- `src/family-orchestration.ts`、`src/family-stage-control-plane.ts`、`src/family-runtime-stage-admission-gate.ts` 和相关 tests：family orchestration / stage surfaces 有 live source/test support；不是单纯 prose plan。
- `opl stages readiness --family-defaults --json`：4 个 domain、19 个 stage 都 admitted，0 hard blocker；summary 明确不能 claim domain ready、artifact authority 或 production ready，GraphFlow runtime dependency false。
- `opl framework readiness --family-defaults --json`：framework control plane available with operator attention；hard blocker 0；provider cadence/capability SLO satisfied；authority boundary forbids domain ready、production ready、artifact authority 和 quality/export verdict。
- `opl agents conformance --family-defaults --json`：4 repos passed，0 blocked，structural conformance passed；production evidence tail separate。
- `opl runtime app-operator-drilldown --json`：App/operator read model available；仍是 refs-only projection，不执行 domain action、不写 domain truth、不创建 owner receipt、不声明 production ready。

## Changes

- `family-orchestration-contract-absorb-crewai.md`
  - Replaced the dated `当前状态说明（2026-05-11）` with a stable "当前读法" section that points to live contracts, source, stage readiness, framework readiness, and App/operator drilldown.
  - Removed the old "四仓 adoption 顺序" table from active-support context.
  - Added a current owner boundary map for event/checkpoint, action/gate/product-entry, Stage Kernel, proof/graph/replay support projections, and Derived Diagnostic Lenses.
  - Added current usage rules: read live machine surfaces for current state, add new semantics to existing contracts/Stage Kernel/Lenses, and keep gateway/federation/direct-entry ordering as provenance.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md`
- `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/references/runtime-substrate/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `contracts/family-orchestration/`
- `contracts/opl-framework/`
- `src/family-orchestration.ts`
- `src/family-stage-control-plane.ts`
- `src/family-runtime-stage-admission-gate.ts`
- family orchestration / stage tests discovered by `rg`
- fresh stage readiness / framework readiness / conformance / App operator CLI outputs

Edited:

- `docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-17.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/references/runtime-substrate/*` for support docs that still mix current support role with receipt ids, fixed counters, branch/SHA state, local-machine proof, old provider status, or compatibility promises.
- Revisit `opl-stage-led-agent-framework-roadmap.md`, `temporal-family-runtime-provider-plan.md`, `opl-managed-runtime-three-layer-contract.md`, `ai-first-executor-first-long-horizon-optimization.md`, and other previously touched runtime-substrate references only for no-resurrection drift; they are not fully re-covered by this tranche.
- RCA dirty native-PPT lane remains external owner work and was not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage by scanning remaining support docs for fixed dates, current-state proof snapshots, old provider status strings, or compatibility promises.
- Prefer small support-reference slices with fresh contract/source/read-model evidence; avoid editing active gap plan unless the current truth itself changes.
- Re-run fresh `framework readiness`, `agents conformance`, `stages readiness`, `evidence-worklist`, `app-operator-drilldown`, and target-specific CLI before editing docs that mention Stage Kernel, Derived Diagnostic Lenses, GraphFlow/GFL, CrewAI, Temporal provider, executor adapter, Runtime Manager, App/operator projection, Hermes, or family ideal state.
