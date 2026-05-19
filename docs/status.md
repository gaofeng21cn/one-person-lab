# OPL 当前状态

Owner: `One Person Lab`
Purpose: `status`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

更新时间：`2026-05-20`

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整智能体开发/运行框架，持有 Codex-default session/runtime、activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated surface 和跨仓治理。
- `One Person Lab App` 是面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source refs、artifact refs、memory refs、SLO、repair 和 owner-aware action。
- `Foundry Agents` 当前包括 `MAS`、`MAG`、`RCA`。它们持有各自的 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt 和 direct app skill path。

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent` 与 `claude_code` 同属显式非默认 executor adapter/backend，只能用 receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 等价。

当前长期智能体原则是 AI-first、AI 原生专家判断优先、contract-light。OPL 依靠 `Codex CLI` 等 AI executor 和 domain stage pack / prompt / skill / knowledge / quality gate 的演进获得智能体能力提升；合同只固定边界、安全、审计、receipt、阻塞、恢复、projection 和 fail-closed 这些下限，不把开放式规划、创作、评审、路线判断或修订逻辑写死，也不让机械分数、scorecard、checklist、readiness 或合同完整性替代真实 AI / domain expert stage gate 判断。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

当前 OPL 已具备 framework 主干：

- domain descriptor / stage / action / memory discovery；
- Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout；
- production closeout read model、provider proof / SLO projection、runtime snapshot 和 operator item；
- OPL-owned provider scheduler cadence/tick surface、safe runtime action shell、lifecycle refs-only SQLite index、external evidence refs-only receipt ledger、App/operator drilldown read model；
- functional runtime harness、generic substrate projection、domain pack compiler active-caller proof、private functional audit read model；
- Agent Lab control plane、managed checkout-clean command runner、standard domain-agent scaffold、standard agent conformance report 和 family docs taxonomy。Agent Lab 的默认目标是全自动机制进化，常态 gate 是真实 failure/evidence delta、真实 independent AI reviewer assessment、风险分级、promotion receipt、evidence/no-forbidden-write、version ledger、canary 和 rollback；fixture/domain scorecard pass 和 no-current-failure 只代表 regression guard，generated/synthetic receipt 只能进入 `review_pending`、`regression_guard_only` 或 `blocked_from_auto_promotion`。人工审核只属于高风险 owner authority surface 或显式 policy gate。ARIS 吸收点已落成 refs-only 机器面：integration contract read model、review trace ledger、log-driven mechanism candidate miner、effort/assurance 双轴、helper inventory/drift report、permission/current-date fail-closed invariant 与 MCP/stream reliability policy，并接入 `complete/workbench/mechanism/optimize/evolve`。这些 surface 明确 `runtime_dependency_required=false`，不引入 ARIS runtime dependency。MAS suite 现在可以把 runtime event ledger refs、provider/executor switch hygiene refs 和 claim assurance refs 作为 typed body-free 机制输入投影给 Agent Lab；OPL 只消费 refs，不写入 body、truth、artifact、owner receipt 或 quality verdict。
- Developer Mode 的系统配置与 App settings 消费面：`opl system` / `opl system initialize` 现在暴露 `developer_mode` surface，复用既有 `developer_supervisor` system action，App 设置页可以读取当前配置、GitHub identity 状态、repo authority 汇总、direct-fix / fork-PR 路由、endpoint、request fields 和 action payload template。

`opl agents scaffold --validate <repo>` 现在校验标准 OPL Agent 的真实语义归位：`agent/` 必须包含 prompt、stage、skill、knowledge 和 quality gate 的非 README 语义文件；`pack_compiler_input.required_domain_pack_paths` 必须解析到真实文件；每个 stage 必须声明 prompt/skill/knowledge/evaluation refs，并且其中的 `agent/` repo-path refs 必须存在、非空、无占位标记。这个 gate 直接阻断空目录 scaffold、只靠 `src/` / `packages/` 承载领域语义、或 stage 控制面缺知识/质量门的伪标准 Agent。

`opl agents conformance` 现在提供 standard domain agent conformance report，按 repo 检查 scaffold、`agent/` pack root、README-only path guard、generated surface owner、generated interface readiness、private generic-owner guard 和 active path scan。该报告只证明 structural conformance，不证明 domain ready、production ready、artifact authority、quality/export verdict 或 live owner-chain evidence。

Fresh conformance evidence（2026-05-19）显示：`opl agents conformance --family-defaults --json` 当前为 `total_repo_count=4`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`、`production_evidence_tail_count=4`。MAS、MAG、RCA 与 OPL Meta Agent 都通过 structural / physical conformance；RCA 的 README-only required pack path blocker 已关闭。`evidence_tail_classification.tail_items` 现在按 repo 输出可审计 tail item：`status`、`repo_path`、`domain_owner`、`evidence_ref`、`doc_ref`、`next_verification_command` 与 `authority_boundary`。当 domain repo 提供 `contracts/production_acceptance/*production-acceptance.json` 且字段足够时，tail item 可显示为 domain-owned receipt closed 或 domain-owned typed blocker；缺失 evidence 的 repo 仍单独报告 open tail。该报告只证明标准 Agent 源码形态、generated surface owner、private generic-owner guard、physical morphology policy 和 active path scan 通过，不证明 production/domain/artifact readiness 或 live owner-chain evidence。

`opl agents readiness --family-defaults --json` 现在是标准 Agent 结构 gate 与 production evidence tail 的聚合入口。Fresh readiness evidence（2026-05-19）显示：`status=passed_with_production_evidence_tail`、`conformance_passed_count=4`、`conformance_blocked_count=0`、`production_evidence_tail_count=4`，其中 tail ledger 只作为 operator attention / audit surface；`blocking_tail_item_count=0` 只表示这些 tail 不阻断 structural conformance、stage launch 或 artifact authority，不表示 domain ready 或 production ready。该 read model 明确 `readiness_can_claim_domain_ready=false`、`readiness_can_claim_artifact_authority=false`、`readiness_can_claim_production_ready=false`。

物理源码形态标准化现在作为独立治理口径读取：标准 OPL Agent 不只要 descriptor / generated interface ready，还要让 `agent/`、`contracts/`、`runtime/authority_functions/`、`src/` / `packages/` 和 `docs/` 的长期职责一眼清楚。MAS 的 supervisor / runtime transport / SQLite sidecar 命名仍是 physical morphology cleanup tail；MAG 的 product/status/sidecar/lifecycle/domain_runtime 路径继续按 handler/ref-only/authority 分类防回流；RCA 的旧 managed runtime 已物理删除，但 artifact-heavy/native-helper/product shell 仍不能被复制成新 Agent 通用 scaffold；OPL Meta Agent 的 scripts 已归 authority refs，仍需真实目标 agent scaleout 证明不是 generic runtime。这个口径吸收 OpenAI Agents SDK、LangGraph、AutoGen、CrewAI 等成熟项目的分层经验，不引入它们作为 OPL runtime dependency。

One Person Lab App 的产品运行路径默认以 OPL-managed environment 为真相：managed modules、managed skills、Codex plugin metadata、runtime tools 与 provider state 是普通用户入口的默认依赖。developer checkout 只作为显式开发/调试 override 进入运行路径；没有显式 override 时，workspace 源仓的 dirty、ahead 或实验分支不能定义 App 当前运行依赖。`opl system startup-maintenance` 现在提供 App startup maintenance action：默认处理 MAS/MAG/RCA 和 OPL Meta Agent 这四个 clean OPL-managed ecosystem modules，执行 install/update、repo bootstrap、health check、domain skill sync 和 plugin cache freshness 投影；dirty、ahead、diverged、no-upstream、env override、sibling workspace 或 invalid checkout 进入 `manual_required`，并输出 restart/reload 提示。AionUI shell 的 first-launch / app-version maintenance 源码路径已经从旧 `system reconcile-modules` 自动调用升级为 `system startup-maintenance`，并在 Full runtime 下跳过 git-backed maintenance；该 action 不写 domain truth、memory body、artifact body、quality/export verdict，也不安装 domain daemon。OPL Meta Agent 在这里是用于创建和检查 OPL-compatible agents 的 managed ecosystem module / default skill，不改变 MAS/MAG/RCA truth ownership。剩余缺口是发布包/截图证据、reload prompt 真实用户路径和长时 operator evidence。

OPL Developer Mode 已有系统配置和运行态 projection：`opl system developer-supervisor` 读写 OPL state 下的 developer supervisor 配置，并默认以 `gaofeng21cn` 作为安装期自动开启的 GitHub login 候选；`developer_mode` surface 会检测 GitHub identity、目标 repo permission，并计算 `direct_repo_fix`、`fork_pull_request`、`mixed_direct_and_pr`、observe-only 或 fail-closed route。App 设置页暴露 Developer Mode 开关，普通用户可手动开启或关闭；开启后任务默认可以启用外围 AI 巡检，Agent Lab 负责把问题归因、evidence、owner route、risk tier、independent AI reviewer refs、candidate fix、version ledger、canary / rollback 和 PR refs 组织成可审计控制面。repo developer / collaborator 可以走对应 repo 的修复、测试、canary 和 rollback-capable promotion 路径；非 repo developer 只能走 fork / PR 路径；高风险 domain truth、quality verdict、artifact mutation、memory accept/reject 或 credential/network/write policy 必须进入 owner/human gate。当前剩余缺口是 App 巡检自动挂载和真实 repo fix / PR route 的端到端 closeout 证据。

2026-05-20 fresh runtime evidence 显示默认 `opl family-runtime status` 选中 `temporal`，且 `provider_ready=true`、`full_online_ready=true`、`durable_online_ready=true`、`periodic_execution.status=provider_ready_scheduler_surface_available`、`selected_provider_can_replace_domain_daemons=true`。当前 readiness 真相必须以统一 lifecycle-aware provider payload 为准，并由 `opl family-runtime status`、`opl status runtime`、`opl runtime manager` 和 App provider projection 同源派生。`local_sqlite` 仍只允许作为 dev/CI/offline diagnostic path，不能替代 production provider 或 domain daemon；本机 `launchctl list` 与 `~/Library/LaunchAgents` fresh check 未发现 MAS / MedAutoScience supervision scheduler label 或 plist，MAS 旧 local scheduler 只能作为 repo-local cleanup diagnostic / tombstone 语境读取。

Fresh runtime evidence（2026-05-20）显示：`opl agents evidence apply` 已提供 OPL-owned refs-only external evidence receipt ledger，可对 domain 声明的 evidence request 和 evidence gate 记录或验证 receipt；`runtime app-operator-drilldown.domain_evidence_request_refs` 会把 request、remaining gate、replacement coverage、observed receipt status 和 verified gate receipt 投给 App/operator，顶层 summary 也会分别暴露 external request receipt 与 evidence gate request / receipt 计数。当前 live summary 为 7 个 total external evidence request、6 个 open external evidence request、1 个 verified MAG external evidence receipt request、1 个 external verified receipt、4 个 total evidence gate、3 个 remaining/open evidence gate request、1 个 verified evidence gate request、1 个 verified evidence gate receipt、10 个 remaining bridge modules。MAG `owner_receipt_typed_blocker_ref_roundtrip` 已有 verified typed-blocker receipt，证明 MAG owner receipt / typed blocker ref 可以被 OPL refs-only ledger roundtrip 消费；它不声明 grant-ready、fundability-ready、generated/hosted caller default 化、App workbench consumption 或 live soak 完成。verified gate receipt 会从 remaining evidence gate 投影中移出，并进入 `evidence_gate_receipts`，但该 ledger 只写 OPL state 下的 refs，不读取 domain truth、memory body、artifact body，也不授权 quality/export verdict；真实 default caller、release/dist、owner-chain 和 long-soak 证据仍需由 MAS/MAG/RCA 或 App 生产并作为 receipt/ref 回填。

Fresh legacy cleanup evidence（2026-05-19）显示：`opl agents legacy-cleanup apply --domain mas|mag|rca --mode dry-run` 均返回 `plan_status=ready` 与 `lifecycle_apply.status=dry_run_ready`；随后 OPL refs-only lifecycle ledger 已对三仓执行 apply 并可 verify 读回 receipt：MAS 为空计划 closure batch receipt，MAG 写入 1 条 batch receipt 与 3 条 action receipts（含 2 条 domain owner handoff receipt refs），RCA 读回既有空计划 closure batch receipt。`runtime app-operator-drilldown` 继续汇总为 `domain_legacy_cleanup_plan_count=3`、`domain_legacy_cleanup_ready_plan_count=3`、`domain_legacy_cleanup_blocked_plan_count=0`、`domain_legacy_cleanup_opl_apply_ready_count=3`。App/operator cleanup plan 现在把 `agent_id` 与 `command_domain_id` 分开：`apply_command` / `verify_command` 使用 CLI 可执行的 `medautoscience`、`medautogrant`、`redcube`，同时保留 skeleton agent id 作审计展示。该证据证明 OPL cleanup gate、refs-only ledger 和 App/operator 投影已能消费三仓 replacement / no-active-caller / provenance / tombstone / handoff refs；它不授权 OPL 删除 domain repo 文件，也不等于 production default caller、App 发布路径、owner-chain 或 long-soak evidence 已完成。

2026-05-19 的系统评估把当前完善主线收窄为 OPL 自身语义治理：provider readiness 多真相、generated surface drift/block、App/operator drilldown 默认过重、`family-runtime` parser 语义堆叠、stage launch guarantee 含糊、legacy vocabulary active leakage，以及 AI 原生专家判断容易被 readiness / scorecard / contract completeness 机械替代这七类污染点已在 main 落成机器守门面或本轮补齐 policy guard。当前 main 已吸收 runtime single truth、generated surface gate、App drilldown summary-first、CLI parser split、stage scope / `guarantee_mode` projection、主文档 hygiene 和 contract-floor policy；这些属于 framework hygiene closeout，不等于 MAS/MAG/RCA production default caller、App 用户路径或 long-soak evidence 已闭合。后续只能在这些守门面之上补 production evidence，不把 evidence tail 写成框架结构缺口。

MAS/MAG/RCA 当前均可被 OPL 识别为 standard domain agent consumer，并且 fresh conformance evidence（2026-05-19）显示 family-defaults 全量当前为 4/4 structural / physical pass：MAS、MAG、RCA 与 OPL Meta Agent 均通过。这个状态说明 descriptor、read model、handoff、generated/handler target proof、replacement surface、scaffold validation、physical morphology policy 和 active path scan 都已被 OPL structural gate 接受；production usable closure 只按 domain-owned `production_acceptance` receipt 或 typed blocker 读取，不能写成 OPL 已证明 production domain owner chain、App 真实用户路径或 long-soak evidence 全部闭合。Fresh OPL proof-bundle evidence（2026-05-18）显示 `opl stages proof-bundle --domain mas|mag|rca` 均返回 `admission_status=admitted`、`blockers_count=0`、`warnings_count=0`，`opl stages list` 汇总为 18/18 stages admitted。Fresh OPL cohort-loop evidence（2026-05-19）显示三仓 `family_stage_control_plane` 已为 18 个 stage 声明 `source_scope_refs`、`cohort_query_refs`、OPL queue `trigger_refs`、`monitor_refs` 和 `dashboard_metric_refs`；`opl stages cohort-loop --domain mas|mag|rca` 均返回 6/6 `closed_loop_ready`、`blocker_count=0`。这些只证明闭环声明与 OPL refs-only projection 可消费，不等于真实 provider launch、cohort execution、owner receipt 或 long-soak 已完成。MAS 当前机器面已关闭未分类 generic owner 回流、effect-boundary stage admission和 5 个结构 follow-through gate，`classification_gap_count=0`、`active_private_generic_residue_count=0`、`functional_structure_gap_count=0`；2026-05-19 MAS main 又新增 `runtime_transport_handoff_projection`，把 `mas_runtime_core`、turn runner、worker lease、runtime supervisor 与 `runtime_lifecycle_store.py` 逐项约束为 OPL generic runtime 的 domain bridge / refs-only sidecar / diagnostic，不再允许 MAS 声明 queue、attempt ledger、worker residency、transition runner 或 persistence/lifecycle engine owner。MAS 剩余是真实 paper-line provider apply、memory/artifact/lifecycle receipt scaleout、human gate/resume、provider SLO long-soak evidence gate，以及 no-active-caller / OPL parity / domain receipt parity 成立后的物理删除、archive 或 tombstone。MAG 当前 repo-side handler / refs-only / authority boundary 与 active legacy residue 命名 gate 已闭合，并已有 1 个 verified refs-only typed-blocker external receipt；剩余主要是 6 个 external request 的外部默认 caller、App 消费、release/dist、direct/hosted parity、continuous no-forbidden-write、Temporal live soak 和 owner receipt scaleout 证据。RCA 当前 generated/hosted shell 消费边界已由 OPL `agents interfaces --repo-dir` read model 承接，`generated_wrapper_bundle` 机器面显式列出 `cli`、`mcp`、`skill`、`product_entry`、`product_status`、`product_session`、`sidecar`、`workbench` 的 OPL-owned descriptor scope，并把 RCA 限定为 domain handler target 或 refs-only adapter；RCA 8 项结构差距、README-only required path cleanup 和 legacy physical cleanup 已按 OPL consumer 口径闭合，且已有 1 个 RCA production acceptance refs 被 OPL 记录并验证为 refs-only evidence gate receipt。RCA 剩余是 production evidence tail 与 naming hygiene follow-through：controlled visual-stage long soak、更多真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout、cross-family repeated no-regression evidence，以及历史 `managed` 命名的 compatibility-free contract/tombstone 维护。

Fresh substrate evidence（2026-05-18）显示：`opl substrate projection --domain med-autoscience --json` 返回 `projection_status=substrate_refs_resolved`，source refs、artifact refs、memory refs 与 lifecycle projection 均为 `resolved`。OPL 只索引 MAS manifest 暴露的 body-free source/artifact/memory refs；source truth、memory body、artifact body、publication quality verdict 和 artifact mutation authority 仍归 MAS。

当前 active gap 与实施顺序以 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md) 和 [生产级框架闭环差距矩阵](./active/production-framework-closure-gap-matrix.md) 为准。dated proof、receipt 明细和阶段 closeout 流水保存在 [OPL family 文档过程归档 2026-05](./history/process/plans/2026-05-18-opl-family-doc-process-history.md)，不在本页展开。

## 当前功能/结构差距

OPL family 当前不能写成整体 `functional_structure_gap_count=0`。仍需关闭的功能/结构差距是：

0. `semantic_hygiene_guard_surface_closeout`
   OPL 自身语义污染点已在 main 落地为机器守门面：provider readiness 改为 lifecycle-aware 单一 payload 派生；generated surfaces 从 canonical action/stage metadata 与 pack compiler input 对齐，MAG transition oracle 降为 evidence gate 而非 generated drift；App/operator 默认面改为 summary-first，完整 refs/routes 走显式 full detail；`family-runtime` parser 按子域拆分；stage control plane 投影 source/artifact/workspace scope refs、runtime assumptions、monitor refs 与 `guarantee_mode`；旧 Hermes/Gateway/frontdoor/MDS/default-compat 词汇继续只留在 history/tombstone/provenance、fixture、negative guard 或 cleanup plan；readiness / conformance 机器面明确 AI 原生专家判断优先、contract 只保安全/审计/恢复下限。后续只作为回归守卫，不再作为新增功能缺口，也不代表 MAS/MAG/RCA production ready。

1. `generated_surface_production_consumption`
   OPL pack compiler / generated surface 已能输出 active-caller target proof；MAS/MAG/RCA repo-side generated/handler target consumption 已闭合。descriptor ready / classification closed 代表可生成、可分类和可路由；production domain owner chain、live caller evidence 和 domain ready 仍通过真实 provider / App / owner receipt evidence gate 验收。

2. `stage_launch_admission_gate`
   默认 operator / App 入口已收敛为 `opl stages readiness --domain <domain>`：它聚合 admission、proof-bundle、assumptions、cohort-loop、replay-certification，以及 runtime/capacity/domain-validity 这类 advisory refs，但不新增 domain verdict。`family-stage-admission` 仍是 `opl stages list|inspect` 的读模型；`family-runtime attempt create` 会记录 `opl_family_stage_launch_admission_gate`，声明 stage 存在 admission hard blocker 时进入 blocked attempt；`--require-stage-admission` 在 attempt start 与 provider-hosted tick 路径阻断的是越权、effect-boundary/runtime-guard 缺 runtime event 记录、组合不满足、human gate hard blocker 或 executor binding 缺失等启动安全问题。`family-stage-cohort-loop`、`family-stage-assumption-lifecycle` 与 budget/validity advisory refs 继续提供 source scope、cohort query、trigger、monitor/metric/dashboard refs、runtime assumptions、success refs 和 minimal counterexample，但这些不是普通首屏，也不是独立学习目标；缺少轻量增强字段默认进入 readiness warning / drilldown，不再单独阻断 executor。2026-05-19 main 验证中 MAS/MAG/RCA 均为 6/6 `closed_loop_ready`、`blocker_count=0`，这只证明 refs-only projection 可消费；所有这些字段仍不授权 OPL 写 domain truth、domain verdict、artifact body、quality verdict、stage completion 或 owner receipt。剩余功能项是把 selected executor binding、真实 consumed refs、expected receipt refs、scope freshness、monitor freshness 与 cohort-loop live execution 的 production caller scaleout 纳入 queue/provider/App 可见证据。

3. `app_workbench_drilldown`
   OPL CLI/runtime read model 已覆盖 route graph、review queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness、SLO 和 owner-aware action routing；`app_execution_bridge` 已把 App 调用边界收口到 `opl runtime action execute`、`runtime lifecycle apply/reconcile` 和受监督 provider scheduler command refs。AionUI runtime 页面已把 external evidence、evidence gate receipt、legacy cleanup 和 provider cadence window summary-first counters 放入 `AppOperatorDrilldown` 默认卡片，并能按需调用 `opl runtime app-operator-drilldown --detail full --json` 加载完整 refs/routes；legacy cleanup detail 已输出可直接复制执行的 `command_domain_id` 命令，不再把 skeleton id 写成 CLI domain 参数；focused DOM test 已覆盖 summary 默认面、provider cadence window 计数与 full-detail lazy load。剩余是发布包/截图、真实用户路径和长时 operator evidence。domain repo 不应复制通用 workbench。

4. `domain_private_platform_residue`
   MAS 已把未分类 generic owner 回流和 5 个 structural follow-through gate 清零，并新增 `runtime_transport_handoff_projection` 约束 runtime runner / worker lease / supervisor / SQLite sidecar 只能作为 domain bridge、receipt、typed blocker、refs-only sidecar 或 diagnostic。MAG repo-side handler/ref-only/authority boundary 已闭合；RCA generated/hosted shell consumption、repo-local wrapper active-caller migration 和 legacy physical cleanup 也已按 OPL consumer 口径闭合。MAG/RCA 剩余不是继续迁移 repo-owned generic owner，而是外部 default caller、App、live owner-chain、production evidence tail 与 naming hygiene tail。所有新发现或既有残留都必须按 OPL 上收、generated surface 替换、refs-only 收薄、minimal authority function、diagnostic cleanup 或 tombstone 分类处理；结构闭合不能写成真实生产 owner chain、live evidence 或物理代码路径已清零。

5. `legacy_physical_cleanup`
   Hermes/Gateway/frontdoor/local-manager/MDS-default/default-compat 等旧面只有在 provenance、diagnostic、fixture、negative guard 或 history 语境中可见。MAS local LaunchAgent 当前没有本机 active label / plist；MAS repo 内相关路径只能保留 explicit cleanup diagnostic / tombstone 角色。MAS/MAG/RCA 的 OPL legacy cleanup plan 当前均为 dry-run ready，OPL refs-only lifecycle ledger 已 apply 并 verify 到三仓 cleanup receipts；App/operator 可见 3/3 ready、0 blocked。RCA 旧 managed runtime / repo-local generic wrapper residue 已闭合为 handler target、refs-only adapter、history/provenance 或物理删除。后续只保留新发现 residual 的 fail-closed cleanup gate、domain owner 物理删除 receipt 和 RCA naming hygiene tail。

6. `app_managed_environment_startup_maintenance`
   OPL 已提供 `opl system startup-maintenance` 作为 App startup maintenance 机器入口，MAS/MAG/RCA/OPL Meta Agent clean managed checkout 可受控 install/update、health check、skill sync 和刷新 plugin cache freshness；dirty/ahead/diverged/no-upstream/env override/sibling workspace/invalid checkout 会 fail closed 到人工处理，不静默覆盖 developer checkout 或 managed runtime。AionUI first-launch / app-version maintenance 源码路径已自动调用该 action。剩余是发布包/截图证据、reload prompt 用户路径和长时 evidence。

7. `developer_mode_agent_lab_repair_route`
   Developer Mode 的系统配置、App settings / initialize surface、GitHub login / repo permission projection、direct repo fix / fork PR route 计算和 Agent Lab refs-only repair route read model 已落地。该路线应按 Agent Lab 风险分级运行：低风险 prompt/rubric/display/read-model/test metadata 只有在真实 failure/evidence delta、independent AI approve、promotion receipt、rollback 和 no-forbidden-write refs 齐全后才可 auto-promote；中风险 stage/tool/retry-dead-letter/memory-retrieval policy 还需 tests pass 和 canary 后自动推广；高风险 domain truth、quality verdict、artifact mutation、memory accept/reject 与 credential/network/write policy 必须 owner/human gate。剩余证据门是用真实 repo 问题跑一次 owner direct-fix 与 non-owner fork/PR 的端到端 closeout；该能力必须保持 managed runtime truth 不变，只授权开发修复、PR 路由和合规的低/中风险机制推广。

8. `agent_lab_external_research_absorption`
   OPL Agent Lab 已把 ARIS 风格的日志驱动机制优化、独立 AI reviewer、自动 promotion / rollback、integration contract、review trace、effort/assurance 双轴、helper inventory/drift report、permission/current-date fail-closed invariant 与 MCP/stream reliability policy 变成 machine-readable refs-only surfaces。MAS 侧负责把 research wiki、reviewer direct evidence、analysis queue manifest、runtime event ledger、provider/executor switch hygiene 和 claim assurance 投影进 `mechanism_evolution_inputs`；OPL 只消费 refs、typed graph/queue/ledger/hygiene/assurance metadata 和验证结果，不接管 paper memory body、analysis queue body、runtime event body、provider/executor transcript body、claim text body、publication verdict、owner receipt 或 artifact authority，也不引入 ARIS runtime dependency。

## 当前测试/证据差距

下面是目标结构正确后的证据门，不能替代功能/结构迁移；MAS/MAG/RCA 都不能把 descriptor ready、read model、replacement proof 或 provider proof 写成功能/结构迁移完成：

- MAS 多条真实 paper line 的 provider-hosted guarded apply、progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker。
- MAG 真实 OPL-hosted grant-stage controlled soak、owner receipt、typed blocker 或 no-regression evidence。
- RCA 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 repeated no-regression evidence。
- MAS/MAG/RCA 的 memory / artifact / lifecycle 在真实 workspace 中形成 accepted/rejected writeback、cleanup/restore/retention 和 artifact mutation receipt。
- Temporal provider 长时 SLO 已有 `cadence_window` 机器投影，可区分 `window_cadence_satisfied`、`window_evidence_incomplete`、`window_repair_receipt_observed` 和 `no_window_evidence`，并把 expected / observed / missing / blocked repair receipt counters 暴露给 runtime snapshot、App/operator read model 和 AionUI 默认卡片。2026-05-20 fresh live window 已达到 `window_cadence_satisfied`，当前 App/operator summary 为 7 expected、observed >= 352、0 missing、0 blocked repair，`production_evidence_tail_open_item_count=0`；仍需 restart/re-query/signal/history、domain owner-chain dispatch 与 no-forbidden-write proof。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、OPL Meta Agent、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` / `opl system startup-maintenance` 管理 Codex CLI、provider profile/readiness、module install/update、skill sync、managed environment freshness、plugin cache freshness、reload prompt 和 local runtime state。
- `opl system developer-supervisor` 管理 Developer Mode 的系统级配置、GitHub 身份/权限 projection 与 repair route 汇总；App 设置页应消费同一个 `developer_supervisor` system action，而不是新建平行配置入口。
- `opl agents descriptors` 是当前 domain-agent 总入口；专题 drilldown 继续由 agents/stages/actions/domain-memory/substrate/runtime/Agent Lab 等命令承担。
- `opl agents readiness --family-defaults` 是当前标准 Agent 结构 gate + production evidence tail 聚合入口；它消费 conformance、pack compiler、generated interfaces 和 semantic hygiene gate，只输出 refs-only tail ledger，不授权 domain ready、artifact authority 或 production ready。
- `opl stages readiness --domain <domain>` 是当前 stage/operator/App 默认检查入口；`stages graph|proof-bundle|assumptions|cohort-loop|runtime-budget|registry|source-spec|replay-certification` 只作为显式诊断 drilldown，不作为普通首屏或独立学习目标。

## 当前 Foundry 产品线

| 产品家族 | 当前实现 | 当前覆盖范围 | 状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 基金方向判断、申请书写作、修订工作 | 活跃 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `IP Foundry` | Planned | 专利申请、技术交底、权利要求、实施例整理 | 定义阶段 |
| `Award Foundry` | Planned | 科技奖、成果奖和荣誉材料 | 定义阶段 |
| `Thesis Foundry` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Foundry` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前维护边界

- 当前事实优先读 `project / architecture / invariants / decisions / status`、contracts、source、CLI/API、runtime ledger、provider receipt 和 domain-owned manifest。
- `docs/**` 是中文内部开发与维护参考，不作为机器接口；需要关联人读材料时使用 schema/source/contract path 或 `human_doc:*` 语义 ID。
- `docs/active/` 承接当前差距、当前计划和当前执行顺序；`docs/references/` 承接目标态和支撑参考；`docs/history/` 承接历史归档、完成计划、旧路线、tombstone 和 proof 流水。
- `opl-aion-shell/docs` 属上游 AionUI 依赖文档，不纳入 OPL/MAS/MAG/RCA docs taxonomy 治理。

## 当前不能声明

- 不能声明 OPL 已全量生产可用。
- 不能声明 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能声明 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 `agents legacy-cleanup apply` 的 dry-run / apply / verify ready 状态写成 OPL 已删除 domain repo 文件或 production evidence 已闭合；它只证明 cleanup plan / refs-only ledger / handoff refs 可由 OPL 安全消费。
- 不能把 MAS/MAG/RCA generated surface repo-side closure 写成外部发布默认 caller、App 真实用户路径或 live owner-chain evidence 已全部闭合。
- 不能把 MAS descriptor ready、read model、provider proof、replacement proof 或 generated bundle ready 单独写成 MAS 功能/结构差距归零；MAS 结构闭合必须来自 closure gate proof refs，live paper evidence 仍单独验收。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 参考入口

- [文档索引](./README.md)
- [项目概览](./project.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
