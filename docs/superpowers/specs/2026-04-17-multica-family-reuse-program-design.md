# Multica family reuse program design

## Context

- `OPL` family 目前已经在四个仓里分别落下了 `product-entry manifest / frontdesk / family_orchestration / progress or runtime watch` 这一层能力，但实现仍然分散在 Python 与 JavaScript 两套代码里。
- `Multica` 值得吸收的核心不是整个平台依赖，而是它在 `runtime inventory`、`task lifecycle`、`shared skills`、`automation/autopilot`、`agent operations visibility` 这些产品语义上的成熟做法。
- 当前 family 目标已经从“每仓先独立长能力”进入“把重复语义收敛成共享模块”的阶段。本轮的目标是完整推进到可复用模块状态，而不是停在最小 adoption。
- 本轮按用户直接授权更新 `MAS` 当前 gate：允许为 family 共享模块进行跨仓收口、跨仓重构与完整复用实现。后续文档、gate 与状态表述需要同步改写到这一新前提。

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

### 1. 中央共享层放在 `OPL`

`one-person-lab` 作为 family gateway 与 contract authority，新增一组中央共享层，承担：

- family shared schema index
- family example corpus / conformance fixtures
- family normalization rules
- family builder input model
- family validator / parser behavior
- family consumer projection rules

这层是单一 source-of-truth。三个 domain 仓不再各自重新定义共享 companion 的 shape 与规则。

### 2. 本轮要完整收口的 5 类共享模块

#### a. Family runtime inventory

- 对齐 `Multica` 的 runtime registry / runtime ops 语义。
- 收敛 family 统一的 runtime device、provider、availability、health、owner、workspace binding、capability projection。
- `OPL` 负责定义 schema 与 consumer。
- `MAS / MAG / RCA` 负责把各自现有 runtime/status/watch surface 映射到统一 companion。

#### b. Family task lifecycle / run ledger

- 对齐 `Multica` 的 `enqueue -> claim -> start -> complete/fail` 生命周期与 run history。
- family 统一 run/task identity、phase、status、blocker、transcript/summary、session locator、resume locator、checkpoint lineage ref。
- `MAS` 重点接 study runtime / runtime watch / controller decisions。
- `MAG` 重点接 grant progress / route truth / checkpoint summary。
- `RCA` 重点接 product-entry session continuity / rerun lineage / review state。

#### c. Family skill catalog

- 对齐 `Multica` 的 local skills + workspace skills 双层模型。
- family 统一 shared skill descriptor、scope、owner、distribution mode、consumer surface、repo readiness。
- 本机 executor 原生 skills 继续保持本地能力；family 共享层只冻结 repo-tracked shared skills catalog 与 domain adoption contract。

#### d. Family automation / autopilot

- 对齐 `Multica` 的 autopilot/scheduled work 产品语义。
- family 统一 automation descriptor、trigger、target surface、resume contract、gate policy、output expectation。
- `OPL` 提供统一 contract 与 frontdesk 可见性。
- 各 domain 仓接入自己的计划任务、long-run、watch、review 或 publication routine。

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

这轮按程序推进，使用独立 worktree，避免与其他会话冲突：

1. `OPL` worktree：中央共享层与 central consumer
2. `MAS` worktree：gate 更新 + shared adapter 接入
3. `MAG` worktree：shared adapter 接入
4. `RCA` worktree：shared adapter 接入

吸收顺序：

1. 先完成 `OPL` 中央共享层
2. 再并行接入三仓
3. 每仓验证通过后立刻吸收回 `main`
4. 清理对应 worktree 与分支

## Deliverables

### `OPL`

- 新的 family shared contracts
- 新的 shared fixtures / normalizers / validators
- `domain-manifests / dashboard / handoff-envelope / web frontdesk` 的完整消费对齐
- program docs / status / decisions / references 更新

### `MAS`

- gate 与核心文档更新
- shared runtime/task/automation companion 接入
- conformance tests

### `MAG`

- shared task/skill/automation companion 接入
- conformance tests

### `RCA`

- shared runtime/task/skill/automation companion 接入
- conformance tests

## Validation

- `OPL`：`npm run test:meta`，并补充 shared contracts / consumer / fixture drift 测试
- `MAS`：`scripts/verify.sh` + `make test-meta`
- `MAG`：`scripts/verify.sh` + `make test-meta`
- `RCA`：`scripts/verify.sh` + `npm run test:meta`
- 四仓都要有 conformance coverage，证明共享模块 shape、映射与 consumer projection 对齐

## Risks

- 共享层如果只收 schema 不收 builder/validator，三仓很快会继续漂移。
- 共享层如果越权承接 domain truth，会破坏 family owner split。
- 四仓同时推进时，若没有统一的 fixture corpus 与 conformance tests，很容易出现“字段同名、语义不同”的隐性分叉。

## Recommendation

这轮应作为 family reuse program 一次做完整：先把共享 truth、共享规则、共享验证收进 `OPL`，再让 `MAS / MAG / RCA` 作为完整 adapter 接入。这样吸收的是 `Multica` 最成熟的产品语义，同时得到真正可维护的多仓共享模块体系。
