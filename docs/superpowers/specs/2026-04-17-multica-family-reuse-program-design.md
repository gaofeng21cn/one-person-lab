# Multica family reuse program design

## Context

- `OPL` family 目前已经在四个仓里分别落下了 `product-entry manifest / frontdesk / family_orchestration / progress or runtime watch` 这一层能力，但实现仍然分散在 Python 与 JavaScript 两套代码里。
- `Multica` 值得吸收的核心不是整个平台依赖，而是它在 `runtime inventory`、`task lifecycle`、`shared skills`、`automation/autopilot`、`agent operations visibility` 这些产品语义上的成熟做法。
- 当前 family 目标已经从“每仓先独立长能力”进入“把重复语义收敛成共享模块”的阶段。本轮的目标是完整推进到可复用模块状态，而不是停在最小 adoption。
- 本轮按用户直接授权更新 `MAS` 当前 gate：允许为 family 共享模块进行跨仓收口、跨仓重构与完整复用实现。后续文档、gate 与状态表述需要同步改写到这一新前提。
- 对本地 `shared-family-modules` 与 live main 的 fresh audit 已经确认：`OPL main` 现已持有 `src/managed-runtime-contract.ts` 与 `python/opl-harness-shared/` 这组第一批共享实现；`MAG main` 已经在 `src/med_autogrant/product_entry.py` 复用 `opl_harness_shared.managed_runtime`；`RCA main` 已经在 `packages/redcube-gateway/src/actions/get-product-entry-manifest.js` 复用 `opl-readonly-gateway/managed-runtime-contract`；`MAS main` 仍保留本地 `managed_runtime` builder、`hermes_supervision` 公共逻辑复制体，以及旧 gate wording。本轮 program 要直接沿这条已落地基座继续扩，而不是再发明第二套共享层。

## Goals

1. 把 `Multica` 中适合 OPL family 的能力吸收到中央共享层，而不是把 `Multica` 直接拉成核心运行时依赖。
2. 在 `OPL` 建立 family-level 单一 source-of-truth，覆盖共享 schema、共享 corpus、共享 builder 规则、共享 conformance 验证。
3. 让 `MAS / MAG / RCA` 三个 domain 仓完整接入同一套共享模块，只保留 domain-owned truth 和 domain-specific mapping。
4. 提高多仓复用率，让今后 family companion、frontdesk companion、runtime/task/skill/automation surface 的新增变化优先改一处、同步三仓。

## Non-goals

- 不引入 `Multica` 作为 OPL、MAS、MAG、RCA 的直接产品依赖。
- 不把 `OPL` 改写成 domain runtime owner。
- 不把三仓 domain-owned durable truth 抽空成一个跨仓单体业务核心。
- 不在本轮引入新的 hosted runtime owner 叙事，`Hermes-Agent` 的定位继续保持为外部 runtime substrate。

## Decision

### 方案 A：继续按仓分别吸收，再靠文档和 schema 保持一致

- 优点：每仓可独立推进。
- 问题：很快又会长回四套同义实现，复用率低。

### 方案 B：新建独立 shared repo，直接放共享 runtime/core

- 优点：结构最纯。
- 问题：需要提前打开新的依赖治理、发布、版本同步和 runtime ownership 议题，超出本轮最短路径。

### 方案 C：`OPL` 中央 source-of-truth + 共享模块 + 三仓完整接入

- 优点：最符合当前 family topology。
- 优点：定义、schema、fixtures、validation、normalization 可以集中维护。
- 优点：能同时兼容 Python 与 JavaScript 仓。

结论：采用方案 C。

## Design

### 0. 先吸收已落地的 shared-family-modules 成果，再做增量扩展

- `OPL` 当前中央共享层已经不是纯 contract-only 状态，现有 JS helper 与 Python 子包就是本轮 program 的统一基座。
- `MAG` 与 `RCA` 当前已经完成第一步 consumer intake，因此本轮不再重开一轮 `managed_runtime_contract` 抽取；它们后续只继续接新的 shared runtime/task/skill/automation 模块。
- `MAS` 当前是四仓里唯一还没有把这批共享 helper 接到 live main 的 repo，因此它会成为本轮第一条明确的 consumer catch-up lane，同时承接 gate 文档改写。
- 本轮所有新增共享能力都继续放进同一布局：`OPL/contracts/` 持有 machine-readable truth，`OPL/src/` 持有 JS helper，`OPL/python/opl-harness-shared/` 持有 Python helper；不新开独立 shared repo。

### 1. 中央共享层放在 `OPL`

`one-person-lab` 作为 family gateway 与 contract authority，新增一组中央共享层，承担：

- family shared schema index
- family example corpus / conformance fixtures
- family normalization rules
- family builder input model
- family validator / parser behavior
- family consumer projection rules

这层是单一 source-of-truth。三个 domain 仓不再各自重新定义共享 companion 的 shape 与规则。
当前这层的第一批已落地实现就是：

- `src/managed-runtime-contract.ts`
- `python/opl-harness-shared/src/opl_harness_shared/managed_runtime.py`
- `python/opl-harness-shared/src/opl_harness_shared/hermes_supervision.py`

本轮新增共享模块要直接复用同一发布与消费路径。

### 2. 本轮要完整收口的 5 类共享模块

#### a. Family runtime inventory

- 对齐 `Multica` 的 runtime registry / runtime ops 语义。
- 收敛 family 统一的 runtime device、provider、availability、health、owner、workspace binding、capability projection。
- `OPL` 负责定义 schema 与 consumer。
- `MAS / MAG / RCA` 负责把各自现有 runtime/status/watch surface 映射到统一 companion。
- 这一层以当前 `managed_runtime_contract + hermes_supervision` 为基础继续扩展，而不是旁路新造 runtime helper。

#### b. Family task lifecycle / run ledger

- 对齐 `Multica` 的 `enqueue -> claim -> start -> complete/fail` 生命周期与 run history。
- family 统一 run/task identity、phase、status、blocker、transcript/summary、session locator、resume locator、checkpoint lineage ref。
- `MAS` 重点接 study runtime / runtime watch / controller decisions。
- `MAG` 重点接 grant progress / route truth / checkpoint summary。
- `RCA` 重点接 product-entry session continuity / rerun lineage / review state。
- `MAG` 当前已经有最完整的 `checkpoint_status / verification_checkpoint / route truth` durable truth；`RCA` 当前已经有最完整的 `product_entry_session / runtime watch / rerun linkage`；`MAS` 当前已经有最完整的 `study_runtime_status / controller_decisions / recovery lane`。本层应直接把这三类现成 truth 投影成 shared ledger，而不是让三仓再各写一个“run status summary”。

#### c. Family skill catalog

- 对齐 `Multica` 的 local skills + workspace skills 双层模型。
- family 统一 shared skill descriptor、scope、owner、distribution mode、consumer surface、repo readiness。
- 本机 executor 原生 skills 继续保持本地能力；family 共享层只冻结 repo-tracked shared skills catalog 与 domain adoption contract。
- `MAG` 当前 `supported_commands / command_contracts` 已经最接近 catalog-ready 形态；`OPL` 与 `RCA` 当前的 product/frontdesk 命令面可以直接作为 catalog consumer；`MAS` 则重点提供 workspace/study/runtime 类 skill descriptor。

#### d. Family automation / autopilot

- 对齐 `Multica` 的 autopilot/scheduled work 产品语义。
- family 统一 automation descriptor、trigger、target surface、resume contract、gate policy、output expectation。
- `OPL` 提供统一 contract 与 frontdesk 可见性。
- 各 domain 仓接入自己的计划任务、long-run、watch、review 或 publication routine。
- `RCA` 当前的 `phase_2_family_parity_autopilot_continuation_board`、`phase_2_family_parity_governance_surface_convergence` 与 `autopilot closeout evidence` 是这层最直接的 baseline；`MAS` 的 `phase3_clearance_lane / runtime supervision` 和 `MAG` 的 route/action contract 提供另外两条成熟输入。

#### e. Family product-entry companion expansion

- 在现有 `family_orchestration` 基础上扩展 runtime/task/skill/automation companion。
- `product-entry manifest / frontdesk / cockpit / progress/runtime watch` 最终都消费同一份共享 companion 规则。
- `OPL` 的 `domain-manifests / dashboard / handoff-envelope / web frontdesk` 统一读取扩展后的共享面。

### 3. 共享模块分三层

#### Layer 1: machine-readable contracts

放在 `OPL/contracts/`，作为 frozen truth：

- schema
- schema index
- compatibility notes
- example payloads

#### Layer 2: shared corpus and validation

放在 `OPL` repo 的共享源码与测试里：

- fixture corpus
- normalizers
- validation helpers
- consumer projection helpers
- contract drift tests

#### Layer 3: repo adapters

每个 domain 仓只保留：

- domain-owned truth extraction
- domain field mapping
- repo-local command/surface locator
- repo-local tests proving conformance

这层不再自己发明共享 shape。

### 4. 跨语言复用策略

因为 family 同时覆盖 Python 与 JavaScript：

- 共享 truth 与 fixtures 放在 `OPL`
- Python 仓通过共享 schema/corpus 对齐 builder 和 validator
- JavaScript 仓通过共享 schema/corpus 对齐 types、builder、validator
- 若需要代码生成，生成输入也由 `OPL` 中央维护

目标是“定义一处、适配多处”，而不是“复制同义实现再手动保持一致”。

### 5. 四仓实施边界

#### `OPL`

- 新增并维护 family shared modules
- 更新 consumer surfaces 与 central docs
- 作为四仓 conformance authority

#### `MAS`

- 更新 gate 与文档口径，允许本轮跨仓共享模块收口
- 把 `product_entry / runtime_watch / study_runtime_status / controller_decisions` 接入共享 runtime/task/automation companion
- 保留 research domain truth 与 controlled backend truth

#### `MAG`

- 把 `product_entry / grant_progress / checkpoint / route truth` 接入共享 task/skill/automation companion
- 保留 author-side truth 与 route truth 单源读取

#### `RCA`

- 把 `product entry / session continuity / rerun linkage / review state / runtime watch` 接入共享 runtime/task/skill/automation companion
- 保留 deliverable domain truth

### 6. Worktree strategy

这轮继续使用独立 worktree，但工作树策略按“已吸收到哪、剩余哪里要写”来分配：

1. `OPL` 当前这条 `multica-family-reuse-program` worktree 继续承担 program authority、中央共享层增量与后续 central consumer 收口。
2. `MAS` 新开 fresh `main` worktree，承担 shared helper catch-up、gate 改写与 runtime/task/automation adapter 接入。
3. `MAG` 新开 fresh `main` worktree，基于已 landed 的 `managed_runtime` 复用继续补 task/skill/automation companion。
4. `RCA` 新开 fresh `main` worktree，基于已 landed 的 JS helper 复用继续补 task/automation/autopilot companion。

并行顺序：

1. 先冻结 `OPL` 中央共享模块文件名、schema 名与 helper export。
2. 再让 `MAS / MAG / RCA` 并行接同一套 shared module contract。
3. 三仓 adapter 稳定后，再把 `OPL domain-manifests / dashboard / handoff-envelope / web frontdesk` 一次收口到新 companion。
4. 每仓验证通过后立刻吸收回 `main`，再清理对应 worktree 与分支。

## Deliverables

### `OPL`

- 新的 family shared contracts
- 新的 shared fixtures / normalizers / validators
- `domain-manifests / dashboard / handoff-envelope / web frontdesk` 的完整消费对齐
- program docs / status / decisions / references 更新

### `MAS`

- gate 与核心文档更新
- 现有本地 `managed_runtime` / `hermes_supervision` 公共逻辑改为直接复用 `opl-harness-shared`
- shared runtime/task/automation companion 接入
- conformance tests

### `MAG`

- 在已 landed `managed_runtime` 复用基础上继续补 shared task/skill/automation companion
- conformance tests

### `RCA`

- 在已 landed JS `managed_runtime` 复用基础上继续补 shared runtime/task/automation companion
- conformance tests

## Validation

- `OPL`：`npm run build`、`npm test`、`npm run test:meta`、`pytest python/opl-harness-shared/tests -q`
- `MAS`：`pytest tests/test_product_entry.py tests/test_mainline_status.py tests/test_runtime_contract_docs.py -q`、`scripts/verify.sh meta`、`scripts/verify.sh`
- `MAG`：`pytest tests/test_product_entry.py tests/test_stage_router.py tests/test_hosted_contract_bundle.py tests/test_submission_ready_package.py -q`、`scripts/verify.sh meta`、`scripts/verify.sh`
- `RCA`：`npm test`、`npm run test:meta`、`scripts/verify.sh`
- 四仓都要有 conformance coverage，证明共享模块 shape、映射与 consumer projection 对齐

## Risks

- 共享层如果只收 schema 不收 builder/validator，三仓很快会继续漂移。
- 共享层如果越权承接 domain truth，会破坏 family owner split。
- 四仓同时推进时，若没有统一的 fixture corpus 与 conformance tests，很容易出现“字段同名、语义不同”的隐性分叉。

## Recommendation

这轮应直接踩在当前已吸收到 `main` 的 shared helper 基座上继续做完整收口：`OPL` 继续扩中央 truth 与 helper，`MAS` 先补齐 live catch-up，`MAG / RCA` 在现有 shared helper intake 上继续接 task/skill/automation。这样能最快把 `Multica` 的成熟产品语义吸收成真正可维护的 family shared modules。
