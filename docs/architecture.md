# OPL 架构

## 顶层分层

`OPL` 的主链路是顶层 federation：

`Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS -> Domain Repository`

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

这层负责对外讲清 `OPL` 的角色、当前承载范围与 domain 边界。

### 4. Reference / history docs

- `docs/references/`
- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

这层保留审计、验收、示例、计划与历史材料，但不反向改写当前主线。

## 当前 admitted domains

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops` 线
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops` 入口
- `Grant Foundry -> Med Auto Grant`：public signal / future direction

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护，不混为一个入口。
