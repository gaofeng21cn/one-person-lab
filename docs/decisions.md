# OPL 关键决策

Owner: `One Person Lab`
Purpose: `decisions`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 2026-06-09

### 决策：Runway 采用 control-loop runtime 目标态，但不扩大 domain authority

原因：OPL 长跑任务需要比定时 tick 和 provider 状态投影更清晰的控制面。Temporal 能提供 durable execution history、task queue、signal/query、retry/timeout、timer 和 replay，但它不保证 worker process 永久在线，也不判断 domain 目标是否完成。worker supervisor 只能保 worker liveness；scheduler 只能制造 hydrate/tick/reconcile/repair 机会；真正决定下一步的是把 desired owner route 与 current queue/attempt/provider/gate/receipt refs 对账的 Progress Reconciler。

影响：

- Runway 的目标态固定为 control-loop runtime：`desired state -> current state -> Progress Reconciler -> exactly one next safe action -> provider/owner/gate observation -> append-only refs/read-model`。
- Temporal 是 production online durable substrate，不是 worker supervisor、domain truth owner、receipt signer、quality verdict 或 L5 evidence closer。
- Worker supervisor / deployment substrate 只负责 worker process 启动、保活、重启、扩缩容和 health check；worker healthy 不等于 Temporal workflow healthy、stage complete、domain ready 或 production ready。
- Scheduler / cadence surface 只负责提供 reconcile 机会和 cadence refs；scheduler ticked 不等于 worker liveness、domain progress、owner answer 或 safe redrive。
- Progress Reconciler 负责比较 desired/current，输出唯一下一 safe action、owner/human gate wait、provider repair、dead-letter redrive 或 OPL runtime blocker；候选动作冲突时必须按 current owner delta、StageRun identity、source fingerprint、lease、execution authorization、closeout binding 和 accepted answer shape fail closed。
- Reconciler、handoff、human gate 和 provider observation 只能传 refs、typed blocker requirement、owner answer shape、repair command 或 runtime observation；不得创建 domain owner receipt、domain typed blocker、quality verdict、artifact/memory truth、domain ready、App release ready、production ready 或 L5 证据闭合结论。
- 这是 Runway `L4 executable baseline` 到 L5 的结构前置能力，不是 `production ready` 或 `L5 production operating maturity`。L5 仍需真实长跑/恢复、跨 agent scaleout、operator repair loop、release/install 和 owner acceptance evidence。

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
- 2026-06-09 追加 follow-through：`paper_autonomy/guarded-apply` + `domain_owner_receipt_quality_gate_or_typed_blocker_required` 的 `current_owner_delta` answer contract 明确为五种可接受 owner answer refs：`domain_owner_receipt_ref`、`quality_gate_receipt_ref`、`typed_blocker_ref`、`human_gate_ref`、`route_back_evidence_ref`。OPL 只投影这些 shape、校验 current StageRun identity / source binding，并消费 MAS/domain owner 产出的合法 answer；不得从 OPL/App/provider 侧伪造 domain owner receipt、typed blocker、quality verdict、domain ready 或 publication ready。

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
- MAS/MAG/RCA 的品牌 CLI 字段是 series identity / shorthand，不再等同于本机 PATH-safe 可执行命令。机器可执行 smoke 必须投影到当前 domain direct launcher：MAS 使用 `medautosci foundry ...`；MAG 使用 repo-local clean runner 或已刷新后的 `medautogrant foundry ...`，不得把可能被 TeX Live 占用的裸 `mag` 当作 Codex smoke；RCA 使用 repo-local `npm run --prefix <redcube-ai-repo> redcube -- foundry ...`，不得假设全局 `rca` 或 `redcube` 已安装。
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

## 2026-05-30

### 决策：Progress-First queue / attempt currentness 只保留主题级边界

原因：DM002/DM003 的 repeated closeout、read-model reconcile、provider liveness、same-source redrive 和 stale owner-route 问题曾在 `docs/decisions.md` 中按实现日期追加为多条 queue / attempt / provider 细节决策。当前这些字段、事件名、超时、guard 和 CLI projection 已归入 `src/family-runtime-*`、`contracts/opl-framework/*`、`contracts/family-orchestration/*`、`tests/src/cli/cases/family-runtime-*`、`docs/invariants.md`、`docs/architecture.md` 与 `docs/status.md`；决策面只保留当前取舍，不继续维护实现流水。

影响：

- `current_owner_delta` 是 ordinary App/CLI/operator 默认读根；queue、attempt、provider、evidence-worklist、compact timeline 和 App drilldown 只能投影 owner、accepted answer shape、currentness、liveness、typed blocker 或 audit refs，不能生成 domain truth、owner receipt、typed blocker、artifact authority、quality verdict、domain ready、App release ready 或 production ready。
- `family-runtime tick` / `scheduler tick` 必须先处理可执行 owner delta admission，再把 terminal sync、missing identity repair、waiting-approval reconcile、superseded task reconcile、same-source anti-spin、provider blocker redrive 和 lease/read-model hygiene 作为 OPL queue / attempt currentness 治理；同源重复无交付物的 default-executor task 必须回到 fresh owner delta、domain receipt、domain typed blocker、human decision 或 provider hard-gate clearance。
- `waiting_approval`、superseded current source、accepted typed closeout、stale owner route、current-control admission、same-study single-flight、terminal Temporal observation 和 provider liveness 都只收敛 OPL ledger / projection，不改写 MAS/MAG/RCA/OMA truth，不刷新 publication eval、artifact gate、paper package 或 domain package。
- Temporal provider liveness 是 OPL runtime blocker：worker not ready/source stale/dependency unavailable/crash/stale state/guarded mutation 先投影为 OPL-owned provider repair or blocked safe action；provider proof、scheduler status、provider SLO、worker repair、compact timeline 或 evidence-worklist 计数不得抢占已存在的 domain owner delta。
- 仍有效的实现细节以机器面为准：current-control admission 在 `family-runtime-domain-intake` / `family-runtime-mas-current-control-admission-currentness`；anti-spin、completed closeout、superseded source 和 waiting-approval reconcile 在 `family-runtime-tick` 及 parts；provider readiness currentness 和 compact timeline 在 `family-runtime-stage-attempt-provider-readiness-currentness` / `family-runtime-stage-attempt-monitoring`；operator summary 在 `family-runtime-evidence-worklist`；Temporal worker lifecycle / scheduler / SLO guard 在 provider lifecycle source、tests 和 CLI read-model。
- 本段压缩 2026-05-30 到 2026-06-09 的 Progress-First queue/currentness 实现增量；历史细节见 `docs/history/process/plans/2026-06-09-opl-decisions-progress-first-currentness-compression-closeout.md` 和 git history。

### 决策：Foundry Agent series 需要统一 canonical design profile

原因：MAS、MAG、RCA 和 OPL Meta Agent 都已经按标准 OPL Agent 接入，但如果每个 domain 把 `series_design_profile` 写成自己的 input/output taxonomy，机器验证只能看到“各自都像 OPL”，看不出它们是一套同源设计。series-level profile 应该表达所有 Foundry Agent 共同的不可变设计逻辑，领域差异应留在 domain-owned profile、stage/action contract 和 authority refs 中。

影响：

- `contracts/opl-framework/foundry-agent-series-contract.json` 固定 canonical `series_design_profile.profile_id=opl_foundry_agent_series_design_profile.v1`，并要求相同 shared lifecycle、generic input/output slots、stage pack sections、closeout shape 与 authority invariants。
- MAS/MAG/RCA/OMA 的 `contracts/foundry_agent_series.json` 必须使用同一个 canonical `series_design_profile`；domain-specific input/output、alias、authority function 和包装差异放入 `domain_specific_profile` 或既有 domain-owned contract 字段。
- `opl agents conformance` 把缺失或漂移的 canonical profile 作为 structural blocker。conformance 通过只证明 shared design signature 和 scaffold contract 对齐，不声明 domain ready、quality/export ready、artifact ready、App release ready 或 production ready。

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
- Source/profile/currentness identity、MAS module locator、default-executor admission、Codex runner watchdog、unsupported tool protocol、stage packet hard gate 和 provider start receipt 均归 `family-runtime-domain-intake`、`family-runtime-enqueue`、`family-runtime-default-executor-start`、`family-runtime-codex-stage-runner`、`family-runtime-temporal-*`、`stage-run-execution-authorization-ledger` 及其 tests。`docs/decisions.md` 不再维护字段级追加清单。
- 2026-06-09 追加：`family-runtime scheduler` cadence / `tick --hydrate` 的默认 MAS profile 解析顺序固定为 CLI `--profile`、`OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE`、active `medautoscience` workspace binding 的 `med_autoscience_workspace_profile.profile_ref`。active binding 只用于选择 MAS export command/profile 与绑定 workspace cwd；没有 CLI/env/binding 时必须继续 fail closed 为 `export_command_not_configured`。该规则不授予 OPL 写 MAS domain truth、publication verdict、artifact gate、owner receipt 或 typed blocker 的权限。
- `domain_owner/default-executor-dispatch` 的 queue success 只表示 OPL 已接收 domain owner handoff 并启动或记录 provider-backed attempt；它不是 Codex owner attempt 完成、MAS owner receipt、publication quality closeout、artifact gate 或 package refresh。
- `codex_cli` 作为当前第一公民 executor 必须走真实 runner / typed closeout / StageRun binding / provider blocker 语义；dry-run、fixture、diagnostic 或 read-model projection 只能在显式测试/诊断入口出现，不能成为 live owner handoff 的兼容降级。
- `stage_attempt_workbench`、`stage_progress_log`、`user_stage_log`、Temporal terminal observation、safe read-model sync、typed closeout parser、current attempt binding 和 queue/attempt reverse sync 都是 OPL provider/read-model currentness projection；它们让 operator 看清 transport state、semantic summary missing、terminal failure、typed closeout refs 和 liveness blocker，但不能关闭 domain stage、生成 MAS owner receipt、刷新 artifact/package 或声明 production evidence。
- Redrive、dead-letter retry budget、bounded SQLite/read-model wait、queue hold/release/stranded hold repair、attempt cancel 和 provider cancellation are OPL queue/attempt owner actions. They can restart, pause, release, cancel or project transport state; they never approve human gates, mutate domain truth, refresh package/artifact state, or certify publication/fundability/visual quality.
- Codex JSONL/session recovery、queue inspect terminal sync、domain-handler closeout requirement、task-level projection ordering, default-executor single-flight, stale source supersession and study-level mutual exclusion are currentness implementation details owned by source/tests/read-model. The durable decision is that OPL may reconcile queue and attempt state, but cannot infer or overwrite domain completion from stale provider observations.
- Temporal worker lifecycle, source-version equivalence, workflow bundle, dependency integrity, replay gate, payload guard, worker stop/orphan cleanup, Developer Mode shared-state mutation guard, resident worker supervision and provider safe-action ordering are OPL provider substrate rules. They belong to Runway/provider source, lifecycle receipts and tests; they do not become MAS progress, domain receipt, artifact authority, release readiness or production closure.
- Details compressed by this tranche are history/provenance only. Current field names, event names, timeout constants, guard reasons and command payloads must be read from source, contracts, CLI/read-model output and tests, not from this decision file.

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

压缩读法：本历史决策只保留当时的判断来源：OPL 曾把 24h online product capability 寄托在上游 `Hermes-Agent`，并据此写过默认安装、Gateway、cron/webhook wakeup、Full package payload、system initialize readiness 和 hybrid provider adapter 口径。当前 SSOT 已回到 2026-05-10 Temporal-backed provider 决策、核心五件套、runtime 命名边界和 family runtime online substrate contract。

当前处置：Temporal-backed provider 是 production online runtime 的必需 substrate；`Codex CLI` 是默认且第一公民 executor；`hermes_agent`、`claude_code`、`antigravity_cli` 只能作为显式非默认 executor adapter/backend。旧 Hermes online runtime、Gateway、provider/readiness、cron/webhook bridge、Full package Hermes payload 和 hybrid provider compatibility 只保留为 history / provenance / diagnostic / negative guard，不恢复为安装路径、readiness 目标、default executor、provider fallback、compatibility interface 或 current worklist。历史 `intake` / `hydrate` 中仍有效的 typed queue 语义已由 OPL/Temporal provider owned path 承接。

### 历史决策：Hermes 从默认安装依赖降为显式 hosted/runtime adapter

状态：先被 2026-05-08 已退役 Hermes-first online substrate 决策取代，又被 2026-05-10 Temporal-backed provider 决策 supersede。保留本段用于解释 2026-05-08 早期误判和回滚背景，不作为当前实现口径。

压缩读法：本段只解释 2026-05-08 前后曾出现的中间回滚语境：OPL 一度把默认运行时收敛到 `Codex CLI + domain entries`，并把 Hermes hosted / online-management 作为非阻塞或显式 adapter 语境读取。当前安装、首启、Full package 和 readiness 口径不从本段继承；它们回到 Temporal-backed provider 决策、App release owner 和 live install/readiness contracts。`hermes_agent` 继续只按 canonical 显式非默认 executor adapter/backend 读取。

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

压缩读法：本段只保留首启 readiness 分层的历史来源。迁移期曾把 Hermes online-management gateway 当作非阻塞渐进就绪项；当前该层已经被 family runtime provider readiness 取代。`opl install`、`opl system initialize`、App 首启和公开 README 的当前读法是 Core、Domain modules、Temporal-backed family runtime provider 和 App release/user-path evidence 分层；不得把 Hermes gateway、online-management pending 或 provider adapter 写回当前安装行为、首屏层级、readiness blocker 或 compatibility surface。`hermes_agent` 只作为显式非默认 executor adapter/backend 保留。

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
