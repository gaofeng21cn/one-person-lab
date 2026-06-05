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

Fresh owner-route/currentness follow-through 已把 DM002 / DM003 从旧 writer/gate-replay tail 收敛到 terminal `stage_artifact_index.next_owner_action -> publication_handoff_owner_gate`：只读 owner-route scan 对两篇均返回唯一 `publication_gate_owner / publication_handoff_owner_gate`，materializer dry-run 写出的 request / persisted dispatch 都是 `publication_handoff_owner_gate`，targeted `domain-owner-action-dispatch --action-types publication_handoff_owner_gate --dry-run` 选中两篇并到达 `publication_handoff_owner_gate.evaluate_terminal_handoff`。这符合 `current_owner_delta -> Stage Artifact Unit -> owner receipt / typed blocker` 的目标态，也关闭了旧 `run_quality_repair_batch` / `run_gate_clearing_batch` 抢占 selector 的 currentness 缺口。剩余 gate 已转移到 OPL execution authorization：StageRun launch 必须有 provider attempt、attempt lease、execution authorization decision 和 closeout receipt binding，才能执行 terminal owner gate 并把 `handoff_owner_receipt.json` 或 `receipts/typed_blocker.json` 绑定回 StageRun / manifest / current pointer。OPL StageRun Kernel 现在已有 `evaluateStageRunExecutionAuthorization`、machine-readable contract policy 和 App StageRun cockpit projection：缺 provider attempt、attempt lease、execution authorization decision、workspace/artifact scope、source fingerprint、idempotency 或 closeout receipt binding 时，默认结果是 owner=`one-person-lab` 的 OPL runtime execution-authorization blocker；它阻断 execution，但不改变 MAS domain truth，也不替 MAS 签 owner receipt 或创建 MAS typed blocker。MAS domain-dispatch typed-blocker payload batch 已被 OPL refs-only safe-action shell dry-run、record 和 verify 接收，fresh evidence-worklist 读为无 open safe action、无 open domain-dispatch workorder；这只关闭 OPL transport / recordability tail。因此本轮只关闭 terminal handoff owner callable 缺口、stage-folder missing-output / canonical manifest+receipt read-model tail、terminal handoff currentness/selector tail、domain-dispatch refs-only payload record/verify tail 和 OPL execution authorization machine gate；不关闭 DM002 / DM003 live workspace publication handoff owner answer、MAS publication owner gate、AI reviewer / publication quality、submission-ready、artifact mutation、current package、OPL queue release/resume 或 production readiness。

2026-06-06 fresh apply/readout 补充：DM002 / DM003 的 MAS `study progress` 仍为 `active_run_id=null`，下一步仍等待 `publication_gate_owner` 执行 `publication_handoff_owner_gate`。`domain-owner-action-dispatch --apply` 只写出 workspace supervision execution record，记录 `blocked_reason=opl_execution_authorization_required`、`action_class=observe_only`、`will_start_llm=false`、`llm_dispatch_allowed=false`，并给出 owner=`one-person-lab`、`write_permitted=false`、required input=`OPL provider attempt, lease, or closeout receipt binding` 的 execution-authorization blocker。fresh OPL evidence-worklist 仍只暴露 `current_owner_delta_owner_answer_or_typed_blocker_required`，owner=`medautoscience`，accepted answer shape 为 `domain_owner_receipt_ref`、`quality_gate_receipt_ref` 或 `typed_blocker_ref`。这确认 OPL authorization gate 已生效，但没有产生 MAS stage-native `handoff_owner_receipt.json` 或 `receipts/typed_blocker.json`，也没有把 publication handoff owner answer 关闭。

2026-06-05 Stage Native follow-up 把 MAS Stage Native State Machine / StageRun Kernel 设计、RCA stage-artifact 经验和 OPL Foundry target architecture 合并为 family 级推广方案：[OPL Stage Native Kernel 推广方案](./opl-stage-native-kernel-rollout-plan.md)。该方案把下一轮结构目标固定为 `Stage Folder + stage_manifest + role artifacts + owner receipt / typed blocker + minimal StageRun state`。推广对象是 OPL Stage Native Kernel，不是 MAS controller redesign；OPL 基座只持有 StageRun、manifest、attempt/lease/retry、event log、read-model rebuild、App/workbench projection 和 conformance validator，domain agents 继续持有 stage semantics、quality gate、domain owner receipt、typed blocker、artifact authority 和领域判断。本轮 OPL 标准层 machine surface 已进一步落地：`stage-manifest.schema.json`、`role-artifact-ref.schema.json`、`stage-owner-receipt.schema.json`、`stage-typed-blocker.schema.json`、`opl stage validate --json`、以及 `opl agents conformance` 的 `stage_run_kernel_profile_checks` 和 `stage_run_canary_evidence_checks` 已进入源码/合同/测试；MAS/MAG/RCA/OMA 的 domain-owned `contracts/stage_run_kernel_profile.json` 与 controlled `contracts/stage_run_canary_evidence.json` 由同一 family conformance gate 验证。Controlled canary evidence 只证明 candidate generation、reflection / review、comparative selection、evolution / revision、meta-review 和 independent quality gate 的 refs-only closeout 形态已统一，不声明 DM002 / DM003 live paper line、grant stage、visual stage、target-agent stage、quality verdict、artifact ready 或 production ready。App/operator StageRun cockpit projection 已从 `current_owner_delta` 派生并进入 `opl app state --profile fast --json` 的普通读面。MAS DM002 / DM003 live canary 已关闭 stage-native missing-output tail并暴露 terminal publication owner gate；MAS repo 已补齐 terminal publication handoff owner callable，下一步变成让 live owner route 产生 publication handoff receipt、typed blocker、human gate 或 route-back evidence。补偿链退役、MAG/RCA/OMA live canary 和 production evidence 仍按下方证据差距推进。

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

本轮 purpose-first 落地后，这个读法已经有机器守门：`surface-budget-policy.json` 的 `attention_entry.default_operator_payload` 固定为 `current_owner_delta`，`opl app state --profile fast --json` 的 `operator.default_read_surface_policy` 固定首屏消费 `opl_current_owner_delta`，`operator.stage_run_cockpit` 和 `operator.workbench.stage_run_cockpit` 固定从同一 `current_owner_delta` 派生 `stage_run_current_owner_delta`、launch admission、closeout admission 和 refs-only authority boundary。`compact_owner_delta_projection` / `opl_compact_owner_delta_projection` 已从 active/default surfaces 退役；audit count、raw refs 和 full-detail refs 只进入显式 `current_owner_delta_read_model` / full-detail diagnostic。`runtime_tray_snapshot`、raw evidence envelope、stage replay body、private residue inventory 和 provider internal ledger 只允许作为 `--profile full` / lazy diagnostic detail，不进入普通 App/shell 默认状态。

Current owner-delta live follow-through 进一步收薄默认读面：`current_owner_delta` 自身必须暴露与派生 default next action 同源的 `owner/current_owner/domain_id/stage_id/payload_requirement/required_return_shapes/accepted_answer_shape` 字段；当前 owner 是 `medautoscience`，accepted answer shape 是 `domain_owner_receipt_ref`、`quality_gate_receipt_ref` 或 `typed_blocker_ref`。OPL 可见的 `provider-worker:temporal:start` 只属于 provider health / provider lane；它可以改善 worker lifecycle，但不能关闭 MAS owner delta、不能签 owner receipt、不能创建 MAS typed blocker，也不能作为 domain ready、App release ready 或 production ready 证据。

Fresh `opl agents conformance --family-defaults --json` 的 structural conformance 目标是 `4/4 passed`、`blocked_count=0`，且每个 domain report 都必须同时通过 `stage_run_kernel_profile_checks`、`stage_run_canary_evidence_checks`、private surface guard 和 production evidence tail 分账。当前唯一 ordinary default route 分别是 MAS `direction_and_route_selection`、MAG `call_and_candidate_intake`、RCA `source_intake`、OPL Meta Agent `intent-intake`；`production_evidence_tail_count=4` 仍独立报告，不作为 structural pass 条件。该状态说明 cognitive-kernel、tool-affordance boundary、single golden path 和 controlled StageRun canary evidence 的标准接入已经进入可验证主干；真实 owner receipt、typed blocker、human gate、domain quality/export/review verdict 和 production evidence 仍按下方证据差距推进。

2026-06-05 landing tranche 已把这组目标吸收回各 owner repo：App repo 增加 ordinary cockpit surface budget、Runtime owner-action 字段、first conversation warmup 和 Full runtime native trust / release-boundary gate；Aion shell 等待 ACP warmup 后再发送首条 initial message，并在安装 Full runtime payload 时处理 macOS quarantine；MAS 把 AI reviewer record-only handoff、request persistence、provider admission 和 terminal `publication_handoff_owner_gate` 拆成 owner-currentness / owner-receipt / typed-blocker 可验证模块；MAG/RCA/OMA/OPL Doc 只做 docs lifecycle / no-authority / provenance demotion。该 tranche 关闭的是 default path、contract guard、terminal handoff callable 和 support-entry 降噪，不关闭 MAG/RCA/MAS/OMA physical delete、真实 live domain owner receipt、human gate、review/export verdict、long-soak 或 App release-ready。

Follow-on gate 的当前口径已经收敛为三类 owner delta：OMA script-to-pack 与 policy contract 属于 `meets_target` 的结构守门；MAG / RCA retained wrapper 与 physical morphology 仍按 `needs_retirement` 的 owner-receipted cleanup gate 推进；App release/user-path 只保留为 release owner evidence tail，不进入 ordinary cockpit 或 family completion。具体 receipt、cohort、script path、commit id 和 closeout 流水回对应 repo history、runtime ledger 或 live contracts/source/tests 读取；本页只保留当前 owner、完成口径和仍未闭合 gate。

Unified owner-delta 仍按 live 机器面读取，不从本页继承旧 counters。若 fresh readiness 指向 MAS/domain/App/live owner，OPL 只能记录或验证 refs-only payload、typed blocker 或 owner-chain support refs；不能自造 MAS owner receipt、typed blocker、owner-chain ref 或 no-regression ref。平台 currentness、gate replay、provider dispatch 和 monitoring 修复只改善 owner route，不关闭 MAS paper owner receipt、publication ready、current package、App release ready 或 production ready。具体 worklist 数字、safe-action id、receipt ref 和 closeout 流水每轮都必须从 live 命令读取。

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
| `app_workbench_runtime` | `app_operator_stage_run_cockpit_projection_available`。App/workbench 能消费 provider readiness、stage attempt、StageRun cockpit、route graph、workorder、SLO、repair、source/artifact/memory refs 和 owner-aware action；StageRun cockpit 只从 `current_owner_delta` 派生 launch/closeout/advisory/authority 投影。 | OPL App + OPL product surface | App 只展示和介入，不持有 runtime truth、domain truth、release verdict、owner receipt、typed blocker 或 artifact authority；App release truth 回 App 仓合同、release artifact 和实机 evidence。 |
| `domain_private_residue_retirement` | `active_cleanup_guard`。旧 repo-local scheduler、runner、session store、status/workbench shell、sidecar、generic wrapper、compat path 只能作为迁移输入、diagnostic 或 history/tombstone。 | OPL cleanup gate + domain owner | 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 与 provenance 后直接删除或 tombstone；不新增兼容入口。 |
| `docs_lifecycle` | `active_docs_not_ledger`。Core five、active plan、reference、history 的职责已经明确，但 active 文档仍需持续防止 dated evidence 和长清单回流。 | OPL docs governance | Active 只保留 owner / current state / gate / next action；dated proof、coverage tranche、receipt 流水、branch/worktree closeout 进入 `docs/history/**`。 |
| `ideal_operating_model_redesign` | `active_support_landed_with_cross_repo_tranche_and_terminal_handoff_callable`。跨 OPL/App/MAS/MAG/RCA/OMA/support repo 的理想 operating model 已按 `目的反推必要性，MVP 检查阻碍性` 折成 `meets_target` / `needs_demotion` / `needs_retirement` 审计口径，并完成本轮 App cockpit guard、MAS owner-currentness、MAS terminal handoff callable、support entry demotion 和 active line consolidation。 | OPL Framework + domain/App owners | 后续只保留 domain owner evidence、App release/user-path cohort、OMA script-to-pack machine gate、support no-authority no-resurrection tail；不新增第二 worklist、第二 App bridge 或第二 Agent Lab。 |

## Redesign Backlog 状态

| lane | 状态 | 当前 owner | 下一步 |
| --- | --- | --- | --- |
| `summary_de_noise` | `meets_target_for_framework_default`。App fast state、Aion shell default payload 和 surface-budget contract 已把首屏答案收敛到 owner delta / next action / hard gate；`count_summary` 只作为 diagnostic-only answer。 | OPL Framework | 后续新增 summary 必须继承同一 policy；raw count、replay、typed-blocker group 和 private residue 不能回到 first screen。 |
| `current_owner_delta_cutover` | `meets_target_for_default_root`。`current_owner_delta` 是 App/CLI/operator 默认 root；`compact_owner_delta_projection` 不再作为 active compatibility alias，audit/full-detail refs 由 `current_owner_delta_read_model` 承载。当前 `current_owner_delta` 与派生 default next action 已同源暴露 owner、domain、stage、payload requirement 和 accepted answer shape，避免 operator 看到 null alias 或只看到 strict typed-blocker fallback。 | OPL Framework | 继续让 downstream App contracts 和 support shell 消费 `current_owner_delta`，不再推广 `compact_*` 命名；broader domain success refs 只表达 accepted owner answer shape，不授予 OPL receipt/blocker authority。 |
| `active_line_consolidation` | `meets_target_for_docs_owner`。`current-state-vs-ideal-gap.md` 是唯一 active owner；路线图、production closure matrix、purpose-first audit、target architecture、ideal operating model、docs portfolio 和 private platform inventory 只保留 active support / support index / classification role。 | OPL docs governance | active docs 只写当前 owner / gate / next action；support docs 不维护独立 backlog、执行顺序、dated counter 或 worktree closeout；dated proof、receipt 流水和 closeout 进 history 或 runtime ledger。 |
| `domain_wrapper_delete_gate` | `needs_retirement_with_false_positive_guards`。Machine-readable delete gate 已有；MAG cleanup-complete overclaim 已降级为 owner-receipted cleanup readiness，RCA retained wrappers 已确认 delete-auth false / safe-to-delete false，MAS owner-currentness 已推进；fresh default-caller audit 显示 no-forbidden-write 与 tombstone/provenance refs 已 observed，但 `physical_delete_authorized=false` 仍是硬门，没有任何 surface 可由 OPL 本轮直接物理删除。 | OPL cleanup gate + domain owners | 逐 surface 跑 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance；MAG/RCA/MAS 必须先给出 owner cleanup receipt、typed blocker、no-regression 或 live owner answer，再删除或 tombstone。 |
| `real_owner_delta_tail` | `needs_domain_owner_evidence_tail`。MAS Stage Native live canary 已把 DM002 / DM003 stage artifact read-model 推进到 terminal publication handoff owner gate；MAS main 已补齐 `publication_handoff_owner_gate` callable，使该 owner action 能返回 stage-native owner receipt 或 typed blocker；MAS domain-dispatch refs-only payload batch 已按 typed-blocker path 通过 OPL dry-run、record 和 verify，fresh worklist 不再暴露 open domain-dispatch safe action / workorder。2026-06-06 fresh apply/readout 显示两篇 `active_run_id=null`，MAS apply 只写出 `opl_execution_authorization_required` supervision execution record，`action_class=observe_only`、`will_start_llm=false`、`write_permitted=false`，没有写出 MAS `handoff_owner_receipt.json` 或 `receipts/typed_blocker.json`。当前 default owner delta 仍指向 `medautoscience / domain_owner/default-executor-dispatch`，accepted answer shape 是 `domain_owner_receipt_ref`、`quality_gate_receipt_ref` 或 `typed_blocker_ref`；`provider-worker:temporal:start` 只是 provider lane action，不是 MAS owner-delta closure。 | MAS/MAG/RCA/OMA domain owners | MAS 下一步是先提供 OPL provider attempt、attempt lease、execution authorization decision 和 closeout receipt binding，再让 live owner route 产出 `publication_handoff_owner_receipt_or_typed_blocker` / human gate / route-back evidence，并证明 StageRun status、stage manifest、MAS receipt/blocker 和 `study progress` 四者一致；MAG/RCA/OMA 下一步是真实 grant/visual/target-agent owner receipt、typed blocker、human gate、review/export receipt、no-regression 或 long-soak refs。下一个 OPL safe action 若仍指向 domain live payload，必须由 domain owner 提供可记录 ref。 |
| `app_contract_compaction` | `meets_target_for_contract_guard` / `needs_release_user_path_evidence`。App ordinary cockpit surface budget、Home/Runtime/Settings budget refs、Runtime next owner / accepted answer shape / artifact-or-blocker 字段和 active-shell/release-boundary guards 已落地；release-owner typed blocker path 已成为 App contract 字段并由 validator/test 守门；latest stable `v26.6.3` 不能按合同口径声明 release-ready，因为远端 verifier 缺 gatekeeper/native-trust assets，且本地没有完整 same-cohort release evidence bundle / VM smoke / operator evidence / release-owner refs。 | One Person Lab App | 新 App release cohort 继续提供 release package、screenshot、reload/first-run、provider linkage、operator evidence 和 release-owner blocker/receipt refs；release detail 不进入 ordinary cockpit。 |
| `oma_script_to_pack_hygiene` | `meets_target_for_script_gate_coverage`。OMA docs 已改成 fresh-read / live evidence / no second Framework 口径；repo-local TS scripts、developer work-order policy、standard Foundry policy bundle 和 stage-decomposition parts 已进入 contract-backed / split-part machine gate。 | OPL Meta Agent + OPL Framework | 后续新增或继续稳定下来的 policy 继续进入 `agent/`、contracts、authority functions 或 OPL primitive；retained helper/materializer 退役仍需 OPL primitive parity、no-active-caller、no-forbidden-write 和 tombstone/provenance refs，新增/收薄脚本必须更新 machine gate。 |
| `support_entry_clarity` | `meets_target_for_support_entry_boundary`。Aion shell 已按 App contract carrier 处理 initial-message warmup / Full runtime trust；OPL Doc 强化 doctor/profile/family-plan no-authority boundary。 | App shell / OPL Doc support owners | support repo 保持不反向定义 OPL/App/domain truth；后续只防止 implementation detail 或 doctor-clean 重新进入 readiness 叙事。 |

## 测试 / 证据差距

| gap | 仍缺什么 | 完成口径 |
| --- | --- | --- |
| `domain_owner_chain_scaleout` | 真实 MAS paper、MAG grant、RCA visual 和 OMA target-agent stage 在 OPL-hosted path 下持续返回 owner receipt、typed blocker、human gate、quality/export/review receipt 或 no-regression evidence。 | Domain-owned receipt / typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `stage_artifact_unit_domain_adoption` | MAS `stage-artifact-materialize` 已成为当前首个真实 stage-native materializer；2026-06-05 DM002 / DM003 live canary 已把 8 个 stage-native artifact unit 推进到 terminal `08-publication_package_handoff`，stage folder projection 指向 `publication_gate_owner / publication_handoff_owner_gate`；MAS main 已补齐该 action 的 owner callable、route、policy、lifecycle contract 和 focused tests；OPL refs-only domain-dispatch payload batch 已 record/verify。MAG/RCA/OMA 已补齐 advisory cognitive-kernel adoption、tool affordance refs、golden path profile 和 stage-level independent gate policy。 | MAS stage folder closure、terminal owner callable 和 OPL refs-only dispatch transport 只关闭 missing-output / missing-callable / recordability tail；terminal publication handoff 是否完成仍必须回 MAS live owner receipt / typed blocker / human gate。MAG/RCA/OMA 下一步是把这些 stage-internal declarations跑成真实 owner receipt / typed blocker / no-regression evidence，而不是再补 generic wrapper。 |
| `stage_native_kernel_rollout` | `opl_standard_layer_machine_surface_landed` / `four_domain_stage_run_profiles_landed` / `four_domain_controlled_canary_evidence_landed` / `app_stage_run_cockpit_projection_landed` / `opl_execution_authorization_gate_landed` / `mas_live_stage_artifact_terminal_handoff_gate_landed` / `mas_terminal_handoff_callable_landed` / `mas_domain_dispatch_refs_only_recordability_landed` / `needs_live_owner_evidence_and_compensation_retirement_tail`。OPL family 已有 Stage Folder / State Index / current_owner_delta / golden path / conformance 基础；本轮新增 StageRun Kernel contract、refs-only read-model rebuild primitive、stage_manifest / role artifact / owner receipt / typed blocker schemas、`opl stage validate --json`、StageRun profile conformance gate、controlled canary evidence conformance gate、anti-bloat launch/default-surface gate、fast-lane contract tests、App/operator StageRun cockpit 投影和 execution authorization / closeout receipt binding gate，OPL 标准层已明确 StageRun spec/status/event-log/projection、observed_generation、retry budget、hold scope、manifest/role/receipt/blocker shape、candidate / reflection / ranking / revision / meta-review / independent gate refs、launch/closeout admission 分层、execution authorization blocker、App refs-only boundary 与 domain adoption 边界。MAS/MAG/RCA/OMA 均必须声明 domain-owned `contracts/stage_run_kernel_profile.json` 与 controlled `contracts/stage_run_canary_evidence.json`，并通过 family conformance；这些仍不声明 publication verdict、grant stage、visual stage、target-agent stage 完成或 production ready。真实 live publication owner evidence、MAG/RCA/OMA live domain canary 和补偿链退役仍未作为统一 family 执行模型彻底闭合。 | Controlled canary evidence 关闭“认知计算证据形态”缺口；App StageRun cockpit 关闭“普通 operator 能否消费 StageRun current owner delta / admission / authority boundary”缺口；OPL execution authorization gate 关闭“launch-hard / closeout-binding 缺失时是否可机器阻断并投影”的缺口；MAS DM002/DM003 live canary 关闭 stage-native missing-output tail并暴露 terminal owner gate；MAS terminal handoff callable 关闭 missing-callable tail；MAS domain-dispatch refs-only batch 关闭 OPL recordability tail。真实 domain progression 仍要用 MAS live publication owner receipt / typed blocker、RCA reference、MAG grant-stage light canary、OMA generality canary 产生 domain-owned owner receipt / typed blocker / no-regression evidence。满足 role artifact / owner receipt / typed blocker / no-active-caller / tombstone gates 后退役对应旧 progress/read-model/controller compensation path。新增 StageRun / conformance / App surface 必须维持 launch blockers、closeout blockers、execution authorization blockers、closeout binding blockers、advisory warnings、route-back recommendations、audit drilldown refs 和 forbidden authority flags 分层，不能把 context completeness、controlled fixture、App projection、OPL execution blocker 或 diagnostic evidence 升级成 live progress。 |
| `memory_artifact_lifecycle_apply` | 真实 memory retrieval/writeback、accepted/rejected receipt、artifact mutation receipt、package/export lifecycle receipt、cleanup/restore/retention 对账。 | Domain-owned surface 产生真实 memory/artifact/lifecycle receipts；OPL 不保存 body、不判定 verdict。 |
| `provider_long_soak` | Temporal service/worker、provider cadence/capability、domain owner-chain dispatch 和 retry/dead-letter 在更长窗口内持续满足，并能暴露 blocker。 | Long-soak refs、provider state linkage、operator evidence refs 或 typed blocker refs 可重复 record/verify；不外推为 production ready。 |
| `app_release_user_path` | App 已新增 first conversation warmup、Full runtime native trust 和 release-boundary gate；release-owner typed blocker path 已 contract-backed；latest stable `v26.6.3` 仍缺同 cohort 远端 gatekeeper/native-trust assets、完整 `release-evidence/<version>/` bundle、VM/user-path/operator evidence 和 release-owner receipt / typed blocker refs。 | App release/user-path refs 只关闭 cohort evidence gate；release-ready verdict 回 App release 流程。 |
| `no_resurrection` | 后续代码和文档不重新引入 retired executor / entry / local-manager vocabulary、compat alias、facade、wrapper、old CLI alias 或 compatibility-only tests 作为 active surface。 | Focused guard、docs scan、contract/source tests 和 review 一起阻断旧路径复活；保留的旧词必须处在 history/provenance/negative-guard 语境。 |

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
   rtk opl runtime app-operator-drilldown --json
   rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
   rtk opl agents conformance --family-defaults --json
   rtk opl agents default-callers --family-defaults --json
   ```

- Parallel execution discipline: 对互不冲突、写集可隔离、不会阻断当前
  critical path 的审计、实现、验证或 docs foldback lane，优先使用 subagent +
  独立 worktree 并行推进；subagent prompt 首行必须写清任务、cwd、权限、
  source of truth 和停止条件。主会话必须核查 diff、live evidence、验证输出
  和残余风险，吸收回 main 后清理 worktree / branch / thread；不能把 subagent
  完成报告当作 owner receipt、domain verdict、delete authority 或最终验收。

- Required actions:
  1. 若有 OPL 可执行 safe action，优先推进 owner-delta：domain / human / App /
     provider owner 必须给出 deliverable delta、owner receipt、typed blocker、
     quality gate receipt、no-regression ref 或 long-soak ref。
  2. 若当前工作是 domain stage artifact materialization，先证明 refs-only、manifest、owner receipt、bounded source refs、domain authority index record 和 nonterminal closeout 语义；然后再回到 paper / grant / visual / agent owner-route gate，不能把 stage folder closure 写成终局 ready。
  3. 若当前工作是 StageRun Kernel / conformance / App cockpit surface，先保持 launch admission、execution authorization、closeout admission 与 closeout receipt binding 分层：strategy refs 缺失只进 advisory / route-back；identity、owner、scope、executor、authority、required role slot、receipt/blocker shape、forbidden write 或 replay/audit lineage 缺口阻断 launch；provider attempt、attempt lease、execution authorization decision、workspace/artifact scope、source fingerprint、idempotency 缺口阻断 execution authorization；role artifact、manifest、owner receipt / typed blocker、current pointer、hash、generation 或 lineage 缺口阻断 closeout；closeout receipt 必须绑定 StageRun、stage manifest、current pointer 和 source fingerprint。
  4. 若没有 OPL safe action，只能把 blocked refs-only attention 写成等待 owner
     或 typed blocker，不写成完成。
  5. 若发现 active source 或 active docs 重新保留旧 wrapper、facade、alias、
     compat path 或 retired entry/runtime vocabulary，按 direct
     retirement 处理：迁移 caller，删除旧面，必要 provenance 归 history/tombstone。
  6. 若本轮只做 docs 治理，更新 active truth、coverage ledger、未覆盖清单、
     保留理由和下一轮写入范围；不要新增 Markdown 措辞测试。
  7. 每个新发现的优化项必须按 `meets_target` / `needs_demotion` /
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
