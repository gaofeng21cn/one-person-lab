# OPL Agent Lab 控制面边界

Status: `active_runtime_support`
Owner: `One Person Lab`
Purpose: `agent_eval_improvement_control_plane`
State: `active_support`
Machine boundary: 本文是人读 runtime 支撑说明。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、domain-owned eval/proof surface 和语义化 `human_doc:*` id。

## 定位

`OPL Agent Lab` 是 OPL Framework 内部统一的 eval / improvement / evolution harness control plane。它面向 framework 维护者、operator 和 App/workbench read model，统一组织跨 domain agent 的能力评估、回归观察、机制自动进化、实验证据和 follow-up 任务。

它属于 OPL runtime / control plane，不是新的 domain agent、不是新的 product truth store，也不是 MAS/MAG/RCA 之上的质量裁判。

它的默认目标是全自动机制进化：常态路径应由独立 AI reviewer、风险分级、evidence/no-forbidden-write gate、version ledger、canary 和 rollback 共同约束。人工审核不是常态 gate，只在高风险 owner authority surface 或明确 owner/human policy 要求时介入。

核心职责是：

- 聚合 OPL 可见的 framework runtime evidence、stage attempt refs、provider receipt、descriptor parity、operator blocker 和 domain-owned eval/proof refs。
- 把跨 domain 的评估问题转成可审计的 lab run、risk-classified improvement、acceptance evidence、version ledger entry、canary / rollback refs 和 follow-up queue item。
- 为 App/workbench 提供可读的改进看板、回归风险、验证状态和下一步动作。
- 维护 framework-level 问题归因：runtime/provider/executor/control-plane 问题归 OPL；domain truth、quality gate、artifact authority 问题回 domain owner。
- 把 `mechanism` 作为一等对象表达：只记录 mechanism ref、version、editable surface refs、meta edit receipt ref、evolution segment ref、evidence delta ref 和 next mechanism candidate ref。
- 把机制演化从 candidate-only 语义提升为 promotion control plane：低风险机制改动可自动推广；中风险机制改动经独立 AI reviewer 批准、测试通过和 canary 正常后自动推广；高风险改动只路由到 owner/human gate。

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

Developer Mode 是 OPL App / system settings 的产品开关，不是 Agent Lab 的新底层 contract。当前 `opl system` 与 `opl system initialize` 已暴露 `developer_mode` surface，复用既有 `developer_supervisor` system action，让 App 设置页能读取当前配置、GitHub identity 状态、repo authority 汇总、repair route、settings endpoint、system action endpoint、request fields 和 payload template。

这个 surface 说明“用户是否允许 OPL 暴露受监督的开发者检查与修复路由”，并以 fail-closed 方式投影当前 GitHub 身份、repo 权限和 direct-fix / fork-PR / mixed / observe-only 路由。它不代表真实 owner repo 直接修复提交、non-owner fork PR 或 Agent Lab 外围 AI 巡检 closeout 已经完成；这些仍必须由对应 repo worktree、branch、PR、verification 和 evidence refs 证明后再写入 Agent Lab / App read model。

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
- cross-domain comparison view；
- owner route refs；
- evidence refs、receipt refs、blocker refs 与 follow-up refs。

当 Agent Lab 展示 MAS/MAG/RCA 的质量、进度或交付状态时，只能引用 domain-owned eval/proof/receipt/artifact locator。它不能把 provider completion、harness pass、descriptor aligned、agent-lab score 或 OPL operator judgment 写成 domain ready verdict。

## 自动进化与风险分级

Agent Lab 的默认 promotion 语义是“自动机制进化，按风险分级阻断”。独立 AI reviewer、直接证据审查、测试证据、no-forbidden-write、version ledger、canary 和 rollback 是常态 gate；人工审核只属于高风险 owner gate 或显式 policy gate。

| 风险级别 | 典型 surface | 常态 gate | Promotion 语义 |
| --- | --- | --- | --- |
| 低风险 | prompt wording；rubric clarification；display/workbench/read model metadata；test/suite metadata | 独立 AI reviewer 直接证据审查；evidence/no-forbidden-write；version ledger；rollback ref | 可 auto-promote。 |
| 中风险 | stage policy；tool policy；retry/dead-letter policy；memory retrieval policy | 独立 AI reviewer approve；相关 tests pass；evidence/no-forbidden-write；version ledger；canary；rollback ref | canary 正常后自动推广。 |
| 高风险 | domain truth；publication/fundability/visual verdict；artifact mutation；memory accept/reject；credential/network/write policy | domain owner 或 human gate；owner receipt；禁止 OPL 单独推广 | OPL 只能生成 route、evidence 和 blocker refs，不能自动推广。 |

低风险和中风险路径不得退化成“生成候选后等人工挑选”。candidate 是自动进化 pipeline 的 typed input；promotion 失败时必须留下失败原因、evidence delta、rollback ref 和下一轮 follow-up item。高风险路径也不由 Agent Lab 判定业务质量，它只把 evidence、owner route 和阻断原因投影给对应 owner。

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

当 authenticated GitHub identity 对目标 repo 具备 developer / collaborator 写权限时，Developer Mode 可以把低风险和中风险 Agent Lab candidate 路由到受控 repo 修复、测试、canary 和 rollback-capable promotion 路径；没有直接写权限时，只允许生成 fork / branch / pull request。高风险 surface 必须进入 owner/human gate。所有路径都必须保留 evidence、diff、验证命令和 owner-visible closeout；不得静默修改 managed runtime、domain truth、artifact、memory body、quality verdict、credential/network/write policy 或 owner receipt。

## 输入与输出

允许输入：

- `opl agents descriptors`、`opl stages`、`opl actions`、`opl domain-memory` 的只读 read model；
- `stage_attempt_ledger`、`stage_attempt_workbench`、`runtime snapshot`、provider receipt 与 closeout packet refs；
- domain-owned eval/proof refs，例如 MAS publication eval、MAG grant-stage proof、RCA visual no-regression evidence；
- App/workbench operator action refs、human gate refs、dead-letter / retry / blocker refs；
- regression、soak、fixture、parity、direct-skill equivalence 和 no-forbidden-write evidence。
- usage logs、failed route refs、research wiki refs、experiment / analysis queue manifest refs。
- MAS suite 投影的 typed body-free mechanism evolution refs：`runtime_event_ledger_refs`、`provider_switch_hygiene_refs`、`claim_assurance_map_refs`，以及对应的 `runtime_event_ledger`、`provider_switch_hygiene`、`claim_assurance_map` 只读 refs surface。

允许输出：

- `agent_lab_eval_run`：一次评估运行的目标、输入 refs、执行环境、rubric 和结果摘要；
- `agent_lab_improvement_candidate`：需要改进的 framework 或 domain owner 路由项；
- `agent_lab_mechanism_read_model`：一等机制对象，包含 mechanism ref/version、可编辑 surface refs、meta edit receipt、evolution segment、evidence delta 和 next mechanism candidate；
- `agent_lab_evolution_result`：外部 suite 驱动的一段 mechanism evolution envelope，只输出 refs-only candidate 与证据 delta；
- `agent_lab_acceptance_evidence`：验收证据 refs、通过/阻断原因和后续 gate；
- `agent_lab_risk_review`：风险分级、独立 AI reviewer 直接证据审查和 high-risk owner gate route；
- `agent_lab_version_ledger_entry`：机制版本、promotion decision、canary refs 和 rollback refs；
- `agent_lab_projection`：给 CLI/App/workbench 的 read-only 改进看板；
- `agent_lab_follow_up_queue_item`：进入 OPL typed queue 或 domain owner backlog 的后续动作引用。

禁止输出：

- domain truth mutation；
- domain quality verdict；
- artifact mutation；
- memory body write；
- memory accept / reject decision；
- credential / network / write policy mutation；
- receipt instance 伪造；
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

## 已落地入口

当前 Agent Lab 已经从边界文档推进到可运行的 refs-only control plane：

- 机器合同：`contracts/opl-framework/agent-lab-contract.json`。
- TypeScript surface：`src/agent-lab.ts`，并通过 package export `./agent-lab` 暴露。
- CLI sample：`opl agent-lab sample --json`，输出 MAS/MAG/RCA 三个 fixture task 的 eval run、recovery probe、domain-owned scorecard refs、improvement candidate 和 promotion gate。
- CLI longline：`opl agent-lab longline --json`，输出 MAS/MAG/RCA 三个 provider-hosted longline task、七个 recovery probe、跨仓 no-forbidden-write gate 和 repo test reduction guidance。
- CLI complete：`opl agent-lab complete --json`，输出完整 Agent Lab control plane：OPL-native suite runner、Inspect AI optional adapter contract、METR task-standard reference、OpenInference/OpenTelemetry trace refs、Langfuse/Phoenix optional connector refs、optimizer loop 和 RL transition boundary。
- Integration contracts：`opl agent-lab complete/workbench/mechanism --json` 均暴露 `opl_agent_lab_integration_contract_read_model`，把 activation predicate、canonical entry、artifact verifier、failure policy、typed blocker、owner route、retry/dead-letter 和 rollback refs 固定为机器面。
- Review trace ledger：`opl agent-lab complete/workbench/mechanism/evolve --json` 暴露 `opl_agent_lab_review_trace_ledger`，记录 independent reviewer、web research、mechanism patch 的 request/response/evidence/diff/contract/test/reviewer/no-shared-context refs。
- Log-driven mechanism candidates：`opl agent-lab complete/workbench/mechanism/optimize/evolve --json` 暴露 `opl_agent_lab_log_driven_mechanism_candidate_read_model`，把 usage log、failure mode、user interrupt、convergence iteration、tool failure 和 blocker refs 转成 prompt / skill / rubric / workflow-default 候选。
- ARIS maturity controls：`opl agent-lab complete/workbench/mechanism/evolve --json` 暴露 `opl_agent_lab_aris_maturity_controls_read_model`，把 ARIS v0.4.11 的 effort/assurance 双轴、helper inventory/drift report、permission/current-date fail-closed invariant、MCP/stream reliability policy 吸收为 refs-only 控制面；该 surface 明确 `runtime_dependency_required=false`，不读取 helper、MCP 或 stream body。
- CLI external suite：`opl agent-lab run --suite <suite.json> --json`，运行 domain agent 或 OPL-compatible meta-agent 仓生成的 OPL-compatible Agent Lab suite JSON，返回同一套 refs-only suite result、ref summary 和 authority boundary。
- CLI workbench：`opl agent-lab workbench --json`，把 complete / sample / longline / run 语义规整成 App/workbench 可直接消费的 read model，包含 eval adapters、observability export readiness、optimizer candidates、promotion gates、online learning refs 和 authority boundary，并显式返回 `app_workbench_consumption_ready=true`。
- CLI mechanism：`opl agent-lab mechanism --json`，输出 first-class mechanism read model，包含 `mechanism_ref`、`mechanism_version`、`editable_surfaces`、`meta_edit_receipt`、`evolution_segment`、`evidence_delta` 和 `next_mechanism_candidate`。该入口严格 refs-only，不写 domain truth、memory body、artifact，不训练权重；promotion 由风险分级、独立 AI reviewer、version ledger、canary 和 rollback refs 约束。
- CLI export：`opl agent-lab export --target <inspect-ai|openinference|langfuse|phoenix|json> --json`，输出 connector 可消费的 refs-only export envelope。该命令只整理 refs 和 connector-shaped metadata，不上传外部服务，不读取 domain body。
- CLI optimize：`opl agent-lab optimize --suite <suite.json> --json`，运行外部 suite 后输出 risk-classified optimizer candidate set、review refs、version ledger refs 和 RL transition refs。该命令不训练或部署权重，不写 memory body，也不覆盖 domain owner verdict；低风险可 auto-promote，中风险经独立 AI approve、tests pass 和 canary 后自动推广，高风险只输出 owner/human gate route。
- CLI evolve：`opl agent-lab evolve --suite <suite.json> --json`，运行外部 suite 后输出 mechanism evolution segment、meta edit receipt、evidence delta 和 next mechanism candidate。candidate refs 会进入同一套风险分级 promotion pipeline；低风险和中风险不得退化成默认人工挑选，高风险不得由 OPL 自动推广。
- MAS typed mechanism inputs：`opl agent-lab run/optimize/evolve --suite <suite.json> --json` 会读取 suite 中 body-free 的 `runtime_event_ledger`、`provider_switch_hygiene` 和 `claim_assurance_map` refs surface，并把其中 refs 汇总进 mechanism evolution input refs、candidate source refs 和 evidence delta。该入口只接受 refs 与 typed metadata，不读取或写入 MAS body/truth/artifact/owner receipt。

`opl agent-lab longline --json` 是当前统一长线测试 read-model 入口。它可用于判断哪些“浸润/长线测试编排”已经能由 OPL 承接；它不能把 longline suite `passed` 升级成 MAS/MAG/RCA 的 publication、fundability、visual quality 或 export verdict。

2026-05-17 校准：MAS/MAG/RCA 已在各自 repo-native verification lane 中加入 Agent Lab longline migration guard。三仓本地测试现在会调用 `opl agent-lab longline --json`，断言 OPL 承接 framework-level longline orchestration / recovery / no-forbidden-write regression，同时断言 domain repo 继续保留 scorer、owner receipt fixture 与 artifact authority checks。该 guard 只证明测试责任已收敛到 OPL Agent Lab；它不声明真实 domain production soak、publication/fundability/visual verdict 或 artifact/export readiness 已完成。

`opl agent-lab complete --json` 是当前完整 Agent Lab 控制面入口。它说明核心 OPL 不强依赖 Inspect AI、Langfuse、Phoenix 或 RL 训练框架；这些外部系统通过 adapter / export / optimizer refs 接入。OPL core 持有稳定任务、轨迹、恢复、scorecard refs、candidate、promotion gate、integration contract、review trace 和 log-mined candidate 机器面；外部 eval runner、observability backend 或 optimizer 只能消费这些 refs，不能取得 domain authority。

`opl agent-lab run --suite <suite.json> --json` 是当前外部 suite 闭环入口。它允许 `opl-meta-agent` 这类独立 Foundry Agent 生成候选 agent 的 baseline suite，再交回 OPL Agent Lab 运行。该入口只读取 suite JSON 中的 refs、scorecard refs、recovery probes、trajectory refs、improvement candidate refs 和 promotion gates；它不会读取或写入 domain truth、memory body、artifact body 或 owner receipt body。suite passed 只能进入风险分级 promotion pipeline：低风险可 auto-promote，中风险需独立 AI approve、tests pass 和 canary，高风险必须 owner/human gate。

`opl agent-lab workbench --json` 是 App/workbench 机器面入口。它消费 OPL-native complete control plane、sample suite 和 longline suite 的 refs-only 结果，把 eval adapters、observability export readiness、optimizer candidates、integration contracts、review trace ledger、log-driven mechanism candidates、risk gates、version ledger、canary / rollback refs 和 online learning transition refs 聚合为一个 read model。App 可以据此展示候选、gate、promotion 状态和 connector readiness；App 不能把这些 refs 升级成 domain quality verdict、artifact readiness、memory apply 或高风险 default agent promotion。

`opl agent-lab mechanism --json` 是 mechanism 机器面入口。它把可编辑机制面限定在 stage policy、tool policy、prompt ref 和 rubric gap ref 这类 refs-only surface 上，并用 meta edit receipt 记录“可编辑机制对象已被识别”的事实。该 read model 同时暴露 integration contracts、review trace ledger 和 log-driven mechanism candidates，使机制候选来源、证据审查、失败策略和回滚目标能被 App/workbench 与 reviewer 重放。这个 receipt 不是 owner receipt，不接受或拒绝 memory writeback，也不授权 domain ready、quality verdict、artifact mutation 或 model training；是否推广由 risk tier、独立 AI reviewer、tests、canary 和 rollback refs 决定。

`opl agent-lab export --target ... --json` 是 optional connector 机器面入口。`inspect-ai` target 输出 task / solver / scorer / eval log refs；`openinference` target 输出 trace / trajectory / tool-call / stage-attempt refs；`langfuse` target 输出 dataset / run / scorecard refs；`phoenix` target 输出 experiment / trace / evaluator refs；`json` target 输出通用 suite result refs。所有 target 都返回 `upload_external_service=false` 和 `reads_domain_body=false`。

`opl agent-lab optimize --suite <suite.json> --json` 是 optimizer/RL 机器面入口。它先按 `run` 同一规则验证 suite，再输出 gated optimizer candidate set、log-driven mechanism candidates、risk review refs、version ledger refs 和 RL transition refs。candidate 可作为 candidate config、candidate branch 或 auto-promotion input 进入后续 gate；transition refs 只供下游 RL consumer 使用。OPL core 不在这里训练或部署模型权重；default agent promotion 必须遵循低/中/高风险分级。

`opl agent-lab evolve --suite <suite.json> --json` 是 evolution harness 机器面入口。它先按 `run` 同一规则验证 suite，再把 suite evidence 映射为 mechanism evolution segment、evidence delta、integration contract check、review trace ledger、log-mined candidate refs 和 next mechanism candidate。它输出的 `next_mechanism_candidate` 会进入 Agent Lab promotion control plane：低风险通过 reviewer/evidence/no-forbidden-write/version ledger 后可自动改写 framework mechanism version；中风险还需要 tests pass 与 canary 正常；高风险只能生成 owner/human route 和 blocker refs。

当前 complete control plane 的状态：

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| OPL-native suite runner | `landed` | `agent-lab sample/longline/complete` 可运行。 |
| Inspect AI adapter | `adapter_contract_ready_optional_runtime` | 映射 task / solver / scorer / eval log，不作为 core 依赖。 |
| METR task-standard reference | `task_standard_reference_ready` | 只吸收 portable task environment pattern。 |
| OpenInference / OpenTelemetry refs | `trace_ref_contract_ready` | 输出 trace / span refs，不上传 domain truth。 |
| Langfuse / Phoenix | `optional_connector_pending_export_contract_ready` | connector 可后接，当前只冻结 dataset/run/experiment/evaluator refs。 |
| Optimizer loop | `control_plane_ready_external_optimizer_optional` | 可产生 prompt/skill/stage/tool-policy candidate refs，并进入风险分级 promotion pipeline。 |
| Mechanism read model | `mechanism_editable_refs_ready` | `opl agent-lab mechanism --json` 输出一等机制对象、editable surface refs、meta edit receipt、evolution segment、evidence delta、next candidate 和 promotion refs。 |
| Evolution harness | `next_mechanism_candidate_ready` | `opl agent-lab evolve --suite ... --json` 输出 mechanism evolution segment，不写 domain truth/memory/artifact，不训练权重；低/中风险按 gate 自动推广，高风险路由 owner/human。 |
| Risk review / version ledger | `auto_evolution_gate_ready` | 独立 AI reviewer、direct evidence、no-forbidden-write、version ledger、canary 和 rollback 是常态 gate。 |
| Integration contract machine surface | `ready_for_cross_surface_integration_gates` | activation predicate、canonical entry、artifact verifier、failure policy、typed blocker、owner route、retry/dead-letter 与 rollback refs 已进入 complete/workbench/mechanism read model。 |
| Review trace ledger | `ready_for_mechanism_patch_replay_and_audit` | independent reviewer、web research、mechanism patch 的 request/response/evidence/diff/contract/test/reviewer/no-shared-context refs 已进入 complete/workbench/mechanism/evolve read model。 |
| Log-driven candidate miner | `ready_for_usage_log_driven_meta_optimize` | usage logs、failure modes、user interrupts、convergence iterations、tool failures 和 blockers 已能生成 refs-only prompt/skill/rubric/workflow-default mechanism candidates。 |
| ARIS pattern intake | `machine_surfaces_landed_no_runtime_dependency` | research wiki / failed route memory、direct-evidence review、integration failure policy、experiment queue manifest、usage-log meta optimize、effort/assurance 双轴、helper inventory/drift report、permission/current-date fail-closed invariant 与 MCP/stream reliability policy 已落成 refs-only 机器面，不依赖 ARIS runtime。 |
| RL boundary | `downstream_ready_after_stable_trajectory_and_reward_surfaces` | 可输出 transition refs；不在 OPL core 训练或部署模型权重。 |
| App/workbench read model | `ready_for_app_workbench_consumption` | `opl agent-lab workbench --json` 输出完整 read model，`app_workbench_consumption_ready=true`。 |
| Optional connector export | `ready_for_connector_consumption_refs_only` | `opl agent-lab export --target ... --json` 输出 refs-only envelope，不上传外部服务，不读 domain body。 |
| Optimizer external suite | `gated_candidate_set_ready` | `opl agent-lab optimize --suite ... --json` 输出 gated candidate、risk review、version ledger 和 transition refs，不训练/部署权重；default agent promotion 按风险 gate 执行。 |

当前 longline suite 覆盖：

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
- OPL typed queue / stage attempt / provider receipt / hosted-attempt reconciliation 投影；
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

## 继续落地顺序

下一步应围绕已落地 CLI 与合同做增量，而不是再新建平行 harness：

1. MAS/MAG/RCA 已将计划中的 provider-hosted soak / recovery orchestration 测试责任引用到 OPL Agent Lab longline suite，并在各自 repo-native verification lane 中保留 domain authority 测试边界。
2. 按需实现可选 Inspect AI runner connector、Langfuse/Phoenix export connector；这些 connector 只消费 `opl agent-lab export --target ... --json` envelope，不成为 OPL core runtime truth。
3. 当真实长时 domain owner chain 产生新的 owner receipt refs 时，只更新 Agent Lab 输入 refs 和 domain-owned proof refs，不把 receipt body 复制到 OPL。
4. Optimizer / RL 只生成 candidate config、candidate branch、transition refs 和 risk-classified promotion refs；低风险可 auto-promote，中风险经 independent AI approve、tests pass 和 canary 后自动推广，高风险只路由 owner/human gate，不允许 OPL 直接改写 domain truth、artifact、memory body、memory accept/reject、credential/network/write policy 或 owner verdict。
5. `opl-meta-agent` 是独立 OPL-based Foundry Agent repo；它消费本控制面，不作为 OPL Framework 内置命令或合同 surface。
