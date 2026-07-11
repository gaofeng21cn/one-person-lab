[English](./README.md) | **中文**

# Family Orchestration Contracts

Owner: `One Person Lab`
Purpose: `family_orchestration_contract_support_index`
State: `active_support`
Machine boundary: 本文是 family orchestration schemas 的人读支撑索引。机器 truth 继续归 schema 文件、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。

这个目录冻结的是当前 active 四仓线（`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`）共享的 family-level orchestration machine-readable companion schemas。

这里吸收的是 `CrewAI` 一类编排框架里最值得复用的思想，但吸收方式是 contract-first，而不是把 `CrewAI` 直接引入为 family runtime dependency，也不是改写现有 owner split：

- Temporal-backed provider 是 Full readiness 的 online runtime substrate，也是 durable orchestration 的生产必需 provider；`Hermes-Agent` 在 provider/readiness/compat 语境只作为历史 provenance、参考材料、诊断语料或负向 guard，`hermes_agent` 仅作为显式非默认 executor adapter 保留并要求独立 receipt、audit 和 fail-closed，`local_sqlite` 只作为 retired-provider negative guard 和 SQLite projection/index 旧名语境
- `Codex CLI` 继续是默认具体执行器正式名称，`autonomous` 继续是默认路线模式，除非 domain route 显式选择其他 executor
- `one-person-lab` 持有 Temporal-backed family runtime provider 之上的 stage-attempt request/projection 与产品控制面，不复制 runtime kernel
- 各 domain 仓继续持有 durable truth、audit truth 与 review truth

这里也吸收 `Ageniti` 最有价值的思想：用一个 app action 定义派生 CLI、MCP、Skill、OpenAI、AI SDK 与 product-entry descriptor。OPL family 采用的是这个 contract 模式，不把 `@ageniti/core` 引入为 runtime dependency。

这里只把 GraphFlow / GFL 吸收为治理词汇：boundary、evidence、audit、replay、route-back。OPL 不把 GraphFlow / GFL 引入为 runtime、provider、executor、planner、proof assistant、workflow compiler、stage runner 或 domain verdict authority。

当前 active contract narrative 是 **AI-first、executor-first、contract-light**，surface 收敛为 `Minimal Trust Kernel + Stage Strategy Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 只保启动安全、owner boundary、allowed refs、expected receipt、audit、replay 与 route-back 证据；Stage Strategy Kernel 保留 selected executor 的 stage 内开放式认知空间，同时声明 prompt、skill、tool affordance、knowledge、rubric 与独立 quality gate refs 以便审计和复用；Readiness 是默认 operator / App 聚合面，不新增 domain verdict；Derived Diagnostic Lenses 解释 assumption、cohort visibility、runtime budget、replay、failure localization 或缺失证据，并作为 advisory 输入折叠进 readiness，不作为 standalone 默认 CLI 或 schema 目标。Surface Budget 由 `contracts/opl-framework/surface-budget-policy.json` 冻结：新增 default surface 只允许服务 launch safety、authority boundary、evidence / replay / audit / route-back，或 App/runtime 反复消费。AI Capability Aperture 保留更强 executor、更丰富 domain pack 和独立 reviewer 的开放式专家执行空间，但不把 strategy ref 完整性升级成 launch hard gate。

当前 stage-led 合同基本原则是：

1. Stage pack 是启动单位；OPL 准入并启动 stage，不启动自由形态 workflow script。
2. AI-first / executor-first 执行不被静态合同写死；合同绑定 expected receipt、authority boundary 与 tool affordance boundary，prompt / skill / tool-affordance / knowledge / rubric refs 是策略和边界引用，不构成 OPL launch hard gate。工具 refs 是 affordance catalog，不是 workflow script。
3. Controlled StageRun canary evidence 是标准 domain adoption 证据面；它固定 candidate generation、grounded reflection、comparative selection、evolution / revision、meta-review learning 与 independent quality gate 的 refs-only role artifact shape，并由 `opl agents conformance` 验证。该 evidence scope 必须是 `controlled_fixture_not_live_domain_progress`，不能声明 live paper / grant / visual / target-agent progress、quality verdict、artifact ready、export ready 或 production ready。
3. AI 原生专家判断优先；机械分数、checklist、contract completeness、descriptor ready、provider completion 和 generated-surface proof 只能作为 advisory，除非独立 AI stage 或 domain-owned quality gate 返回 receipt / typed blocker / route-back verdict，否则不能替代专家判断。
4. `requires` / `ensures` 组合在启动前检查；domain judgment 仍是 runtime / domain-owned 结果。
5. `verified_static_core` 只覆盖 identity、owner、refs、scope、composition 与 forbidden-authority 约束。
6. `runtime_enforced_boundary` 覆盖 AI 输出、人类决策、外部系统、artifact mutation、memory writeback 与 domain verdict。
7. Hard blocker 只覆盖启动安全、越权、关键 runtime event 记录缺失、composition 不满足、hard human gate 或 executor binding 缺失。
8. capacity、monitor、assumption、cohort-loop、replay 和 domain-owner review 信号折叠为 `opl stages readiness --family-defaults` 与单仓 `opl stages readiness --domain <domain>` 的 advisory refs，不再作为独立 launch-authority schema。
9. descriptor ready、read model 可读、generated-surface proof、provider proof 或 cleanup proof 都不等于 domain ready、artifact ready 或 production evidence complete。
10. 每个阻断或未闭合边界都必须返回 typed blocker、human gate、receipt conflict 或 route-back ref，不用 fallback verdict 补语义。

`StructuredCloseoutGate` 是 OPL Framework / Runway 在 stage-attempt closeout 执行第 10 条的 primitive。selected executor 可以是 `Codex CLI`，但 `Codex CLI` prose、provider completion、tests green、file presence、docs patch、read-model refresh 或 recovery-repair projection 都不是 closeout authority。OPL 只接收 structured closeout packet / refs，然后记录 transport closeout、路由 owner refs，或 fail closed 为 provider-runtime closeout blocker。格式漂移流程固定为 `terminal JSON capture -> session recovery -> same-session enforcement -> domain receipt recovery if applicable -> provider-runtime closeout blocker -> recovery-repair projection`。Repair / redrive 只是 query / decision surface，不得伪造 typed blocker、owner receipt、human gate、domain truth、artifact body、memory body、quality verdict、runtime ready、domain ready 或 production ready。

`evidence_requirement.v1` 是 family evidence worklist / tail ledger 的 canonical requirement payload。它不只记录当前 ref、receipt 或 typed blocker，也必须显式携带 `not_authorized_claims`、`requirement_is_completion_claim=false`、`can_claim_domain_ready=false`、`can_claim_production_ready=false` 与 `can_claim_artifact_authority=false`。因此 closed refs-only receipt、provider / cleanup receipt、domain-owned typed blocker 和 open safe-action route 都只能表示 requirement 状态，不能被下游 App、scheduler、report 或 automation 误读成 domain ready、artifact authority、production ready 或 closeout 成功。

## 归属边界

`one-person-lab` 在这里负责：

- 顶层 contract 语言
- schema 命名与索引
- 跨 domain 的复用规则

各 domain 仓继续负责：

- 真实 domain dispatch 的接受或拒绝
- 真实 runtime event 的发出
- 真实 checkpoint 的落地
- 真实 action graph 的 domain 语义
- 真实 human review surface
- 真实 product-entry truth

因此，这些 schema 冻结的是跨仓互操作语义，不是某个单体 runtime 实现。

## 当前 companion contract 集

### runtime-oriented

- `family-event-envelope.schema.json`
  - 冻结共享的 event correlation、producer、session、audit reference envelope
- `family-checkpoint-lineage.schema.json`
  - 冻结共享的 checkpoint ancestry、resume 与 state reference envelope

### domain-oriented

- `family-action-graph.schema.json`
  - 冻结共享的 action graph topology、node、edge、human gate 与 checkpoint policy surface
- `family-action-catalog.schema.json`
  - 冻结共享的 callable-action catalog，覆盖 action id、owner、effect、input/output schema refs、source command、supported surfaces、human gates、workspace locator fields 与 authority boundary
- `family-stage-control-plane.schema.json`
  - 冻结共享的 stage descriptor companion，覆盖 stage goal、domain stage refs、skill / prompt / evaluation refs、handoff refs、runtime assumption monitor refs、cohort / trigger / metric refs 与 authority boundary
- `family-stage-admission.schema.json`
  - 冻结 OPL-owned stage admission read model，覆盖 stage contract、trust lane、effect boundary / runtime-guard runtime-event requirement、composition obligation、admission finding、failure localization、typed human-review burden budget 与 OPL non-authority boundary
- `family-stage-proof-bundle.schema.json`
  - 冻结轻量 proof-carrying stage-pack bundle，供 OPL 调度 / 准入消费 composition obligation、assumption、receipt ref、runtime-event requirement、human-review budget、test / proof ref、generated artifact manifest、blocker、`proof_runtime_metrics` 与 OPL non-authority boundary；这些 metrics 和 generated refs 只做 build/review、scheduling / operator observability，不是 domain ready、quality、receipt 或 artifact verdict
- `family-stage-graph-projection.schema.json`
  - 冻结单个 family stage pack 的 graph projection，供 scheduler / App 消费 nodes、handoff edges、admission state、guarantee modes、integrity digest 与 OPL non-authority boundary
- `family-stage-cohort-loop.schema.json`
  - 冻结 stage pack 的 source scope / cohort query / trigger / monitor-metric refs-only diagnostic lens，供 scheduler / App 判断同一批 source 是否有可审计启动和监控 refs；OPL 只投影 refs 与 drilldown finding，不评估 source truth、不授权 domain readiness
- `family-stage-runtime-budget.schema.json`
  - 冻结 runtime reliability / capacity 的 refs-only diagnostic lens，覆盖 boundary count、runtime guard count、monitor / metric refs、unmonitored boundary count、expected-success 或 boundary-success-rate refs；capacity 证据折叠为 readiness warning / recommendation 和 drilldown ref，OPL 不计算未证实概率、不授权 domain readiness
- `family-stage-pack-registry.schema.json`
  - 冻结 stage pack library / registry 投影，按 integrity hash 记录 reusable pack refs、lifecycle status、promotion / deprecation / supersession refs、active attempt binding 与迁移策略 blocker
- `family-stage-pack-source-spec.schema.json`
  - 冻结 body-free refs-only source/spec 投影，供 human diff review 聚合 control-plane、proof-bundle、graph、registry、replay、assumption-lifecycle 与 cohort-loop refs，不生成 artifact body，也不执行 stage
- `family-stage-replay-certification.schema.json`
  - 冻结 stage pack replay certification 投影，要求 replay 只读取 append-only event log、attempt ledger、runtime event refs 与 closeout receipt refs，不能重新询问 AI、人或外部系统
- `family-stage-assumption-lifecycle.schema.json`
  - 冻结 runtime assumption lifecycle 投影，把 stale assumption、缺失 monitor ref 或 owner 的情况转成 operator warning 和 minimal counterexample；除非被明确升级为启动安全 blocker，否则不默认阻断启动
- `stage-candidate-portfolio.schema.json`
  - 冻结 refs-only stage candidate portfolio companion，承载 candidate refs、assumption decomposition、provenance check refs、negative / failed path refs、advisory ranking / proximity metric refs 与 human review refs；OPL 只投影 refs 和状态，domain 仓继续持有 candidate truth、quality verdict、artifact authority 与 owner receipt authority
- `family-domain-memory-ref.schema.json`
  - 冻结 domain-owned memory pack 的 locator-only 引用，覆盖 memory family、pack ref、stage applicability、retrieval/writeback/receipt/recall refs、freshness 与 OPL forbidden authority
- `family-domain-memory-writeback.schema.json`
  - 冻结 stage closeout 到 domain memory router 的 proposal / receipt 形状；OPL 只投影 proposal 与 receipt refs，accept/reject 由 domain router 决定
- `family-human-gate.schema.json`
  - 冻结共享的 human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - 冻结共享的 product-entry discovery surface，可指向 graph、action catalog、domain memory descriptor、gate、resume contract、runtime continuity companion、repo-owned runtime control projection，以及 family persistence / lifecycle / owner-route refs

### control-plane-oriented

- `../opl-framework/family-runtime-online-substrate-contract.json`
  - 冻结 provider-backed family runtime 的 owner split、OPL stage-attempt request/projection / dispatch bridge、stage attempt ledger 与 degraded diagnostics；Hermes 不再作为 provider surface、provider proof surface 或兼容接口，只保留历史 provenance、诊断语料或负向 guard 语义；显式 `hermes_agent` executor adapter 由 executor registry / receipt gate 约束
- `family-runtime-supervision.schema.json`
  - 冻结共享的只读 wakeup / supervision projection，覆盖 adapter id、cadence、last success / tick、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 authority boundary
- `family-persistence-policy.schema.json`
  - 冻结共享策略，用来区分 `file_authority`、`sqlite_sidecar_index`、`projection_cache` 与 `source_provenance_only`
- `family-lifecycle-ledger.schema.json`
  - 冻结 lifecycle receipt surface，覆盖 dry-run / apply / verify action、manifest ref、checksum 与 restore proof
- `family-owner-route.schema.json`
  - 冻结 owner-route envelope，覆盖 `route_epoch`、`source_fingerprint`、next owner、allowed actions、idempotency key，以及 handoff / projection refs
- `family-conflict-envelope.schema.json`
  - 冻结统一 Conflict / Blocker Envelope，覆盖重复任务、owner 冲突、证据 blocker、质量 blocker、human gate、retry/dead-letter、identity incomplete 与 closeout receipt conflict；OPL 只路由、投影和 fail-closed 审计，domain agent 继续持有 ready / quality / artifact verdict

## Runtime Continuity Freeze

`family-product-entry-manifest-v2.schema.json` 现在正式冻结 `OPL` 跨三仓消费的 runtime continuity discovery layer。

这个 schema 现在 fail-closed 要求 family caller 必须能发现单一 app skill、runtime control、session continuity、progress projection、artifact inventory 与 runtime loop closure；这些字段只指向 repo-owned truth，不把底层 domain runtime 迁到 `OPL`。

当前 family-level 共享 surface 名称包括：

- `runtime_inventory`
- `task_lifecycle`
- `session_continuity`
- `progress_projection`
- `artifact_inventory`

负责把回路闭合成 runtime continuity truth 的 control reference 包括：

- `runtime_control`
- `runtime_loop_closure`
- 挂在共享 projection surface 里的 repo-owned `research_runtime_control_projection` companion

这样一来，`OPL` 可以继续只消费统一的 session / progress / artifact / restore-point continuity 合同，而底层 runtime truth 与 repo-specific projection 字段仍由各 domain 仓自己持有。

对 `MAS` v2，可消费 projection 锚点是 domain-owned `study_charter`、`evidence_ledger`、`review_ledger`、`publication_eval/latest.json`、AI reviewer artifacts、`StudyTruthKernel` / `RuntimeHealthKernel` 或 truth health reducers / runtime health reducers。OPL only consumes projections, does not issue MAS ready verdicts, and does not hold publication judgment。

## Unified Domain-Agent Descriptor Read Model

`opl agents descriptors --json` 和 `opl agents descriptor --domain <domain> --json` 是当前 admitted domain agent 的统一机器读入口。它们不新增新的 schema family；它们把本目录和 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json` 已冻结的 manifest surfaces 聚合为一个 read model：

- `domain_agent_entry_spec`
- `standard_domain_agent_skeleton`
- `family_action_catalog`
- `family_stage_control_plane`
- `family_transition_spec` / `family_transition_matrix_cases` / `family_transition_spec_descriptor`
- `domain_memory_descriptor`
- `skill_catalog`
- `runtime_inventory` / `session_continuity` / `progress_projection` / `artifact_inventory`
- `descriptor_refs`、parity、readiness 与 authority boundary

admitted domain 可以用 `family_action_catalog_ref` 与 `family_stage_control_plane_ref` 替代在 product-entry manifest 内嵌这两份 contract body。OPL 只接受仓内固定路径 `contracts/action_catalog.json` 与 `contracts/stage_control_plane.json`，在 generated read model 中物化消费；body 与 ref 同时出现、URL 或其他路径都会 fail closed。

这个 read model 用于 CLI/App discovery、维护者检查、admission gate 和 operator drilldown。它只承载 refs、status、locator、parity 和 forbidden-authority flags；它不承载 memory 正文、prompt/skill 长正文、domain route 判断、quality verdict、publication/fundability/visual verdict 或 artifact authority。

因此 MAS 的 `mas_publication_route_memory` 可以作为 `domain_memory_descriptor` 被统一 descriptor 发现，但论文套路正文仍由 MAS Markdown-first memory 管理；OPL 只把 operator 带到正确 refs。

`family_transition_spec` 与 `family_transition_matrix_cases` 是 domain-declared transition 的机器入口；`OPL` 可以执行 matrix runner、生成 transition receipt/projection、fail-closed blocker 或 dead-letter envelope。若 domain manifest 只暴露 `family_transition_spec_descriptor`，统一 descriptor 只能显示 `descriptor_only` / `refresh_required` 和 locator refs，不伪造完整 spec。domain repo 继续持有 transition table、guard/oracle fixture、owner action、quality verdict、artifact authority 和 owner receipt。

更硬的规则是：`family_action_catalog`、`family_stage_control_plane`、`family_transition_spec` 与 `family-product-entry-manifest-v2` 共同构成 canonical action/stage/transition metadata source。CLI、MCP、Skill、product-entry、sidecar 以及 OPL-hosted route 的 descriptor 和 routing metadata 都应从这份同一来源派生；`OPL` 只负责发现、投影、校验和通用 transition execution，不派生 domain handler，也不派生 domain truth。

## Persistence / Lifecycle / Owner-Route Freeze

family-level persistence 与 lifecycle surface 只属于共享控制面合同。它们让 domain 仓能用同一形状暴露 durable state role、lifecycle receipt 与 next-owner routing，但不把 domain truth 迁入 `OPL`。

共享控制面包括：

- `family_persistence_policy`
  - 标记哪些 surface 是 file authority、SQLite sidecar index、projection cache 或 legacy diagnostic
- `family_lifecycle_ledger`
  - 记录 dry-run / apply / verify lifecycle receipt，并携带 manifest、checksum 与 restore-proof refs
- `family_owner_route`
  - 记录 route epoch、source fingerprint、next owner、allowed actions、idempotency key 与 handoff / projection refs

`family-product-entry-manifest-v2.schema.json` 只增加这些 surface 的可选 discovery refs。stage attempt query 现在也会投影 locator-only lifecycle primitive：workspace/runtime/artifact roots、已索引的 closeout 或 consumed refs、已声明的 restore refs 以及 cleanup gate。`OPL` 可以索引 refs、显示缺失的 restore proof，并通过 `family-runtime lifecycle apply --mode dry-run|apply|verify` 对 OPL-owned runtime/index/provenance/tombstone refs 执行受控 ledger apply；该 apply 只写 OPL state root 下的 lifecycle index / cleanup receipt / restore proof refs。domain truth、memory body、artifact body、source repo active files 和真实 artifact mutation 继续 fail-closed；domain artifact mutation 只能记录 domain owner 已返回的 receipt ref。它不要求 `MAG` 或 `RCA` 第一轮把运行状态迁移到 SQLite，也不把 `MAS` 的 publication evaluation、AI review、paper package 或 readiness authority 移出 `MAS`。同理，`domain_memory_descriptor` 只暴露 locator / freshness / receipt refs，不把 memory content 或 writeback authority 移入 `OPL`。

`family-runtime-lifecycle-index` 是这一边界下 OPL-owned refs-only SQLite sidecar index。它只在 OPL state root 下记录 domain id、surface id、source ref、receipt ref、checksum 和 opaque payload refs；它不是 domain truth store、memory body store、quality verdict store、artifact authority 或 package/export readiness store。MAS 这类历史 runtime lifecycle SQLite 实现，在 OPL replacement 存在后必须归类为 domain sidecar reference adapter 或 file-authority refs，不能再声明为 domain-owned generic persistence engine。

`functional_privatization_audit` 是 OPL-owned 统一读模型，用来归一化 domain repo 自声明的、看起来像功能面的代码路径。标准机器源只接受 canonical `functional_privatization_audit`；MAS `functional_consumer_boundary`、MAG `mag_consumer_thinning_contract.privatized_functional_module_audit`、RCA `runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit` 以及旧顶层 `privatized_functional_module_audit` 只作为 `legacy_import_adapter` 读取，并通过 `source_field_role=legacy_import_adapter` 暴露，不能作为新 Agent accepted source 或 scaffold 模板。每个模块仍会被归为 `opl_hosted_surface`、`opl_generated_surface`、`declarative_pack`、`minimal_authority_function`、`refs_only_domain_adapter`、`temporary_migration_bridge`、`diagnostic_cleanup_path`、`provenance_or_fixture`、`domain_authority` 或 legacy `retire_tombstone`；MAS 式 `legacy_cleanup_physical_retired` 会被归一化为 `diagnostic_cleanup_path`，且无 active caller 时默认折叠。代码路径级清单还可以携带 `code_paths`、`active_callers`、`active_caller_status`、`migration_action`、`retention_reason`、`cannot_absorb_reason`、`standardization_layer` 和 `standardization_layer_reason`。`standardization_layer` 把完整清单拆成 `standard_domain_pack_inventory`、`authority_function_inventory` 和 `private_platform_residue_inventory`：前两类不是私有平台残留，分别表示标准 pack 内容和受 OPL ABI 管理的标准 authority function；第三类才是真正需要 OPL generated/hosted replacement、refs-only 收薄、diagnostic cleanup 或 tombstone 退役的私有平台残留。清空目标是 `opl_owned_replacement=0`、active `temporary_migration_bridge=0`、legacy `retire_tombstone=0`、active private generic residue=0。日常结构审计默认看 `default_watchlist_count` 与 `default_watchlist_module_ids`；已经清理或稳定允许的边界项保留在完整 module inventory 中，但以 `hidden_by_default` 折叠。语义等价另看 `semantic_equivalence_review_count` 与 `semantic_equivalence_review_module_ids`，用于追踪 active caller 是否已经真正消费 OPL primitive / generated surface。如果 domain repo 声明 generic runtime owner，或把证据不足的 production soak 写成完成，就进入 blocker。

## Conflict / Blocker Envelope Freeze

`family-conflict-envelope.schema.json` 是 queue、stage attempt、closeout 和 App/operator projection 的统一阻塞与冲突语法。所有“跑不下去 / 不能确认完成 / 两边说法冲突”的情况都应投影成 `kind=opl_conflict_or_blocker.v1` 的结构化记录，而不是在 queue、attempt、closeout 和 App 里各自发明状态词。

canonical classification 固定为：

- `duplicate_task`：同一任务重复触发，按 `source_fingerprint + idempotency_key` 合并并返回 existing attempt。
- `authority_conflict`：owner boundary 或 forbidden write 冲突，fail-closed，等待 domain descriptor / owner receipt 修复。
- `evidence_blocker`：证据不足，生成 typed blocker，投影给 App/operator。
- `quality_blocker`：质量不达标，路由回 domain quality gate。
- `human_gate`：需要用户或上层决策，attempt 等待 approval/resume signal。
- `execution_retryable`：可恢复执行失败，消耗 retry budget，超限进入 dead-letter。
- `identity_incomplete`：缺少 domain / task kind / stage / source fingerprint / idempotency key 等关键 identity，直接 blocker，不猜测。
- `receipt_conflict`：完成回执冲突，保留冲突 refs，fail-closed，不覆盖旧 truth。

对应 attempt outcome 只投影为少数状态：`completed_with_receipt`、`blocked`、`waiting_for_human`、`retry_scheduled`、`dead_lettered`、`conflict_fail_closed`。`provider completed` 与 `executor completed` 只说明运行 substrate 或执行器结束；只有 domain owner receipt / verdict 到位，才能说 domain 工作推进。App/operator 直接消费 `operator_conflicts[]`，只展示重复任务、当前卡点、解决 authority、能否自动重试和是否需要用户动作；它不根据底层状态自行推断 domain verdict。

## Runtime Supervision Freeze

`family-runtime-supervision.schema.json` 冻结 family-level runtime wakeup / supervision 只读投影。它让 `MAS`、`MAG`、`RCA` 以及未来 admitted domain 用同一形状暴露 adapter id、cadence、latest tick、latest success、lease freshness、SLO state、repair command、safe reconcile hint 与 domain-owned source references。

这个 surface 不是 domain scheduler contract。已配置的 family runtime provider 承担 OPL-managed online wakeup / queue / attempt substrate；`OPL` 可以发现、导出、比较、入队、tick 和投影它，用于 parity 与 operator visibility；`OPL` 不因此成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。`repair_command` 与 `safe_reconcile_hint` 只是把动作路由回 domain-owned 只读 current-control probe 或 owner repair surface；不得把已退役的 MAS runtime-supervision 命令恢复成 active entrypoint。

## Action Catalog Freeze

`family-action-catalog.schema.json` 是 family callable-action metadata contract。它和 `family-action-graph.schema.json` 的职责分开：

- `family-action-graph` 描述 workflow topology、gate 与 checkpoint policy。
- `family-action-catalog` 描述可调用 action，以及能从这些 action 派生出的 descriptor。

一个 domain-owned action catalog 可以派生：

- CLI command descriptor
- MCP tool catalog descriptor
- Skill command contract descriptor
- product-entry operator-loop action descriptor
- sidecar export/dispatch descriptor
- OpenAI function tool descriptor
- AI SDK tool descriptor

`OPL` 只持有 schema、TypeScript/Python mirror helper、manifest discovery、parity check 与只读 `opl actions list|inspect|export` 命令。各 domain 仓继续持有真实 handler、runtime truth、review truth、quality authority、publication / deliverable gates 与任何写入效果。

`MAG` 第一轮可以暴露 `descriptor_only=true`、`public_runtime=false` 的 MCP-compatible descriptor；只有 public MCP runtime entry 经过验证后，才能写成已落地 runtime。

## Stage Control Plane Freeze

`family-stage-control-plane.schema.json` 是从 MAS Stage-Led Autonomy 经验上升出来的 family stage descriptor companion。它只做 descriptor 和 projection，不是 workflow engine。

这个 contract 记录 stage goal、domain-owned stage refs、输入/输出 refs、knowledge refs、skill refs、prompt refs、evaluation refs、handoff metadata、allowed action refs、runtime assumptions、monitor refs、source/artifact/workspace scope refs 与 authority boundary。`OPL` 持有 schema、manifest discovery、parity check 和只读 `opl stages list|inspect` 命令。各 domain 仓继续持有实际 route contract、stage execution、memory content、review verdict、quality authority 与 artifacts。

active Stage Kernel 在这里落成 stage pack admission 规则：`family-stage-control-plane` 和 `family-stage-admission` 描述 stage id、owner、goal、输入/输出 refs、`requires`、`ensures`、knowledge refs、skill / prompt / evaluation refs、allowed action refs、handoff、trust lane、scope refs 与 authority boundary 是否自洽。`opl stages list|inspect` 会投影 admission status、composition blocker、effect-boundary / runtime-guard blocker、OPL non-authority boundary 与 `guarantee_mode` summary。准入通过只表示 stage pack 可以进入后续 Temporal provider / executor 启动候选；AI 输出、人类批准、外部系统返回、artifact mutation、memory writeback、domain quality / publication / fundability / visual verdict 和 owner receipt 仍属于 runtime / domain-owned 结果。

`mode_tags` 与 `guarantee_mode` 只描述 Stage Kernel 能静态检查、运行时需要边界证据或必须回到 domain owner 的范围，不作为 domain verdict。`failure_localization` 是 Derived Diagnostic Lens，把 blocker / warning 按 `ai`、`human`、`external`、`provider`、`runtime`、`domain`、`artifact`、`source`、`monitor`、`executor` lane 分类，并暴露 `source_ref` 与 minimal counterexample；它只服务 operator drilldown 和 launch-readiness，不替代 domain owner receipt 或质量判断。

`human_review_burden_budget` 挂在 admission、proof bundle、stage attempt query 和 runtime-tray workbench 投影上。它把声明的人类 gate 规范成 typed gate id、owner、required refs、missing refs 与 ready/blocked 状态，让 launch/readiness surface 能因缺少 typed review evidence fail closed，而不是临时提出非结构化人工问题。OPL 只投影这个预算；真实判断、receipt、quality verdict 和 artifact authority 仍归 domain owner。

`runtime_assumptions` 与 `monitor_refs` 进入 Derived Diagnostic Lens：`family-stage-assumption-lifecycle` 会把 stale assumption、缺 monitor ref 或缺 owner 投成 warning 和 minimal counterexample。OPL 只投影 monitor refs、状态和 warning，不把 monitor 结果升级为 domain truth、quality verdict、publication / fundability / visual verdict、artifact authority 或默认启动 blocker。

scope refs 让启动边界可机器读取：`source_scope_refs` 冻结 source cohort，`artifact_scope_refs` 冻结 artifact set，`workspace_scope_refs` 冻结 stage 可用的 workspace/runtime scope。OPL 只投影 refs 和计数。`guarantee_mode` 区分 `static_admission_only`、`runtime_enforced`、`domain_owned_judgment` 与 `observability_only`；它是 scheduler / operator 读法，不是 proof assistant 结论，也不是 domain verdict。

`family-stage-cohort-loop` 是 refs-only Derived Diagnostic Lens，覆盖 source scope、cohort query、trigger 和 monitor/metric refs。缺少环节会给出 drilldown finding 和 minimal counterexample。`--require-stage-admission` 启用时，runtime launch gate 记录这些 finding 为 warning；只有启动安全、越权、effect boundary 缺关键 runtime event 记录、组合不满足、hard human gate 或 executor binding 缺失才阻断 executor。这个投影只服务 scheduler / App 的 launch-readiness 与 operator drilldown，不执行 query、不写 source truth、不授权 domain ready 或 quality verdict。

`family-stage-runtime-budget` 是 refs-only Derived Diagnostic Lens，覆盖 declared boundary、runtime guard、monitor ref、metric ref、dashboard metric ref 与 unmonitored boundary，并可建议提供 `expected_success_ref` 或 `boundary_success_rate_ref` 后再把 runtime budget 标为 fully observable。这个投影不计算概率真相，不授权 domain ready / quality / artifact verdict，也不默认阻断启动。

`family-stage-proof-bundle.schema.json`、`family-stage-graph-projection.schema.json`、`family-stage-pack-registry.schema.json`、`family-stage-pack-source-spec.schema.json` 与 `family-stage-replay-certification.schema.json` 是 OPL 对同一个 stage pack 的 machine-readable 投影。proof bundle 携带 composition、receipt、runtime-event、human-review budget、proof-ref 与 integrity metadata；graph projection 携带 nodes、edges、guarantee modes、graph summary 和同一个 integrity digest；registry 按 stage pack hash 暴露 reusable library refs、lifecycle status、promotion / deprecation / supersession refs、active attempt binding 与 hash migration policy blocker；source/spec 投影是 body-free visual-equivalent review bundle，只聚合 control-plane、proof、graph、registry、replay、assumption 与 cohort surface 的稳定 refs；replay certification 用 proof bundle obligation 对照 append-only event log、attempt ledger、runtime event refs 与 closeout receipt refs。它们都是只读 scheduler / App / operator input，不执行 stage、不重新询问 AI / human / external source、不验证外部签名、不写 domain truth、不修改 artifact、不生成 artifact body，也不授权 domain readiness。

stage graph 与 owner-route 的关系由 `contracts/opl-framework/stage-route-scheduler-contract.json` 冻结：stage graph 描述 OPL 可启动的 stage attempt topology；`family-owner-route` 描述 domain owner 的下一步、route-back、typed blocker、safe action 或 owner receipt refs。OPL route hydration 只把这些 refs 转成 stage attempt request/projection、conflict envelope 或 operator projection。route 不是 graph 里的隐藏小 stage，也不能绕过 stage attempt ledger 执行。

`generated_artifact_manifest` 仍是 proof bundle 内的 refs-only build/review input：它记录派生 code / test / proof / schema / artifact refs、source hash binding 与 drift status；不扫描真实文件 hash、不执行 stage、不写 artifact body、不引入 proof assistant，也不把 generated refs 升级成 domain ready 或 quality verdict。

`requires` / `ensures` 组合规则只能由显式 refs、human gate decision 或 owner receipt 满足；组合缺口、证据过期、owner 冲突、receipt 冲突或 executor binding 缺失必须进入 `family-conflict-envelope` / human gate / route-back。OPL 可以选择并绑定 executor 来启动已准入 stage pack，默认 executor 仍是 `Codex CLI`；非默认 executor adapter 必须由 stage pack、domain route 或显式 runtime switch 声明，并产出独立 receipt / audit / fail-closed 证据。

`opl_stage_launch_invocation` 是 Stage Kernel activity event：`invocation` 模式下 agent / operator 只能 retrieve、select、bind、launch、deploy 已 approved / admitted 的 stage pack，绑定 source fingerprint、workspace locator、idempotency key 和 selected executor 后交给 OPL provider / executor 启动；`authoring` 模式和 AI proposal flow 只能产出 `bounded_edit_ref`，在 `--require-stage-admission` 下缺少该 ref 会 fail closed 为 `agent_authoring_requires_bounded_edit_ref`，未准入的 agent-generated stage pack 不能直接 launch。默认 `codex_cli` 会记录 `default_codex_cli`；`hermes_agent`、`claude_code`、`antigravity_cli` 等非默认 executor 在 `--require-stage-admission` 下必须带 `executor_binding_ref`，否则启动前 fail closed 为 `non_default_executor_binding_ref_missing`。Stage-level executor policy 还可以携带 `model`、`reasoning_effort`、`provider`、`executor_labels`、`required_capabilities` 和 `receipt_requirements`；这些字段只证明启动绑定和审计 refs 存在，不声称非默认 executor 与 Codex CLI 行为或质量等价。

对 `MAS` 来说，这意味着在既有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` route contract 之上做 inventory 与 descriptor projection，不重命名或替换这些 route。对 `RCA` 和 `MAG` 来说，第一轮吸收应保持为现有视觉交付与基金写作 surface 上的轻量 stage-pack projection。

## Stage Candidate Portfolio Freeze

`stage-candidate-portfolio.schema.json` 冻结 OPL-owned refs-only stage candidate portfolio companion。它吸收 candidate 生成、假设拆解和评审循环经验，但只作为 contract-first projection surface：candidate、assumption decomposition、provenance check、negative 或 failed path、ranking / proximity / advisory metric ref、human review ref 都只以 refs 和状态进入 OPL。

该 portfolio 不是 domain candidate store、domain truth reducer、quality gate、artifact authority 或 owner receipt signer。advisory ranking 与 proximity metrics 只作为 review-routing 输入。domain 仓继续持有 candidate body、evidence body、accept/reject decision、domain truth、quality verdict、publication / fundability / visual authority、artifact body authority 和 owner receipt。

## Domain Memory Ref / Writeback Freeze

`family-domain-memory-ref.schema.json` 与 `family-domain-memory-writeback.schema.json` 补齐的是 stage-led agent framework 需要的记忆引用层。它们只描述 domain-owned memory pack 的 locator、freshness、stage targeting、proposal ref 和 router receipt ref。

family 基线规则固定为：domain memory 是由 domain 仓持有的 AI-readable Markdown reference memory。OPL Atlas、Pack、Stagecraft、Runway、Vault、Console、Connect 只承载 catalog、refs、prompt injection refs、receipts 和 projection；它们不是 route scorer、winning-path generator、quality gate 或 memory body owner。

`OPL` 可以做：

- discover / index domain memory refs；
- 在 stage attempt packet 中携带 `knowledge_refs`；
- 在 operator workbench 中展示 consumed refs、writeback proposal refs、accepted/rejected receipt refs；
- 检查 freshness 和 forbidden authority。

`OPL` 不可以做：

- 存储或改写 domain memory 正文；
- 把 memory card 提升为 evidence / review / grant / visual truth；
- 依据 memory refs 生成 publication strategy、fundability、visual 或 artifact winning path；
- 接受或拒绝 memory writeback；
- 依据 memory ref 生成 publication、fundability、visual quality 或 artifact readiness verdict。

MAS Publication Strategy Memory / `publication_route_memory`、MAG 的 grant strategy memory、RCA 的 visual pattern memory 都应通过各自 domain manifest 暴露 locator/receipt refs；Markdown 正文、路由判断、质量 gate、writeback accept/reject authority 和 artifact authority 保持在 domain 仓。

## 这个目录不冻结什么

这个目录不负责：

- 统一某一套 LLM wrapper
- 统一某一套 `Crew` / `Agent` / `Memory` runtime object model
- 引入 GraphFlow / GFL runtime、graph engine、planner、proof assistant、workflow compiler、stage runner 或 executor
- 固定某个具体模型家族
- 把 `OPL` 改写成 domain-owned truth 的 runtime owner
- 暗示跨仓 runtime core ingest 已经完成

## 预期吸收路径

- `one-person-lab`
  - 负责发布 contract 语言、schema 与 reference wording
- `med-autoscience`
  - 优先吸收 `family event envelope`、`family checkpoint lineage`、`family human gate`，并作为 persistence / lifecycle / owner-route 与 action catalog 的完整参考 adapter
- `med-autogrant`
  - 优先吸收 `family action graph`、`family action catalog`、`family human gate`、`family product-entry manifest v2`，并在现有 runtime-control 与 grant-progress surfaces 上提供轻 adapter
- `redcube-ai`
  - 优先吸收 `family product-entry manifest v2`，以及围绕 operator loop continuity 的 action-catalog / action-graph / gate 语义，并提供 managed-run/session/review projection 的厚 adapter

## 相关文档

- [Shared Runtime Contract](../../docs/specs/shared-runtime-contract.md)
- [Shared Domain Contract](../../docs/specs/shared-domain-contract.md)
- [吸收 CrewAI 的收编说明](../../docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md)
- [GraphFlow / GFL contract vocabulary reference](../../docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md)

## 文件

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-action-catalog.schema.json`](./family-action-catalog.schema.json)
- [`family-stage-control-plane.schema.json`](./family-stage-control-plane.schema.json)
- [`family-stage-admission.schema.json`](./family-stage-admission.schema.json)
- [`family-stage-proof-bundle.schema.json`](./family-stage-proof-bundle.schema.json)
- [`family-stage-graph-projection.schema.json`](./family-stage-graph-projection.schema.json)
- [`family-stage-cohort-loop.schema.json`](./family-stage-cohort-loop.schema.json)
- [`family-stage-runtime-budget.schema.json`](./family-stage-runtime-budget.schema.json)
- [`family-stage-integrity-metadata.schema.json`](./family-stage-integrity-metadata.schema.json)
- [`stage-candidate-portfolio.schema.json`](./stage-candidate-portfolio.schema.json)
- [`family-domain-memory-ref.schema.json`](./family-domain-memory-ref.schema.json)
- [`family-domain-memory-writeback.schema.json`](./family-domain-memory-writeback.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-runtime-supervision.schema.json`](./family-runtime-supervision.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-conflict-envelope.schema.json`](./family-conflict-envelope.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
