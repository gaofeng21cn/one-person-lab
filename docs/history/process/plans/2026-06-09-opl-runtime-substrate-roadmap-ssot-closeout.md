# OPL runtime substrate roadmap SSOT closeout

Owner: `One Person Lab`
Purpose: `runtime_substrate_docs_governance_closeout`
State: `history_provenance`
Machine boundary: 本文只记录 2026-06-09 OPL Doc runtime-substrate 语义治理 tranche。当前 runtime truth 归 `contracts/`、source/tests、CLI/read-model、runtime ledger、provider receipts、domain-owned owner refs 和核心五件套；本文不是 active plan、readiness oracle、provider proof、domain owner receipt 或 production-ready 证据。

## SSOT decision

本轮语义主题是 `runtime substrate / provider / executor boundary`。

Single Source of Truth:

- 当前 active truth / baton: `docs/active/current-state-vs-ideal-gap.md`
- 核心人读真相: `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- Runtime support SSOT: `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- Provider support SSOT: `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- Executor boundary SSOT: `contracts/opl-framework/family-executor-adapter-defaults.json` 与 `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- Attempt / progress projection SSOT: `contracts/opl-framework/family-runtime-attempt-contract.json`
- Production substrate SSOT: `contracts/opl-framework/family-runtime-online-substrate-contract.json`

`docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` 保留为 active support roadmap，只解释 owner split、runtime substrate、stage-led execution、domain skeleton、language/runtime dependency 和 retirement discipline。它不再维护 `Master P0..P5`、`Lane 1..7` 形式的 active execution queue，也不冻结 “已完成 / 待完成” implementation snapshot。

## Covered peer set

本轮读取并分类了以下 peer docs / machine surfaces:

- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/development-document-portfolio.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- `contracts/opl-framework/family-executor-adapter-defaults.json`
- `contracts/opl-framework/family-runtime-online-substrate-contract.json`

## Content disposition

| Content | Disposition |
| --- | --- |
| Temporal production substrate, local provider diagnostic baseline, Hermes provider / Gateway retirement | Covered by core five, runtime naming boundary, Temporal provider support, family runtime online substrate contract. |
| `hermes_agent` explicit non-default executor adapter | Covered by executor adapter contract and Hermes executor evaluation; retained as boundary support, not deleted. |
| Stage attempt / typed queue / closeout / progress projection | Covered by family runtime attempt contract, source/tests and live CLI/read-model. |
| `opl-stage-led-agent-framework-roadmap.md` implementation master/lane long list | Compressed into compact capability map with stable owner / SSOT, current reading and carry-forward gate. |
| Dated proof snapshots, per-domain counters, receipt ids, branch/worktree state and proof ledger details | Routed to history/process ledgers and live machine surfaces; not retained in roadmap as current state. |

## Edited files

- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
  - Replaced the old `Master P0..P5` and `Lane 1..7` execution long list with `实施参考压缩`.
  - Preserved stable capability boundaries: baseline entry, Temporal provider core, Codex stage activity runner, lifecycle primitives, standard domain-agent skeleton, human gate / resume, operator visibility, domain soak / retirement.
  - Removed the competing active queue shape from this support reference.

- `docs/history/process/plans/2026-06-09-opl-runtime-substrate-roadmap-ssot-closeout.md`
  - Records this SSOT decision, peer set, disposition, coverage, remaining scope and verification boundary.

## Not edited

- MAS was only read because its checkout has concurrent controller/test dirty state. This tranche does not touch MAS docs/source/tests.
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` remains as `history_boundary_support` because stale-compat and executor-boundary guards still reference it.
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md` remains as support reference for the explicit non-default executor adapter.
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md` and `family-executor-adapter-defaults.md` remain support references because machine contracts/tests/source still reference their corresponding semantics.

## Remaining series scope

This tranche does not claim full six-repo docs governance completion. Remaining OPL series scope includes:

- OPL root: continue support-reference cleanup where docs still risk freezing dated proof snapshots, receipt ids, provider proof snapshots, branch/SHA state, dynamic counters or second active queues.
- MAS: defer write work until concurrent controller/test dirty state is clear or a docs-only non-overlapping lane is explicitly selected.
- MAG/RCA/OMA/App: continue repo-local SSOT lanes from their active truth owner and core docs; do not infer current status from this OPL roadmap closeout.

## Verification boundary

Minimum verification for this tranche is documentation hygiene plus the focused runtime-substrate no-resurrection / active-path guard. Passing verification proves only that this docs tranche is syntactically clean and does not reintroduce retired active-path wording in guarded references. It does not prove domain ready, App release ready, production ready, owner-chain closure, Temporal long-soak, physical delete authorization or Brand L5.
