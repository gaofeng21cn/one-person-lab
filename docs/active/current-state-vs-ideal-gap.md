# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: `family_ideal_state_gap_plan`
State: `active_plan`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App evidence。
Date: `2026-06-06`

## 读法

本文是 OPL family 当前目标、功能/结构差距、测试/证据差距和下一轮 baton 的唯一 active owner。它只保留当前判断、owner boundary、gap 分类、完成口径和验证入口。

本文不冻结 receipt id、workorder 数字、attempt id、branch/worktree、provider tick、safe-action record/verify 流水或某轮 closeout 细节。需要当前事实时读取 live 机器面；需要历史过程时读取 `docs/history/**`、runtime ledger、提交历史或对应 repo-local history ledger。

North-star 目标态回到 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md)。顶层 operating model 重设计回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)。公开角色、runtime 边界和默认入口回到 `project/status/architecture/invariants/decisions`。文档生命周期规则回到 [文档组合治理](../docs_portfolio_consolidation.md) 和 [文档生命周期政策](../policies/docs-lifecycle-policy.md)。

## 目标态

OPL family 的目标形态固定为 `OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 持有 Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、generated/hosted surfaces、Agent Lab、safe action shell 和 App/operator read model。
- `One Person Lab App` 是人用工作台，只消费 framework/provider 状态和 domain-owned projection；普通用户形态是 `Codex App wrapper`，固定 `Codex CLI` executor，内置 MAS/MAG/RCA/OMA task entry。
- `MAS`、`MAG`、`RCA` 是当前 domain Foundry Agents，持有各自 domain truth、quality/export verdict、artifact authority、memory body、owner receipt、typed blocker 和 direct app skill path。
- `OPL Meta Agent` 是 Agent Foundry / new-agent builder/tester module，不持有 MAS/MAG/RCA 的 domain truth。

标准 Foundry Agent 的目标源码形态是：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + standard authority functions
```

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code`、`antigravity_cli` 等只能作为显式非默认 executor adapter/backend。

## 当前统一执行目标

2026-06-04 以后，本页把 MVP friction 线、purpose-first cross-repo audit 线和 Co-Scientist-inspired cognitive kernel 线折成同一个 active owner 口径：

```text
current_owner_delta outer loop
  -> stage attempt with Cognitive Computation Kernel
  -> stage artifact unit / owner receipt / typed blocker
  -> passive evidence vault and diagnostic drilldown
```

一句话目标：OPL 是 `Cognitive Computation Kernel + Agent Runtime Platform`；默认读面只问当前 owner 欠什么，Stage 内部让 Codex executor 在 tool affordance / authority / quality gate 边界内完成开放式专家工作，domain repo 只保留领域 truth、artifact authority、quality verdict、owner receipt 和 typed blocker。

2026-06-05 以后，后续优化统一按 `目的反推必要性，MVP 检查阻碍性` 审计：

- `目的反推必要性`: 只有能推动 owner delta、保护 authority boundary、支撑 durable execution / replay / audit、或减少 App/operator 决策成本的 surface，才有资格进入默认面。
- `MVP 检查阻碍性`: 凡是让普通尝试先陷入 receipt-only、read-model reconcile、platform repair、stale-route redrive、diagnostic proof、evidence accounting、route variant 或 wrapper lineage 的 surface，都应下沉为 audit/detail、显式 lane，或进入 retire gate。
- `统一判断`: 更符合预期不是“更多证据、更全 worklist、更厚合同”，而是默认路径更短、当前 owner 更明确、accepted answer shape 更清楚、artifact / receipt / typed blocker 更可接力、domain verdict 更稳定地回到 domain owner。

当前三条线的分工固定为：

- `outer_owner_delta`: `current_owner_delta` 是 App/CLI/operator 默认 root；worklist、replay、typed-blocker group、provider trace 和 private residue 只能作为 audit / full-detail。
- `inner_cognitive_kernel`: `tool_affordance_boundary` 是 available affordance catalog，不是 workflow script；工具目录不能规定顺序、认知策略、stage goal 或 forbidden write。
- `domain_adoption`: MAS/MAG/RCA/OMA 只声明 domain pack、stage strategy refs、tool/knowledge/quality gate refs 和最小 authority functions；真实 ready 仍由 domain owner receipt / typed blocker / human gate 关闭。

本轮最具体的 domain adoption tail 是 MAS `stage-artifact-materialize`：它把旧 paper workspace 折叠成 stage-native refs-only `Stage Artifact Unit`。2026-06-05 DM002 / DM003 live canary 已通过 MAS 官方 materializer 推进到 terminal `08-publication_package_handoff`，stage folder projection 把下一 owner 投影为 `publication_gate_owner / publication_handoff_owner_gate`，required delta 为 `publication_handoff_owner_receipt_or_typed_blocker`。MAS main 已吸收 `publication_handoff_owner_gate` owner callable / default-executor policy / owner route / lifecycle contract / focused tests；该 callable 只消费既有 terminal Stage Artifact index 与 `medical_paper_readiness` projection，fail-closed 写 stage-native `handoff_owner_receipt.json` 或 `receipts/typed_blocker.json`，并明确不写 `publication_eval/latest.json`、`controller_decisions/latest.json`、paper、submission package、`current_package`、memory body 或 quality verdict。

Fresh owner-route/currentness follow-through 已把 DM002 / DM003 从旧 writer/gate-replay tail 收敛到 terminal `stage_artifact_index.next_owner_action -> publication_handoff_owner_gate`：只读 owner-route scan 对两篇均返回唯一 `publication_gate_owner / publication_handoff_owner_gate`，materializer dry-run 写出的 request / persisted dispatch 都是 `publication_handoff_owner_gate`，targeted `domain-owner-action-dispatch --action-types publication_handoff_owner_gate --dry-run` 选中两篇并到达 `publication_handoff_owner_gate.evaluate_terminal_handoff`。这符合 `current_owner_delta -> Stage Artifact Unit -> owner receipt / typed blocker` 的目标态，也关闭了旧 `run_quality_repair_batch` / `run_gate_clearing_batch` 抢占 selector 的 currentness 缺口。OPL 只记录/验证 refs-only launch authorization 与 domain-dispatch refs，不改变 MAS domain truth，不替 MAS 签 owner receipt 或创建 typed blocker，也不把 blocker 解释成 paper ready、publication ready、submission ready、domain ready 或 production ready。2026-06-06 后续 currentness 修正把 MAS default-executor domain-dispatch 的默认可行动分组对齐到同 study current work unit：旧 immutable `dispatch_ref` 仍保留为 audit / provenance identity；若 fresh evidence-worklist 仍出现 open domain-dispatch workorder，必须继续按严格 identity 等待对应 domain/App/live owner refs，不能借用不匹配的 typed blocker 伪闭合。

2026-06-06 fresh readout 修正：`family-runtime evidence-worklist` 的 open workorder / safe-action 计数只从 fresh CLI/read-model 读取，不在 active doc 冻结；固定边界是 `zero_open_worklist_is_completion_claim=false`、`zero_open_worklist_is_domain_ready=false`、`zero_open_worklist_is_production_ready=false`。本轮 fresh readout 观察到 DM002 / DM003 各有一个 MAS domain-dispatch payload-required workorder，均要求 `domain_receipt_refs`、`owner_chain_refs`、`no_regression_refs` 或 `typed_blocker_refs` 由 MAS/domain/App/live owner 提供；下一轮必须重读 live CLI，不继承这个计数。若 fresh readout 暴露 domain-dispatch payload-required workorder，它仍必须由 MAS/domain/App/live owner 提供 domain receipt、owner-chain、no-regression 或 typed blocker refs，OPL 不能用空模板、旧 typed blocker、refs-only ledger 或 recordability 自闭。默认 `current_owner_delta` 仍指向 MAS domain owner answer path，accepted answer shape 仍是 domain owner receipt、quality gate receipt 或 typed blocker。App StageRun cockpit 已消费 refs-only launch authorization ledger，provider attempt / active lease / execution authorization decision 不再是当前 live 缺口；当只缺 owner-answer / stage-run / manifest / current-pointer / source-fingerprint / idempotency binding refs 时，默认 operator next owner 回到 MAS/domain owner，StageRun cockpit 保留这些 missing refs 作为 closeout binding gate。因此当前未闭 critical path 不是 record 一个旧 typed blocker，也不是让 OPL 继续补 launch authorization，而是让匹配的 MAS owner answer 或 typed blocker 与 StageRun closeout binding refs 合法闭环。

现有 `08-publication_package_handoff/receipts/typed_blocker.json` 不能借位关闭当前 `domain_owner/default-executor-dispatch` workorder。`runtime action execute --dry-run` 已按本地 JSON owner-answer ref inspection 读取这些 typed blocker 的 `closeout_binding`，并在 DM002 / DM003 上 fail closed：冲突字段包括 `stage_id`、`stage_run_id`、`source_fingerprint`、`idempotency_key`、`stage_manifest_ref`、`current_pointer_ref`、`provider_attempt_ref`、`attempt_lease_ref` 和 `execution_authorization_decision_ref`。这类旧 handoff blocker 只说明 terminal publication handoff owner gate 的历史阻塞，不是当前 complete-readiness domain-dispatch workorder 的合法 owner answer。对应 machine guard 已进入 `runtime action execute blocks stale local typed blocker refs bound to another StageRun identity` focused test；任何 future record path 必须提供与当前 StageRun、stage manifest、current pointer、source fingerprint、idempotency、provider attempt、active lease 和 execution authorization decision 匹配的 domain-owned refs。

2026-06-06 provider-hosted execution boundary follow-through：OPL Codex stage runner 已把 refs-only execution authorization context 写入 Codex stage prompt，并要求 executor 在调用 domain/provider-hosted child command 时显式传递 `OPL_*` bindings，而不是依赖隐式 shell inheritance。该上下文只来自 attempt 内已签发的 provider attempt、active lease、execution authorization decision、stage packet 和 workspace refs；runner 不从 `OPL_STAGE_ATTEMPT_ID`、workflow id 或 task id 合成 active lease / authorization decision。MAS 只应在这些 refs 与 stage packet / study / action / work-unit identity 同时匹配时才把 dispatch 视为可信 OPL execution authorization。单独的 `OPL_STAGE_ATTEMPT_ID`、workflow id、task id 或 provider-hosted identity 只能作为 identity/binding 输入，不能作为 active lease、execution authorization decision、owner answer、MAS typed blocker 或 domain readiness 证据。

`sat_e1386779b0da8f53e8357573` 是当前需要避免误闭合的反例：attempt query 显示它已有 provider attempt、active lease 与 execution authorization decision refs，但 MAS closeout file 的 `status=blocked`、`blocked_reason=opl_execution_authorization_required`，其 `typed_blocker_ref` 指向同一 closeout 内的 `#domain_blocker`。这类 closeout 表达的是 OPL execution authorization / env binding 未被 domain command 消费，不是 `medical_paper_readiness_not_ready`，也不是当前 MAS readiness surface 的合法 owner answer。它只能作为修正 OPL provider-hosted env / prompt 传递的证据，不能被 OPL safe-action shell 记录成 MAS owner receipt、MAS typed blocker、paper readiness blocker 或 production evidence。

2026-06-05 Stage Native follow-up 把 MAS Stage Native State Machine / StageRun Kernel 设计、RCA stage-artifact 经验和 OPL Foundry target architecture 合并为 family 级推广方案：[OPL Stage Native Kernel 推广方案](./opl-stage-native-kernel-rollout-plan.md)。该方案把下一轮结构目标固定为 `Stage Folder + stage_manifest + role artifacts + owner receipt / typed blocker + minimal StageRun state`。推广对象是 OPL Stage Native Kernel，不是 MAS controller redesign；OPL 基座只持有 StageRun、manifest、attempt/lease/retry、event log、read-model rebuild、App/workbench projection 和 conformance validator，domain agents 继续持有 stage semantics、quality gate、domain owner receipt、typed blocker、artifact authority 和领域判断。本轮 OPL 标准层 machine surface 已进一步落地：`stage-manifest.schema.json`、`role-artifact-ref.schema.json`、`stage-owner-receipt.schema.json`、`stage-typed-blocker.schema.json`、`opl stage validate --json`、以及 `opl agents conformance` 的 `stage_run_kernel_profile_checks` 和 `stage_run_canary_evidence_checks` 已进入源码/合同/测试；MAS/MAG/RCA/OMA 的 domain-owned `contracts/stage_run_kernel_profile.json` 与 controlled `contracts/stage_run_canary_evidence.json` 由同一 family conformance gate 验证。Controlled canary evidence 只证明 candidate generation、reflection / review、comparative selection、evolution / revision、meta-review 和 independent quality gate 的 refs-only closeout 形态已统一，不声明 DM002 / DM003 live paper line、grant stage、visual stage、target-agent stage、quality verdict、artifact ready 或 production ready。App/operator StageRun cockpit projection 已从 `current_owner_delta` 派生并进入普通读面。MAS DM002 / DM003 live canary 已关闭 stage-native missing-output tail、terminal publication owner callable和默认 domain-dispatch open workorder tail；当前 StageRun closeout binding 仍等待匹配 MAS owner answer 或 typed blocker refs。补偿链退役、MAG/RCA/OMA live canary 和 production evidence 仍按下方证据差距推进。

同一 follow-up 的 anti-bloat / admission 口径已经折回长期规则：StageRun Kernel 必须让默认路径更短，不能把 prompt / skill / tool / knowledge / rubric refs 的完整性扩成启动前 hard gate；`launch admission` 只判断安全启动、authority boundary、executor binding、required role artifact slot、receipt/blocker shape、forbidden write 和 replay/audit 最低 lineage，`closeout admission` 只判断 role artifact、manifest、owner receipt / typed blocker、current pointer、hash、generation 和 lineage。strategy refs 缺口默认进入 advisory / route-back / reviewer context；raw worklist、replay packet、provider trace、typed blocker group、evidence ledger browser、route variant menu 和 private residue inventory 只能留在 full drilldown / audit lane。

## 当前完成进度

当前完成进度按 `OPL Framework -> One Person Lab App -> Foundry Agents`
目标态读取：framework control plane、generated surface consumption、App/operator
projection 和 standard-agent source shape 已进入当前主干；domain owner-chain、
memory/artifact lifecycle、long-soak、App release cohort 和 no-resurrection 仍按下方
测试/证据差距推进。普通 operator / App 默认读面先回答四个问题：

1. 当前有没有 OPL 可执行 safe action。
2. 当前等待哪个 domain / human / App / provider owner。
3. owner 下一步必须产出什么：deliverable delta、quality gate receipt、human gate receipt、owner receipt、no-regression ref 或 typed blocker。
4. 这个等待是否阻断 domain ready、App release ready 或 production ready。

`open_worklist=0`、payload-free safe action 为 0、verified typed blocker 增长、selected App cohort、provider SLO satisfied、conformance passed、default-caller evidence clean、cleanup ledger verified 或 generated surface ready，都不能升级成 completion、domain ready、App release ready 或 production ready。

本轮 purpose-first 落地后，这个读法已经有机器守门：`surface-budget-policy.json` 的 `attention_entry.default_operator_payload` 固定为 `current_owner_delta`，`opl app state --profile fast --json` 的 `operator.default_read_surface_policy` 固定首屏消费 `opl_current_owner_delta`，`operator.stage_run_cockpit` 和 `operator.workbench.stage_run_cockpit` 固定从同一 `current_owner_delta` 派生 `stage_run_current_owner_delta`、launch admission、closeout admission 和 refs-only authority boundary。`opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json` 和 `opl family-runtime evidence-worklist --detail full --json` 现在都从同一 `current_owner_delta_read_model` 派生紧凑顶层读面：`current_owner_delta`、`current_owner_delta_read_model`、`operator_next_owner`、`operator_required_delta`、`operator_payload_requirement`、`operator_accepted_answer_shape`、`operator_next_action`、`operator_next_action_kind`、`operator_next_action_owner`、`operator_next_action_authority_boundary`、`stage_run_cockpit` 和 `stage_run_cockpit_summary`。默认 accepted answer shape 收敛为 `domain_owner_receipt_ref`、`quality_gate_receipt_ref` 或 `typed_blocker_ref`，framework readiness 不再把 handoff/audit tail 的宽泛 legacy return-shape union 暴露成默认 owner answer。`compact_owner_delta_projection` / `opl_compact_owner_delta_projection` 已从 active/default surfaces 退役；audit count、raw refs 和 full-detail refs 只进入显式 `current_owner_delta_read_model` / full-detail diagnostic。`runtime_tray_snapshot`、raw evidence envelope、stage replay body、private residue inventory 和 provider internal ledger 只允许作为 `--profile full` / lazy diagnostic detail，不进入普通 App/shell 默认状态。

2026-06-06 App fast owner-delta 读源候选已落地为非权威 projection cache：`framework readiness`、`family-runtime evidence-worklist` 和 `runtime app-operator-drilldown` 在生成同源 `current_owner_delta_read_model` 时写入 `current-owner-delta-read-model-cache.json`；`opl app state --profile fast --json` 只做 bounded 本地读取，命中时直接消费同一 read model，未命中才回退到 runtime activity fallback。fast profile 不同步调用 full runtime drilldown，不把 cache 当 domain truth、owner receipt、typed blocker、domain ready、App release ready 或 production ready；runtime activity 继续服务 workbench 活动列表，不能再造 second next-owner / required-delta / accepted-shape root。

Current owner-delta live follow-through 进一步收薄默认读面：`current_owner_delta` 自身必须暴露与派生 default next action 同源的 `owner/current_owner/domain_id/stage_id/payload_requirement/required_return_shapes/accepted_answer_shape` 字段；root `operator_next_action*` 只来自 `current_owner_delta_read_model.next_safe_action_or_none`，它显示当前 owner answer / typed blocker 所需的默认下一步及 false authority flags，不能把 `attention_first_payload.next_safe_actions` 里的 refs-only review attention 误读为 OPL 可执行 domain action。当前 owner 是 `medautoscience`，accepted answer shape 是 `domain_owner_receipt_ref`、`quality_gate_receipt_ref` 或 `typed_blocker_ref`。OPL 可见的 `provider-worker:temporal:start` 只属于 provider health / provider lane；它可以改善 worker lifecycle，但不能关闭 MAS owner delta、不能签 owner receipt、不能创建 MAS typed blocker，也不能作为 domain ready、App release ready 或 production ready 证据。

2026-06-06 fresh live owner 折回：本轮只以 `opl agents conformance --family-defaults --json`、`opl framework readiness --family-defaults --json`、`opl agents default-callers --family-defaults --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 作为当前 OPL source of truth。当前 OPL source checkout 读数是 structural conformance `4/4 passed`、`blocked_count=0`、framework readiness hard blockers 为 0，provider cadence / capability SLO satisfied，default-caller deletion 的 `no_active_caller_proof` 已可由 ready 的 OPL generated / hosted / domain-handler target proof 作为 refs-only structural evidence 观察到。这个 proof 只关闭 no-active-caller accounting，不生成 domain owner receipt、不创建 typed blocker、不授权物理删除；`default_caller_delete_ready=false`、`physical_delete_authorized=false` 和 `physical_delete_authorization_status=not_authorized_by_opl_projection` 仍是当前口径。当前 remaining owner delta 仍是 MAS/domain/App/live owner payload：OPL 只能记录或验证匹配 identity 的 refs-only payload，不能自造 MAS owner receipt、typed blocker、owner-chain ref 或 no-regression ref，不能把 conformance pass、open worklist 为 0、provider SLO、controlled canary 或旧 typed blocker 借位闭合。

Fresh `opl agents conformance --family-defaults --json` 的 structural conformance 目标是 `4/4 passed`、`blocked_count=0`，且每个 domain report 都必须同时通过 `stage_run_kernel_profile_checks`、`stage_run_canary_evidence_checks`、private surface guard 和 production evidence tail 分账。当前唯一 ordinary default route 分别是 MAS `direction_and_route_selection`、MAG `call_and_candidate_intake`、RCA `source_intake`、OPL Meta Agent `intent-intake`；`production_evidence_tail_count=4` 仍独立报告，不作为 structural pass 条件。2026-06-06 起，`opl agents conformance` 顶层 payload 直接暴露 `passed_count`、`blocked_count`、`structural_conformance_status`、`production_evidence_tail_count` 和 `stage_run_domain_adoption_read_model`。其中 `stage_run_domain_adoption_read_model` 把四个 domain 的 StageRun profile、controlled canary scope、operator canary status、production evidence tail 分类和下一 owner action 放到紧凑顶层读面，当前显示四个 domain profile / canary 均 passed，canary scope 仍是 `controlled_fixture_not_live_domain_progress`，每个 domain 的 `structural_conformance_is_domain_ready=false`，authority boundary 也保持不能 claim live domain progress、domain ready、quality/export ready、artifact ready、production ready，不能签 owner receipt、创建 typed blocker 或授权 physical delete。`opl agents default-callers` 顶层 payload 直接暴露 `blocked_count`、`deletion_evidence_worklist_count`、`missing_*`、`default_caller_delete_ready=false`、`physical_delete_authorized=false` 和 `physical_delete_authorization_status=not_authorized_by_opl_projection`，并通过 `physical_delete_authority_read_model` / `repo_deletion_gate_summary` 把每个 repo 的 deletion evidence observed 状态、下一 owner action 和 false authority flags 放到紧凑顶层读面。`opl family-runtime evidence-worklist --detail full --json` 的 default-caller deletion evidence lens 与同一 family default-caller repo scope 对齐，当前 no-active-caller proof 不再占用 cleanup action route；剩余普通 owner delta 仍按 domain / app live owner payload 处理。这些 read-model 只减少 operator 下钻成本，避免 summary-only/null alias 误判；它们不改变 domain owner gate、live progress authority 或 physical delete authority，也不能把 zero missing evidence、controlled canary passed、worklist count 对齐或 structural conformance passed 升级为 delete-ready、domain ready 或 production ready。该状态说明 cognitive-kernel、tool-affordance boundary、single golden path 和 controlled StageRun canary evidence 的标准接入已经进入可验证主干；真实 owner receipt、typed blocker、human gate、domain quality/export/review verdict 和 production evidence 仍按下方证据差距推进。

OMA physical morphology 的当前读法是：`tests/support/contracts.ts` 这类 contract guard helper 可以命名 forbidden owner-role token 来断言它们不得作为 active authority claim 出现；这类 residue 归 `contract_or_legacy_guard_test`，不构成 active forbidden name blocker。Fresh family conformance 读为 `4/4 passed`、`blocked_count=0`，但该结构通过仍只证明标准接入和 guard 分类正确，不声明 OMA target-agent ready、default promotion、domain ready 或 production ready。

2026-06-05 landing tranche 已把这组目标吸收回各 owner repo：App repo 增加 ordinary cockpit surface budget、Runtime owner-action 字段、first conversation warmup 和 Full runtime native trust / release-boundary gate；Aion shell 等待 ACP warmup 后再发送首条 initial message，并在安装 Full runtime payload 时处理 macOS quarantine；MAS 把 AI reviewer record-only handoff、request persistence、provider admission 和 terminal `publication_handoff_owner_gate` 拆成 owner-currentness / owner-receipt / typed-blocker 可验证模块；MAG/RCA/OMA/OPL Doc 只做 docs lifecycle / no-authority / provenance demotion。该 tranche 关闭的是 default path、contract guard、terminal handoff callable 和 support-entry 降噪，不关闭 MAG/RCA/MAS/OMA physical delete、真实 live domain owner receipt、human gate、review/export verdict、long-soak 或 App release-ready。

Follow-on gate 的当前口径已经收敛为三类 owner delta：OMA script-to-pack 与 policy contract 属于 `meets_target` 的结构守门；MAG / RCA retained wrapper 与 physical morphology 仍按 `needs_retirement` 的 owner-receipted cleanup gate 推进；App release/user-path 只保留为 release owner evidence tail，不进入 ordinary cockpit 或 family completion。2026-06-06 并行 read-only 审计补充：MAG checkout 的未提交改动是一条独立 owner lane，只能读取为 legacy default path residue 清零和 tombstone/owner-handoff refs 进展，不能由 OPL 本轮覆盖或吸收；RCA / OMA StageRun structural adoption 均已通过 live conformance，但 controlled canary、refs-only ledger、suite pass、typed blocker record 和 OMA production-consumption receipts 必须按 `needs_demotion` 读成 evidence-shape 接入，不能升级成 visual ready、target-agent ready、domain ready、default promotion、App live rendering 或 production ready。具体 receipt、cohort、script path、commit id 和 closeout 流水回对应 repo history、runtime ledger 或 live contracts/source/tests 读取；本页只保留当前 owner、完成口径和仍未闭合 gate。

Unified owner-delta 仍按 live 机器面读取，不从本页继承旧 counters。若 fresh readiness 指向 MAS/domain/App/live owner，OPL 只能记录或验证 refs-only payload、typed blocker 或 owner-chain support refs；不能自造 MAS owner receipt、typed blocker、owner-chain ref 或 no-regression ref。平台 currentness、gate replay、provider dispatch 和 monitoring 修复只改善 owner route，不关闭 MAS paper owner receipt、publication ready、current package、App release ready 或 production ready。具体 worklist 数字、safe-action id、receipt ref 和 closeout 流水每轮都必须从 live 命令读取。

2026-06-06 follow-through：`family-runtime evidence-worklist --detail full` 的 `worklist_items` 已显式标注 `worklist_lane` 与 `default_owner_delta_eligible`。普通 owner-delta 只能从 `worklist_lane=ordinary` 且 `default_owner_delta_eligible=true` 的 open item 读取；`audit`、`cleanup`、`diagnostic` lane 即使带 `route_requires_domain_or_app_payload=true` 或 verified refs-only receipt，也只是 passive evidence / cleanup / diagnostic tail，不能成为默认 next owner action、completion、domain ready、production ready 或 delete authority。本轮 fresh full readout 的 null lane count 已为 0；当前 ordinary open item 指向 MAS domain-dispatch owner answer payload，stage-production evidence 和 standalone verified receipts 均在 audit lane。

## 统一审计标准

后续 closeout、设计评审和跨仓优化都按 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md) 的 `Audit Standard` 判断，并在本页只保留执行口径：

| audit lane | 本页完成口径 |
| --- | --- |
| `default_path` | 普通 App/CLI/operator summary 从 `current_owner_delta` 派生，不把 raw worklist、replay、provider trace、route variant 或 private residue 当 next-action root。 |
| `progress_truth` | progress 只由 artifact unit、owner answer / receipt / typed blocker、current pointer 和 domain/human gate 关闭；OPL evidence transport 只能做支撑。 |
| `mvp_friction` | 默认尝试能直接进入 stage artifact / owner answer 路径；重复 receipt-only、platform-repair-only、read-model-reconcile-only 或 stale-route redrive 时触发 stop-loss 或 typed blocker。 |
| `authority_boundary` | OPL/App/OMA/Agent Lab 不持有 MAS/MAG/RCA domain truth、quality/export/review verdict、artifact authority 或 memory accept/reject。 |
| `surface_budget` | 新 surface 先按 default / diagnostic / audit / cleanup / production lane 分类；没有 default 资格的内容不进入普通入口。 |
| `golden_path` | MAS/MAG/RCA/OMA 每个 agent 只有一个 ordinary route；variants/proof/diagnostic/cleanup/long-soak 必须显式。 |
| `wrapper_retirement` | retained wrapper / adapter / script 只能保留到 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance gate 关闭。 |
| `app_cockpit` | App 默认展示 purpose、task/stage、next owner、accepted answer shape、artifact/blocker 和 release/user-path facts；full drilldown 只做诊断。 |
| `stage_native_kernel` | StageRun Kernel 默认面只回答 current owner delta、缺什么 role/receipt/blocker 和下一 owner；launch/closeout blockers 与 advisory/audit/drilldown 分层，避免把新 Kernel 变成更厚 admission、worklist 或 read-model 补偿链。Execution authorization、attempt lease 和 closeout receipt binding 是 launch-hard / closeout-binding gate；缺失时生成 OPL-owned execution authorization blocker，owner=`one-person-lab`，并明确它不是 domain typed blocker、不会改 domain truth、不会替 domain owner 签 receipt。 |

本页的 gap 只能标成三类：

- `meets_target`: 默认路径、owner delta 和真实进度 owner 都更清楚。
- `needs_demotion`: surface 有审计或诊断价值，但不应出现在 ordinary path。
- `needs_retirement`: surface 已被 OPL generated/hosted surface、App contract 或 domain authority function 替代，应走删除或 tombstone。

不得用 `tests passed`、`conformance passed`、`open_worklist=0`、`verified ledger`、`doctor clean` 或 `docs updated` 单独关闭这些 gap。

## 功能 / 结构差距

| area | 当前状态 | 当前 owner | 下一步 |
| --- | --- | --- | --- |
| `framework_control_plane` | `landed_with_evidence_tail`。Temporal provider、typed queue、stage attempt ledger、safe action shell、refs-only evidence ledger、App/operator drilldown、Agent Lab、pack compiler、owner-delta handoff / compact projection、default read surface policy 和 conformance/readiness 读面已经是 framework 主干。 | OPL Framework | 保持同源 read model；新增 CLI/App/docs surface 必须从同一机器 payload 派生，不制造第二 truth。 |
| `standard_agent_source_shape` | `structural_clean_with_no_resurrection_guard`。MAS/MAG/RCA/OMA 按标准 Foundry Agent 读为 source-purity / default-caller deletion-evidence clean；这不是 physical delete 授权。 | OPL + domain owner | 后续只按 domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 和 no-active-caller 证据执行物理删除；不保留兼容 facade、alias、wrapper 或 compatibility-only test。 |
| `generated_surface_consumption` | `ready_for_production_consumption_scaleout`。Generated/hosted surfaces、domain handler target、pack compiler 与 conformance surface 已能承接标准 agent。 | OPL generated surface owner | 用真实 MAS/MAG/RCA/OMA default caller、direct skill path、App path 和 owner refs 反复验证；不把 descriptor ready 写成 domain ready。 |
| `app_workbench_runtime` | `app_operator_stage_run_cockpit_projection_available`。App/workbench 能消费 provider readiness、stage attempt、StageRun cockpit、route graph、workorder、SLO、repair、source/artifact/memory refs 和 owner-aware action；StageRun cockpit 只从 `current_owner_delta` 派生 launch/closeout/advisory/authority 投影。`runtime app-operator-drilldown` 顶层现在也有同源 owner-delta / StageRun cockpit alias，full refs 仍通过 `attention_first_payload` 和 `--detail full` 下钻。 | OPL App + OPL product surface | App 只展示和介入，不持有 runtime truth、domain truth、release verdict、owner receipt、typed blocker 或 artifact authority；App release truth 回 App 仓合同、release artifact 和实机 evidence。 |
| `domain_private_residue_retirement` | `active_cleanup_guard`。旧 repo-local scheduler、runner、session store、status/workbench shell、sidecar、generic wrapper、compat path 只能作为迁移输入、diagnostic 或 history/tombstone。 | OPL cleanup gate + domain owner | 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 与 provenance 后直接删除或 tombstone；不新增兼容入口。 |
| `docs_lifecycle` | `active_docs_not_ledger`。Core five、active plan、reference、history 的职责已经明确，但 active 文档仍需持续防止 dated evidence 和长清单回流。 | OPL docs governance | Active 只保留 owner / current state / gate / next action；dated proof、coverage tranche、receipt 流水、branch/worktree closeout 进入 `docs/history/**`。 |
| `ideal_operating_model_redesign` | `reference_folded_back`。跨 OPL/App/MAS/MAG/RCA/OMA/support repo 的理想 operating model 已按 `目的反推必要性，MVP 检查阻碍性` 折成 `meets_target` / `needs_demotion` / `needs_retirement` 审计口径，并完成本轮 App cockpit guard、MAS owner-currentness、MAS terminal handoff callable、support entry demotion 和 active line consolidation。该 redesign doc 已非 active backlog owner，只保留评估口径；当前 owner / gate / next action 由本文维护。 | OPL Framework + domain/App owners | 后续只保留 domain owner evidence、App release/user-path cohort、OMA script-to-pack machine gate、support no-authority no-resurrection tail；不新增第二 worklist、第二 App bridge 或第二 Agent Lab；不把 docs foldback 写成 domain ready、App release ready、production ready 或 physical delete 授权。 |

## Active Docs / Gate Foldback

| foldback item | current owner | gate | next action |
| --- | --- | --- | --- |
| `docs_foldback` | OPL docs governance | `current-state-vs-ideal-gap.md` 是唯一 active owner；`opl-family-ideal-operating-model-redesign.md` 只保留 `active_reference` 评估口径；support docs 不维护独立 backlog、dated counter、branch/worktree closeout 或执行顺序。 | 后续 docs-only lane 只把 current owner / current state / gate / next action 折回本文；dated proof、coverage tranche、receipt 流水和 closeout 进入 `docs/history/**`、runtime ledger、提交历史或 domain-owned provenance。 |
| `domain_wrapper_delete_gate` | OPL cleanup gate + domain owners | `contracts/opl-framework/wrapper-retirement-gate-policy.json` 要求 replacement parity、no-active-caller、domain owner receipt 或 typed blocker、no-forbidden-write、tombstone/provenance；docs foldback、delete-gate read-model、conformance pass、tests pass、default-caller readiness 和 refs-only observed 都不是 physical delete authority。 | 逐 surface 由 domain owner 提供 cleanup receipt、typed blocker、no-regression ref 或 explicit physical delete owner receipt；OPL 只记录 refs、投影 false authority flags 和 no-resurrection guard，不物理删除 domain wrapper。 |
| `real_owner_delta_tail` | MAS/MAG/RCA/OMA domain owners + OPL runtime | 功能面 callable / StageRun / conformance / refs-only transport 已收口；live owner-chain evidence 仍必须来自 domain-owned owner receipt、typed blocker、human gate、quality/export/review receipt 或 no-regression ref。 | OPL 先保证 provider-hosted attempt 显式携带 refs-only execution authorization context，并等待匹配 MAS owner answer 或 typed blocker 完成 StageRun closeout binding；MAS/domain owner 后续处理 readiness surface 并给出 owner receipt、typed blocker、human gate 或 route-back evidence。MAG/RCA/OMA 下一步分别提供真实 grant / visual / target-agent owner evidence，不用 OPL docs、provider lane 或 refs-only ledger 替代。 |

## Redesign Backlog 状态

| lane | 状态 | 当前 owner | 下一步 |
| --- | --- | --- | --- |
| `summary_de_noise` | `meets_target_for_framework_default`。App fast state、Aion shell default payload 和 surface-budget contract 已把首屏答案收敛到 owner delta / next action / hard gate；`count_summary` 只作为 diagnostic-only answer。 | OPL Framework | 后续新增 summary 必须继承同一 policy；raw count、replay、typed-blocker group 和 private residue 不能回到 first screen。 |
| `current_owner_delta_cutover` | `meets_target_for_default_root` / `meets_target_for_execution_authorization_single_root_guard`。`current_owner_delta` 是 App/CLI/operator 默认 root；`compact_owner_delta_projection` 不再作为 active compatibility alias，audit/full-detail refs 由 `current_owner_delta_read_model` 承载。当前 `framework readiness`、App drilldown 和 evidence-worklist 的顶层 owner-delta topline 已同源暴露 owner、domain、stage、payload requirement、三种 accepted answer shape、default next action 和 default next-action authority boundary，避免 operator 看到 null alias、strict typed-blocker fallback、review attention safe action 或 handoff/audit tail 的宽泛 return-shape union。StageRun blocker 缺 provider attempt / active lease / execution authorization decision 时，默认 operator next action 指向 owner=`one-person-lab` 的 OPL runtime blocker；若这些 refs 已存在、只缺 owner answer / closeout binding refs，默认 operator next action 回到 `current_owner_delta.current_owner`，StageRun cockpit 只保留 refs-only closeout binding gate。 | OPL Framework | 继续让 downstream App contracts 和 support shell 消费 `current_owner_delta`，不再推广 `compact_*` 命名；broader domain success refs 只表达 accepted owner answer shape，不授予 OPL receipt/blocker authority。 |
| `active_line_consolidation` | `meets_target_for_docs_owner`。`current-state-vs-ideal-gap.md` 是唯一 active owner；路线图、production closure matrix、purpose-first audit、target architecture、ideal operating model、docs portfolio 和 private platform inventory 只保留 active support / support index / classification role。 | OPL docs governance | active docs 只写当前 owner / gate / next action；support docs 不维护独立 backlog、执行顺序、dated counter 或 worktree closeout；dated proof、receipt 流水和 closeout 进 history 或 runtime ledger。 |
| `domain_wrapper_delete_gate` | `needs_retirement_with_false_positive_guards` / `meets_target_for_cleanup_lane_demotion`。Machine-readable delete gate 已有；MAG cleanup-complete overclaim 已降级为 owner-receipted cleanup readiness，RCA retained wrappers 已确认 delete-auth false / safe-to-delete false，MAS owner-currentness 已推进；fresh default-caller audit 顶层可直接读出 `deletion_evidence_worklist_count=32`、`missing_domain_owner_receipt_or_typed_blocker_count=0`、`default_caller_delete_ready=false`、`physical_delete_authorized=false` 和 `physical_delete_authorization_status=not_authorized_by_opl_projection`。`family-runtime evidence-worklist` 已把 default-caller deletion evidence lens 与 MAS/MAG/RCA/OMA 四仓 default-caller scope 对齐，并把这 32 项标记为 `audit_cleanup_lane`：full detail 仍可审计，ordinary open safe action / first-screen next action 不再由 cleanup gate 驱动。`physical_delete_authority_read_model` / `repo_deletion_gate_summary` 进一步把 per-repo evidence observed、`next_required_owner_action=domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review` 和 `needs_drilldown_for_surface_refs=true` 暴露到顶层，operator 可先读 repo summary，再按 surface 下钻 refs。no-forbidden-write 与 tombstone/provenance refs observed 只是 refs-only 输入，`physical_delete_authorized=false` 仍是硬门，没有任何 surface 可由 OPL 本轮直接物理删除。 | OPL cleanup gate + domain owners | 普通 owner-delta 路径只显示 deliverable / runtime hard gate；cleanup lane 显式进入后再逐 surface 跑 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance。MAG/RCA/MAS/OMA 必须先给出 owner cleanup receipt、typed blocker、no-regression 或 live owner answer，再删除或 tombstone。 |
| `real_owner_delta_tail` | `needs_owner_answer_closeout_binding`。MAS Stage Native live canary 已把 DM002 / DM003 stage artifact read-model 推进到 terminal publication handoff owner gate；MAS main 已补齐 `publication_handoff_owner_gate` callable，使该 owner action 能返回 stage-native owner receipt 或 typed blocker；fresh evidence-worklist 的 open domain-dispatch workorder 只按 live CLI/read-model 判断，若出现也必须由 MAS/domain/App/live owner payload 关闭。默认 `current_owner_delta` 仍等待 MAS/domain owner receipt、quality gate receipt 或 typed blocker；App StageRun cockpit 当前 owner 是 MAS/domain owner，因为 refs-only launch authorization 已存在，closeout binding 仍缺 owner answer refs 与 StageRun / manifest / current pointer / source fingerprint / idempotency binding。`sat_e1386779b0da8f53e8357573` 的 closeout 是 `opl_execution_authorization_required`，只能证明 provider-hosted child command 未消费授权 refs，不能作为 MAS readiness typed blocker。MAG 当前有独立脏改 owner lane 推进 legacy default path residue / tombstone refs，不由本轮 OPL 覆盖；RCA / OMA controlled canary 与 refs-only ledger 已接入但仍按 `needs_demotion` 读取为非 ready 证据。 | MAS/MAG/RCA/OMA domain owners + OPL runtime | OPL 已能用 refs-only authorization ledger 消除 provider attempt / active lease / execution authorization decision 缺口；MAS/domain owner 后续仍需处理 paper readiness surface，给出匹配当前 StageRun/source/idempotency 的 owner receipt、typed blocker、human gate 或 route-back evidence。domain-dispatch workorder 只按 fresh CLI/read-model 和 strict identity 判断是否仍需 owner refs；MAG/RCA/OMA 下一步分别提供真实 grant / visual / target-agent owner evidence，不用 OPL docs、provider lane 或 refs-only ledger 替代。 |
| `app_contract_compaction` | `meets_target_for_contract_guard` / `needs_release_user_path_evidence`。App ordinary cockpit surface budget、Home/Runtime/Settings budget refs、Runtime next owner / accepted answer shape / artifact-or-blocker 字段和 active-shell/release-boundary guards 已落地；release-owner typed blocker path 已成为 App contract 字段并由 validator/test 守门。App main `d9a44cd` 已把 release readiness gate 升级为同 cohort `operator_evidence_bundle` validation、`gate_profile_schema=app_release_validation_profiles.v1`、Homebrew tap `checksum_sha256` 与 remote asset digest coherence、以及独立 release candidate record 保留；这只防止 release false-positive，不声明 release-ready。latest stable 仍是 `v26.6.5`，但该 cohort 的 final release-readiness summary 是 `failed`，不能按合同口径声明 release-ready。`v26.6.3` 只能作为历史同 cohort passed evidence，不能替代当前 latest stable，也不覆盖新增 Homebrew / operator-evidence cohort gates。 | One Person Lab App | 新 App release cohort 继续提供同 cohort passed readiness summary、remote verification、standard / Full clean-VM、Homebrew tap checksum/current asset digest coherence、one-shot installer、Docker/WebUI、GHCR、Full diagnostics/telemetry、operator evidence bundle validation 和 release-owner blocker/receipt refs；release detail 不进入 ordinary cockpit。 |
| `oma_script_to_pack_hygiene` | `meets_target_for_script_gate_coverage`。OMA docs 已改成 fresh-read / live evidence / no second Framework 口径；repo-local TS scripts、developer work-order policy、standard Foundry policy bundle 和 stage-decomposition parts 已进入 contract-backed / split-part machine gate。 | OPL Meta Agent + OPL Framework | 后续新增或继续稳定下来的 policy 继续进入 `agent/`、contracts、authority functions 或 OPL primitive；retained helper/materializer 退役仍需 OPL primitive parity、no-active-caller、no-forbidden-write 和 tombstone/provenance refs，新增/收薄脚本必须更新 machine gate。 |
| `support_entry_clarity` | `meets_target_for_support_entry_boundary`。Aion shell 已按 App contract carrier 处理 initial-message warmup / Full runtime trust；OPL Doc 强化 doctor/profile/family-plan no-authority boundary。 | App shell / OPL Doc support owners | support repo 保持不反向定义 OPL/App/domain truth；后续只防止 implementation detail 或 doctor-clean 重新进入 readiness 叙事。 |

## 测试 / 证据差距

| gap | 仍缺什么 | 完成口径 |
| --- | --- | --- |
| `domain_owner_chain_scaleout` | 真实 MAS paper、MAG grant、RCA visual 和 OMA target-agent stage 在 OPL-hosted path 下持续返回 owner receipt、typed blocker、human gate、quality/export/review receipt 或 no-regression evidence。 | Domain-owned receipt / typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `stage_artifact_unit_domain_adoption` | MAS `stage-artifact-materialize` 已成为当前首个真实 stage-native materializer；2026-06-05 DM002 / DM003 live canary 已把 8 个 stage-native artifact unit 推进到 terminal `08-publication_package_handoff`，stage folder projection 指向 `publication_gate_owner / publication_handoff_owner_gate`；MAS main 已补齐该 action 的 owner callable、route、policy、lifecycle contract 和 focused tests；OPL refs-only domain-dispatch payload batch 已 record/verify。MAG/RCA/OMA 已补齐 advisory cognitive-kernel adoption、tool affordance refs、golden path profile 和 stage-level independent gate policy。 | MAS stage folder closure、terminal owner callable 和 OPL refs-only dispatch transport 只关闭 missing-output / missing-callable / recordability tail；terminal publication handoff 是否完成仍必须回 MAS live owner receipt / typed blocker / human gate。MAG/RCA/OMA 下一步是把这些 stage-internal declarations跑成真实 owner receipt / typed blocker / no-regression evidence，而不是再补 generic wrapper。 |
| `stage_native_kernel_rollout` | `opl_standard_layer_machine_surface_landed` / `four_domain_stage_run_profiles_landed` / `four_domain_controlled_canary_evidence_landed` / `app_stage_run_cockpit_projection_landed` / `opl_execution_authorization_gate_landed` / `agents_conformance_stage_run_domain_adoption_read_model_landed` / `mas_live_stage_artifact_terminal_handoff_gate_landed` / `mas_terminal_handoff_callable_landed` / `mas_domain_dispatch_refs_only_recordability_landed` / `needs_live_owner_evidence_and_compensation_retirement_tail`。OPL family 已有 Stage Folder / State Index / current_owner_delta / golden path / conformance 基础；本轮新增 StageRun Kernel contract、refs-only read-model rebuild primitive、stage_manifest / role artifact / owner receipt / typed blocker schemas、`opl stage validate --json`、StageRun profile conformance gate、controlled canary evidence conformance gate、`stage_run_domain_adoption_read_model` 顶层 operator projection、anti-bloat launch/default-surface gate、fast-lane contract tests、App/operator StageRun cockpit 投影和 execution authorization / closeout receipt binding gate，OPL 标准层已明确 StageRun spec/status/event-log/projection、observed_generation、retry budget、hold scope、manifest/role/receipt/blocker shape、candidate / reflection / ranking / revision / meta-review / independent gate refs、launch/closeout admission 分层、execution authorization blocker、App refs-only boundary 与 domain adoption 边界。MAS/MAG/RCA/OMA 均必须声明 domain-owned `contracts/stage_run_kernel_profile.json` 与 controlled `contracts/stage_run_canary_evidence.json`，并通过 family conformance；这些仍不声明 publication verdict、grant stage、visual stage、target-agent stage 完成或 production ready。真实 live publication owner evidence、MAG/RCA/OMA live domain canary 和补偿链退役仍未作为统一 family 执行模型彻底闭合。 | Controlled canary evidence 关闭“认知计算证据形态”缺口；`stage_run_domain_adoption_read_model` 关闭“operator 是否能从 conformance 顶层看见每个 domain 的 StageRun adoption、controlled canary scope、production evidence tail 分类、下一 owner action 和 false-authority boundary”的缺口；App StageRun cockpit 关闭“普通 operator 能否消费 StageRun current owner delta / admission / authority boundary”缺口；OPL execution authorization gate 关闭“launch-hard / closeout-binding 缺失时是否可机器阻断并投影”的缺口；MAS DM002/DM003 live canary 关闭 stage-native missing-output tail并暴露 terminal owner gate；MAS terminal handoff callable 关闭 missing-callable tail；MAS domain-dispatch refs-only batch 关闭 OPL recordability tail。真实 domain progression 仍要用 MAS live publication owner receipt / typed blocker、RCA reference、MAG grant-stage light canary、OMA generality canary 产生 domain-owned owner receipt / typed blocker / no-regression evidence。满足 role artifact / owner receipt / typed blocker / no-active-caller / tombstone gates 后退役对应旧 progress/read-model/controller compensation path。新增 StageRun / conformance / App surface 必须维持 launch blockers、closeout blockers、execution authorization blockers、closeout binding blockers、advisory warnings、route-back recommendations、audit drilldown refs 和 forbidden authority flags 分层，不能把 context completeness、controlled fixture、App projection、OPL execution blocker、structural conformance pass 或 diagnostic evidence 升级成 live progress。 |
| `memory_artifact_lifecycle_apply` | 真实 memory retrieval/writeback、accepted/rejected receipt、artifact mutation receipt、package/export lifecycle receipt、cleanup/restore/retention 对账。 | Domain-owned surface 产生真实 memory/artifact/lifecycle receipts；OPL 不保存 body、不判定 verdict。 |
| `provider_long_soak` | Temporal service/worker、provider cadence/capability、domain owner-chain dispatch 和 retry/dead-letter 在更长窗口内持续满足，并能暴露 blocker。 | Long-soak refs、provider state linkage、operator evidence refs 或 typed blocker refs 可重复 record/verify；不外推为 production ready。 |
| `app_release_user_path` | App 已新增 first conversation warmup、Full runtime native trust、release-boundary gate、release-owner typed blocker path 和 App main `d9a44cd` release evidence readiness guard。Current latest stable `v26.6.5` 是非 draft / 非 prerelease stable release，但 final `release-readiness-summary-26.6.5` 为 failed；仍缺同 cohort passed readiness summary、remote verification small artifact、standard / Full DMG clean-VM、Homebrew standard cask clean-VM、stable/full tap plan evidence、one-shot installer、Docker/WebUI、WebUI GHCR publish、Full diagnostics/telemetry 和 operator evidence bundle validation pass。standard / Full Homebrew cask checksum 现在已有机器 guard 要求与同 cohort remote release asset digest 一致；该 guard 缺失时会 fail closed，但不能替代实际 passed cohort evidence。`v26.6.3` passed evidence 只支持历史同 cohort 审核，不能升级当前 release-ready。 | App release/user-path refs 只关闭 cohort evidence gate；release-ready verdict 回 App release 流程。 |
| `no_resurrection` | 后续代码和文档不重新引入 retired executor / entry / local-manager vocabulary、compat alias、facade、wrapper、old CLI alias 或 compatibility-only tests 作为 active surface。本轮把 `tests/src/active-path-residue-scan.test.ts` 的 active docs 扫描从固定少数文件扩到全部 `docs/active/**/*.md`，focused guard 已通过，当前未发现 active 文档把旧路径重新声明成默认面。 | Focused guard、docs scan、contract/source tests 和 review 一起阻断旧路径复活；保留的旧词必须处在 history/provenance/negative-guard 语境。该 guard 只证明 no-resurrection 扫描覆盖，不授予 physical delete、domain ready、App release ready 或 production ready。 |

## 下一轮 Agent prompt

- Write scope: OPL family active truth owner、core docs、runtime/App read-model
  边界、stale wrapper/facade/alias direct-retirement 证据，以及本轮 coverage
  ledger 的未覆盖与保留项。
- Non-goals: 不声明 domain ready、App release ready、production ready；不把
  OPL refs-only evidence、provider completion、descriptor ready、suite pass 或 docs
  doctor pass 写成 domain verdict；不新增 compatibility alias、facade、wrapper 或
  Markdown wording tests。
- Live truth inputs: 先重读 live source、contracts、tests、CLI/read-model、
  runtime ledger、provider receipt、domain-owned manifest、App evidence、git
  worktree/branch/PR state 和下列 OPL readouts，不从本文继承旧 counters：

   ```bash
   rtk opl framework readiness --family-defaults --json
   # read payload under .framework_readiness
   rtk opl runtime app-operator-drilldown --json
   # read payload under .app_operator_drilldown
   rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
   # read payload under .family_runtime_evidence_worklist
   rtk opl app state --profile fast --json
   # read payload under .app_state.operator
   rtk opl agents conformance --family-defaults --json
   # read payload under .standard_domain_agent_conformance; domain reports live in .standard_domain_agent_conformance.reports[]
   rtk opl agents default-callers --family-defaults --json
   # read top-level default-caller payload directly
   ```

- Parallel execution discipline: 为提高效率，凡任务互不冲突、写集可隔离、
  source of truth 清楚，且不会阻断当前 critical path，优先用 subagent +
  独立 worktree 并行推进审计、实现、验证或 docs foldback lane；subagent
  prompt 首行必须写清任务、cwd、权限、source of truth 和停止条件。主会话必须核查
  diff、live evidence、验证输出和残余风险，完善后立刻吸收回 main 并清理
  worktree / branch / thread；不能把 subagent 完成报告当作 owner receipt、
  domain verdict、delete authority 或最终验收。
  若 lane 只负责 active docs foldback，必须先确认 main checkout 状态、`.worktrees/`
  ignore 状态、既有并发 worktree/branch 和本轮 source-of-truth readouts；只允许在
  指定写集内产出可审查 diff。已有并发 worktree 一律视为外部 owner lane，除非用户
  明确授权，不得吸收、清理、覆盖或把其状态并入本轮完成口径。

- Required actions:
  1. 若有 OPL 可执行 safe action，优先推进 owner-delta：domain / human / App /
     provider owner 必须给出 deliverable delta、owner receipt、typed blocker、
     quality gate receipt、no-regression ref 或 long-soak ref。
  2. 若当前工作是 domain stage artifact materialization，先证明 refs-only、manifest、owner receipt、bounded source refs、domain authority index record 和 nonterminal closeout 语义；然后再回到 paper / grant / visual / agent owner-route gate，不能把 stage folder closure 写成终局 ready。
  3. 若当前工作是 StageRun Kernel / conformance / App cockpit surface，先保持 launch admission、execution authorization、closeout admission 与 owner-answer / closeout binding 分层：strategy refs 缺失只进 advisory / route-back；identity、owner、scope、executor、authority、required role slot、receipt/blocker shape、forbidden write 或 replay/audit lineage 缺口阻断 launch；provider attempt、attempt lease、execution authorization decision、workspace/artifact scope、source fingerprint、idempotency 缺口阻断 execution authorization；role artifact、manifest、owner receipt / typed blocker、current pointer、hash、generation 或 lineage 缺口阻断 closeout；owner receipt 或 typed blocker answer 必须绑定 StageRun、stage manifest、current pointer、source fingerprint 和 idempotency key。若 StageRun cockpit 的 blocker 仍缺 provider attempt / lease / execution authorization decision，默认 `current_owner_delta` topline 指向 owner=`one-person-lab` 的 OPL runtime blocker；若这些 refs 已存在而只缺 owner-answer / closeout binding refs，默认 next owner 必须回到 domain owner，不能让 OPL 替 domain 创建 receipt、typed blocker 或 readiness claim。
  4. 若没有 OPL safe action，只能把 blocked refs-only attention 写成等待 owner
     或 typed blocker，不写成完成。
  5. 若发现 default-caller deletion / cleanup / wrapper-retirement gate 进入普通 progress worklist，先下沉为 cleanup lane / full-detail audit；只有用户显式进入 cleanup lane 或 domain owner 提供 physical delete receipt / typed blocker 时才作为执行目标。
  6. 若发现 active source 或 active docs 重新保留旧 wrapper、facade、alias、
     compat path 或 retired entry/runtime vocabulary，按 direct
     retirement 处理：迁移 caller，删除旧面，必要 provenance 归 history/tombstone。
  7. 若本轮只做 docs 治理，更新 active truth、coverage ledger、未覆盖清单、
     保留理由和下一轮写入范围；不要新增 Markdown 措辞测试。
  8. 每个新发现的优化项必须按 `meets_target` / `needs_demotion` /
     `needs_retirement` 分类；不能只写“继续完善”或“增加证据”。
- Verification commands: docs-only 最小验证为 `rtk git diff --check`、
  `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs`、targeted stale wording scan 和 docs
  inventory sanity；触及 source/contract/runtime/App 行为时按下方 owner repo 验证入口追加。
- Completion gate: 本轮 tranche 只能在已审范围、已改文档、归档/tombstone/删除文档、
  未覆盖文档、剩余 stale/retire 候选和下一轮写入范围都写入 ledger，且 main checkout
  完成最小充分验证后关闭；不得关闭全局 `/goal`，除非 6 仓 README* 与
  `docs/**/*.md` 已逐段覆盖且剩余 gap 全部关闭或进入下一轮 prompt。
- Foldback target: 当前结论折回本文、核心五件套和对应 support docs；dated proof、
  coverage tranche、worktree/branch closeout、receipt 流水和 superseded 计划进入
  `docs/history/**`、runtime ledger、提交历史或 domain-owned receipt/provenance。

## Forbidden Claims

- Descriptor ready、conformance passed、generated bundle ready、queue completion、suite pass、file existence 或 test pass 不能写成 domain quality verdict。
- OPL ledger receipt、stage evidence workorder、provider proof 或 App drilldown projection 不能写成 MAS paper closure、MAG grant-ready、RCA visual-ready、OMA default promotion、App release ready 或 production ready。
- 同一个 executor 不能在同一上下文中先执行再自审并关闭 AI-first quality gate。
- Retained refs-only adapter、diagnostic shell、tombstone/provenance code path、compatibility facade、re-export wrapper 或 default-caller duplicate 不是标准 agent 完成态。
- 文档归档不能替代实现清理；旧模块、旧接口、旧测试和旧文档入口被当前 owner surface 替代后，按 direct retirement 删除或 tombstone。

## 验证入口

Docs-only inventory updates:

- `rtk git diff --check`
- `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs`
- targeted stale wording scan for retired entry/runtime vocabulary outside `docs/history/**`

触及 source / contract / runtime / App 行为时，按 owner repo 验证：

- OPL: `rtk ./scripts/verify.sh` 或 focused `npm run test:fast` / `npm run test:meta`
- MAS: `rtk ./scripts/verify.sh` 或 MAS repo-local focused tests
- MAG: `rtk ./scripts/verify.sh`、`rtk make test-meta` 或 focused product-entry/autonomy tests
- RCA: `rtk npm run test:fast` 或 focused product-entry/sidecar/native helper tests
- OMA: `rtk npm test`、`rtk npm run typecheck`
