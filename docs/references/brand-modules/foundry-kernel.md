# OPL Foundry Kernel

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相归 `contracts/opl-framework/foundry-*.schema.json`、`src/modules/foundry/`、`src/modules/runway/foundry-*`、`src/modules/ledger/foundry-*` 和 fresh CLI/read-model 输出。

## 定位

`OPL Foundry Kernel` 是 Framework 内部的 Agent 工程生命周期内核，不是独立产品 Actor。普通用户通过 OMA 的 `engineer-agent` 提交目标；Kernel 调用 OMA 产出设计语义，并独立完成物化、评测、版本、canary、激活和回滚。

一句话：OMA 决定“Agent 应该是什么”，Foundry Kernel 负责“如何把该设计可靠地变成可评测、可版本化、可回滚的运行事实”。

## 核心对象

| 对象 | Owner | 作用 |
| --- | --- | --- |
| `DesignRequest` | OMA semantic protocol | 固定 create/takeover/improve 目标、验收条件、non-goals、source refs 与约束。 |
| `AgentBlueprint` | OMA semantic protocol | 描述 Stage graph、action I/O、artifact、content、capability、authority、memory 与 `EvalSpec`。 |
| `FoundryRun` | Foundry Kernel | 追加式状态机，串联设计、物化、评测、诊断、canary 和激活。 |
| `EvidenceBundle` | Evaluation Runtime / Ledger | 绑定 candidate、baseline、冻结测试计划、独立评审与失败分类。 |
| `EvolutionProposal` | OMA semantic protocol | 绑定确切 blueprint/evidence digest，给出完整下一版设计与语义差异。 |
| `AgentVersion` | Ledger / Version Registry | 内容寻址、不可变的已通过版本。 |
| `ActivationPointer` | Ledger / Version Registry | 通过 compare-and-swap 指向确切 active digest。 |

## 模块分工

- `Pack` 物化确定性的 Agent Pack，并验证 path/symlink/forbidden-write 边界。
- `Runway` 承载 Temporal workflow、StageRun provider 调用、sandbox 与瞬时重试。
- `Ledger` 保存哈希串联事件、内容寻址对象、qualification、版本和 activation transaction。
- `StateIndex` 只提供可重建 projection，不成为事实源。
- `Console` 投影 operator status、Owner wait、version 与 rollback 状态。
- `Foundry` 只持有状态机、协议校验、风险重算和端口编排。

## 风险与 Owner Gate

- 低风险：prompt/knowledge 内容替换或新增测试，可自动 canary 和激活。
- 中风险：skill/helper 或路由变化，可自动 canary，active 前需要 Owner。
- 高风险：Stage 拓扑、action I/O、工具、模型、权限、memory/authority/evaluation policy，canary 和 active 前都需要 Owner。
- OMA 风险提示只能提高风险，不能降低 Kernel 根据实际 blueprint diff 得出的风险。

## 公开面

普通入口只有：

```text
opl agents run --domain oma --action engineer-agent ...
```

Operator/debug 入口只保留：

```text
opl foundry status|approve|reject|cancel|versions|rollback
```

`startRun`、`inspectRun`、`submitOwnerDecision`、`cancelRun`、`listVersions` 和 `rollbackActivation` 是深接口。Pack scaffold、evaluation executor、queue、attempt、worktree、lease 和 activation ledger 都不是 OMA 协议字段。

## Authority Boundary

- OMA 拥有目标理解、设计依据、`AgentBlueprint`、`EvalSpec`、证据诊断与 `EvolutionProposal`。
- Foundry Kernel 独占执行状态、证据记录、版本、canary、激活与回滚。
- Target Owner 拥有领域真相、保护测试、质量接受、权限授权和生产采用。
- 生成的 Agent 只执行业务并输出观测，不得修改自身版本、评测、权限或 active pointer。

任何 scaffold、schema pass、suite pass、provider completion、materialized candidate 或 Console projection 都不能单独声明 Agent delivered、domain ready 或 production ready。
