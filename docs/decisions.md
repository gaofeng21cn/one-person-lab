# OPL 关键决策

Owner: `One Person Lab`
Purpose: `decisions`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 2026-05-21

### 决策：OPL stage / route 调度固定为 graph hydration reconciliation attempt-ledger 模型

原因：MAS 这类复杂 domain agent 会输出 owner-route、route-back、typed blocker、owner receipt、source fingerprint、dispatch ref 和推荐 task/stage 语义。如果把 route 当成小 stage，OPL 会重新发明 domain runtime，或者让 domain repo 继续保留私有 scheduler / runner / lifecycle loop。正确的顶层设计是：stage 是 OPL 可执行、可恢复、可审计的 attempt 单元；route 是 domain owner 语义；OPL 只 hydrate route refs into stage/queue，并用 stage graph、reconciliation loop、read model 和 attempt ledger 管理可见性与恢复。

影响：

- `contracts/opl-framework/stage-route-scheduler-contract.json` 成为 framework-level stage/route 调度边界合同。它把 MAS 作为 complex-domain reference，固定 stage、route、route hydration、attempt ledger 四个定义，并声明 route 不是小 stage、route hydration 不执行 route、provider completion 不等于 owner receipt。
- `family-stage-graph-projection` 继续表达 admitted stage pack 的 nodes、requires/ensures edges、integrity digest、launch blockers 与 scheduler/App read model；它不执行 stage、不写 domain truth、不授权 domain readiness。
- `family-owner-route` 继续表达 domain owner 的下一步、route-back、typed blocker、allowed action、owner receipt 或 handoff refs；它不等于 OPL attempt，不是 stage graph 的隐藏 node。
- `family-runtime-attempt-contract` 负责把 owner-route refs、typed blocker refs、owner receipt refs、source fingerprint 和 dispatch ref 记录为 route hydration input / attempt ledger refs，并输出 typed queue task、stage attempt request、conflict envelope 或 operator projection。
- OPL reconciliation loop 的读法对齐 Temporal event history、LangGraph checkpoint / conditional edge、Kubernetes desired/current reconciliation 与 Dagster graph/op boundary，但只吸收图、checkpoint、reconciliation、read-model 和 op boundary 模式，不引入这些系统作为新的 OPL core runtime，也不把 domain truth / quality verdict / artifact authority 迁入 OPL。
- 后续若 MAS/MAG/RCA 或新 Foundry Agent 暴露 route refs，默认先检查 OPL route hydration、queue、stage graph、attempt ledger、dead-letter 和 owner receipt projection；不得让 domain 仓重新补 generic scheduler、attempt loop、SQLite lifecycle platform 或 App/workbench wrapper。

### 决策：MAS publication aftercare owner-route refs 由 OPL family-runtime hydrate / queue / attempt 承接

原因：MAS 已按标准 OPL Agent 边界收薄为只输出 publication aftercare owner-route task refs、source refs、typed blocker refs 与 owner receipt refs。后续推进不能再让 MAS 补 runtime liveness、active run、redrive、retry/dead-letter 或 queue arbitration；这些属于 OPL provider/runtime manager 与 family-runtime typed queue。

影响：

- `opl family-runtime intake|tick --hydrate` 必须能消费 MAS sidecar export 的 `publication_aftercare/*` pending family task，以及 MAS runtime owner-route handoff 的 refs-only export shape，并把它们投影为 OPL-owned queued task / stage attempt / dispatch state。OPL intake 接受 MAS 使用 `med-autoscience` domain alias、`recommended_task_kind`、`owner_route_ref(s)`、`owner_route` explicit ref、`runtime_state_path`、`quest_waiting_opl_runtime_owner_route` reason 和 `opl_runtime_owner_route_handoff` envelope，但只把这些作为 queue/projection refs。
- OPL queue status 可以展示 `owner_route_refs`、`owner_receipt_refs`、`typed_blocker_refs`、`source_refs`、`source_fingerprint` 与 publication aftercare reason，但这些只是 refs 和投影，不是 MAS quality verdict、study truth 或 artifact authority。
- MAS sidecar dispatch 仍是 domain owner callable；OPL 只负责 queue、attempt、dispatch transport、retry/dead-letter 和 operator status。是否更新论文、publication gate、AI reviewer verdict 或 current package，继续由 MAS owner receipt / typed blocker 决定。
- 任何 DM002 这类 paper-line 卡住时，优先检查 OPL family-runtime hydration / queue / attempt / dead-letter，再回到 MAS owner surface；不得把 liveness / redrive 仲裁补回 MAS 私有 runtime。
- 2026-05-21 追加：OPL dead-letter redrive 的 source freshness 识别必须覆盖 MAS repair task 的明确 nested contract：`payload.repair_work_unit.source_fingerprint`。顶层 `payload.source_fingerprint` 继续优先；nested repair work-unit fingerprint 只作为已知 MAS work-unit contract 使用，不做任意深扫、宽松 token normalizer 或 heuristic fallback。同一 owner/export fingerprint 下，只有该 source fingerprint 变化才允许 dead-letter requeue；context refs 变化但 source fingerprint 不变时保持 idempotent noop。
- 2026-05-21 追加：使用 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE` 的 MAS family-runtime dispatch 必须与 hydrate/export 使用同一个 OPL module locator。默认 dispatch 解析为 `uv run --directory <active MAS module checkout> --extra analysis medautosci sidecar dispatch --task <task> --format json`；只有显式 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH` 才能 override。这样 OPL queue 仍只负责 transport/retry，但不会在 MAS owner callable 修复后继续误调 PATH 上或 managed state 中的旧命令面。
- 2026-05-21 追加：`opl family-runtime intake|tick --hydrate --profile <profile>` 是 MAS profile 的显式 operator override，优先于 env profile 与 active workspace binding。它只选择 MAS sidecar export 的 profile，并继续通过 OPL module locator 调用 active MAS checkout；OPL 不因此获得 MAS study truth、publication verdict、artifact authority 或 owner receipt 权限。
- 2026-05-22 追加：当 MAS sidecar export 暴露 `domain_owner/default-executor-dispatch` task 时，OPL family runtime 负责把该 task 入队、建立 `codex_cli` stage attempt，并在 Temporal provider 可启动时直接启动该 Codex owner workflow。当前 admission 只接受 MAS 已注册的 default-executor owner：`write`、`ai_reviewer` 和 `write/ai_reviewer`。workspace locator 保留 `dispatch_ref`、action type、dispatch authority、source refs、`next_executable_owner` 和 `authority_boundary=mas_default_executor_dispatch_request_only`。该 queue task 只有在 Temporal start receipt 已记录后才可标记为 `succeeded`；Temporal address / worker / stage packet 不可启动时必须 fail-closed 为 `blocked`，不能只留下 queued attempt。
- 2026-05-22 追加：`domain_owner/default-executor-dispatch` 的 queue `succeeded` 只表示 OPL 已接收 MAS owner handoff 并启动 provider-backed Codex owner attempt；不得把它解释成 Codex owner attempt 已完成、MAS owner receipt 已产生、论文质量已关闭或 package/current manuscript 已刷新。
- 2026-05-22 追加：`domain_owner/default-executor-dispatch` 不走 MAS sidecar dispatch activity，也不允许 OPL 写 domain truth、publication quality、artifact gate 或 current package。后续论文推进必须由 queued Codex stage attempt 读取 MAS dispatch request / prompt contract 后走 MAS owner path，并以 MAS owner receipt、AI reviewer-backed `publication_eval/latest.json`、publication gate 或 typed blocker 作为完成证据。
- 2026-05-22 追加：queued `codex_cli` stage attempt 启动后默认必须进入真实 Codex CLI runner；只有显式 `codex_stage_runner.runner_mode=dry_run|live_dry_run` 的测试、诊断或 fixture 才允许 dry-run transport。`executor_kind=codex_cli` 不能静默降级成 dry-run，否则 MAS default executor handoff 只会留下 checkpoint/blocked 投影而不会启动 writer owner。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 的本地 `codex_stage_activity` projection 也必须继承 `executor_kind=codex_cli` 的 live-runner 语义，除非 operator 显式设置 `OPL_CODEX_STAGE_RUNNER_MODE=dry_run|live_dry_run`。本地 projection 不能在 Temporal workflow 已启动真实 Codex activity 时默认显示 dry-run，否则 supervisor 会误判 writer 没有启动；实际完成仍以 Temporal activity closeout、typed closeout packet 和 domain owner receipt 为准。
- 2026-05-22 追加：`codex_cli` stage attempt 是长时 AI executor 工作，不是 10 分钟内必须完成的普通 sidecar activity。Temporal provider 对 Codex activity 使用长 `start_to_close`、短 heartbeat timeout 和周期 heartbeat，默认 Codex runner 窗口为 60 分钟；sidecar dispatch 和 scheduler tick 继续使用短 activity timeout。这样 MAS 论文 writer 可以完成大稿修复或 typed blocker，而不会被 OPL transport 在第 10 分钟杀掉。
- 2026-05-24 追加：`codex_cli` stage runner 的外层 Temporal heartbeat 只表达 worker activity 仍在监督进程，不能单独证明 Codex 子进程或 session 正在推进。runner 必须同时保留 60 分钟总窗口和独立的无输出进展 watchdog；默认 `runner_no_output_timeout_ms=300000`，可由 workflow input 或 `OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS` 收紧或放宽。无 stdout/stderr 进展超过该窗口时，OPL provider transport fail-closed 为 `timeout_reason=no_output_timeout`，让 attempt 进入 provider blocker/redrive，而不是靠 heartbeat 无限续命。该规则不授权 MAS domain truth、owner receipt、publication quality、artifact gate 或 current package。
- 2026-05-26 追加：如果 `Codex CLI --json` 在 stdout 或同 thread 的 `CODEX_HOME/sessions/**/<thread-id>.jsonl` 中产生 Responses native `function_call`，但 OPL 当前没有为该 nested Codex session 提供 tool host / function_call_output 回路，`codex_cli` stage runner 必须立即 fail-fast 为 `timeout_reason=unsupported_tool_protocol` / `blocked_reason=codex_cli_unsupported_function_call`，并终止子进程组，不能等无输出 watchdog 把它泛化成 `typed_closeout_packet_required`。如果同一 session 已产生匹配 `function_call_output` / `tool_call_output` / `tool_result`，则该调用已由 Codex CLI 自身完成，不能被 session recovery 误计为 pending unsupported tool call；此时 runner 应继续按 terminal typed closeout、no-output timeout 或总超时判断。Temporal workflow 必须把真实 provider blocker 传给 dispatch activity，attempt / queue read model 必须把未解决的工具协议缺口归类为 OPL `execution_retryable` infrastructure blocker，用于 retry/redrive；该 blocker 不授权 MAS domain truth、owner receipt、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：`codex_cli` provider attempt 的 workflow input 必须携带真实 stage packet ref，并把 MAS default executor 的 workspace locator 绑定到 domain workspace root；不能让 Codex runner 在 OPL repo 里只拿到 attempt id 和 `stage_packet_ref=unavailable`。Codex activity 也不能因短 heartbeat timeout 自动重复启动多个同一 attempt 的 live Codex 进程；一次 Codex activity 失败应作为 provider failure / typed blocker 进入 owner routing，而不是隐式并发重试。
- 2026-05-22 追加：App/operator 上游的 `stage_attempt_workbench` 必须把 queued MAS default `codex_cli` attempt 的 stage packet ref、domain workspace root、profile ref 和 object-form source refs 投影出来。该投影只是 launch/provenance/read-model evidence：它可以帮助 operator 确认 Codex 将在 domain workspace 内读取明确 dispatch/stage packet，但不能声明 stage complete、domain ready、production ready、MAS owner receipt、论文质量或 package 刷新。live `codex_cli` 启动前继续 fail-closed 检查 stage packet ref 与 workspace root；inspect/query/read-model 路径保持可读，用于暴露缺口。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 在可观测到 Temporal terminal failure 或 timeout 时，必须把本地 `stage_attempts` ledger 的 OPL transport projection 同步为 `failed`，并在 `provider_run.terminal_observation` 保留 Temporal `workflow_status` / query status / reason。该同步只表达 provider-backed stage attempt transport 已失败，用于避免 operator 误读 queued/registered；它不授权 stage complete、domain ready、domain owner receipt、artifact authority、质量 verdict 或 production evidence closure。
- 2026-05-25 追加：Temporal terminal failure / timeout 的 read-model sync 必须以 `workflow.describe()` 的 terminal `workflow_status` 为先。对于已经 `FAILED` 或 `TIMED_OUT` 的 workflow，custom `StageAttemptQuery` 可能不可用或长时间无响应；OPL 不得把这种 terminal query failure 误投影成 `temporal_service_unreachable`，也不得因此让本地 `stage_attempts` / linked MAS default-executor queue task 停留在假 `running`。对于已经 `COMPLETED` 的 workflow，attempt query / inspect 必须优先读取 Temporal 存储的 workflow result，同步其中的 typed closeout refs；不得为了读取 terminal completed state 重新 query/replay 旧 workflow history，因为 provider activity rename 会触发 nondeterminism。该同步只关闭 OPL provider transport liveness，不生成 MAS owner receipt、不写 domain truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-26 追加：MAS default-executor scheduler / tick / admission 在因同 dispatch live attempt 执行 live-skip 之前，必须先查询可观测 Temporal terminal state 并同步本地 attempt/task read-model。若旧 workflow 已 `FAILED`、`TIMED_OUT`、provider non-completed 或 provider-completed typed closeout，OPL 必须先把 linked task 收敛为 `blocked` / `succeeded` / accepted typed closeout projection，再继续当前 queued row selection；不得继续刷新旧 lease 或把旧 workflow 当成 live single-flight blocker。tick 即使没有 queued work，也必须扫描 scoped running MAS default-executor task，主动同步可观测 terminal provider attempt，避免外层巡检把 terminal workflow 长期投影成 live run。该规则只修复 OPL queue liveness arbitration，不生成 MAS owner receipt、不写 study truth、不授权 publication gate、paper package 或 `current_package`。
- 2026-05-26 追加：MAS default-executor scheduler / tick / admission 对旧 Temporal workflow 的观察必须走 OPL 安全 read-model 查询入口，不能在 queue tick 或 single-flight live-skip 前直接调用 provider raw query。`WorkflowNotFoundError` / missing workflow 必须被投影为 `temporal_stage_attempt_query_unavailable`，再由 attempt/task sync 和 provider-transport auto-redrive 收敛；未知 provider 错误仍按 fail-closed 抛出。该规则避免一个过期 workflow ID 终止整轮 scheduler tick，但只修复 OPL provider transport liveness，不写 MAS truth、不刷新 paper package、不关闭 publication quality。
- 2026-05-25 追加：MAS default-executor single-flight 只能由真实 live linked task/attempt 触发。若同 dispatch 的旧 `stage_attempt` 仍残留 `running` / `checkpointed` / `human_gate`，但其 linked queue task 已进入 `blocked`、`dead_letter` 等非 live 状态，或 attempt 的 `provider_run.provider_status` 已 terminal，scheduler / default-executor start 不得继续用它跳过新 source row；该旧 attempt 只能作为 provider transport/read-model residue，不能阻挡 MAS owner 新 handoff。该规则只修正 OPL queue liveness arbitration，不生成 MAS owner receipt、不写 domain truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 对 MAS `domain_owner/default-executor-dispatch` 的 linked queue task 还必须反向同步 provider non-completion。若 Temporal query 显示 workflow 已结束但 stage query status 为 `blocked`，例如 domain sidecar dispatch 返回 `typed_closeout_packet_required`，OPL 要把本地 stage attempt 投影为 `blocked`，并把原先因 provider start 成功而标记的 queue task 从 `succeeded` 改为 `blocked`，`last_error` 保留 blocker reason，`dead_letter_reason=temporal_stage_attempt_not_completed`。该反向同步只修复 operator/read-model 的 liveness 与 blocker 可见性，不执行 writer 修复、不生成 MAS owner receipt、不更新 paper/package/`current_package`，也不授权 publication ready、domain ready 或 artifact mutation。
- 2026-05-22 追加：`codex_cli` stage runner 可以从 Codex `--json` 的最后一个非空 `agent_message` 中读取 typed closeout JSON，但只接受终端消息本身是 `stage_attempt_closeout_packet`、`stage_memory_closeout_packet` 或 `domain_stage_closeout_packet` 且带 closeout refs 的情况；非终端 JSON、正文、代码块或 free text 都不能作为 completion。Temporal `StageAttemptWorkflow` 必须把 Codex activity receipt 中的 typed closeout packet 传给后续 domain sidecar dispatch activity；若没有 packet，继续 fail closed 为 `typed_closeout_packet_required`。这只修 OPL provider completion 传递链，不授权 domain ready、MAS owner receipt、publication quality、artifact gate 或 current package。
- 2026-05-27 追加：`codex_cli` stage runner 与 Temporal `StageAttemptWorkflow` 接受 typed closeout packet 前必须校验 current attempt binding。若 packet 携带的 `stage_attempt_id` 与当前 attempt 不一致，必须丢弃该 packet 并 fail closed 为 `typed_closeout_stage_attempt_id_mismatch`，不能把旧 attempt/session 的 closeout refs 传给 domain dispatch 或标记 provider completed。runner 对可用的 `idempotency_key` 也执行同类 currentness 校验。该规则只修复 OPL provider closeout currentness，不生成 domain owner receipt、不写 MAS truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：当 `domain_owner/default-executor-dispatch` 因 OPL provider transport 问题进入 `blocked`，且 `dead_letter_reason` 明确为 `temporal_stage_attempt_start_failed`、`temporal_stage_attempt_not_completed` 或 `temporal_stage_attempt_failed` 时，operator redrive 归 OPL queue/attempt owner。`opl family-runtime queue redrive <task_id> --reason <operator_reason>` 只能在同一 MAS source fingerprint 下创建新的 provider stage attempt 并把 queue task 放回 `queued`；它不得修改 MAS source fingerprint、domain truth、publication quality、artifact gate、paper package 或 `current_package`，也不得把 redrive 解释为 MAS owner receipt 或论文 ready。domain owner export/source fingerprint 变化时仍走 hydration requeue。
- 2026-05-26 追加：上述 provider transport blocker redrive 也可以由 `family-runtime tick` 自动执行，但只能用于 MAS `domain_owner/default-executor-dispatch` 的 OPL-owned provider blocker，且 `dead_letter_reason` 必须仍属于 `temporal_stage_attempt_start_failed`、`temporal_stage_attempt_not_completed` 或 `temporal_stage_attempt_failed`。自动 redrive 必须遵守 queue `max_attempts`，超过预算时进入 `dead_letter/retry_budget_exhausted`；若同 dispatch 已有更新 source fingerprint 的当前 MAS handoff，旧 blocked task 不得被自动 redrive，只保留为 audit residue。该自动动作只创建新的 provider stage attempt / queue retry，不写 MAS truth、不刷新 paper package、不关闭 publication quality、不替 MAS AI reviewer 宣布 ready。
- 2026-05-27 追加：所有 OPL family-runtime SQLite 连接，包括 queue、lifecycle index、operator tray、production closeout 和 domain memory 的读路径，都必须通过统一 opener 设置 `PRAGMA busy_timeout`。短时 WAL 写锁只能让读取等待 bounded 时间，不能把 `database is locked` 投影成 provider unhealthy、巡检失败或 MAS 论文线需要人工恢复。该规则只提高 OPL queue/read-model 对正常并发的耐受度；它不修改 MAS domain truth、不生成 owner receipt、不授权 publication quality、artifact authority 或 paper package 刷新。
- 2026-05-22 追加：`codex_cli` stage runner 的 Codex JSONL parser 必须同时支持 legacy `thread.started` / `item.completed` 事件和 Codex Desktop/exec session JSONL 包装事件：`session_meta.payload.id` 作为 thread id，`event_msg.payload.type=agent_message` 的 `payload.message`、`event_msg.payload.type=task_complete` 的 `payload.last_agent_message`、以及 `response_item.payload.type=message` 的 assistant content 都属于可观测 assistant message。typed closeout 仍只从最后一个非空 assistant message 解析；支持新包装格式不能变成从任意历史 message、token_count、function output 或 free text 中猜测 closeout。
- 2026-05-22 追加：如果 Codex CLI stdout 只暴露 `session_meta` / thread id，而终端 assistant closeout 只落在同一 thread 的 Codex session JSONL，`codex_cli` stage runner 可以从 `CODEX_HOME/sessions/**/<thread-id>.jsonl` 做一次受限恢复。恢复仍必须复用同一 strict parser，只接受最后一个非空 assistant message 中的 typed closeout packet；找不到同 thread session、session 文件过大、超过扫描界限或终端消息不是纯 typed JSON 时继续 fail closed 为 `typed_closeout_packet_required`。
- 2026-05-22 追加：Codex Desktop / Codex exec 的终端 assistant closeout 可能在 stdout/session JSONL 中表现为相邻 `agent_message` chunks，或在进程退出后才完成 session file flush。`codex_cli` stage runner 可以在受限时间窗口内重读同 thread session，并可以把终端连续 assistant message suffix 还原后再做 strict JSON parse；但仍只接受终端 suffix 整体是纯 typed closeout JSON 的情况，不能从非终端 progress JSON、命令输出、正文片段、代码块或任意历史 message 中拼接/猜测 closeout。该规则只增强 provider transport 对真实 Codex 输出形态的鲁棒性，不改变 OPL 不能授权 domain truth、MAS owner receipt、publication quality、artifact gate 或 current package 的边界。
- 2026-05-22 追加：`family-runtime queue inspect` 必须像 `attempt query|inspect` 一样对 linked Temporal stage attempt 做 terminal read-model sync。若 Temporal workflow 已 `COMPLETED` 且 query completion boundary 为 provider completed，OPL 只把经过 domain sidecar dispatch receipt projection 的 typed closeout refs、consumed refs、writeback refs、next owner、route impact 和 domain-owned verdict string ingest 到本地 attempt ledger；该同步只修复 queue/operator read-model currentness，不生成 MAS owner receipt、不写 domain truth、不授权 artifact / package / publication ready，也不把 provider completion 写成 domain ready。
- 2026-05-22 追加：linked MAS default executor task 的 task-level projection 必须按当前 attempt 顺序收敛，不能让旧 Temporal terminal failure 覆盖较新的 accepted typed closeout。OPL 可以把同 task 的 provider-only blocker 清回 `succeeded`，也可以把当前 terminal failure/blocker 投到 task；但一旦同 task 下存在更新的 accepted typed closeout，旧 failed/blocked attempt 只能更新自身 attempt ledger，不得改写 task status、last error 或 dead-letter reason。该规则只修复 queue/read-model currentness，不改变 MAS owner receipt、publication verdict、artifact authority 或 package refresh 权限。
- 2026-05-22 追加：linked MAS default executor task 的旧 terminal blocker 也不得覆盖同 task 下较新的 queued/running redrive attempt。operator redrive 创建新 attempt 后，旧 workflow 的迟到 `typed_closeout_packet_required` 只能更新旧 attempt ledger；task-level status 继续表达当前 redrive attempt 的启动/运行状态，直到该较新 attempt 自己产生 terminal blocker、typed closeout、MAS owner receipt 或 domain gate receipt。该规则只解决 provider transport 观察乱序，不授权 MAS domain truth、publication quality、artifact gate 或 current package。
- 2026-05-23 追加：linked MAS default executor task 的 `succeeded` 是 provider-admission receipt，不是 domain terminal completion。hydrate/export 若用相同 dedupe key 送来更新的 dispatch payload、owner route refs 或 source fingerprint，OPL 不能套用通用 `succeeded + payload changed => requeue` 规则重启 writer；这会在 MAS route 已转向 AI reviewer 或 gate 后启动 stale writer attempt。自动重驱动只允许用于 blocked provider transport 且原因在 OPL redrive contract 内，或由 MAS owner 以新的 dedupe/work-unit task 明确表达。
- 2026-05-26 修订：当 MAS sidecar 仍导出同一个 `domain_owner/default-executor-dispatch` pending task，且同 dedupe 的 linked task 只是旧 `succeeded` provider-admission projection 时，OPL 不得因 `payload.opl_domain_export_context.owner_fingerprint` 新增或变化而 requeue 或启动新的 provider attempt；同 dedupe 的 succeeded MAS default-executor task 只能刷新 `opl_domain_export_context` 与 `domain_dispatch_evidence_record_payload` 这类 refs-only metadata，并记录 `task_metadata_refreshed_from_domain_export`。需要新 attempt 时，必须由 blocked provider transport redrive、operator redrive，或 MAS owner 以新的 dedupe/work-unit task 明确表达。OPL 仍不写 MAS domain truth、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-24 追加：`domain_owner/default-executor-dispatch` admission 对同一 queue task 必须 single-flight。只要同 task 已有 `queued`、`running`、`checkpointed` 或 `human_gate` 的 Temporal `codex_cli` stage attempt，hydrate/source fingerprint 变化不得再创建第二个 live attempt；start Temporal 前也必须先用 queue task 的 `queued|retry_waiting -> running` 原子 claim 拿到 lease。claim 失败或已有 live attempt 时只记录 skipped event，不启动第二个 Temporal workflow，不把 task 错误转成 provider blocker。operator redrive 仍只允许 blocked provider-transport task 通过 OPL redrive contract 生成新 attempt；该规则不授权 MAS domain truth、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-25 追加：`domain_owner/default-executor-dispatch` single-flight 还必须跨 refreshed task row 生效。MAS sidecar export 的 `source_fingerprint`、dedupe key 或 owner implementation fingerprint 变化可能让同一 owner handoff 落成新的 queue task；只要已有 live Temporal `codex_cli` attempt 绑定同一 `workspace_root`、`study_id`、`action_type` 和 `dispatch_ref`，新 task 只能记录 `live_stage_attempt_exists_for_dispatch` skip，不得再创建或启动第二个 writer / AI reviewer workflow。该规则只约束 OPL admission / provider transport single-flight，不写 MAS truth、不合并论文结论、不授权 publication ready、artifact gate 或 package/current manuscript。
- 2026-05-25 追加：跨 task 的 `domain_owner/default-executor-dispatch` single-flight 默认只把已经 provider-started 的 live attempt 视作占用，也就是本地状态 `running`、`checkpointed` 或 `human_gate`；唯一例外是同一 dispatch identity 的 `queued` attempt 已绑定一个持有新鲜 `running` lease 的 queue task，此时它代表已 claim 但 Temporal start receipt 尚未落回的 admission 窗口，也必须阻断并发 task 抢跑。同一 task 内的 `queued` attempt 仍用于防重复创建；但无有效 task lease 的跨 task `queued` / `registered` ledger residue 不能挡住 refreshed task 启动，否则 Temporal workflow 未创建或不存在时会把 MAS owner handoff 永久卡成假 live。该规则仍只修 OPL queue/provider liveness，不写 MAS truth、不授权 artifact gate、publication quality、paper package 或 `current_package`。
- 2026-05-25 追加：跨 task 的 `domain_owner/default-executor-dispatch` single-flight 以同一 dispatch identity 的 live provider-started attempt 为准，而不是只看同一 MAS `source_fingerprint`。`source_fingerprint` 变化可以让 OPL 保留新的 queued/retry task 作为当前 owner export 待处理事实；但只要同一 `workspace_root` / `study_id` / `action_type` / `dispatch_ref` 下已有 `running`、`checkpointed` 或 `human_gate` 的 Temporal `codex_cli` attempt，新 task 只能记录 live-skip 并刷新 running task lease，不能启动第二个 writer / reviewer workflow。无有效 task lease 的跨 task `queued` / `registered` residue 仍不得阻断 refreshed task 启动。该规则只治理 OPL queue selection、attempt liveness 与 read-model 去污染，不写 MAS truth、不选择 domain verdict、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-27 追加：上述 single-flight 必须在 queue intake / hydrate enqueue 阶段同样生效。MAS sidecar export 若因 `source_fingerprint`、dedupe key 或 owner implementation fingerprint 刷新而再次暴露同一 `workspace_root` / `study_id` / `action_type` / `dispatch_ref`，且 OPL 已有同 dispatch 的 live provider-started `codex_cli` attempt，`enqueue` 不得新增 queued task；它只能刷新 live running task 的 OPL lease、记录 `task_default_executor_live_dispatch_enqueue_noop`，并把 candidate source 作为审计 metadata。该规则防止同一论文 writer / AI reviewer workflow 在 intake 层堆积重复 queued row；它仍只治理 OPL queue/provider lifecycle，不写 MAS study truth、不刷新 paper package、不关闭 publication quality、不签 owner receipt。
- 2026-05-24 追加：managed Temporal worker 的 ready 状态必须绑定启动时的 OPL source version。`worker status/start` 发现 `temporal-worker.json` 中的 managed worker pid 仍存活但 source version 缺失或不同于当前 checkout 时，必须 fail-closed 为 `worker_source_stale`，提示 operator 先 `worker stop` 再 `worker start`；不得把旧 worker 判为 ready，也不得让 scheduler/tick 继续用旧 admission、single-flight、queue 或 provider lifecycle 逻辑。该规则只约束 OPL provider lifecycle/readiness，不终止 workflow、不写 domain truth、不授权 MAS publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-26 追加：managed Temporal worker source version 只绑定 OPL family-runtime worker 运行代码指纹，而不是整个 git HEAD。docs、ledger、README、contract narrative 或其它非 worker runtime 变更不得让 provider worker 反复进入 `worker_source_stale`，否则 MAS/MAG/RCA 的长期队列会被无关文档提交打断；`src/family-runtime-*` 运行代码及其 parts helper 变化仍必须改变指纹并触发 fail-closed restart。该规则仍只约束 OPL provider lifecycle/readiness，不写 domain truth、不授权 domain ready、quality verdict、artifact gate、paper package 或 `current_package`。
- 2026-05-25 追加：`opl family-runtime worker stop --provider temporal` 必须等待 managed worker 进程真实退出；若 `SIGTERM` 后仍存活，应在短 grace window 后执行 OPL-managed force stop，并把 `force_stopped` / `stop_incomplete` 与 signal actions 投到 lifecycle stop receipt。删除 stale state file 不能替代进程退出确认。该规则只修 OPL provider lifecycle cleanup，不终止 domain truth、不修改 MAS artifact / paper / package surface，也不把 worker restart 解释成 domain stage 完成。
- 2026-05-25 追加：`opl family-runtime worker stop --provider temporal` 不能只信任 `temporal-worker.json` 的单一 PID。若 state file 缺失、已被 stale restart 删除，或只记录一个 managed PID，stop 仍必须按当前 provider module path 查找同 checkout 的 detached `--temporal-worker-foreground` orphan 进程并清理；receipt 必须暴露 `orphan_stopped_pids`、`orphan_stop_incomplete_pids` 和 `orphan_stop_actions`。该规则仍只约束 OPL provider lifecycle，不修改 domain truth、不写 MAS paper/package/current_package、不授权 publication ready。
- 2026-05-25 追加：App/operator 默认 `next_safe_action` 必须把 provider SLO production-proof cadence 暴露成独立 `provider_slo_cadence_execution` safe-action route，并在需要 provider repair / fresh proof 时优先于 generic scheduler install/status/trigger/tick。Scheduler install 只负责 cadence substrate；provider SLO proof route 才是 repair/receipt action。两者都只作用于 OPL provider evidence，不执行 domain action、不写 domain truth、不授权 domain ready 或 production ready。
- 2026-05-25 追加：当 canonical provider lifecycle inspection 或 stage workbench 暴露 Temporal worker `worker_source_stale` 且 repair action 为 `restart_temporal_worker` 时，App/operator 默认 `next_safe_action` 必须优先选择独立 `provider_worker_restart` safe-action route，再重新运行 provider SLO proof 或 provider-backed Codex stage。该 route 只通过 `opl runtime action execute --action provider-worker:temporal:restart` 执行 OPL-managed Temporal worker stop/start。2026-05-26 追加：当 Temporal service 可达但 worker 未就绪、repair action 为 `start_temporal_worker` 时，App/operator 必须暴露独立 `provider_worker_start` safe-action route，并通过 `opl runtime action execute --action provider-worker:temporal:start` 执行 OPL-managed worker start；不新增公开 `family-runtime worker repair` CLI，不执行 domain action、不写 domain truth、不生成 owner receipt，也不得把 worker start/restart 或 provider completion 解释成 domain ready / production ready。
- 2026-05-26 追加：`provider_slo tick` 在执行 production proof 前可以自动执行唯一一种 OPL-owned worker lifecycle repair：Temporal service 已可达、worker lifecycle 为 `worker_not_ready`、repair action 为 `start_temporal_worker`。该自动动作必须调用既有 `startTemporalWorkerLifecycle`，记录 `temporal_provider_worker_repair_receipt`，并继续保持 false authority flags；不得自动 stop/restart stale worker、不得执行 domain action、不得写 MAS/MAG/RCA truth、不得生成 owner receipt 或 quality verdict。Temporal attempt query 也必须区分 connect/describe 失败和 describe 成功后的 workflow query 不可用；后者投影为 `temporal_stage_attempt_query_unavailable`，不能误报成 `temporal_service_unreachable`，避免 operator 把 worker/query problem 当成 Temporal service downtime。
- 2026-05-27 追加：Temporal scheduler cadence 的 tick workflow 必须有有界超时。`SchedulerTickWorkflow` 启动参数设置 `workflowRunTimeout` / `workflowExecutionTimeout`，短 activity 设置 `scheduleToCloseTimeout`，避免 worker 在 workflow task 或 scheduled activity 阶段消失后，schedule 因 `overlap=SKIP` 长时间保持 running action 并阻断后续 tick。该规则只释放 OPL scheduler/provider cadence，不终止 domain workflow、不重写 queue、不写 MAS/MAG/RCA truth、不授权 quality verdict、artifact gate、paper package 或 domain ready。
- 2026-05-26 追加：App/operator 默认 selected safe action 的 provider 恢复顺序固定为 provider worker start/restart、blocked transport redrive、domain owner handoff payload record。`blocked_transport_redrive` 是 OPL queue/attempt transport action，只能在 provider transport blocker 下重启同 source fingerprint 的 stage attempt；`domain_dispatch_evidence_receipt_record` 这类 MAS owner handoff payload route 只能记录 MAS-owned owner receipt / typed blocker / owner-chain / no-regression refs，不得被排在 worker repair 或 transport redrive 之前，也不得被 App/operator 直接执行成 MAS domain action。
- 2026-05-26 追加：上述默认顺序只修复 OPL operator attention 与恢复入口，不改变 owner split。OPL 可以修 worker readiness、provider liveness、queue redrive、attempt read-model 和 refs-only payload preflight；MAS 才能关闭 publication quality、AI reviewer verdict、artifact/package authority、owner receipt、publication gate 和 `current_package`。DM002 这类 loop 的 OPL 侧可用终态是新 provider attempt 被安全启动、transport blocker 被 redrive，或 MAS owner handoff refs 被正确记录；这些都不能写成论文进度完成。
- 2026-05-25 追加：`provider_slo_cadence_execution` route 只有在 provider proof due / repair required 时才是 App/default caller 的下一步；当 route-level `provider_slo_dispatch_status=cadence_current` 时，它只是 full detail / bridge provenance，不再占用默认 `next_safe_action`。这样 provider proof 当前时，默认 attention 会回到 domain-dispatch、App/live payload、owner-chain 或其他真实 open workorder；该规则不删除 provider route，不把 provider proof current 解释成 domain ready、owner receipt、production ready 或 family closeout。

## 2026-05-20

### 决策：MAS Hermes scheduler ensure path 退役为 cleanup-only

原因：OPL family runtime 已把 production cadence 固定到 Temporal-backed provider 与 OPL provider/runtime manager。MAS 继续创建、刷新、触发或恢复 Hermes cron tick，会形成第二 scheduler owner，并重新污染“domain repo 不持有 generic scheduler / daemon”的标准 OPL Agent 边界。

影响：

- MAS `runtime-ensure-supervision --manager hermes` 不再是公开入口；controller direct-call 只返回 retired tombstone。
- 显式 Hermes 只保留 `runtime-supervision-status --manager hermes` 与 `runtime-remove-supervision --manager hermes`，用于读取或移除旧 job/script/session/gateway evidence。
- MAS 不再写 Hermes tick script，不 create/edit/resume/run cron job，也不修复旧 watch-runtime service。
- 默认 scheduler/cadence owner 是 OPL provider/runtime manager；domain repo 只能输出 paper-progress SLO 语义、owner receipt、typed blocker、safe action refs、no-forbidden-write evidence 或 legacy cleanup/tombstone refs。
- 后续任何 domain agent 若需要周期性唤醒，只能通过 OPL provider scheduler、stage attempt、queue、SLO/projection 或 explicit cleanup diagnostic path 表达，不能在 domain 仓重新引入私有 daemon。

## 2026-05-19

### 决策：OPL 采用 AI-first、AI 原生专家判断优先、contract-light 作为长期智能体原则

原因：OPL 的目标是让高价值知识工作随着 `Codex CLI` 等 AI executor 的能力进步持续变强。如果把规划、创作、审稿、路线判断、修订和诊断策略写成越来越厚的脚本或合同，系统会把当前 AI 能力冻结成机械流程，也会让后续模型升级难以转化为真实智能体进步。更合适的边界是：OPL 用 stage、selected executor 和推荐显式声明的 AI strategy refs（prompt、skill、knowledge、rubric、quality gate refs）承载开放式智能工作；合同只承担边界、安全、权限、审计、receipt、阻塞、恢复、projection 和 fail-closed 这些下限。

当前 active narrative 进一步收敛为 `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 是最小合同核；Readiness 是 operator / App 默认聚合面；Derived Diagnostic Lenses 只解释 blocker、assumption、cohort、runtime budget、replay、failure localization 或 route-back evidence；Surface Budget 控制新增默认 surface 的升级门槛；AI Capability Aperture 保留开放式专家执行空间，让更强 executor、domain stage pack 和 reviewer 能力直接进入系统收益。外部框架或论文只允许贡献 boundary / evidence / audit / replay / route-back 这类治理词汇，不引入 runtime、planner、proof assistant、workflow compiler 或 domain verdict 角色。LangGraph 的 checkpoint / time-travel / replay，AutoGen 的 agent runtime 边界，以及 CrewAI 的 Crew / Flow 分层只作为成熟经验词汇进入 OPL 的 refs-only control plane；OPL 不引入 LangGraph、AutoGen、CrewAI、CrewAI Flow 或 AHE runtime dependency。

影响：

- `family-stage-control-plane`、action catalog、proof bundle、receipt、runtime event、projection 和 App/operator read model 只能固定 owner、输入输出 refs、权限、禁止写入、handoff、expected receipt、gate、blocker、audit 和 recovery 语义；不能把 stage 内的推理、写作、审查、路线探索或修订策略写成封闭流程引擎。
- AI-first 不等于无边界。涉及 artifact mutation、memory writeback、quality verdict、publication/fundability/visual/export verdict、credential/network/write policy 或 owner authority 的行为仍必须通过 explicit owner boundary、independent gate receipt、no-forbidden-write、human/owner gate 或 typed blocker 约束。
- AI 原生专家判断优先意味着 readiness、scorecard、checklist、schema 完整性、contract completeness、descriptor ready、provider proof 或 generated surface proof 只能作为 advisory、evidence gap 或 blocker localization；它们不能替代 AI reviewer/auditor、domain-owned quality gate、owner receipt、typed blocker 或 route-back verdict。
- Contract-light 不等于少证据。OPL 仍必须保留 attempt ledger、runtime event、receipt、source/artifact/workspace refs、proof bundle、SLO、replay/audit 和 recovery surface；轻的是智能行为本身，不是审计和安全边界。
- 后续优化优先投向 domain stage pack、prompt、skill、knowledge、rubric、quality gate refs、AI reviewer/auditor attempt 和 executor adapter 能力；这些 AI strategy refs 推荐显式声明，但不构成 OPL launch hard gate，质量 / 专家判断仍归独立 AI reviewer、domain-owned quality gate、owner receipt、typed blocker 或 route-back verdict。
- 该原则不改变 domain ownership：MAS/MAG/RCA 继续持有 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision 和 owner receipt；OPL 只托管、调度、投影和审计边界。
- 新增 surface 默认先进入 refs、warning、diagnostic lens、reference 或 history。只有满足 launch safety、authority boundary、evidence / replay / audit / route-back，或被 App / runtime 反复消费，才允许升级为 default surface；只有影响错误启动、越权或不可审计 / 不可恢复，才允许升级为 hard gate。该预算由 `contracts/opl-framework/surface-budget-policy.json` 作为机器政策冻结。
- 2026-05-22 追加：`contracts/opl-framework/public-surface-index.json` 中每个 active public surface 必须携带 `surface_budget` envelope，并由 `contracts/opl-framework/surface-budget-policy.json` 约束。该 envelope 显式声明 default surface 状态、允许理由、promotion evidence refs、consumer refs 和 authority false flags；默认 public surface 只能作为 App / operator navigation、framework discovery 或 authority-boundary attention entry，不能声明 domain ready、quality verdict、artifact authority、production ready，也不能替代 AI executor planning 或 domain owner。

本决策的 stage-led 合同读法同步为：Stage pack 是启动单位；AI-first 执行不被静态合同写死；默认 selected executor 是 `Codex CLI`，非默认 adapter 必须显式绑定；stage-level policy 可以声明 `executor_kind`、`model`、`reasoning_effort`、`provider`、`executor_binding_ref`、`executor_labels`、`required_capabilities` 与 `receipt_requirements`，但这些字段只约束启动、审计和回执边界，不替代 stage 内的专家判断；AI 原生专家判断优先于机械信号；AI strategy refs 推荐显式声明但不作为 OPL launch hard gate；`requires` / `ensures` 在启动前检查；Stage Kernel 只覆盖 identity、owner、refs、scope、composition、forbidden-authority、expected receipt、audit、replay 与 route-back 下限；AI、人、外部系统、artifact、memory 和 domain verdict 仍是 runtime / domain-owned 结果；hard blocker 只覆盖启动安全、越权、关键 runtime event、composition、hard human gate 或 executor binding；capacity / monitor / assumption / cohort-loop / replay / domain-owner review 只进入 readiness 的 advisory refs 或 diagnostic lens；descriptor / read model / generated / provider / cleanup proof 不能替代 production evidence，未闭合边界必须返回 typed blocker、human gate、receipt conflict 或 route-back ref。

## 2026-05-18

### 决策：One Person Lab App 的产品运行路径默认使用 OPL-managed environment，developer checkout 只能显式 override

原因：MAS/MAG/RCA 的 skill、MCP、product-entry 与 generated interface 已经由 OPL 统一发现和投影，但本机同时存在 OPL-managed modules、`~/.codex/skills`、Codex plugin cache 和 workspace developer checkout。若 App 普通用户路径直接依赖 developer checkout，workspace 的 dirty/ahead/实验分支会污染产品运行环境；若完全忽略 developer checkout，又会让开发调试无法验证下一版行为。因此必须把产品运行真相和开发 override 分开：App 默认使用 managed environment，开发仓只在显式 opt-in 时生效。

影响：

- One Person Lab App、`opl install`、`opl system initialize`、`opl modules`、`opl skill sync` 与 Codex-visible plugin/skill metadata 默认以 OPL-managed modules 为产品运行来源。
- App 启动维护可以自动检查 managed module 是否 behind、skill/plugin metadata 是否 stale、health check 是否通过，并在 checkout clean 且可 fast-forward 时自动更新、同步和刷新投影。
- managed checkout 处于 dirty、ahead、diverged、no upstream、health check failed 或需要 Codex App restart/reload 时，启动维护必须停止自动覆盖并展示人工处理状态。
- developer checkout 只通过显式开发模式、环境变量、workspace registry 或命令行 override 进入当前运行路径；App 必须显示当前使用的是 managed checkout 还是 developer checkout。
- 不得用 developer checkout 静默覆盖 managed runtime，不得把 Codex plugin cache 或 `~/.codex/skills` 当成第二真相源；它们只是 active managed source 的本地投影。
- managed module health check 必须调用目标 module 的真实验证入口。OPL Meta Agent 的 repo-owned contract 是 `scripts/verify.sh smoke|typecheck|full`，因此 OPL 对 `oplmetaagent` 使用 `smoke` lane；OPL 不要求 OMA 添加 `fast` 兼容 alias，也不把 OPL 自身 lane vocabulary 强加给目标仓。
- `opl family-runtime intake|tick --hydrate` 使用 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE` 时，也必须先通过 OPL module locator 解析 active MAS module checkout，再以 `uv run --directory <checkout> --extra analysis medautosci sidecar export ...` 调用 domain sidecar；不得裸调用 PATH 上的旧 `medautosci` 工具。DM002 这类 live paper hydrate 的完成证据是 OPL queue/stage-attempt evidence 加 MAS owner receipt 或 typed blocker，不是 MAS 内部 runtime liveness/resume 投影。
- 该决策不改变 domain truth、quality verdict、artifact authority 或 direct app skill path 的 owner。MAS/MAG/RCA 继续持有领域权威；OPL/App 只管理安装、发现、同步、投影、health 和可见维护状态。

### 决策：OPL Developer Mode 由系统配置、App 设置开关和 Agent Lab 巡检/修复路由共同承接

原因：OPL 同时服务普通用户和开发者。普通用户路径需要稳定的 managed environment；开发者路径需要在智能体调用过程中把发现的 framework / domain repo 问题直接转成可审计的修复、提交或 PR。若只靠 developer checkout override，容易把产品运行真相和开发修复权限混在一起；若只靠观察告警，又会让已经具备 repo 权限的维护者无法把问题闭环。因此需要把 Developer Mode 定义成独立系统配置和 App 设置面，并把外围 AI 巡检、问题归因、owner route、repo fix / PR route 放到 OPL Agent Lab 优先承接。

影响：

- 产品名是 `OPL Developer Mode`；当前机器面可以沿用 `developer_supervisor` 配置与 `opl system developer-supervisor` action。配置属于 OPL state，不属于某个开发 checkout。
- One Person Lab App 设置页必须有 Developer Mode 开关，并显示当前状态、配置来源、GitHub login、模式和当前可用的 repo authority。安装流程检测到配置的 developer login（默认 `gaofeng21cn`）时可以默认开启；其他用户可以手动开启。
- Developer Mode 至少区分只观察的外围巡检模式和 `developer_apply_safe` 模式。前者只产生 evidence / issue / PR proposal；后者在权限满足时允许进入 repo 层修复、提交和 owner-visible 审计路径。
- repo developer / collaborator 身份必须按目标 repo 判断。具备直接写权限时，可以在对应 repo 的受控 worktree / branch 中修复并提交；不具备直接写权限时，只能创建 fork / branch / pull request，不得静默推送到 upstream。
- Developer Mode 开启后，任务可以默认启动外围 AI 巡检。巡检由 Agent Lab 或同等 refs-only control plane 组织，输出 blocker、owner route、candidate fix、evidence refs 和 PR refs；它不拥有 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority。
- Developer Mode 不改变 managed environment 优先原则。普通用户运行仍以 OPL-managed modules / skills / plugin metadata / provider state 为真相；开发修复只通过显式配置、显式身份和可审计 repo route 生效。

## 2026-05-17

### 决策：吸收 academic-research-skills 的完整性 / 引用支撑 / checkpoint 模式为 OPL-owned stage integrity metadata primitive

原因：`Imbad0202/academic-research-skills` 里值得吸收的不是论文运行时或领域判断，而是把开放式学术工作拆成阶段，并在阶段边界显式记录 integrity check、citation / claim support、evidence handoff、data access 和 human checkpoint 的模式。OPL 需要这类通用 metadata 来增强 stage packet、App/operator drilldown 和 fail-closed routing；但医学论文真相、基金可行性、视觉质量、artifact 权威和 direct app skill path 必须继续归 MAS/MAG/RCA 等 domain agent。

影响：

- `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` 成为 active family orchestration companion contract。
- `family-product-entry-manifest-v2` 可以通过 `family_stage_integrity_metadata` 暴露可发现的 stage integrity metadata projection。
- OPL 只持有 schema、discovery、transport、projection、human checkpoint route 和 fail-closed metadata vocabulary。
- MAS/MAG/RCA 只发布 domain projection / thin adapter；底层 evidence ledger、audit body、owner receipt、quality verdict、publication / fundability / visual authority、artifact authority 与 direct skill path 继续归 domain。
- 该吸收不引入 `academic-research-skills` runtime dependency，不重写 domain stage，不授权 OPL 生成 domain-ready、publication-ready、fundability-ready、visual-ready 或 artifact-ready verdict。

## 2026-05-16

### 决策：generic workspace / source / artifact / memory substrate 由 OPL 持有 locator / index / lifecycle / projection，domain agent 持有 truth / body / verdict / authority

原因：MAS/MAG/RCA 都需要把真实运行 workspace、source refs、artifact refs 和 memory refs 暴露给 OPL App、CLI 与 runtime manager，但这些 refs 背后的正文、交付物内容、记忆内容、质量判断和 owner receipt authority 不能迁入 OPL。把这一层落成独立 machine-readable contract 和 CLI projection，可以让 OPL Framework 成为可运行的 generic substrate surface，同时避免制造第二 domain truth。

影响：

- `contracts/opl-framework/generic-substrate-projection-contract.json` 成为活跃 framework contract，定义 OPL 只持有 locator index、ref transport、lifecycle projection 和 operator projection。
- `opl substrate projections` / `opl substrate projection --domain <domain>` 输出 OPL-owned substrate projection JSON，读取 domain manifest 中的 `workspace_locator`、`source_provenance`、`artifact_inventory`、`domain_memory_descriptor` refs，以及 MAS/MAG/RCA sidecar export 中的 `opl_substrate_adapter` opaque refs。
- `opl substrate workbench` 是 App/operator-facing 聚合面，按 domain、projection status、sidecar status 和 workspace/source/artifact/memory ref family 分组现有 projection，并提供 drilldown inspect command。
- projection 只携带 workspace/source/artifact/memory refs、status、summary、inspect paths、lifecycle role 和 authority boundary；不读取 memory body、source truth body 或 artifact body。
- OPL 明确禁止写 domain truth、接受或拒绝 memory writeback、应用 memory body、修改 artifact body、持有 artifact authority 或下 quality / publication / fundability / visual verdict。
- domain agent 继续持有 workspace truth、source body、artifact body、artifact authority、memory body、memory writeback accept/reject、domain truth 与质量裁决。
- 当前 surface 已覆盖 MAS-like payload 的 workspace root、source refs、artifact refs、memory refs 和 authority boundary；剩余 production gap 是真实长时 domain owner chain、真实 memory writeback apply/body migration、artifact mutation receipt scaleout 和 App drilldown 的持续 soak。

## 2026-05-15

### 决策：One Person Lab App 采用 clean 产品仓，AionUI shell 独立保留为 `opl-aion-shell`

原因：OPL Framework 已经形成完整的 stage-led 智能体开发与运行框架边界；继续把 App 打包、页面状态、截图教程、Electron 更新、AionUI upstream intake 和 framework runtime/contracts 混在同一层，会让维护者难以判断 owner，也会把当前 GUI 基座误读成 OPL 顶层身份。更清晰的维护形态是：`one-person-lab` 保持 Framework repo，`opl-aion-shell` 保留 AionUI 历史与 upstream-following shell overlay，`one-person-lab-app` 成为 clean App 产品仓并通过外部 `shells/aionui` checkout 消费 shell。

影响：

- 不再采用“把 history-rich `opl-aion-shell` 直接改名为 `one-person-lab-app`”作为最终路径；该路径会把 AionUI contributors 带入 App repo，且后续 upstream intake 会持续污染 App contributor 图。
- `one-person-lab` 继续持有 OPL Framework：CLI、runtime、Temporal provider、contracts、module/skill sync、domain discovery、runtime snapshot 和 framework-level verification。
- `opl-aion-shell` 继续持有 AionUI shell 源码、contributors、upstream remote、shell-local build/test/packaging 和 OPL overlay 退役审计。
- App 产品文档、打包、更新、Full first-install 包、页面状态测试、首启测试、截图和用户教程迁入 App repo。
- AionUI 不进入 App repo 默认分支历史；App repo 的 `shells/aionui` 是外部 checkout / symlink / CI checkout，来源为 `gaofeng21cn/opl-aion-shell`。
- AionUI 2.0 或其他 GUI 基座可在 `shells/aionui-next/` / `shells/<candidate>/` 并行适配；验证通过后再切换 App 顶层 active shell contract。
- App 仍然只消费 OPL CLI / machine-readable surfaces 和 domain-owned projection refs，不复制 runtime/provider/domain truth，也不成为 quality verdict 或 artifact authority。
- App repo 是标准 DMG、Full DMG、updater metadata、GitHub Release、GUI smoke 和用户教程的唯一 owner；Framework repo 只保留 App release discovery/consumer surface 和 Full DMG payload source。

## 2026-05-12

### 决策：产品认知固定为 OPL Framework、One Person Lab App 与 Foundry Agents 三层

原因：OPL 已经从入口聚合和工作台投影演进为完整的 stage-led 智能体框架。如果继续把框架开发、运行托管、普通用户 App 和 MAS/MAG/RCA 这类领域产品都用同一个不分层的 `OPL` 叙事表达，开发者用户和纯使用者都会难以判断自己应该进入哪一层。更清晰的产品结构是：OPL Framework 负责开发与运行框架；One Person Lab App 负责普通用户使用体验；Foundry Agents 负责医学研究、基金、汇报等领域交付。

影响：

- `OPL Framework` 成为开发者与技术操作者面向的主语：CLI、stage control、activation、typed family queue、provider-backed runtime、contracts、模块发现、skill sync、恢复、审计和 shared projection 都属于这一层。
- `One Person Lab App` 成为普通用户面向的主语：它消费 OPL Framework 和已安装 Foundry Agents，把通用工作、医学研究、基金写作、汇报/PPT 等工作呈现成桌面工作台；它不持有 domain truth，不复制 runtime/provider 实现。
- `Foundry Agents` 成为 MAS/MAG/RCA 和后续 Patent/Award/Thesis/Review 的产品线主语：这些 agent 基于 OPL Framework 开发，可被 App 托管运行，也保留 direct Codex/app-skill 入口；领域判断、质量 verdict、artifact/package/submission/publication authority 继续归对应 domain 仓。OPL Meta Agent 是 Agent Foundry 的 managed builder/tester module，用于创建、测试和改进 OPL-compatible agents，不成为 MAS/MAG/RCA 之外的新 domain truth owner。
- 开发和运行保持集成在 OPL Framework 内；当前不拆 repo，也不把每个 domain agent 改成内嵌一份 OPL runtime。
- agent 的推荐发布形态是 OPL-compatible package / repo：声明 framework/version/contract 要求、stage descriptor、skill、quality gate、artifact locator、projection 和 authority refs，由 OPL Framework 安装、发现、托管、唤醒和投影。
- Full 首次安装包可以把 App、OPL Framework、OPL Meta Agent、MAS/MAG/RCA、provider payload、`officecli` 与推荐 skills 打在一起；这只是分发形态，不改变 single framework runtime truth，也不改变 MAS/MAG/RCA 的领域权威。
- 后续 README、project/status/architecture、contracts 说明、App 文案和 onboarding 文档应优先使用这组三层主语，避免把 App 写成 Framework 本体，或把 Foundry Agents 写成 OPL 内部模块。

## 2026-05-10

### 决策：Temporal 成为 OPL production online family runtime 的必需 substrate，已退役 Hermes-first 口径退出目标在线底座

原因：OPL 当前目标已经从“找一个长期在线会话宿主”收敛为“以 domain stage 为语义单元、以 Agent executor 为最小执行单位的 durable family agent framework”。这类框架需要的是可恢复 stage attempt、activity retry/timeout、human gate signal、status query、workflow history、idempotent dispatch、dead-letter 和 operator projection。Temporal 的 Workflow / Activity / Signal / Query / History 模型正好对应 OPL production online runtime 的可靠性底座；它应像 Codex CLI 一样被安装、检测、修复和持续维护。Hermes 不再承担目标长期 session/wakeup substrate，也不保留 active family runtime provider、provider proof surface、Gateway bridge 或默认 executor surface 语义；`hermes_agent` 仍可作为显式非默认 executor adapter/backend，与 `claude_code`、`antigravity_cli` 一样只承诺连接、生命周期、回执、审计和 fail-closed 边界，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。

2026-05-21 追加口径：标准 OPL Agent 的默认长跑路径固定为 `opl_temporal_hosted_autonomous`。MAS/MAG/RCA 这类 domain agent 不应内置通用 daemon、scheduler 或 attempt loop；任务启动后默认由 OPL/Temporal provider 管理 stage attempt、typed queue、wakeup、resume/re-query、retry/dead-letter、attempt ledger 和 operator projection。Codex App 只作为启动、观察、介入和展示入口，不作为外围持续驱动任务的主体。该默认 runtime path 不改变领域权威：domain truth、quality/export verdict、artifact authority、memory body accept/reject、owner receipt 和 typed blocker 继续归对应 domain agent。

影响：

- `OPL Runtime Manager` 的目标表述从 Hermes-first 改为 Temporal-backed production family runtime；active provider 枚举冻结为 `local_sqlite | temporal`，其中 `temporal` 是 production required provider，`local_sqlite` 是 dev/CI/offline diagnostic baseline。`hermes_legacy` 不再是 provider kind；若环境或旧 fixture 仍选择它，必须 fail-closed。
- Temporal provider 的语义映射固定为：Workflow = `stage_attempt`，Activity = selected Agent executor stage execution / domain sidecar dispatch，Signal = human gate / user modification intake / resume，Query = App/CLI progress projection，History = durable replay/audit。
- `Codex CLI` 是当前第一公民 concrete executor；Temporal 只负责 durable orchestration substrate，不生成 domain idea，不判断 publication/fundability/visual quality。
- 当前必须分开两层：`hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 显式非默认 executor adapter/backend；旧 Hermes online runtime / provider / Gateway / readiness / compat 面只作为历史 provenance、参考材料、诊断语料或负向 guard。Full readiness 不再要求 Hermes 作为目标 session/wakeup substrate，也不提供 Hermes 安装 / 更新 / provider compatibility action surface；Temporal service / worker / readiness proof 是生产在线依赖。任何非默认 executor receipt gate 都不得恢复旧 Hermes/Gateway 兼容接口或默认路径。`antigravity_cli` 仅用于类似 `RCA` HTML route 选择 `Gemini flash/high` 的 stage-level explicit adapter 示例，不成为默认执行器，也不声明质量、工具语义或 resume 等价。
- `MAS`、`MAG`、`RCA` 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority；OPL 只持有 provider abstraction、stage attempt ledger、queue、human gate transport、retry/dead-letter、observability 和 projection。
- 2026-05-08 的 Hermes-first 决策保留为历史与迁移背景，但被本决策 supersede；后续新增投入默认服务 Temporal-backed production runtime lane。

### 决策：OPL 定位为完整 stage-led family agent runtime framework，Codex CLI 是当前第一公民 executor

原因：`MAS`、`MAG`、`RCA` 的共同需求不是让 OPL 变成一个领域大脑，而是需要长期自治、状态恢复、唤醒、队列、human gate、trace、projection 和跨域可见性这类 agent framework 能力。与以 LLM 调用或 agent node 为原子单位的通用框架不同，OPL family 的执行原子是 Agent executor，当前第一公民 executor 是 `Codex CLI`，更合理的语义单元是 domain stage：一个 stage 冻结目标、输入、skill/prompt、评价方法、handoff、receipt 和 authority boundary，stage 内部让被选中的 executor 与 domain skill 自主完成专家工作。

这次定位同时明确：OPL 不是只做入口聚合、工作台投影或共享合同目录，而是完整的智能体运行框架。active provider 只允许 Temporal production substrate 与 local dev/CI/offline baseline；阶段生命周期、队列、attempt ledger、human gate、恢复、投影、artifact/file lifecycle 和 operator visibility 的 framework 边界归 OPL；provider 只承担可替换的运行 substrate。OPL 的产品目标是让医学研究、基金写作、视觉交付和后续高价值知识工作尽可能自动推进到可审计交付。

影响：

- `OPL` 的当前身份统一写成完整 stage-led family agent runtime framework，而不是 MAS/MAG/RCA 的领域模块集合、入口聚合层或单纯 runtime support layer。
- `OPL` 持有 activation、typed family queue、durable runtime/session support、wakeup/retry/dead-letter、approval transport、stage descriptor、handoff envelope、receipt、projection、trace 和 parity helper。
- `MAS`、`MAG`、`RCA` 持有各自 stage semantics、prompt/skill、quality gate、truth reducer、artifact/package authority、publication / submission / deliverable verdict。
- 直接 Codex App skill 调用保持一等入口；OPL 可以托管和唤醒 domain agent，但不要求所有调用都先经过 OPL。
- 大型任务默认按接近人类专家实施的 stage 推进；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor。
- 涉及知识交付、专家判断或正式交付质量的复杂步骤必须建模为独立 stage，例如 MAS 的 AI 审稿、publication quality review、RCA 的 visual review、MAG 的 fundability / proposal review；不得把这类工作塞进另一个 stage 的普通函数、helper 或后处理逻辑里。
- AI-first quality gate 必须由独立的审核 stage attempt / 智能体任务完成。执行 attempt 和审核 attempt 需要有独立上下文、输入 refs、closeout / gate receipt 与 owner；不能把同一个 `Codex CLI` 任务写成“先执行、再自审、再放行”。
- 后续流程优化优先改 domain stage pack、prompt、skill、quality gate 和 framework descriptor；不得把领域判断重新写回 OPL 机械脚本。

### 决策：将 MAS stage 控制面经验提升为 OPL family 设计方向

原因：`MAS` 的论文生产、`RCA` 的视觉交付和 `MAG` 的基金写作都属于开放专家工作流。把这些流程写成大段硬编码脚本会限制 Agent executor 的自主拆解、创作、审核和修订能力，也会让程序承担不该承担的领域质量判断。更稳妥的 family 原则是用 `stage` 描述专家工作阶段：每个 stage 冻结目标、输入输出、skill、prompt、评价方法、handoff、receipt 与 authority boundary；stage 内部的执行由被选中的 Agent executor 和 domain-owned AI workflow 自主推进。

影响：

- `OPL` 可以上收 family-level stage descriptor vocabulary、skill / prompt / evaluation refs、stage lifecycle receipts、handoff envelope、product-entry projection 与 parity helper。
- `family-action-graph` 继续承载 stage / action topology，`family-action-catalog` 继续承载可调用 action metadata；新增的 machine-readable surface 只允许是窄的 `family-stage-control-plane` companion，不新建重流程 runtime。
- `MAS` 作为深 adapter 候选，必须先盘点现有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等 route contract，以及 controller / runtime / quality / delivery / read-model surface；OPL 文档里的 study intake、evidence preparation、analysis / argument、manuscript authoring 与 publication gate 只作为 family 抽象维度，不替换 MAS 实际 stage 名称、数量或 route id。
- `RCA` 作为轻 adapter 优先候选，把 source intake、communication strategy、visual direction、artifact creation、review / revision 与 package / handoff 映射成 stage，但视觉质量 verdict、deliverable authority 与最终审美判断仍归 RCA。
- `MAG` 把 call intake、fundability strategy、specific aims、proposal authoring、review / rebuttal 与 package gate 映射成 grant stage pack，但 fundability verdict、评审结论与提交可行性仍归 MAG。
- `OPL` 的角色保持 discovery、index、projection、parity 与 typed queue dispatch；不得把 stage 控制面写成替代 Agent executor 或 domain quality gate 的固定脚本引擎。
- `authority function` 只能承担最小领域裁决、receipt 签发、typed blocker 或 safe action refs，不得承载完整的 AI 审稿、质量评估、修订建议生成或其他跨输入/产物/证据的复杂知识交付流程；这类流程必须是可观察、可恢复、可单独审核的 stage。
- Stage progression 的 quality gate 默认 fail-closed：缺少独立 reviewer / gate receipt、gate evidence stale、审核与执行来自同一 attempt 或同一污染上下文时，不能进入下一 stage。
- 当前落地面是参考计划 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.md)、最小 `family-stage-control-plane` schema、manifest normalizer / parity helper 与只读 `opl stages list|inspect`；它不是 workflow runtime。MAS 第一阶段是 inventory 和映射，不是 stage 重构。

## 2026-05-08

### 历史决策：Hermes 恢复为 OPL family 默认在线 substrate

状态：已被 2026-05-10 的 Temporal-backed provider 决策 supersede。保留本段只作为已退役 Hermes-first 回滚背景和迁移期实现口径，不作为当前默认 topology、安装纪律或 readiness 目标。

原因：最新核实显示，过去的问题不在于 Hermes 没有价值，而在于 OPL/MAS 只把它用成了 `every 5m` cron carrier。真正需要的是 24h 在线产品能力：常驻 gateway、cron/webhook wakeup、session store、delivery/notification、approval transport、memory/profile isolation。这个能力应由上游 `Hermes-Agent` 承担，`OPL` 在其上持有 typed family queue、跨仓 dispatch/control plane、Runtime Manager 和 Full App 包装；`MAS`、`MAG`、`RCA` 继续持有 domain truth、质量判断和 artifact/package/publication gate。

影响：

- 历史上 `opl install` 曾计划默认安装/复用 `Codex CLI`、Hermes online runtime、默认 domain modules、推荐 skills、`officecli` CLI 与 GUI；当前目标口径已改为 Temporal-backed family runtime，Temporal 是生产必需 substrate；Hermes online runtime / Gateway 只保留为历史 provenance、参考材料、诊断语料或负向 guard，`hermes_agent` executor adapter 仍是显式非默认 backend。
- 历史上 `Hermes-Agent` 曾被写成 Full OPL family readiness 的 required online substrate；当前 Full OPL readiness 应按已配置 family runtime provider ready 判断，不能再把 Hermes 写成目标必需项。
- `Codex CLI` 仍是默认且第一公民的具体执行器；Hermes online substrate 不自动替换 domain-selected executor，也不成为 MAS/MAG/RCA truth owner。
- `antigravity_cli` 若出现在历史或实验配置中，只能按 explicit non-default stage adapter 读取；缺少 `executor_binding_ref`、experimental/non-default label、required capabilities 或 receipt requirements 时不能启动。
- 历史计划新增过 `opl family-runtime` typed queue / bridge：队列位于 `${OPL_STATE_DIR}/family-runtime/queue.sqlite`，并曾让 Hermes cron/webhook 唤醒 OPL tick；当前唤醒/托管路径不再保留 Hermes cron/webhook 兼容接口。
- 历史计划中 `opl family-runtime intake` 与 `opl family-runtime tick --hydrate` 会先读取 domain sidecar export 的 `pending_family_tasks[]`，按 dedupe key 入队，再在同一 tick 中派发已入队任务；该 hydrate 语义已保留，Hermes cron 注册脚本语义已退役。
- 历史计划中 Full 首次安装包曾要求携带 Hermes payload、profile seed、CLI shim、LaunchAgent install/repair scripts、版本 manifest 与 checksum；当前 Full 包应携带已配置 family runtime provider 所需 payload，Temporal provider 落地后由 provider manifest/checksum 表达 readiness。
- 历史计划中 `opl system initialize` 和 App 首启曾显示 Core ready、Domain modules ready、Hermes online runtime ready 三层状态；当前应显示 Core、Domain modules、family runtime provider readiness，不能把 Hermes 写成目标默认层。
- 历史上“Hybrid optional Hermes provider adapter”的文档口径只保留为 archive/decision history，不再作为当前安装、provider fallback 或 readiness 行为。

### 历史决策：Hermes 从默认安装依赖降为显式 hosted/runtime adapter

状态：先被 2026-05-08 已退役 Hermes-first online substrate 决策取代，又被 2026-05-10 Temporal-backed provider 决策 supersede。保留本段用于解释 2026-05-08 早期误判和回滚背景，不作为当前实现口径。

原因：当时 `OPL` 的默认运行时、会话语义和 domain readiness 被临时收敛到 `Codex-default + MAS/MAG/RCA domain entries`。继续把 Hermes 写进 `opl install` 默认路径、首启 baseline 或 mandatory runtime substrate，会把尚未完整接入的 hosted/online-management 能力误读成 OPL 默认依赖。

历史影响：

- `opl install` 一度默认只安装/复用 `Codex CLI`、默认 domain modules、推荐 skills、`officecli` CLI 与 GUI。
- 旧 hosted/runtime/provider adapter 口径一度被保留；该口径已经进入历史，不作为当前兼容接口。
- `hermes_agent` executor adapter/backend 另按 canonical 显式非默认接口处理。
- `opl system initialize`、App 首启与 README 一度把 Hermes 缺失视为非阻塞 online-management 状态。
- Full 首次安装包一度不携带 Hermes adapter payload。

### 决策：引入 Family Action Catalog 作为 action metadata 单一声明面

原因：`MAS`、`MAG`、`RCA` 已经分别暴露 CLI、MCP、Skill、product-entry 等多种调用面。如果每个 surface 单独维护 action metadata，命令、schema、effect、human gate 与 authority boundary 容易漂移。`Ageniti` 值得学习的是“单一 app action 定义派生多种 tool surface”的思路；但它当前不应成为 OPL family runtime dependency。

影响：

- `contracts/family-orchestration/` 新增 `family-action-catalog.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_action_catalog`。
- `family-action-graph` 继续描述流程拓扑与 gate；`family-action-catalog` 专门描述可调用 action metadata 与 surface projection。
- `OPL` 增加 TS helper、Python mirror、manifest normalizer、parity helper，以及只读 `opl actions list|inspect|export` discovery/export 命令。
- `OPL` 不执行 domain actions，不生成 handler，不持有 domain runtime truth；actual execution 仍走 MAS/MAG/RCA 各自已有 CLI、MCP、Skill 或 product-entry handler。
- `MAS` 作为完整参考 adapter，`RCA` 作为 TypeScript 参考 adapter，`MAG` 作为轻 adapter；`MAG` 第一轮只声明 MCP-compatible descriptor，不宣传 public MCP server 已落地。
- 本决策不引入 `@ageniti/core` 或其他 Ageniti runtime package。

### 决策：引入 Family Runtime Supervision 作为只读 wakeup / supervision projection

原因：`MAS`、`MAG`、`RCA` 都需要把长期任务的 supervision freshness、repair hint 与 domain-owned source refs 投影给 OPL family 工作台，但这些信息不能被误读成 OPL 拥有 scheduler、daemon、session、memory、quality 或 artifact authority。

影响：

- `contracts/family-orchestration/` 新增 `family-runtime-supervision.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_runtime_supervision` discovery surface。
- 该 surface 覆盖 `adapter_id`、cadence、`last_success` / `last_tick`、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 read-only authority boundary。
- `runtime-task-companions` 增加 TS builder，供 domain repos 投影同一 shared supervision surface。
- `OPL` 只做 discovery、export、parity 与 read-only projection；repair command 与 safe reconcile hint 只把操作者路由回 domain-owned repair / supervision surface。
- 本决策不引入 OPL daemon，不让 OPL 成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。

### 决策：OPL 接管 family-level scheduler replacement owner

原因：MAS/MAG/RCA 的目标形态已经收窄为 domain authority pack + thin program surface，通用 scheduler lifecycle、supervision cadence、provider SLO、queue intake、attempt ledger、job/latest-run projection 和 runtime-manager repair projection 应由 OPL Framework 承载。MAS 本机 LaunchAgent / 300 秒 tick 可以作为迁移期 diagnostic / cleanup path，但不能继续作为 Foundry Agent 的默认运行外围。

影响：

- `contracts/opl-framework/runtime-manager-contract.json` 与 `opl runtime manager` 暴露 `family_scheduler_replacement`，默认 owner 是 `opl_provider_runtime_manager`，默认 adapter 是 `opl_family_runtime_provider`。
- OPL replacement 允许 provider SLO tick、domain registration intake、family runtime tick 和 runtime manager projection；禁止写 domain truth、安装 domain daemon、写 domain memory body、下 quality/export verdict 或直接执行 domain repair。
- MAS 是 P0 migration consumer：默认 status/ensure/remove/bootstrap 应委托 OPL replacement；MAS 只保留 paper-progress SLO 语义、owner receipt、typed blocker、safe action refs 和显式 local legacy diagnostic / cleanup path。
- MAG/RCA 是 consumer projection：可以引用 OPL `family_scheduler_replacement`、返回 owner receipt / typed blocker / no-regression evidence refs，但不能新增 repo-owned generic scheduler 或 daemon。
- 后续验收顺序是 focused replacement proof、domain active caller migration、no-active-caller proof、legacy physical retirement，再进入 cross-repo integration、provider SLO 和 live soak。

### 决策：MAS monolith / MDS 默认依赖退役上升为 family companion-retirement 原则

原因：MAS 已完成 no-history physical absorb 与 monolith closeout，外部 `med-deepscientist` checkout 不再是 MAS 默认 study/status/progress/cockpit operation 的运行必需依赖。这一经验值得上升到 OPL family 层，但上收对象是通用 companion lifecycle 原则，不是 MAS 的医学论文 truth 或研究执行细节。

影响：

- admitted domain 可以吸收外部 companion 的可保留能力，但吸收后默认只暴露 domain-owned capability surface。
- 被降级的外部 companion 只能作为显式 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle 引用出现，不得回到 OPL 默认安装依赖、顶层 domain agent 或独立 OPL-managed module。
- 未来类似 no-history absorb 必须记录 source ref/hash、snapshot checksum、license refs、capability classification、domain owner、authority boundary、parity proof 和 contributor audit。
- `OPL` 只消费 domain-owned projections 与可发现 refs；不接管 domain runtime、scheduler、memory store、quality verdict、publication gate 或 artifact authority。

### 决策：MAS 验证过的 persistence / lifecycle / owner-route 原则上升为 family control-plane contract

原因：MAS 近期把 runtime 小文件压力收敛到 SQLite sidecar index，并把持久化层、记忆层、论文真相与 lifecycle cleanup 分开管理。这一类经验值得在 `OPL` family 层复用，但可上收的只有共享控制面：持久化角色、lifecycle receipt、owner-route 与 discovery refs。医学论文质量、publication readiness、AI reviewer、paper package 与 current package authority 仍属于 MAS domain truth。

影响：

- `contracts/family-orchestration/` 新增 `family-persistence-policy`、`family-lifecycle-ledger` 与 `family-owner-route` 三个 machine-readable schema。
- `family-product-entry-manifest-v2` 只增加 `persistence_policy`、`lifecycle_ledger`、`owner_route` 三个 optional discovery refs，不强制 domain runtime 改形。
- TS helper 与 Python mirror 提供对称 builder / validation surface，供 admitted domains 暴露 adapter，不复制 domain runtime。
- `MAS` 作为完整参考 adapter，映射 SQLite sidecar、lifecycle ledger 与 owner-route；`MAG` 第一轮只在既有 runtime-control / session-continuity / grant-progress / artifact_inventory 上做轻 adapter；`RCA` 第一轮把 managed-runs、product-entry sessions、review/publication projections 映射到 shared refs，并继续把 SQLite 标记为 deferred。
- `OPL` 继续只是 shared contracts / helpers / indexes owner；它不成为 domain runtime、scheduler、memory store、quality verdict owner 或 artifact authority。

## 2026-05-04

### 决策：MAS v2 以独立 domain agent 和单一 app skill 对接 OPL

原因：`MAS` 的 v2 alignment 需要同时保持两件事：医学科研 domain agent 继续独立演进，OPL 又能以统一定义、shared contract/index 与 projection 消费方式把它纳入同一工作台。把 MAS 写成 OPL runtime kernel 的一部分、恢复 MAS standalone release 通道，或把 OPL projection 写成 MAS ready / publication verdict，都会制造第二真相源。

影响：

- `MAS` 继续作为独立医学科研 `domain agent`；`MAG`、`RCA` 的独立 domain-agent 表述不受影响。
- `MAS` 对 `Codex` / `OPL` 暴露一个 MAS domain app skill；OPL 负责发现、同步和消费该 skill，不新增 OPL-only MAS skill family。
- `OPL` 持有 unified definitions、shared module/contract/index registration、module discovery 与 projection consumption surface；医学科研 runtime、controller truth、quality authority、publication gates 与 deliverable truth 继续由 `MAS` 持有。
- `MDS` 不再作为 OPL 默认安装的 MAS 运行依赖；MAS 只可把它显式声明为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion。
- 公开文档与技术入口不得恢复 MAS 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 仍按 OPL Packages/GHCR-backed module 坐标与 git checkout / sibling repo 更新路径表达，MDS 只保留 MAS-declared optional companion 引用。
- OPL 对 MAS progress、publication、quality、runtime control、`mas_opl_runtime_workbench_projection` 等 projection 只做证据、provenance、状态、App drilldown 和路由/transport metadata 展示；不得把 projection 文案写成 OPL 持有的 ready verdict、submission-ready verdict、publication verdict、质量裁决、runtime authority 或 artifact authority。
- 本决策不修改 `contracts/` 与 projection contract；它只同步公开文档和核心 docs 的 MAS v2 wording。

## 2026-05-02

### 历史决策：首启 readiness 拆分为 core/domain 可用与 Hermes online-management 渐进就绪

状态：先被 2026-05-08 的 Hermes-first online substrate 决策取代，又被 2026-05-10 的 Temporal-backed production runtime 决策 supersede。当前 Full OPL readiness 要求 Temporal-backed family runtime provider ready；本段只保留迁移背景。

原因：当时新用户首屏优先目标是尽快进入 `OPL` 的核心工作与已准入 domain 工作；迁移期曾把 Hermes online-management gateway 视为渐进就绪项，但 gateway system service 的加载状态不应被写成底层 runtime 未就绪式首屏 blocker。当前该口径已被 Temporal-backed family runtime provider 取代；`hermes_agent` 属于当前 canonical executor backend set，并且只能作为显式非默认 executor adapter/backend 使用。

影响：

- 历史上 `opl install` 不再默认安装 Hermes，但仍允许显式 Hermes provider adapter 安装或复用；该口径现已 superseded，不作为当前安装行为。
- Hermes online-management gateway 是由 Hermes installer/gateway command 管理的系统服务；OPL 负责触发安装/启动、检查 readiness 并报告状态，不接管 gateway service lifecycle 实现。
- `opl system initialize`、App 首启与公开 README 文案必须区分 core/domain readiness 与 online-management readiness。
- 当 Codex CLI 与已准入 domain modules ready 时，首屏可以进入通用工作、医学研究、基金写作或汇报/PPT 工作；Hermes gateway 未 loaded 只展示为 online-management pending / starting / needs attention。
- 只有 Codex CLI 不可用、当前命中版本不兼容、必需 domain 模块无法安装/检测，或其他核心依赖无法自动修复时，才写成首屏 blocker。

## 2026-04-27

### 决策：App 更新按 OPL 日期版本判断，GUI 基线版本只作为内部兼容信息

原因：用户下载和检查更新时看到的是 One Person Lab 版本，而不是 AionUI upstream package 版本。GUI 继续跟随 AionUI 大版本演进，但自动更新、Release tag、安装包文件名和环境管理里的最新版本判断都应使用 OPL 日期版本。

影响：

- App repo release wrapper 调用 `opl-aion-shell` 打包时，把 Electron updater 元数据写成 `OPL_RELEASE_VERSION`
- App 关于页继续单独展示 OPL 版本与 GUI 基线版本
- GUI package.json 的 upstream/AionUI 基线版本不再决定 One Person Lab 自动更新顺序

### 决策：Packages 作为机器消费通道，Releases 继续作为用户下载通道

原因：桌面 App、Docker WebUI、native helper 和 domain modules 的更新节奏不同。把所有东西塞进 App release 会拖慢发布和回滚；只用 git repo 又缺少固定版本、校验和与机器可读更新面。

影响：

- `opl packages manifest` 成为 Packages 坐标的机器可读入口和后续分发目标
- 当前 `opl install`、App 首启协调和环境管理仍以 git checkout 更新到远端最新为正式路径；Packages/GHCR 接入模块安装更新前不得写成当前机制
- 中央 release manifest / Packages workflow 可以继续维护为机器分发雏形，但各 domain repo 不需要单独恢复用户安装型 GitHub Release
- WebUI Docker 镜像通过 GHCR 发布，服务 Docker/浏览器-only 场景
- Native helper 预构建 archive 同步发布到 GHCR，后续 `native:repair` 可优先消费
- 标准桌面 App 与自动更新包仍不打入 `OPL Meta Agent/MAS/MAG/RCA` runtime payload；macOS arm64 可额外发布 Full 首次安装资产，随包带 Agent Foundry 用的 `OPL Meta Agent`、`MAS/MAG/RCA`、`officecli` CLI binary 与推荐 companion skill payload，但不得写入 `latest*.yml` 或改变 App 自动更新通道

### 决策：One Person Lab App 只做 CLI-backed GUI，不复制安装与环境管理逻辑

原因：OPL 的可维护边界应是 CLI 提供安装、初始化、诊断、更新、模块管理与 workspace 管理等完整能力；GUI 只负责触发命令、展示状态与提供更低门槛的交互界面。这样命令行一键安装、App 首启、Docker WebUI 与后续自动修复能共享同一套行为，不形成 GUI-only 第二实现。

影响：

- App 首启继续通过 `opl system initialize` 读取状态，必要时通过 `opl install --skip-gui-open` 自动补齐环境
- 设置里的环境管理继续通过 `opl doctor`、`opl install`、`opl modules`、`opl module *`、`opl engine *` 与 `opl workspace *` 完成动作
- GUI fallback 只负责在找不到 `opl` 命令时调用 OPL 主仓安装脚本的 bootstrap-only 模式取得 CLI，然后回到 `opl ...` 命令面
- 新增安装、修复或状态能力时，先落到 OPL CLI 与机器可读输出，再由 GUI 消费

## 2026-04-26

### 决策：首启默认走静默自动配置，减少新手选择障碍

原因：One Person Lab App 和 Docker WebUI 的首要目标是让新手或 OPL-first 用户尽快进入可用界面。workspace root、模块安装、推荐 skills 这类可以合理默认或自动修复的事项不应变成首启向导问题；命令行 `opl install` 已完成的配置也不应在 App 首启时重复打断用户。

影响：

- 未显式配置 workspace root 时，`opl system initialize` 默认使用用户 Home 目录
- 兼容版本的 `Codex CLI` 已可用时，不因缺少可读 Codex config 单独阻塞首启
- `opl install` 默认安装/检查 domain modules，并以保守 managed 模式同步推荐 companion skills 和 `officecli` CLI 工具
- `opl install` 默认安装/复用 family runtime provider；Full readiness 需要 provider ready。`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- App 首启先静默读取 `opl system initialize`；若命令行安装已经完成，则不再运行安装或打开首启向导
- 只有缺少 Codex CLI、当前命中版本过旧或无法解析、模块无法安装等不可自动解决事项，才进入环境管理提示

### 历史决策：`MDS` 默认安装依赖面已被 MAS monolith closeout 取代

原因：2026-04-26 的安装面决策服务于迁移期，当时 MAS 仍需外部 `Med Deep Scientist` 作为隐藏运行依赖。MAS 现已完成 no-history physical absorb、retained capability absorb、default-runtime-retirement 与 docs closeout；外部 `med-deepscientist` checkout 不再是 MAS 默认 operation 的运行必需依赖。

影响：

- `opl install` 默认安装/检查 `MAS`、`MAG`、`RCA`，不再把 `meddeepscientist` 写成 MAS 默认运行依赖。
- `opl modules` 与 App 设置里的环境管理可以显示 MAS 声明的可选 companion diagnostic / oracle / intake 状态，但不得把它写成独立 OPL module。
- 首页和 domain-agent 入口继续只露出 `MAS`、`MAG`、`RCA`。
- 若 MAS 未来继续学习 MDS / DeepScientist 能力，只能按 snapshot provenance、capability classification、owner boundary、parity proof 与 no-history contributor audit 进入 MAS-owned surface 或显式 oracle / intake / diagnostic 引用。

### 决策：冻结 `OPL Runtime Manager` 为 provider-backed 产品控制面，而不是自有完整 runtime sidecar

状态：Runtime Manager 作为产品控制面继续有效；“Hermes 上”这一目标 substrate 已被 2026-05-10 的 Temporal-backed provider 决策 supersede。后续按 provider-backed Runtime Manager 解释。

原因：历史上曾计划把长跑托管任务注册到外部 `Hermes-Agent` online runtime substrate，由它负责 session、scheduler、wakeup、interrupt/resume、memory、delivery、approval、cron 与 webhook。当前这一路线已被 Temporal-backed provider 取代；保留本段只解释 Runtime Manager 为什么需要产品级 provision、version pin、profile wiring、typed family queue、domain task registration hydration、诊断、恢复入口、native helper catalog 与高频状态索引，而不是复制一套 runtime kernel。

影响：

- 新增 `opl runtime manager` 作为 Runtime Manager 的机器可读 projection
- 新增 `contracts/opl-framework/runtime-manager-contract.json` 冻结 owner split、responsibilities、non-goals、native helper target 与 state index target
- `opl runtime manager` 可以发现并调用可选 Rust native helper，把 `opl_runtime_manager_native_state_projection` 持久化到 OPL 本地 state；缺少 helper 时只报告 repair hint，不把 helper 伪装成 runtime kernel
- Rust native helper 现在作为 OPL package lifecycle 的一等面分发：npm package 包含 Cargo workspace 和 doctor/repair 脚本，`native:repair` 负责重建 helper 后输出 lifecycle doctor JSON
- native helper lifecycle 继续收紧为生产门禁：CI 跑 build/typecheck、fast、regression、integration、fresh-install、native、lint 与 structure；native lane 覆盖 doctor、prebuild check、package dry-run、Rust test/build、state cache 与 family smoke
- 测试治理采用单一 lane registry：`fast` 是默认本地信号，`regression` 承接宽回归，`integration` 覆盖 ACP/session runtime、install/configure 与 retired surface fail-closed，所有 active 测试文件必须被 `scripts/test-lanes.mjs assert-coverage` 覆盖
- 本地 `structure` lane 是 blocking Sentrux gate；GitHub Sentrux Advisory workflow 继续作为非阻断 sidecar 信号存在，不替代 Verify workflow 的 structure gate
- prebuild/cache 策略先按 manifest 和 `OPL_STATE_DIR` cache 落地，目标是让 fresh install 优先恢复匹配平台的 helper binary，只有缺失或无效时才走本地 Cargo build
- native state index 的 lifecycle 必须输出 TTL、history、failure、last-success、freshness、结构化 diff 与 history GC preserved/removed reporting，避免 helper 短暂不可用或 history 被裁剪时丢失可审计状态
- `opl runtime snapshot` 可以为桌面托盘和 App Runtime Workbench 投影 `attention_items`、`running_items`、`recent_items` 与 MAS study drilldown/read-only workbench 数据，但只读取 domain-owned durable surfaces；为了托盘状态显示或 App drilldown 不新增本地 daemon，也不把 MAS `mas_opl_runtime_workbench_projection` 升级为 OPL-owned study truth
- family runtime provider 继续由 provider-specific service / worker 承担 online substrate；`OPL Runtime Manager` 只做产品控制面、typed dispatch、诊断恢复和投影。Temporal 是 production required provider；旧 Hermes provider/Gateway/readiness 只在历史 provenance、诊断语料或负向 guard 语境中出现；`hermes_agent` 作为 executor adapter/backend 另按显式非默认接口处理。
- `domain task registration hydration` 是 Runtime Manager 的一等职责：OPL 读取 domain-owned sidecar export 中显式授权的 `pending_family_tasks[]`，写入 OPL typed queue，并保持 retry / dead-letter / notification / approval 语义；OPL 不从 read-only projection 自行推断医学、基金或视觉交付任务。
- provider system service lifecycle 由 provider-specific installer/gateway command 管理；OPL 只触发、检查和报告 readiness
- `MAS`、`MAG`、`RCA` 继续持有 domain truth 与 route-selected executor 语义
- 未来如需迁移到 OPL 自有完整 sidecar，必须先证明 provider abstraction / Temporal 无法表达必要的 task、wakeup、approval、audit 或产品隔离合同

## 2026-04-25

### 决策：8787 Product API service 模块退役

原因：当前 OPL GUI/WebUI 主线由 OPL-branded AionUI shell 提供，不消费仓内 8787 Product API service。该 service 来自旧本地 web adapter 历史阶段，继续保留模块本体会把后台 JSON/adapter 面误导成当前产品能力。

影响：

- `opl install` 不再安装、启动或打开 8787 Product API service
- public `opl service *`、`opl system reinstall-support`、`opl web`、`web bundle` 与 `web package` 退出当前命令面
- 仓内旧本地 web adapter 与 self-hostable web package 实现删除，避免继续形成第二产品入口
- GUI 分发由 `one-person-lab-app` 构建并发布到 `gaofeng21cn/one-person-lab-app` GitHub Release；Framework repo 不再保留 App release/upload/build workflow

## 2026-04-23

### 决策：gateway-first 合同语料退到 reference / history 层

原因：当前 `OPL` 的一等主线已经明确是 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`。继续把 `gateway-federation`、`opl-federation-contract`、`opl-routed-action-gateway` 与 `contracts/opl-framework/*` 这批旧语料写成默认公开集成合同，只会制造第二真相。

影响：

- 这批 gateway-first 语料继续 repo-tracked，但角色收口为 reference / history / negative-guard surface，不作为兼容接口
- 当前真相优先回到 `README*`、核心五件套与 `contracts/README.md`
- 已收录 domain 的实际接入单元继续写成 repo-owned capability surface 与单一 app skill

### 决策：`OPL` 默认合同冻结为 `Codex-default session runtime + explicit activation layer`

原因：当前产品目标已经明确为“默认尽量等价 Codex，只在显式切换 runtime 或显式调用 domain agent 时进入 OPL 增量语义”。继续把 `OPL` 叙事写成 wrapper-first、GUI-first 或混合默认 runtime，会直接污染默认交互合同。

影响：

- `opl`、`opl exec`、`opl resume` 继续以 `Codex` 语义为默认前门
- `opl skill sync` 成为 family domain skill pack 的统一同步入口；默认前门继续保持原生 Codex 语义
- GUI 壳与 ACP-compatible 外壳都围绕同一套 Codex-default runtime contract 工作

### 决策：admitted domain 通过 repo-owned capability surface 接入 `OPL`

原因：系列项目需要让 `Codex` / `OPL` 调用 domain agent 时尽量保持同一使用体验。更自然的接入方式不是为每个 domain 发明 ask-wrapper，而是让 domain 仓把 CLI、本地程序/脚本与 repo-tracked contract 暴露成稳定 capability surface，再由 `OPL` activation 层消费。

影响：

- `MAS`、`MAG`、`RCA` 等 admitted domain 继续以 repo-owned CLI / 程序 / 脚本 / contract 作为稳定接入面
- `OPL` 负责 activation / dispatch，不把 domain-specific 行为改写成 OPL-only 语义
- 直接在 `Codex` 中调用某个 domain，与先进入 `OPL` 再显式激活该 domain，工作逻辑保持一致

## 2026-04-21

### 决策：活跃 domain 仓对外统一写成独立 `domain agent`

原因：在 `OPL` 已经收敛为 family-level `session runtime` 之后，`MAS`、`MAG`、`RCA` 的公开主语更准确地应是“可被 `Codex`、`OPL` 或其他通用 agent 直接调用的独立 `domain agent` 仓”。继续把 `domain gateway / domain harness` 当成仓库对外第一身份，容易把内部边界层语言和公开产品角色混在一起。

影响：

- `MAS`、`MAG`、`RCA` 当前公开主语统一收口为独立 `domain agent`
- `agent entry / direct entry` 成为对外更优先的入口语言
- `domain gateway / domain harness` 继续保留为各仓内部的边界层与执行层术语

### 决策：`OPL` 继续持有 shared modules / contracts / indexes，但不制造 OPL-only domain semantics

原因：系列项目必须有一层承接跨仓共享模块、共享合同和共享索引；这层归属继续属于 `OPL / UHS`。但共享模块的存在，不应把 domain-specific 行为语义绑成“只有经过 `OPL` 才成立”的特殊工作流。

影响：

- `OPL` 继续持有 family-level shared modules、shared contracts、shared indexes
- `MAS`、`MAG`、`RCA` 通过 `OPL` 调用或被 `Codex` 直接调用时，领域语义保持一致
- 顶层 session/runtime/projection 与 domain-specific truth/logic 继续分层

### 决策：`OPL` 主线切换为 `ACP-native session runtime`

原因：对开发者和一线使用者来说，`OPL` 的一等使用路径不是直接调用 API，而是进入本地 `opl`、在 `Codex` 中显式激活 `OPL` 与其 domain agent，或让外部壳通过显式 adapter 消费同一套 session runtime。继续把 `Product API` 作为主语，会把交互主线与真实用户路径写反。

影响：

- `OPL` 主仓当前主线以 `Codex-default session runtime + activation layer` 为中心，而不是以 GUI 或 API 壳为中心
- canonical truth 收敛到：workspace binding、session lifecycle、progress / artifact projection、agent entry dispatch、runtime mode
- GUI / Web shell 使用这套 session runtime；本地 8787 Product API / `opl web` 模块退役
- `one-person-lab-app` 是 App 产品仓；当前第一 GUI adapter 位于 `shells/aionui`，基于 AionUI codebase 产出 OPL 品牌壳，但原版 AionUI app 不是 OPL GUI，也不是 runtime owner

### 决策：GUI 主线确定为基于 AionUI codebase 的 OPL 品牌壳

原因：在 `OPL` 已经明确走 `Codex-default session runtime + activation layer` 主线之后，当前 GUI 形态确定为基于 AionUI codebase 的 OPL 品牌壳。用户面对的交付物必须是 OPL 品牌壳：去掉 OPL 用不上的通用 AionUI 模块，替换品牌、文案和安装包身份，并消费 OPL runtime/release contracts。

影响：

- `OPL` 主仓继续保留 family-level session runtime、`opl` shell / TUI、release distribution surface 与 activation contracts
- 当前第一 GUI 交付物按 `opl-aion-shell` 的 OPL 品牌壳推进，并由 `one-person-lab-app` 负责发布包装
- 仓内已移除旧 GUI 备线材料；当前 GUI 实施依据收敛到 `opl-aion-shell` 与 AionUI codebase

## 2026-04-20

### 历史决策：公开产品模型曾重置为 `Product API`

原因：旧本地 UI adapter 体系把 GUI 启动、环境管理、工作空间、任务、进度、文件、领域接线和 hosted 试验语义揉在了一层，已经不适合当前 `OPL + 独立界面仓` 目标形态。

影响：

- 当前公开模型统一收敛为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `opl` shell / TUI、GUI 外壳与 CLI 共同消费这组产品资源
- 旧本地 UI adapter 公开语义退出当前主线

### 决策：Domain Agents 与 OPL 保持松耦合

原因：`MAS`、`MAG`、`RCA` 等仓的专业逻辑需要继续独立演进，而 `OPL` 需要保持顶层共享运行时和统一入口。

影响：

- `OPL` 负责共享运行时、shared modules/contracts/indexes 与 release distribution surface
- 各个领域仓继续持有智能体入口、领域逻辑、运行规则与交付物
- 通过 `OPL` 调用领域智能体，与直接在 `Codex` 里调用该智能体，工作逻辑保持一致

### 决策：旧本地 UI adapter 相关公开语义进入退役清单

原因：这些语义属于上一阶段的公开设计，继续保留在主线里会污染当前开发和文档。

影响：

- 当前主线不再把旧本地 UI adapter、entry-guide、domain-wiring、hosted bundle/package 作为公开产品主语。
- 相关文档只留在参考层或历史层

## 2026-04-19

### 决策：GUI 主线冻结为“OPL 主仓共享运行时 + 独立界面仓”

原因：GUI 壳与 `OPL` 运行时需要保持分仓演进；`OPL` 主仓只保留运行时真相与接口面，真正的 GUI 主线放在独立界面仓里推进。

影响：

- `OPL` 主仓只保留 CLI 产品入口、工作空间 / 会话 / 进度 / 交付物真相、release distribution surface，以及 Codex-default runtime config；Hermes mode config 只保留历史语境
- 独立界面仓负责真正的 GUI 外壳
- 一键安装默认打开已安装 GUI；macOS 上缺失时自动下载、挂载并安装 `one-person-lab-app` release 中匹配当前平台的 OPL 品牌 Electron DMG

### 决策：外部 GUI 基座只在“当前主线 / 基准 / 参考 / 备线”语境出现

原因：必须持续区分“上游参考对象”和“当前已经真实集成的对象”。

影响：

- AionUI codebase 可以作为当前 GUI 主线基座出现在 current status / implementation planning，但必须明确用户交付物是 OPL 品牌壳
- 外部 GUI 产品名只能用于基准或参考语境；当前 GUI 主线只承认 `opl-aion-shell` 这一 OPL 品牌壳，并由 `one-person-lab-app` 打包发布给用户
- 只有真实集成发生后，才允许在 current status / current implementation 里写成已集成事实

## 2026-04-11

### 历史决策：`Hermes-Agent` 命名只指上游外部项目 / 服务

状态：命名边界仍有效，但 runtime substrate 目标已被 Temporal-backed provider 决策 supersede。当前 `Hermes-Agent` 文案可用于上游项目 / 服务本体，以及 `hermes_agent` canonical 显式非默认 executor adapter/backend 的标签；旧 Hermes provider / Gateway / readiness / compat 文案只属于历史 provenance、诊断语料或负向 guard。不得再把 Hermes 写成 OPL provider、默认 runtime substrate、readiness path 或兼容接口。

原因：避免把仓内 shim、helper 或 scaffold 误写成“已接入 Hermes-Agent”，同时避免把当前 canonical `hermes_agent` executor adapter/backend 误删为旧 Hermes provider/Gateway 残留。

### 决策：统一 runtime substrate，不强制统一具体执行器

状态：历史决策，已被 2026-05 的 provider-backed family runtime / Temporal production required substrate 口径吸收。当前读法是：Temporal-backed family runtime provider 承担 production online substrate；`Hermes-Agent` 不再是 runtime provider / Gateway / readiness path，但 `hermes_agent` 仍可作为显式非默认 executor adapter/backend。`Codex CLI` 当前仍是家族默认且第一公民的具体执行器，默认模式是 `autonomous`。

影响：

- family runtime provider 统一负责 stage attempt、signal/query/history、receipt 和 operator projection 等 substrate 能力；历史 `Hermes Kernel` / online-management gateway 说法只作为迁移期背景
- `OPL` 与各领域仓继续负责 gateway、authority、object contract、audit truth
- 具体任务执行继续通过领域内部的执行路径完成

### 决策：家族第一公民执行器正式名称冻结为 `Codex CLI`

原因：这是当前最成熟、质量最可控、并且已经在医学研究线证明可行的默认路线；把正式名称、默认模式与路线状态分开表达，更适合跨仓共享合同长期维护。

影响：

- 家族第一公民执行器正式名称统一写作 `Codex CLI`
- 家族默认执行模式统一写作 `autonomous`
- `Hermes-Agent` 继续保留正式名称；当前 executor 路线状态写作 `explicit_non_default_executor_adapter / experimental`，provider/Gateway/readiness 路线状态写作 `retired_from_active_provider_surfaces / history_provenance_diagnostic_reference`
- 默认模型与默认 reasoning effort 继续继承本机 `Codex` 默认配置
