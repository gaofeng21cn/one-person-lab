# OPL Foundry Kernel 控制面边界

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

自然语言目标的理解与 Profile 适用性判断归 OMA 设计 Stage。`opl profiles select`
只按显式 `--profile` 或规范 `--intent-signal` 精确路由；自由文本仅作为设计依据保留，
没有显式选择或引用来源时返回 `semantic_profile_selection_required`，由现有
`engineer-agent` 设计入口处理。Profile 是符合性的最低约束，不是所有领域共用的设计模板。
引用来源与 pattern packet 继续走 source-derived 路线；与显式 Profile 合用时保留 hybrid
结果。Framework 继续持有 Profile ABI、查询、符合性验证和能力解析。

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

## Provider execution identity

Provider StageRun 在已注册的 provider workspace 中运行；Foundry run ID 确定
`provider-runs/` 下的 Work Item。Workspace snapshot 绑定 project、workspace 和物理
目录身份。初次设计、诊断和重试延续同一 run scope，不同 Run 不共享写入范围；
缺失或歧义绑定不能降级成 domain scope。实现入口为
[`foundry-execution-scope.ts`](../../src/adapters/execution/foundry-execution-scope.ts)。

输入 closure 包含 canonical output schema、已授权 intake receipt 对应的 source bytes，
以及 hash/size 绑定的 manifest、policy 和 rubric。Review 使用生产者选择且身份已冻结的
输入 snapshot；缺失 snapshot 不能转成质量通过。

输入内容的 CAS 身份与运行时运输目录分离：provider input 和 source bytes 写入该 Run 的
canonical Work Item 下，launch 再核对同一 execution scope。不能将整个 Foundry storage
root 当作 Attempt 的读取范围；不同 Work Item 即使消费相同内容也各自持有运输副本。

生产者的 raw output 只有通过精确字节及来源校验后才能作为带 quality debt 的进度输入。
dispatch 必须保留这一来源标记，不能将其改成领域结论。Reviewer 缺少合法 outcome 时，
保留原始输出作为诊断并阻断审查收尾，不把诊断包装成完成的审查；身份接收失败前同步
已经结束的 Attempt，使 Stage 与 Attempt 各自保留真实终态。

生产 provider 将 launch、observe、read-terminal 与 cancel 分为短 Activity，以 workflow
等待和 generation-bound cursor 延续长操作。cursor 绑定 request、generation、provider
source 和 manifest，恢复观察不能重启语义 generation。同步 Invoker 是有界调用接口；
它不承担生产 workflow 的跨 Stage 等待。

构建验证步骤见 [Package construction acceptance](../delivery/foundry-package-construction-acceptance.md)。

## Worker 评估运行时组合

`buildCordisTemporalActivities({ trusted_evaluation_runtime })` 是 Foundry 评估与
canary Activity 的正式进程内宿主入口。Host 在每个 worker 进程构造
`FrozenPlanEvaluationRuntime`，将原对象传给 Activity builder；使用注册路径时，
在 worker 解析 Activity projection 前调用
`registerCordisTemporalActivities({ trusted_evaluation_runtime })`。
不能先导入默认的 `temporal-worker-bootstrap.ts`：它已经注册不带评估器的默认
projection，注册仍保持每个进程只有一个 owner。

```ts
import { FrozenPlanEvaluationRuntime } from '../../src/authority/evolution/index.ts';
import { buildCordisTemporalActivities } from '../../src/host/temporal-activity-projection.ts';

// 这些端口由可信 Host 提供，不能从生成的 Agent 输出中加载。
function evaluationActivities(
  ports: ConstructorParameters<typeof FrozenPlanEvaluationRuntime>[0],
) {
  const trusted_evaluation_runtime = new FrozenPlanEvaluationRuntime(ports);
  return buildCordisTemporalActivities({ trusted_evaluation_runtime });
}
// 自行创建 Temporal Worker 的 Host 将 evaluationActivities(ports) 作为
// Worker.create({ ..., activities }) 的 activities，而不是 workflow 参数。
```

生产 kernel 继续校验原运行时对象的 Framework 来源。序列化对象、复制的 capability
标记或包装 adapter 均不能替代该对象。运行时对象、可执行路径和保护用例正文不得进入
Temporal workflow 输入或 OMA 协议。Host 负责 worker 关闭及所注入端口持有资源的释放。

`EvaluationCaseExecutor` 按冻结计划执行确切 candidate，必要时执行 baseline。
目标领域 owner 提供真实 Agent 执行适配、保护用例内容及专业验收规则，Framework Host
负责准入和组合。公开用例返回 case identity、status、score 和 evidence refs；保护执行
只返回聚合结果、直接 receipt ref 和聚合结果的精确 digest。资源观察来自真实执行。
`IndependentEvaluationReviewer` 接收这些观察，返回独立 verdict、execution ref、
findings 和 evidence refs。OMA design/diagnose 不能兼任执行者或审核者；evaluator、
executor 和 reviewer 三个身份必须互异。

可执行接口样例见
[`evaluation-and-protocol.ts`](../../tests/src/foundry-kernel-cases/evaluation-and-protocol.ts)，
生产 Activity 注入验证见
[`temporal-activity-projection.test.ts`](../../tests/src/temporal-activity-projection.test.ts)。
这些 fixture 证明接线、隔离及拒绝边界，不证明领域质量。

默认 worker 未内置领域用例执行器和独立 reviewer。没有 Host 组合时，评估在物化后
继续如实失败；候选包字节仍可独立验证。配置 `OPL_FOUNDRY_EVALUATOR_BIN`、
`OPL_FOUNDRY_REVIEWER_BIN` 和
`OPL_FOUNDRY_EVALUATION_MODE=offline_projected_pack_observation.v1` 只启用离线
投影包观察，其 `pass` 审核在 qualification 上仍被降为 `blocked`，不能使
`qualify_only` 成功。不存在隐式 `build_only`、事后资格追认或历史失败 Run 改写；
领域资格结论必须来自所组合端口的真实执行及独立审核证据。
