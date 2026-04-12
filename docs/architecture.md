# OPL 架构

## 顶层分层

`OPL` 的主链路是顶层 federation：

`Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS -> Domain Repository`

## 当前使用链路与目标产品链路

当前真实使用链路仍然是过渡态：

`User -> Codex -> OPL CLI / MCP surface -> OPL Gateway -> Domain Gateway -> Domain Harness OS -> Domain Repository`

这说明当前 `OPL` 还不是独立产品入口；它仍主要作为被开发宿主间接调用的 gateway surface 存在。

目标产品链路应是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter -> Domain Gateway -> Domain Harness OS -> Domain Repository`

其中：

- `OPL Product Entry`
  - 面向用户直接暴露入口，例如本地 launcher / CLI shell、未来 web/chat entry
- `Hermes Kernel`
  - 负责长期在线 runtime substrate，例如 session、memory、scheduler、interrupt / resume、delivery / cron
- `Domain Adapter`
  - 负责把通用 runtime substrate 接入具体 domain contract，而不是重写 domain truth

同样的缺口也存在于三个业务仓：

- 它们今天很多已经具备 `operator entry` 或 `agent entry`
- 但还没有全面长成“用户可直接进入”的轻量 `product entry`
- 因此后续不仅要把 `OPL` 做成 direct entry，也要让各业务仓在各自 scope 内拥有 direct entry

## 统一入口 taxonomy 与 handoff 关系

四仓后续统一使用下面三层入口语义：

- `operator entry`
  - 面向工程操作者的命令、脚本、调试入口
- `agent entry`
  - 面向 `Codex` / Claude Code / OpenClaw 这类 host-agent 的调用入口
- `product entry`
  - 面向最终用户的正式产品入口

`OPL` 的 direct entry 不会替代 domain 仓的 direct entry。
更准确的 family-level 结构应是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`

这意味着顶层和单仓都要成长出产品入口，只是作用域不同：

- `OPL Product Entry`
  - family-level 总入口
- `Domain Product Entry`
  - domain-scoped 轻量入口

二者之间的最小 handoff envelope 应保持一致，至少包括：

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`

## Hermes Kernel Integration 选型

当前顶层已经冻结的选择不是：

- fork / vendor `Hermes-Agent` 代码进 `OPL` 自己长期维护
- 要求用户自己手工安装并理解 `Hermes-Agent` 后再使用 `OPL`

当前冻结的选择是：

- `external kernel, managed by OPL product packaging`

也就是：

- 代码层把 `Hermes-Agent` 视为外部 kernel；
- 产品层由 `OPL` 自己负责 bootstrap、launcher、version pinning、runtime wiring 与受支持版本管理；
- 对用户来说，接触的是 `OPL` 产品入口，而不是一个需要先会 `Hermes` 的拼装流程。

详细对比与运维取舍见：

- `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- `docs/references/family-product-entry-and-domain-handoff-architecture.md`

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
