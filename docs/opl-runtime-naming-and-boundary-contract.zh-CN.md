[English](./opl-runtime-naming-and-boundary-contract.md) | **中文**

# OPL Runtime 命名与边界合同

## 目的

这份文档用于冻结 `OPL` 体系下与 runtime 相关的核心命名，避免把下面几层继续混写成一团：

- 顶层 `Gateway / Federation`
- `Unified Harness Engineering Substrate`
- `Shared Runtime Contract`
- `Shared Domain Contract`
- `domain gateway`
- `Domain Harness OS`
- `execution plane`
- `deployment shape`

它同时回答三个问题：

1. 四仓当前各自到底处在哪一层。
2. `Codex-default host-agent runtime` 与未来 `managed runtime` 的关系是什么。
3. `MedAutoScience` 与 `MedDeepScientist` 这类 “domain harness + 受控执行引擎” 组合，边界应如何稳定表达。

## 适用范围

这份合同适用于当前 `OPL` 体系下的统一公开命名与边界表达，覆盖：

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

它也约束 `OPL` 对 `MedDeepScientist` 这类 domain 下层执行引擎的描述方式。

这份文档冻结的是命名与边界，不宣称当前已经实现：

- 统一共享执行内核
- 平台侧统一托管执行面
- future `Human-in-the-loop` 产品

## 固定控制链

当前推荐长期保持下面这条链：

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain Gateway
                  -> Domain Harness OS
                      -> Execution Plane
                          -> Deployment Shape
```

每一层回答不同问题：

- `OPL Gateway / Federation`
  - 顶层任务语义、跨域路由、admission 语言与边界合同
- `Unified Harness Engineering Substrate`
  - 跨域共享的上位 Harness Engineering 语言
- `Shared Runtime Contract`
  - 跨域共享的长期在线运行合同
- `Shared Domain Contract`
  - 跨域共享的正式行为合同
- `Domain Gateway`
  - 某个 domain 的正式入口、contract hydration、独立可消费界面
- `Domain Harness OS`
  - 某个 domain 的编排、治理、审阅、交付系统本体
- `Execution Plane`
  - 真正执行 session、quest、run、worktree、watch、resume 的运行层
- `Deployment Shape`
  - execution plane 运行在哪里、由谁托管、生命周期由谁负责

## 固定术语

| 术语 | 固定定义 | 当前或未来例子 | 明确不是什么 |
| --- | --- | --- | --- |
| `OPL Gateway / Federation` | 顶层任务语义、跨域路由、边界冻结与 admission 语言 | `one-person-lab` | domain-local runtime owner |
| `Unified Harness Engineering Substrate` | 多个 domain 共享的上位 Harness Engineering 语言 | 分层规则、共享原则、合同总名 | 共享执行内核 |
| `Shared Runtime Contract` | 多个 domain 共享的长期在线运行合同 | `runtime profile`、`session substrate`、`gateway runtime status` | domain truth |
| `Shared Domain Contract` | 多个 domain 共享的正式行为合同 | formal-entry matrix、`per-run handle`、durable report、gate semantics | domain object model |
| `Domain Gateway` | 某个 domain 的稳定正式入口与公开 contract surface | `MedAutoScience`、`RedCube AI` | execution engine |
| `Domain Harness OS` | 某个 domain 的执行编排、治理、审计、交付系统本体 | `MedAutoScience`、`RedCube AI` | 顶层 federation |
| `Execution Plane` | 实际驱动 quest、run、session、worktree、watch、resume 的运行层 | `MedDeepScientist` 当前对 `MedAutoScience` 承担的运行层 | 顶层公开产品面 |
| `Host-Agent Runtime` | execution plane 的本地宿主部署形态，由本机 host agent 驱动 | 当前 `Codex-default host-agent runtime` | 托管 runtime |
| `Managed Runtime` | execution plane 的平台托管部署形态，生命周期、调度、隔离和恢复由平台负责 | future `managed web runtime` | domain gateway |
| `Managed Execution Plane` | 对内架构词，指平台统一托管的 execution plane 本身 | future shared managed execution layer | 当前已经实现的公开主线 |

## 当前四仓定位

| 仓库 | 当前固定定位 | 与 runtime 的关系 |
| --- | --- | --- |
| `one-person-lab` | `OPL Gateway / Federation` 的公开说明面与 contract-first surface | 负责定义语言与边界，不是 runtime owner |
| `med-autoscience` | 医学 `Research Ops` 的 `Domain Gateway + Domain Harness OS` | 拥有医学领域 contract、governance、delivery 与外部 formal entry |
| `redcube-ai` | 视觉交付 domain 的 `Domain Gateway + Domain Harness OS` | 拥有视觉交付领域 contract、governance、delivery 与外部 formal entry |
| `med-autogrant` | future `Grant Ops` 的 `Domain Gateway + Domain Harness OS` 方向 | 当前仍停留在 future domain direction / signal-only 语义，不是 admitted runtime owner |

`MedDeepScientist` 不属于 `OPL` 顶层四仓中的一个平级 `domain repo`。
当前更准确的表达是：

- 它是 `MedAutoScience` 之下的 `controlled quest runtime`
- 它承担 `MedAutoScience` 当前 execution plane 的主要实现
- 它不是 `OPL` 顶层的第五个 `Domain Harness OS`
- 它也不是 `MedAutoScience` 的系统本体或公开入口

## `Codex-default host-agent runtime` 与 `managed runtime`

### 当前到底是什么

当前 `OPL` 体系下，公开真相是：

- 当前默认本地部署形态是 `Codex-default host-agent runtime`
- 这是一种真实的 runtime
- 但它不是当前意义上的 `managed runtime`

其准确含义是：

- `Codex` 类 agent 作为默认 host 执行者
- execution plane 主要运行在用户机器或受用户控制的本地环境里
- 本地文件系统、工作树、工具、二进制与环境约束仍然是实际运行的一部分
- 长时任务虽然可以被编排、恢复、审计，但生命周期与运维责任还没有被平台完整托管

### 为什么它不等于 `managed runtime`

如果一个 `Codex` 会话在本机上被封装得更稳定、能跑得更久，它仍然首先是 `host-agent runtime`。

要进入这里定义的 `managed runtime`，关键变化不是“模型更强”或“跑得更久”，而是：

- execution plane 由平台统一托管，而不是主要依附用户机器
- session / quest / run 的生命周期由平台负责维持与恢复
- sandbox、工具连接、状态观测、调度与恢复成为正式托管能力
- 用户与 operator 不再需要自己长期照料底层进程、tmux、daemon、机器路径与恢复细节

因此，可以把 `managed runtime` 粗略理解为：

> “平台托管的、可长时间工作的 agent runtime”

但不能把它简化成：

> “只是一个更能长跑的 Codex”

在概念上，真正被托管的是 execution plane，不是某个模型名字。

### 两者的关系

`Host-Agent Runtime` 与 `Managed Runtime` 是同一 execution plane 的两种 deployment shape：

- 当前 shape：`host-agent runtime`
- future shape：`managed runtime`

它们共享的应是同一套：

- domain contract
- formal-entry matrix
- execution handle 语义
- audit / review / delivery contract

变化的只是 execution plane 运行与托管的方式。

## 从当前迁到 future `managed runtime`，到底是从什么迁到什么

当前迁移语义不应理解成“从一个 domain 换到另一个 domain”，也不应理解成“从 Codex 换成别的模型”。

更准确的理解是：

- 从：主要由用户机器承载、由本地 host agent 驱动的 execution plane
- 迁到：主要由平台承载、由平台统一托管生命周期的 execution plane

### 保持不变的部分

迁移到 future `managed runtime` 时，下面这些东西不应被改写：

- `OPL` 顶层 federation 语义
- `Unified Harness Engineering Substrate` 的共享不变量
- `Shared Runtime Contract` 的共享运行对象
- `Shared Domain Contract` 的共享正式行为对象
- `domain gateway` / `Domain Harness OS` 的边界
- `CLI / MCP / controller` 这类 formal-entry matrix 语义
- `program_id / study_id / quest_id / active_run_id` 这类 execution handle 的语义边界
- domain-owned audit、review、delivery 与 canonical truth 的归属

### 允许变化的部分

真正允许变化的是 execution plane 与 deployment shape：

- 长时进程跑在本机还是平台
- session / quest / run 生命周期由谁负责
- sandbox、工具连接与凭证注入由谁管理
- watch / status / resume / replay 是否成为平台统一能力
- operator 是否还需要盯住本地 daemon、机器路径和手工恢复

如果未来采用 `Hermes-backed runtime substrate`，更准确的描述也应是：

- 它是 `Shared Runtime Contract` 的实现方向
- 它不是整个 `UHS`
- 它不替代 `OPL Gateway`、`Domain Gateway` 或 `Domain Harness OS`

### 迁移后的主要收益

若 future `managed runtime` 成立，收益应主要来自：

- 更低的本机环境耦合
- 更清晰的长时任务生命周期托管
- 更稳定的 status / watch / resume / replay 能力
- 更低的 operator 运维负担
- 更容易承接 future `Human-in-the-loop` sibling 或 upper-layer product

### 迁移不是为了做什么

这类迁移不应被写成：

- 取消 domain gateway
- 把 `OPL` 提升成 runtime owner
- 把多个 domain 压成同一个单体 runtime
- 把当前公开真相误写成“已经有统一平台 runtime”

## `MedAutoScience` 与 `MedDeepScientist` 的固定边界

当前更准确的结构应写成：

```text
Human / Agent
  -> MedAutoScience
      -> runtime protocol / runtime transport
          -> MedDeepScientist
              -> quest runtime / daemon / worktrees
```

其中：

- `MedAutoScience`
  - 是医学 `Research Ops` 的 `Domain Gateway + Domain Harness OS`
  - 是对外正式入口、领域合同 owner、governance owner、delivery owner
- `MedDeepScientist`
  - 是 `MedAutoScience` 当前 execution plane 的主要实现
  - 是 `controlled quest runtime`
  - 不是 `MedAutoScience` 的系统本体
  - 不是 `OPL` 顶层平级 domain
  - 不是未来 public product naming 的 owner

### 五个共享平面的当前分工

| 平面 | `MedAutoScience` 固定职责 | `MedDeepScientist` 固定职责 |
| --- | --- | --- |
| `资产平面` | 医学 study / workspace / artifact 的领域 contract 与 canonical asset truth | 运行期工作副本、导入物、quest-local runtime 文件 |
| `记忆平面` | 可复用医学研究记忆、controller summary、decision history | quest continuation 所需的运行时记忆与局部状态 |
| `治理平面` | continue / stop / reframe、publication_eval、controller_decisions、fail-closed gate | quest / session / run 的运行时守卫与状态机 |
| `交付平面` | manuscript、submission、formal report 与 delivery contract | runtime summary、handoff、escalation 与 completion hook |
| `执行平面` | 对外 formal entry、runtime protocol adapter、handle mapping、controller orchestration | daemon、quest、run、worktree、watch、resume、runtime audit 的实际实现 |

因此，不应把 `MedDeepScientist` 误写成五个平面的顶层 owner。
更准确的理解是：

- `MedAutoScience` 拥有五个平面的医学领域语义与外部合同
- `MedDeepScientist` 主要承担其中 execution plane 的实际运行实现

## `MedDeepScientist` 吸收到 `MedAutoScience` monorepo 时的固定规则

未来如果进入 `monorepo / runtime core ingest / controlled cutover`，应遵守下面这些固定规则：

1. 吸收的是 execution engine，不是把 `MedAutoScience` 降格成 runtime repo。
2. 被吸收进去的 `MedDeepScientist` 应作为 `MedAutoScience` 内部 `runtime` 主模块的一部分存在，而不是重新抢占 public entrypoint 身份。
3. cutover 前后应保持 `MedAutoScience -> MedDeepScientist` 当前稳定 runtime protocol 语义等价，而不是边迁边改写对外 contract。
4. 先稳定 handle、durable surface、gate semantics 与 compatibility regression，再做 physical migration。
5. 只有在 domain contract 已经稳定后，才允许把外部受控 runtime repo 逐步内收成 monorepo 内部模块。

这意味着未来理想结构更接近：

```text
MedAutoScience
  -> controller_charter
  -> runtime
       -> ingested execution engine
  -> eval_hygiene
```

而不是：

```text
MedAutoScience == MedDeepScientist
```

## 边界规则

不要把系统写成：

- `OPL` 是 runtime owner
- `Managed Runtime` 只是“更会长跑的 Codex”
- `MedDeepScientist` 是 `MedAutoScience` 的系统本体
- monorepo ingest 等于 domain gateway 与 execution engine 边界消失
- future `managed runtime` 已经是当前 repo-tracked reality

应该把系统写成：

- `OPL` 负责 federation 语言
- domain repo 负责 `domain gateway + Domain Harness OS`
- execution engine 负责 execution plane
- `host-agent runtime` 与 `managed runtime` 是 execution plane 的两种 deployment shape
- future migration 只改 execution plane 的托管方式，不改写 domain contract

## 延伸阅读

- [OPL 运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [Codex-default Host-Agent Runtime 合同](./references/host-agent-runtime-contract.md)
- [生态四仓统一状态总表](./references/ecosystem-status-matrix.md)
