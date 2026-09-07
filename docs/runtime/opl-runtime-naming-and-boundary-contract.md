# OPL Runtime 命名与边界

本文统一当前 runtime 对象的含义。字段和枚举以 `contracts/opl-framework`、`contracts/family-orchestration` 和源码为准。

## 对象

### Stage

一段具有明确目标、输入、产物和责任的专业工作。Stage 不等于单个工具调用或固定脚本步骤。

### StageRun

一次 Stage 的 durable invocation，绑定 workspace、scope、stage contract 和 execution request。它只表达“要运行什么”，不表达专业结果已被接受。

### Attempt

某个 executor/provider 对 StageRun 的一次执行尝试。Attempt 保存 transport 状态、事件、输出 refs、错误和恢复信息。

### Executor

执行阶段内认知工作和工具调用的 concrete backend。默认 executor 与显式非默认 adapter 都只负责执行，不拥有 domain truth。

### Runtime provider

提供 durable queue、workflow history、retry 和 worker transport 的平台。当前 production substrate 使用 Temporal；provider readiness 只证明运行通道。

### Workspace

材料、产物和项目绑定的位置。路径是 locator，不是任务 identity；Work Item/StageRun scope 才是执行身份。

### Evidence

可回读的 artifact、event、receipt、typed blocker 或 owner decision ref。Framework ledger保存 refs 和 lineage，不复制 artifact body 或专业结论。

### Host composition

在 `base-headless`、`app-full` 或 `foundry-dev` profile 中装配的 Cordis services 和 contributions。Host composition 是一次进程内能力图，不是 durable runtime。

## 控制链

```text
domain/stage contract
  -> StageRun
  -> Attempt request
  -> executor + provider
  -> provider history and output refs
  -> Framework Attempt/read model
  -> domain owner receipt, blocker or decision
```

只有 domain owner 或明确 human gate 能决定专业结果、artifact acceptance 和下一阶段。Framework 只验证 envelope、持久化通用状态、投影 refs 和提供安全 action。

## Currentness

- provider currentness：来自 provider status、worker 和 workflow readback；
- executor currentness：来自实际 executable/adapter；
- Package currentness：来自 native carrier；
- App currentness：来自 App owner；
- domain currentness：来自 domain repo 和 owner evidence。

这些状态不能互相替代，也不能由 Markdown、cache 或单一 aggregate 猜测。

## 恢复

资格工作项由领域 action 的 `qualification_provisioning_contract` 以仓内引用和 SHA-256
绑定。领域输入、输出 Schema 持有记录形状及初始业务状态，领域合同声明 identity 字段与
工作区路径模板；Framework 通过既有 handler registry 调用 owner，并校验精确授权字节、
工作项身份、回执和三类文件的 CAS 绑定。领域合同字节改变后，旧 action 绑定拒绝继续物化；
事务日志、单次授权和回滚仍由 Framework 执行。
已完成资格任务凭冻结运行记录、原始请求和输出、既有 CAS 回执及当前文件字节只读回放，
无需旧 carrier 或新合同绑定；缺少成功回执时拒绝回放，不能重新物化或补建授权状态。

恢复优先使用同一 StageRun/Attempt identity、provider history、workspace binding 和已有 artifact refs。只有明确无可恢复 state 时才创建新 run。

repair 成功表示运行通道恢复，不表示产物质量或任务完成。不可逆数据、权限、publication 和 owner decision 必须单独守门。

## Python client

跨语言 consumer 使用 [Family Runtime Python Client](./family-runtime-python-client.md) 中的稳定 API。Python adapter 不复制 runtime state machine。

## 验证

```bash
./bin/opl family-runtime attempt list --json
./bin/opl family-runtime worker status --provider temporal --json
./bin/opl runtime app-operator-drilldown --detail full --json
```

命令字段以 fresh `--help` 和 contract 为准。
