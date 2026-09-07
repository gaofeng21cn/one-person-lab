# Shared Runtime Contract

本文解释 OPL Family 共享的 runtime 行为。machine shape 由 `contracts/family-orchestration/*.schema.json` 和 `contracts/opl-framework/*runtime*.json` 持有。

## Owner split

- Framework：StageRun/Attempt envelope、provider adapter、runtime projection、refs-only evidence 和 operator action。
- provider：workflow history、queue、retry、timeout 和 worker transport。
- Package/domain：专业执行入口、artifact body、quality verdict、owner receipt 和 typed blocker。
- App：用户交互、session UI 和 product truth。

## Required runtime surfaces

### Event envelope

event 必须绑定 run/attempt identity、source、sequence、timestamp 和 payload kind。event 只描述观察到的事实，不直接声明专业完成。

### Checkpoint lineage

checkpoint 绑定父 run、workspace scope、artifact refs 和恢复 cursor。恢复必须延续同一 lineage，不能把“最新文件”猜成当前任务。

### Attempt projection

projection 至少表达 request identity、provider/executor、状态、最新事件、输出 refs、阻塞和可执行恢复动作。它可重建，不能成为 provider history 或 domain truth 的第二 copy。

已接受正式 closeout 的 reviewer / re_reviewer 不因后到的 provider diagnostic 多出 ref 而重新入库。新的正式结果须携带 review outcome，并继续通过原有校验；无 outcome 的观察只更新 provider 投影。

### Review transport

新 Attempt 可以从当前包获取此前未绑定的固定 review lane；父 spec 和已有显式 lane 保持原绑定。历史 Attempt 仅在请求明确携带 lane 且原 Stage manifest 的 ref/hash 精确匹配时恢复缺失投影，不猜测 controller-required lane。

不可变 reviewer snapshot 保留领域原请求及成员，外层只补入 canonical artifact refs/hashes 与 producer exact metadata 共同绑定的最终文件。引用型 closeout 的外层 locator 通过精确 hash/size 校验后，可以补足内层未声明的自引用；显式空引用仍无效。复审 prompt 说明 closure 的 finding_id、status、非空 evidence_refs，以及 optional observation 的 observation_id、summary 和 evidence_refs，质量判断和证据有效性仍归既有校验与领域 owner。

### Runtime supervision

supervision 观察 service、worker、queue 和 source freshness。自动 repair 只处理 Framework/provider owner 的运行面；存在 active mutation、权限或数据风险时 fail closed。

### Human gate

human gate 必须有明确 owner、reason、所需输入和恢复动作。没有授权时不能自动越过；普通诊断和低风险可恢复操作不应被升级为 human gate。

## 常用状态读法

以下仅解释常见状态；完整枚举由 [`family-runtime-attempt-contract.json`](../../contracts/opl-framework/family-runtime-attempt-contract.json) 的 `attempt_states` 持有，包括领取、重试、human gate 和 dead-letter 状态。

- `queued`：等待 provider 消费；
- `running`：Attempt 正在执行；
- `checkpointed`：已有可恢复点；
- `blocked`：需要 owner input、typed blocker resolution 或受保护条件；
- `failed`：Attempt 终止且有诊断；
- `completed`：transport/executor 已产生终态输出。

`completed` 不等于 owner accepted、artifact ready 或 production ready。

## Composition boundary

Cordis Host 提供进程内 service graph。StageRun 发起后冻结必要的 composition identity；durable history 仍在 provider，Package installed truth 仍在 native carrier。

## Failure and recovery

1. 先读取同一 Attempt 和 provider history。
2. 区分 transport failure、executor failure、owner blocker 和 artifact rejection。
3. 只对当前 owner 的状态执行 repair。
4. 保留已有 artifact refs 和 lineage。
5. 同 invocation、同 spec 的重放复用已有 Run；显式新运行或新的路由决定才创建新 Run。Attempt 重试和关联由 runtime owner 持有，不能把重复请求当成新任务。详见 [StageRun 身份与路由](../runtime/stage-graph-route-transition-runtime.md#durable-invocation-与物化)。

## Forbidden claims

Framework/provider 不得因为 workflow complete、worker healthy、evidence present 或 queue empty而声明：

- domain ready；
- artifact accepted；
- quality/export/publication verdict；
- App released；
- production ready。

这些结论必须来自对应 owner receipt、human gate 或 release readback。
