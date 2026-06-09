# OPL 关键决策

Owner: `One Person Lab`
Purpose: `decisions`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 2026-06-09

### 决策：普通推进主干与审计证据旁路分层治理

原因：MAS / OPL 最近的卡住现象集中在普通推进路径被 closeout、currentness、receipt accounting、read-model reconcile、StageRun binding、restore proof、readiness inventory、refs-only ledger 和 cleanup / production evidence 尾项拖住。RCA、DeepScientist 和旧 MDS 的顺滑体感说明默认控制面必须短；但这不代表恢复旧 backend 或降低 domain authority，而是要把审计证明从普通推进主干中分离出来。

影响：

- OPL family 的普通推进主干固定为 `current_owner_delta -> current stage goal -> executor concrete delta -> ProgressDeltaReceipt / OwnerReceipt / TypedBlocker -> Stage Transition Authority derives next current_owner_delta`。
- Audit / Evidence Sidecar 记录 trace、lineage、refs、replay、restore、readiness inventory、long-soak、cleanup、release cohort、L5 evidence 和 full diagnostic，但默认不能生成 next action。
- Sidecar 只有在 owner/scope/executor/authority boundary、execution authorization、closeout binding、accepted answer shape、不可逆 artifact/package/memory/release/physical delete mutation、publication/submission/export/release claim、human/safety/compliance decision 或不可恢复 current pointer / manifest / restore proof 损坏时，才升级为 hard gate。
- 新增 `ProgressDeltaReceipt` 作为普通 step 的轻量接力形态；它只能证明 changed surfaces、produced refs、consumed refs、delta classification、next owner 和 next required delta，不能授权 publication-ready、submission-ready、artifact mutation、memory accept/reject、App release ready、domain ready 或 production ready。
- Stage Artifact Unit 按 `T0_progress_delta`、`T1_stage_transition`、`T2_delivery_artifact`、`T3_production_evidence` 分层。普通写作、分析、证据整理、review 修订和平台修复不要求每步都带 full delivery proof；Stage transition、delivery/export/publication/release 和 production evidence 按风险升级。
- MAS readiness surface 采用 just-in-time 读法：只检查当前 delta 需要的 readiness surface；缺口转为下一 owner delta、route-back、typed blocker 或 human gate，不能变成“补齐全部 readiness inventory 后才允许推进”的默认门。
- MDS / DeepScientist 只吸收单循环、少默认门、持续产出的 smoothness learning，继续作为 MAS 声明的 provenance、fixture、backend audit、upstream learning 和 parity oracle reference；不得恢复为默认 runtime、quality owner、artifact authority 或 OPL top-level domain agent。
- 当前完整规划入口是 `docs/active/ordinary-progress-spine-and-audit-sidecar-plan.md`；当前 gap、next action 和完成口径仍回 `docs/active/current-state-vs-ideal-gap.md`，避免产生第二 active backlog。
- 2026-06-09 follow-through：该决策已经落到 `current-owner-delta.schema.json`、`surface-budget-policy.json`、`target-operating-architecture-contract.json`、`family-product-operator-projection.json`、`current_owner_delta_read_model`、App `ordinary_cockpit` / `default_read_surface_policy`、`framework operating-maturity` 的 `current_owner_delta_bridge` 和 focused tests。`verification-command-surfaces` 会守住 target architecture compiler policy 与 surface budget 的 ordinary progress / artifact tier / audit-sidecar mirror，防止目标架构文档化合同漂移回第二默认路径。机器字段只表达 ordinary planning 与 audit-sidecar demotion；operating-maturity 的 L5 / evidence lane 汇总也必须锚回当前 owner delta，不能绕过 owner answer gate 生成默认 next action；这些读面不授予 OPL 任何 domain receipt、quality verdict、artifact/memory mutation、release-ready、physical delete 或 production-ready authority。
- 2026-06-09 追加 follow-through：Progress-First anti-spin stop-loss 已能把重复无交付尝试分成 `receipt_only`、`read_model_reconcile_only`、`stale_route_redrive_only`、`platform_repair_only` 和 `no_deliverable_delta`，并把分类投影到 `current_owner_delta.stop_loss_state`。这让 ordinary path 在重复 closeout accounting、read-model currentness、stale route redrive 或平台修补空转时冻结默认 redrive，恢复条件仍是 fresh owner delta、稳定 typed blocker、human decision 或 provider hard-gate clearance。

## 2026-06-08

### 决策：新增 OPL Pack，品牌模块 taxonomy 从九模块扩展为当前十模块

原因：九模块基线已经证明品牌模块作为 Framework 顶层 taxonomy 有价值，但 `Declarative Domain Pack + Authority ABI + pack compiler + generated/hosted surfaces + standard authority functions` 不是 Atlas、Stagecraft、Foundry Lab 或 Connect 的子细节。Atlas 负责 catalog/discovery，Stagecraft 负责 stage 内认知设计，Foundry Lab 负责 agent improvement control plane，Connect 负责外部接口和分发 transport；把 Pack 强塞进这些模块会模糊 domain pack source、authority ABI、generated surface input 和 domain owner boundary。

影响：

- 当前 OPL Framework 品牌模块读作十模块：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Pack`、`OPL Stagecraft`、`OPL Runway`、`OPL Vault`、`OPL Console`、`OPL Foundry Lab` 和 `OPL Connect`。
- `OPL Pack` 持有 Declarative Domain Pack、authority ABI、pack compiler、generated/hosted surfaces 和 standard authority functions 的模块级 read/validate/doctor 语义；它不接管 domain handler implementation、owner receipt、typed blocker、quality verdict、artifact authority、App release truth 或 production readiness。
- 2026-06-07 的九模块决策保留为历史基线，表示品牌模块 taxonomy 正式进入 Framework 设计语言；它不是模块数量上限。后续新增或拆分模块必须证明独立 bounded context、owner、purpose、machine boundary、authority false flags、L4/L5 口径和 docs/contracts/tests foldback。
- 核心五件套、`docs/references/brand-modules/*`、contracts README、CLI help 和 focused tests 必须以 registry 的当前模块集为准，避免把旧“九模块”写成当前硬约束。
- Foundry Agent CLI series 仍使用自己的 ordinary spine，不复制 OPL Framework 品牌模块；旧 machine 字段名若保留 `nine` 只按兼容字段读取，不得作为当前 taxonomy 事实。

### 决策：MAS current-control provider admission 优先于 sidecar pending task

原因：DM002/DM003 论文线重启时，MAS 已在 workspace-level `runtime/artifacts/supervision/opl_current_control_state/latest.json` 写出当前 `provider_admission_candidates[]`，其中包含唯一当前可执行的 `return_to_ai_reviewer_workflow` work unit、fingerprint、dispatch path 和 owner-route currentness；但 OPL `family-runtime hydrate` 只消费 `domain-handler export.pending_family_tasks[]` 时，会让旧 `run_quality_repair_batch` sidecar task 继续入队，当前 AI reviewer admission 无法进入 OPL queue / attempt。

影响：

- `family-runtime hydrate` 读取 MAS domain-handler export 后，必须用 export 的 `workspace.workspace_root` 定位 `runtime/artifacts/supervision/opl_current_control_state/latest.json`，只消费其中 `status=provider_admission_pending` 且 `owner_route_current=true` 的 `provider_admission_candidates[]`。
- 这些 candidate 只能映射为 `medautoscience` 的 `domain_owner/default-executor-dispatch` queue input，payload 必须携带 `study_id`、`quest_id`、`action_type`、`work_unit_id`、`work_unit_fingerprint`、`action_fingerprint`、`source_fingerprint`、`dispatch_ref/path`、`next_executable_owner`、`required_output_surface`、`provider_admission_identity` 和 `authority_boundary=mas_default_executor_dispatch_request_only`。
- 同一 study 已有 current-control provider admission 时，hydrate 必须抑制 sidecar export 中同 study 的 stale `domain_owner/default-executor-dispatch` pending task；domain route、transition、paper autonomy 等其他 task kind 不受该抑制影响。
- MAS current-control candidate 不得把 provider completion 声明为 domain completion；OPL 入队时固定 `provider_completion_is_domain_completion=false`，若 candidate 自称 `provider_completion_is_domain_completion=true`，hydrate 必须 fail closed 并记录 `current_control_provider_completion_claims_domain_completion`。
- MAS current-control candidate 还必须携带 `stage_transition_authority_boundary`，声明自己只是 `producer_kind=runtime_provider` / `intent_kind=provider_observation`，且不能写 Stage current pointer、StageRun terminal state、`current_owner_delta`、domain truth、owner receipt 或 typed blocker；缺失该边界或任一 forbidden authority flag 为 true 时，hydrate 必须 fail closed 并记录 `current_control_provider_admission_missing_stage_authority_boundary`。
- 该规则只把 MAS canonical current work unit 送入 OPL typed queue / provider attempt；OPL 仍不写 MAS truth、不生成 publication verdict、不更新 artifact gate、不声明 paper ready 或 domain ready。
- hydrate 输出记录 `suppressed_count`，让 operator 能区分“当前 work unit 入队”与“旧 sidecar residue 被压下”，避免再把 stale selector/materializer 结果误读成下一步。

### 决策：默认治理采用抓大放小，细粒度完整性不得反向成为 ordinary 卡点

原因：workspace topology v2 的后续复盘暴露出一个可扩展到全 OPL family 的设计风险：为了防止走歪而持续增加规则、profile、projection、receipt、fleet report、L5 evidence、cleanup gate 和 release gate，最终可能让普通 owner delta 先被平台证明、诊断、镜像一致性、计数或 delete accounting 卡住。OPL 需要把“大边界”和“小细节”分层治理：大边界保证不越权、不误闭合、不制造第二真相源；小细节必须服务推进，不能抢占默认路径。

影响：

- `抓大` 的 hard boundary 固定为 owner、authority、stage lifecycle、workspace topology、selected executor、single ordinary route、launch / execution / closeout admission、accepted owner answer shape、App release verdict、physical delete authority 和 no-second-truth。缺这些会导致错误启动、越权、不可审计、不可恢复、误闭合或不可逆 mutation，必须 fail closed。
- `放小` 的默认降级对象包括 prompt / skill / tool / knowledge / rubric refs 完整性、path alias、generated projection mirror、workspace fleet/detail drift、worklist raw counter、diagnostic proof、route variant、receipt accounting、wrapper lineage、L5 evidence matrix item、provider ops detail 和 release cohort diagnostic。它们默认进入 advisory、audit、diagnostic、cleanup 或 production evidence lane。
- 小细节只有在造成错误启动、越权、不可恢复、不可审计、无法 closeout、owner answer shape 不合法或不可逆 mutation 时，才允许升级为 hard blocker；只让报告更全、证明更漂亮或不确定性更少，不构成 ordinary blocker。
- ordinary App/CLI/operator path 继续以 `current_owner_delta` 为唯一 planning root。raw worklist、evidence ledger、provider trace、route variant menu、private residue inventory、cleanup delete gate、L5 evidence ledger 和 release diagnostics 不得覆盖当前 domain / App / human / provider owner answer。
- 新增 surface / gate / contract / read model 必须先声明 default lane、hard-blocker upgrade condition、demotion condition、protected boundary 和 accepted answer shape；答不出这些问题时，只能作为 diagnostic/reference 起步。
- 该决策不减少 launch safety、authority boundary、receipt binding、forbidden-write、domain owner receipt、typed blocker、quality gate、release gate 或 physical delete gate 的要求；它只防止这些要求的支撑细节反向成为普通进展卡点。
- 本决策的长期维护 taste 固定在 `TASTE.md`；当前 active owner、gap 和下一步回到 `docs/active/current-state-vs-ideal-gap.md`；机器预算回到 `contracts/opl-framework/surface-budget-policy.json` 的 `grip_big_release_small_review`。支撑文档、审计矩阵和 production evidence lane 不维护第二 ordinary backlog。
- Production evidence lane 只接收真实用户路径、跨 agent scaleout、long-soak、release/install、operator repair loop、owner acceptance、no-regression 或等价证据。缺这些证据只能说明 production evidence tail 未闭合，不能抢占 `current_owner_delta` 普通接力，也不能写成 production ready。

### 决策：App-owned Codex runtime updater 不修改全局 Homebrew / npm / system Codex

原因：Full first-install 和普通 App startup-maintenance 需要能更新 App 自己携带的 `runtime/current/bin/codex`，但用户机器上的 Homebrew、全局 npm 和系统 PATH Codex 是用户级工具链，不应被 OPL 自动安装流程改写。此前把 Codex update 表达成 `npm install -g @openai/codex@latest` 会把 App runtime 修复和全局工具链 mutation 混在一起，增加权限、污染和回滚风险。

影响：

- `opl engine install|update|reinstall --engine codex` 与 `opl system startup-maintenance` 使用 App-owned staging root 拉取 `@openai/codex@latest`，验证 staged `codex --version` 后原子替换 `runtime/current/bin/codex`，并同步 App runtime 内的 `rg` payload。
- staged npm install 的平台二进制 source of truth 是 npm 物化后的 package layout；当前 `@openai/codex` macOS arm64 payload 位于 sibling optional package `node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/`，不能只查 `@openai/codex` package 内部 vendor 目录。
- `core_engines.codex.runtime_toolchain_updater` 是机器可读的 updater/readiness surface，必须暴露 runtime root、current binary、staging root、version status、latest status 和 `global_toolchain_mutation_allowed=false`。
- 若 PATH / env 已选到兼容 system Codex，且 App runtime toolchain 已 current，startup-maintenance 可以 skipped；这不授权 OPL 修改 Homebrew、全局 npm package 或用户系统 Codex。
- 2026-06-08 追加：Standard / Homebrew clean-machine 首启若没有 PATH / env Codex，`opl system startup-maintenance` 必须把缺失 Codex 当作 App runtime toolchain install，静默 stage、验证并写入 `runtime/current/bin/codex`，不能只返回 `codex_cli_missing` skipped/manual blocker；这仍不授权修改 Homebrew、全局 npm 或系统 PATH 工具。
- 该 updater 只修 App/OPL runtime concrete executor payload，不声明 domain ready、production ready、App release ready、Temporal provider ready、MAS/MAG/RCA quality verdict 或 artifact authority。

## 2026-06-07

### 决策：采用 OPL 九个品牌模块作为长期顶层 taxonomy

原因：OPL 已经从单一 CLI/runtime 项目演进成 `OPL Framework -> One Person Lab App -> Foundry Agents` 的 family-level 系统。仅用 runtime、workspace、stage、App、Agent Lab 等局部技术名组织长期设计，会让 owner boundary、文档分层、contract 入口、用户理解和后续重构继续分散。九个品牌模块把这些能力收成可管理的 bounded context：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Stagecraft`、`OPL Runway`、`OPL Vault`、`OPL Console`、`OPL Foundry Lab` 和 `OPL Connect`。

2026-06-08 追加：本决策定义的是品牌模块 taxonomy 的采用基线，不是模块数量上限。当前 taxonomy 已扩展为十模块，并新增 `OPL Pack` 承接 Domain Pack、Authority ABI、pack compiler 和 generated/hosted surfaces 的独立边界。

影响：

- 核心五件套必须把品牌模块读作 OPL Framework 的长期架构语言；详细 north-star 继续留在 `docs/references/brand-modules/*`。
- 新增 capability、CLI/App surface、contract、read model、docs support、release/install path 或 external interface 时，应能归入一个主品牌模块，并写清该模块不拥有的 truth / authority。
- 成熟度按 `L1 conceptual`、`L2 emerging`、`L3 structural`、`L4 executable baseline`、`L5 production operating maturity` 管理。`OPL Workspace` 当前只是 `L4 executable baseline`，不能外推为 domain ready、App release ready 或 production ready。
- `L5` 需要真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance。docs foldback、conformance pass、provider completion、verified ledger 或 App projection 只能作为输入，不能单独形成 L5 结论。
- `Charter / Atlas / Runway / Vault` 是下一轮 L3/L4 优先补强对象；`Console / Foundry Lab / Connect` 的成熟度必须绑定 App release/user-path、agent improvement loop、install/release drift matrix 和真实 owner evidence。

### 决策：Foundry Agent CLI 使用系列 spine，不复制 OPL Framework 品牌模块

原因：基于 OPL 的智能体需要让用户明确看出“这是同一系列”，但智能体 CLI 的心智模型不应再暴露 OPL Framework 的旧实现桶，也不应把 framework brand modules 原样复制到每个 agent。品牌模块是 OPL Framework 顶层 taxonomy；Foundry Agent 的普通入口应围绕用户实际执行链路组织成 series spine。

影响：

- `opl agents foundry status|inspect|interfaces|validate|doctor|peers` 成为 Foundry Agent series 的普通 CLI command spine，表达 `workspace -> work -> stage -> run -> vault -> handoff -> connect` 的同源执行链。
- MAS/MAG/RCA 的品牌 CLI 别名必须是真实可执行入口：`mas foundry ...`、`mag foundry ...`、`rca foundry ...`。长域名入口 `medautosci`、`medautogrant`、`redcube` 只作为机器可测的 legacy compatibility command，不能替代品牌入口，也不能进入普通 root help。
- Agent CLI 的机器输出统一接受 `--json`；历史 `--format json` 可以保留为兼容别名。OPL 聚合面 `opl foundry agents list|inspect` 必须投影 `cli_smoke`，把品牌入口、兼容入口和 JSON flag alias 写成可测试字段。
- `contracts/opl-framework/foundry-agent-series-contract.json` 固定 series CLI policy、Skill/MCP surface policy 和旧实现桶退役策略；新 scaffold 生成的 `contracts/foundry_agent_series.json` 必须继承这些字段。
- `opl connect skills` / `opl connect sync-skills` 输出同一 series contract 派生的 `foundry_agent_series`、series spine projection、`mcp_projection` 和旧桶退役策略，Skill/MCP 不再另起一套解释。
- 旧 `skill`、`module/modules`、`packages`、`engine` 等实现桶作为普通入口已退役并 fail closed 到 Connect；`runtime`、`family-runtime`、`index`、`stage-artifact`、`domain`、`system`、`status`、`session` 等只能作为诊断、迁移或内部治理下钻，不进入 root help 的普通入口。
- 该 series spine 只声明 CLI/Skill/MCP/App action 的同源暴露面，不写 domain truth、不生成 owner receipt / typed blocker、不声明 domain ready、quality/export ready、artifact ready 或 production ready。

## 2026-06-06

### 决策：domain owner-delta closeout binding 可作为 StageRun owner-answer identity 输入

原因：OPL provider-hosted attempt 已能签发 provider attempt、active lease、execution authorization decision、stage manifest、current pointer、source fingerprint 和 idempotency refs，但 MAS/domain owner answer 仍需要把这些 refs 绑定回合法 owner receipt、quality gate receipt 或 typed blocker。若 OPL safe-action shell 只接受顶层 payload 字段或本地 JSON ref identity，domain owner callable 返回的 `owner_delta_result.closeout_binding` 无法直接参与 StageRun closeout identity 校验，operator 还会被迫手工重组同一组 binding 字段。

影响：

- Codex stage runner 的 refs-only provider env 现在同时暴露 `OPL_STAGE_RUN_ID`、`OPL_STAGE_MANIFEST_REF`、`OPL_CURRENT_POINTER_REF` 和 `OPL_CLOSEOUT_BINDING_JSON`；这些字段只来自 attempt 内既有 OPL execution authorization，不从 queued attempt、workflow id、task id 或 provider identity 合成 active lease / authorization decision。
- Domain-dispatch record route 在 `required_closeout_binding` 和 payload workorder 中暴露 StageRun closeout binding target shape；当 target identity 完整时，typed-blocker payload template 可携带 `owner_delta_result.closeout_binding`。
- `preflightDomainDispatchEvidencePayload` 接受 `payload.owner_delta_result.closeout_binding` 作为 payload identity source，并与 route target identity / local owner-answer ref identity fail-closed 对比。冲突字段会阻止 refs-only receipt 记录。
- 这只关闭 binding transport 和 identity validation 缺口；OPL 仍不能生成 domain owner receipt、quality gate receipt、typed blocker、owner-chain ref、no-regression ref，不能声明 domain ready、paper ready、App release ready 或 production ready。
- 2026-06-07 追加：`quality_gate_receipt` 可以让 `current_owner_delta` 投影为 `domain_owner_answer_recorded`，从而停止继续催同一个默认 owner answer；但它不能被 StageRun cockpit 提升为 closeout owner receipt，也不能设置 `domain_ready_authorized`、`quality_or_export_authorized` 或 execution authorization success。需要关闭 StageRun closeout 时，仍必须有 domain owner receipt 或 typed blocker。
- 2026-06-07 追加：当 StageRun cockpit 已经验证 closeout binding 中的 `owner_receipt` 或 `typed_blocker` 与当前 StageRun、manifest、current pointer、source fingerprint 和 idempotency 完全一致时，`current_owner_delta` 可以消费这条合法 owner answer 并清空默认 next action；该回填只关闭“owner answer 是否已提交”的等待，不声明 domain ready、quality/export ready 或 production ready。

### 决策：StageRun blocker 按缺口类型选择默认 owner

原因：live App / evidence-worklist 曾同时暴露两种下一步：`current_owner_delta` 指向 domain owner answer / typed blocker，而 StageRun cockpit 又显示 `execution_authorized=false`、`next_required_owner=one-person-lab`。当缺口仍包含 provider attempt、active lease 或 execution authorization decision 时，实际最快推进点是 OPL runtime 补齐 execution authorization；当这些 launch / execution authorization refs 已存在、只缺 owner answer 及 StageRun / manifest / current pointer / source fingerprint / idempotency binding refs 时，默认 owner 应回到 domain owner，因为 OPL 不能替 domain 生成合法 owner receipt、quality gate receipt 或 typed blocker。

影响：

- StageRun blocker 缺 provider attempt、active lease、execution authorization decision、workspace/artifact scope、source fingerprint 或 idempotency 时，App state、framework readiness、runtime drilldown 和 family-runtime evidence-worklist 的默认 `operator_next_action`、`operator_next_owner`、payload requirement 和 accepted answer shape 以 OPL runtime blocker 为准。
- StageRun blocker 只缺 owner answer / closeout binding refs 时，默认 `operator_next_owner` 回到 `current_owner_delta.current_owner`，operator payload requirement 和 accepted answer shape 以 domain owner delta 为准；StageRun cockpit 继续暴露 refs-only missing binding refs 作为诊断与 closeout gate。
- 原始 domain owner delta 始终保留为 `current_owner_delta` / `operator_current_owner_delta_owner` / `current_owner_delta_owner`，用于说明当前 domain owner answer 责任方。
- OPL runtime blocker 只阻断 provider execution 或 owner-answer binding；它不写 domain truth、不创建 domain typed blocker、不签 domain owner receipt、不声明 domain ready、App release ready 或 production ready。
- Domain owner receipt / typed blocker 仍是成功关闭 domain stage 的唯一语义；OPL execution authorization 只负责把执行许可和 closeout binding 做成可恢复、可审计的前置条件。

### 决策：default-caller deletion / cleanup gate 不得占用 ordinary progress worklist

原因：default-caller deletion evidence、wrapper retirement 和 cleanup gate 有长期治理价值，但它们不是论文、基金、视觉或 target-agent 的交付推进。若这类 gate 进入普通 open safe action / first-screen next action，会把 operator 注意力从 owner delta 拉回 cleanup accounting。

影响：

- default-caller deletion / cleanup gate 默认降为 `audit_cleanup_lane`；ordinary open safe action、default progress attention 和 first-screen next action 不得由这类 gate 驱动。
- full detail 仍保留 replacement parity、no-active-caller、domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance、physical-delete false authority flags 和 per-surface drilldown refs。
- `physical_delete_authorized=false`、`default_caller_delete_ready=false` 和 `domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review` 继续作为 cleanup owner gate，而不是 domain progress blocker。
- `same_work_unit_live_evidence` 只约束 current owner-answer compensation chain 和 StageRun closeout binding；它不得阻止已无 active caller、已有 replacement parity、no-forbidden-write 和 tombstone/provenance 的 retired wrapper / alias / facade 静态退役。结构前置证据齐全后，OPL 只投影 `physical_delete_authorization_ref`、`keep_as_authority_adapter_ref` 或 `typed_blocker_ref` 三类 owner 裁决形态，不替 domain 仓签物理删除授权。

## 2026-06-03

### 决策：active shell candidate 与非默认 executor adapter 不能被 cleanup 误删

原因：跨仓 cleanup 审计曾把两类仍有 owner 的面放进“后续可删”语境：其一是 `one-person-lab-app` 中仍在测试的 `opl-agui-codex-shell` / `agui-codex` active shell candidate；其二是 MAG/RCA 中 Hermes-named proof/helper/mock tail。前者的 candidate contract、validator、release/user-path evidence owner 是 App 仓，OPL Framework 只能记录边界和消费规则，不能替 App 退役 active candidate。后者的长期 owner 是 OPL Framework 的显式非默认 executor adapter/backend；MAG/RCA 只保留 domain-local receipt/proof lane、route bridge、negative guard 或迁移残留，不应被写成 domain 自己拥有 Hermes executor substrate。

影响：

- `agui-codex` 继续按 App-owned active shell candidate 读取；只有 App owner 明确改 candidate contract、validator 和 docs，并完成替代/退役 receipt 后，才能删除对应 shell bridge 或 proof 文件。
- `hermes_agent`、`claude_code`、`antigravity_cli` 等非默认 executor adapter/backend 统一归 OPL Framework owner；它们只能通过显式 stage binding、executor receipt、audit 和 fail-closed gate 进入，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。
- MAG/RCA 文档、schema 和测试里的 active owner label 必须写成 `OPL executor adapter ... receipt/proof owner` 或 selected backend，不写成 MAG/RCA 自有 executor owner；domain repo 只持有 grant/visual truth、quality/export verdict、artifact authority、owner receipt 或 typed blocker。
- OMA materializer/helper 与 Aion Team/E2E bridge tail 只删除无 active caller、已有 replacement proof 和 repo-native verification 的 fixture/alias/helper；active materializer、target-agent handoff、legacy migration window、explicit bridge fallback 和 App-owned shell candidate 不进入物理删除。
- 物理删除门固定为 replacement parity、no-active-caller、owner receipt 或 typed blocker、provenance/tombstone、no-forbidden-write 和 repo-native verification。任何 active caller、migration window、negative guard、proof lane 或 dirty root 都必须先收敛为明确 owner answer，再执行删除。

### 决策：退役 frontdesk / web surface 不得继续由 LaunchAgent 或 runtime ledger 反复放大

原因：`frontdesk`、`opl web` 和 8787 本地服务已进入 history / retired 语境。若用户级 LaunchAgent 仍以 `KeepAlive` 调用退役命令，CLI unknown-command JSON、help catalogue 和 Node warnings 会被反复追加到前台 stderr；同时 family-runtime dispatch 若把 domain handler 完整 stdout JSON 同时写入 events 与 notifications，会让 `queue.sqlite` 被少数大 payload 快速放大。

影响：

- 旧 `ai.opl.frontdesk` / `opl web` 只能作为历史兼容对象处理；默认运行、安装、App state、operator drilldown 和 product entry 不得重新依赖该 service。发现该 LaunchAgent 仍在运行时，source of truth 是 `launchctl print gui/$(id -u)/ai.opl.frontdesk` 与 `~/Library/LaunchAgents/ai.opl.frontdesk.plist`，应先停用服务，再检查 stderr 是否继续增长。
- 顶层 unknown-command 错误详情必须保持有界，只返回 command、command_count 和 `opl help` 指针；完整 command catalogue 只属于显式 `opl help` / command-scoped help，不属于 daemon stderr 或退役命令错误面。
- `family-runtime` events / notifications 是 queue observability ledger，不是 domain artifact store。入库 payload 必须做有界 envelope：长字符串、超长数组、超深对象只保留 preview、长度、hash 和截断标记；domain truth、owner receipt、artifact body 和质量 verdict 仍归 MAS/MAG/RCA owner。
- 历史 queue 清理只能做 observability compaction、完整性检查和可回滚备份，不删除 task / event 行、不写 domain truth、不生成 owner receipt、不改变 publication eval、artifact gate、paper package 或 current package。

## 2026-06-02

### 决策：completed typed closeout 是 default-executor admission 的终端屏障

原因：MAS closeout redrive 可能把同一 `domain_owner/default-executor-dispatch` task 重新置回 queued / retry-waiting。若该 task 名下已经存在 `completed + accepted_typed_closeout` 的 stage attempt，OPL 再启动同一 dispatch 会把 Progress-First 时间消耗在重复 receipt、read-model reconcile 或重复 provider attempt 上，而不是推进新的 owner delta。

影响：

- `family-runtime queue tick` 在 stale-source、same-study single-flight、live-attempt 和 anti-spin 判断前，必须先把同一 task 下已有 accepted typed closeout 的 MAS default-executor row 收敛为 `succeeded`。
- 收敛事件为 `task_default_executor_completed_closeout_reconciled`，并记录 `stage_attempt_id`、`closeout_refs`、`dispatch_ref`、`action_type`、`study_id` 与 `provider_stage_attempt_started=false`。
- tick 返回 `mas_default_executor_completed_closeout_reconciled_count`，让 operator 区分“终端 closeout 已吸收重复 queued residue”和“仍有真实 ready owner action”。
- 该行为只治理 OPL queue / attempt ledger currentness，不写 MAS truth、不生成 owner receipt、不创建 typed blocker、不声明 domain ready、publication ready、artifact ready 或 package/current manuscript 已刷新。

### 决策：MAS current-control handoff admission 可从 nested action queue 归一化

原因：MAS current-control surface 已从 root `provider_admission_candidates[]` 演进出 `opl_current_control_state_handoff`，其当前 provider admission 候选可能位于 root `action_queue[]` 或 per-study `action_queue[]`，并通过 `handoff_packet.owner_route.owner_route_attempt_protocol` 声明 OPL 只拥有 queue / attempt / retry / dead-letter / provider liveness。若 OPL 只读取 root candidates，会把当前 MAS owner route 静默投影成无任务，导致 terminal provider admission 或旧 sidecar task 残留继续遮蔽 fresh owner delta。

- `family-runtime hydrate/intake` 继续优先消费 root `provider_admission_candidates[]`；当 root candidates 缺失时，允许从 `action_queue[]` 和 per-study `action_queue[]` 归一化 provider admission candidate。
- nested handoff 只有在 owner-route attempt protocol 明确 `opl_owns` 包含 queue / attempt、`provider_completion_is_domain_ready=false` 且 runtime completion guard 声明 `provider_completion_is_domain_completion=false` 时才能入队；否则不得把普通 action queue 项当成 provider admission。
- 归一化 payload 必须保留 MAS currentness basis，包括 `generated_at`、`work_unit_id`、`work_unit_fingerprint`、`truth_epoch`、`runtime_health_epoch`、可用 digest 和 source fingerprint；OPL 只把这些字段作为 queue/attempt currentness identity 使用。
- 同一 dedupe / study / work unit 已存在 `succeeded` MAS default-executor admission 时，完全相同 currentness identity 必须保持幂等；若 MAS 以新的 generation、fingerprint、truth/runtime epoch 或 digest 导出 fresh admission，OPL 可以把 terminal row 重新置为 queued 以启动新的 provider transport。
- 该规则只治理 OPL queue / attempt / provider transport rehydrate，不写 MAS study truth、不生成 MAS owner receipt 或 typed blocker、不刷新 publication eval / artifact gate / paper package，也不把 provider completion 解释为 domain completion。

### 决策：App state 的 MAS activity 不能把 active_run_id 单独算作实际运行

原因：DM002/DM003 Progress-first 监督暴露出 `active_run_id`、queued/escalated 状态或质量修复队列本身不足以证明论文线正在产生实质进展。Operator 读面如果把这些信号直接归入 active projects，会再次掩盖 provider/worker liveness、owner delta admission 或 typed blocker 的真实状态。

影响：

- `app state` 的 MAS study activity 只在 worker/provider liveness、`actual_write_active`、writer/worker running，或 live stage 携带 active run 时显示为 running
- queued/escalated 且缺少 liveness 证据的 study 显示为 needs-attention，提醒 operator 走 scheduler tick、owner action pickup 或 typed blocker 路径
- App/workbench 继续只消费 refs-only projection，不取得 MAS study truth、publication quality 或 package authority

## 2026-06-02

### 决策：stale owner-route domain-handler failure 必须成为非重试 currentness blocker

原因：MAS paper autonomy / publication aftercare 这类 domain-handler task 可能携带已被最新 controller decision 或 owner route supersede 的 work unit。domain owner 在 dispatch 内返回 `owner_route_stale` 时，OPL 若把它当作普通非零退出进入 `retry_waiting`，会持续消耗 retry、receipt reconcile 和 read-model currentness 时间，却不会产生新的论文交付物 delta。这违背 Progress-First 的最快实质推进原则。

影响：

- `family-runtime task dispatch` 在 structured domain-handler output 或错误摘要中识别 `owner_route_stale` 时，必须把 task 与关联 stage attempt 标记为 `blocked`，`reason=progress_first_owner_delta_required`。
- 该 blocker 不进入 retry loop，不等待 retry budget 耗尽，也不把 stale route 写成 provider transport failure。
- event 必须保留原始 `domain_handler_blocked_reason=owner_route_stale`、stdout/stderr、command preview 和 authority boundary，便于 domain owner 继续修 export/currentness，而 operator 能立刻看到下一步需要 fresh owner delta。
- 该规则只治理 OPL queue / attempt currentness admission，不写 MAS truth、不生成 owner receipt、不创建 typed blocker、不修改 publication eval、artifact gate、paper package 或 current package。

## 2026-05-30

### 决策：Progress-First ready owner action pickup 必须有同 tick SLO 投影

原因：MAS export 暴露 `domain_owner/default-executor-dispatch` pending family task 且 Temporal provider 已 ready 时，operator 需要看到 OPL 在同一轮 scheduler tick 内 hydrate 并触发 queue dispatch。否则 App/operator 只能从 5 分钟 cadence 或后续队列状态间接推断 pickup，无法机器验证 ready owner action 是否被立即接走。

影响：

- `family-runtime scheduler tick` 在 provider SLO 后重新读取 provider readiness；若 provider ready 且 hydrate 从 domain export 接收 pending family task，必须在同一 scheduler tick 中运行 queue dispatch，而不是等待下一次 cadence。
- tick 返回 `progress_first_ready_owner_action_pickup_slo`，记录 hydrated pending family task 数、同 tick selected/dispatch 数、`slo_status` 与 `cadence_wait_required`。
- 该 SLO 只证明 OPL queue pickup / dispatch trigger currentness，不证明 Codex owner attempt 已完成、MAS owner receipt 已产生、domain ready、publication quality ready、artifact gate ready 或 package/current manuscript 已刷新。

### 决策：waiting-approval task 必须同步投影其 stage attempts 为 operator hold

原因：人工暂停、MAS upgrade pause 或 approval gate 会把 task 正确标记为 `waiting_approval`，但历史 ledger 里可能还残留该 task 名下的 `queued` / `registered` stage attempt。Progress-First 监控不能把这种已暂停任务误读成 runnable queued work，否则 operator 会反复 tick 同一个已被人工 gate 挡住的论文任务。

影响：

- `family-runtime tick` 会把 `waiting_approval` task 名下仍处在 queued/running/checkpointed 且未投影为 hold 的 stage attempt 收敛为 `human_gate`，provider run 投影为 `operator_hold_requested`。
- tick 返回与事件记录 `waiting_approval_attempt_reconciled_count`，便于 operator 区分真实 runnable work 与历史 pause residue。
- 该行为只治理 OPL queue / attempt ledger currentness，不释放 queue hold、不 approve task、不启动 provider attempt、不写 MAS truth，不修改 publication eval、controller decisions、artifact gate、paper package 或 `current_package`。

### 决策：superseded MAS default-executor task 必须同步关闭其 stage attempts

原因：Progress-First 监控以 task、stage attempt、provider liveness 和 closeout refs 共同证明论文是否在推进。若 OPL 已把过期 MAS default-executor task 标记为 `mas_default_executor_superseded_by_current_source`，但该 task 名下仍残留 `queued` / `registered` stage attempt，operator 会继续看到假 queued work，把已经被更新 source 替代的 reviewer / writer handoff 误判为可执行进度。

影响：

- `family-runtime tick` 在把 MAS default-executor queued / retry_waiting task 标记为 superseded 时，同步把该 task 关联的 stage attempts 标记为 `blocked`，`blocked_reason=mas_default_executor_superseded_by_current_source`。
- 对已经存在的 historical superseded task，后续 tick 也会把仍停在 `queued` / `registered` 的 stage attempt 收敛为 `blocked`，避免旧 bug 残留继续污染 Progress-First 队列读数。
- supersession event 记录 `blocked_stage_attempt_ids`，便于 operator 区分真实 queued work 与已收敛的 historical residue。
- 该行为只治理 OPL queue / attempt ledger currentness，不写 MAS truth，不修改 `publication_eval/latest.json`、controller decisions、artifact gate、paper package 或 `current_package`，也不替 MAS 作质量或投稿判断。

### 决策：Foundry Agent series 需要统一 canonical design profile

原因：MAS、MAG、RCA 和 OPL Meta Agent 都已经按标准 OPL Agent 接入，但如果每个 domain 把 `series_design_profile` 写成自己的 input/output taxonomy，机器验证只能看到“各自都像 OPL”，看不出它们是一套同源设计。series-level profile 应该表达所有 Foundry Agent 共同的不可变设计逻辑，领域差异应留在 domain-owned profile、stage/action contract 和 authority refs 中。

影响：

- `contracts/opl-framework/foundry-agent-series-contract.json` 固定 canonical `series_design_profile.profile_id=opl_foundry_agent_series_design_profile.v1`，并要求相同 shared lifecycle、generic input/output slots、stage pack sections、closeout shape 与 authority invariants。
- MAS/MAG/RCA/OMA 的 `contracts/foundry_agent_series.json` 必须使用同一个 canonical `series_design_profile`；domain-specific input/output、alias、authority function 和包装差异放入 `domain_specific_profile` 或既有 domain-owned contract 字段。
- `opl agents conformance` 把缺失或漂移的 canonical profile 作为 structural blocker。conformance 通过只证明 shared design signature 和 scaffold contract 对齐，不声明 domain ready、quality/export ready、artifact ready、App release ready 或 production ready。

### 决策：attempt list 需要 Progress-First compact monitoring lens

原因：operator 排查单个 study/domain/status 时，不应先读取全量 stage attempt 大 JSON。`attempt query` 仍是单 attempt 深下钻入口，但队列较多时需要一个只读、可过滤、轻量的 timeline 先回答哪些 attempt 仍是交付进展、platform repair、typed blocker 或 human gate。

影响：

- `family-runtime attempt list` 支持 `--domain`、`--study`、`--status`、`--since-hours` 过滤；`--compact-timeline` 返回从 OPL attempt metadata、queue task payload study id、`stage_progress_log` / `user_stage_log` 和 latest closeout refs 派生的 compact timeline，并携带 machine-readable `operator_summary`、`semantic_gap` 与 `next_inspection_hint`。
- 默认 `attempt list` 仍返回 attempts 结构，降低对既有 consumer 的破坏面；compact timeline 必须显式请求。
- 该 lens 只读 OPL queue / attempt ledger 和 domain closeout refs，不写 MAS/MAG/RCA/OMA truth，不读取 artifact body，不生成 owner receipt、typed blocker、quality verdict、domain ready 或 production ready。

### 决策：queue list 的 scoped 过滤是 Progress-First 监控合同

原因：operator 用 `family-runtime queue list --domain ... --study ... --status ...` 判断单篇论文是否仍有 running/queued work 时，输出必须只包含目标 scope。若 CLI 接受过滤参数但仍返回全量 queue，前台监督会把其他 study/domain 的任务误判成目标论文进度，破坏 Progress-First 的 currentness 判断。

影响：

- `family-runtime queue list` 支持 `--domain`、`--study` / `--study-id`、`--status`、`--task-kind`、`--payload-match`，并把这些过滤同时应用到 `queue` summary 和 `tasks` 列表。
- 重复 `--study` / `--study-id` 表示同一 `study_id` payload path 的多值 OR，用于一次读取或推进多篇 study；不同 scope selector 仍按 AND 组合，例如 study OR 集合还必须同时满足 `--domain`、`--task-kind` 或其他 `--payload-match` path。
- 返回面保留 `unfiltered_queue` 作为全局背景计数；默认 `queue` 始终表示当前过滤 scope，避免 operator 读错。
- 2026-06-02 追加：`queue list` 对 `running` task 投影 `linked_stage_attempt_liveness`。queue task 的 `lease_expires_at` 只表示 worker pickup lease；真实 live attempt 判断优先看 linked stage attempt 的 provider activity heartbeat，再回落到 `provider_run.last_heartbeat_at` / Temporal heartbeat。若 pickup lease 已过期但 linked attempt 仍有新 heartbeat，读面必须显式标为 `task_lease_currentness=expired_but_provider_heartbeat_fresh`，避免 Progress-First 巡检把健康 provider attempt 误判为卡死或把时间耗在重复 queue/read-model reconcile。
- 该入口只读 OPL queue ledger，不写 domain truth、不执行 domain action、不刷新 MAS publication verdict、paper package、owner receipt 或 typed blocker。

### 决策：worker source-root 等价需要 operator diagnostic

原因：managed worker 可能来自 App-managed runtime root，而当前 operator 在 developer checkout 里运行 CLI。两者 `worker-runtime` content hash 相同但 source root 不同是正常可解释状态，不能被 operator 误读为 stale worker 或 provider readiness 漂移。

影响：

- Temporal worker readiness/status 投影 `operator_diagnostic.source_version.diagnostic_id=same_content_hash_different_source_root`，同时保留 managed / expected source root 和 content-hash comparison。
- `provider_ready`、`worker_ready` 与 `managed_worker_source_current` 继续由原有 source-version equivalence 决定；同 hash 不因 source root 不同而降级，不同 hash 仍投影 `worker_source_stale`。
- 该 diagnostic 只解释 provider worker liveness，不绕过 worker mutation guard，不启动/停止 worker，不授权 domain action 或 production-ready claim。

### 决策：evidence-worklist 默认暴露 Progress-First operator summary

原因：`family-runtime evidence-worklist` 的 open/closed counter、stage replay workorder、typed blocker group 和 zero-open guard 都是正确的机器面，但 operator 仍需要一个稳定默认 lens 直接回答“现在是可执行 OPL safe action、domain/human blocker、还是没有 OPL 可动作；下一次必须产出什么 delta”。如果这个读法只靠文档解释，App/operator 和后续 Foundry Agent 仍可能把大量 refs-only attention 当成交付进展，或把 zero-open worklist 当成完成。

影响：

- `family-runtime evidence-worklist` 新增 `progress_first_operator_summary`，默认投影 `progress_delta_classification`、`deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta`、open safe-action 计数、stage replay missing receipt 计数、typed blocker refs 与 zero-open completion guard。
- 该 summary 的 `deliverable_progress_delta` 只能由 domain agent 填充；OPL evidence-worklist 默认不会把 platform repair、provider supervision、refs-only ledger 或 typed blocker accounting 写成交付物实质进展。
- 当 open worklist 为 0 但仍有 human gate、owner receipt replay 或 blocked refs-only envelope 时，`next_forced_delta` 优先指向 human/domain owner receipt 或 domain-owned typed blocker，而不是声明完成。
- authority boundary 固定为 `refs_only=true`、`can_write_domain_truth=false`、`can_create_owner_receipt=false`、`can_create_typed_blocker=false`、`can_claim_domain_ready=false`、`can_claim_production_ready=false`。

### 决策：Foundry-series Progress-First policy bundle 必须有 OPL-owned release pin

原因：Progress-First 合同已经覆盖 stage progress、currentness、typed blocker lineage 和 App projection。如果 domain repo 只 pin OPL owner commit，而没有单独 pin policy bundle release，就容易出现两类漂移：domain adapter 复制一份旧 policy body 当成本地 authority，或 App/operator 看到共享 helper 已对齐却不知道 Progress-First policy surface 是否同版。共享 release pin 要把“依赖版本对齐”和“政策合同对齐”拆开，让 MAS/MAG/RCA/OMA 和后续 Foundry Agent 都能用同一套可验证 release ref/fingerprint 说明自己遵循的是同一个系列设计。

影响：

- `contracts/opl-framework/foundry-agent-series-policy-release.json` 成为 OPL-owned policy release surface，记录 Progress-First policy bundle、`sha256:stable-json` fingerprint、domain pin contract ref 和 authority boundary。
- `contracts/opl-framework/foundry-agent-series-contract.json`、standard scaffold 和 generated `contracts/foundry_agent_series.json` 都必须带 `shared_policy_release`，并要求 exact release ref、exact policy bundle fingerprint、`foundry:policy-release` alignment check。
- Domain repo 只能 pin release ref/fingerprint 和映射 domain alias；不能把 OPL policy body 复制成 domain truth、quality/export verdict、artifact authority、memory authority 或 owner receipt authority。
- `family:shared-release` 继续负责 package/owner commit pin；`foundry:policy-release` 负责 Progress-First policy bundle pin。任一对齐都不授权 domain ready、production ready、App release ready 或 quality/export verdict。

### 决策：Progress-First 成为 OPL family shared stage contract

原因：MAS late-stage paper lane 暴露的问题不是单一研究个案，而是所有 Foundry Agent 都需要统一回答四件事：当前有没有交付物实质进展、是否只是 platform repair、下一次必须产出什么 delta 或 typed blocker、重复 blocker 何时升级。若这些字段留在各 domain 的局部 read model 中，App/operator、Agent Lab、evidence-worklist 和 readiness 会继续把 refs-only/currentness 修复误读成交付推进。

影响：

- 标准 `user_stage_log_contract` / `stage_progress_log` 扩展 `progress_delta_classification`、`deliverable_progress_delta`、`platform_repair_delta`，分类固定为 `deliverable_progress`、`platform_repair`、`mixed`、`typed_blocker`、`human_gate`、`stop_loss`。
- `effective_current_context.v1` 成为 owner route、source fingerprint、stage packet、workspace/session identity、latest closeout、running attempt 和 superseded lineage 的唯一 shared currentness packet。
- `family-stall-lineage.v1` 成为 repeated blocker 的 shared lineage/budget surface，并要求暴露 `next_forced_delta`、escalation owner 与 terminal flag。
- `contracts/opl-framework/foundry-agent-series-contract.json` 成为 Foundry Agent 系列化顶层合同；标准 scaffold 和 `opl agents conformance` 要求 domain repo 暴露 `contracts/foundry_agent_series.json`，把 identity、stage authority、progress/currentness/closeout packet、typed blocker lineage 和 App projection 边界统一到同一机器面。
- MAS/MAG/RCA/OMA 可以保留 paper/grant/visual/target-agent domain alias，但 alias 只映射到 OPL generic deliverable/platform delta；App 只消费 shared projection，不读取 domain artifact/body，也不新增 truth authority。
- platform repair、projection hygiene、currentness 修复、refs-only ledger 与 typed-blocker accounting 必须单独列账，不能显示成交付物实质进展。
- `family-stage-control-plane` 必须显式保存 `user_stage_log_contract`、`progress_delta_policy` 与 `typed_blocker_lineage_policy`；runtime stage log 必须对 `progress_delta_classification` 做枚举校验，未知分类 fail closed 为 typed blocker，并暴露缺失 Progress-First 字段与 evidence refs。

### 决策：framework readiness 不把 worker-guarded provider SLO raw tail 计成 operator-actionable

原因：Provider long-window SLO tail 属于 App/operator production evidence tail；当对应 `provider_slo_cadence_execution` route 已被 developer-checkout shared-state worker mutation guard 阻塞时，framework readiness 仍应保留原始 raw open tail 供 provider evidence 审计，但不能把它计入 `open_tail_count`、`operator_actionable_attention_tail_count` 或 payload-free operator action。否则 framework summary 会与 App execution bridge / evidence-worklist 的 fail-closed safe-action 语义冲突。

影响：

- `framework readiness` 现在同时暴露 `app_live_evidence_tail_raw_open_count`、`app_live_evidence_tail_guarded_by_provider_worker_mutation_count`、`provider_slo_guarded_open_tail_count` 和 operator-actionable `app_live_evidence_tail_open_count`。
- 当 provider SLO production-proof route 为 `blocked_by_provider_worker_mutation_guard` 时，raw provider long-soak tail 仍留在 App full production tail ledger；framework readiness 的默认 operator attention 扣除该 guarded tail，并转为 blocked refs-only attention。
- 该规则不降低 provider long SLO 证据要求，不绕过 worker guard，不执行 provider proof / worker start，不关闭 provider SLO，不声明 domain ready、production ready、App release ready 或 global closeout。

### 决策：provider scheduler status 是诊断查询，scheduler mutation 必须继承 worker mutation guard

原因：provider scheduler 的 `status` route 是只读诊断查询，适合显式执行和 full-detail 下钻，但不应占用 App/default `next_safe_action`、`family-runtime evidence-worklist` open attention 或 next-action ledger。`install`、`trigger`、`tick` 会改动 provider scheduler / dispatch 行为；当 provider worker start/restart 被 developer-checkout shared-state mutation guard 阻塞时，这些 scheduler mutation route 也必须 fail closed，不能作为“安全下一步”推荐。

影响：

- `provider-scheduler:temporal:status` 保持可通过 `opl runtime action execute` 显式查询；App/operator 和 evidence-worklist 将其投影为 `diagnostic_only_not_operator_actionable`，不计入 open safe-action worklist 或默认下一步。
- `provider-scheduler:temporal:install|trigger|tick` 在 worker mutation guard 为 `blocked_developer_checkout_shared_state` 时继承 `blocked_by_provider_worker_mutation_guard`、`default_actionable=false` 和 `can_submit_to_safe_action_shell=false`。
- `family-runtime evidence-worklist` 会把 route-level blocked 状态归一化为 blocked evidence requirement，并从 provider scheduler next-action ledger 中排除这些 provider mutation route；domain-owned typed blocker attention 继续保留原有分组与 refs-only 口径。
- 当 App/operator 已经存在 owner delta、domain dispatch payload、evidence-next-step 或 workstream steering action 时，默认 `next_safe_action` 必须先指向该 owner delta；provider SLO / scheduler install / tick / trigger / status 只保留在 full-detail 显式 route 中，不能抢占论文、基金、视觉或 agent 交付物的下一步。
- 该规则只修正 App/default action 与 worklist attention 口径，不绕过 worker guard，不安装 provider scheduler，不声明 provider SLO satisfied、production ready、domain ready、App release ready 或 global closeout。

### 决策：Temporal worker liveness 是 Progress-First 的首要 runtime blocker

原因：当 Temporal service 已经可达但 OPL worker 处于 `worker_not_ready`、`worker_source_stale` 或 worker dependency blocked 时，真实阻断不是 domain queue、dedupe、stale projection 或 scheduler cadence 本身，而是 provider worker liveness。若 `family-runtime status` 或 scheduler 继续给出泛化的 service+worker repair、继续跑 queue dispatch，operator 会把平台 liveness blocker 误读成 domain stage blocker 或队列噪音。

影响：

- `family-runtime status` 与 `family-runtime scheduler status` 在 provider 未 ready 时优先投影同一 `temporal_worker_repair_action`，包括 `worker_lifecycle_status`、`next_repair_action`、`next_repair_command`、Temporal service 状态和 `liveness_blocker_first=true`。
- `family-runtime scheduler tick` 在 worker liveness blocker 存在时先执行 OPL-owned provider SLO / worker repair tick，再重新读取 provider readiness；若 worker 已恢复则继续 queue hydration / dispatch，若仍存在 liveness blocker 才 fail closed 为 `blocked_provider_not_ready`、返回 `provider_liveness_blocker`，并保持 `queue_tick=null`。成功与 blocked tick 都必须暴露 SLO 后重新读取的 `provider_runtime_after_slo` 与稳定消费用 `provider_readiness_after_slo`，避免 App/MAS/operator 继续消费 repair 前的 stale worker projection。
- `family-runtime tick` 在 Temporal provider 下必须复用同一 scheduler/provider preflight，是否 `--hydrate` 只决定是否执行 domain intake，不改变 provider liveness gate；provider 未 ready 时不进入 queue dispatch 或 domain owner action，返回 `provider_preflight`、`provider_readiness_after_slo` 与 `provider_blocker` / `provider_liveness_blocker`。Temporal service running 但 worker_not_ready 且 mutation guard 允许时，provider SLO tick 必须先自动执行 worker start；仍未 ready 才 fail-fast 暴露下一条 repair command。低层 queue-only helper 只保留给显式测试、redrive 与 provider transport 失败夹具，不作为 Progress-First 默认推进入口。
- 该规则只修复 OPL provider/runtime-manager liveness 暴露与 scheduler preflight，不启动 worker、不绕过 worker mutation guard、不执行 domain action、不写 domain truth、不生成 owner receipt，也不声明 provider SLO、domain ready、production ready 或 App release ready。
- Provider transport 不得把 Progress-First tick 变成分钟级不可观测等待；Temporal client start/query/signal/cadence 连接必须有 bounded connect timeout，provider projection 声称 ready 但地址不可达时要快速转成 provider blocker / start failure，而不是占住 owner dispatch。

### 决策：Temporal managed process 退出必须保留 crash diagnostic

原因：DM002/DM003 的 Progress-First 推进暴露出一种 provider lifecycle 漂移：OPL 启动 Temporal service / worker 后，managed process 已退出，但 status 读取把 state 清掉并折叠成 `not_configured`。这会让 operator 只能看到 MAS owner action 仍未消费，却无法判断是 provider 进程退出、worker liveness 缺失、还是工作目录未配置，进而把时间耗在重复 receipt、read-model reconcile 或无效 tick 上。

影响：

- `family-runtime service status --provider temporal` 在存在 managed service state 但 pid 不存活时必须返回 `service_status=stale_state`、`blockers=[temporal_local_service_stale_state]`、原始 managed pid、log refs 和 `crash_diagnostic`；不得删除 state，也不得报告为 `temporal_local_service_not_managed`。
- `family-runtime worker status --provider temporal` 在 Temporal service 可达但 managed worker state 对应 pid 不存活时必须返回 `blockers=[temporal_worker_process_exited]`、原始 managed pid、`managed_worker_process_alive=false`、log refs 和 `crash_diagnostic`；不得把该状态折叠为 `temporal_runtime_not_configured`、`worker_not_ready` 的无来源泛化诊断或 source-stale 噪音。
- detached service / worker 的 stdout 与 stderr 必须写入 OPL runtime-state logs 并随 lifecycle state 暴露为 refs，方便 operator 判断具体 crash 原因；foreground worker 退出也必须写入 `exited` state 和 last exit reason。
- scheduler / tick 可以基于该诊断继续执行 provider repair 或 fail-closed typed provider blocker，但不得手写 MAS truth、queue DB、publication eval、artifact gate、paper package、owner receipt 或 typed blocker。
- 该规则只治理 OPL provider lifecycle 可诊断性和 Progress-First liveness currentness；它不声明 provider SLO satisfied、domain ready、production ready、paper repaired、publication ready 或 App release ready。

### 决策：attempt 创建 receipt 不能作为当前 provider readiness

原因：`stage_attempt.provider_receipt` 是 attempt 创建时的 admission 快照。长跑 attempt 可能在创建时记录 `provider_code_landed_unconfigured` / `provider_ready=false`，随后由 provider SLO 或 worker repair 恢复为 live running。如果 operator、MAS read-model 或 App 默认面继续消费创建时 receipt，就会把正在 heartbeat 的 attempt 误判为 provider 未配置，导致 Progress-First 监督耗在重复 receipt / read-model reconcile 上。

影响：

- `family-runtime attempt inspect|list|query` 的 operator-facing projection 必须投影 `provider_readiness_currentness`，并把 `effective_provider_readiness_source` 固定为 `current_provider_readiness`。
- 同一投影必须明确 `creation_receipt_currentness=creation_time_snapshot` 与 `provider_receipt_is_current_readiness=false`，保留历史 receipt 作为 provenance，但不能让 consumer 把它当作当前 provider liveness。
- `family-runtime attempt list --compact-timeline` 必须在 timeline item 和 `operator_summary` 顶层投影 `provider_liveness_attention`。当当前 provider 未 ready 时，该 attention 必须优先显示 `blocked_provider_not_ready`、blocking severity、worker lifecycle、repair action 和下一条 OPL provider 修复命令，避免 operator 先被 typed closeout、semantic gap 或 read-model reconcile 噪音带偏。
- 该规则只修正 OPL provider readiness read-model currentness，不改写历史 receipt、不写 domain truth、不执行 domain action、不生成 owner receipt，也不声明 provider SLO、domain ready、production ready 或 App release ready。

### 决策：active attempt 缺进度信号时必须暴露监督路由

原因：Progress-First 不能把 active / queued / running / checkpointed attempt 读成“没有动作”。当 attempt 缺 worker liveness、latest progress delta、stage log、owner closeout refs、next action，或 progress freshness 已 stale 时，App/operator 和 evidence-worklist 必须给出可监督下一步，让 operator 先检查 attempt、worker readiness、stage log、closeout refs、next forced delta 和 freshness refs，再决定 worker repair、继续监督或要求 domain typed closeout。

影响：

- App/operator drilldown、safe action bridge 与 `family-runtime evidence-worklist` 暴露 `progress_first_attempt_supervision` refs-only route，执行参数为 `opl family-runtime attempt query <stage_attempt_id>`。
- 默认 `progress_first_attempt_supervision` route 只从 `stage_attempt_workbench.attempts` 当前 workbench window 派生；`stage_attempt_workbench.evidence_attempts` 是 full audit / history 面，保留给 evidence、effective current context、stall lineage 和 drilldown，不能直接形成默认 open safe-action 队列。
- 该 route 的 authority boundary 固定为 `can_write_domain_truth=false`、`can_execute_domain_action=false`、`can_create_typed_blocker=false`、`can_create_owner_receipt=false`、`can_claim_domain_ready=false`、`can_claim_production_ready=false`。
- 该 route 必须携带 `missing_progress_signals`、`supervisor_safe_action_kind` 与 `typed_blocker_requirement`，把 stale / next-action 缺口明确投影为 supervisor-safe action 或 domain typed blocker requirement。
- provider worker repair 仍优先于 progress-first supervision；worker liveness 缺失时先修 worker，再判断 attempt 是否仍缺 stage/progress/closeout 信号。

### 决策：Progress-First anti-spin queue admission 必须阻断同源无交付物重复重驱

原因：DM002 / DM003 暴露出同一 study / domain / owner action lineage、同一 source fingerprint 在连续 closeout 中只产生 receipt-only、read-model reconcile、platform repair 或 refs-only accounting，而没有 `deliverable_progress_delta`、domain owner receipt 或 domain typed blocker 时，queue tick 仍可能继续启动新的 provider attempt。这样 operator 会看到“又跑了一轮”，但实际时间消耗在重复 receipt 和 read-model currentness 上，违背 Progress-First 的最快实质 delta 原则。

影响：

- `family-runtime queue tick` 在 stale-source、same-study single-flight 和 live-attempt 过滤之后，必须执行 Progress-First anti-spin admission gate。
- `family-runtime queue tick` 必须先完成可执行 owner delta admission，再进入 terminal sync、missing identity repair、waiting-approval reconcile、superseded attempt reconcile 和 provider blocker auto-redrive 这类维护动作；若已有 owner row 可派发，维护 reconcile 在该 tick 只投影为 deferred hygiene，不能消耗 `limit`、不能查询无关 running attempt，也不能阻断同 tick dispatch。只有没有 owner row 可派发时，tick 才允许通过 bounded maintenance/redrive 生成新的可执行候选，并再次执行 admission。
- 同一 domain-owner lineage 若已有达到阈值的历史 terminal attempt，且这些 attempt 只有 platform repair / receipt reconcile、无 `deliverable_progress_delta`、无 domain owner receipt，则新的 same-source queued / retry-waiting task 必须被阻断为 `progress_first_owner_delta_required`；首个强制消费面是 MAS `domain_owner/default-executor-dispatch`。
- domain-owner queued / retry-waiting task 若缺 `source_fingerprint`，不能绕过同源 anti-spin 判断直接进入 provider dispatch；必须先阻断为 `progress_first_owner_delta_required`，lineage reason 记录 `progress_first_source_fingerprint_required`，下一强制 delta 是 `source_fingerprint_or_fresh_owner_delta_required`。
- 被阻断 task 写入 OPL queue event `task_progress_first_anti_spin_blocked`，并携带 repeat count、lineage key、typed blocker refs、last delta classification、`next_forced_delta=domain_deliverable_or_owner_receipt_delta_required` 与 authority boundary。
- 允许继续 dispatch 的路径只有 fresh source、domain typed blocker、真实 deliverable delta、domain owner receipt、human override / stop ref 或新的 owner payload ref。
- 该 gate 是 OPL queue admission / refs-only lineage projection；它不写 domain truth、不生成 owner receipt、不创建 typed blocker、不声明 domain ready / production ready、不修改 artifact gate 或 current package。
- 缺失的 optional read-model surface 不能被虚构成 open closeout tail。特别是未观察到 `developer_mode_live_closeout_evidence` 时必须投影为 `status=not_observed`、`attention_count=0`，避免把空 evidence 面误当成 direct-fix / fork-PR / receipt reconcile 工作，继而在 Progress-First 默认动作中压过真实 owner delta。

## 2026-05-28

### 决策：同步 domain-handler checkpoint 不受 Temporal workflow-missing 回收覆盖

原因：OPL family-runtime 中的 domain-handler dispatch 是同步 owner callable transport；它可以在 typed queue attempt 中记录 checkpointed owner receipt / admission receipt，而不是一定启动一个可查询的 Temporal `StageAttemptWorkflow`。如果 terminal observation 回收器把这类 `domain_handler` executor 的 `temporal_workflow_not_started_or_not_found` 当成 provider failure，会把已被 domain owner 接收的 route task 错投影为 runtime unhealthy。

影响：

- `domain_handler` executor 的 stage attempt 不再因为 Temporal workflow-missing unavailable observation 被标记为 `failed`；该 observation 只能作用于真正由 provider workflow 承载的 stage attempt。
- MAS/MAG/RCA 等 domain-handler 仍必须返回 owner receipt、typed blocker、closeout refs 或 admission receipt；OPL 只保留 queue / attempt / liveness 投影，不据此授权 domain ready、quality verdict 或 artifact ready。
- 缺失的 provider scheduler cadence 不能报告为 healthy：`not_installed` 必须给出 `attention_required` 和 `opl family-runtime scheduler install --provider temporal`，让持续推进依赖显式 OPL provider scheduler，而不是 Codex heartbeat 手工补 tick。
- 若历史 residue 已经把 `domain_handler` attempt 写成 `failed` / `temporal_workflow_not_started_or_not_found`，但同一 queue task 已由 domain-handler transport 标记为 `succeeded`，`current_control_state` 必须以 queue terminal success 作为 OPL transport 收敛事实，并把该 terminal observation 标成 superseded observability evidence。这个状态仍然不等于 MAS owner receipt、domain ready、publication ready、artifact ready 或 paper package refreshed。

### 决策：uv archive cache recovery 成功后必须吸收到 managed-shell 首跑环境

原因：domain manifest 与 domain-handler command 的 `uv archive-v0` 缓存缺 `METADATA` 失败属于 OPL managed environment 损坏。若 OPL 只在当次失败后切 stable recovery tmp root，但后续 tick 继续从同一个损坏 primary `UV_CACHE_DIR` 首跑，就会让 Progress-first/read-model/reconcile 反复消耗一次无效失败和 retry。

影响：

- 当 `uv_cache_archive_missing` recovery retry 成功时，OPL 必须在 workspace-scoped managed root 写入 recovery marker；后续同一 workspace 的 domain manifest 与 domain-handler export / dispatch 首跑应直接使用该 stable recovery root。
- marker 只改变 OPL managed shell 的 `OPL_DOMAIN_COMMAND_TMP_ROOT`、`UV_CACHE_DIR`、`UV_PROJECT_ENVIRONMENT` 等外部环境路由，不写 domain truth、不生成 owner receipt、不授权 domain ready、quality verdict、artifact authority、App release ready 或 production ready。
- 若 recovery root 自身失败，仍按原 domain manifest / domain-handler fail-closed 路径暴露错误、typed blocker、retry 或 dead-letter；不得用静默 fallback、随机 tmp root 或清空 checkout 缓存掩盖问题。

### 决策：domain-handler 非零退出的错误摘要优先采用结构化 owner stdout

原因：domain handler 由 domain owner 负责返回 typed receipt / blocker。`uv`、安装器或 runner 可能在 stderr 输出环境同步噪声；如果 OPL queue `last_error` 优先采用 stderr，就会掩盖 stdout 中的 `reason` / `detail` / `blocked_reason`，让 operator 和自动巡检看不到真正的 owner blocker。

影响：

- `family-runtime` 在 domain-handler 非零退出时，超时和 spawn error 仍优先；除此之外，若 stdout 是结构化 JSON 并携带 `reason`、`detail`、`message` 或 `blocked_reason`，task `last_error`、tick dispatch `error`、stage activity error 和 notification body 必须使用该结构化摘要。
- stderr 和 stdout 继续保留在 runtime event payload 中，供诊断命令噪声、环境同步或底层进程行为；但无结构化 owner 错误时才回退到 stderr。
- 该规则只改善 OPL queue / retry / dead-letter 可观察性，不把 OPL 变成 MAS/MAG/RCA truth、quality verdict、artifact authority 或 owner receipt signer。

### 决策：App drilldown 继续通过真实模块拆分恢复 line-budget gate

原因：OPL line budget 仍是结构维护信号，但不再作为普通 `scripts/verify.sh` 的第一道硬门。若当前 main 的 App drilldown 聚合器或长测试超过 reviewed baseline，应通过职责明确的 parts 模块和独立测试文件在结构治理任务中收薄，而不是让普通 feature verify 被行数预算卡住，或把结构 debt 当成下游 domain 任务失败。历史超线文件可以通过 `contracts/opl-framework/source-structure-budget.json` 记录 reviewed baseline，但 baseline 只表示已审查的维护账本，不表示该结构已经理想。

影响：

- `runtime-tray-app-operator-drilldown` 继续保持薄聚合器；新增投影块进入 `runtime-tray-app-operator-drilldown-parts/`。
- App drilldown 的 manifest-cache 等独立测试场景必须独立成 case 文件；文件回到默认预算内后必须删除 retired baseline。
- 该规则只恢复 OPL repo 结构验证与可维护性，不改变 MAS/MAG/RCA truth、quality verdict、artifact authority 或 owner receipt 边界。

### 决策：Temporal provider 与长 CLI case 的 line-budget 恢复同样走 parts/cases 拆分

原因：同一 line-budget ratchet 规则适用于 provider runtime 与长 CLI test case。若 `family-runtime-temporal-provider.ts` 或 provider/system/MAS 相关测试超过 locked baseline，优先把稳定子职责迁入 `family-runtime-temporal-provider-parts/` 或独立 `tests/src/cli/cases/**` case/helper 文件；文件回到默认预算内后同步删除 retired baseline。

影响：

- `family-runtime-temporal-provider.ts` 保持 public export aggregator 与 worker lifecycle 入口；scheduler cadence 等独立 provider primitive 放在 provider parts 模块。
- 长测试按行为组拆分，聚合入口负责 import coverage，不用单文件继续承载所有 system/provider case。
- 该规则只治理 repo-source maintainability 和标准验证可执行性，不声明 provider production long-soak、domain ready、owner-chain closeout 或 global goal complete。

## 2026-05-27

### 决策：用户可读 stage log 成为标准 OPL Agent admission 要求

原因：stage attempt 的时长、token、cost 和 closeout refs 是 OPL 通用可观察性，但用户真正关心的是每个 stage 里问题是什么、目标是什么、对论文/基金/视觉交付/agent 构建做了什么、结果如何、还剩什么 blocker 和证据在哪里。这个语义不能由 OPL 从 artifact body 或领域 truth 里推断；必须由 domain stage closeout 明确返回，或明确返回 typed blocker。

影响：

- `stage_progress_log.user_stage_log` 是 OPL 投影面；OPL 负责 attempt ledger、duration、token、cost、closeout refs、receipt refs 和 missing/null 语义，不生成领域解释。
- 标准 domain agent scaffold / admission contract 现在要求 `user_stage_log_contract`，并要求每个 stage closeout 提供 `stage_name`、`problem_summary`、`stage_goal`、`stage_work_done`、`changed_stage_surfaces`、`outcome`、`remaining_blockers` 和 `evidence_refs`，或给出 typed blocker。
- `token_usage` / `cost` 缺失时只能显式保留为 observed-missing/null，不允许填 0 或事后猜测。
- MAG、RCA、OMA 这类 Foundry Agent 需要在各自 stage plane 中声明同一合同，并由各自 owner 提供 grant-facing、visual-facing 或 agent-building-facing 的人话摘要。OPL admission / App / Agent Lab 只消费该摘要和 refs，不写 domain truth、不读 artifact body、不授权质量或 export ready。

### 决策：嵌套 runtime help 是只读命令发现面

原因：operator 巡检经常通过 `--help` 确认当前 OPL CLI 是否支持某个 runtime 子命令。如果 `opl family-runtime queue list --help` 执行真实 queue list，或者 `provider-slo tick --help` / `tick --help` 穿透到 runtime parser 报 unknown，就会把帮助探测变成巨量 read-model 输出或误判为功能缺失。

影响：

- 顶层 CLI 在 command 参数中遇到 `--help` 时，必须返回对应 command-scoped help；`--help` 位于 `--` passthrough 之后时继续由下游命令接收。
- `family-runtime` help / usage 必须列出当前可用的 provider SLO、scheduler、queue redrive、queue hold/release 和 attempt query/inspect surfaces。
- help 输出只做命令发现，不启动 queue、tick、provider proof、domain dispatch 或任何 runtime mutation。

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
- 2026-05-21 追加：使用 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE` 的 MAS family-runtime dispatch 必须与 hydrate/export 使用同一个 OPL module locator。默认 dispatch 解析为 `uv run --directory <active MAS module checkout> --extra analysis medautosci sidecar dispatch --task <task> --format json`；显式 operator override 优先读取 `OPL_FAMILY_RUNTIME_MAS_DISPATCH`，再读取 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH`。`MAS` shorthand 只是 admitted domain 的稳定短名入口，不是兼容 facade，也不改变 OPL queue 只负责 transport/retry、MAS 继续持有 owner callable / study truth / publication verdict / artifact authority 的边界。
- 2026-05-21 追加：`opl family-runtime intake|tick --hydrate --profile <profile>` 是 MAS profile 的显式 operator override，优先于 env profile 与 active workspace binding。它只选择 MAS sidecar export 的 profile，并继续通过 OPL module locator 调用 active MAS checkout；OPL 不因此获得 MAS study truth、publication verdict、artifact authority 或 owner receipt 权限。
- 2026-05-22 追加：当 MAS sidecar export 暴露 `domain_owner/default-executor-dispatch` task 时，OPL family runtime 负责把该 task 入队、建立 `codex_cli` stage attempt，并在 Temporal provider 可启动时直接启动该 Codex owner workflow。当前 admission 只接受 MAS 已注册的 default-executor owner：`write`、`ai_reviewer`、`write/ai_reviewer`、`gate_clearing_batch`、`medautoscience` 和 `publication_gate_owner`。workspace locator 保留 `dispatch_ref`、action type、dispatch authority、source refs、`next_executable_owner` 和 `authority_boundary=mas_default_executor_dispatch_request_only`。该 queue task 只有在 Temporal start receipt 已记录后才可标记为 `succeeded`；Temporal address / worker / stage packet 不可启动时必须 fail-closed 为 `blocked`，不能只留下 queued attempt。
- 2026-06-03 追加：OPL 源码 API 与 operator-facing event 统一使用 generic default-executor surface；`mas_default_executor_*` stable id、source fingerprint、blocked reason、activity kind 和 legacy read-model 字段只保留为已存在 ledger identity，不再表示 MAS 持有 executor runtime。MAG/RCA 的 controller、route helper 或 Hermes proof lane 必须消费 OPL-owned stage attempt / lease / receipt evidence；缺失时返回 domain-owned typed blocker，不能在 domain repo 内自建 durable loop、repo-local route-run owner 或 attempt ledger。
- 2026-05-22 追加：`domain_owner/default-executor-dispatch` 的 queue `succeeded` 只表示 OPL 已接收 MAS owner handoff 并启动 provider-backed Codex owner attempt；不得把它解释成 Codex owner attempt 已完成、MAS owner receipt 已产生、论文质量已关闭或 package/current manuscript 已刷新。
- 2026-05-22 追加：`domain_owner/default-executor-dispatch` 不走 MAS sidecar dispatch activity，也不允许 OPL 写 domain truth、publication quality、artifact gate 或 current package。后续论文推进必须由 queued Codex stage attempt 读取 MAS dispatch request / prompt contract 后走 MAS owner path，并以 MAS owner receipt、AI reviewer-backed `publication_eval/latest.json`、publication gate 或 typed blocker 作为完成证据。
- 2026-05-22 追加：queued `codex_cli` stage attempt 启动后默认必须进入真实 Codex CLI runner；只有显式 `codex_stage_runner.runner_mode=dry_run|live_dry_run` 的测试、诊断或 fixture 才允许 dry-run transport。`executor_kind=codex_cli` 不能静默降级成 dry-run，否则 MAS default executor handoff 只会留下 checkpoint/blocked 投影而不会启动 writer owner。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 的本地 `codex_stage_activity` projection 也必须继承 `executor_kind=codex_cli` 的 live-runner 语义，除非 operator 显式设置 `OPL_CODEX_STAGE_RUNNER_MODE=dry_run|live_dry_run`。本地 projection 不能在 Temporal workflow 已启动真实 Codex activity 时默认显示 dry-run，否则 supervisor 会误判 writer 没有启动；实际完成仍以 Temporal activity closeout、typed closeout packet 和 domain owner receipt 为准。
- 2026-05-22 追加：`codex_cli` stage attempt 是长时 AI executor 工作，不是 10 分钟内必须完成的普通 sidecar activity。Temporal provider 对 Codex activity 使用长 `start_to_close`、短 heartbeat timeout 和周期 heartbeat，默认 Codex runner 窗口为 60 分钟；sidecar dispatch 和 scheduler tick 继续使用短 activity timeout。这样 MAS 论文 writer 可以完成大稿修复或 typed blocker，而不会被 OPL transport 在第 10 分钟杀掉。
- 2026-05-24 追加：`codex_cli` stage runner 的外层 Temporal heartbeat 只表达 worker activity 仍在监督进程，不能单独证明 Codex 子进程或 session 正在推进。runner 必须同时保留 60 分钟总窗口和独立的无输出进展 watchdog；默认 `runner_no_output_timeout_ms=300000`，可由 workflow input 或 `OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS` 收紧或放宽。无 stdout/stderr 进展超过该窗口时，OPL provider transport fail-closed 为 `timeout_reason=no_output_timeout`，让 attempt 进入 provider blocker/redrive，而不是靠 heartbeat 无限续命。该规则不授权 MAS domain truth、owner receipt、publication quality、artifact gate 或 current package。
- 2026-05-30 追加：`codex_cli` stage runner 还必须监督 Codex JSONL 中的 active `command_execution`。当某条 shell/tool command 已进入 `pending` / `in_progress`，但在 `OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS`（默认 300000ms）内没有完成、失败或产生更多聚合输出时，runner fail-closed 为 `timeout_reason=command_no_progress_timeout` / `blocked_reason=codex_cli_command_execution_no_progress`，并在 `process_output_summary.active_command` 投影 tool call id、title、status 与启动时间。该 watchdog 只处理 provider liveness 与 redrive 可见性；OPL 不判断 domain 检索策略是否正确，也不授权 MAS truth、owner receipt、publication verdict、artifact gate 或 current package。
- 2026-05-26 追加：如果 `Codex CLI --json` 在 stdout 或同 thread 的 `CODEX_HOME/sessions/**/<thread-id>.jsonl` 中产生 Responses native `function_call`，但 OPL 当前没有为该 nested Codex session 提供 tool host / function_call_output 回路，`codex_cli` stage runner 必须立即 fail-fast 为 `timeout_reason=unsupported_tool_protocol` / `blocked_reason=codex_cli_unsupported_function_call`，并终止子进程组，不能等无输出 watchdog 把它泛化成 `typed_closeout_packet_required`。如果同一 session 已产生匹配 `function_call_output` / `tool_call_output` / `tool_result`，则该调用已由 Codex CLI 自身完成，不能被 session recovery 误计为 pending unsupported tool call；此时 runner 应继续按 terminal typed closeout、no-output timeout 或总超时判断。Temporal workflow 必须把真实 provider blocker 传给 dispatch activity，attempt / queue read model 必须把未解决的工具协议缺口归类为 OPL `execution_retryable` infrastructure blocker，用于 retry/redrive；该 blocker 不授权 MAS domain truth、owner receipt、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：`codex_cli` provider attempt 的 workflow input 必须携带真实 stage packet ref，并把 MAS default executor 的 workspace locator 绑定到 domain workspace root；不能让 Codex runner 在 OPL repo 里只拿到 attempt id 和 `stage_packet_ref=unavailable`。Codex activity 也不能因短 heartbeat timeout 自动重复启动多个同一 attempt 的 live Codex 进程；一次 Codex activity 失败应作为 provider failure / typed blocker 进入 owner routing，而不是隐式并发重试。
- 2026-06-09 追加：MAS current-control `action_queue` provider admission 也必须满足同一 stage packet hard gate。若 queue row 没有显式 `dispatch_ref` / `stage_packet_ref`，OPL 只能在 domain workspace 存在 canonical dispatch packet `studies/<study_id>/artifacts/supervision/consumer/default_executor_dispatches/<action_type>.json` 时派生 stage packet refs；仍缺真实 packet 时，`codex_cli` admission 必须 fail closed 为 `current_control_provider_admission_stage_packet_ref_missing`，不得创建缺 `stage_packet_ref` 的 queued task、stage attempt 或 execution authorization。该规则只治理 OPL launch admission 与 provider transport identity，不写 MAS truth、不生成 owner receipt / typed blocker、不授权 publication quality、artifact gate、paper package、`current_package`、domain ready 或 production ready。
- 2026-05-22 追加：App/operator 上游的 `stage_attempt_workbench` 必须把 queued MAS default `codex_cli` attempt 的 stage packet ref、domain workspace root、profile ref 和 object-form source refs 投影出来。该投影只是 launch/provenance/read-model evidence：它可以帮助 operator 确认 Codex 将在 domain workspace 内读取明确 dispatch/stage packet，但不能声明 stage complete、domain ready、production ready、MAS owner receipt、论文质量或 package 刷新。live `codex_cli` 启动前继续 fail-closed 检查 stage packet ref 与 workspace root；inspect/query/read-model 路径保持可读，用于暴露缺口。
- 2026-05-27 追加：每个 provider-backed stage attempt 必须通过 OPL 统一 `stage_progress_log` 投影“要做什么、实际做了什么、花费/耗时是否观测到、Temporal visibility refs、证据 refs 和权限边界”。该 log 进入 `family-runtime attempt query|inspect`、operator visibility 和 `stage_attempt_workbench`，并复用 `usage_projection` 的显式 unknown/null 语义；它只表达 OPL ledger、provider run、activity events、typed closeout 和 domain receipt refs 的可审计事实，不替 MAS/MAG/RCA 宣布 ready、quality verdict、owner receipt 或 artifact/package 刷新。
- 2026-05-27 追加：`stage_progress_log.user_stage_log` 是面向用户询问“哪个 stage、问题是什么、论文/基金/视觉交付物做了什么、耗时和 token 多少”的统一读面。OPL 只提供容器、stage identity、duration/token/cost telemetry、fallback wall-clock、refs 和显式 missing/null；“问题是什么”和“做了什么”的人话语义只能来自 domain typed closeout 的 `user_stage_log` / `stage_log_summary` / `human_stage_log`。标准 OPL Agent 必须填 `stage_work_done` 与 `changed_stage_surfaces`；旧 MAS 论文 alias 不再进入 OPL 标准 contract、runner 或 projection。domain 未提供时必须投影 `missing_domain_semantic_summary`，不能由 OPL 读取 artifact body、猜论文/MAG/RCA 交付物改动或把 provider completed 解释成质量完成。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 在可观测到 Temporal terminal failure 或 timeout 时，必须把本地 `stage_attempts` ledger 的 OPL transport projection 同步为 `failed`，并在 `provider_run.terminal_observation` 保留 Temporal `workflow_status` / query status / reason。该同步只表达 provider-backed stage attempt transport 已失败，用于避免 operator 误读 queued/registered；它不授权 stage complete、domain ready、domain owner receipt、artifact authority、质量 verdict 或 production evidence closure。
- 2026-05-25 追加：Temporal terminal failure / timeout 的 read-model sync 必须以 `workflow.describe()` 的 terminal `workflow_status` 为先。对于已经 `FAILED` 或 `TIMED_OUT` 的 workflow，custom `StageAttemptQuery` 可能不可用或长时间无响应；OPL 不得把这种 terminal query failure 误投影成 `temporal_service_unreachable`，也不得因此让本地 `stage_attempts` / linked MAS default-executor queue task 停留在假 `running`。对于已经 `COMPLETED` 的 workflow，attempt query / inspect 必须优先读取 Temporal 存储的 workflow result，同步其中的 typed closeout refs；不得为了读取 terminal completed state 重新 query/replay 旧 workflow history，因为 provider activity rename 会触发 nondeterminism。该同步只关闭 OPL provider transport liveness，不生成 MAS owner receipt、不写 domain truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-26 追加：MAS default-executor scheduler / tick / admission 在因同 dispatch live attempt 执行 live-skip 之前，必须先查询可观测 Temporal terminal state 并同步本地 attempt/task read-model。若旧 workflow 已 `FAILED`、`TIMED_OUT`、provider non-completed 或 provider-completed typed closeout，OPL 必须先把 linked task 收敛为 `blocked` / `succeeded` / accepted typed closeout projection，再继续当前 queued row selection；不得继续刷新旧 lease 或把旧 workflow 当成 live single-flight blocker。tick 即使没有 queued work，也必须扫描 scoped running MAS default-executor task，主动同步可观测 terminal provider attempt，避免外层巡检把 terminal workflow 长期投影成 live run。该规则只修复 OPL queue liveness arbitration，不生成 MAS owner receipt、不写 study truth、不授权 publication gate、paper package 或 `current_package`。
- 2026-05-26 追加：MAS default-executor scheduler / tick / admission 对旧 Temporal workflow 的观察必须走 OPL 安全 read-model 查询入口，不能在 queue tick 或 single-flight live-skip 前直接调用 provider raw query。`WorkflowNotFoundError` / missing workflow 必须被投影为 `temporal_stage_attempt_query_unavailable`，再由 attempt/task sync 和 provider-transport auto-redrive 收敛；未知 provider 错误仍按 fail-closed 抛出。该规则避免一个过期 workflow ID 终止整轮 scheduler tick，但只修复 OPL provider transport liveness，不写 MAS truth、不刷新 paper package、不关闭 publication quality。
- 2026-05-25 追加：MAS default-executor single-flight 只能由真实 live linked task/attempt 触发。若同 dispatch 的旧 `stage_attempt` 仍残留 `running` / `checkpointed` / `human_gate`，但其 linked queue task 已进入 `blocked`、`dead_letter` 等非 live 状态，或 attempt 的 `provider_run.provider_status` 已 terminal，scheduler / default-executor start 不得继续用它跳过新 source row；该旧 attempt 只能作为 provider transport/read-model residue，不能阻挡 MAS owner 新 handoff。该规则只修正 OPL queue liveness arbitration，不生成 MAS owner receipt、不写 domain truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：`family-runtime attempt query|inspect` 对 MAS `domain_owner/default-executor-dispatch` 的 linked queue task 还必须反向同步 provider non-completion。若 Temporal query 显示 workflow 已结束但 stage query status 为 `blocked`，例如 domain sidecar dispatch 返回 `typed_closeout_packet_required`，OPL 要把本地 stage attempt 投影为 `blocked`，并把原先因 provider start 成功而标记的 queue task 从 `succeeded` 改为 `blocked`，`last_error` 保留 blocker reason，`dead_letter_reason=temporal_stage_attempt_not_completed`。该反向同步只修复 operator/read-model 的 liveness 与 blocker 可见性，不执行 writer 修复、不生成 MAS owner receipt、不更新 paper/package/`current_package`，也不授权 publication ready、domain ready 或 artifact mutation。
- 2026-05-22 追加：`codex_cli` stage runner 可以从 Codex `--json` 的最后一个非空 `agent_message` 中读取 typed closeout JSON，但只接受终端消息本身是 `stage_attempt_closeout_packet`、`stage_memory_closeout_packet` 或 `domain_stage_closeout_packet` 且带 closeout refs 的情况；非终端 JSON、正文、代码块或 free text 都不能作为 completion。Temporal `StageAttemptWorkflow` 必须把 Codex activity receipt 中的 typed closeout packet 传给后续 domain sidecar dispatch activity；若没有 packet，继续 fail closed 为 `typed_closeout_packet_required`。这只修 OPL provider completion 传递链，不授权 domain ready、MAS owner receipt、publication quality、artifact gate 或 current package。
- 2026-05-27 追加：`codex_cli` stage runner 与 Temporal `StageAttemptWorkflow` 接受 typed closeout packet 前必须校验 current attempt binding。若 packet 携带的 `stage_attempt_id` 与当前 attempt 不一致，必须丢弃该 packet 并 fail closed 为 `typed_closeout_stage_attempt_id_mismatch`，不能把旧 attempt/session 的 closeout refs 传给 domain dispatch 或标记 provider completed。runner 对可用的 `idempotency_key` 也执行同类 currentness 校验。该规则只修复 OPL provider closeout currentness，不生成 domain owner receipt、不写 MAS truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-22 追加：当 `domain_owner/default-executor-dispatch` 因 OPL provider transport 问题进入 `blocked`，且 `dead_letter_reason` 明确为 `temporal_stage_attempt_start_failed`、`temporal_stage_attempt_not_completed` 或 `temporal_stage_attempt_failed` 时，operator redrive 归 OPL queue/attempt owner。`opl family-runtime queue redrive <task_id> --reason <operator_reason>` 只能在同一 MAS source fingerprint 下创建新的 provider stage attempt 并把 queue task 放回 `queued`；它不得修改 MAS source fingerprint、domain truth、publication quality、artifact gate、paper package 或 `current_package`，也不得把 redrive 解释为 MAS owner receipt 或论文 ready。domain owner export/source fingerprint 变化时仍走 hydration requeue。
- 2026-05-28 追加：MAS `domain_route/reconcile-apply` / publication aftercare 这类 owner-route task 若 projection 明确声明 `queue_owns_attempts_retry_and_dead_letter=true` 且 OPL 不具备 MAS truth/package 写权限，operator redrive 也归 OPL queue/attempt owner。`opl family-runtime queue redrive <task_id> --reason <operator_reason>` 只允许在 linked Temporal stage attempt 已 `failed|blocked|dead_lettered`、blocked reason 属于 provider transport failure、且没有 typed closeout / owner receipt refs 时创建新的 provider stage attempt；它不得写 MAS truth、publication quality、artifact gate、paper package 或 `current_package`，也不得把 queue `succeeded` 解释成 domain completion。
- 2026-05-26 追加：上述 provider transport blocker redrive 也可以由 `family-runtime tick` 自动执行，但只能用于 MAS `domain_owner/default-executor-dispatch` 的 OPL-owned provider blocker，且 `dead_letter_reason` 必须仍属于 `temporal_stage_attempt_start_failed`、`temporal_stage_attempt_not_completed` 或 `temporal_stage_attempt_failed`。自动 redrive 必须遵守 queue `max_attempts`，超过预算时进入 `dead_letter/retry_budget_exhausted`；若同 dispatch 已有更新 source fingerprint 的当前 MAS handoff，旧 blocked task 不得被自动 redrive，只保留为 audit residue。该自动动作只创建新的 provider stage attempt / queue retry，不写 MAS truth、不刷新 paper package、不关闭 publication quality、不替 MAS AI reviewer 宣布 ready。
- 2026-05-27 追加：当上述 OPL-owned provider retry 已进入 `dead_letter/retry_budget_exhausted`，且同一 task 的 stage attempt ledger 存在 `dead_lettered` / `retry_budget_exhausted` 的 Temporal `codex_cli` provider evidence 时，operator 可以在确认 OPL provider/runtime 已修复后用同一个 `opl family-runtime queue redrive <task_id> --reason <operator_reason>` 做一次显式 redrive。该动作只清空 queue retry terminal state、创建新的 provider stage attempt 并留下 `task_operator_redrive_from_dead_letter_provider_retry_budget` 审计事件；它不自动循环重试、不修改 MAS export/source fingerprint、不手写 queue DB、不写 MAS truth、publication quality、artifact gate、paper package 或 `current_package`，也不把 redrive 解释为 MAS owner receipt、AI reviewer verdict 或论文 ready。
- 2026-05-27 追加：所有 OPL family-runtime SQLite 连接，包括 queue、lifecycle index、operator tray、production closeout 和 domain memory 的读路径，都必须通过统一 opener 设置 `PRAGMA busy_timeout`。短时 WAL 写锁只能让读取等待 bounded 时间，不能把 `database is locked` 投影成 provider unhealthy、巡检失败或 MAS 论文线需要人工恢复。该规则只提高 OPL queue/read-model 对正常并发的耐受度；它不修改 MAS domain truth、不生成 owner receipt、不授权 publication quality、artifact authority 或 paper package 刷新。
- 2026-05-27 追加：`family-runtime queue inspect`、`attempt inspect` 与 `attempt query` 的 Temporal read-model re-query 必须有硬 deadline。旧 workflow result、describe 或 query 长时间无响应时，OPL 投影 `temporal_stage_attempt_query_timeout`，并继续返回本地 attempt / stage_progress_log / queue read model；本地已 `completed` 且带 accepted typed closeout 的 attempt 不需要为了补旧 Temporal terminal observation 再 replay workflow。该规则只保证 OPL provider/read-model 可观测面 bounded，不生成 MAS owner receipt、不写 domain truth、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-29 追加：当 operator 需要暂停某个 study 或 task scope 的 work 时，必须使用 OPL queue owner 的 `opl family-runtime queue hold --study <study_id> --reason <operator_reason>`。该命令写入 durable scoped admission hold；已存在的 scoped `queued` / `retry_waiting` / `running` task 会移到 `waiting_approval`，清除 lease，并把 linked active stage attempt 投影到 `human_gate` / `operator_hold_requested`。后续 hydrate、enqueue 或 redrive 命中同一 scope 时也必须进入 `waiting_approval`，不能重新变成 worker 可取的 queued work。该命令只写 OPL queue / stage-attempt ledger、event 与 notification，不取消 domain truth、不删除 task、不写 MAS/MAG/RCA artifact、quality verdict、paper package 或 `current_package`；恢复必须走显式 operator owner route，并保持 domain owner receipt / truth / quality authority 不变。
- 2026-06-02 追加：`queue hold` 必须有对称的 scoped `opl family-runtime queue release --study <study_id> --reason <operator_reason>` 恢复入口。`queue release` 只解除 matching active scoped hold；只有本次确实释放了 hold，才会把同 scope 且 `last_error` 等于该 hold reason 的 `waiting_approval` task 放回 `queued`，并把 linked `human_gate/operator_hold_requested` attempt 作为 OPL admission projection 恢复为 `queued`。它不得审批普通 `--requires-approval` human gate task，不得释放其他 study/task scope，不得手写 SQLite 或绕过 queue owner，也不得写 MAS/MAG/RCA domain truth、publication quality、artifact gate、paper package 或 `current_package`。Progress-first resume 场景下，MAS 升级完成后应先解除对应 durable hold，再运行 hydrate/tick/scheduler admission；不能用重复 read-model reconcile 或单 task approve 代替 scoped release。
- 2026-06-02 追加：如果迁移或升级过程留下 `waiting_approval` task 且 `last_error` 等于暂停 reason，但 matching active `queue_holds` ledger 已不存在，普通 `queue release` 必须保持 noop，避免把普通 human gate 当作暂停恢复。operator 确认这是同一 scoped hold 的 stranded projection 后，必须使用 `opl family-runtime queue release --study <study_id> --reason <operator_reason> --repair-stranded-hold`；该模式仍只匹配 exact scope + reason 的 stranded tasks，不审批 `last_error=null` 的普通 approval task，不写 domain truth，也不允许逐条 approve 代替 owner-level 恢复。
- 2026-05-29 追加：当 operator 需要停止已经启动的 Temporal stage attempt 时，必须使用 OPL attempt owner 的 `opl family-runtime attempt cancel <stage_attempt_id> --reason <operator_reason>`。该命令发出 Temporal workflow cancel transport 后，必须立即把本地 non-terminal Temporal attempt 投影为 `failed` / `operator_cancel_requested`，把 provider run 标记为 `cancel_requested`，并把 linked MAS default-executor task 阻塞为 `temporal_stage_attempt_canceled`，直到 Temporal terminal observation 可见后再收敛为 provider-only cancellation blocker；不能等待下一轮 query 才暴露 cancellation。它不生成 domain owner receipt、不声明论文/基金/视觉交付 ready、不写 MAS truth、publication quality、artifact gate、paper package 或 `current_package`。暂停某条 live study 线时，operator 应先停止或取消已启动 attempt/worker，再 hold scoped queued/retry/running work，避免旧 worker 在 hold 前后竞态取走新任务。
- 2026-06-02 追加：当 Codex activity 已被取消或 transport lifecycle 返回 `codex_cli_activity_cancelled` 时，linked MAS default-executor task 必须收敛为 `dead_letter_reason=temporal_stage_attempt_canceled`，而不是泛化成 `temporal_stage_attempt_not_completed`。Progress-first scheduler tick 不得对该 cancellation lifecycle blocker 做自动 redrive，避免在没有新 owner delta 的情况下反复启动同一论文 work unit；恢复只能来自 operator 显式确认 provider/runtime 已恢复后的 `queue redrive`，或 MAS owner 以新 source fingerprint / owner delta 重新导出当前 work unit。该规则只切断 provider lifecycle 空转，不写 MAS truth、不生成 owner receipt、不刷新论文 package 或 publication verdict。
- 2026-05-22 追加：`codex_cli` stage runner 的 Codex JSONL parser 必须同时支持 legacy `thread.started` / `item.completed` 事件和 Codex Desktop/exec session JSONL 包装事件：`session_meta.payload.id` 作为 thread id，`event_msg.payload.type=agent_message` 的 `payload.message`、`event_msg.payload.type=task_complete` 的 `payload.last_agent_message`、以及 `response_item.payload.type=message` 的 assistant content 都属于可观测 assistant message。typed closeout 仍只从最后一个非空 assistant message 解析；支持新包装格式不能变成从任意历史 message、token_count、function output 或 free text 中猜测 closeout。
- 2026-05-22 追加：如果 Codex CLI stdout 只暴露 `session_meta` / thread id，而终端 assistant closeout 只落在同一 thread 的 Codex session JSONL，`codex_cli` stage runner 可以从 `CODEX_HOME/sessions/**/<thread-id>.jsonl` 做一次受限恢复。恢复仍必须复用同一 strict parser，只接受最后一个非空 assistant message 中的 typed closeout packet；找不到同 thread session、session 文件过大、超过扫描界限或终端消息不是纯 typed JSON 时继续 fail closed 为 `typed_closeout_packet_required`。
- 2026-05-22 追加：Codex Desktop / Codex exec 的终端 assistant closeout 可能在 stdout/session JSONL 中表现为相邻 `agent_message` chunks，或在进程退出后才完成 session file flush。`codex_cli` stage runner 可以在受限时间窗口内重读同 thread session，并可以把终端连续 assistant message suffix 还原后再做 strict JSON parse；但仍只接受终端 suffix 整体是纯 typed closeout JSON 的情况，不能从非终端 progress JSON、命令输出、正文片段、代码块或任意历史 message 中拼接/猜测 closeout。该规则只增强 provider transport 对真实 Codex 输出形态的鲁棒性，不改变 OPL 不能授权 domain truth、MAS owner receipt、publication quality、artifact gate 或 current package 的边界。
- 2026-05-22 追加：`family-runtime queue inspect` 必须像 `attempt query|inspect` 一样对 linked Temporal stage attempt 做 terminal read-model sync。若 Temporal workflow 已 `COMPLETED` 且 query completion boundary 为 provider completed，OPL 只把经过 domain sidecar dispatch receipt projection 的 typed closeout refs、consumed refs、writeback refs、next owner、route impact 和 domain-owned verdict string ingest 到本地 attempt ledger；该同步只修复 queue/operator read-model currentness，不生成 MAS owner receipt、不写 domain truth、不授权 artifact / package / publication ready，也不把 provider completion 写成 domain ready。
- 2026-05-28 追加：MAS `paper_autonomy/*` 这类 provider-hosted domain-handler task 不能把 domain handler 的 `accepted=true` 当成 queue terminal success；只有 typed closeout packet 或 domain-owned receipt/closeout refs 能让 OPL 把 task/attempt 投影为 `succeeded` / checkpointed closeout。若 dispatch output 缺少 typed closeout 和 closeout refs，OPL 必须 fail-closed 为 `blocked`，`last_error` / `dead_letter_reason` / stage attempt blocker 使用 `domain_handler_closeout_required`；已有历史 `succeeded + checkpointed + closeout_refs=[]` 残留必须由 tick/read-model repair 收敛为同一 blocker。该规则只修复 OPL queue/attempt currentness，不写 MAS truth、不执行 paper repair、不刷新 artifact gate / paper package / `current_package`，也不授权 publication ready。
- 2026-05-22 追加：linked MAS default executor task 的 task-level projection 必须按当前 attempt 顺序收敛，不能让旧 Temporal terminal failure 覆盖较新的 accepted typed closeout。OPL 可以把同 task 的 provider-only blocker 清回 `succeeded`，也可以把当前 terminal failure/blocker 投到 task；但一旦同 task 下存在更新的 accepted typed closeout，旧 failed/blocked attempt 只能更新自身 attempt ledger，不得改写 task status、last error 或 dead-letter reason。该规则只修复 queue/read-model currentness，不改变 MAS owner receipt、publication verdict、artifact authority 或 package refresh 权限。
- 2026-05-22 追加：linked MAS default executor task 的旧 terminal blocker 也不得覆盖同 task 下较新的 queued/running redrive attempt。operator redrive 创建新 attempt 后，旧 workflow 的迟到 `typed_closeout_packet_required` 只能更新旧 attempt ledger；task-level status 继续表达当前 redrive attempt 的启动/运行状态，直到该较新 attempt 自己产生 terminal blocker、typed closeout、MAS owner receipt 或 domain gate receipt。该规则只解决 provider transport 观察乱序，不授权 MAS domain truth、publication quality、artifact gate 或 current package。
- 2026-05-23 追加：linked MAS default executor task 的 `succeeded` 是 provider-admission receipt，不是 domain terminal completion。hydrate/export 若用相同 dedupe key 送来更新的 dispatch payload、owner route refs 或 source fingerprint，OPL 不能套用通用 `succeeded + payload changed => requeue` 规则重启 writer；这会在 MAS route 已转向 AI reviewer 或 gate 后启动 stale writer attempt。自动重驱动只允许用于 blocked provider transport 且原因在 OPL redrive contract 内，或由 MAS owner 以新的 dedupe/work-unit task 明确表达。
- 2026-05-26 修订：当 MAS sidecar 仍导出同一个 `domain_owner/default-executor-dispatch` pending task，且同 dedupe 的 linked task 只是旧 `succeeded` provider-admission projection 时，OPL 不得因 `payload.opl_domain_export_context.owner_fingerprint` 新增或变化而 requeue 或启动新的 provider attempt；同 dedupe 的 succeeded MAS default-executor task 只能刷新 `opl_domain_export_context` 与 `domain_dispatch_evidence_record_payload` 这类 refs-only metadata，并记录 `task_metadata_refreshed_from_domain_export`。需要新 attempt 时，必须由 blocked provider transport redrive、operator redrive，或 MAS owner 以新的 dedupe/work-unit task 明确表达。OPL 仍不写 MAS domain truth、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-24 追加：`domain_owner/default-executor-dispatch` admission 对同一 queue task 必须 single-flight。只要同 task 已有 `queued`、`running`、`checkpointed` 或 `human_gate` 的 Temporal `codex_cli` stage attempt，hydrate/source fingerprint 变化不得再创建第二个 live attempt；start Temporal 前也必须先用 queue task 的 `queued|retry_waiting -> running` 原子 claim 拿到 lease。claim 失败或已有 live attempt 时只记录 skipped event，不启动第二个 Temporal workflow，不把 task 错误转成 provider blocker。operator redrive 仍只允许 blocked provider-transport task 通过 OPL redrive contract 生成新 attempt；该规则不授权 MAS domain truth、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-25 追加：`domain_owner/default-executor-dispatch` single-flight 还必须跨 refreshed task row 生效。MAS sidecar export 的 `source_fingerprint`、dedupe key 或 owner implementation fingerprint 变化可能让同一 owner handoff 落成新的 queue task；只要已有 live Temporal `codex_cli` attempt 绑定同一 `workspace_root`、`study_id`、`action_type` 和 `dispatch_ref`，新 task 只能记录 `live_stage_attempt_exists_for_dispatch` skip，不得再创建或启动第二个 writer / AI reviewer workflow。该规则只约束 OPL admission / provider transport single-flight，不写 MAS truth、不合并论文结论、不授权 publication ready、artifact gate 或 package/current manuscript。
- 2026-05-25 追加：跨 task 的 `domain_owner/default-executor-dispatch` single-flight 默认只把已经 provider-started 的 live attempt 视作占用，也就是本地状态 `running`、`checkpointed` 或 `human_gate`；唯一例外是同一 dispatch identity 的 `queued` attempt 已绑定一个持有新鲜 `running` lease 的 queue task，此时它代表已 claim 但 Temporal start receipt 尚未落回的 admission 窗口，也必须阻断并发 task 抢跑。同一 task 内的 `queued` attempt 仍用于防重复创建；但无有效 task lease 的跨 task `queued` / `registered` ledger residue 不能挡住 refreshed task 启动，否则 Temporal workflow 未创建或不存在时会把 MAS owner handoff 永久卡成假 live。该规则仍只修 OPL queue/provider liveness，不写 MAS truth、不授权 artifact gate、publication quality、paper package 或 `current_package`。
- 2026-05-25 追加：跨 task 的 `domain_owner/default-executor-dispatch` single-flight 以同一 dispatch identity 的 live provider-started attempt 为准，而不是只看同一 MAS `source_fingerprint`。`source_fingerprint` 变化可以让 OPL 保留新的 queued/retry task 作为当前 owner export 待处理事实；但只要同一 `workspace_root` / `study_id` / `action_type` / `dispatch_ref` 下已有 `running`、`checkpointed` 或 `human_gate` 的 Temporal `codex_cli` attempt，新 task 只能记录 live-skip 并刷新 running task lease，不能启动第二个 writer / reviewer workflow。无有效 task lease 的跨 task `queued` / `registered` residue 仍不得阻断 refreshed task 启动。该规则只治理 OPL queue selection、attempt liveness 与 read-model 去污染，不写 MAS truth、不选择 domain verdict、不授权 publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-28 追加：MAS default-executor single-flight 还必须覆盖同一 `workspace_root` / `study_id` 下不同 `action_type` / `dispatch_ref` 的 owner handoff。若 reviewer recheck 已有 provider-started `codex_cli` attempt，writer repair task 只能记录 `live_stage_attempt_exists_for_study` / `same_study_live_stage_attempt_exists` skip 并刷新 live task lease；反向亦然。这个 study-level 互斥只对 provider-started `running|checkpointed|human_gate` attempt 生效，不把无有效 lease 的 queued/registered residue 当成 live。该规则防止同一论文同时运行 AI reviewer 与 write owner，仍只约束 OPL admission / queue / provider transport，不写 MAS truth、不修改 `publication_eval/latest.json`、不刷新 paper package 或 `current_package`。
- 2026-05-29 追加：上述 study-level 互斥还必须覆盖 claim-to-provider-start admission window。若同一 `workspace_root` / `study_id` 下 reviewer/write 的另一个 default-executor task 已经通过原子 claim、持有新鲜 running lease，且其 `codex_cli` stage attempt 仍处于 `queued` / provider `registered`，它已经代表一个正在启动的 owner workflow；不同 `action_type` 的候选必须记录 `live_stage_attempt_exists_for_study` skip，不得在 Temporal start receipt 落回前抢跑。这个窗口只适用于不同 action 的同 study 互斥；同 action 的 stale/newer source currentness 仍按既有 refreshed source 规则处理，避免 stale queued residue 永久阻塞当前 owner handoff。该规则只修 OPL queue/provider admission race，不写 MAS truth、不修改 `publication_eval/latest.json`、不刷新 paper package 或 `current_package`。
- 2026-05-29 追加：`family-runtime tick` 在同一 tick 内完成 hydrate、blocked auto-redrive 和 candidate selection 时，MAS default-executor 必须按同一 `workspace_root` / `study_id` 做 tick-local single-flight；即使 stale provider blocker 与 current reviewer/writer source row 同时进入候选，也只能启动一个当前 row。blocked auto-redrive 还必须按同一 study/action 的 current source fingerprint 判定 stale，发现 newer source row 时记录 `task_default_executor_stale_auto_redrive_skip` 与 `mas_default_executor_auto_redrive_stale_skipped_count`，不得把旧 blocker requeue 成并发 attempt。该规则只修 OPL queue/currentness 和 provider transport 并发，不写 MAS truth、不修改 `publication_eval/latest.json`、不刷新 paper package 或 `current_package`，也不授权论文 ready。
- 2026-05-31 追加：MAS default-executor 的历史 queued / retry_waiting row 如果已被同一 dispatch 或同一 study/action 的更新 `source_fingerprint` supersede，`family-runtime tick` 必须把 stale row 收敛为 `blocked`，`dead_letter_reason=mas_default_executor_superseded_by_current_source`，并记录 `task_default_executor_superseded_by_current_source`。这只是 OPL queue currentness / backlog hygiene：它防止 Progress-First 和 operator backlog 继续把过期 writer / reviewer handoff 当作可执行任务，不启动 provider attempt，不写 MAS truth、不修改 `publication_eval/latest.json`、不刷新 paper package 或 `current_package`，也不替 MAS 作 publication verdict。
- 2026-06-02 追加：MAS default-executor 的 live-skip / lease refresh 只能基于当前可观测、非 terminal 的 provider-started attempt。刷新 lease 前必须先通过 safe read-model 同步 terminal / missing workflow observation；若 observation 已把旧 attempt 投影为 failed / blocked / completed，tick 必须清理 linked task lease、放行新的 owner row，并把 terminal sync 与 owner admission 分账。该规则只修 OPL provider lifecycle/currentness，不写 MAS truth、不修改 `publication_eval/latest.json`、不刷新 paper package 或 `current_package`。
- 2026-06-02 追加：MAS default-executor 的 study-level live attempt 只能作为 provider single-flight 互斥信号，不能继续作为 current work unit 的正常 `running` 投影。当同一 `workspace_root` / `study_id` 下已有更新的 default-executor task，且旧 live attempt 关联 task 的 `action_type`、`work_unit_id` 或 `dispatch_ref` 与当前 task 不一致时，current-control 必须投影 `blocked_stale_work_unit` 与 `stale/superseded_by_current_work_unit` diagnostic，清空 `active_run_id` / `active_stage_attempt_id` / `running_provider_attempt`，同时保留 stage attempt ledger 与 provider lease 供 terminal sync、cancel 或 typed closeout 收敛。该规则防止 Progress-First 前台把旧 reviewer/writer live attempt 误读成当前 next delta 已在正常推进；它仍不启动并发 attempt、不取消 provider、不写 MAS truth、不授权 publication/package/artifact ready。
- 2026-05-27 追加：上述 single-flight 必须在 queue intake / hydrate enqueue 阶段同样生效。MAS sidecar export 若因 `source_fingerprint`、dedupe key 或 owner implementation fingerprint 刷新而再次暴露同一 `workspace_root` / `study_id` / `action_type` / `dispatch_ref`，且 OPL 已有同 dispatch 的 live provider-started `codex_cli` attempt，`enqueue` 不得新增 queued task；它只能刷新 live running task 的 OPL lease、记录 `task_default_executor_live_dispatch_enqueue_noop`，并把 candidate source 作为审计 metadata。该规则防止同一论文 writer / AI reviewer workflow 在 intake 层堆积重复 queued row；它仍只治理 OPL queue/provider lifecycle，不写 MAS study truth、不刷新 paper package、不关闭 publication quality、不签 owner receipt。
- 2026-05-24 追加：managed Temporal worker 的 ready 状态必须绑定启动时的 OPL source version。`worker status/start` 发现 `temporal-worker.json` 中的 managed worker pid 仍存活但 source version 缺失或不同于当前 checkout 时，必须 fail-closed 为 `worker_source_stale`，提示 operator 先 `worker stop` 再 `worker start`；不得把旧 worker 判为 ready，也不得让 scheduler/tick 继续用旧 admission、single-flight、queue 或 provider lifecycle 逻辑。该规则只约束 OPL provider lifecycle/readiness，不终止 workflow、不写 domain truth、不授权 MAS publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-26 追加：managed Temporal worker source version 只绑定 OPL family-runtime worker 运行代码指纹，而不是整个 git HEAD。docs、ledger、README、contract narrative 或其它非 worker runtime 变更不得让 provider worker 反复进入 `worker_source_stale`，否则 MAS/MAG/RCA 的长期队列会被无关文档提交打断；`src/family-runtime-*` 运行代码及其 parts helper 变化仍必须改变指纹并触发 fail-closed restart。该规则仍只约束 OPL provider lifecycle/readiness，不写 domain truth、不授权 domain ready、quality verdict、artifact gate、paper package 或 `current_package`。
- 2026-05-30 追加：`worker-runtime:<source-root>:<content-hash>` 的 currentness 以 content hash 为 provider lifecycle 判据，source root 只作为 locator/provenance 投影。OPL-managed runtime/current 与 developer checkout 若内容 hash 相同，不得因路径不同误报 `worker_source_stale`；hash 不同、未知 source-version 格式不同或缺失 source-version 仍必须 fail-closed。该规则不放宽 developer checkout shared-state mutation guard，也不授权 OPL 写 domain truth、owner receipt、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-29 追加：Full first-install payload 安装后的 `runtime/current/opl` 需要 OPL-owned self-update surface 才能吸收 framework repo 的 runtime 修复。`opl system update` 和 `opl system startup-maintenance` 必须投影 `framework:opl-framework` target；只有显式配置 `OPL_FRAMEWORK_UPDATE_SOURCE` 且 target 是非 git managed runtime root 时才复制 source checkout 的 tracked framework files，并在 package inputs 变化时刷新 target dependency。开发 checkout、未配置 source、dirty source 或 invalid target 都 fail closed / skipped，不允许用 developer checkout 静默覆盖任意路径，也不把 source refresh 写成 domain ready、publication ready 或 artifact/package authority。
- 2026-05-27 追加：OPL-managed Temporal worker 的生产路径必须先物化 prebuilt workflow bundle，再通过 `Worker.create({ workflowBundle: { codePath } })` 启动；managed worker state / readiness 必须投影 `workflow_bundle_path`、`workflow_bundle_version` 与 `workflow_bundle_source_version`，且 bundle source version 绑定当前 worker runtime source version。`workflowsPath` 只允许作为 test/dev 直接 worker 或 bundle materialization input，不得作为 managed production worker 的执行选项。
- 2026-05-29 追加：OPL-managed Temporal worker start 前必须检查 worker runtime dependency integrity，尤其是 `@temporalio/worker` workflow bundler 需要的 `@swc/core` native binding。若 managed runtime 缺少平台 optional native package，readiness 必须 fail-closed 为 `worker_dependency_unavailable` / `temporal_worker_dependency_unavailable`，repair action 指向 OPL managed runtime dependency install/update，例如在 runtime module root 执行 `npm install --include=optional --ignore-scripts=false`；不得把底层 webpack/SWC 栈误报成 MAS study blocker，也不得由 domain agent 兜底写 domain truth、publication quality、artifact gate、paper package 或 `current_package`。
- 2026-05-27 追加：任何改变 `StageAttemptWorkflow` command sequence、signal/query wiring 或 workflow input shape 的 OPL runtime 改动，都必须至少通过 `Worker.runReplayHistory` replay gate 验证真实 completed history；gate 使用同一 production workflow bundle，不重新执行 activity 或 domain work unit。新增 replay gate 只证明 workflow code 对已记录 Temporal history 兼容，不生成 domain receipt、不授权 domain ready、不替代外部 production service provisioning 或长窗口 domain soak。
- 2026-05-27 追加：Temporal Codex stage activity 必须把 activity cancellation signal 传入 Codex runner，并继续以 heartbeat 作为 cancellation delivery / liveness channel；workflow input 中超过 inline payload 阈值的字符串必须被替换为 hash-bound `payload_ref:sha256:*`，并在 `payload_guard` 中记录字段、原始字节数与 policy。activity result 写回 Temporal workflow history 的部分也必须是 refs-only small summary，不得把 raw stdout/stderr、large runner event、agent receipt body 或 domain payload body 放回 history；完整 closeout、owner receipt 与 payload body 继续由 OPL ledger ref、domain/workspace/source owner ref 承载。该 guard 只防止大 payload 污染 workflow history；真实 payload body 仍必须由 domain/workspace/source owner 持有，OPL 不把 payload ref 解释成 domain truth、owner receipt、quality verdict 或 artifact authority。
- 2026-05-25 追加：`opl family-runtime worker stop --provider temporal` 必须等待 managed worker 进程真实退出；若 `SIGTERM` 后仍存活，应在短 grace window 后执行 OPL-managed force stop，并把 `force_stopped` / `stop_incomplete` 与 signal actions 投到 lifecycle stop receipt。删除 stale state file 不能替代进程退出确认。该规则只修 OPL provider lifecycle cleanup，不终止 domain truth、不修改 MAS artifact / paper / package surface，也不把 worker restart 解释成 domain stage 完成。
- 2026-05-25 追加：`opl family-runtime worker stop --provider temporal` 不能只信任 `temporal-worker.json` 的单一 PID。若 state file 缺失、已被 stale restart 删除，或只记录一个 managed PID，stop 仍必须按当前 provider module path 查找同 checkout 的 detached `--temporal-worker-foreground` orphan 进程并清理；receipt 必须暴露 `orphan_stopped_pids`、`orphan_stop_incomplete_pids` 和 `orphan_stop_actions`。该规则仍只约束 OPL provider lifecycle，不修改 domain truth、不写 MAS paper/package/current_package、不授权 publication ready。
- 2026-05-29 追加：共享 live state root 的 provider worker mutation 只能由 managed runtime/current 或显式隔离的 developer state 执行。git developer checkout 若未设置 `OPL_STATE_DIR` 且未显式打开 `OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER=1`，对默认 `~/Library/Application Support/OPL/state/family-runtime` 的 `worker start` / `worker stop` / foreground worker 启动必须 fail closed，避免 PATH 或开发仓 scheduler tick 把 shared Temporal task queue 接管为 developer source。detached worker 启动命令必须携带 `--family-runtime-root <root>`；`worker stop` 除同 module path orphan 外，也要清理同 root-tagged foreground orphan，保证 runtime/current 可以清掉此前不同 source 留下的 worker 进程。该规则只约束 OPL provider lifecycle source currentness，不写 domain truth、不终止 domain artifact、不授权 MAS/MAG/RCA quality verdict、paper package、`current_package` 或 production ready。
- 2026-06-01 追加：显式 OPL Developer Mode 是共享 live state root 的可审计 worker lifecycle authority。用户级 `developer-supervisor.json` 必须同时满足 `enabled=on`、`mode=developer_apply_safe`、`source=user_config`，开发 checkout 才能对默认 shared Temporal worker state 执行 `worker start` / `worker stop` / `provider-slo tick` 自动修复；默认 `auto`、`external_observe`、缺配置、无 `OPL_STATE_DIR` 且无显式 override 仍 fail closed 为 `blocked_developer_checkout_shared_state`。该规则用于 Progress-First 下让 OPL-owned provider worker liveness 能被 developer supervisor 正式恢复，避免论文/任务长时间停在重复 receipt、read-model reconcile 或 provider-not-ready 状态；它不写 MAS/MAG/RCA truth、不生成 owner receipt、不授权 publication/artifact/quality/package ready，也不让普通开发 checkout 静默接管 shared worker。
- 2026-06-03 追加：OPL-managed Temporal worker 是 resident provider worker，不是单次 `worker.run()` probe。若 foreground worker 的 `worker.run()` 在没有 SIGTERM/SIGINT shutdown request 的情况下正常返回，lifecycle 必须在同一进程内重新创建 worker 并继续轮询 task queue，同时在 worker state 中记录 `resident_restart_count`；只有显式 shutdown 才写 `worker_shutdown_requested` 退出态。该规则防止 Progress-First 长任务在 provider activity 未 closeout 时因 worker 正常返回而被取消成 `codex_cli_activity_cancelled`，也不改变 domain truth、owner receipt、publication gate、artifact authority 或 `current_package` 权限边界。
- 2026-06-07 追加：Temporal durable execution 只持有 workflow history、task queue、retry、timeout 和 worker 掉线后的任务可恢复语义；Worker process 本身必须由 deployment / supervisor 层保持常驻。OPL 本机路径使用 `family-runtime provider-worker supervisor install --provider temporal` 安装 macOS LaunchAgent，以 `KeepAlive` / `RunAtLoad` 托管 resident Temporal foreground worker，并把 `--family-runtime-root` 绑定到当前 runtime root；云端目标应映射到 Kubernetes / systemd / container supervisor。`provider-slo tick` 只能作为显式 health-check、production proof 和 fallback repair receipt，不得作为主调度器、不得消费 domain queue、不得写 MAS/MAG/RCA truth、不得生成 owner receipt / typed blocker，也不得把 provider liveness 解释成 paper/grant/visual 进展。安装新 supervisor 必须清理旧 `ai.opl.family-runtime.provider-slo` StartInterval LaunchAgent，避免 5 分钟 cron-like tick 与 resident worker supervisor 并存。
- 2026-05-30 追加：App/operator safe-action read model 和 `opl runtime action execute` 必须消费同一 worker mutation guard。若 developer checkout shared-state guard 已阻塞 `provider-worker:temporal:start|restart`，受该 worker repair 阻塞的 `provider_slo_cadence_execution` 也必须投影 `route_status=blocked_by_provider_worker_mutation_guard`、`default_actionable=false`、`can_submit_to_safe_action_shell=false`，默认 `next_safe_action` 不得继续选择 provider proof；显式执行该 blocked route 只能返回 `execution_status=blocked`，不得运行 worker/proof 命令。该规则不降低 provider SLO 要求，只把修复入口转到 managed runtime/current、显式 `OPL_STATE_DIR` 或显式 developer override。
- 2026-05-30 追加：App/operator 默认 `next_safe_action` 不得选择已由 verified stage evidence receipt 加 domain-owned typed blocker 关闭、且 `evidence_obligation_summary.open_count=0` 的 `stage_production_evidence_receipt_record` route。该 route 必须继续留在 full detail / execution bridge 中，允许后续 domain/App/live owner 以真实 refs supersede typed blocker；默认过滤只避免 App/default caller 把已关闭 worklist item 误当成本轮下一步，不声明 stage complete、domain ready 或 production ready。
- 2026-05-25 追加：App/operator 默认 `next_safe_action` 必须把 provider SLO production-proof cadence 暴露成独立 `provider_slo_cadence_execution` safe-action route，并在需要 provider repair / fresh proof 时优先于 generic scheduler install/status/trigger/tick。Scheduler install 只负责 cadence substrate；provider SLO proof route 才是 repair/receipt action。两者都只作用于 OPL provider evidence，不执行 domain action、不写 domain truth、不授权 domain ready 或 production ready。
- 2026-05-25 追加：当 canonical provider lifecycle inspection 或 stage workbench 暴露 Temporal worker `worker_source_stale` 且 repair action 为 `restart_temporal_worker` 时，App/operator 默认 `next_safe_action` 必须优先选择独立 `provider_worker_restart` safe-action route，再重新运行 provider SLO proof 或 provider-backed Codex stage。该 route 只通过 `opl runtime action execute --action provider-worker:temporal:restart` 执行 OPL-managed Temporal worker stop/start。2026-05-26 追加：当 Temporal service 可达但 worker 未就绪、repair action 为 `start_temporal_worker` 时，App/operator 必须暴露独立 `provider_worker_start` safe-action route，并通过 `opl runtime action execute --action provider-worker:temporal:start` 执行 OPL-managed worker start；不新增公开 `family-runtime worker repair` CLI，不执行 domain action、不写 domain truth、不生成 owner receipt，也不得把 worker start/restart 或 provider completion 解释成 domain ready / production ready。
- 2026-05-26 追加、2026-05-29 修订：`provider_slo tick` 在执行 production proof 或 queue admission 前可以自动执行 OPL-owned worker lifecycle repair：Temporal service 已可达、worker lifecycle 为 `worker_not_ready` 且 repair action 为 `start_temporal_worker` 时调用既有 `startTemporalWorkerLifecycle`；worker lifecycle 为 `worker_source_stale` 且 repair action 为 `restart_temporal_worker` 时调用既有 stop/start lifecycle。两类自动动作都必须记录 `temporal_provider_worker_repair_receipt`，并继续保持 false authority flags；不得执行 domain action、不得写 MAS/MAG/RCA truth、不得生成 owner receipt 或 quality verdict。Temporal attempt query 也必须区分 connect/describe 失败和 describe 成功后的 workflow query 不可用；后者投影为 `temporal_stage_attempt_query_unavailable`，不能误报成 `temporal_service_unreachable`，避免 operator 把 worker/query problem 当成 Temporal service downtime。
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

- One Person Lab App、`opl install`、`opl system initialize`、`opl connect modules`、`opl connect sync-skills` 与 Codex-visible plugin/skill metadata 默认以 OPL-managed modules 为产品运行来源。旧 `opl modules` 与 `opl skill sync` 已退役并 fail closed 到 Connect 替代入口，不作为机器或用户前门。
- App 启动维护可以自动检查 managed module 是否 behind、skill/plugin metadata 是否 stale、health check 是否通过，并在 checkout clean 且可 fast-forward 时自动更新、同步和刷新投影；当 Developer Mode source channel 已命中本机开发 checkout 时，启动维护只对该外部 checkout 执行 tracked plugin source sync 与 health check，不做 bootstrap、pull、install、domain plugin installer 或 managed 覆盖。
- managed checkout 处于 dirty、ahead、diverged、no upstream、health check failed 或需要 Codex App restart/reload 时，启动维护必须停止自动覆盖并展示人工处理状态。
- developer checkout 只通过显式开发模式、环境变量、workspace registry 或命令行 override 进入当前运行路径；默认 `auto` 配置在 GitHub identity 等于 `auto_enable_github_login`（当前默认 `gaofeng21cn`）且 mode 为 `developer_apply_safe` 时，等价命中 Developer Mode local checkout source channel。App 必须显示当前使用的是 managed checkout 还是 developer checkout。
- 不得用 developer checkout 静默覆盖 managed runtime，不得把 Codex plugin cache、`~/.codex/skills` 或 domain repo 下的 `.agents/plugins/marketplace.json` 当成第二真相源；它们只是 active source channel 的本地投影。MAS/MAG/RCA 的 Codex config marketplace `source` 由 OPL 写到 `OPL_STATE_DIR/codex-plugin-marketplaces/<marketplace-id>` 这一 OPL-owned wrapper root，wrapper 内 `plugins/<plugin-id>` 必须 symlink 到当前 active repo 的 tracked plugin source（例如开发 checkout 的 `plugins/mas`、`plugins/mag` 或 RCA repo root manifest）。Developer Mode 命中开发 checkout 时不得继续指向 OPL-managed module copy，也不得为了刷新 Codex metadata 在 MAS/MAG/RCA 开发 checkout 写入 `.agents/plugins/marketplace.json`。OPL Meta Agent 是例外：Codex 可见入口由 OPL 从 OMA contract pack 生成 `opl-meta-agent-local` plugin source，再通过同一 OPL-owned wrapper 暴露；OMA repo 只提供 contract/generation input。
- managed module health check 必须调用目标 module 的真实验证入口。OPL Meta Agent 的 repo-owned contract 是 `scripts/verify.sh smoke|typecheck|full`，因此 OPL 对 `oplmetaagent` 使用 `smoke` lane；OPL 不要求 OMA 添加 `fast` 兼容 alias，也不把 OPL 自身 lane vocabulary 强加给目标仓。
- `opl family-runtime intake|tick --hydrate` 使用 `OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE` 时，也必须先通过 OPL module locator 解析 active MAS module checkout，再以 `uv run --directory <checkout> --extra analysis medautosci sidecar export ...` 调用 domain sidecar；不得裸调用 PATH 上的旧 `medautosci` 工具。DM002 这类 live paper hydrate 的完成证据是 OPL queue/stage-attempt evidence 加 MAS owner receipt 或 typed blocker，不是 MAS 内部 runtime liveness/resume 投影。
- 该决策不改变 domain truth、quality verdict、artifact authority 或 direct app skill path 的 owner。MAS/MAG/RCA 继续持有领域权威；OPL/App 只管理安装、发现、同步、投影、health 和可见维护状态。

### 决策：OPL Developer Mode 由系统配置、App 设置开关和 Agent Lab 巡检/修复路由共同承接

原因：OPL 同时服务普通用户和开发者。普通用户路径需要稳定的 managed environment；开发者路径需要在智能体调用过程中把发现的 framework / domain repo 问题直接转成可审计的修复、提交或 PR。若只靠 developer checkout override，容易把产品运行真相和开发修复权限混在一起；若只靠观察告警，又会让已经具备 repo 权限的维护者无法把问题闭环。因此需要把 Developer Mode 定义成独立系统配置和 App 设置面，并把外围 AI 巡检、问题归因、owner route、repo fix / PR route 放到 OPL Agent Lab 优先承接。

影响：

- 产品名是 `OPL Developer Mode`；当前机器面可以沿用 `developer_supervisor` 配置与 `opl system developer-supervisor` action。配置属于 OPL state，不属于某个开发 checkout。
- One Person Lab App 设置页必须有 Developer Mode 开关，并显示当前状态、配置来源、GitHub login、模式、当前 source channel 和可用 repo authority。安装流程检测到配置的 developer login（默认 `gaofeng21cn`）时可以默认开启 local checkout source channel；其他用户可以手动开启。
- Developer Mode 至少区分只观察的外围巡检模式和 `developer_apply_safe` 模式。前者只产生 evidence / issue / PR proposal；后者在权限满足时允许进入 repo 层修复、提交和 owner-visible 审计路径。
- repo developer / collaborator 身份必须按目标 repo 判断。具备直接写权限时，可以在对应 repo 的受控 worktree / branch 中修复并提交；不具备直接写权限时，只能创建 fork / branch / pull request，不得静默推送到 upstream。
- Developer Mode 开启后，任务可以默认启动外围 AI 巡检。巡检由 Agent Lab 或同等 refs-only control plane 组织，输出 blocker、owner route、candidate fix、evidence refs 和 PR refs；它不拥有 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority。
- Developer Mode 不改变 managed environment 优先原则。普通用户运行仍以 OPL-managed modules / skills / plugin metadata / provider state 为真相；开发修复和开发 checkout source 只通过显式配置、显式身份和可审计 repo route 生效。`auto` 命中只允许 source channel 选用本机开发 checkout；shared runtime mutation 仍必须满足 `enabled=on`、`mode=developer_apply_safe`、`source=user_config`。
- 2026-06-03 追加：Developer Mode public CLI/read-model 输出必须保留 `enabled`、`mode`、`effective_state`、`allowed_route` 兼容字段，但新消费方应优先读取 `developer_profile` 与 `capabilities`。`developer_profile` 至少区分 Contributor、Maintainer、Runtime Maintainer；`capabilities` 必须分别表达 `source_channel`、`workspace_trust`、`github_authority`、`agent_automation`、`runtime_mutation_scope` 的 `status`、`level`、`source` 和 `impact`。local checkout source、repo direct/fork route、shared runtime mutation 许可不得继续压缩成单一 Developer Mode 开关；shared runtime mutation 只有在 `enabled=on`、`mode=developer_apply_safe`、`source=user_config` 时投影为 ready。

## 2026-05-17

### 决策：吸收 academic-research-skills 的完整性 / 引用支撑 / checkpoint 模式为 OPL-owned stage integrity metadata primitive

原因：`Imbad0202/academic-research-skills` 里值得吸收的不是论文运行时或领域判断，而是把开放式学术工作拆成阶段，并在阶段边界显式记录 integrity check、citation / claim support、evidence handoff、data access 和 human checkpoint 的模式。OPL 需要这类通用 metadata 来增强 stage packet、App/operator drilldown 和 fail-closed routing；但医学论文真相、基金可行性、视觉质量、artifact 权威和 direct app skill path 必须继续归 MAS/MAG/RCA 等 domain agent。

影响：

- `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` 成为 active family orchestration companion contract。
- `family-product-entry-manifest-v2` 可以通过 `family_stage_integrity_metadata` 暴露可发现的 stage integrity metadata projection。
- OPL 只持有 schema、discovery、transport、projection、human checkpoint route 和 fail-closed metadata vocabulary。
- MAS/MAG/RCA 只发布 domain projection / thin adapter；底层 evidence ledger、audit body、owner receipt、quality verdict、publication / fundability / visual authority、artifact authority 与 direct skill path 继续归 domain。
- 该吸收不引入 `academic-research-skills` runtime dependency，不重写 domain stage，不授权 OPL 生成 domain-ready、publication-ready、fundability-ready、visual-ready 或 artifact-ready verdict。

### 决策：吸收 Co-Scientist 风格 hypothesis portfolio 为 refs-only research hypothesis contract

原因：Co-Scientist 式 hypothesis candidate portfolio、assumption decomposition、novelty / provenance check、negative path 记录、ranking / proximity metric 和 human review loop 对 OPL family 的研究型 stage 很有价值。但这些能力只能上升为 OPL-owned refs-only projection contract，不能把 OPL 变成领域 hypothesis truth owner、scientific quality judge、artifact authority 或 owner receipt signer。

影响：

- `contracts/family-orchestration/research-hypothesis-portfolio.schema.json` 成为 active family orchestration companion contract。
- OPL 只持有 schema、discovery、index、projection、advisory metric refs 和 review route refs。
- ranking / proximity / advisory metrics 只能作为 operator / reviewer 路由输入，不能声明 hypothesis acceptance、domain ready、quality verdict、artifact authority 或 stage completion。
- MAS/MAG/RCA 和未来 domain agent 继续持有 hypothesis body、evidence body、accept/reject decision、domain truth、quality verdict、artifact body authority、owner receipt 与直接 domain skill path。

## 2026-05-16

### 决策：workspace initialization 是 OPL-owned framework action，不进入 domain family action catalog

原因：MAS/MAG/RCA/OMA 都需要默认可用的 Stage Native workspace topology，但创建 OPL workspace skeleton 与写入 OPL workspace registry 是 framework responsibility。domain repo 可以持有 domain truth、artifact body、product view、owner receipt、typed blocker 和 quality/export verdict，但不能写 OPL registry，也不能把 workspace topology 初始化包装成 domain-owned action。

影响：

- `opl workspace init --agent <mas|mag|rca|oma>` 是显式初始化面，可使用已配置 OPL workspace root 或显式路径，按 `workspace_topology_profile` 物化 shared roots、project root、`artifacts/stage_outputs`、`workspace.yaml` 和 `workspace_index.json`，并默认激活 workspace registry binding；同 topology 的 series / portfolio workspace 可追加 project，而不是覆盖 metadata。
- `opl workspace ensure --agent <mas|mag|rca|oma>` 是默认快速入口：先复用 active binding 和已有 project，缺 workspace 或缺 project 时再调用同一 topology initializer；复用 active binding 时也必须补齐并检查 OPL-owned protocol refs，不能把旧 binding 当成结构健康证明。`opl workspace interfaces` 以 ensure 作为 CLI/App/MCP/Skill/OpenAI/AI SDK command contract；App 的 `workspace_ensure` action 调 ensure，`workspace_initialize` 保留为显式 init action。
- `opl actions export --domain ...` 继续只投影 domain-owned `family_action_catalog`，不导出或执行 framework workspace initialization。
- 该 action 只写 OPL topology metadata 和 registry binding，不写 domain truth、不创建 owner receipt 或 typed blocker、不修改 artifact body、不授权 quality/export 或 production readiness。
- 2026-06-07 追加：`contracts/opl-framework/agent-workspace-norm-contract.json` 是 OPL Agent workspace 的可执行规范锚点，`contract validate`、`opl workspace interfaces`、workspace-local `workspace_index.json`、App workspace actions 和 `opl agents conformance` 都必须消费它。它固定 `workspace ensure` 为默认 pre-task gate、`workspace init` 为显式初始化、MCP/Skill/OpenAI/AI SDK 为 descriptor-only delegate、Stage Native 用户检查面为 project-local `artifacts/stage_outputs`，并把 runtime-state / conformance pass / OPL registry projection 的 authority false flags 固定为机器检查项，避免各 domain agent 或 GUI 入口各自漂移。
- 2026-06-07 追加：`contracts/opl-framework/workspace-index.schema.json` 是 workspace-local `workspace_index.json` 的实例级合同。`workspace_index.json` 必须同时提供统一物理根、领域命名和统一语义层：新 workspace 的 `workspace_topology_profile.project_collection_path` / `canonical_topology.project_collection_path` 默认固定为 `projects`，`workspace_index.json.projects[*].project_root` 默认落在 `projects/<project-id>`；MAS 的 `studies` 与 RCA/MAG/OMA 的 `deliverables` 只作为 `display_labels`、`legacy_project_collection_aliases`、adopt/provenance terminology 或 domain semantic alias，不再定义 canonical physical root。`canonical_topology` 统一映射到 `workspace_group -> project_units -> stage_artifact_unit -> owner_receipt_or_typed_blocker`，`display_labels` 保留领域显示名，`shared_resources` 给 shared roots 明确 role / manifest ref / owner / user-visible / domain-truth-owner，`generated_refs` 给出 `workspace_inspection_ref` 与 `workspace_resource_inventory_ref`，`projects` 给每个 project/study 明确 stage outputs root manifest ref、stage outputs index ref、current stage pointer ref 与 lifecycle。
- 2026-06-07 追加：`workspace_inspection.json`、`workspace_resource_inventory.json`、project-local `artifacts/stage_outputs/stage_outputs_index.json` 和 `artifacts/stage_outputs/current_stage.json` 是 OPL Workspace Protocol 的实际 projection 文件，不是可选文档建议。`init` / `ensure` / `adopt --apply` 必须生成并索引它们；`upgrade --apply` 必须补齐缺失 projection，但不得覆盖 runtime 已写入的合法非空 current pointer；`validate` / `doctor` 必须检查存在性、协议形状、lifecycle status 集合和 authority false flags。
- 2026-06-07 追加：`opl workspace validate --workspace <path>` 是 hard-blockers-only gate；`opl workspace doctor --workspace <path>` 是同检查的只读诊断，并分层输出 `hard_blockers`、`repairable_findings`、`advisory_warnings` 与统一 `findings`；`opl workspace adopt --agent ... --workspace ... --dry-run|--apply` 支持既有目录采用，apply 只写 OPL-owned metadata / manifests / map / health / inspection / inventory / stage projections，不写 domain truth、不绑定 registry、不迁移 artifact body；`opl workspace upgrade --workspace ... --apply` 原地刷新 generated refs，不移动 project root；`opl workspace project archive --workspace ... --project-id ... --apply` 只更新 indexed project lifecycle，不删除文件，也不等价于 registry binding archive；`opl workspace export-map`、`opl workspace health`、`opl workspace inspect` 和 `opl workspace inventory` 提供只读用户检查投影。`opl workspace interfaces`、App action catalog 和 App action execute 必须暴露这些管理面，避免 workspace 合同只有叙事没有可调用接口。
- 2026-06-08 追加：workspace governance v2 把 generated projection 的 canonical root 固定到 `control/opl/projections`，把默认用户检查摘要固定到 `control/opl/reports/workspace_report.json`；根层 `workspace_map.json`、`workspace_health.json`、`workspace_inspection.json`、`workspace_resource_inventory.json` 和 `workspace_report.json` 只作为兼容 mirror。`workspace_index.json` 必须携带 `profile_binding`，其中包含 `profile_version=workspace-topology-profile.v2`、`profile_fingerprint=opl-workspace-topology-profile-v2-projects-stage-outputs`、profile contract ref 和 migration history，并必须携带 `topology_events[]`。`agent_workspace_norm` 必须与 executable norm projection 全量一致，不能只按 norm id/version 判断。生成投影 currentness 仍是结构检查项，但缺失或漂移默认是 repairable finding，`workspace validate` 不因这类缺口阻断默认智能体执行；缺 workspace/index identity、项目根、stage pointer/index shape、authority 或 runtime-state 边界才是 hard blocker。
- 2026-06-08 追加：Project lifecycle 统一为 `active`、`paused`、`archived`、`superseded`、`locked`。这些状态是 OPL-owned workspace lifecycle projection，不删除文件、不关闭 stage、不签 owner receipt，也不改变 domain truth；physical delete 必须由 domain owner receipt 授权。MAS/MAG/RCA/OMA 共享同一 Project Unit 物理语义，MAS 的 `study` / `studies` 只作为 display naming 例外。workspace governance v2 只能声明 `L4_structural_baseline`；L5 仍需要真实 App user path、跨 agent scaleout、long-soak、release/install evidence 和 owner acceptance。
- 2026-06-08 追加：`opl workspace fleet report` 是 `workspace list` 的 sibling surface，不改变 `workspace list` registry-only 语义。fleet report 只从 registry binding 和 workspace-local `workspace_index.json` / generated reports 读结构状态，输出 ready / blocked / archived_binding / not_bound 和 lifecycle counts；它不得执行 direct-entry command、manifest command 或 domain product-entry resolver，不得把 domain manifest 解析结果写成 readiness。`opl workspace project lifecycle` 是 pause / resume / lock / supersede / archive 的统一 runtime；`workspace project delete` 只返回 owner-receipt safe-delete gate，OPL 不执行 physical delete。shared resource provenance 只允许在 `opl_resource_manifest.json.resources[]` 中记录 refs、checksum、provenance、reuse、staleness，`body_ref` 必须规范为空；`workspace upgrade` 必须保留这些记录，`workspace inventory` 只投影 refs-only record。

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
- 公开文档与技术入口不得恢复 MAS 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 仍按 OPL package 坐标 / prepared module archive 坐标与 git checkout / sibling repo 更新路径表达，Packages/GHCR 被 install/update live 消费前不得写成 active module channel，MDS 只保留 MAS-declared optional companion 引用。
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

- `opl connect packages manifest` 成为 Packages 坐标的机器可读入口和后续分发目标；旧 `opl packages manifest` 已退役并 fail closed 到 Connect 替代入口。
- 当前 `opl install`、App 首启协调和环境管理仍以 git checkout 更新到远端最新为正式路径；Packages/GHCR 接入模块安装更新前不得写成当前机制
- 中央 release manifest / Packages workflow 可以继续维护为机器分发雏形，但各 domain repo 不需要单独恢复用户安装型 GitHub Release
- WebUI Docker 镜像的发布与用户路径 evidence 归 `one-person-lab-app`；OPL Framework 只保留 App-owned GHCR 坐标 / external reference，不在 framework packages workflow 中构建或发布 WebUI image
- Native helper 预构建 archive 同步发布到 GHCR，后续 `native:repair` 可优先消费
- 标准桌面 App 与自动更新包仍不打入 `OPL Meta Agent/MAS/MAG/RCA` runtime payload；macOS arm64 可额外发布 Full 首次安装资产，随包带 Agent Foundry 用的 `OPL Meta Agent`、`MAS/MAG/RCA`、`officecli` CLI binary 与推荐 companion skill payload，但不得写入 `latest*.yml` 或改变 App 自动更新通道

### 决策：One Person Lab App 只做 CLI-backed GUI，不复制安装与环境管理逻辑

原因：OPL 的可维护边界应是 CLI 提供安装、初始化、诊断、更新、模块管理与 workspace 管理等完整能力；GUI 只负责触发命令、展示状态与提供更低门槛的交互界面。这样命令行一键安装、App 首启、Docker WebUI 与后续自动修复能共享同一套行为，不形成 GUI-only 第二实现。

影响：

- App 首启继续通过 `opl system initialize` 读取状态，必要时通过 `opl install --skip-gui-open` 自动补齐环境
- 设置里的环境管理继续通过 `opl doctor`、`opl install`、`opl connect modules`、`opl connect install|update|reinstall|remove|exec`、`opl engine *` 与 `opl workspace *` 完成动作
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
- `opl connect modules` 与 App 设置里的环境管理可以显示 MAS 声明的可选 companion diagnostic / oracle / intake 状态，但不得把它写成独立 OPL module。
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
- 本地 `structure` lane 是结构质量 advisory 入口：line budget、Sentrux baseline regression 与 explicit Sentrux rules findings 默认输出 OPL quality details / warning，不阻断普通开发；`line-budget:strict`、`structure:strict` 或对应 strict 环境变量才作为维护硬门，检查新增超线、超过 reviewed baseline、stale baseline 与 retired baseline；GitHub Sentrux Advisory workflow 继续作为非阻断 sidecar 信号存在，不替代显式 strict 维护入口
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
- `opl connect sync-skills` 成为 family domain skill pack 的统一同步入口；旧 `opl skill sync` 已退役并 fail closed 到 Connect 替代入口，默认前门继续保持原生 Codex 语义
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
