# OPL 当前开发线路

Owner: `One Person Lab`
Purpose: `current_execution_map`
State: `active_support`
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-05-24`

## 当前结论

OPL 当前开发继续按 Codex-default、provider-backed、framework-first 执行：先守住 OPL 作为完整智能体开发/运行框架，再让 MAS/MAG/RCA 作为标准 OPL Agents 消费 framework surface，并用真实 domain owner receipt / App evidence / long soak 验收目标结构。

当前 OPL 已有 Temporal provider、stage attempt ledger、typed queue、typed closeout、evidence worklist read model、domain descriptor aggregation、functional runtime harness、generic substrate projection、Agent Lab、pack compiler handoff、external evidence refs-only receipt ledger、App/operator drilldown read model、App runtime 页面消费路径、managed clean runner、`opl system startup-maintenance` App 启动维护机器入口、`opl_managed_module_install_update_ledger`、`opl_oma_app_live_path_ledger`、`opl_oma_production_consumption_ledger`、`opl_app_release_user_path_evidence_ledger` 和 `opl_developer_mode_closeout_ledger`。最新 worklist 读面显示 provider scheduler、legacy cleanup、external evidence request、evidence gate 和 stage evidence accounting 均已进入 refs-only ledger / typed blocker / requirement 口径；具体 workorder、open safe action 和 receipt 数量只从 `opl framework readiness --family-defaults --json`、App drilldown 与 `family-runtime evidence-worklist` 生成读面读取。Framework readiness 默认 summary 也会把 App/operator 的 `domain_dispatch_attention_*` 折叠为 `domain_dispatch_attention_count`，用于提示 owner-chain dispatch 仍需真实 receipt / typed blocker / no-regression / long-soak scaleout，且不授权 domain ready 或 production ready。

当前 App / OMA evidence-after-contract 已向前推进：`26.5.19` App user-path ledger 已验证 release package、provider linkage、真实已安装 App 窗口截图、startup-maintenance / first-run reload-check 和同 cohort long operator evidence；App drilldown / framework readiness 读为 App user-path evidence ready、open gate 清零、当前 typed blocker 计数为 0，同时保持 `release_ready_claimed=false`、`production_ready_claimed=false` 和 `can_close_app_release_user_path=false`。OMA production-consumption follow-through 已消费 managed install/update、App live path、owner receipt / typed blocker scaleout 和 verified long-soak ref，当前 OMA production-consumption ready。上述 ready 只说明对应 refs-only evidence gate 已有 verified refs，不生成 App release ready、family production ready、domain ready、artifact authority 或默认 promotion。Developer Mode closeout 仍保持 full closeout incomplete，因为 fork/PR owner acceptance 还没有 verified live ledger receipt。当前 framework hard blocker 转到 standard-agent conformance：MAS `paper_work_unit_outbox.py` 中 active forbidden-name residue 仍被 `opl agents conformance --family-defaults --json` 读为 blocker。

dated proof、receipt 事件、具体命令输出和阶段 closeout 摘要归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。本文只保留当前顺序和 owner 边界。

当前清理口径按 current source scan 读取：OPL 自身仍持有 `family-runtime*`、Temporal provider、App/operator drilldown、standard conformance、generated surface 和 legacy cleanup guard 等 framework owner surface；这些是目标 runtime/control plane，不是旧兼容面。历史 `gateway` / `frontdoor` / `Hermes-first` / `managed runtime` / compatibility 相关文件只允许留在 `docs/history/**`、contract tombstone、negative guard 或 focused no-resurrection test 中。若某个旧模块、旧接口、旧测试、旧文档入口已经没有 active caller，且 replacement proof / no-active-caller / owner receipt 或 tombstone proof 成立，执行动作是删除、archive 或 tombstone；不新增兼容 alias、facade、re-export wrapper 或 compatibility-only 聚合测试。

## 当前顺序

1. `opl_framework_foundation`
   保持 provider-backed stage runtime、typed queue、attempt ledger、signal/query、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive、safe action shell 和 generated surface 基础。

2. `production_evidence_scaleout`
   保持 `runtime app-operator-drilldown`、`runtime action execute` 和 `family-runtime evidence-worklist` 的 refs-only worklist / typed blocker / workorder 能力，但当前重心转到真实 production evidence、MAS conformance blocker 清理、domain owner-chain、memory/artifact/lifecycle receipt、direct/hosted parity 和 long-soak refs。App release/user path 与 OMA production-consumption 已有 verified long evidence refs；后续 App 路线只追 release-owner boundary，不把 user-path evidence ready 写成 App release ready。OPL 只提供 transport、preflight、ledger、local observation event intake、manifest materialization 和 projection；domain/App/live refs 才能关闭生产可用性。`family-runtime production-closeout` 旧 alias 已退役，不再作为 active interface 或兼容面保留。

   App release/user-path ledger 和 OMA production-consumption ledger 仍保留 `record|verify|list` 与 `long-operator` / `long-soak` observation command set，供未来 cohort 或新 gate 复用。当前 verified receipts 已关闭本轮 App user-path 与 OMA production-consumption gate；recorded 但未 verify 的 receipt 仍只投影为 verify follow-through，typed blocker refs 只说明显式阻塞，operator evidence refs 只作为审计/监控引用。当前 Developer Mode closeout ledger 的 operator CLI intake 是 `opl runtime developer-mode-closeout record --payload <json>`，本地 follow-through 是 `verify` 与 `list`；它只记录或验证 route eligibility、patrol observation、diff、verification、no-forbidden-write、commit 或 fork/PR、external owner acceptance refs，并让 Agent Lab 消费 verified live receipt，不写 owner receipt、不写 managed runtime truth，也不关闭 production-ready verdict。

   Domain-dispatch evidence 已从多轮逐条 route closeout 收敛为当前语义：MAS guarded-apply / owner-route / aftercare / default-executor、MAG grant-stage / lifecycle / legacy route-back、RCA visual-stage typed blocker payload 都能按真实 owner refs 或 typed blocker path 被 OPL safe-action shell 记录和验证，并由 payload preflight 防止跨 attempt / stale payload 误闭合。Fresh `family-runtime evidence-worklist` 读面当前为 `open_worklist_item_count=0`、`closed_refs_only_item_count=178`、`domain_dispatch_evidence_workorder_count=0`、`stage_receipt_freshness_open_workorder_count=0` 和 `open_safe_action_item_count=0`；`framework readiness` 仍保持 `hard_blocker_count=0`、`open_tail_count=0`、`evidence_envelope_blocked_count=169`、`domain_dispatch_attention_count=13`、`total_operator_attention_tail_count=182`、provider cadence / capability SLO satisfied，并明确 `can_claim_domain_ready=false`、`can_claim_production_ready=false`。这些数值只说明 OPL refs-only accounting / identity preflight / ledger transport 可用，不声明 MAS guarded apply、reviewer refresh、MAG grant stage、RCA visual stage、App release/user path、domain ready、visual ready、artifact authority、long-soak 或 production ready。

   具体 stage attempt id、receipt ref、source fingerprint、record / verify 命令输出和 tranche-by-tranche 数字只从 OPL external evidence ledger、runtime read model、提交历史和 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md) 读取，不再复制到 active 支撑文档。Active 文档只保留当前 owner、当前差距和下一步：继续由 MAS/MAG/RCA/App/live operator 提供真实 owner receipt、typed blocker closeout、no-regression、expected receipt、monitor freshness、memory/artifact/lifecycle receipt、MAS conformance blocker cleanup 和 domain long-soak refs；OPL 不从 workorder 模板自造 owner receipt、typed blocker、owner-chain、no-regression、release-ready 或 production-ready 证据。

3. `generated_surface_production_consumption`
   让 OPL generated/hosted CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness 成为 MAS/MAG/RCA 的生产默认 caller。Domain repo 手写 wrapper 退成 domain handler、refs-only adapter、diagnostic cleanup 或 tombstone。

4. `domain_private_residue_retirement`
   把 framework-generic 能力上收到 OPL，把 domain truth 留在 domain。满足 replacement parity、no-active-caller、domain receipt parity、provenance/history/tombstone 和 no-forbidden-write 证据后，旧模块、接口、alias、facade、wrapper、旧测试入口和 compatibility tests 直接退役；测试改为锁定当前 machine-readable contract、generated surface、domain owner receipt 或 no-resurrection guard。

5. `opl_app_runtime_workbench`
   将 provider readiness、stage attempt、route graph、review/repair queue、source refs、artifact refs、memory refs、quality/readiness、SLO、workorder packet 和 owner-aware action routing 做成人可用工作台，并补齐真实用户路径、截图、发布包和长时 operator evidence。

6. `domain_soak_and_acceptance`
   MAS 完成真实 paper-line provider apply 证据；MAG/RCA 分别完成 controlled grant / visual stage attempt、owner receipt / no-regression evidence、expected receipt instance、monitor freshness 和 long SLO。

7. `new_domain_admission`
   新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI、stage evidence workorder policy 和 docs taxonomy 接入，不复制旧 gateway/frontdoor/local-runtime 路线。OMA / New Agent 已有 structural consumption proof；production-consumption follow-through 现在按 managed install/update、App live path、owner receipt / typed blocker scaleout 和 long-soak 四个 gate 进入 App/framework 默认读面，当前四类 gate 均有 observed refs，OMA production-consumption ready；后续重点是更多真实 target patch/rerun/owner receipt 样本，而不是把 OMA ready 外推成目标 domain ready、family production ready 或默认 promotion。

## 内容线路

| 线路 | 当前 owner | 当前要做 |
| --- | --- | --- |
| `provider_runtime` | OPL Runtime Manager / Temporal provider | 固定 Temporal production provider，保持 cadence / capability SLO satisfied；继续补真实 domain owner-chain dispatch 和长时 operator evidence。 |
| `stage_evidence_accounting` | OPL production closeout / App operator shell | workorder accounting 当前为 0；继续保留 refs-only route、payload preflight、typed blocker 和 domain/stage packet 作为未来 admitted stage 的 fail-closed 守门面。 |
| `generated_surface` | OPL pack compiler / generated surface | 从 domain descriptor/stage/action/memory/transition/receipt metadata 派生 entry/status/sidecar/workbench/harness，并迁移生产 caller。 |
| `conformance_physical_morphology` | OPL agents conformance | 保持 conformance 主入口为薄聚合器；physical morphology policy、active residue scan 和 provenance/tombstone allowance 只能在 scoped module 中演进，并由 line-budget / modularization tests 防回堆。 |
| `domain_private_residue` | OPL functional audit + domain repos | 按 OPL replacement、generated surface、refs-only adapter、minimal authority function、tombstone 分类收薄或删除；MAS 旧 runtime / runner / worker lease / lifecycle writer 已按 no-alias 退役，当前只守 no-resurrection 和仍有 caller 的 domain-ref projection / owner-route / workbench 删除门。 |
| `lifecycle_memory_artifact` | OPL primitive + domain owner receipt | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 |
| `app_workbench` | One Person Lab App / OPL product surface | 消费 App/operator drilldown、safe action routes、cleanup plan、stage evidence accounting、OMA patch-loop closeout refs、OPL Meta Agent refs-only workbench sections、OMA production-consumption follow-through gates 和 App release/user-path evidence gates；App release gate 按单一 cohort 计算，当前 `26.5.19` package/provider refs、真实已安装 App 窗口截图 receipt、startup-maintenance / first-run reload-check receipt 与 long operator evidence 均已 verified，App user-path evidence ready，但 App 仍不能生成 release-ready 或 production-ready verdict。 |
| `legacy_cleanup` | OPL gate + domain repo owner | replacement proof 和 no-active-caller proof 后直接删除或 tombstone；OPL 可写 cleanup ledger / tombstone refs，domain repo 文件删除需要 domain owner receipt。 |

## 当前直接退役优先级

| surface family | 当前实际状态 | 执行动作 |
| --- | --- | --- |
| OPL 历史 gateway/frontdoor/federation docs | 已在 `docs/history/compatibility/**` 或 `docs/history/frontdoor-legacy/**` 承担 provenance。 | 不恢复 active reference；若有 active doc / README / policy 继续指向旧路线，改为当前 OPL runtime / App / Foundry Agent 边界。 |
| `family-runtime production-closeout` 等旧 CLI alias | 已被当前 readiness / evidence-worklist / App drilldown route 替代；`opl framework production-closeout` 只作为 framework-level 汇总命令保留。 | 不保留 compatibility alias；仍被测试或文档引用时迁到当前命令或 negative guard。 |
| domain repo 手写 product/status/workbench/sidecar wrappers | MAS/MAG/RCA 仍有 active retained adapters。 | 只按 domain handler / refs-only adapter / diagnostic / migration input 读取；OPL generated/default caller parity 成立后删除旧 wrapper 和兼容测试。 |
| stale compatibility tests | OPL 当前只需要 no-resurrection guard、contract behavior test 或 migration proof。 | 删除只保护旧路径的测试；保留的测试必须断言当前 contract、no-active-caller、fail-closed、retired alias rejection 或 tombstone semantics。 |

## 合并与退役规则

| 内容类型 | 长期归属 |
| --- | --- |
| stage attempt、provider runtime、queue、signal/query、retry/dead-letter、approval transport | OPL Framework / Runtime Manager |
| expected receipt / monitor freshness route、payload preflight、workorder packet、typed blocker、refs-only evidence ledger | OPL Framework / App operator shell |
| lifecycle ledger、artifact locator/index、retention、restore proof、migration ledger、workspace lifecycle metadata | OPL Framework primitive |
| MAS study truth、publication gate、evidence/review ledger、manuscript/package authority | MAS |
| MAG grant strategy、fundability / proposal quality、specific aims authority | MAG |
| RCA visual direction、creative artifact generation、review/export gate | RCA |
| old gateway/frontdoor/Hermes-first/local-manager default wording | replacement proof 与 no-active-caller scan 通过后删除或进入 history/tombstone |
| external framework learning | references only，除非明确提升为 contracts/source/active owner docs |

## 完成信号

| 线路 | 完成信号 |
| --- | --- |
| `opl_framework_foundation` | OPL provider/framework 能稳定承载 stage attempt、queue/wakeup、retry/dead-letter、approval/human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `production_evidence_scaleout` | OPL closeout/workorder accounting 可 fail-closed 投影并当前无 open safe action；真实 production closure 由 App release/user path、domain owner-chain、memory/artifact/lifecycle receipt、direct/hosted parity、no-regression 或 long-soak refs 关闭。 |
| `generated_surface_production_consumption` | MAS/MAG/RCA 生产默认 caller 使用 OPL generated/hosted surfaces；domain repo 只保留 domain handler、authority function、refs-only adapter 或 diagnostic cleanup。 |
| `domain_private_residue_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；无 active caller 的旧模块、接口、测试、alias、facade 和 wrapper 已删除或 tombstone，不保留兼容入口。 |
| `opl_app_runtime_workbench` | App/workbench 能按 owner drill down provider、stage attempt、domain refs、memory/artifact/source refs、workorder、SLO、repair 和 safe actions，并有截图/发布包/长时 evidence。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实 progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、no-regression evidence 或 typed blocker。 |

## 文档落点

- 当前差距、执行顺序和 baton：`docs/active/`。
- 目标态和支撑参考：`docs/references/`。
- runtime/provider/executor/control plane 支撑：`docs/runtime/` 和 `docs/references/runtime-substrate/`。
- App/workbench/product surface：`docs/product/`。
- 旧路线、完成计划、dated proof、receipt 流水和 process archive：`docs/history/`。

如果内容仍决定“接下来按什么顺序做、什么算完成”，放当前 owner doc；如果只是来龙去脉或过程证据，放 history/provenance。
