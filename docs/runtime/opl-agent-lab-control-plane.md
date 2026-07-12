# OPL Agent Lab 控制面边界

Status: `active_runtime_support`
Owner: `One Person Lab`
Purpose: `agent_eval_improvement_control_plane`
State: `active_support`
Machine boundary: 本文是人读 runtime 支撑说明。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、domain-owned eval/proof surface 和语义化 `human_doc:*` id。

## Currentness policy

本文只保存 Agent Lab 的稳定职责、authority boundary、机器入口和测试归属读法。不要从本文读取当前 suite status、task / probe / candidate / receipt / counter 数值、workbench source refs、Developer Mode closeout 计数、promotion gate 是否关闭、App consumption 是否 ready 或 production/domain ready；这些必须从 fresh contract、source、tests、CLI/read-model、runtime ledger、provider receipt 和 domain owner surface 读取。

## 定位

`OPL Agent Lab` 是 OPL Framework 内部统一的 eval / improvement / evolution harness control plane。它面向 framework 维护者、operator 和 App/workbench read model，统一组织跨 domain agent 的能力评估、回归观察、机制自动进化、实验证据和 follow-up 任务。

它属于 OPL runtime / control plane，不是新的 domain agent、不是新的 product truth store，也不是 MAS/MAG/RCA 之上的质量裁判。

它的默认目标是全自动机制进化：常态路径应由真实 failure delta、独立 AI reviewer、风险分级、evidence/no-forbidden-write gate、version ledger、canary 和 rollback 共同约束。fixture、generated receipt、scorecard pass 和 no-current-failure 只作为 regression guard，不授权自动推广。人工审核不是常态 gate，只在高风险 owner authority surface 或明确 owner/human policy 要求时介入。

核心职责是：

- 聚合 OPL 可见的 framework runtime evidence、stage attempt refs、provider receipt、descriptor parity、operator blocker 和 domain-owned eval/proof refs。
- 把跨 domain 的评估问题转成可审计的 lab run、risk-classified improvement、acceptance evidence、version ledger entry、canary / rollback refs 和 follow-up queue item。
- 为 App/workbench 提供可读的改进看板、回归风险、验证状态和下一步动作。
- 维护 framework-level 问题归因：runtime/provider/executor/control-plane 问题归 OPL；domain truth、quality gate、artifact authority 问题回 domain owner。
- 把 `mechanism` 作为一等对象表达：只记录 mechanism ref、version、editable surface refs、meta edit receipt ref、evolution segment ref、evidence delta ref 和 next mechanism candidate ref。
- 把机制演化从 candidate-only 语义提升为 promotion control plane：低风险机制改动在真实 failure delta、独立 AI reviewer、promotion receipt、rollback 和 no-forbidden-write refs 齐全后可自动推广；中风险机制改动还需要 canary 正常；高风险改动只路由到 owner/human gate。

Agent Lab 的最小语义链路是：

```text
runtime / descriptor / domain-owned proof refs
  -> OPL Agent Lab eval run
  -> mechanism / improvement candidate
  -> risk classification + independent AI reviewer
  -> evidence / no-forbidden-write / version ledger
  -> auto-promotion canary + rollback refs or owner gate route
  -> status / workbench projection
```

## Developer Mode 关系

Developer Mode 是 OPL App / system settings 的产品开关，不是 Agent Lab 的新底层 contract，也不是 direct write grant。当前 `opl system` 与 `opl system initialize` 已暴露 `developer_mode` surface，复用既有 `developer_supervisor` system action，让 App 设置页能读取当前配置、GitHub identity 状态、repo authority 汇总、repair route、settings endpoint、system action endpoint、request fields 和 payload template。

这个 surface 只说明“用户是否允许 OPL 暴露受监督的开发者检查与修复路由”，并以 fail-closed 方式投影当前 GitHub 身份、repo 权限和 direct-fix / fork-PR / mixed / observe-only 路由。它不代表真实 owner repo 直接修复提交、non-owner fork PR 或 Agent Lab 外围 AI 巡检 closeout 已经完成，更不会把无权 repo 升级成 upstream direct write；这些仍必须由目标 repo 的真实 GitHub authority、对应 repo worktree、branch、PR、verification 和 evidence refs 证明后再写入 Agent Lab / App read model。

2026-06-03 起，`developer_mode` 机器投影还必须暴露 `developer_profile` 与 `capabilities`。旧字段 `enabled`、`mode`、`effective_state`、`allowed_route` 继续作为兼容摘要；结构化消费方读取 `developer_profile.profile_id` 判断 Contributor / Maintainer / Runtime Maintainer 层级，并读取 `capabilities.source_channel`、`workspace_trust`、`github_authority`、`agent_automation`、`runtime_mutation_scope` 的 `status`、`level`、`source`、`impact`。其中 `source_channel` 只说明 App/CLI read model 是否可使用 local developer checkout；`github_authority` 只说明 direct write / fork PR repo route；`runtime_mutation_scope` 只说明 shared runtime provider maintenance 是否允许。三者是独立能力，不得由单一 Developer Mode 开关互相替代。

## 权限边界

Agent Lab 明确不持有：

- domain truth；
- publication / fundability / visual quality verdict；
- artifact authority；
- domain memory body；
- memory accept / reject decision；
- domain owner receipt authority；
- domain package / export / submission readiness verdict。

Agent Lab 可以持有：

- eval run metadata；
- metric / rubric / scenario descriptor；
- OPL framework regression signal；
- framework improvement candidate；
- risk classification、independent AI reviewer direct-evidence refs；
- mechanism version ledger、canary refs 与 rollback refs；
- usage-log-driven meta optimize refs；
- token / cost estimation input refs、pricing schedule refs、model profile refs 与 estimation result refs；
- cross-domain comparison view；
- owner route refs；
- evidence refs、receipt refs、blocker refs 与 follow-up refs。
- efficiency non-regression refs：duration、cost、cache hit、reuse scope、quality floor、no-forbidden-write 与 owner route refs。

当 Agent Lab 展示 MAS/MAG/RCA 的质量、进度或交付状态时，只能引用 domain-owned eval/proof/receipt/artifact locator。它不能把 provider completion、harness pass、descriptor aligned、agent-lab score 或 OPL operator judgment 写成 domain ready verdict。

## FeedbackOps 显式用户反馈入口

`FeedbackOps` 是所有标准 OPL agent 共用的显式用户反馈入口。当用户对 MAS、MAG、RCA、BookForge、ScholarSkills 或其它 agent 的交付结果提出明确建议、导师意见、审稿意见或质量缺口时，OPL 应先把它记录为 `opl_delivery_feedback_event`，再路由到 `target_agent_feedback_external_suite`。这个入口是事件和 refs 投影，不是新的目标仓 truth store。

最小链路是：

```text
explicit user feedback
  -> opl feedback submit
  -> target_agent_feedback_external_suite
  -> Agent Lab / FeedbackOps status projection
  -> opl-meta-agent:oma-agent-evolution
  -> existing opl work-order execute when Developer Mode route allows
  -> target owner receipt / typed blocker / human gate / completion ref
  -> opl feedback reconcile + App action queue projection
```

标准 domain feedback self-evolution 链路应读成 `domain/package thin adapter -> OPL FeedbackOps / Agent Lab status projection -> opl-meta-agent:oma-agent-evolution -> Developer Mode direct-fix / fork-PR / owner-handoff route -> target owner readback`。职责拆分固定为：target agent 只提供 thin adapter / trigger 和目标域 refs，`opl-meta-agent:oma-agent-evolution` 负责 work-order / proposal 生成，FeedbackOps / Agent Lab 负责事件账本、状态投影、执行 gate 和 owner route。`contracts/opl-framework/agent-lab-contract.json#domain_feedback_self_evolution_surface` 只声明这条链路的 refs-only read-model shape，contract 本身不会提交反馈、创建 suite、执行 work order 或写 target owner result。`contracts/opl-framework/foundry-agent-series-contract.json#standard_feedback_self_evolution_trigger_policy` 是所有标准 Foundry Agent 的触发合同，`opl foundry agents inspect <agent_id> --json` 会对 MAS、MAG、RCA、OMA、OBF 和 ScholarSkills 投影同形 `feedback_self_evolution_trigger`，让 App、CLI 和 skill prompt 都能读取同一触发字段，并把 OMA skill 固定到 `opl-meta-agent:oma-agent-evolution`。Agent Lab 的 App/action-queue 投影必须能把缺 suite、suite stale、已排队、可交给 `opl work-order execute`、以及已完成或已有 domain-owned blocker ref 分开显示。MAS 侧在这里是 thin adapter / trigger，不是承担优化策略的 skill。

反馈捕获不要求 Developer Mode，因为记录用户明确反馈本身不改变目标仓、论文、图表或质量结论。Developer Mode 只约束 repo mutation、work-order 执行、promotion 和 closeout 路径；repo mutation 只有在目标仓 authority 允许时才能进入 `direct_repo_fix`，否则只能走 `fork_pull_request`，再不满足时进入 `owner_handoff`。没有 `active_direct` 或 `direct_repo_fix` route 时，FeedbackOps 只能投影为 `queued_requires_developer_mode`、`fork_pull_request` 或 `owner_handoff`。即使 work-order 可执行，OPL 也只调用既有 `opl work-order execute` 原语，不创建第二套 runner、runtime queue 或 provider queue。

FeedbackOps 明确不持有：

- target-domain truth；
- artifact body；
- domain memory body；
- publication、fundability、visual quality 或 export verdict；
- owner receipt；
- typed blocker body；
- human gate body。

这些结论只能由目标 agent owner surface 返回。OPL FeedbackOps 只保留 event id、idempotency key、delivery ref、feedback ref、external suite ref、developer work-order candidate ref、completion ref、blocker ref、状态桶和 App action-queue refs。

当 Agent Lab 检查标准 Foundry Agent stage 时，必须把 `domain_stage_completion_policy` 当成 admission / conformance 输入。合规 stage 的默认闭环是：stage executor 产出工作结果，domain stage owner 在 stage 内做内容完成判断并输出标准 closeout packet，OPL runtime 只消费 packet 来记录 attempt、执行 next-stage transition 和投影 next owner delta。Agent Lab 可以检查 policy ref、closeout packet ref、completion owner、accepted outcome、accepted owner receipt / typed blocker / human gate / route-back refs 和 forbidden authority flags；它不能自己判断内容是否足够完成，也不能把 provider completion、file presence、suite pass、conformance pass 或 scorecard pass 当作 domain stage closeout。

Agent Lab 对这类错误必须输出 blocker，而不是把它们降级为 advisory warning：缺失 `stage_completion_policy_ref`、`surface_kind` 不是 `domain_stage_completion_policy`、`completion_judgment_owner` 不是 `domain_stage`、`closeout_packet_required=false`、`provider_completion_is_domain_completion=true`、`opl_content_judgment_allowed=true`、`next_stage_transition_owner` 不是 `opl_runtime`、required outcomes 不含 completed / wait-owner / route-back / blocked / rejected，或 accepted closeout refs 不支持 owner receipt、typed blocker、human gate 和 route-back。这个 blocker 是标准 agent conformance blocker，不是目标 domain owner receipt，也不授权 OPL 写 domain truth。

当 Agent Lab 展示 token / cost estimation 时，只能输出基于 refs 和结构化 metadata 的预算估算投影。估算可以引用 model profile、pricing schedule、task shape、artifact plan、provider routing 和 historical usage summary refs，例如估算 `RCA` 一次 40 页 PPT 在 `gpt-5.5` `xhigh` 推理配置和 `gpt-image-2` 图像生成配置下的 token、image unit 与成本区间。该 surface 不是 OpenAI 或任意 provider 的真实账单，不读取 provider billing ledger，不声明最终应付金额，也不构成 RCA visual quality、artifact readiness、export readiness 或 domain owner verdict。

`agent_efficiency_nonregression` 是通用效率非回归控制面，不是 RCA/MAS/MAG 专用 suite kind。它把 suite result 或显式输入里的 duration、cost、cache hit、reuse scope、quality floor、no-forbidden-write 和 owner route refs 规整成 `opl_agent_lab_efficiency_nonregression_read_model`，只输出 `ready` / `blocked`、typed blocker 和证据分组。该 surface 可以帮助 complete/workbench 判断“效率优化是否保留了质量下限与写权限边界”，但不能写 domain truth、quality verdict、artifact、owner receipt、memory body，也不能提升默认 executor。

## 自动进化与风险分级

Agent Lab 的默认 promotion 语义是“自动机制进化，按风险分级阻断”。真实 failure delta、独立 AI reviewer、直接证据审查、测试证据、no-forbidden-write、version ledger、canary 和 rollback 是常态 gate；人工审核只属于高风险 owner gate 或显式 policy gate。没有真实 failure/evidence delta 的候选只能进入 `regression_guard_only`，用于防回归和继续收集 evidence，不进入 auto-promotion。

| 风险级别 | 典型 surface | 常态 gate | Promotion 语义 |
| --- | --- | --- | --- |
| 低风险 | prompt wording；rubric clarification；display/workbench/read model metadata；test/suite metadata | 真实 failure/evidence delta；独立 AI reviewer 直接证据审查；promotion receipt；evidence/no-forbidden-write；version ledger；rollback ref | 可 auto-promote。 |
| 中风险 | stage policy；tool policy；retry/dead-letter policy；memory retrieval policy | 真实 failure/evidence delta；独立 AI reviewer approve；相关 tests pass；promotion receipt；evidence/no-forbidden-write；version ledger；canary；rollback ref | canary 正常后自动推广。 |
| 高风险 | domain truth；publication/fundability/visual verdict；artifact mutation；memory accept/reject；credential/network/write policy | domain owner 或 human gate；owner receipt；禁止 OPL 单独推广 | OPL 只能生成 route、evidence 和 blocker refs，不能自动推广。 |

低风险和中风险路径不得退化成“生成候选后等人工挑选”。candidate 是自动进化 pipeline 的 typed input；promotion 失败时必须留下失败原因、evidence delta、rollback ref 和下一轮 follow-up item。`no-current-failure`、fixture suite pass 或 generated review receipt 只能证明当前没有回归，不构成推广依据。高风险路径也不由 Agent Lab 判定业务质量，它只把 evidence、owner route 和阻断原因投影给对应 owner。

## ARIS 模式吸收

ARIS 的可学习点以模式进入 OPL Agent Lab，不作为 runtime dependency 或外部真相源：

- research wiki / failed route memory：沉淀成功路径、失败路径、被证伪假设和后续实验入口；OPL 只记录 refs、失败原因和复用条件，不接管 domain memory body。
- independent reviewer direct-evidence review：由独立 AI reviewer 按直接证据审查机制改动，不用同一执行 agent 自我批准。
- integration contract failure policy：把集成合同失败写成 typed blocker、owner route、retry/dead-letter 或 rollback 入口，避免静默降级。
- experiment / analysis queue manifest：把实验、分析、回归和 follow-up 队列显式列为 manifest refs，让 App/workbench 能看到待验证链条。
- runtime event ledger / provider-executor switch hygiene / claim assurance：MAS suite 可以把运行事件账本、provider/executor 切换卫生证明和 claim 直接证据保障投影成 typed body-free refs；OPL 只把这些 refs 纳入 mechanism evolution input、candidate source、log-mined source 和 evidence delta，不接收 body、truth、artifact、owner receipt 或 quality verdict。
- usage-log-driven meta optimize：用使用日志、失败日志和 operator friction refs 驱动机制优化候选；日志只产生 meta optimize signal，不授予 domain truth 或 artifact mutation 权限。
- effort / assurance 双轴：把执行投入级别与证据保障级别拆开投影，避免把 quick smoke、standard regression、deep soak、owner-chain proof 写成同一种 readiness。
- helper inventory / drift report：把 Codex skills、MCP tools、本地 helper binary 的 inventory refs 和 drift guard refs 作为 Agent Lab 控制面输入；缺 inventory 或 drift 未验证时 fail closed，只输出 blocker/route refs，不执行 helper。
- permission / current-date fail-closed invariant：需要 permission scope、sandbox policy 和 current-date context refs；缺失时输出 typed blocker 与 owner route，不能用隐式默认权限或陈旧日期继续推进。
- MCP / stream reliability policy：把 MCP tool result、stream event ordering、stream closeout receipt、retry/dead-letter 和 stream replay refs 固定为 reliability policy；禁止静默丢 event 或把 stream payload body 纳入 OPL。

## AHE 模式吸收

AHE 的可学习点以模式进入 OPL Agent Lab，不作为 runtime dependency 或外部真相源，也不引入 AHE、NexAU、harbor 或 E2B。

Agent Lab 当前把 `evidence -> root cause -> targeted fix -> predicted impact -> next-run falsification` 落成 refs-only read model。suite task、mechanism evolution input 或 run result 可携带 `change_evaluation_refs`、`failure_evidence_refs`、`root_cause_refs`、`targeted_fix_refs`、`predicted_impact_refs`、`risk_task_refs` 和 `next_run_falsification_refs`；缺 `change_evaluation`、`failure_evidence`、`root_cause`、`targeted_fix` 或 `next_run_falsification` 时输出 `ahe_evidence_refs_missing` typed blocker。fixture、generated、suite-pass、scorecard、schema-complete 或 provider-completion refs 只能进入 `review_pending` 或 advisory evidence，不能授权 promotion。

best-of-N candidate comparison 落在 `opl_agent_lab_variant_comparison_read_model`。外部 suite 或 evolve/optimize result 可以携带多个 `variant_candidate_refs`，read model 输出 selected winner、loser refs、per-variant evidence delta、predicted flip refs、risk refs、regression count 和 promotion eligibility。只有被选中的 winner 可以进入既有 risk-tiered promotion gate；未选 variant 是 learning-only refs，不能授权 domain ready、quality verdict、artifact readiness、memory apply 或 default agent promotion。

Codex-first executor aperture 现在按 runtime-issued `executor_capability_lease` 读取：lease 记录 selected executor、model/reasoning、tool/network/sandbox/worktree/subagent capability、budget、allowed effects、expected receipts、TTL、risk lane 和 authority boundary。lease 是 launch / audit / receipt 边界，不是 prompt script、planner graph 或 AI reasoning policy；它让更强 executor 直接获得清晰工作台，同时保留 replay、review、rollback 和 owner route 下限。

`run/complete/workbench/optimize/evolve` 共享同一套 AHE read model 语义：App/workbench 可以展示“证据是什么、根因是什么、改什么、预期改善什么、下一轮如何证伪”，但只能消费 refs、blocker、risk route 和 promotion gate 状态。真实 domain owner receipt、domain truth、quality/export verdict、artifact body、memory body 和 high-risk default promotion 仍由对应 domain owner 或 owner/human gate 持有。

## RHO backend 与 Dynamic workflow template

RHO backend 的机器真相归 `contracts/opl-framework/agent-lab-contract.json#rho_backend_surface`。目标态不是外接 RHO CLI 的 apply runner，而是 `executable_no_apply_harness_backend`：`opl agent-lab rho run --project <target-agent-dir> --sessions <codex-sessions-dir> --output <rho-run-dir> --json` 可以真实执行候选生成 harness，输出 trajectory digest、diagnosis、candidate harness、self-preference score、winner、candidate diff、work-order draft、promotion evidence、no-forbidden-write 和 execution receipt refs。它的 readiness gate 是这些 required artifacts 全部可读，并且 `can_direct_apply`、`can_write_domain_truth`、`can_mutate_domain_artifact`、`can_write_owner_receipt`、`can_promote_default_agent_without_gate`、`can_define_runtime_substrate` 全部为 false。端到端验收只接受 CLI 产出完整 no-apply receipt，并把后续变更交给 `work_order_draft_ref -> opl work-order execute` 或 owner gate。

Agent Lab / Foundry Lab 的 dynamic workflow template 继续从 `contracts/opl-framework/agent-lab-contract.json#dynamic_workflow_runner_surface` 读取机器边界。目标态是 `executable_suite_topology_work_order_runner`：它把 `classify_and_act`、`fan_out_and_synthesize`、`adversarial_verification`、`generate_and_filter`、`tournament`、`loop_until_done`、`model_routing`、`worktree_isolation` 这些模式表达成可运行 suite topology / verifier / work-order 拓扑，并输出 `suite_topology_ref`、`verifier_ref`、`work_order_draft_ref`、`work_order_sequence_ref`、`runner_execution_receipt_ref` 和 `typed_blocker_ref_or_acceptance_ref`。

该机器面不是普通用户 workflow compiler，不编译任意业务流程，不替代 Runway、Temporal 或 family-runtime substrate，不执行非默认 executor，也不改变 stage/runtime lifecycle。它的 readiness gate 是 required artifacts 全部可读，并且 `can_compile_ordinary_user_workflow`、`can_define_runtime_substrate`、`can_execute_non_default_executor`、`can_write_domain_truth`、`can_authorize_quality_verdict`、`can_write_owner_receipt` 全部为 false。端到端验收只接受 runner 产出 work-order receipt 或 typed blocker；任何 template pass、variant selection、loop completion 或 worktree isolation proof 都不能升级成 domain ready、quality verdict、owner receipt、default executor promotion、production ready 或 runtime substrate readiness。

当前机器入口是 `src/agent-lab-rho-backend.ts`、`src/agent-lab-workflow-templates.ts`、`opl agent-lab rho run --project <dir> --sessions <codex-sessions-dir> --output <rho-run-dir> --json` 与 `opl agent-lab workflow-template run --template <id> --project <target-agent-dir> --output <workflow-run-dir> --json`。consumer 必须把它们当成 refs-only Foundry Lab executable backend / runner surface；禁止声明 RHO direct apply、target repo mutation、runtime substrate、ordinary workflow compiler、domain truth、quality verdict、owner receipt 或 default agent promotion。

## Agent Lab / OMA 自进化分工

Agent Lab 是 OPL Framework 的通用 eval / improvement control plane。它负责把 target agent 或 OMA 提交的 suite、stage attempt、provider receipt、domain-owned eval/proof refs 和 operator blocker 规整成 lab run、AHE evidence read model、variant comparison、mechanism candidate、risk review、promotion gate、rollback/canary 和 App/workbench read model。它判断“一个机制候选是否有足够 refs 进入下一轮证伪或 risk-tiered promotion gate”。

`opl-meta-agent` 是独立 OPL-compatible Foundry Agent；其标准自进化技能名固定为 `opl-meta-agent:oma-agent-evolution`。它消费 Agent Lab 的 suite result / evidence read model / blocker / promotion route，把目标 agent 的 blocked evidence、owner route、allowed editable surfaces、verification refs 和 no-forbidden-write refs 转成 developer patch work order、target capability candidate、mechanism patch proposal 或 typed blocker。它判断“目标 agent 应该如何生成可执行修复任务、由谁改、改哪些文件、跑哪些验证、如何回填 owner receipt”。这个优化策略和 patch planning 统一归 OMA，不下沉给 MAS/MAG/RCA 等 target agent 自己的 skill。

目标 domain agent 继续持有 domain truth、quality verdict、artifact authority、memory body 与 owner receipt。自进化闭环只能按 `target handoff -> Agent Lab evidence/gate -> OMA work order/proposal -> allowed patch -> target verification -> owner receipt -> Agent Lab re-evaluation` 流转；任何 suite pass、variant winner、work order、proposal、generated surface proof 或 App projection 都不能直接写成 domain ready、artifact readiness、quality verdict 或 default agent promotion。

OMA 提交的 Foundry Lab evaluation work order 使用独立入口 `opl agent-lab evaluation-work-order execute --work-order <work-order.json> [--observations <observation-packet.json>] --output <dir>`，不复用 source-patch `opl work-order execute`。可执行 work order 必须读为 `ready_for_opl_foundry_lab_evaluation`，并把 `consumer_dependency.status=available` 和 canonical action ref 写入机器面。`evaluation_request.sha256` 必须是 `evaluation_request.ref` 所指文件 raw bytes 的 64 位 lowercase hex SHA-256；consumer 先读 raw bytes并核对 digest，之后才允许 JSON parse、request validation 和 suite-plan compilation，mismatch 时不得创建 output、result 或 ledger。canonical `work_order_id` 同时绑定 request digest、request/suite/task identity、target identity 与 canonical provenance refs；相同 ID 但 request bytes 漂移的 work order 必须 fail closed，不提供旧 work-order 兼容。评估 owner 固定为 `one-person-lab/OPL Foundry Lab`，`target_owner_closeout_owner` 固定为 target-domain role；work order 的 `domain_id`、`target_agent_ref` 与 `descriptor_ref` 是 target identity 真相，suite 顶层字段（若声明）、每个 task、packet 与 task observation 必须精确绑定。consumer 把该结构投影为 optional `evaluation_target_agent`，仅 evaluation suite 进入 compiled suite、suite result readback 与稳定身份；普通 suite 不投影该字段，也不改变既有 result ID。OMA takeover/baseline request 的 task owner 可以是 `opl-meta-agent`，consumer 不得把 task domain 强改成 target domain。request 只声明 domain-owned intent refs；`recovery_probe_specs`、`trajectory_plan`、`scorecard_spec`、`improvement_candidate_seed`、`promotion_gate_request` 由 OPL 编译，production request 另可声明 `production_evidence_gate_ids` 作为 identity spec；未知 `allowed_change_scope` 直接按 contract shape invalid 拒绝。OPL canonical required observations 不能被 request 收窄，request 内 production gate refs 也不算 observation。没有 observation packet 时，consumer 只写绑定 target identity 的 OPL platform blocker、execution receipt 和 blocked evaluation result，不物化标准 `opl_agent_lab_suite_result`，也不创建 target typed blocker 或 owner receipt。只有 packet 完整绑定 identity、probe、trajectory、domain-owned scorecard、promotion gate 与 stage completion policy，并为 evaluator、scorecard owner、policy owner提供对应 receipt ref 后，OPL 才编译标准 suite并调用现有 Agent Lab runner；任一 authority boundary 内出现未知 `true` capability 时在执行前 fail closed，输出只物化 OPL canonical false authority boundary。

evaluation receipt 必须把即时结果与后置结果分开：packet、probe、trajectory、scorecard、promotion、stage policy 与 production gate 的原始 receipt refs 汇总为 `evaluation_provenance_refs`，同时用 `evaluation_provenance_bindings` 保留 receipt role、task 与 probe 绑定；raw refs 继续进入 suite result refs 和 execution receipt source refs，binding 进入 suite result 与 execution receipt 稳定身份，不得把合成 identity token 冒充原始 ref。公开 `runAgentLabSuite` 与 `agent-lab run --suite` 在任何执行前统一校验：非空 refs/bindings 必须成对、绑定合法 canonical role 与非空 context、raw ref 集合必须等于 binding receipt ref 集合，且 provenance 必须绑定 shape 完整的 `evaluation_target_agent`；通过校验后 raw refs 按 trim、去重、字典序排序，bindings 按完整 role/task/probe/ref tuple 去重后排序，再进入 result ID 与 readback，保证仅输入数组顺序、重复 raw ref 或重复完整 binding 不同的同义 suite 保持稳定身份；同 receipt 的不同 role/task/probe 绑定不合并。合法 target-only suite 允许运行并进入 identity。普通 sample、longline、external suite 没有 evaluation provenance/target 时不投影空字段，也不改变既有 result identity。suite result ref、execution receipt ref、suite task 中显式声明的 improvement candidate refs 与已评估 promotion gate refs属于 immediate outputs；work order 的通用 `candidate_refs` 只作为输入读回，mechanism candidate 留在 downstream pending，不能伪装成 improvement result 或 mechanism proposal。domain scorecard、promotion、recovery 或 stage policy 的 blocked outcome 只保留 blocked suite result 和 target-owner pending reason，不创建 OPL platform blocker或 target blocker；只有 observation 或 consumer platform 缺口才能创建 platform blocker。mechanism proposal、scaleout ledger 与 target owner receipt-or-typed-blocker 属于 downstream conditional outputs。缺少后置结果时保留 pending reason，不得用 candidate ref、gate request、platform blocker 或 suite pass伪造 mechanism ledger、scaleout receipt、target owner answer、domain truth、quality/export verdict或 default agent promotion。`--output` 可以指向新目录或不含 evaluation artifacts 的现有目录；发现既有 suite、suite result、execution receipt 或 platform blocker时必须 fail closed，避免本轮 blocked/passed 返回与旧 evidence 并存。

可执行 developer work order 的运行 primitive 归 OPL Framework。唯一 active CLI 是 `opl work-order execute --work-order <developer-patch-work-order.json>`；Agent Lab self-evolution / external-suite 只消费该 primitive 的 execution receipt 与 re-evaluation refs。旧 `opl agent-lab execute-work-order` 兼容 alias 已退役，不能作为 active interface、兼容入口或测试保护面复活。该 primitive 会校验 OMA work order、Codex CLI executor lease、target checkout cleanliness 与 `.worktrees` ignore policy，然后由 OPL 在目标仓打开临时 worktree，调用 Codex CLI 执行 source patch，运行显式和推导出的 verification command，提交 patch commit，fast-forward 吸收到目标 base branch，最后清理临时 worktree / branch并写 refs-only execution receipt。每次执行都会物化 OPL-owned `execution-plan.md` 与 `execution-report.md`，并在 execution receipt 中写入 `execution_plan_ref` / `execution_report_ref`；plan/report 覆盖目标 worktree、branch/base、允许编辑范围、verification commands、changed files、verification result、absorption、cleanup，以及 typed blocker / owner hook closeout 状态。`--dry-run` 是 no-write 计划入口：校验同一 work order guard、target repo 和 verification plan，写 execution plan / dry-run receipt，但不打开 target worktree、不启动 Codex、不吸收 patch。失败时 OPL 必须 fail-closed、写 failure cleanup receipt、保留 failure execution report ref，并强制清理自己打开的 target worktree / branch。

这条 primitive 是执行器和 target worktree lifecycle owner，不是 Agent Lab 私有 runner，也不是 domain authority owner。它只能执行 OMA work order 允许的 target source/test/docs patch，并输出 target verification、patch absorption、cleanup、no-forbidden-write 和 target owner receipt-or-typed-blocker refs；它不能写目标 domain truth、visual truth、artifact body、memory body、quality/export verdict 或 owner receipt，也不能把 Agent Lab re-evaluation score 写成目标 quality verdict。Agent Lab 只消费该 primitive 的 execution receipt 和 re-evaluation refs；OMA 侧只能生成 work order 或薄委托到该 OPL primitive，不拥有 generic runner、queue、target worktree lifecycle、absorption 或 cleanup。

当 developer work order 声明 `target_owner_closeout_hook` 时，`execute-work-order` 会在 source patch 已提交、fast-forward 吸收、临时 worktree/branch 已清理并完成 Agent Lab re-evaluation 后，把 execution receipt draft 作为 JSON stdin 交给目标仓声明的 owner closeout command。该 hook 的输出必须符合 target domain owner contract 的 refs-only return shape：`domain_receipt`、`typed_blocker` 或 `no_regression_evidence`，且必须显式声明不写 visual truth、artifact body、memory body，也不授权 quality/export verdict。OPL 只执行目标 owner 声明的 hook 并把返回值嵌入 `target_owner_receipt_or_typed_blocker`；若 hook 缺失、失败或输出不合约，OPL 继续写 typed blocker。该能力把“owner receipt 缺失”从结构性 blocker 降为 target-domain action 的真实结果，但不改变 OPL/Agent Lab 不能签 owner receipt 的边界。

当前 OPL App/operator consumption 已接上该闭环的 refs-only closeout 端：OMA workbench projection 可以把 blocked suite、developer patch work order、patch traceability matrix、failure evidence、root cause、targeted fix、predicted impact、next-run falsification、target verification、runtime/read-model consumption、workspace environment proof、no-forbidden-write proof、target owner receipt or typed blocker、patch absorption、worktree cleanup 和 Agent Lab re-evaluation 作为机器 refs 展示给 operator。App 只提供 drilldown 与审计，不接管 OMA work order 生成、不执行 target patch、不签 target owner receipt，也不改变 Agent Lab risk gate。App 不能把这些 refs 升级成 domain quality verdict、artifact readiness、memory apply 或高风险 default agent promotion。

`runtime app-operator-drilldown` 的 OMA section 还投影 `self_evolution_cockpit`：它把每个 target closeout 按“证据、根因、修复、预期改善、下一轮证伪、owner receipt/typed blocker”六问规整成 operator read model。该 cockpit 是 refs-only evidence cockpit，不是执行器、不是 work order materializer、不是 reviewer verdict，也不能把六问齐全写成 domain ready 或 default promotion。

## Developer Mode 与外围巡检

`OPL Developer Mode` 开启时，Agent Lab 是外围 AI 巡检、问题归因和改进候选的优先承载面。Developer Mode 的系统配置由 OPL state 持有，App 设置页应暴露开关和当前模式；安装流程可以在检测到配置的 GitHub developer login 时默认开启，但用户必须能手动切换。

Developer Mode 下的 Agent Lab 巡检可以默认随任务启动，读取 framework runtime evidence、descriptor、stage attempt refs、provider receipt、repo test evidence、operator blocker 和 domain-owned proof refs，并输出：

- issue / blocker；
- owner route；
- candidate fix ref；
- risk tier；
- independent AI reviewer evidence ref；
- repo worktree / branch ref；
- pull request ref；
- acceptance evidence ref；
- mechanism version / canary / rollback refs；
- follow-up queue item。

当 authenticated GitHub identity 对目标 repo 具备 developer / collaborator 写权限时，Developer Mode 可以把低风险和中风险 Agent Lab candidate 路由到受控 repo 修复、测试、canary 和 rollback-capable promotion 路径；没有直接写权限时，只允许生成 fork / branch / pull request。Developer 身份按目标 repo 计算，不是全局布尔值：OPL maintainer 只在其 GitHub permission 覆盖的 OPL/agent repo 上 direct-fix，target-agent developer 只在自己 agent repo 上 direct-fix，普通 contributor 手动开启 Developer Mode 也不能获得 upstream direct mutation，只能走 refs-only feedback capture、work-order candidate、fork/PR 或 owner handoff。当前动态 route builder 会读取 Developer Mode projection、repo permission 和 patrol observation refs，并输出 `blocked`、`observe-only`、`direct-fix`、`fork-PR` 或 `mixed`。closeout refs 必须包含 `developer_mode_projection_ref`、`route_eligibility`、`patrol_observation_ref`、`diff_ref`、`verification_refs`、`no_forbidden_write_ref`，并按 direct-fix / fork-PR 路径补 `commit_ref` 或 `fork_repo_ref` / `pr_review_ref`；direct-fix 的 `owner_acceptance_ref` 必须是外部 owner ref，fork/PR 的 `owner_acceptance_ref` 必须绑定 GitHub PR owner acceptance ref。若本轮没有真实外部 PR 权限，non-owner fork/PR 只能用 repo contract fixture ref 表达 drill 覆盖，并显式标记为 `repo_contract_fixture_not_owner_receipt`，且不能关闭 owner acceptance。Developer Mode closeout ledger 的 fork-PR intake 会拒绝 fixture / repo-contract drill refs，也会拒绝没有可解析 GitHub repo / pull request URL 的弱 typed ref 或弱 owner acceptance ref；App/operator payload workorder 也会把 fork-PR success path 标为必须提交 URL-backed GitHub fork repo ref、URL-backed GitHub pull request ref 与 GitHub PR-backed owner acceptance ref。只有这些 live GitHub fork / PR refs 和 PR-backed owner acceptance ref 才能被记录为 fork-PR closeout receipt。高风险 surface 必须进入 owner/human gate。所有路径都必须保留 evidence、diff、验证命令和 owner-visible closeout；不得静默修改 managed runtime、domain truth、artifact、memory body、quality verdict、credential/network/write policy 或 owner receipt。

`developer_mode_repair_routes.live_closeout_evidence` 是 Developer Mode / Agent Lab repair closeout 的 refs-only 读模型。它只消费显式 domain-owned evaluation manifest 中的 closeout drill 和 verified Developer Mode closeout ledger receipt；未声明 manifest 时不注入静态 MAS/RCA drill。每条 drill 只表达 `route_eligibility`、patrol observation、diff、focused verification、no-forbidden-write、commit 或 fork/PR、external owner acceptance 或 repo contract fixture refs；OPL 不把这些 refs 升级成 owner receipt，也不把 route closeout 写成 managed runtime truth 或 domain truth。缺少外部 owner acceptance ref，或 fork/PR owner acceptance ref 未绑定 GitHub PR 时，closeout 只能停在 evidence incomplete、owner gate route 或明确的 repo fixture drill，不得由 OPL 伪造 owner acceptance。机器面必须同时暴露 `closeout_claim_status` 与 `owner_acceptance_status`，让显式 repo fixture drill 固定读成 `fixture_drill_owner_acceptance_open` / `fixture_drill_not_owner_acceptance`，不能被 consumer 当成 external owner closeout。`live_external_owner_acceptance_count` 只统计 verified Developer Mode closeout ledger 中的 live external owner refs；`external_owner_acceptance_missing_count` 只统计 live / non-fixture route 缺口，显式 repo-contract fixture drill 的负向守门进入 `fixture_drill_external_owner_acceptance_missing_count` 与 `fixture_drill_owner_acceptance_open_count`。

同一 read model 现在还投影 `scaleout_followthrough`。base direct-fix 与 fork-PR verified receipt 都出现前，它读为 `waiting_for_base_live_route_closeout_refs`；base route ready 后，它按 `route_repetition_refs`、`risk_tier_auto_promotion_refs` 和 `app_patrol_mount_refs` 三类 follow-through 计算 open gate。`route_repetition_refs` 可以来自 verified ledger payload，也可以由 Agent Lab 从多个 verified live ledger closeout receipts 的 target repo 或 patrol observation 覆盖派生为 body-free `developer-mode-route-repetition-ref:*`；App patrol mounting 必须由显式 verified ledger ref 或同等 typed blocker 关闭；risk-tier auto-promotion 必须先通过 `opl agent-lab risk-tier-promotion record|verify` 写入独立 Agent Lab ledger，再把已 verified 的 receipt ref 放入 Developer Mode `risk_tier_auto_promotion_refs`。该 Agent Lab receipt 需要证明真实 failure/evidence delta、独立 AI review、rollback target、canary observation 和 no-forbidden-write boundary；recorded/unverified receipt、fixture、scorecard pass、provider completion、单独 rollback/canary ref 或占位字符串都不能关闭 gate。App/operator attention 与 framework readiness 会把缺失的 scaleout refs 作为 record guidance，而不是把 base route closeout 误写成 Developer Mode global closeout。scaleout refs 的含义分别是重复 direct-fix 或 fork-PR closeout 的 route repetition、verified Agent Lab risk-tier promotion receipt，以及 App/default caller 可见的 patrol mounting refs；它们都是 follow-through evidence，不是 owner receipt、release-ready verdict、domain-ready verdict 或 production-ready verdict。

## 输入与输出

允许输入：

- `opl agents descriptors`、`opl stages`、`opl actions`、`opl domain-memory` 的只读 read model；
- `stage_attempt_ledger`、`stage_attempt_workbench`、`runtime snapshot`、provider receipt 与 closeout packet refs；
- domain-owned eval/proof refs，例如 MAS publication eval、MAG grant-stage proof、RCA visual no-regression evidence；
- App/workbench operator action refs、human gate refs、dead-letter / retry / blocker refs；
- regression、soak、fixture、parity、direct-skill equivalence 和 no-forbidden-write evidence。
- Developer Mode scaleout follow-through refs：显式或派生 `route_repetition_refs`、已 verified 的 Agent Lab `risk_tier_auto_promotion_refs` receipt 与 `app_patrol_mount_refs`。
- usage logs、failed route refs、research wiki refs、experiment / analysis queue manifest refs。
- token / cost estimation refs：model profile refs、pricing schedule refs、task shape refs、artifact plan refs、provider routing refs、historical usage summary refs 和 estimate policy refs。
- efficiency non-regression refs：`duration_refs`、`cost_refs`、`cache_hit_refs`、`reuse_scope_refs`、`quality_floor_refs`、`no_forbidden_write_refs` 与 `owner_route_refs`。
- MAS suite 投影的 typed body-free mechanism evolution refs：`runtime_event_ledger_refs`、`provider_switch_hygiene_refs`、`claim_assurance_map_refs`，以及对应的 `runtime_event_ledger`、`provider_switch_hygiene`、`claim_assurance_map` 只读 refs surface。
- AHE-style change/evidence refs：`change_evaluation_refs`、`failure_evidence_refs`、`root_cause_refs`、`targeted_fix_refs`、`predicted_impact_refs`、`risk_task_refs`、`next_run_falsification_refs` 与 `variant_candidate_refs`。

允许输出：

- `agent_lab_eval_run`：一次评估运行的目标、输入 refs、执行环境、rubric 和结果摘要；
- `agent_lab_improvement_candidate`：需要改进的 framework 或 domain owner 路由项；
- `agent_lab_mechanism_read_model`：一等机制对象，包含 mechanism ref/version、可编辑 surface refs、meta edit receipt、evolution segment、evidence delta 和 next mechanism candidate；
- `agent_lab_evolution_result`：外部 suite 驱动的一段 mechanism evolution envelope，只输出 refs-only candidate 与证据 delta；
- `agent_lab_acceptance_evidence`：验收证据 refs、通过/阻断原因和后续 gate；
- `agent_lab_risk_review`：风险分级、独立 AI reviewer 直接证据审查和 high-risk owner gate route；
- `agent_lab_version_ledger_entry`：机制版本、promotion decision、canary refs 和 rollback refs；
- `agent_lab_token_cost_estimate`：基于 refs 的 token、image unit 与成本估算结果，包含 scenario ref、model/profile refs、pricing schedule ref、assumption refs、estimate range、confidence band、staleness policy 和 non-billing boundary；
- `agent_lab_stage_executor_policy`：基于 refs 的 stage executor policy candidate、比较假设、必需测试 refs、trial recommendation 与 typed blocker；可用于为某类 stage 评估更合适的 executor/model/reasoning effort，但不执行非默认 adapter、不改变默认 executor、不声明质量等价；
- `opl_agent_lab_rho_backend_plan`：RHO executable no-apply harness backend 的 refs-only 结果面，输出 trajectory digest、diagnosis、candidate harness、self-preference score、winner、candidate diff、work-order draft、promotion evidence、no-forbidden-write 和 execution receipt refs；它不调用外部 RHO apply path、不写 target repo、不直接 apply、不签 owner receipt、不持有 domain truth，也不能提升 default agent。
- `opl_agent_lab_dynamic_workflow_runner`：Foundry Lab suite topology / verifier / work-order runner 的 refs-only 结果面，输出 suite topology、verifier、work-order draft、work-order sequence、runner execution receipt 与 typed blocker-or-acceptance refs；它不是普通 workflow compiler、runtime substrate 或非默认 executor launcher。
- `opl_agent_lab_efficiency_nonregression_read_model`：通用效率非回归 read model，汇总 duration / cost / cache hit / reuse scope / quality floor / no-forbidden-write / owner route refs，并输出 ready/blocked 状态；
- `agent_lab_projection`：给 CLI/App/workbench 的 read-only 改进看板；
- `agent_lab_follow_up_queue_item`：进入 OPL stage-attempt request/projection 或 domain owner backlog 的后续动作引用。
- `opl_agent_lab_ahe_evidence_read_model`：把 evidence、root cause、targeted fix、predicted impact 和 next-run falsification refs 规整成 per-task read model、summary 和 typed blocker。
- `opl_agent_lab_variant_comparison_read_model`：把 best-of-N variant candidate refs 规整成 winner/loser、per-variant evidence delta、predicted flip/risk refs、regression count 和 promotion eligibility。

禁止输出：

- domain truth mutation；
- domain quality verdict；
- artifact mutation；
- memory body write；
- memory accept / reject decision；
- credential / network / write policy mutation；
- receipt instance 伪造；
- provider billing claim；
- final payable amount；
- default executor promotion；
- 对 MAS/MAG/RCA 交付物的最终通过判断。

机制演化输入的 MAS typed surface 必须保持 refs-only：允许进入 `agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs`、log-driven candidate source refs、optimizer candidate source refs、evidence delta 和 next mechanism candidate source refs；禁止把 runtime event ledger body、provider receipt body、executor transcript body、claim text body、domain truth、artifact body、owner receipt body、publication verdict、quality verdict 或 memory writeback accept/reject decision 写入 OPL Agent Lab。

## 与现有控制面的关系

Agent Lab 建在现有 OPL Framework control plane 之上：

- 依赖 `Unified Domain-Agent Descriptor` 做 domain entry、stage、action、memory、skill、runtime/session/progress/artifact refs 的统一发现；
- 依赖 `Family Stage Control Plane` 做 stage descriptor、handoff、evaluation refs 和 authority boundary 的读取；
- 依赖 `Family Action Catalog` 做 callable action metadata 与 owner route；
- 依赖 `family-runtime` stage attempt ledger、typed closeout、risk gate、owner/human gate、retry/dead-letter 和 provider receipt 做运行证据；
- 依赖 App/workbench projection 展示 operator-facing 改进状态。

它不替代这些 surface，也不新建平行 runtime。Agent Lab 只把 eval / improvement 的组织语言收敛到 OPL 内部，避免 MAS/MAG/RCA 各自重复实现一套跨域评估控制面。

## 机器入口读法

Agent Lab 的当前可运行面从机器入口读取，本文不复制实时输出：

| 读取面 | 稳定职责 | 当前机器入口 |
| --- | --- | --- |
| Contract / authority | 定义 Agent Lab input/output refs、suite result、Developer Mode route、risk-tier promotion、forbidden authority flags 和 refs-only 边界。 | `contracts/opl-framework/agent-lab-contract.json`、`src/modules/foundry-lab/agent-lab-authority.ts`、`tests/src/agent-lab-developer-mode-contract.test.ts`。 |
| Suite / read model | 组织 sample、longline、external suite、production evidence suite、complete/workbench read model、ref summary 和 authority boundary。 | `package.json` exports、`src/modules/foundry-lab/agent-lab.ts`、`src/modules/foundry-lab/agent-lab-complete.ts`、`src/modules/foundry-lab/agent-lab-longline.ts`、`opl agent-lab sample|longline|run|complete|workbench --json`。 |
| Mechanism evolution | 投影 mechanism、AHE evidence、variant comparison、log-driven candidate、risk review、version ledger、rollback/canary 和 promotion gate。 | `src/modules/foundry-lab/agent-lab-promotion.ts`、`src/modules/foundry-lab/agent-lab-control-read-models.ts`、`src/modules/foundry-lab/agent-lab-ahe-evidence.ts`、`src/modules/foundry-lab/agent-lab-variant-comparison.ts`、`opl agent-lab mechanism|optimize|evolve --json`。 |
| RHO backend | 执行 RHO no-apply harness backend，投影候选生成、no-forbidden-write、execution receipt、candidate diff 与 work-order draft refs；只用于后续 OMA/work-order/risk gate 消费，不执行 apply、不成为 runtime substrate 或 truth source。 | `contracts/opl-framework/agent-lab-contract.json#rho_backend_surface`、`src/modules/foundry-lab/agent-lab-rho-backend.ts`、`tests/src/cli/cases/agent-lab.test.ts`、`tests/src/agent-lab-rho-workflow-contract.test.ts`、`opl agent-lab rho run --project <dir> --sessions <codex-sessions-dir> --output <rho-run-dir> --json`。 |
| Dynamic workflow runner | 执行 Foundry Lab suite topology / verifier / work-order runner，投影 topology、verifier、work-order sequence、runner receipt 和 typed blocker-or-acceptance refs；不作为普通用户 workflow compiler、非默认 executor launcher 或 runtime substrate。 | `contracts/opl-framework/agent-lab-contract.json#dynamic_workflow_runner_surface`、`src/modules/foundry-lab/agent-lab-workflow-templates.ts`、`tests/src/agent-lab-rho-workflow-contract.test.ts`、`opl agent-lab workflow-template run --template <id> --project <target-agent-dir> --output <workflow-run-dir> --json`。 |
| Developer Mode / repair route | 投影 direct-fix、fork/PR、owner acceptance、scaleout follow-through、risk-tier promotion receipt 和 App/operator drilldown refs。 | `src/modules/foundry-lab/agent-lab-developer-mode.ts`、`src/modules/console/runtime-tray-app-operator-drilldown.ts`、`opl app state --profile fast|full --json`、`opl runtime app-operator-drilldown --json`、`opl agent-lab risk-tier-promotion record|verify|list --json`。 |
| Work-order primitive | 执行 OMA developer patch work order，拥有 target worktree lifecycle、Codex execution、verification、absorption、cleanup、OPL-owned execution plan/report artifact 和 refs-only receipt；`--dry-run` 只写 no-write execution plan / receipt；旧 `opl agent-lab execute-work-order` alias 已退役。 | `src/modules/foundry-lab/agent-lab-work-order-execution.ts`、`tests/src/cli/cases/work-order-execution.test.ts`、`opl work-order execute --work-order <developer-patch-work-order.json> [--dry-run] --json`。 |
| Efficiency / cost / executor policy | 投影效率非回归、token/cost estimate、executor capability lease 和 stage executor policy；只支持预算、比较、trial design 与 refs-only readiness。 | `src/modules/foundry-lab/agent-lab-efficiency-nonregression.ts`、`src/modules/foundry-lab/agent-lab-token-cost-estimate.ts`、`src/modules/foundry-lab/agent-lab-executor-capability-aperture.ts`、`src/modules/foundry-lab/agent-lab-stage-executor-policy.ts`、`opl agent-lab efficiency|stage-executor-policy --json`。 |
| Optional connector export | 输出 Inspect AI / OpenInference / Langfuse / Phoenix / JSON connector-shaped refs-only envelope；core 不依赖这些外部 runtime。 | `src/modules/foundry-lab/agent-lab-complete.ts`、`opl agent-lab export --target <inspect-ai|openinference|langfuse|phoenix|json> --json`。 |

`opl agent-lab longline --json` 可作为 framework-level longline orchestration / recovery / no-forbidden-write regression guard 的读面。suite `passed`、workbench consumption ready、efficiency ready、scorecard pass、generated receipt、fixture receipt、provider completion 或 no-current-failure 只能说明对应 OPL refs-only control-plane item 可读；它们不能升级成 MAS/MAG/RCA 的 publication、fundability、visual quality、artifact/export readiness、domain ready、production ready 或 App release ready。

当前 domain production evidence、Developer Mode closeout、risk-tier promotion、App/workbench source refs 和 worklist/counter 都是动态读数。需要判断是否已关闭某个 gate 时，先跑 fresh CLI/read-model，再看对应 ledger receipt 是否 verified，不能从本文或历史 tranche 的状态词继承。

## Longline 测试归属

| Domain | OPL 承接的长线面 | Domain 仍保留的 authority |
| --- | --- | --- |
| `med-autoscience` | provider-hosted guarded apply soak orchestration；resume/retry/dead-letter recovery probe；no-forbidden-write cross-domain regression | publication-quality scorer；owner receipt fixture；paper artifact authority checks |
| `med-autogrant` | controlled grant-stage soak orchestration；receipt reconciliation projection；no-forbidden-write cross-domain regression | fundability scorer；grant owner receipt fixture；proposal artifact authority checks |
| `redcube-ai` | controlled visual-stage soak orchestration；hosted-attempt reconciliation projection；no-forbidden-write cross-domain regression | visual quality scorer；render/export owner receipt fixture；artifact authority checks |

## 各仓测试收敛规则

Agent Lab 的价值是把各仓重复维护的 framework-level 长线测试收敛到 OPL，并让 domain repo 的测试回到领域 authority 本身。

应迁入 OPL Agent Lab 的测试：

- provider-hosted long soak / controlled soak 编排；
- interruption resume、retry、dead-letter repair、owner/human gate resume、artifact restore 这类恢复探针；
- OPL stage-attempt request/projection / stage attempt / provider receipt / hosted-attempt reconciliation 投影；
- cross-domain no-forbidden-write、no-memory-body、no-artifact-mutation regression；
- improvement candidate、risk review、version ledger、canary / rollback 与 promotion gate 的 refs-only projection。

应继续留在 domain repo 的测试：

- MAS publication / review / study truth scorer；
- MAG fundability / grant strategy scorer；
- RCA visual quality / render-export scorer；
- domain owner receipt fixture、typed blocker fixture 和 owner-signed transition spec；
- artifact package / export / submission authority；
- memory body apply、writeback accept/reject 和 domain truth mutation。

因此，各仓可以删除或降级自己维护的 OPL-hosted soak 编排重复测试，但不能删除 domain-owned scorer、receipt、artifact authority、truth mutation 和 quality gate 测试。

## 后续工作读法

后续 Agent Lab 增量应回到 [OPL Family 当前状态与理想目标差距](../active/current-state-vs-ideal-gap.md)、`contracts/`、source、tests 和 fresh CLI/read-model，不在本文追加执行流水。稳定方向是：

- 可选 Inspect AI runner、Langfuse/Phoenix export connector 只消费 `opl agent-lab export --target ... --json` envelope，不成为 OPL core runtime truth。
- 真实长时 domain owner chain 产生新 owner receipt refs 时，只更新 Agent Lab 输入 refs 和 domain-owned proof refs，不复制 receipt body。
- Optimizer / RL 只生成 candidate config、candidate branch、transition refs 和 risk-classified promotion refs；低/中风险仍受真实 failure/evidence delta、independent AI review、promotion receipt、rollback、no-forbidden-write 和 canary 约束，高风险只路由 owner/human gate。
- `opl-meta-agent` 是独立 OPL-compatible Foundry Agent repo；它消费本控制面，不作为 OPL Framework 内置命令或合同 surface。

Agent Lab 与 App Console / Atlas / Ledger 的默认连接也必须保持 thin：Agent Lab 可以消费 blocked attempt、artifact/receipt/audit refs、usage/failure refs、helper drift refs、AHE evidence refs 和 OMA work-order refs；默认输出只能是 improvement candidate、risk route、work-order status、promotion gate refs、target owner receipt / typed blocker ref 或 follow-up queue item。它不能把 suite pass、variant winner、efficiency ready、risk-tier receipt recorded、App drilldown visible 或 generated review receipt 写成 domain ready、artifact/export readiness、default executor promotion、App release ready 或 production ready。

如果 Agent Lab 发现需要新增 App Console、runtime read model、generated surface 或 policy surface，先过 surface budget：默认只允许 fold 成 `current_owner_delta`、hard gate、owner answer、typed blocker、route-back 或 explicit drilldown ref 的最小 surface；其余保持 diagnostic / audit / cleanup / production-evidence lane。当前迁移顺序仍回 active gap owner，不在本文维护第二路线图。
