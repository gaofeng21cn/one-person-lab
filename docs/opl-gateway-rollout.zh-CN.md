[English](./opl-gateway-rollout.md) | **中文**

# OPL Gateway 落地路线

## 目的

这份文档说明：`OPL Gateway` 应该如何从“文档优先的公开表面”，逐步推进成“真实入口”，同时又不压扁 domain 边界。

目标不是单体 runtime。
目标是一个能把任务路由到独立 domain system 的真实顶层 gateway。

## 目标形态

长期控制链保持不变：

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

当前已映射的 domain：

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI`

## 非目标

这条落地路线不是为了：

- 把所有 runtime 代码搬进 `one-person-lab`
- 删除 domain gateway
- 用一个含糊的顶层 prompt 抹平 domain-specific 治理
- 假装所有 planned workstream 都已经存在

## 落地原则

- 保持 domain gateway 独立可用
- 先上收顶层语义，再上收执行入口
- 先冻结 routing contract，再考虑共享 runtime 代码
- 共享 index 可以上收，canonical truth 仍留在各自 domain
- 只有当顶层 gateway 真正减少重复而不压扁边界时，才让它继续变厚

## Phase G0：定位冻结

目标：

- 冻结 `OPL Gateway`、`domain gateway`、`domain harness` 这套公开语言

证据：

- README 与核心文档对齐
- 各 domain 项目被明确写成 `OPL` 之下的独立 gateway

状态：

- 当前这轮文档收敛基本完成

## Phase G1：Federation Contract Freeze

目标：

- 定义 `OPL Gateway` 的最小机器可读联邦契约

应包含：

- workstream registry
- domain registry
- gateway routing vocabulary
- task / run / deliverable / review verbs 的共享身份
- 何时停留在顶层、何时必须进入某个 domain 的规则

完成信号：

- 不看 prose 文档，也能说明任务该路由到哪个 domain

当前 materialization 目录：

- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)

## Phase G2：只读入口先落地

目标：

- 先把 `OPL Gateway` 做成 discovery 与只读入口，再做 mutation 入口

应支持：

- 列出 workstream
- 列出已注册 domain gateway
- 显示哪些 family 直接映射哪些 workstream
- 把用户和 Agent 引导到正确 domain 入口

完成信号：

- Agent 可以先问“这类任务该用哪个系统”，并拿到稳定顶层答案
- 当前 G1 materialization 可在 [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md) 找到

详细契约：

- [OPL 只读 Discovery Gateway](opl-read-only-discovery-gateway.zh-CN.md)

## Phase G3：Routed Action Entry

目标：

- 让 `OPL Gateway` 能接收顶层任务意图，并把它路由到正确 domain gateway

应支持：

- 按 workstream 语义分类任务
- 稳定 handoff payload
- 显式 domain routing
- 顶层 routing decision 的审计记录

必须避免：

- 绕过 domain gateway，直接碰 domain harness 内部

完成信号：

- Agent 可以从 `OPL` 起步，同时带着显式 routing evidence 落到正确 domain gateway

在继续新增更多 domain 之前，需要补齐的合同：

- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

具体合同：

- [OPL Routed Action Gateway](opl-routed-action-gateway.zh-CN.md)

## Phase G4：跨 Domain Shared Index

目标：

- 增加最小共享 index，让跨 domain 协作更容易，但不制造第二真相源

候选 index：

- shared asset index
- shared memory index
- shared domain registry
- shared publication / delivery catalog

规则：

- index 可以聚合
- canonical truth 仍留在拥有它的 domain

完成信号：

- 跨 domain discovery 变容易，但 truth ownership 仍然单一清楚

## Phase G5：真实公开产品面

目标：

- 把 `OPL Gateway` 做成对人类和 Agent 都稳定的顶层产品入口

可能形态：

- docs site
- MCP 风格顶层工具面
- CLI 风格顶层 routing surface

规则：

- 第一版真实 gateway 仍应保持薄
- 顶层职责是 route，不是吞掉 domain logic

完成信号：

- 用户和 Agent 可以从 `OPL` 作为真实入口起步，同时各 domain system 仍保持一等公民地位

## Readiness Gate

只要下面任何一个问题未解，就不应继续推进：

- domain 边界不清楚
- 顶层词汇和 domain 词汇冲突
- 出现重复 truth source
- 试图绕过 domain gateway

## 理想终态

理想终态是：

- `OPL` 成为真实顶层 gateway
- `MedAutoScience` 保持 `Research Ops` domain gateway
- `RedCube AI` 保持视觉交付 domain gateway
- 未来工作流获得自己的 domain gateway，而不是被强行塞进既有系统
