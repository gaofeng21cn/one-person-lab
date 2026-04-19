[English](./unified-harness-engineering-substrate.md) | **中文**

# Unified Harness Engineering Substrate

## 目的

这份文档用于定义当前 `OPL` 体系下共享的 Harness Engineering 语言。
它的作用，是让 `OPL` 能以一套清楚的一致性架构对外呈现，而不是把几个 domain project 继续写成松散相关的零散仓库；同时，它也不声称所有 domain 已经被压进一个单体 runtime 或一个公共代码仓。

## 它是什么

`Unified Harness Engineering Substrate` 是 `OPL` 之下共享的 Harness Engineering 上位语言。
它定义的是多个 domain system 共同继承的一组稳定约束，而不是取代它们各自的 domain contract、domain gateway 与 `Domain Harness OS`。

当前更准确的理解是：

- `UHS` 是共享总名词
- 其中与长期在线运行最相关的部分，正在收敛为 [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- 其中与跨 domain 正式行为最相关的部分，正在收敛为 [Shared Domain Contract](./shared-domain-contract.zh-CN.md)

在当前体系里，这个 substrate 作用于：

- `Med Auto Science`
- `RedCube AI`
- `Med Auto Grant`

## 它不是什么

这个 substrate 不是：

- “所有 domain 已经共享完全一致对象模型”的声明
- “所有 domain 已经落在同一个公共代码仓”的声明
- 任何一个 domain gateway 的替代品
- 任何一个 `Domain Harness OS` 的替代品
- `OPL` 可以绕过 domain gateway、直接触碰 domain-local harness 执行面的许可
- `Hermes` 或其他 runtime 项目的简单套壳说法

## 分层关系

推荐长期分层保持为：

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

每一层负责不同的事情：

- `OPL Gateway / Federation`
  - 负责顶层任务语义、路由语言与跨域边界合同
- `Unified Harness Engineering Substrate`
  - 负责多个 domain 共享的 Harness Engineering 上位语言
- `Shared Runtime Contract`
  - 负责跨 domain 共享的长期在线运行合同
- `Shared Domain Contract`
  - 负责跨 domain 共享的正式行为合同
- `Domain Gateway`
  - 负责 domain-local 的任务入口、路由与合同 hydration
- `Domain Harness OS`
  - 负责 domain-local 的执行逻辑、审计面与交付语义
- `Execution Plane`
  - 负责实际驱动 session、run、watch、resume 与 delivery 的运行层
- `Deployment Shape`
  - 负责 harness 具体部署在哪里、以什么形态运行，但不重写 domain contract

## 共享不变量

这个 substrate 当前冻结的共享约束包括：

- 默认采用 `Agent-first` 执行姿态
- 当前各个 domain 仓首先都是共享同一 substrate 的 `Auto-only` 主线
- 未来 `Human-in-the-loop` 产品应作为兼容 sibling 或 upper-layer product 复用同一 substrate，而不是把当前仓强行改成同仓双模
- formal entry 采用同一套显式矩阵：默认正式入口 `CLI`、支持协议层 `MCP`、`controller` 仅作为 internal control surface
- 状态迁移、审阅面与交付边界保持可审计
- 部署形态可以变化，但不应因此改写 domain contract

其中，最需要继续压实的两类共享合同是：

- `Shared Runtime Contract`
  - `runtime profile`
  - `session substrate`
  - `gateway runtime status`
  - `memory provider hook`
  - `delivery / cron`
  - `approval / interrupt / resume`
- `Shared Domain Contract`
  - formal-entry matrix
  - `per-run handle`
  - durable report
  - audit trail
  - gate semantics
  - no-bypass to `domain_gateway`

## 部署形态

在当前阶段：

- 活跃开发宿主是 Codex-only 本地会话
- 公开的 OPL formal entry 仍是本地 `TypeScript CLI`-first / gateway contract surface

这个区分很重要：Codex 说的是今天的开发宿主，不是 substrate 的本体定义。
在后续阶段，同一套 substrate 也应兼容：

- 托管式 Web runtime
- 平台侧统一托管的执行面

如果未来先在某个 domain 仓里证明了真实的上游 `Hermes-Agent` 集成，它更准确的归属应是：

- `Shared Runtime Contract` 的实现方向

而不是：

- `UHS` 的同义词
- `OPL` 的替代品
- domain truth 的 owner

也就是说，未来如果从“装在用户电脑上”迁移到“运行在平台上”，不应因此重写 substrate，也不应因此压平 domain 边界。

## 从共享 substrate 到垂类在线 Agent 平台族

这套 substrate 的长期产品意义，不是把 `OPL` 改写成通用长期在线 agent 平台，而是让 `OPL` 逐步具备演进成“垂类在线 agent 平台族”的能力。

在这个理想结构里：

- `OPL`
  - 继续负责顶层 `Gateway / Federation`
- `UHS`
  - 继续作为共享 Harness Engineering 的上位语言
- `Shared Runtime Contract`
  - 逐步承接 `runtime profile`、`session substrate`、`gateway runtime status`、`memory hook`、`delivery / cron`、`approval / interrupt` 这类共享运行合同
- `Shared Domain Contract`
  - 逐步承接 formal-entry matrix、`per-run handle`、durable report、audit trail、gate semantics 等跨 domain 正式行为合同
- 各 `Domain Harness OS`
  - 继续持有自己的 formal entry、domain object、gate、audit、delivery 与 canonical truth

因此，后续更合理的方向不是“直接把三个业务仓改造成同一种执行内核”，而是：

- 先冻结 `UHS` 之下的共享 runtime / domain contract 语言
- 再在合适的 domain 中做成熟的本地产品 runtime pilot
- 再从 pilot 回抽可复用的 substrate 实现

这条演进线当前仍属于未来方向。
它不等于当前已经存在统一平台 runtime，也不等于 `OPL` 已经成为 runtime owner。

## 当前 Domain Mapping

当前 `OPL` 体系可以理解成：

- `Med Auto Science`
  - 医学 `Research Foundry` 的 `Domain Harness OS`
- `RedCube AI`
  - 视觉交付的 `Domain Harness OS`
- `Med Auto Grant`
  - 未来医学 `Grant Foundry` 的 `Domain Harness OS` 方向

`OPL` 本身不是再额外多出来的一个 `Domain Harness OS`。
它仍然是位于这些 domain system 之上的顶层 gateway 与 federation layer。

## 现实意义

这个共享 substrate 的意义，在于后续新 domain 可以沿着同一套思路快速展开：

- 共享执行哲学与边界语言
- domain-specific contract 继续留在各自 domain
- `OPL` 负责解释整个体系如何拼起来，而不是吞掉 domain-local runtime owner 权限

这样，后续新增 Harness OS 时，就能更像是在同一套框架思想上演化，而不是重复发明几套彼此不兼容的系统。
