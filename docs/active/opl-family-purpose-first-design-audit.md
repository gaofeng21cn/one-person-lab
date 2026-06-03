# OPL 系列目的优先设计审计

Owner: `One Person Lab`
Purpose: `purpose_first_design_audit`
State: `active_audit`
Machine boundary: 本文是人读顶层设计审计和优化矩阵。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/release evidence、真实 workspace evidence 和 repo-native verification。
Date: `2026-06-03`

## 审计问题

本次审计按 `TASTE.md` 的 purpose-first / executor-first / owner-delta-first 原则，从目标态反推，而不是从现有目录、历史实现、shell、状态面板或证据账本反推。

目标态如下：

- `OPL Framework` 是完整 stage-led 智能体开发/运行框架。
- `One Person Lab App` 是普通用户工作台和 Codex App wrapper。
- `MAS`、`MAG`、`RCA`、`OMA` 是标准 OPL Foundry Agent。
- `opl-aion-shell` 和 `opl-agui-codex-shell` 是可替换 GUI implementation carrier。
- `opl-doc` 和 `opl-flow` 是本机/OPL-native 支撑工具，不持有 runtime truth 或 domain truth。
- `gflab_web` 是外部公开网站/同步面，不持有 OPL family 机器真相。

判断标准是：如果从目标重新设计，是否还需要这个层级、这个壳、这个读面、这个证据尾项；还是可以更直接地用 domain pack、OPL hosted runtime、domain authority receipt、typed blocker、App compact projection 和 owner route 达到目的。

本轮只做顶层设计审计和优化路线。当前多个 sibling repo 带有未提交改动、ahead/behind 或生成物脏状态；本审计不修改 sibling repo，也不把 dirty working tree 当作已合并事实。

## 2026-06-03 Fresh Snapshot

### Repo 状态 caveat

- `one-person-lab`：`main...origin/main`，存在非本轮创建的 `src/opl-meta-agent-consumption.ts` 修改和 `src/opl-meta-agent-consumption-boundary.ts` 未跟踪文件。
- `med-autoscience`：`main...origin/main`，clean。
- `med-autogrant`：`main...origin/main`，clean。
- `redcube-ai`：`main...origin/main [ahead 10, behind 3]`，且有 `.agents/plugins/marketplace.json` 删除、`scripts/install-codex-plugin.ts` 修改和 `.agents/` 未跟踪。
- `opl-meta-agent`：`main...origin/main`，clean。
- `one-person-lab-app`：`main...origin/main`，有 App contract / Runtime page / active-shell validation / release tests 相关本地改动。
- `opl-aion-shell`：`main...origin/main`，有 App profile、Runtime page、Team redirect、i18n 和 unit test 相关本地改动。
- `opl-agui-codex-shell`：`main`，clean。
- `opl-doc`：`main...origin/main`，有 README、docs、doctor、skill、tests 本地改动。
- `opl-flow`：`main...origin/main`，有 README、profile sync、templates、tests 本地改动和新增脚本。
- `gflab_web`：`main...origin/main [behind 2]`，有 tracked `__pycache__` 修改。

这些状态只影响本轮审计可信边界：只读观察可以使用；跨仓落地必须独立 lane、保护脏改动并由各仓 verification 接收。

### OPL live 读数

- `./bin/opl agents conformance --family-defaults --json`：`total_repo_count=4`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`，production evidence tail 仍单独报告。
- `./bin/opl agents descriptors --json`：4 个 descriptor resolved，0 blocked；`production_closure_gap_count=20`，`provider_temporal_residency_gap_status=requires_provider_repair`；`functional_privatization_active_private_generic_residue_count=0`；audit-only private residue inventory 为 38，`physical_delete_authorized=false`。
- `./bin/opl agents default-callers --family-defaults --json`：32 个 generated/default caller surface，0 blocked；domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 缺口均为 0。该读数证明 deletion-evidence surface clean，不授权 domain repo 物理删除。
- `./bin/opl agents platform-surfaces --family-defaults --json`：4 仓通过，0 blocked；7 个 generic subdomain 被 OPL owner surface 覆盖，显式 forbidden owner claim 为 0。
- `./bin/opl framework readiness --family-defaults --json`：`status=needs_domain_or_app_live_owner_payload`，`current_operator_action_state=needs_domain_or_app_live_owner_payload`，`next_owner=medautoscience`，`next_required_delta=domain_owner_receipt_quality_gate_or_typed_blocker_required`。authority flags 全部保持 false：不能执行 domain action、写 domain truth、创建 owner receipt、创建 typed blocker、关闭 domain ready 或 production ready。
- readiness owner-delta summary：`open_safe_action_item_count=61`，`open_safe_action_payload_required_item_count=58`，`evidence_envelope_open_count=58`，`evidence_envelope_blocked_count=2007`，`stage_replay_missing_receipt_workorder_count=14`，`domain_dispatch_workorder_count=58`。
- `./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：`status=operator_safe_action_available`，`progress_delta_classification=operator_action_pending`，`platform_repair_delta=opl_operator_or_provider_supervision_delta_available`，open safe action 为 61，payload-required 为 58，blocked refs-only envelope 为 2007，typed blocker refs 为 337。`zero_open_worklist_is_completion_claim=false`、`zero_open_worklist_is_domain_ready=false`、`zero_open_worklist_is_production_ready=false` 仍是固定边界。
- `./bin/opl runtime app-operator-drilldown --json` 默认输出仍非常重：同一轮可见 `stage_attempt_count=25`，`operator_action_route_count=378`，`operator_executable_route_count=125`，`domain_dispatch_evidence_current_default_actionable_attempt_count=57`，`evidence_envelope_open_count=57`，`evidence_envelope_blocked_count=2008`，`current_control_state_running_provider_attempt_count=1031`，running provider domain 为 `medautoscience`。该命令也显示 App release user path 和 OMA production consumption 可读，但 authority boundary 仍禁止写 domain truth / memory body / artifact body / quality verdict / export verdict。
- `./bin/opl app state --profile fast --json`：`schema_version=opl_app_state.v1`，fast state 已提供 `summary_cards`；本轮 `active_project_count=0`、`task_drilldown_count=0`、`active_project_ref_count=0`。这正好说明 App fast state 与 provider attempt raw count 是两种层级，默认 App 面应走 user-task-status compact projection，而不是把 1031 个 provider attempt 直接解释成用户 running task。

### 相比 2026-06-01 的变化

- owner-delta-first 已经成为 OPL readiness 的一等字段：现在能直接读出 next owner 是 `medautoscience`，required delta 是 domain owner receipt / quality gate / typed blocker。
- 结构层更清楚：conformance、descriptors、default-callers、platform-surfaces 都证明 MAS/MAG/RCA/OMA 的标准结构没有 blocker。
- 默认读面仍偏重：`app-operator-drilldown` 和 full evidence worklist 仍暴露大量 refs、payload template、typed blocker refs 和 action route。对审计有用，对普通 operator / App 首屏过重。
- JSON shape 已出现漂移：旧文档里常用的 jq path 已不稳定，当前 top-level 分别是 `standard_domain_agent_conformance`、`family_agent_descriptors`、`framework_readiness`、`family_runtime_evidence_worklist`、`app_operator_drilldown`、`agent_default_caller_readiness`、`agent_platform_surface_ownership`。长期优化应提供 shape-stable compact alias，而不是让 agent 从 raw drilldown 猜路径。
- 当前真实阻塞不在“是否有 OPL Framework”，而在 MAS live owner delta：58 个 domain-dispatch payload-required workorder 都需要 domain/App/live owner 产出真实 receipt / no-regression / owner-chain refs，或 domain-owned typed blocker。

## 总体判断

当前 OPL family 的顶层方向已经正确：`OPL Framework -> One Person Lab App -> Foundry Agents`。真正可优化的是减法和默认路径收敛。

不需要继续增加中转入口、第二读模型、第二 workflow runner、domain-local scheduler、repo-local session store、App-owned runtime truth、shell-owned product policy 或 OMA-owned promotion gate。现有 OPL/Temporal + stage pack + domain authority receipt / typed blocker 已足够表达目标态。

最值得优化的顶层设计是：

1. 默认读面只回答当前 owner、required delta、accepted payload shapes、readiness false flags 和少量 count summary。
2. raw refs、stage replay packet、typed blocker refs、private residue、payload templates 和 full route list 只在 explicit full-detail / audit drilldown 展开。
3. domain repo 继续收薄为 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions + domain handler target / refs-only return shape`。
4. App 首屏继续向用户任务和下一步 owner action 收敛，不把 provider attempt、ledger、Temporal、projection、stage attempt 当成普通用户词汇。
5. Shell repo 和 candidate repo 只做实现承载，产品真相留在 App repo。
6. OMA 只做 target-agent foundry / repair / takeover 语义，不成为 Agent Lab、registry、runner、promotion gate 或 target truth owner。
7. OPL Doc / OPL Flow 只做文档治理和工作流 profile，不拥有任何项目 truth。

## 设计负担分类

| 设计负担 | 现在为什么存在 | 从目标态看是否必要 | 优化方向 |
| --- | --- | --- | --- |
| Full-detail private residue inventory | 证明旧私有平台面已分类、可追踪、默认不行动 | audit 必要，默认不必要 | 默认只显示 action-required / blocker / physical-delete-ready；38 项 inventory 只在 full-detail。 |
| 大量 refs-only envelope / typed blocker refs | 防止 OPL 越权，把所有缺 owner evidence 的位置暴露出来 | audit 必要，普通 operator 默认不需要逐条看 | 按 owner / stage / required delta 聚合，raw item 下沉。 |
| Stage replay missing receipt workorder | 证明 replay、human gate、owner receipt 缺口没有被假闭合 | 必要，但不应像普通可执行工作项 | 默认写成“等待 domain/human owner receipt 或 typed blocker”，不进入 completion 口径。 |
| Domain repo product/status/workbench/lifecycle shell | direct path、迁移期、handler target、refs-only adapter | 长期不是标准 agent 组成 | replacement parity、no-active-caller、owner receipt/typed blocker、no-forbidden-write 后删除或 tombstone。 |
| App release / user-path evidence | 证明 App cohort、first-run、release 路径可用 | App release 必要，对 domain ready 不必要 | 保持 App-owned release gate；禁止外推为 family production ready。 |
| Shell candidate / upstream implementation detail | 尝试更好的 GUI carrier | 产品 truth 不必要 | App repo 持有 contract；shell 只实现、验证、可替换。 |
| OMA materializer scripts | 当前承担 agent-building pack、work-order、evidence materialization | helper 必要，runner / gate 不必要 | 稳定 policy 上收回 `agent/`、`contracts/`、`runtime/authority_functions/` 或 OPL primitive。 |
| Workflow/doc profile plugins | 新机器 setup、repo profile sync、docs lifecycle governance | 支撑协作必要，项目 truth 不必要 | 只写 profile pointer / managed block / docs lifecycle evidence，不持有 runtime/domain/product truth。 |

## 每仓审计

### one-person-lab

目标角色：OPL Framework / runtime / contracts / generated surfaces / App/operator read model owner。

当前结构是正确的：Temporal-backed provider、typed queue、stage attempt ledger、evidence ledger、descriptor、conformance、default-caller readiness、App/operator drilldown 和 Agent Lab 都已形成 framework control plane。fresh machine readout 证明 4 个标准 agent structural conformance clean，default-caller deletion-evidence clean，platform surface ownership clean。

当前不优雅的地方是默认读面还没有完全匹配目的。框架已经能回答 owner-delta，但 full readiness / app drilldown / evidence worklist 仍把大量审计细节、payload template、typed blocker refs 和 route count 放在 agent 默认路径附近。2026-06-03 已落地稳定 `compact_owner_delta_projection` / `opl_compact_owner_delta_projection` 作为默认 compact alias：

- `current_owner`
- `required_delta`
- `accepted_return_shapes`
- `next_safe_action_or_none`
- `readiness_false_flags`
- `count_summary`
- `full_detail_refs`

已落地：

- `framework readiness` 顶层和 `attention_first_payload` 同源暴露 `compact_owner_delta_projection`。
- `family-runtime evidence-worklist` summary/full 同源暴露 `compact_owner_delta_projection`，默认 `next_safe_action_or_none` 不内嵌 raw `payload_template`。
- `runtime app-operator-drilldown` summary/full 的 attention payload 暴露同 schema compact alias，full refs 仍只在 explicit `--detail full` 展开。
- `opl app state --profile fast --json` 在 `operator.compact_owner_delta_projection` 和 `operator.workbench.compact_owner_delta_projection` 暴露同 schema idle/normal GUI block，保持 fast 面不拉 full runtime snapshot、不暴露 raw provider attempts。

剩余优化建议：

- 将 `goal_oracle_missing` / `next_forced_delta` 等更细 owner steering reason 继续折进 compact block 的 display/source hint，而不改变 authority false flags。
- 保持 App fast state 与 raw provider attempts 的层级分离：provider attempt count 是诊断，不是用户 running task。

### med-autoscience

目标角色：医学研究 domain truth、publication quality gate、artifact/package authority、memory body/writeback decision、owner receipt 和 typed blocker owner。

MAS 当前是 live next owner。OPL fresh readiness 指向 `medautoscience`，required delta 是 domain owner receipt / quality gate / typed blocker。MAS 文档和状态说明显示，最近实际问题集中在 owner-route currentness、receipt consumption、gate-clearing、AI reviewer record、writer handoff 和 stale provider liveness，而不是缺少 MAS-local scheduler 或更多 status wrapper。

从目标态看，MAS 不应继续深磨通用 dispatcher/currentness/lifecycle 平台。MAS 只需要产生医学实质 delta 或稳定 blocker：paper / artifact / AI reviewer / auditor / human gate / no-regression / owner-chain refs。

已确认可用命令路径：

```bash
cd /Users/gaofeng/workspace/med-autoscience

scripts/run-python-clean.sh -m med_autoscience.cli domain-handler dispatch-evidence-payload \
  --profile <profile.toml> \
  --workorder <opl-domain-dispatch-workorder.json> \
  --format json

scripts/run-python-clean.sh -m med_autoscience.cli domain-handler stage-evidence-payload \
  --profile <profile.toml> \
  --workorder <opl-stage-evidence-workorder.json> \
  --format json
```

这些命令返回 refs-only `owner_receipt_payload_ready` / `typed_blocker_payload_ready` 或 stage-evidence success / typed-blocker payload，交给 OPL `runtime action execute` record/verify。它们不创建 MAS owner receipt、不授权 domain ready / production ready / publication ready / artifact mutation。

优化建议：

- 当前优先级最高是直接关闭 live MAS owner delta：对 payload-required domain-dispatch workorder 返回 MAS owner receipt / owner-chain / no-regression refs，或返回 MAS-owned typed blocker。
- `study_progress` 保持 MAS-owned semantic summary，不成为第二 runtime controller。
- owner-route/currentness 修复应继续压成 `macro_state + owner_route + receipt_or_blocker + evidence_refs`，细分 reason 只作 diagnostic detail。
- 后续减少 receipt reconcile 空转：如果一个 work unit 已被 MAS owner closeout 消费，默认读面应直接显示下一 owner，而不是继续制造同义 dispatch。

### med-autogrant

目标角色：grant truth、fundability / quality / export verdict、package authority、grant strategy memory accept/reject、owner receipt 和 typed blocker owner。

MAG 结构层已对齐 Foundry Agent series。文档明确 `default_task_runtime_owner=one-person-lab`、`default_runtime_substrate=temporal`，MAG 不实现 daemon、scheduler、attempt loop 或 attempt ledger。保留的 product-entry、grouped CLI、domain_handler、lifecycle、autonomy loop、status/user-loop 是 direct handler、refs-only adapter、native helper target 或 migration input。

从目标态看，MAG 的标准 agent 只需要 declarative grant pack、transition oracle、authority functions、domain handler target 和 receipt/blocker return shape。更多 product/status shell 不会让 grant 更 ready。

优化建议：

- `submission_ready_export_gate` 继续作为唯一清晰 human blocker；不新增静态 descriptor 去解释它。
- grouped CLI / product-entry / manifest sustained-consumption 只保留 direct path 与 refs-only owner payload response；App/default caller sustained consumption 稳定后删除兼容壳。
- 不用 package existence、schema completeness、stage replay projection、OPL ledger verification 或 grouped CLI success 表达 grant readiness。
- physical cleanup 只能由 MAG owner receipt / typed blocker + no-active-caller + no-forbidden-write + tombstone/provenance 授权。

### redcube-ai

目标角色：visual truth、communication strategy、visual direction、review/export verdict、artifact authority、visual memory accept/reject、owner receipt 和 typed blocker owner。

RCA 的多 route 不是主要浪费。image-first、HTML、native PPTX、review/export、artifact gallery、workspace receipt、memory reuse、native helper 都服务视觉交付质量，不能用“减少 route”替代设计判断。真正要继续压缩的是 generic session/runtime/workbench/status/domain_action_adapter compatibility residue，以及 naming/contract hygiene tail。

当前 RCA repo 有 ahead/behind 和本地改动，本文只读。现有 docs 已明确 direct route 与 OPL-hosted route 都回到同一 RCA service-safe domain entry；OPL 只消费 refs/projection/provider state，RCA 持有 visual truth 和 artifact authority。

优化建议：

- 保留 visual pack discipline、route policy、review/export gates 和 native helper implementation。
- 将 `runtimeWatch`、session continuity、operator evidence/stability projection 保持 refs-only adapter，等 App/workbench parity 与 no-active-caller 成立后继续收薄。
- Production evidence tail 应直接要求 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout、human review receipt、Temporal visual-stage long soak 或 RCA typed blocker。
- 不恢复 `managed`、gateway、session、domain_action_adapter 旧 alias 为 active payload / callable path。

### opl-meta-agent

目标角色：target-agent builder / tester / repair / takeover agent，输出 developer work order、target capability candidate、mechanism proposal 或 typed blocker。

OMA 已避免 repo-owned generic runtime、generated shell 和 App shell。当前风险来自 `scripts/` materializer、work-order builder、Agent Lab invocation helper 和 stage-decomposition pack draft 继续增长，逐步变成第二 Agent Lab、第二 worktree lifecycle owner 或第二 promotion gate。

从目标态看，OMA 只消费 Agent Lab / target-agent handoff，并把证据变成受限 developer work order、candidate 或 typed blocker。Agent Lab、runtime、registry、promotion gate、worktree lifecycle、generated interfaces 和 App shell 归 OPL Framework；target owner receipt、domain truth、quality verdict 和 artifact authority 归目标 domain agent。

优化建议：

- 将稳定 agent-building policy 迁回 `agent/`、`contracts/` 或 `runtime/authority_functions/`；脚本只做 materializer/helper。
- `execute:external-work-order` 继续薄委托到 OPL work-order execute，不吸收 worktree lifecycle、absorb、cleanup、target owner closeout hook。
- 新 agent consumption evidence 继续扩真实 target cohort，但 scaffold pass、suite pass、generated interface ready 不能写成 default promotion。
- 独立 reviewer attempt 必须成为 patch-loop evidence，不允许同一上下文自审替代。

### one-person-lab-app

目标角色：普通用户 GUI product truth、release/updater/user-path evidence、App-owned contracts 和 active shell validation owner。

App repo 的目标已收敛为 purpose-first Codex App wrapper：固定 Codex CLI executor，内置 MAS/MAG/RCA purpose entries，Runtime 页消费 OPL projection，release / first-run / install exposure policy 归 App。当前本地 dirty diff 也在往 Runtime user-task-status first、App state compact projection、active-shell validation 方向推进；但这些尚未作为 clean mainline 事实读取。

从目标态看，App 不需要 OPL runtime truth、provider implementation、domain truth、quality verdict、artifact authority、memory body 或 owner receipt。App 要回答用户四件事：什么在跑，什么 active/queued，什么需要注意，下一步谁负责。

优化建议：

- Runtime 首页默认消费 `opl app state --profile fast --json`，优先 `summary_cards`、active project/task lines 和 next visible owner action。
- `runtime app-operator-drilldown --detail full` 只做 explicit diagnostic / audit / release evidence，不做 ordinary user first screen。
- App release evidence 继续 cohort-bound；first-run、package、screenshot、runtime bridge proof 不能外推为 family production ready。
- Candidate shell 只通过 App-owned adapter contract、page-state matrix、first-run matrix、package smoke 和 release isolation gate 进入。

### opl-aion-shell

目标角色：当前活跃 GUI shell implementation carrier，可替换。

`AGENTS.md` 和 `docs/guides/opl-app-shell-boundary.md` 已明确 App product truth 归 `one-person-lab-app`。shell 负责 renderer、process、package metadata、tests、release hooks 和 upstream AionUI intake。当前 shell 工作树有 Runtime page、Team redirect、profile 和 i18n 本地改动，本轮只读。

设计负担是 upstream AionUI 的通用 Cowork / multi-agent / backend / Team 叙事仍大量存在于 root README 和 upstream docs 中。作为 implementation carrier 可以保留；作为 OPL App product truth 不应进入普通用户路径。

优化建议：

- OPL-specific 工作继续从 App contracts 开始，再落到 shell implementation。
- 普通用户路径继续隐藏 upstream backend/provider/team/agent selector；Team mode 只保留为 upstream implementation material 或 future App-owned feature 输入。
- 若长期维护该 fork，root README 可增加更明显的 OPL shell boundary entry，减少后续 agent 把 upstream marketing 当成 App 产品真相的概率。

### opl-agui-codex-shell

目标角色：实验性 GUI shell candidate，验证 Electron + CopilotKit + AG-UI event mapping + Codex app-server 路线。

该仓 clean，README 已明确它只在 `OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/agui-codex.json` 时选择，默认 release shell 仍是 AionUI。它消费 `opl app state --profile fast`、`opl system initialize`、explicit full drilldown 和 safe action dry-run；它不拥有 App product truth。

当前值得注意的设计点：candidate 已验证 active project line state-model 和 `.app` bundle gate，但 `src/main/main.js` 集中了 Codex app-server、OPL command bridge、package evidence、UI smoke 和 WebUI bridge 等多类职责。candidate 阶段可以接受；若要升为 active shell，需按职责拆分，避免实现 carrier 自己长成 runtime/product control plane。

优化建议：

- AG-UI / CopilotKit / app-server 只作为 implementation protocol，不进入 ordinary user-visible copy 或 App authority。
- 升级为 active shell 前，拆清 Codex app-server client、OPL state/action bridge、packaged evidence、WebUI bridge、UI smoke runner。
- Adoption 决策只由 App repo adapter contract 和 release gate 决定。

### opl-doc

目标角色：OPL-native documentation steward，治理长期文档生命周期。

`opl-doc` 的定位清晰：doctor、family-plan、native profile sync、OPL series docs governance、Active Truth plan template。它不拥有 OPL series project truth、runtime truth、domain verdict、artifact authority 或 owner receipts。当前 repo 有本地改动，本轮只读。

设计风险是文档治理工具很容易把“发现 stale docs”升级成“自己定义项目事实”。目标态下，OPL Doc 只能帮助 Codex 找 reading order、doc role、stale/retire candidates 和 foldback target；事实仍来自目标 repo 的 contracts/source/runtime/receipts。

优化建议：

- doctor 输出保持 read-only risk map，不变成 task truth 或 production readiness。
- `contracts/opl-native-profile.json` 只声明 profile / docs taxonomy / verification commands，不迁移 domain truth。
- OPL Doc 与 OPL Flow 分层：Doc 管文档生命周期，Flow 管工作流 profile。

### opl-flow

目标角色：Codex workflow profile 和 repo managed block sync。

`opl-flow` 包装 Direct / Inline / Durable、Planner / Executor / Debugger / Verifier、subagent contract、Durable writeback 和 verification-before-completion。它是协作方法层，不是 OPL Framework、App、domain agent 或 docs lifecycle owner。当前 repo 有本地 profile sync 相关改动，本轮只读。

设计风险是 user-level `AGENTS.md` / `TASTE.md` 和 repo managed blocks 影响面很大，容易被误读为覆盖项目事实。目标态下，Flow 只声明工作方式和 profile 指针，不能替代 repo-local contracts/source/runtime output。

优化建议：

- `repo_profile.py sync --apply` 只更新 managed blocks 和 `contracts/opl-native-profile.json` pointer，不改 repo-specific prose truth。
- `TASTE.md` 继续作为偏好，不能覆盖直接用户指令、接口约束、runtime truth 或 business rule。
- Flow 不承载 OPL Doc 的 doc role taxonomy，也不承载 App/domain readiness。

### gflab_web

目标角色：FengGao Lab 网站内容与部署面；不是 OPL runtime / App / domain agent owner。

该 repo 与 OPL family 只存在支撑关系：公开网页、内容同步、可能的 OPL public materials 或自动化登录状态。当前 behind 2，且有 tracked `__pycache__` 修改，本轮不处理。

设计风险是把网站文案或同步脚本当成 OPL 系列当前真相源。目标态下，公开网站可以展示 OPL/实验室内容，但内容事实应从对应 repo 的 public docs、release artifact 或显式生成输入派生。

优化建议：

- 若需要展示 OPL family 公共状态，使用 OPL/App/domain repo 的 public doc 或 generated export 作为输入，不在网站手写第二 truth。
- 清理 tracked `__pycache__` 应作为 gflab_web repo hygiene lane 处理，不能混进 OPL framework 审计。
- 网站同步/auth 脚本只服务发布运维，不进入 OPL runtime/control-plane 设计。

## 优先级建议

### P0：不扩大抽象层

停止新增中转入口、第二 read-model authority、workflow compiler、proof assistant、domain-local scheduler、App-owned runtime truth、shell-owned product truth 或 OMA-owned promotion gate。当前结构已经足够表达目标态。

### P1：稳定 compact owner-delta projection

为 OPL 默认 operator / App / agent 路径提供稳定 compact read model：

- 当前 owner。
- required delta / receipt / typed blocker。
- accepted return shapes。
- next safe action 是否存在。
- readiness / authority false flags。
- 少量 count summary。
- full-detail drilldown refs。

这比继续让 agent 解析 `app-operator-drilldown` 近万行 raw JSON 更直接，也更符合目的优先。

### P2：让 MAS live owner delta 直接闭环

当前 live next owner 是 `medautoscience`。下一轮不应继续先补 abstract accounting，而应让 MAS owner surface 返回真实 paper-line owner receipt / owner-chain / no-regression refs，或 stable typed blocker。OPL 只 record / verify / project，不写 MAS truth。

### P3：domain repo 收薄只认四类保留物

每个 domain repo 最终只保留：

- declarative domain pack。
- machine-readable contracts。
- standard/minimal authority functions and native helper implementation。
- domain handler target / direct skill path / refs-only return shape。

product/status/workbench/session/queue/lifecycle/projection shell 需要证明不能由 OPL generated/hosted surface 承担；证明不了就进入 deletion/tombstone lane。

### P4：App/shell 默认用户体验继续远离 raw telemetry

App 首屏面向任务，不面向 telemetry。Runtime 页面默认不展示 Temporal、provider、ledger、stage attempt、current_control_state、projection 等诊断词；这些进入 secondary disclosure、full detail、release evidence 或 audit。

### P5：支撑工具保持支撑位置

OPL Doc、OPL Flow、gflab_web 不应成为 OPL family truth owner。它们分别承担文档治理、工作流 profile、公开网站/同步支撑。任何跨 repo current truth 都必须回到 OPL/App/domain repo 的 canonical docs/contracts/runtime evidence。

## 不能写成

- Structural conformance passed 等于 production ready。
- Default-callers deletion evidence clean 等于 domain repo physical delete authorized。
- `open_worklist=0` 或 open safe action 变化等于完成、domain ready 或 production ready。
- App release/user-path verified refs 等于 App release-ready 或 family production ready。
- Provider SLO / running provider attempt count 等于 MAS paper closure、MAG submission-ready 或 RCA visual ready。
- Domain-owned typed blocker verified 等于 success receipt。
- Full-detail private platform residue audit-only 等于 physical delete authorized。
- Shell implementation behavior 等于 App product authority。
- OPL Doc / OPL Flow profile pointer 等于 project truth。
- Website public prose 等于 OPL family current runtime truth。

## 执行方式

推荐下一轮执行顺序：

1. 在 OPL 侧先落 compact owner-delta projection / shape-stable aliases，并让 App fast state 和 readiness/worklist 对同一 owner handoff 读法一致。
2. 让 MAS 当前 live owner delta 直接进入 owner receipt / no-regression / owner-chain refs 或 typed blocker path。
3. 各 domain repo 按自己的 active plan 收薄迁移壳，只在 no-active-caller、replacement parity、owner receipt/typed blocker、no-forbidden-write、tombstone/provenance 成立后物理删除。
4. App repo 继续把产品语义写入 contracts，再由 shell 实现；release evidence 和 candidate shell gate 不外推 domain/runtime readiness。
5. OMA 继续扩真实 target patch-loop 样本，但把 Agent Lab / work-order execute / promotion / registry / App shell 留给 OPL。
6. OPL Doc / OPL Flow 只同步 profile / docs lifecycle / managed block，不承载 OPL family current truth。

## 验证入口

本轮审计使用的 live inputs：

```bash
rtk ./bin/opl agents conformance --family-defaults --json
rtk ./bin/opl agents descriptors --json
rtk ./bin/opl agents default-callers --family-defaults --json
rtk ./bin/opl agents platform-surfaces --family-defaults --json
rtk ./bin/opl framework readiness --family-defaults --json
rtk ./bin/opl runtime app-operator-drilldown --json
rtk ./bin/opl app state --profile fast --json
rtk ./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
```

文档变更最小验证：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs/active/opl-family-purpose-first-design-audit.md
```
