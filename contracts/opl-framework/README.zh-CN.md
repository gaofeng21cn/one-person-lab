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
- domain-neutral transition table runner 与 matrix evaluation
- functional agent runtime harness 覆盖 queue、typed closeout、refs-only memory writeback、human gate、retry、dead-letter 与 repair transitions
- domain pack compiler 与 generated interface 只读模型编译 admitted domain pack 或标准智能体仓合同，投影 OPL-owned CLI / MCP / Skill / product-entry / OpenAI / AI SDK / sidecar / status / workbench / harness generated-surface handoff
- 复杂 domain agent 的 stage graph / owner-route hydration / reconciliation / attempt ledger 调度边界，其中 stage 是 OPL attempt 单元，route 是 domain owner 语义，不是小 stage
- surface budget 治理，把新增 default surface 限制在 launch safety、authority boundary、evidence / replay / audit / route-back 或 App/runtime 反复消费这些理由内
- 通用 workspace / source / artifact / memory substrate 投影与 App/operator workbench 分组，同时不把 domain truth / body / verdict / authority 移入 OPL
- OPL-compatible agent 的 framework 运行依赖定位
- Runtime Manager readiness 与状态投影
- GUI 实现消费的 App runtime state/action CLI 边界
- 可选 native helper 生命周期检查

当前主线是 `OPL Framework -> One Person Lab App / CLI -> Foundry Agents`。执行链路仍是 `Codex CLI first-class executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`。

## 当前真相应去哪里看

当前 `OPL Framework / App / Foundry Agents` 模型应优先回到：

- `README*`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/README.md`

如果要恢复当前 repo-owned capability surface，则继续阅读已收录 domain 仓及其被 `opl skill sync` 激活的 app skill。

## 这个目录应该怎么读

- `workstreams.json`、`domains.json`、`stage-selection-vocabulary.json`、`task-topology.json`、`public-surface-index.json` 和 `surface-budget-policy.json` 定义当前活跃的 stage-led framework 选择面、Framework / App / Foundry 的产品层 owner split、default surface 升级预算，以及 OPL-compatible agents 用来定位外部 framework 运行依赖的 `opl_framework_locator` surface。
- `family-product-operator-projection.json` 同时声明 GUI runtime 边界：`opl app state --profile fast` 提供默认页面状态，`opl app state --profile full` 用于显式刷新，`opl app action execute` 承接 App mutation，`opl runtime app-operator-drilldown --detail full` 是运行状态 full drilldown 的按需例外。GUI 产品真相与 release gate 仍归 `one-person-lab-app`；shell 仓只实现 App-owned contract。
- `family-runtime-online-substrate-contract.json`、`family-runtime-attempt-contract.json`、`stage-route-scheduler-contract.json`、`family-transition-runner-contract.json`、`functional-agent-runtime-harness-contract.json`、`domain-pack-compiler-contract.json`、`generic-substrate-projection-contract.json`、`standard-domain-agent-skeleton-contract.json`、`functional-privatization-audit-envelope-contract.json`、`managed-runtime-three-layer-contract.json` 和 `runtime-manager-contract.json` 是当前 provider-backed family runtime / generated-surface 主线的活跃机器合同。`stage-route-scheduler-contract.json` 固定 OPL 的 graph/reconciliation/read-model 调度边界：OPL 持有 stage graph、route hydration、attempt ledger 和 reconciliation loop；domain owner 持有 route 语义、owner receipt、typed blocker、truth、quality verdict 和 artifact authority。`family-transition-runner-contract.json` 和 `runtime-manager-contract.json` 只在 route-as-transition / operator projection 层配合使用，不能把 route 写成 nested stage。`functional-agent-runtime-harness-contract.json` 证明构造与 domain-declared 功能链路，但不授权 live soak 或 domain readiness。`functional-privatization-audit-envelope-contract.json` 定义 AI-first、contract-light 的 envelope，供 descriptor 与 App/operator drilldown 归一化 MAS、MAG、RCA 和标准 scaffold 的私有功能审计形状，但不声明 domain truth 或 readiness。`domain-pack-compiler-contract.json` 定义 `opl agents pack-compiler`、`opl agents interfaces` 和 `opl agents conformance` 只读把 descriptor、标准仓 action/stage 合同、runtime surface 和 `functional_privatization_audit` 投影成 OPL-owned generated-surface、generated interface bundle 与 family-wide standard-agent conformance report，并在 pack compiler list/inspect 中输出 `generated_artifact_drift_manifest`，记录 domain pack/source input fingerprint、generated bundle fingerprint、`generated_from` refs 与 `aligned` / `drift_detected` 状态。`agents conformance` 把 scaffold validation、canonical `agent/` pack root、README-only path guard、generated-surface owner、generated interface readiness、private-surface generic-owner guard 和 production evidence tail 拆成机器读面；它只证明结构归位，不声称 live soak、App 真实用户路径或 domain readiness 已完成。这些命令可从同一份 canonical action/stage metadata 派生 CLI、MCP、Skill、product-entry、OpenAI 和 AI SDK 描述；它们不生成 domain handler，不写 domain truth / memory body / artifact，也不授权 quality 或 export verdict。`generic-substrate-projection-contract.json` 定义 OPL 对 domain-declared workspace、source、artifact、memory refs 的 locator / index / lifecycle projection，以及 App/operator drilldown workbench 分组；它不读取或写入 domain truth / body / verdict / authority。`family-runtime-online-substrate-contract.json` 同时声明 Temporal provider SLO cadence action envelope，用于路由 supervised production proof 执行，但不授权 domain readiness。
- `family-runtime-attempt-contract.json` 同时定义 `stage_progress_log` 作为 OPL family-runtime attempt/progress canonical projection，`surface_kind=opl_stage_progress_log`。该读面把 intended work、actual work、timeline、usage、Temporal visibility refs、evidence refs、authority boundary、provider status refs 和 domain receipt refs 投到 `attempt query`、operator visibility、Agent Lab improvement inputs 与 runtime-tray workbench summary。其 `user_stage_log` 子面向用户回答 stage 名称、问题、做了什么、耗时、token/cost 状态、结果、剩余 blocker 和证据 refs；OPL 只拥有 timing / usage / refs 与显式 missing/null 状态，人话 domain 语义必须来自 domain typed closeout 的 `user_stage_log`、`paper_stage_log` 或 `stage_log_summary`。Temporal provider 持有 durable workflow history、activity heartbeat、workflow query 与 searchable visibility；OPL 只把 `temporal_visibility` / `temporal_webui_ref` 投影为 refs-only metadata，Temporal Web UI ref 只用于 operator debug，不是 App 主状态页。Agent Lab 只消费这些 refs 作为 evaluation、root-cause、candidate fix 和 follow-up read model 证据；它不拥有 runtime log、不执行 domain action、不写 domain truth，也不授权 quality 或 domain-ready verdict。退役 execution-log wording 只能出现在 tombstone/provenance 语境。
- `attempt_true_path_proof` 是 refs-only 证明面，用来把同一 stage attempt 在 `attempt query`、`queue inspect`、App full drilldown、`stage_progress_log`、Temporal visibility 和 Temporal Web UI debug refs 中的路径绑定起来。它只证明当前真路径可追踪，不声明 long-soak、domain ready、artifact authority 或 quality verdict。
- `family-executor-adapter-defaults.json` 继续作为共享 executor 合同使用。
- 已退役的 gateway、federation、routed-action、onboarding、acceptance、governance 与 example corpora 不再保留在这个活跃 contract root 中。

## 文件清单

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `agent-lab-contract.json`
- `agent-lab-mag-live-acceptance-suite.json`
- `agent-platform-surface-ownership-contract.json`
- `codex-default-profile.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `stage-route-scheduler-contract.json`
- `family-transition-runner-contract.json`
- `family-domain-quality-projection-contract.json`
- `family-incident-learning-loop.json`
- `family-product-operator-projection.json`
- `functional-agent-runtime-harness-contract.json`
- `domain-pack-compiler-contract.json`
- `generic-substrate-projection-contract.json`
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
- Runtime Manager、family runtime attempt、family transition runner、functional agent runtime harness、domain pack compiler、generated interface bundle 与 standard domain-agent skeleton 合同按 provider-backed family runtime / generated-surface 主线活跃依据读取
- domain truth 继续归对应 domain 仓所有，而不是归这个目录所有
- Foundry Agents 应声明并适配这些 framework contracts；不应 vendored / fork 一份 OPL runtime 作为独立真相
- One Person Lab App 按 projection consumer 和工作台 surface 读取；它不是 runtime provider 或 domain authority
