# OPL Foundry Kernel 控制面边界

Status: `active_runtime_support`
Owner: `One Person Lab`
Purpose: `foundry_kernel_control_plane`
State: `active_support`
Machine boundary: 本文只解释稳定职责。当前状态必须从 Foundry contracts、事件 Ledger、版本 registry、Temporal workflow 和 fresh `opl foundry ... --json` readback 读取。

## 控制面模型

Foundry Kernel 是 OPL Framework 内部的 durable Agent engineering control plane。它不是新的 domain agent、产品 truth store 或领域质量裁判，也不向普通用户暴露第二套建 Agent 入口。

标准链路为：

```text
DesignRequest
  -> OMA design StageRun
  -> AgentBlueprint + EvalSpec
  -> deterministic materialization
  -> independent evaluation
  -> EvidenceBundle
  -> OMA diagnosis / EvolutionProposal when needed
  -> qualification
  -> risk-gated canary
  -> CAS activation
```

## 状态与持久化

- `FoundryRun` 的每次转换追加不可变、哈希串联事件，并令 `revision + 1`。
- Owner decision、cancel、activation 与 rollback 使用 compare-and-swap revision。
- Temporal 承载 durable workflow 和 activity retry；Ledger 事件与内容寻址对象是审计事实。
- SQLite/StateIndex 只做可重建 projection，不保存另一份 authority truth。
- 同一 target Agent 同时只允许一个写入型 Run；重复 activity 按 run/generation/phase/input digest 幂等。
- 瞬时平台失败最多重试三次，不消耗 evolution generation；永久失败不重试。

终态为：

```text
completed_active | completed_qualified | completed_unqualified
rejected | cancelled | failed | quarantined
```

Rollback 是独立 activation transaction，不倒放历史 Run，也不修改旧版本 bytes。

## 评测隔离

- baseline 与 candidate 使用同一冻结测试计划。
- 保护测试正文不进入 OMA 协议；OMA 只能看到聚合 evidence 和失败分类。
- evaluator、independent reviewer 与 OMA designer 必须使用不同身份和 attempt refs。
- 删除既有测试、降低保护测试数量或放宽 gate 会被 quarantine。
- canary 回归保留原 active pointer，并记录 `canary_regression_rolled_back` 事件。

## Provider Boundary

OMA provider manifest 只声明 `design` 和 `diagnose` 两个内部 operation。Foundry Kernel 通过 OPL StageRun 运行它们，并只接受一个确切 terminal protocol artifact：`AgentBlueprint` 或 `EvolutionProposal`。

跨边界对象只允许 `DesignRequest`、`AgentBlueprint`、`EvidenceBundle` 和 `EvolutionProposal`。它们使用 canonical JSON + SHA-256，不得包含 repo path、命令、queue、lease、attempt、patch、work order、promotion ledger 或保护测试正文。

## Operator Surface

```text
opl foundry status
opl foundry approve
opl foundry reject
opl foundry cancel
opl foundry versions
opl foundry rollback
```

这些命令只用于 Owner/operator/debug。普通 Agent 创建、接管和改进统一从 `opl agents run --domain oma --action engineer-agent` 进入。

## Authority Boundary

- Kernel 可以写 Run state、evaluation evidence、qualification、AgentVersion、activation transaction 和 rollback transaction。
- Kernel 不写 target domain truth、artifact body、quality acceptance、保护测试正文或生产采用决定。
- OMA 不写 Kernel state、执行工单、文件 patch、版本或 activation pointer。
- Target Owner 的决定以独立 authority receipt 进入 Kernel，不属于 OMA 四协议。
