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

Standard Agent 的 canonical primary Skill 按 capability map 和调用者 root locator 纳入不可变 Workspace 投影；digest 基于真实物理目录的完整文件树，Attempt 继续绑定具体 generation。

### Review transport

Framework raw 产物恢复与正式验收共用 metadata 来源校验：精确字段、Attempt/domain/stage 绑定、物理谱系和 authority boundary 由同一读取入口验证。恢复检查 metadata 声明的 hash/size；正式验收还要求它们与 closeout packet 一致，并在 transport receipt 发布前后重新检查文件。

新 Attempt 可以从当前包获取此前未绑定的固定 review lane；父 spec 和已有显式 lane 保持原绑定。历史 Attempt 仅在请求明确携带 lane 且原 Stage manifest 的 ref/hash 精确匹配时恢复缺失投影，不猜测 controller-required lane。

不可变 reviewer snapshot 保留领域原请求及成员，外层只补入 canonical artifact refs/hashes 与 producer exact metadata 共同绑定的最终文件。引用型 closeout 的外层 locator 通过精确 hash/size 校验后，可以补足内层未声明的自引用；显式空引用仍无效。复审 prompt 说明 closure 的 finding_id、status、非空 evidence_refs，以及 optional observation 的 observation_id、summary 和 evidence_refs，质量判断和证据有效性仍归既有校验与领域 owner。

原 reviewer 响应在同会话的只读协议补全之前持久化，并提供精确 ref/hash/size；该响应仍是传输证据，不自动成为领域 verdict。repairer 必须返回逐 finding 的 `repair_map` 数组，状态为 `repaired|not_repaired|blocked`，独立 closure 仍归 re_reviewer。

### Workspace physical identity

工作项根和 raw artifact 的物理谱系使用同一 descriptor-relative 边界。支持稳定卷查询的 macOS 文件系统采集 `opl-work-item-root-identity.v2`：持有的目录 descriptor 提供卷 UUID，内核提供 boot UUID；身份同时保留两级 inode 和设备号。同 boot 设备变化仍拒绝；跨 boot 只有两级卷 UUID 与 inode 均相同才接受设备号漂移，读取返回独立的身份延续观察。路径、no-follow、单硬链接、读取前后身份及文件 hash/size 校验持续生效，不改写历史 scope、raw metadata 或 accepted receipt。

不支持稳定卷查询的文件系统继续采集 v1。v1 在原设备号和 inode 完全一致时兼容读取；设备号漂移的旧身份通过 `opl workspace root reattest` 由获授权操作者重新确认。Framework 不从当前 boot、相同路径或相同 inode 推断旧卷。v2 缺少当前稳定证据时仍拒绝，不回退到仅比较设备号。源码与合成验证不代表已安装环境升级或真实重启验收。

`opl workspace root reattest --input <request.json> --json` 默认只预览，返回当前 descriptor 身份与精确 binding，不写恢复证明。请求使用 `workspace_root`、`canonical_work_item_root` 和历史 `original_root_identity`；后者必须来自原 snapshot 或 raw metadata，不能重新捕获后冒充原身份。raw 的 workspace root 是原 OPL state root，工作项 root 是其原 StageAttempt 目录，两者与领域 work-item root 分别确认。

操作者检查原身份和独立证据、确认仍是原卷与原目录后，将预览中的 `binding.current_root_identity` 写入请求的 `current_root_identity`，附上 `operator` 和 `evidence_ref`，运行 `opl workspace root reattest --input <request.json> --apply --confirm-same-volume-and-directory --json`。命令只接受 v1 原身份、未变化的两级 inode 和当前 v2 卷/boot 证据，并再次捕获当前身份与预览精确比较；不接受 v2 降级、无确认或过期预览。`operator` 与证据引用记录操作者声明，不是由 Framework 推断历史同卷的证明；命令必须由有权确认该原身份的操作者明确调用。

恢复证明由 Framework 写入其 state 下 `work-item-root-reattestations/`，绑定原身份、两个精确目录和完整当前 v2 身份。原身份、路径、卷、inode 或 boot 的任何变化都不匹配；证明不会自动延续到下一 boot。写入原子发布且不覆盖已有证明，重试回读原证明。普通读取只消费这个 owner 存储，不扫描工作区 JSON、不自动登记映射。work-item descriptor 读取、raw 恢复及 raw 正式身份校验共用该入口；读取观察保留原/新身份与 `reattestation_ref`，原 scope、raw metadata、accepted receipt 与内容字节不变。证明不能授权根替换、跨工作项读取、符号链接、硬链接或 hash/size 不匹配的产物。

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
