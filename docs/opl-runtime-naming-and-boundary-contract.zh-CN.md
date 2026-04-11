[English](./opl-runtime-naming-and-boundary-contract.md) | **中文**

# OPL Runtime 命名与边界合同

## 文档目的

这份文档冻结当前 `OPL` 体系里的 runtime 相关命名，避免下面这些层继续被混写：

- 顶层 `Gateway / Federation`
- shared runtime substrate
- `Domain Gateway`
- `Domain Harness OS`
- `Execution Plane`
- `Deployment Shape`

它回答四个问题：

1. 当前各个仓库分别属于哪一层。
2. `Codex-default host-agent runtime` 与 future managed runtime 是什么关系。
3. `S1` 到底冻结哪些 shared runtime substrate 对象。
4. 哪些 truth 必须继续留在 domain 内，而不能上收到 `OPL` 顶层。

## 适用范围

这份合同治理当前 `OPL` 体系公开使用的统一命名与边界语言，覆盖：

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

它冻结的是命名与边界。
它**不**宣称整个体系已经拥有：

- 一套共享 execution core
- 一套平台托管的共享 execution layer
- 一个统一的 hosted product entry

## 规范控制链

控制链继续保持：

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Domain Gateway
          -> Domain Harness OS
```

这条控制链下面仍然有真实层级，但它们不是额外的 routed hop：

- `shared runtime substrate`
  - 约束 runtime 命名、迁移兼容性与共享不变量的 cross-domain contract layer
- `Execution Plane`
  - 真正负责 session、run、watch、stop、resume 的 runtime 执行层
- `Deployment Shape`
  - execution plane 运行在哪里，以及其生命周期由谁持有

因此，substrate 是共享 contract layer，不是夹在 `OPL Gateway` 与 `Domain Gateway` 之间的新路由层。

## 规范术语

| 术语 | 冻结含义 | 当前或未来例子 | 明确不等于 |
| --- | --- | --- | --- |
| `OPL Gateway / Federation` | 顶层任务语义、跨域路由语言、admission 语言与边界冻结 | `one-person-lab` | domain-local runtime owner |
| `shared runtime substrate` | 多个 domain 可复用的跨域 runtime contract layer | `runtime profile`、`session substrate`、`gateway runtime status` | 今天已经实现完成的共享执行内核 |
| `Domain Gateway` | 某个 domain 的稳定 formal entry 与公开合同面 | `MedAutoScience`、`RedCube AI` | execution engine |
| `Domain Harness OS` | 某个 domain 的执行、治理、审计与交付系统 | `MedAutoScience`、`RedCube AI` | 顶层 federation |
| `Execution Plane` | 真正驱动 session、run、stop、resume、watch、recovery 的 runtime 层 | 各 domain 当前受控 runtime | 对外产品身份 |
| `Host-Agent Runtime` | 由用户可控机器上的 host agent 驱动 execution plane 的本地部署形态 | 当前 `Codex-default host-agent runtime` | managed runtime |
| `Managed Runtime` | execution plane 由平台托管，生命周期、调度、隔离与恢复都由平台持有的部署形态 | future managed `Web / API` runtime | 当前公开主线 |

## 当前仓库角色

| 仓库 | 当前冻结角色 | runtime 关系 |
| --- | --- | --- |
| `one-person-lab` | `OPL Gateway / Federation` 的公开说明面与 contract-first surface | 负责定义语言与边界，不持有 runtime ownership |
| `med-autoscience` | 医学 `Research Ops` 的 `Domain Gateway + Domain Harness OS` | 持有医学 domain contract、治理、交付与后续 pilot 吸收 |
| `redcube-ai` | 视觉交付的 `Domain Gateway + Domain Harness OS` | 持有视觉交付 contract、治理、交付与后续吸收 |
| `med-autogrant` | future `Grant Ops` 的 `Domain Gateway + Domain Harness OS` 方向 | 当前仍低于 admitted-domain runtime ownership |

## Shared Runtime Substrate v1

在 `S1`，`OPL` 顶层冻结 6 组共享对象。
当前冻结的是定义与 ownership boundary，不是共享实现。

### 1. `runtime profile`

- 顶层统一定义：
  - 跨本地与 future managed deployment shape 的稳定隔离单元
- 不属于 `OPL` 顶层的部分：
  - domain-local canonical truth
  - domain 凭据
  - domain-specific workflow object
- 必须继续留在 domain 内的 truth：
  - 一个 profile 在 domain 内如何映射到 study、proposal、deck family、artifact root 或 policy
- 为什么现在只冻结语言：
  - 当前各个 domain 的本地布局与 runtime 内部实现仍不同

### 2. `session substrate`

- 顶层统一定义：
  - 用于 search、resume、audit 与 cross-session linkage 的 durable continuity contract
- 不属于 `OPL` 顶层的部分：
  - domain-specific mutation rule
  - domain review truth
  - domain-specific conversation semantics
- 必须继续留在 domain 内的 truth：
  - 一个 session 在该 domain workflow 里究竟代表什么，以及允许推进哪些 handle
- 为什么现在只冻结语言：
  - 目前还没有被证明可跨域复用的单一 session 实现

### 3. `gateway runtime status`

- 顶层统一定义：
  - 描述 runtime context 是否 active、interrupted、resumable 或 exiting 的最小可观测状态面
- 不属于 `OPL` 顶层的部分：
  - domain 业务指标
  - domain gate outcome
  - publication truth
- 必须继续留在 domain 内的 truth：
  - 特定 domain workflow 如何定义 healthy / promotable runtime state
- 为什么现在只冻结语言：
  - 当前 status surface 仍带有明显的 domain runtime 差异

### 4. `memory provider hook`

- 顶层统一定义：
  - 围绕 prefetch、turn sync、delegation sync 与 session-end sync 的共享 hook 面
- 不属于 `OPL` 顶层的部分：
  - 全局 user-memory 产品
  - 单一 canonical memory store
  - domain evidence truth
- 必须继续留在 domain 内的 truth：
  - object memory、evidence memory、decision memory、gate memory 及其检索策略
- 为什么现在只冻结语言：
  - 正确的 memory 形态应该是 domain-centric，而不是一个全局实现

### 5. `delivery / cron substrate`

- 顶层统一定义：
  - 用于 scheduled continuation、scheduled reporting 与 durable delivery targeting 的共享合同
- 不属于 `OPL` 顶层的部分：
  - domain-specific delivery object
  - approval threshold
  - external publication semantics
- 必须继续留在 domain 内的 truth：
  - 什么算 reportable output、deliverable completion 或 scheduled promotion
- 为什么现在只冻结语言：
  - 当前还没有被证明可独立于 domain 复用的 delivery engine

### 6. `approval / interrupt / resume`

- 顶层统一定义：
  - 围绕 stop、pause、approval、interrupt 与 resume 的长跑控制合同
- 不属于 `OPL` 顶层的部分：
  - 全局 approval policy
  - 全局 dangerous-tool policy
  - 全局 tool catalog
- 必须继续留在 domain 内的 truth：
  - tool registry 内容、approval scope、dangerous-action gate、output budget 与 escalation rule
- 为什么现在只冻结语言：
  - tool surface 与 approval semantics 仍高度依赖 domain workflow 现实

tool registry 归在这一组对象里：
可以冻结 registry 语义，但实际工具仍保持 domain-scoped。

## `Codex-default host-agent runtime` 与 future managed runtime

### 当前真实状态是什么

当前整个体系公开可说的真相是：

- 默认本地 deployment shape 是 `Codex-default host-agent runtime`
- 当前活跃执行口径仍是 Codex-only
- 这已经是一个真实 runtime，但还不是本合同意义上的 managed runtime

更准确地说：

- 默认 host executor 是 `Codex`-class agent
- execution plane 仍主要运行在用户机器或用户可控本地环境里
- 本地文件系统、worktree、tool、binary 与机器约束仍属于 runtime 现实的一部分
- 长跑任务已经可以被编排、恢复与审计，但 lifecycle 与 operations 还不是平台托管能力

### 为什么它不等于 managed runtime

变成 managed runtime，关键变化不是“模型更强”或“Codex session 更能长跑”。
关键变化是：

- execution plane 从“主要由机器持有”变成“主要由平台持有”
- session、run 与 recovery 的 lifecycle 变成平台维护
- sandboxing、tool connectivity、observability、scheduling 与 recovery 变成正式托管能力

### 它们之间的关系

`Host-Agent Runtime` 与 `Managed Runtime` 是 execution plane 的两种 deployment shape：

- 当前形态：`host-agent runtime`
- 未来形态：`managed runtime`

两种形态之间应继续共享的是：

- domain contract
- formal-entry matrix
- execution-handle semantics
- audit、review 与 delivery contract
- `S1` 冻结下来的 shared runtime substrate object language

## 边界规则

不要把系统写成：

- `OPL` 是 runtime owner
- `shared runtime substrate v1` 已经是共享实现
- `Managed Runtime` 只是“更会长跑的 Codex session”
- future managed runtime 会消灭 domain gateway
- `contracts/opl-gateway/*.json` 已经物化了整套 substrate

应该把系统写成：

- `OPL` 负责 federation 语言与顶层 boundary freeze
- domain repo 负责 `Domain Gateway + Domain Harness OS`
- execution plane 负责 runtime execution
- `host-agent runtime` 与 `managed runtime` 是 execution plane 的两种 deployment shape
- `S1` 先冻结语言，为后续 domain pilot 证明哪些实现真可复用创造条件

## 延伸阅读

- [OPL 运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)
- [OPL 路线图](./roadmap.zh-CN.md)
- [Hermes Agent Runtime Substrate 对标与吸收清单](./references/hermes-agent-runtime-substrate-benchmark.md)
