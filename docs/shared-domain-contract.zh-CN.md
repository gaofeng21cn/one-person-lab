[English](./shared-domain-contract.md) | **中文**

# Shared Domain Contract

## 目的

这份文档用于冻结 `OPL` 体系下跨 domain 共享的产品语义与行为合同。
它回答的是“多个 `Domain Harness OS` 至少要在哪些公开行为面上保持一致”，而不是“它们是否必须共享同一套 domain object model”。

这份合同同样属于 `Unified Harness Engineering Substrate` 之内，但它与 `Shared Runtime Contract` 不是一回事。

## 它负责什么

`Shared Domain Contract` 负责冻结跨 domain 共享的上层行为语义，包括：

- formal-entry matrix
- `per-run handle`
- durable report
- audit trail
- gate semantics
- `Auto-only` 主线与 future `HITL` sibling / upper-layer 关系

这些内容决定的是产品如何被稳定地接入、观察、审核和推进，而不是 runtime 进程如何托管。

## 当前 v1 统一对象

当前应优先保持一致的对象和规则包括：

1. formal-entry matrix
   - 默认正式入口 `CLI`
   - `MCP` 作为 supported protocol layer
   - `controller` 仅作为 internal control surface

2. `per-run handle`
   - 每次正式运行都有可追踪身份
   - 运行身份应能稳定连接到报告、审计与交付记录

3. durable report
   - 每次正式运行都要留下稳定报告面
   - 报告面应能支持 review、promotion 与 history 对照

4. audit trail
   - 关键阶段变化必须可回看
   - 审计记录不能依赖临时对话上下文才可理解

5. gate semantics
   - gate 必须具备明确身份、证据输入与状态输出
   - 不能把未冻结的判断写成已通过 gate 的事实

6. no-bypass
   - 顶层与跨域 handoff 只能 targeting `domain_gateway`
   - 不允许把 `OPL` 直接写成 domain harness 的 runtime owner

7. operating posture
   - 当前 admitted mainline 统一按 `Auto-only` 理解
   - future `Human-in-the-loop` 产品应作为 sibling 或 upper-layer product 复用稳定模块，而不是把当前仓改成同仓双模

## 它不负责什么

这份合同不负责：

- 统一各 domain 的内部对象模型
- 统一各 domain 的 artifact 内容结构
- 统一各 domain 的具体评审标准
- 决定 runtime substrate 用哪一个具体实现

## 与 Shared Runtime Contract 的关系

两者关系可以简单理解为：

- `Shared Runtime Contract`
  - 冻结“怎么稳定地跑”
- `Shared Domain Contract`
  - 冻结“跑出来的正式行为如何可接入、可审计、可推进”

它们共同属于 `UHS`，但职责不同。

## 当前真实状态

截至当前公开主线，这份合同已经部分落在四仓统一口径里：

- `CLI-first`
- `MCP-supported`
- `controller internal only`
- `Auto-only` mainline
- no-bypass to `domain_gateway`

但 `per-run handle`、durable report、audit trail、gate semantics 仍在持续往 repo-verified 行为面压实，不应被夸写成“已经在所有仓完全统一实现”。

## 四仓中的位置

- `one-person-lab`
  - 负责定义这份共享产品合同的顶层语言
- `med-autoscience`
  - 负责在研究 runtime 主线上把它落成真实行为面
- `redcube-ai`
  - 负责在视觉交付主线上把它落成真实行为面
- `med-autogrant`
  - 负责在基金申请 runtime 主线上把它落成真实行为面

因此，这份合同就是你想要的“四仓统一行为面”的顶层锚点。
