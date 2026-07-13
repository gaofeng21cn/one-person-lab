# Family Runtime Attempt Contract

Owner: `One Person Lab`
Purpose: `references_runtime_substrate_family_runtime_attempt_contract`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## Purpose

本合同把 `MAS` work-unit / route-unit attempt 经验抽象成 `OPL` family-level 最小共同语义。它服务 `OPL Runtime Manager` 的状态索引、诊断和产品投影，不改变 `Codex-default session/runtime`，也不让 `OPL` 接管 `MAS`、`MAG`、`RCA` 的 domain runtime truth。

本文只解释 attempt contract 的稳定语义。当前 attempt 数量、running/blocked 状态、Temporal visibility、`stage_progress_log`、`attempt_true_path_proof`、worklist、current-control-state 和 App/operator drilldown 计数都必须从 live CLI/read-model 读取，不能从本文冻结。默认读取入口是 `contracts/opl-framework/family-runtime-attempt-contract.json`、`opl family-runtime attempt query|inspect`、`opl runtime app-operator-drilldown --detail full --json`、`opl framework readiness --family-defaults --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。

## Owner Split

- `OPL` owns：family contract vocabulary、shared indexes、operator projection、diagnostic freshness。
- domain repo owns：runtime truth、route semantics、domain quality judgment、write authority。
- `OPL Runtime Manager` reads domain-owned durable surfaces and produces observability-only projection。
- The configured family runtime provider is the OPL online runtime substrate for Full readiness. Temporal-backed execution is the required production substrate; `local_sqlite` is only retired-provider negative-guard vocabulary and SQLite sidecar projection/index legacy naming. `Hermes-Agent` is not a provider and retained references are explicit proof diagnostics, executor experiments, fixtures, or provenance. No provider is a domain truth owner or domain scheduler authority。

## Attempt Record Fields

domain repo 可以暴露自己的 route、receipt、typed blocker 或 runtime projection surface；进入 OPL 托管路径后，OPL attempt ledger / projection 必须能表达当前 machine contract 中的 stage attempt 身份、provider、queue、executor、closeout、usage 和 authority boundary。本文不维护字段 schema；字段完整性回到 `contracts/opl-framework/family-runtime-attempt-contract.json`。

稳定读法如下：

- `attempt_state` 包含 queued / running / checkpointed / human_gate / completed / blocked / dead_lettered 等 control-plane 状态；具体枚举从机器合同读取，不从本文复制。
- ledger identity 至少能关联 `stage_attempt_id`、`task_id`、`provider_kind`、`workflow_id`、`domain_id`、`stage_id`、`executor_kind`、`idempotency_key`、workspace locator、source fingerprint 和 owner route refs。
- ledger evidence 只保存 checkpoint refs、closeout refs、human gate refs、typed blocker refs、owner receipt refs、provider receipt/run、activity events、user instruction refs、resume refs、usage projection、route impact 和 closeout receipt status。
- projection 必须暴露 attempt count、retry policy、workspace boundary、failure reason、route hydration status、current control state、operator visibility、completion boundary、owner route boundary、usage projection、`stage_progress_log`、`attempt_true_path_proof`、Temporal visibility 与 debug refs。
- 这些字段都只表达 control metadata / refs-only progress，不表达 domain quality、artifact authority、publication/fundability/visual verdict 或 production readiness。

Progress-First supervision 与 `family-runtime attempt list --study` lookup 的 study identity 匹配不能只读取 attempt metadata 的 `study_id`。OPL attempt projection 必须把 `workspace_locator` 与 linked task payload 中的 `study_id`、`studyId`、`study_short_id`、`studyShortId`、`target_studies`、`targetStudies`、`quest_id`、`questId`、`study_aliases` 和 `studyAliases` 作为同一 alias set 消费，避免 domain study alias、short id 或 quest id 对应的真实 attempt 被误判为没有 attempt 或停滞。

## Stage Progress Log

`stage_progress_log` 是 OPL 对 stage attempt 的统一语义 log。它从 attempt ledger、provider run、activity events、usage projection、typed closeout packet、blocker refs 和 domain receipt refs 派生，表达 planned stage / actual work / timeline / token-cost-duration / evidence refs / authority boundary。它不新增平行状态库，不读取 transcript、artifact body、memory body 或 domain body，也不替 domain owner 发布 quality、artifact、package、publication 或 domain-ready verdict。

`attempt_true_path_proof` 是同一 attempt 的 refs-only 追踪证明面。它把 `attempt query`、stage-attempt projection、App full drilldown、`stage_progress_log`、Temporal visibility 和 Temporal Web UI debug refs 绑定到同一 `stage_attempt_id/task_id/workflow_id/run_id`，只证明当前 provider-backed 真路径可追踪；它不构成 long-soak、domain-ready、artifact authority、owner receipt 或 quality verdict。

Temporal-backed attempt 必须把 durable history、activity heartbeat、workflow query 和 searchable visibility 交给 Temporal provider；OPL 只把这些 provider refs 投影成 `temporal_visibility` 和 `temporal_webui_ref`。`temporal_visibility` 只包含 namespace、task queue、workflow/run refs、Search Attribute refs 与可检索摘要；`temporal_webui_ref` 只作为 operator debug link，不是 One Person Lab App 的主状态页、用户 truth surface 或 domain authority。

## Typed Closeout 与 User Stage Log

当前 contract 接受 typed closeout、free-text、raw/partial artifact、阴性/零结果和 no-output/failure diagnostic 作为不同质量等级的 progress input。typed closeout 才能授权其明确绑定的 owner/quality/ready claim evidence；free-text 或 diagnostic 以 `completed_with_quality_debt` 推进，不能升级这些强声明。OPL 只记录 closeout refs、consumed refs、memory/writeback refs、rejected writes、route impact、next owner 和 domain-provided user-stage-log fields；它不从 artifact body、memory body、publication verdict body 或 quality verdict body 推断语义。

`user_stage_log` 是用户透明度投影，不是 domain truth。OPL 负责时间、usage、refs、observed/missing/null 和 authority boundary；domain closeout 负责 `stage_name`、`problem_summary`、`stage_goal`、`stage_work_done`、`changed_stage_surfaces`、`outcome`、`remaining_blockers` 和 evidence refs。标准 OPL Agent 使用 `stage_work_done` / `changed_stage_surfaces`；缺少 domain 人话语义时必须显示 `missing_domain_semantic_summary`，不得补写或猜测。

`current_control_state` 是 OPL-only reconciled projection。它只从 family queue、stage attempt ledger、provider run projection 和 stage progress/closeout ledger 派生；不得从 `domain_latest`、`domain_dispatch_latest`、domain-ready verdict 或 artifact-ready verdict 派生。missing identity、stale route/source/truth epoch 或 provider completed without any readable artifact/diagnostic 只能关闭 currentness/claim 读取；缺 typed closeout 本身形成质量债并继续 stage progression。若存在新 queue / stage attempt 或更新 closeout，旧 terminal attempt 不能覆盖 task-level currentness。没有 canonical admission consumer 的 no-progress 观察只能进入 advisory/readback，不能冻结默认 redrive、耗尽 StageRun 或伪造 typed blocker。

## State Semantics

- `claimed` 只表示 work item 已被某个 domain runtime 或 route unit 接手。
- `running` 只表示 domain-owned surface 报告仍在执行或等待下一次 runtime tick。
- `retry_queued` 表示恢复策略已经排队；它不是 domain quality judgment。
- `released` 表示该 attempt 不再持有 workspace / route claim，可以由 domain repo 重新调度或升级 human gate。
- `completed` / `succeeded` 必须结合 typed closeout、owner receipt refs、typed blocker refs 和 completion boundary 阅读；provider completed 不等于 domain ready。
- `blocked` 必须携带 `human_gate_reason`、`quality_gate_reason` 或 `runtime_owner_mismatch`。

## External Stability Pattern Policy

`cybernetics-agent` 一类外部 agent wrapper 的 fallback、字符串 retry、event bus 和 runtime adapter 不是完全不能学；它们不能作为 `OPL` core runtime 成功语义照搬。`OPL` 的稳定性定义是失败能被准确分类、可恢复、可审计，并且不会伪装成高质量完成。

- `generic_fallback` 只能进入 `degraded_attempt` 或 `alternative_route_proposal`。它必须携带 blocker、evidence gap 和 owner receipt ref；不能标记 `fallback_complete`，不能绕过质量门或 domain authority。
- `string_rule_retry` 只能升级为 typed SLO / retry policy schema。规则必须有 trigger kind、metric source、cooldown、max attempts、owner、allowed action 和 receipt refs；解析失败必须 fail-closed。
- `generic_event_bus` 只能作为只读 event classification / alert projection。真实状态仍以 stage attempt ledger、Temporal workflow history、stage-attempt projection、typed closeout packet 和 domain-owned receipt 为准；event stream 不能成为第二真相源。
- `generic_runtime_adapter` 只能落到显式 executor adapter registry。每个 adapter 必须声明 capability boundary、receipt shape、tool-event proof、timeout rule、typed closeout rule 和 fail-closed gate；不能把“能启动进程”解释为行为等价、质量等价或 resume 等价。

## Workspace Isolation

- attempt 必须携带 owner repo 与 workspace boundary，防止跨 repo 写入。
- `OPL` 只读取 domain-owned projection source refs，不推断额外 workspace 权限。
- 路径越界、缺少 source refs 或 owner repo 不匹配时 fail-closed。
- hosted worker / external runtime 只能作为 carrier；domain repo 仍然是 authority。

## Unsupported Scheduler Boundaries

以下内容不得写成 `OPL` family 必需入口：

- Linear required entry。
- Symphony scheduler owner。
- external issue tracker required entry。
- generic task scheduler replacing `Codex-default session/runtime`。
- `OPL Runtime Manager` as scheduler / session / memory kernel。

## Reconciliation

`OPL` 可以报告 stale / conflict / missing projection，但修复动作必须回到 OPL provider/runtime safe action 或 domain-owned surface。`OPL` 的职责是说明当前卡在哪里、下一次应检查哪个 source ref、是否需要 human gate、是否需要 provider repair 或 retry/dead-letter redrive；domain repo 的职责是决定是否继续、重试、修复、关闭质量门或签发 owner receipt / typed blocker。
