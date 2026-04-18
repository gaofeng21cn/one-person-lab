# Family Runtime/Task/Skill/Automation Full Absorb Design

## Context

- `OPL` 当前已经是 family shared boundary modules 的中央 owner。live `main` 已持有 `managed-runtime-contract`、`hermes_supervision`、`product-entry-companions` 这三批共享 helper，并已被 `MAS / MAG / RCA` 消费。
- 三个 domain repo 当前仍保留四类明显的重复 boundary logic：`family_orchestration` core builder、runtime/task descriptor projection、skill catalog projection、automation/autopilot projection。
- 用户这轮要求按全量版推进，目标是把 family-shared modules 尽量一步到位吸收到中央层，减少今后跨仓修 bug 和重复维护成本。
- `MAS` 当前仍与 `MedDeepScientist` 有更深的 runtime 依赖和研究域差异，但长期目标依然是 `MAS` 自己向 monorepo 演化；因此这轮设计需要把 family shared boundary 和 MAS internal monorepo seam 明确分层。

## Goals

1. 继续以 `OPL` 为 family shared boundary modules 的唯一中央 owner。
2. 把 `family_orchestration`、`runtime inventory / task lifecycle descriptor`、`skill catalog descriptor`、`automation descriptor` 四类共享模块集中进 `OPL` 的 JS/Python shared helper。
3. 让 `MAS / MAG / RCA` 三个 domain repo 改成薄 adapter，只保留 domain-owned truth extraction、field mapping、domain-specific wording 与 action graph truth。
4. 让 `OPL` 顶层 consumer 同步读取并暴露这四类 shared surface，避免顶层再长出 repo-local partial truth。
5. 让 `MAS` 即使未来走 monorepo，也继续通过同一套 family boundary modules 对外暴露 shared surface。

## Non-goals

- 不引入 `Multica` 作为运行时或开发依赖。
- 不新建独立 shared repo。
- 不把 `MAS / MAG / RCA` 的 domain-owned durable truth 搬进 `OPL`。
- 不让 `OPL` 升格成 domain runtime owner。
- 不把 `MAS` 未来的 monorepo internal modules 直接抽成 family shared core。

## Decision

采用 `OPL central shared modules + thin repo adapters + four-repo immediate absorb-back-to-main`。

这条路线最符合当前 family topology：

- `OPL` 已经有 JS + Python 双语共享基座，继续扩展成本最低。
- 三个业务仓已经能消费 OPL git pin，继续向同一 source-of-truth 收拢最稳。
- `MAS` 可以把 monorepo internal core 与 family shared outer contract 分开，长期演化空间最大。

## Shared Ownership Boundary

### OPL centrally owns

- machine-readable contract shape
- JS/Python shared builder / validator / normalizer
- conformance fixtures and tests
- top-level consumer projection rules

### Domain repos continue to own

- domain truth extraction
- domain action graph / route truth / review truth / checkpoint truth
- repo-local command wording
- domain-specific readiness wording
- repo-local schema/tests proving conformance

### MAS special rule

- `MAS` outward family surface 要和 `MAG / RCA` 尽量一致。
- `MAS` inward runtime implementation 可以继续保留 `MedDeepScientist` 依赖、study runtime、controller、eval hygiene 等 monorepo internal concerns。
- 这轮只抽 outward family boundary seam，不抽 MAS inward research core。

## Central Modules To Add

### 1. Family orchestration core

在 `OPL` 新增 shared helper，统一下列 family-level shape：

- `action_graph_ref`
- `human_gates`
- `resume_contract`
- `event_envelope_surface`
- `checkpoint_lineage_surface`
- `review_surface`
- `session locator / run locator`
- optional `recommended_route` or `recommended_step` metadata

JS 侧新增：

- `src/family-orchestration.ts`

Python 侧新增：

- `python/opl-harness-shared/src/opl_harness_shared/family_orchestration.py`

这层只统一 envelope shape 和 builder rule，不统一各 repo 的 graph nodes、route ids、gate wording。

### 2. Family runtime/task descriptors

在 `OPL` 新增 shared helper，统一 runtime/task surface 的最小描述层：

- `runtime_inventory`
- `task_lifecycle`
- `task_locator`
- `checkpoint_summary`
- `resume_surface`
- `progress_surface`
- `run lineage`
- `status summary`

这层的目标是让：

- `MAS` 的 `study_runtime_status / runtime_watch / controller_decisions`
- `MAG` 的 `grant_progress / verification_checkpoint / checkpoint_status / route truth`
- `RCA` 的 `product_entry_session / runtime_watch / rerun lineage / review state`

都能投影成同一类 family descriptor，而不是各自再写一套 summary。

JS 侧新增：

- `src/runtime-task-companions.ts`

Python 侧新增：

- `python/opl-harness-shared/src/opl_harness_shared/runtime_task_companions.py`

### 3. Family skill catalog descriptors

在 `OPL` 新增 shared helper，统一：

- `skill_catalog`
- `skill_descriptor`
- `supported_commands`
- `command_contracts`
- `distribution_mode`
- `owner_scope`
- `consumer_surface`

这层的作用是把 repo 已有的 command/skill truth 投影成 family shared catalog，而不是发明新能力源。

JS 侧新增：

- `src/skill-catalog.ts`

Python 侧新增：

- `python/opl-harness-shared/src/opl_harness_shared/skill_catalog.py`

### 4. Family automation/autopilot descriptors

在 `OPL` 新增 shared helper，统一：

- `automation_descriptor`
- `autopilot_policy`
- `trigger`
- `target_surface`
- `gate_policy`
- `resume_contract`
- `output_expectation`
- `automation readiness summary`

这层吸收：

- `MAS` 的 automation-ready summary / runtime supervision readiness
- `MAG` 的 automation scope / route-action driven automation hints
- `RCA` 的 autopilot continuation board / governance convergence / continuation truth

JS 侧新增：

- `src/automation-companions.ts`

Python 侧新增：

- `python/opl-harness-shared/src/opl_harness_shared/automation_companions.py`

## Consumer Upgrades

### OPL

`OPL` 顶层 consumer 继续是 shared surface 的统一入口。需要同步升级：

- `src/domain-manifest.ts`
- `src/handoff-bundle.ts`
- `src/management.ts`
- `src/product-entry.ts`
- `src/web-frontdesk.ts`

目标：

- 统一 normalize 新增的 `runtime_inventory / task_lifecycle / skill_catalog / automation` surface
- 让 `domain-manifests / handoff-envelope / management / web frontdesk` 一起消费
- 避免顶层继续拼 repo-local heuristic summary

### MAS

从 `MAS` 当前代码里抽出 shared seam：

- `study_runtime_family_orchestration.py`
- `product_entry.py`
- `runtime_watch.py`
- `study_runtime_decision.py`
- `domain_entry_contract.py`
- `policies/automation_ready.py`

保留为 MAS domain-owned 的部分：

- medical/study-specific action graph
- study/runtime/controller truth
- MDS-dependent runtime extraction
- medical overlay skill seed and policy wording

MAS 的目标状态：

- outward family shape 与 `MAG / RCA` 对齐
- inward runtime core 继续允许未来 monorepo 吸收

### MAG

从 `MAG` 当前代码里抽出 shared seam：

- `product_entry.py`
- `route_report.py`
- `hermes_runtime.py`
- `submission_ready.py`
- `hosted_contract_bundle.py`

保留为 MAG domain-owned 的部分：

- grant route truth
- verification checkpoint semantics
- author-side review wording
- package/freeze/submission specifics

### RCA

从 `RCA` 当前代码里抽出 shared seam：

- `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- `packages/redcube-gateway/src/actions/get-product-entry-session.js`
- selected type surfaces under `packages/redcube-gateway/src/types.ts`

保留为 RCA domain-owned 的部分：

- visual deliverable action graph
- operator review gate truth
- deliverable/review/publication wording
- visual-domain runtime/session specifics

## Cross-language Strategy

- 所有 shared boundary modules 都在 `OPL` 同时维护 JS + Python 实现。
- contract 名称、字段名、fail-closed rule、fixture corpus 由 `OPL` 单点冻结。
- Python consumer 统一走 `opl-harness-shared`。
- JS consumer 统一走 `opl-readonly-gateway` export。
- 新增 shared module 必须同步有 JS/Python tests，避免一边领先一边漂移。

## Repo Surfaces To Land In This Tranche

这轮落地后，三个业务仓的 `product_entry_manifest` 或同等级 family surface 至少应统一新增并导出：

- `family_orchestration`
- `runtime_inventory`
- `task_lifecycle`
- `skill_catalog`
- `automation`

`OPL` 顶层 consumer 应能统一读取并展示这些 surface。

## Worktree Strategy

统一使用新开的四个 worktree：

- `/Users/gaofeng/workspace/one-person-lab/.worktrees/family-runtime-task-skill-automation`
- `/Users/gaofeng/workspace/med-autoscience/.worktrees/codex/family-runtime-task-skill-automation`
- `/Users/gaofeng/workspace/med-autogrant/.worktrees/codex/family-runtime-task-skill-automation`
- `/Users/gaofeng/workspace/redcube-ai/.worktrees/codex/family-runtime-task-skill-automation`

吸收顺序：

1. `OPL` 先冻结 shared JS/Python helper、tests、export、顶层 consumer normalize
2. `MAS / MAG / RCA` 并行接入
3. 四仓 fresh verification
4. 逐仓 fast-forward absorb 回 `main`
5. push
6. 清理 worktree 和 feature branch

## Validation

### OPL

- focused JS tests for new shared helpers
- focused Python tests for new shared helpers
- affected top-level consumer tests

### MAS

- focused `product_entry / runtime_contract_docs / family_orchestration / runtime_watch` tests
- related meta verification

### MAG

- focused `product_entry` and route/checkpoint tests
- related meta verification

### RCA

- focused `product-entry / product-entry-session / mcp-gateway` tests
- related meta verification

## Risks

- 若这轮把 domain truth 一起抽进 `OPL`，会破坏长期 owner split。
- 若只抽 helper，不同步改 OPL 顶层 consumer，顶层会继续长 partial truth。
- 若 MAS outward seam 继续跟 `MDS` inward detail 混写，未来 monorepo 与 family shared layer 仍会互相拖拽。

## Recommendation

这轮全量版要一次性把 `family_orchestration + runtime/task descriptors + skill catalog + automation descriptors` 都收进 `OPL`，并让 `MAS / MAG / RCA` 改成薄 adapter。这样后续跨仓 bug 会优先在中央 shared layer 修一次，三个 domain 仓只需要同步 pin 和少量 adapter，最符合“共享模块尽量复用”和“MAS 长线走 monorepo 但 family boundary 继续单源维护”的目标。
