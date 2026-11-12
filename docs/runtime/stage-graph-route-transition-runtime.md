# Stage graph 与 AI 路由边界

Owner: `OPL Runway`
Purpose: `stage_graph_route_transition_runtime_support`
State: `active_support`
Machine boundary: 本文是 decisive Attempt、StageRun durable identity 与跨 Stage 物化边界的人读说明。机器真相归 `contracts/opl-framework/stage-quality-cycle-contract.json`、`contracts/opl-framework/stage-run-kernel-contract.json`、`contracts/opl-framework/stage-route-transport-contract.json` 及其 source、CLI/read-model 和 tests。

## 当前结论

Stage graph 只声明可用 stage 与 artifact handoff 范围，不是可执行状态机。语义 route owner 是当前 StageRun 的 decisive Codex Attempt：primary-only Stage 的 producer，或正式 Review 中真正终局的 reviewer / re_reviewer。Codex CLI 是当前第一公民 executor；它可以根据当前 artifact、阴性结果、review finding、质量债与用户目标，建议任意 declared stage，包括前进、跳过、重复、逆向和 route-back。

OPL Framework 只持有 StageRun transport、attempt ledger、queue/provider、durable invocation/currentness identity、artifact refs 与 operator projection。它不执行 transition table、oracle、fixed-point semantic reconcile、exactly-one transition selection 或格式级 admission gate。

在一个 StageRun 内，decisive Attempt 提交 `route_impact.stage_route_decision`；其他 Attempt 最多提交 recommendation。通常只有当前 Stage 产物可以终局时才选择 route；唯一的预算前例外是 reviewer / re_reviewer 已明确判断 required repair 属于另一个 declared Stage，此时以 `repair_required + route_back` 结束当前 StageRun，保留未关闭 findings 为质量债，并由 controller 物化目标 StageRun，不在错误 owner 下继续空跑 repair。`advance`、`repeat`、`skip`、`reverse` 或 `complete` 不享有这个例外。hard stop 只提交 typed blocker 或 human gate，不能再夹带跨 Stage route。这个 closeout 输出是 Codex 的一次语义判断，但不授予 Attempt 修改 current pointer 或直接操作 provider 的权限。OPL 只校验输出者资格、route ABI、finding closure 与 declared target，再由 `opl_stage_run_controller` 物化 transition。

若终局决定缺失或被拒绝，可消费 artifact 仍保留并形成路由质量债。fallback 先沿当前 action 明确声明的 ordered `required_stage_refs`；action 没有 route 时，只能沿当前 Stage 唯一的 `next_stage_refs`。多个 declared successor 时保持下一 Stage 未选择，manifest 文件排列顺序不能成为隐藏路由器。

当前自动兜底仅用于 primary-only producer 已完成且返回 Framework raw-progress 信封、没有路由输出的情况。Attempt 物化边界核对当前绑定 manifest 的字节摘要、域与 Stage catalog，再把明确默认去向固化到同一 context manifest；controller 不从已排序的 `declared_stage_ids` 推导顺序。仅 action 明确声明为 terminal 的最后阶段可形成 `complete`，无 successor 不能自行推断完成。兜底沿用真实产物引用并记录 `controller_missing_route_fallback_applied`，终态为 `completed_with_quality_debt`，不产生领域通过结论。正式 Review、显式但被拒绝的 route、缺失或歧义声明及真实硬停均不走该兜底；Temporal patch marker 保留已有工作流历史的原决定。

Stage 角色、独立 Attempt、预算分支、hard stop、route 输出及 finding/repair/closure 协议由 Framework 在 provider prompt 中统一注入。领域角色片段只补充专业审查范围、质量标准、证据及修复 owner 判断；领域无需重复通用协议文本。Conformance 校验声明的机器策略和角色片段引用，不按提示词关键词判断语义。角色文件及 fragment 仍由既有内容绑定机制保留精确字节和摘要，已绑定的历史内容不会被新的领域文件覆盖。

## Durable invocation 与物化

终态回读不依赖仍在运行的 worker。Temporal workflow 已 `COMPLETED` 时，查询读取
该精确 run 的持久结果并校验 StageRun surface 与 workflow 身份；若完成发生在查询
期间，再核对终态后走同一路径。运行中的查询错误仍保留，不以历史成功结果替换。

`stage_run_id` 只由 `domain_id + stage_id + stage_run_invocation_id` 派生。`stage_run_spec_sha256` 单独绑定不可变的 pack closure、Stage manifest、quality policy、source/checkpoint/input artifact、prompt/rubric/goal/lineage 的实际 byte digest、executor 与 parent route；root package 必须有 content digest，pack 外 source/checkpoint/artifact 必须带可信 content-addressed identity receipt。launch registration/replay、每次 Attempt materialization 和 executor prompt hydration 前都会 fresh 核对这些 binding；`checked_at`、`use_receipt_ref`、checkout path、currentness receipt 等波动观察不参与 Run ID 或 spec hash。

`native_package_closure` 与 `package_use_binding` 都属于包观测，不进入稳定的
workspace identity。包字节仍由 spec 的 `package_closure` 和每次 Attempt 的内容绑定
独立校验。旧 spec 若曾将 native closure 带入 workspace identity，其原字节和 hash
继续保留；父子身份及路由 replay 比较只投影稳定工作区字段，避免 Skill 更新被误判
为更换任务。真实 workspace、source、executor 或包内容不匹配仍拒绝。

Runway 在启动 Temporal 前，先把 exact StageRun input 写入 `${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_run_launches`。真正调用 provider 前再用带 lease 的 `BEGIN IMMEDIATE` compare-and-swap 收敛 `registered|start_failed|expired starting`；active `starting` caller 只获得幂等 readback。未知成功恢复允许按同一 deterministic workflow id 重投 RPC，所以 provider delivery 是 at-least-once；Temporal `USE_EXISTING + REJECT_DUPLICATE` 保证 execution exactly one。`started` 不得降级，`closed` 永久终局。同 invocation + 同 spec 的 running/closed Run 幂等返回；同 invocation + 不同 spec 以 `stage_run_invocation_spec_conflict` 失败。

正式终态恢复使用原 StageRun、immutable launch 和 quality cycle；从已接受 producer、repair-required reviewer 或 repairer 接续下一角色，保留原 findings、revision intake、审查回执、已用轮数和质量债。恢复使用已接受 typed closeout，原 raw 字节仍独立校验，不用过期可解析响应覆盖已接受协议。历史观察只重新核验真实输入证据，正常包升级不要求覆盖原已绑定包字节。

若初次 reviewer 因 `codex_cli_provider_unavailable` 阻断且没有已接受语义 closeout，在外部配额或权限恢复后，可对原 reviewer 执行 `opl family-runtime stage-run recover-closeout <stage_run_id> --attempt <reviewer_attempt_id> --retry-reviewer`。入口要求它仍是当前质量链最后一次 Attempt，并核验同 StageRun 已完成 producer 的 artifact 字节身份；现有恢复控制器创建新的 reviewer Attempt，保留原阻断记录与已用语义修复轮数，不重新运行 producer、不新建 ActionRun。领域 review 文件中的 `pass` 不会被 Framework 推定为已接受 verdict；实际通过与后续 route 仍须由新的正式 Review 给出。human gate、后续已推进的质量链、不同 scope 或已变化 artifact 不可走此入口。

Closeout 恢复接受完整 JSON 对象及完整 JSON 代码块，记录无法归一化的原因。`domain_output` 先验证四字段身份与 `closeout_refs` 绑定，再丢弃额外正文、状态和 verdict；台账只保存 refs-only 身份。原始输出在 Attempt 物化时同时核对 producing Stage，身份或物理路径边界失败仍然终止。Review lane 由 Stage 声明决定：没有绑定时忽略请求中的 lane 提示，controller-required 目标缺少父 lane 时保留质量债并继续路由；已声明但不允许的父 lane 仍拒绝。长会话的同线程 closeout 补交默认预算为 900 秒，且仍受 Activity 总时限约束。

直接 closeout 与同线程 protocol-resume 均可以引用本 Attempt 工作区内已经写出的 closeout packet；直接 packet 缺失的 route_impact 从该已核验文件补全，显式字段冲突不被覆盖。该路径绑定稳定观测字节的 SHA-256 与长度，不要求 packet 声明自身的哈希；工作区包含性、文件稳定性、当前 Attempt 身份、packet 类型和显式字段冲突仍须核验。独立 recovery 路径继续严格核对已声明的 digest 和长度。两条路径都只恢复 transport 与原有语义输出，不把文件持久化当成领域验收。

Finding、repair、closure 与跨 Stage route 的证据引用接受非空 locator 字符串或带非空 `ref` 的对象，归一化结果仍是字符串列表；引用对象中的其他元数据不能替代 artifact identity receipt。证据列表及其成员不能为空白。`changed_artifact_refs` 可为空，使未修复或被阻断的 repair 能如实声明没有产物变化。

恢复身份推进须先精确观察原 Temporal Run 已终止，再通过原注册表 CAS 留存先前回执。尚未开始审查的同一已接受 producer 可追加快照成员，旧成员和 artifact identity 必须保留；不能换 lane、workspace、binding 或替换已审证据。运行中的不同恢复身份仍拒绝，新的 Temporal Run 不代表新的业务 StageRun，也不改写原终态。

CLI 默认 invocation 是稳定幂等键；`--new-stage-run` 显式创建新 Run。Hosted action 用 action `run_id + action_run_ref` 建立 invocation。跨 Stage 路由用 parent StageRun、decisive Attempt ref、route decision digest 与 target Stage 建立 invocation，因此同一 route replay 复用目标 Run，后续新决定或 A → B → A route-back 会创建新 Run。

目标 action 优先保留已声明该 Stage 的父 action，否则采用该 Stage 唯一的 entry action 或唯一包含它的 action；歧义拒绝，不能按字母顺序选择。route replay 使用持久目标的 pack 路径核对同一 action 身份。缺少 action catalog 的非标准 pack 保持既有父 action 行为。

`complete` 只关闭当前 workflow，不启动目标 Run。其他通过 authority/ABI 校验的决定必须由 controller 实际注册并启动目标 StageRun；controller 不得把“记录了 route”冒充“transition 已物化”。

宿主 Codex 领域 Attempt 将 pack 的 `src/` 和 Framework 的 `python/` 注入 `PYTHONPATH`，保留既有导入路径。优先保留已配置或继承的兼容 Python 环境，必要时使用已有 uv runtime，并实际核验 `python3` 满足 pack 声明的最低版本（未声明时至少 3.11）；缺失时给出可诊断错误，不自动安装或宣称领域能力就绪。非 Python pack 不改变环境。沙箱保持其原有 provisioner 环境，不投射宿主路径。

## Progress-first

- 任意可读 artifact、部分草稿、失败尝试、阴性结果或已成功物化的 diagnostic 都是下一 stage 的输入。
- retry、review、repair 次数只是质量预算；预算耗尽后保留最佳可读 artifact 并推进。
- 质量债只能关闭 accepted、ready、publication、export 或 promotion 声明，不能关闭 stage transition。
- route-back 是新的 progress 分支，必须携带既有证据与 failed-path lineage，不能把阴性结果丢弃后原地重来。

## 合法硬停

只有以下边界可阻止启动下一 stage：selected executor 不可用；权限、凭据、安全或 authority 边界；wrong-target identity/currentness 不匹配；不可逆外部动作；明确 human/owner decision；以及 diagnostic 尝试后仍不存在任何可消费 artifact。原始执行零输出或 artifact 损坏时，controller 应先尝试物化 failure/no-output diagnostic；成功物化的 diagnostic 本身就是可消费 progress，只有连 diagnostic 都无法形成的字面零可消费产物才是 hard gate。

这些硬停保护执行安全与身份一致性，不评价内容质量，也不选择语义路线。

reviewer / re_reviewer 的 `stage_quality_cycle.artifact_refs` 与 `artifact_hashes` 标识被审的 producer / repairer 产物；可同时省略以继承输入身份，或按原顺序原样回传。审查报告与 immutable snapshot 的读取地址不能替换该身份。身份不符时，新 controller 明确返回 `blocked`、`hard_stop_class=stale_or_mismatched_stage_identity`、`blocked_reason=reviewed_artifact_identity_mismatch` 和原 `source_attempt_ref`，不伪造 review receipt，也不将其降为缺少 route 的质量债。Attempt projection 失败仍单独留存，不能覆盖该身份拒绝原因。身份一致且没有 required findings 的 `quality_debt` 保留 reviewer 的终局 route 并物化后续 StageRun。

SHA-256 的 64 位十六进制值与 `sha256:` 前缀形式按同一字节摘要比较，大小写归一；
原输入身份及 receipt 继续保留。文件引用及顺序、真实摘要差异和其他算法仍严格区分。
新行为通过 Temporal patch marker 进入，旧历史 replay 保留原决定；这只是传输表示
归一，不产生语义审查结论。

## 当前机器入口

- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `contracts/opl-framework/stage-run-kernel-contract.json`
- `contracts/opl-framework/stage-route-transport-contract.json`
- `src/adapters/execution/standard-agent-action-runtime.ts`
- `src/adapters/execution/family-runtime-stage-run-identity.ts`
- `src/adapters/execution/family-runtime-stage-run-launch-registry.ts`
- `src/adapters/execution/family-runtime-stage-run-route-launch.ts`
- `src/authority/stages/stage-run-kernel.ts`
- `src/adapters/execution/progress-closeout-projection.ts`
- `tests/src/standard-agent-action-runtime.test.ts`
- `tests/src/family-runtime-stage-run-launch.test.ts`
- `tests/src/cli/cases/agents-conformance-stage-run-kernel.test.ts`
