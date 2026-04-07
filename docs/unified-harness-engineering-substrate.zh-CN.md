[English](./unified-harness-engineering-substrate.md) | **中文**

# Unified Harness Engineering Substrate

## 目的

这份文档用于定义当前 `OPL` 体系下共享的 Harness Engineering 语言。
它的作用，是让 `OPL` 能以一套清楚的一致性架构对外呈现，而不是把几个 domain project 继续写成松散相关的零散仓库；同时，它也不声称所有 domain 已经被压进一个单体 runtime 或一个公共代码仓。

## 它是什么

`Unified Harness Engineering Substrate` 是 `OPL` 之下共享的架构基座。
它定义的是多个 domain system 共同继承的一组稳定约束，而不是取代它们各自的 domain contract、domain gateway 与 `Domain Harness OS`。

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

## 分层关系

推荐长期分层保持为：

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Unified Harness Engineering Substrate
          -> Domain Gateway
              -> Domain Harness OS
                  -> Deployment Shape
```

每一层负责不同的事情：

- `OPL Gateway / Federation`
  - 负责顶层任务语义、路由语言与跨域边界合同
- `Unified Harness Engineering Substrate`
  - 负责多个 domain 共享的 Harness Engineering 原则
- `Domain Gateway`
  - 负责 domain-local 的任务入口、路由与合同 hydration
- `Domain Harness OS`
  - 负责 domain-local 的执行逻辑、审计面与交付语义
- `Deployment Shape`
  - 负责 harness 具体部署在哪里、以什么形态运行，但不重写 domain contract

## 共享不变量

这个 substrate 当前冻结的共享约束包括：

- 默认采用 `Agent-first` 执行姿态
- `Auto` 与 `Human-in-the-loop` 应共用同一套基座
- 正式入口保持显式化，例如 `MCP`、`CLI` 与 domain controller
- 状态迁移、审阅面与交付边界保持可审计
- 部署形态可以变化，但不应因此改写 domain contract

## 部署形态

当前默认的本地部署形态是：

- `Codex-default host-agent runtime`

这只是当前部署方式，不是 substrate 的本体定义。
在后续阶段，同一套 substrate 也应兼容：

- 托管式 Web runtime
- 平台侧统一托管的执行面

也就是说，未来如果从“装在用户电脑上”迁移到“运行在平台上”，不应因此重写 substrate，也不应因此压平 domain 边界。

## 当前 Domain Mapping

当前 `OPL` 体系可以理解成：

- `Med Auto Science`
  - 医学 `Research Ops` 的 `Domain Harness OS`
- `RedCube AI`
  - 视觉交付的 `Domain Harness OS`
- `Med Auto Grant`
  - 未来医学 `Grant Ops` 的 `Domain Harness OS` 方向

`OPL` 本身不是再额外多出来的一个 `Domain Harness OS`。
它仍然是位于这些 domain system 之上的顶层 gateway 与 federation layer。

## 现实意义

这个共享 substrate 的意义，在于后续新 domain 可以沿着同一套思路快速展开：

- 共享执行哲学与边界语言
- domain-specific contract 继续留在各自 domain
- `OPL` 负责解释整个体系如何拼起来，而不是吞掉 domain-local runtime owner 权限

这样，后续新增 Harness OS 时，就能更像是在同一套框架思想上演化，而不是重复发明几套彼此不兼容的系统。
