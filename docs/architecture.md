# OPL 架构

## 顶层分层

`OPL` 的主链路不是具体执行 runtime，而是顶层 federation：

`Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS`

`Domain Repository` 是 repo-tracked truth carrier，不是这条 routing / runtime control chain 的额外一环。

## Shared runtime substrate 的位置

`shared runtime substrate` 不是这条主链上的额外 routed hop。
它是跨 domain 共享的 contract layer，用来约束：

- `OPL Gateway` 的顶层 runtime 命名与边界语言
- `Domain Gateway` 的 formal-entry、status 与 delivery 接缝
- `Domain Harness OS` 的 session、memory、approval 与 interrupt 语义
- future execution plane / deployment shape 的迁移兼容面

当前 `S1 / shared runtime substrate v1` 先冻结 6 组对象：

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron substrate`
- `approval / interrupt / resume`

这层冻结的是共享 contract 与边界，不是统一平台 runtime 实现。

## 结构角色

### 1. OPL 顶层 gateway

- 定义 workstream topology
- 冻结 shared foundation 与 shared substrate 语义
- 管理 admitted domains 与公开入口

### 2. Gateway contracts

- `contracts/opl-gateway/*.json`
- `contracts/opl-gateway/README*`

这层是 machine-readable contract surface，不负责 narrative 协作说明。

### 3. Public docs

- `docs/roadmap*`
- `docs/task-map*`
- `docs/gateway-federation*`
- `docs/operating-model*`
- `docs/unified-harness-engineering-substrate*`
- `docs/opl-runtime-naming-and-boundary-contract*`

这层负责对外讲清 `OPL` 是什么、当前承载什么、不承载什么。

### 4. Reference / history docs

- `docs/references/`
- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

这层保留审计、验收、示例、计划与历史材料，但不反向改写当前主线。

## 当前 domain surfaces

### 已 admitted domains

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops` 线
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops` 入口

### Signal-only / future-direction surface

- `Grant Foundry -> Med Auto Grant`：top-level signal / future direction evidence，不是已 admitted 的 domain gateway，也不满足 `G2` discovery readiness、`G3` routed-action readiness 或 handoff-ready surface

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护，不混为一个入口。
