[English](./unified-harness-engineering-substrate.md) | **中文**

# Unified Harness Engineering Substrate

## 文档目的

这份文档定义当前 `OPL` 体系复用的共享 Harness Engineering 语言。
它的任务，是让整个系统家族在同一套边界下推进，而不是假装所有 domain 已经收敛成一个单体 runtime 或一套共享公开代码框架。

## 它是什么

`Unified Harness Engineering Substrate` 是 `OPL` 之下的跨域共享 contract layer。
它冻结多个 domain system 应继承的复用规则，同时保留各自的 domain contract、domain gateway 与 `Domain Harness OS` 实现。

它不是新的 routed hop。
它是横跨下面这些层的共享 contract layer：

- `OPL Gateway / Federation`
- `Domain Gateway`
- `Domain Harness OS`
- future `Execution Plane / Deployment Shape` 的迁移边界

## 它不是什么

这套 substrate 不是：

- “所有 domain 已经使用同一个对象模型”的声明
- “所有 domain 已经运行在同一个共享代码仓”的声明
- 任何 domain gateway 的替代品
- 任何 `Domain Harness OS` 的替代品
- 允许 `OPL` 绕过 domain gateway 直接接管 domain-local execution 的理由
- `OPL` 已经成为 runtime owner 的证明

## 它在架构中的位置

控制链继续保持：

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Domain Gateway
          -> Domain Harness OS
              -> Review / Audit / Delivery Surfaces
```

substrate 横跨这条链路。
它约束共享语言与迁移兼容面，但不替代 routing，也不替代 domain 归属。

## 共享不变量

这套 substrate 冻结这些共享判断：

- `Agent-first` 是默认执行姿态
- 当前 domain 仓统一按 `Auto-only` 主线理解
- 未来如果要出现 `Human-in-the-loop` 产品，应作为 sibling 或 upper-layer product 复用同一套 substrate-compatible contract，而不是把同仓主线改成双模系统
- formal-entry matrix 继续保持显式：默认 formal entry 是 `CLI`，supported protocol layer 是 `MCP`，`controller` 只保留 internal control surface 语义
- 状态迁移、review surface 与 delivery boundary 必须可审计
- deployment shape 可以变化，但不应改写 domain contract

## Shared Runtime Substrate v1

在 `S1`，顶层先冻结 6 组共享对象。
当前冻结的是语言与 ownership boundary，不是共享实现。

### 1. `runtime profile`

- 顶层统一定义：跨本地 host-agent 与 future managed deployment shape 的稳定隔离单元
- 不属于 `OPL` 顶层的部分：domain-local canonical truth、domain 凭据、domain-specific workflow object
- 必须继续留在 domain 内的 truth：profile 在一个 domain 里如何映射到 study、proposal、deck、artifact、policy 等对象

### 2. `session substrate`

- 顶层统一定义：用于 search、resume、audit 与 cross-session linkage 的 durable session / run continuity contract
- 不属于 `OPL` 顶层的部分：domain-specific conversation semantics、domain object mutation rule、domain review truth
- 必须继续留在 domain 内的 truth：一个 session 在特定 domain workflow 里究竟代表什么，以及它允许推进哪些 handle

### 3. `gateway runtime status`

- 顶层统一定义：描述一个 runtime context 是否健康、活跃、已中断、可恢复或正在退出的最小可观测状态面
- 不属于 `OPL` 顶层的部分：domain-specific 业务指标、domain gate 结果、publication truth
- 必须继续留在 domain 内的 truth：特定 domain workflow 如何定义 healthy / promotable run

### 4. `memory provider hook`

- 顶层统一定义：围绕 prefetch、turn sync、delegation sync 与 session-end sync 的共享 hook 面
- 不属于 `OPL` 顶层的部分：全局 user-memory 产品、单一 canonical memory store、domain evidence truth
- 必须继续留在 domain 内的 truth：object memory、evidence memory、decision memory、gate memory 的具体语义

### 5. `delivery / cron substrate`

- 顶层统一定义：用于 scheduled continuation、scheduled reporting 与 durable delivery targeting 的共享合同
- 不属于 `OPL` 顶层的部分：domain-specific delivery object、approval threshold、external publication semantics
- 必须继续留在 domain 内的 truth：什么算 reportable output、deliverable completion、scheduled promotion

### 6. `approval / interrupt / resume`

- 顶层统一定义：围绕 stop、pause、approval、interrupt 与 resume 的长跑控制合同
- 不属于 `OPL` 顶层的部分：全局 tool catalog、全局 approval policy
- 必须继续留在 domain 内的 truth：tool registry 内容、dangerous-action policy、budget limit 与 escalation rule

## 为什么 `S1` 先冻结语言，而不宣称实现

`S1` 只停在顶层 contract freeze，原因是：

- 当前各个 domain 仍保有不同的 runtime 内部结构与产品节奏
- 这 6 组对象还没有被证明已经形成 gateway-owned machine-readable surface
- 在 domain pilot 证明哪些实现真正可复用之前，`OPL` 不应宣称已经拥有共享 execution kernel

因此，`S1` 先落在公开文档与 reference-grade 文档层，而不是直接写进 `contracts/opl-gateway/*.json`。

## Deployment Shape

当前默认的本地 deployment shape 是：

- `Codex-default host-agent runtime`

这只是当前宿主选择，不是 substrate 的身份。
同一套 substrate 还应兼容：

- future managed `Web / API` runtime
- future platform-hosted execution surface

宿主位置变化，不应要求重写 substrate，也不应要求打碎 domain 边界。

## 从共享 substrate 到垂类在线 agent 产品族

这套 substrate 的长期产品含义，不是把 `OPL` 改写成通用长期在线 agent 平台。
它真正服务的是：让 `OPL` 体系逐步演进成一组垂类在线 agent 产品。

在这个结构里：

- `OPL`
  - 继续是顶层 `Gateway / Federation`
- shared runtime substrate
  - 逐步承接长期在线运行所需的跨域共享 runtime contract
- 各个 `Domain Harness OS`
  - 继续持有自己的产品入口、domain object、gate、audit surface、delivery semantics 与 canonical truth

更诚实的推进顺序是：

1. 先冻结 shared runtime substrate 语言
2. 在合适的 domain 里证明成熟的本地产品 runtime pilot
3. 再把真正可复用的实现从 pilot 回抽出来

## 当前 domain 映射

当前 `OPL` 家族可理解为：

- `Med Auto Science`
  - 医学 `Research Ops` 的 `Domain Harness OS`
- `RedCube AI`
  - 视觉交付的 `Domain Harness OS`
- `Med Auto Grant`
  - future 医学 `Grant Ops` 的 `Domain Harness OS` 方向

`OPL` 自己不是第四个 `Domain Harness OS`。
它继续是这些 domain system 之上的顶层 gateway 与 federation 层。

## 延伸阅读

- [OPL 运行模型](./operating-model.zh-CN.md)
- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL 路线图](./roadmap.zh-CN.md)
- [Hermes Agent Runtime Substrate 对标与吸收清单](./references/hermes-agent-runtime-substrate-benchmark.md)
