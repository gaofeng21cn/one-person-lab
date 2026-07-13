# OPL Framework 合同

Owner: `One Person Lab`
Purpose: `opl_framework_contract_support_index`
State: `active_support`
Machine boundary: 本文是 OPL Framework contracts 的人读支撑索引。机器 truth 继续归 JSON contract files、source、tests、CLI/read-model、runtime ledger 和 provider/domain receipts。

这个目录保留 `OPL Framework` 当前活跃的 framework、runtime 与 family control-plane 合同语料。`One Person Lab App` 和 Foundry Agents 可以消费这些合同，但不在本目录定义自己的第二套运行时真相。

它继续被仓库跟踪，是因为当前 framework 需要稳定的机器可读输入：

- stage-led 任务选择
- `OPL Framework`、`One Person Lab App` 与 `Foundry Agents` 的产品层所有权
- 已收录 domain-agent / Foundry package 目录投影
- provider-backed runtime attempt
- Codex-selected semantic route 的被动 transport/currentness readback；Framework 不运行 transition table、route oracle 或 matrix evaluator
- StageRun transport 覆盖 queue、raw artifact capture、refs-only memory writeback、human gate、retry、dead-letter 与 repair request
- domain pack compiler 与 generated interface 只读模型编译 admitted domain pack 或标准智能体仓合同，投影 OPL-owned CLI / MCP / Skill / product-entry / OpenAI / AI SDK / sidecar / status / workbench / harness generated-surface handoff
- Pack Bundle 把大型 JSON consumer surface 拆成可编辑 source parts、可再生 aggregate 和 bundle manifest，避免继续手改巨大聚合文件，同时保持生成物只作为 consumer compatibility surface
- brand-module governance 通过 registry、模块自有品牌 CLI command surface、read-model projection、validation gate 和 false-authority boundary，让 Charter、Atlas、Workspace、Pack、Stagecraft、Runway、Ledger、Console、Foundry Lab 与 Connect 保持 Workspace-level structural baseline
- 复杂 domain agent 的 stage graph / owner-route hydration / reconciliation / attempt ledger 调度边界，其中 stage 是 OPL attempt 单元，route 是 domain owner 语义，不是小 stage
- Codex CLI 单一 stage 语义路由 owner：OPL 只做 declared-stage transport、identity/currentness、attempt durability 与被动投影
- surface budget 治理，把新增 default surface 限制在 launch safety、authority boundary、evidence / replay / audit / route-back 或 App/runtime 反复消费这些理由内
- target operating architecture 治理，把理想资源模型、Codex-owned 语义路由、Declarative Domain Pack / authority ABI、被动 transport/currentness、Atlas/Ledger telemetry、App Console 收薄与 Agent Lab improvement 边界冻结成顶层机器合同
- target architecture contract kernels，把 current owner delta、stage artifact unit、owner answer、passive evidence ledger、ordinary golden path、advisory no-progress signal、guardrail tiers、progress truth、wrapper retirement 与 default surface budget 落成机器面，同时不把 domain truth 移入 OPL
- cognitive computation kernel 治理，让每个 Stage 声明 generation、reflection、comparative selection、evolution、meta-review、tool affordance boundary、knowledge 与独立 quality gate refs；工具目录是 affordance catalog，不是 workflow script；Route 仍是 domain owner 语义，不是小 Stage
- advisory knowledge boundary 治理 domain-owned Markdown memory，让 Atlas / Pack / Stagecraft / Runway / Ledger / Console / Connect 只承载 refs、prompt-context refs、receipts 和 projection，不变成 route scorer、winning-path generator、memory-body owner、quality gate 或 export / publication verdict owner
- 通用 workspace / source / artifact / memory substrate 投影与 App/operator workbench 分组，同时不把 domain truth / body / verdict / authority 移入 OPL
- OPL-compatible agent 的 framework 运行依赖定位
- Runtime Manager readiness 与状态投影
- GUI 实现消费的 App runtime state/action CLI 边界
- 可选 native helper 生命周期检查

当前主线是 `OPL Framework -> One Person Lab App / CLI -> Foundry Agents`。`one-person-lab` 持有 framework/runtime/CLI/contracts 层，`one-person-lab-app` 持有 GUI product truth 和 release validation，`opl-aion-shell` 是当前 shell implementation carrier，MAS/MAG/RCA 持有各自 domain app/runtime authority。执行链路仍是 `Codex CLI first-class executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`。

## 当前真相应去哪里看

当前 `OPL Framework / App / Foundry Agents` 模型应优先回到：

- `README*`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/README.md`

如果要恢复当前 repo-owned capability surface，则继续阅读已收录 domain 仓及其被 `opl connect sync-skills` 激活的 app skill。

## 目标架构合同组

这些 schema 文件是 OPL target architecture 的机器可读面。它们的 machine boundary 只覆盖 framework-owned 形状、refs、launch / audit / fail-closed 语义与 App/operator 投影；不把 domain truth、artifact body、memory body、owner receipt authority、quality verdict、production readiness 或 App release authority 移入 OPL。

### Target Operating Architecture

- `target-operating-architecture-contract.json`：顶层目标操作架构合同。它冻结资源词汇、Codex CLI 单一 stage 语义 route owner、任意可读 artifact 即可推进、Domain Pack + generated surfaces + authority functions 标准 ABI，以及 OPL 只做被动 transport/currentness/runtime projection 的边界。
- `advisory-knowledge-boundary-contract.json`：family-level domain-owned Markdown memory 边界合同。它固定默认规则：memory refs 是 `reference_only_prompt_context`，OPL 默认只运输 body-free refs，缺少 advisory memory 不阻断 launch；只有 source/data authority、owner identity、forbidden write、不可逆 mutation、hard reviewer / publication / final export / submission claim 或 owner-receipt / typed-blocker claim 才升级为 hard gate。

### Owner Delta Kernel

- `current-owner-delta.schema.json`：紧凑的默认 owner / delta / hard-gate / action payload 与 ordinary next-action root。
- `owner-answer.schema.json`：owner receipt、typed blocker、human decision 与 route-back 的统一 return shape。

### Stage Artifact Unit

- `stage-run-kernel-contract.json`：refs-only StageRun transport/event-log/read-model、currentness、quality budget、failure diagnostic 与 domain authority boundary。
- `stage-artifact-unit.schema.json`：physical output、manifest、content hashes、owner answer、current pointer、lineage 与 progress truth 边界。
- `stage-artifact-progress-truth-policy.json`：任意可读 physical output 即为 progress；manifest、receipt、pointer、hash、reviewer 与 schema 缺口只形成质量债。
- `workspace-topology-profile.schema.json`：`Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker` profile schema，固定 `workspace_modes=one_off|series|portfolio`、默认 physical `project_collection_path=projects`、默认 `projects/<project-id>`、RCA series `projects/<deck-id>`、MAS portfolio `projects/<study-id>`、`project_stage_outputs_root=artifacts/stage_outputs` 与 runtime-state-as-provider-backing/provenance 边界；`studies` / `deliverables` 只保留为 display label、legacy alias、adopt/provenance terminology 或 domain semantic alias。
- `pack-bundle-contract.json`：大型 JSON consumer surface 的 source-parts 到 generated-aggregate 合同。它由 `src/pack-bundle.ts` 与 `opl pack bundle manifest|write|check --assembly <path> --json` 消费。可编辑 source parts 是真相源；generated aggregate JSON 只是带 generated metadata 和 `do_not_edit=true` 的 tracked consumer compatibility surface；bundle manifest 记录 source entries、source digest、expected aggregate hash、generator commands 和 false-authority flags。Bundle validation 只证明 source/aggregate 一致性，不声明 domain ready、production ready、quality verdict、artifact authority、owner receipt、typed blocker 或 domain truth mutation。
- `pack-native-helper-probe-contract.json`：Pack 对 domain-owned native helper 的 provider/domain-neutral 探测合同。`opl pack native-helper probe --descriptor <path> --json` 只解析 descriptor-relative helper entrypoint 与声明的 runtime/tool commands，返回由 descriptor/content SHA-256 绑定的确定性 `resolved|missing` receipt；它不执行 helper、不渲染 PDF/image asset、不修改 artifact、不签 owner receipt、不创建 typed blocker，也不授权 quality/publication/export readiness。
- `pack-native-helper-execution-contract.json`：Pack + Runway 的通用 Python helper 执行载体。`opl pack native-helper run --catalog <catalog.json> --helper <id> --request <request.json> --json` 只解析 domain 声明且 containment 通过的 source root / module / argv，持有有界进程生命周期并要求 stdout 为单一 JSON；receipt 只记录 transport provenance，不授权 domain truth、视觉质量、artifact mutation、export readiness 或 production readiness。
- `agent-scaffold-materialization-request.schema.json` 与 `agent-scaffold-materialization-contract.json`：OPL Foundry Lab 消费 OMA semantic scaffold request 的物理物化边界。只替换声明文件，只允许 descriptor/capability map 浅合并，path/symlink escape fail closed，最终文件 SHA-256 与 build receipt 由 OPL 按写后 bytes 生成；OMA 输入仍是 candidate，validation refs 仍是待执行请求而不是通过或 readiness claim。
- `standard-agent-implementation-profile.schema.json`：标准 Agent 的实现语言与 helper 边界。`implementation_profile` 只把 identity 固定为 declarative Markdown/JSON pack，允许 authority/domain/native helper 可替换，明确 helper 语言不是 Agent kind，`rust_policy=framework_hot_path_only`；generated surfaces 仍归 OPL。新 scaffold 默认生成该 profile，legacy pack 缺失在 conformance 中作为迁移缺口读取。
- `source-derived-agent-design-abi.json`：OMA 等 producer 向 OPL Foundry Lab 提交 source-derived Agent design typed objects 时使用的通用 identity；producer 保留设计语义，Framework 持有校验、物化 digest 和最终 `AgentBuildReceipt`。
- `python-executor-client-contract.json`：`opl executor run` 的共享 Python carrier，持有临时 request 与 process-group cleanup，解包 canonical `AgentExecutionReceipt`，并对 timeout、非零退出、JSON 或 receipt shape 漂移 fail closed，不接管 executor 或 domain authority。
- `pack-os-contract.json`：通用 Pack OS lifecycle 合同，覆盖 capability-pack descriptors、install registry entries、content-addressed cache manifests、refs-only distribution bundles、refs-only lock projection、artifact lifecycle refs 与 review receipt transport。它由 `src/modules/pack/pack-os.ts` 与 `opl pack os inspect|install|registry|cache|distribute|lock|validate --json` 消费。domain-owned adapter 负责产出通用descriptor；Pack OS不再保留MAS专用conversion或smoke contract。lock和distribution bundle只记录descriptor refs、本地存在文件的content hashes、artifact locator refs、lifecycle state refs、review receipt refs、provenance与authority-boundary flags，不存artifact body、不改domain artifact、不签owner receipt、不授权quality/readiness claim。

### Evidence Ledger

- `evidence-ledger-event.schema.json`：raw evidence、provider trace、replay、receipt ledger、typed blocker group、soak、no-regression、cleanup 与 diagnostic refs 的 passive audit-only event envelope。
- `observability-semantic-conventions-contract.json`：OPL Ledger / Runway / Console 共享的 trace、metric、log/event 语义词汇，固定 `stage_run_id`、`attempt_id`、`domain_id`、`owner_id`、`route_ref`、`receipt_ref`、`typed_blocker_ref`、`workflow_id`、`task_queue`、`generation`、`source_fingerprint` 等 refs-only 字段；它不创建私有 ledger UI，不保存 payload body，不写 domain truth，不创建 owner receipt / typed blocker，也不声明 readiness。
- `cli-command-registry.json`：受保护 CLI 的 canonical metadata registry，记录 parser adapter、options、output schema ref 与 authority boundary。command spec 直接绑定该 metadata，不再内联重复；registry 不执行命令，也不声明 readiness。
- `src/entrypoints/cli/command-surface-manifest.ts`：完整 CLI surface 的生成式 metadata-only registry。`npm run cli:surface:generate` 从 executable builder 派生命令条目；`main.ts` 只有在命令选定后才加载这些 builder。

### Golden Path

- `golden-path-profile.schema.json`：每个 Foundry Agent 一个 ordinary route，以及显式 proof / diagnostic / cleanup / replay / debug variants。
- `default-surface-budget.schema.json`：default / diagnostic / audit / production / cleanup 可见性和升级门，并带 false authority flags。
- `guardrail-tier-policy.json`：launch-hard、runtime-enforced、domain/human 与 audit-only guardrail tier 边界。
- `wrapper-retirement-gate-policy.json`：replacement parity、no-active-caller、no-forbidden-write 与 tombstone/provenance 静态退役前置条件，以及独立的 domain owner 删除 / 保留 / blocker 裁决形态。

### Cognitive Computation Kernel

- `cognitive-computation-kernel.json`：Stage 内部策略内核，覆盖 candidate generation、grounded reflection、comparative selection、evolution/revision、meta-review learning、tool affordance boundary、knowledge binding 与 independent quality gates。`tool_refs` 只表示可用 affordance 及其安全 / 权限 / 凭据 / 可写范围 / forbidden-authority 边界，不规定 executor 必须怎么用、什么时候用或按什么顺序用。该合同保持 Route 为 domain owner 下一步语义，保持 OPL 为 refs-only runtime/control-plane owner。标准 Foundry Agent 还必须声明 `contracts/stage_run_canary_evidence.json`，用 controlled fixture 证明 Stage 内认知循环的 refs-only closeout 形态：candidate、reflection、ranking、revision、meta-review 和 independent gate 都有 role artifact refs，closeout 只能是 owner receipt 或 typed blocker，且不得把 controlled fixture、provider completion、file presence、read-model refresh 或 conformance pass 写成 live domain progress。`opl agents conformance` 会从该 fixture 派生 `operator_summary`，让 App/operator 能看到 AI 做过哪些候选、反思、比较、修订和独立 gate refs；同一 gate 会扫描并阻断 domain-ready、quality/export-ready、artifact-ready、production-ready 或 live-progress 过度声明。

## 这个目录应该怎么读

- `workstreams.json`、`domains.json`、`stage-selection-vocabulary.json`、`task-topology.json`、`public-surface-index.json`、`brand-module-registry.json`、`brand-cli-governance.json`、`brand-module-surfaces.json`、`brand-module-l5-operating-evidence.json`、`brand-system-profile.json`、`target-operating-architecture-contract.json`、`pack-bundle-contract.json` 和 `surface-budget-policy.json` 定义当前活跃的 stage-led framework 选择面、Framework / App / Foundry 的产品层 owner split、当前 OPL brand module registry、模块自有 brand CLI command surface、模块自有 read-model/validate/doctor surface、L5 evidence matrix、品牌系统冻结基线、target operating architecture 基线、Pack Bundle source-parts/generated-aggregate 边界、default surface 升级预算，以及 OPL-compatible agents 用来定位外部 framework 运行依赖的 `opl_framework_locator` surface。`brand-module-registry.json` 由 `opl brand-modules list|inspect|maturity|validate|interfaces --json` 消费；`brand-cli-governance.json` 由 `opl agents modules list|inspect|interfaces|validate|doctor --json` 和模块 command-surface collision policy 消费；`brand-module-surfaces.json` 由 `opl charter|atlas|workspace|pack|stagecraft|runway|ledger|console|foundry-lab|connect status|inspect|interfaces|validate|doctor --json` 消费；`brand-module-l5-operating-evidence.json` 由 L5 status/validate/interfaces 和 refs-only evidence ledger 消费；`brand-system-profile.json`、`target-operating-architecture-contract.json` 与 `pack-bundle-contract.json` 由 `contract validate` 和 focused tests 读取，用来冻结三层产品认知、目标资源词汇、单一 authority、generated-surface ABI、surface lane、App 默认字段、Agent Lab false-authority 边界与大型聚合 surface 的 source truth / generated compatibility 分工。它们共同只证明 `L4_structural_baseline` 结构、L5 证据矩阵形状、bounded refs transport、品牌系统语言/pattern、目标架构边界和 Pack Bundle source/aggregate 一致性，不声明 domain ready、quality verdict、artifact authority、production ready、domain truth write、owner receipt、typed blocker、App release truth 或 L5 completion。`public-surface-index.json` 还为每个 active public surface 绑定 `surface_budget` envelope，包括 default-state reason、promotion evidence refs、consumer refs，以及不得声明 domain ready、quality verdict、artifact authority、production ready、executor planning 或 domain owner 的 authority false flags。
- `family-product-operator-projection.json` 同时声明 GUI runtime 边界：`opl app state --profile fast --json` 提供默认页面状态，`opl app state --profile full --json` 用于显式刷新，`opl app action execute ... --json` 承接 App mutation，`opl runtime app-operator-drilldown --detail full --json` 是运行状态 full drilldown 的按需例外。OPL Framework 只做 GUI-ready state/action producer；GUI 产品真相、release gate、页面状态政策与 active-shell validation 仍归 `one-person-lab-app`；`opl-aion-shell` 是当前 App-owned contract 的 implementation carrier，且不能把 raw full drilldown 当成正常 GUI state。
- `family-runtime-online-substrate-contract.json`、`family-runtime-attempt-contract.json`、`stage-route-transport-contract.json`、`cognitive-computation-kernel.json`、`stage-artifact-runtime-contract.json`、`state-index-kernel-contract.json`、`domain-pack-compiler-contract.json`、`pack-os-contract.json`、`generic-substrate-projection-contract.json`、`foundry-agent-series-contract.json`、`standard-domain-agent-skeleton-contract.json`、`functional-privatization-audit-envelope-contract.json`、`managed-runtime-three-layer-contract.json` 和 `runtime-manager-contract.json` 是当前 provider-backed family runtime / generated-surface / generic pack lifecycle 主线的活跃机器合同。`foundry-agent-series-contract.json` 是 MAS/MAG/RCA/OMA/new agent 共享的 Progress-First 系列合同：每个 Foundry Agent 都声明同一组 identity、stage authority、progress/currentness/closeout packet、typed blocker lineage 与 App projection 边界，同时把 domain truth 和 verdict authority 留在 domain repo。`stage-route-transport-contract.json` 固定 OPL 的 graph/reconciliation/read-model 调度边界：OPL 持有 stage graph、route hydration、attempt ledger 和 reconciliation loop；domain owner 持有 route 语义、owner receipt、typed blocker、truth、quality verdict 和 artifact authority。`cognitive-computation-kernel.json` 定义 Stage 内部认知策略层：generation、reflection、comparative selection、evolution、meta-review、available tool affordances、knowledge use 与 independent quality gates 都是 stage-pack declarations 和 refs，不是 OPL-held domain truth、route execution semantics 或工具 workflow script。`stage-artifact-runtime-contract.json` 固定 Stage Folder Contract：`runtime-state/domains/<domain>/deliverables/<program>/<topic>/<deliverable>/stages/<nn-stage>/attempts/<attempt_id>`、attempt 必备条目、`opl stage open`、receipt-backed `opl stage commit`、物理目录优先的 `status` / `explain`、可重建 index、latest/current pointer 维护、refs-only canonical pointer promote、sha256 content hash、lineage event、strict conformance、artifact-native workbench projection 和 dry-run-first retention/restore 边界。`state-index-kernel-contract.json` 固定 SQLite sidecar 分工：file / Stage Folder 仍是 portable truth，SQLite 只存 stage-attempt / lifecycle / artifact / lineage / outbox / read-model 的可重建索引和有界 payload envelope，Temporal 仍是 production durable execution substrate；SQLite 不存 domain truth、memory body、artifact blob、owner receipt authority、quality/export verdict、provider authority 或 production readiness authority。`opl index doctor|rebuild|checkpoint|integrity-check|backup --json` 是这条分工的可执行维护面：`doctor` 只读诊断，`rebuild` 维护 `${OPL_STATE_DIR}/family-runtime` 四个 OPL sidecar 数据库，并从物理 Stage Folder 的 manifest、receipt refs、content hash、lineage 和 retention proof 回填 `artifact-index.sqlite` 与 `read-model.sqlite` refs-only rows。标准 Foundry Agent 通过 `contracts/stage_run_kernel_profile.json`、`contracts/stage_run_canary_evidence.json` 和 `contracts/stage_artifact_kernel_adoption.json#/opl_state_index_kernel_adoption` 声明 domain 侧接入分工；独立 state-index adoption 文件只保留兼容读取且不由 scaffold 生成。`opl agents conformance` 会阻止缺失 StageRun profile、缺失 controlled canary evidence、SQLite truth store、大 body、owner receipt、verdict、未知 ownership declaration 和 generic persistence owner 声明。Stage 路由由 Codex CLI 根据 declared stage context 选择；OPL 不再编译 transition runner 或 functional harness。`functional-privatization-audit-envelope-contract.json` 定义 AI-first、contract-light 的 envelope，供 descriptor 与 App/operator drilldown 归一化 MAS、MAG、RCA 和标准 scaffold 的私有功能审计形状，但不声明 domain truth 或 readiness。`domain-pack-compiler-contract.json` 定义 `opl agents pack-compiler`、`opl agents interfaces` 和 `opl agents conformance` 只读把 descriptor、标准仓 action/stage 合同、runtime surface 和 `functional_privatization_audit` 投影成 OPL-owned generated-surface、generated interface bundle 与 family-wide standard-agent conformance report，并在 pack compiler list/inspect 中输出 `generated_artifact_drift_manifest`，记录 domain pack/source input fingerprint、generated bundle fingerprint、`generated_from` refs 与 `aligned` / `drift_detected` 状态。`pack-os-contract.json` 定义 `opl pack os inspect|install|registry|cache|distribute|lock|validate --json`，把 capability-pack descriptor解析为refs-only registry entry、content-addressed cache manifest、distribution bundle、lock、content hash、artifact locator refs、lifecycle refs和review receipt transport；domain-owned adapter负责产出通用descriptor，Pack OS不保留domain-specific conversion或smoke contract。`agents conformance` 把 scaffold validation、canonical `agent/` pack root、README-only path guard、generated-surface owner、generated interface readiness、private-surface generic-owner guard、StageRun profile、controlled StageRun canary evidence、Stage Artifact adoption、State Index adoption、Foundry series contract 和 production evidence tail 拆成机器读面；它只证明结构归位和 controlled fixture 证据形态，不声称 live soak、App 真实用户路径或 domain readiness 已完成。这些命令可从同一份 canonical action/stage metadata 派生 CLI、MCP、Skill、product-entry、OpenAI 和 AI SDK 描述；它们不生成 domain handler，不写 domain truth / memory body / artifact，也不授权 quality 或 export verdict。`generic-substrate-projection-contract.json` 定义 OPL 对 domain-declared workspace、source、artifact、memory refs 的 locator / index / lifecycle projection，以及 App/operator drilldown workbench 分组；它不读取或写入 domain truth / body / verdict / authority。`family-runtime-online-substrate-contract.json` 同时声明 Temporal provider SLO cadence action envelope，用于路由 supervised production proof 执行，但不授权 domain readiness。
- `family-runtime-attempt-contract.json` 同时定义 `current_provider_readiness` 与 `stage_progress_log` 作为 OPL family-runtime attempt/progress canonical projection。`current_provider_readiness` 暴露在 `attempt query` 顶层 wrapper、嵌套 `stage_attempt_query` 与 operator visibility；它是当前 provider inspection，并显式标记创建时 `provider_receipt` 只是 snapshot。`stage_progress_log` 的 `surface_kind=opl_stage_progress_log`，该读面把 intended work、actual work、timeline、usage、Temporal visibility refs、evidence refs、authority boundary、provider status refs 和 domain receipt refs 投到 `attempt query`、operator visibility、Agent Lab improvement inputs 与 runtime-tray workbench summary。其 `user_stage_log` 子面向用户回答 stage 名称、问题、做了什么、耗时、token/cost 状态、结果、剩余 blocker 和证据 refs；OPL 只拥有 timing / usage / refs 与显式 missing/null 状态，人话 domain 语义必须来自 domain typed closeout 的 `user_stage_log`、`stage_log_summary` 或 `human_stage_log`。同一合同现在包含 clean-room 吸收 PilotDeck 模式后的 `memory_trace_projection` 与 `model_route_cost_projection`：memory trace 只投影 consumed memory refs、recall/retrieval trace refs、writeback receipt refs、rejected write refs 和 source refs，不读 memory body；route/cost 只把 selected model/executor route refs、route reason/tier/fallback refs 与 observed token/cost telemetry 关联起来，不改 executor、不自动降级、不替代 quality gate。summary 同时区分原始 usage duration telemetry 与 user-facing duration：`duration_observed_attempt_count` 只统计 usage/provider telemetry，`user_duration_observed_attempt_count` / `user_duration_fallback_attempt_count` 统计 `user_stage_log.duration` 中由 usage、provider started/completed 或 attempt created/updated 时间戳支撑的用户可读 duration，不把 fallback 写成 token/cost telemetry。标准 OPL Agent 使用 `stage_work_done` / `changed_stage_surfaces` 描述 domain deliverable 改动。Temporal provider 持有 durable workflow history、activity heartbeat、workflow query 与 searchable visibility；OPL 只把 `temporal_visibility` / `temporal_webui_ref` 投影为 refs-only metadata，Temporal Web UI ref 只用于 operator debug，不是 App 主状态页。Agent Lab 只消费这些 refs 作为 evaluation、root-cause、candidate fix 和 follow-up read model 证据；它不拥有 runtime log、不执行 domain action、不写 domain truth，也不授权 quality 或 domain-ready verdict。退役 execution-log wording 只能出现在 tombstone/provenance 语境。
- `advisory-knowledge-boundary-contract.json` 是 family-level advisory knowledge 边界。它保持 domain Markdown memory 作为小集合、body-free、reference-only prompt context，并禁止 OPL 品牌模块把 memory refs 升级成 route scoring、winning-path generation、controller decision、quality gate、export / publication / submission gate、owner receipt 或 typed blocker。
- `attempt_true_path_proof` 是 refs-only 证明面，用来把同一 stage attempt 在 `attempt query`、stage-attempt projection、App full drilldown、`stage_progress_log`、Temporal visibility 和 Temporal Web UI debug refs 中的路径绑定起来。它只证明当前真路径可追踪，不声明 long-soak、domain ready、artifact authority 或 quality verdict。
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`、`contracts/family-orchestration/family-stage-graph-projection.schema.json` 和 `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` 是 stage-pack proof、graph、integrity、claim-support、evidence-handoff、data-access 与 human-checkpoint metadata 的 companion contracts。它们属于 family orchestration，因为 MAS/MAG/RCA 把 domain projection 或 adapter 投影到这些 schema，同时把 domain truth 与 verdict authority 留在各自仓库；legacy citation-support 只作为 profile alias，不再是通用 ontology。
- `family-executor-adapter-defaults.json` 继续作为共享 executor 合同使用。
- 已退役的 gateway、federation、routed-action、onboarding、acceptance、governance 与 example corpora 不再保留在这个活跃 contract root 中。

## 文件清单

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `agent-lab-contract.json`
- `agent-lab-failure-token-registry.json`
- `self-evolution-work-order.schema.json`
- `external-suites/mag-live-acceptance-suite.json`
- `agent-platform-surface-ownership-contract.json`
- `brand-module-registry.json`
- `brand-cli-governance.json`
- `brand-module-surfaces.json`
- `brand-module-l5-operating-evidence.json`
- `brand-system-profile.json`
- `cli-command-registry.json`
- `target-operating-architecture-contract.json`
- `observability-semantic-conventions-contract.json`
- `advisory-knowledge-boundary-contract.json`
- `codex-default-profile.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `stage-run-kernel-contract.json`
- `stage-route-transport-contract.json`
- `cognitive-computation-kernel.json`
- `stage-artifact-runtime-contract.json`
- `current-owner-delta.schema.json`
- `stage-artifact-unit.schema.json`
- `stage-artifact-progress-truth-policy.json`
- `workspace-topology-profile.schema.json`
- `owner-answer.schema.json`
- `evidence-ledger-event.schema.json`
- `golden-path-profile.schema.json`
- `guardrail-tier-policy.json`
- `wrapper-retirement-gate-policy.json`
- `default-surface-budget.schema.json`
- `state-index-kernel-contract.json`
- `family-domain-quality-projection-contract.json`
- `family-incident-learning-loop.json`
- `family-product-operator-projection.json`
- `domain-pack-compiler-contract.json`
- `pack-bundle-contract.json`
- `pack-os-contract.json`
- `generic-substrate-projection-contract.json`
- `foundry-agent-series-contract.json`
- `standard-domain-agent-skeleton-contract.json`
- `functional-privatization-audit-envelope-contract.json`
- `fresh-install-test-matrix.json`
- `native-helper-contract.json`
- `surface-budget-policy.json`
- `public-surface-index.json`
- `task-topology.json`

## 阅读规则

- 本目录按活跃 OPL framework contract set 读取
- `opl framework locate` / `opl_framework_locator` 是 standalone OPL-compatible agents 找到外部 OPL Framework 依赖环境的稳定入口
- Runtime Manager、family runtime attempt、domain pack compiler、generated interface bundle 与 standard domain-agent skeleton 合同按 provider-backed family runtime / generated-surface 主线活跃依据读取
- domain truth 继续归对应 domain 仓所有，而不是归这个目录所有
- Foundry Agents 应声明并适配这些 framework contracts；不应 vendored / fork 一份 OPL runtime 作为独立真相
- One Person Lab App 按 projection consumer 和工作台 surface 读取；它不是 runtime provider 或 domain authority
