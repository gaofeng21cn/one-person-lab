# OPL 当前开发线路

Owner: `One Person Lab`
Purpose: `current_execution_map`
State: `active_support`
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-05-23`

## 当前结论

OPL 当前开发继续按 Codex-default、provider-backed、framework-first 执行：先守住 OPL 作为完整智能体开发/运行框架，再让 MAS/MAG/RCA 作为标准 OPL Agents 消费 framework surface，并用真实 domain owner receipt / App evidence / long soak 验收目标结构。

当前 OPL 已有 Temporal provider、stage attempt ledger、typed queue、typed closeout、evidence worklist read model、domain descriptor aggregation、functional runtime harness、generic substrate projection、Agent Lab、pack compiler handoff、external evidence refs-only receipt ledger、App/operator drilldown read model、App runtime 页面消费路径、managed clean runner、`opl system startup-maintenance` App 启动维护机器入口、`opl_managed_module_install_update_ledger`、`opl_oma_app_live_path_ledger`、`opl_app_release_user_path_evidence_ledger` 和 `opl_developer_mode_closeout_ledger`。最新 worklist 读面显示 provider scheduler、legacy cleanup、external evidence request、evidence gate 和 stage evidence accounting 均已进入 refs-only ledger / typed blocker / requirement 口径；具体 workorder、open safe action 和 receipt 数量只从 `opl framework readiness --family-defaults --json`、App drilldown 与 `family-runtime evidence-worklist` 生成读面读取。Framework readiness 默认 summary 也会把 App/operator 的 `domain_dispatch_attention_*` 折叠为 `domain_dispatch_attention_count`，用于提示 owner-chain dispatch 仍需真实 receipt / typed blocker / no-regression / long-soak scaleout，且不授权 domain ready 或 production ready。App/operator drilldown 也已消费 OMA patch-loop closeout refs；默认 summary 仅保留 OMA App section、scaleout target、patch-loop 总量和 OMA production-consumption follow-through gate count，full detail 才展开 OMA real-target scaleout 的 owner receipt / typed blocker、Agent Lab result、no-forbidden-write、cleanup closeout target counters，以及 `managed_install_update_refs`、`app_live_path_refs`、`owner_receipt_or_typed_blocker_scaleout_refs`、`long_soak_refs` 四类 production-consumption gate。当前 OMA target owner receipt / typed blocker scaleout refs 已被机器读面消费为 observed，不再作为 open gate 重复投给 operator；managed install/update gate 现在会消费同一个 OPL module inspection，在 OMA 处于 env override、sibling workspace、dirty、ahead、diverged、no-upstream、unknown 或 invalid checkout 且没有 clean managed-root receipt 时，向 App/default caller 投影 manual-required blocker 和 `opl modules` review action；App/live operator 可用 `opl runtime oma-app-live-path record --payload <json>` 写入 body-free `opl_oma_app_live_path_receipt`，关闭 `app_live_path_refs` gate。当前本机 ledger 已记录 `opl://oma-app-live-path/app%3A%2F%2Fone-person-lab%2Fopl-meta-agent%2Fworkbench%2Flive`，App drilldown 读面把 OMA production-consumption open gate 收敛为仅剩 `long_soak_refs`。App release/user-path evidence 现在也可通过 App/default caller 的 `runtime action execute` record/verify route 写入 body-free ledger receipt，消费真实 release package、screenshot、reload prompt user path、provider state linkage、long operator evidence 或 typed blocker refs；该 read model 要求同一 release/user-path cohort，当前本机已验证 `26.5.19` package/provider refs 和同 cohort 真实已安装 App 窗口截图 receipt，App drilldown 把 release package、provider state linkage 与 screenshot gate 读成 observed，仍缺同 cohort reload prompt 用户路径和 long operator evidence；跨版本 refs 会保持 `cohort_ambiguous` 并阻止拼接闭合。该 route / ledger 只关闭对应 refs-observed gate 或暴露 blocker，不生成 release artifact、不声明 App release ready 或 production ready。Developer Mode closeout 现在可通过 `opl runtime developer-mode-closeout record|verify|list` 写入 body-free live repair closeout refs，并由 Agent Lab 只消费 verified receipt；recorded receipt 保持 verify-pending，且 ledger intake 不生成 owner receipt、不写 domain truth、不声明 Developer Mode global closeout。OMA production closure 仍需要长时运行 evidence；即便 managed install/update 与 App live path refs 已 observed，`long_soak_refs` 未观察前仍不能写成 production ready。App `evidence_next_steps` 与 `framework readiness.next_safe_actions` 会把仍 open 或 manual-required 的 OMA gate 作为 refs-only operator guidance 暴露出来；真实 closure 仍必须由 MAS/MAG/RCA 或 App/live operator 提供 owner receipt、monitor evidence、typed blocker、no-regression、App live path 或 long-soak refs。

dated proof、receipt 事件、具体命令输出和阶段 closeout 摘要归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。本文只保留当前顺序和 owner 边界。

当前清理口径按 current source scan 读取：OPL 自身仍持有 `family-runtime*`、Temporal provider、App/operator drilldown、standard conformance、generated surface 和 legacy cleanup guard 等 framework owner surface；这些是目标 runtime/control plane，不是旧兼容面。历史 `gateway` / `frontdoor` / `Hermes-first` / `managed runtime` / compatibility 相关文件只允许留在 `docs/history/**`、contract tombstone、negative guard 或 focused no-resurrection test 中。若某个旧模块、旧接口、旧测试、旧文档入口已经没有 active caller，且 replacement proof / no-active-caller / owner receipt 或 tombstone proof 成立，执行动作是删除、archive 或 tombstone；不新增兼容 alias、facade、re-export wrapper 或 compatibility-only 聚合测试。

## 当前顺序

1. `opl_framework_foundation`
   保持 provider-backed stage runtime、typed queue、attempt ledger、signal/query、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive、safe action shell 和 generated surface 基础。

2. `production_evidence_scaleout`
   保持 `runtime app-operator-drilldown`、`runtime action execute` 和 `family-runtime evidence-worklist` 的 refs-only worklist / typed blocker / workorder 能力，但当前重心转到真实 production evidence：App release/user path、domain owner-chain、memory/artifact/lifecycle receipt、direct/hosted parity 和 long-soak refs。Domain-dispatch evidence workorder 已显式投影 success refs path 与 typed blocker path，并由 payload preflight 阻断空模板、占位 ref 和身份冲突；这些 payload path、preflight gate 与 required return shapes 也已进入 App `evidence_next_steps`、`owner_handoff_packet` 和 `framework readiness.next_safe_actions` 默认接力面，且 group-level `domain_dispatch_evidence_group_workorder` 会给出 bounded record action ids、`opl runtime action execute` record command refs、空 payload template、payload hints 和 empty-template policy，便于 Codex/default caller 先判定回填路径并拿到最小可执行命令，再按需读取 full detail。App release/user path 也已有专门 `app_release_user_path_evidence` 接力面、refs-only evidence ledger 和 `runtime action execute` record/verify safe action route，按 release package、screenshot、reload prompt user path、provider state linkage 和 long operator evidence 五类 required refs 暴露 open gate，并能消费 App/live/release owner 回填的真实 refs 或 typed blocker ref；该面现在带 single-cohort guard，只有同一 release/user-path cohort 的 refs 才会合并计算 gate，避免把旧 VM first-run evidence 与新 release package 拼成虚假 closeout；该面不生成 release artifact、不截屏、不声明 App release ready。OPL 只提供 transport、preflight、ledger 和 projection；domain/App/live refs 才能关闭生产可用性。`family-runtime production-closeout` 旧 alias 已退役，不再作为 active interface 或兼容面保留。

   当前 OMA App live-path ledger 的 operator CLI intake 是 `opl runtime oma-app-live-path record --payload <json>`，本地只读检查是 `opl runtime oma-app-live-path list`。这两条命令只记录或读取 OMA App live path、App surface 和 operator evidence refs；它们不生成 App artifact、不执行截图、不证明 long-soak，也不关闭 production-ready verdict。当前 App release/user-path ledger 的 operator CLI intake 是 `opl runtime app-release-evidence record --payload <json>`，本地只读检查是 `opl runtime app-release-evidence list`。这两条命令只记录或读取 release package、screenshot、reload prompt user path、provider state linkage、long operator evidence 或 typed blocker refs；recorded 但未 verify 的 receipt 会继续投影为 verify follow-through，不会被默认读成闭环完成。当前 verified receipt `opl://app-release-user-path-evidence/26.5.19-package-provider` 让 `26.5.19` cohort 的 release package 与 provider state linkage gate observed；当前 verified screenshot receipt `opl://app-release-user-path-evidence/screenshot_evidence_ref%3A%2F%2Fone-person-lab-app%2F26.5.19%2Flive-window%3Fpath%3D%2FUsers%2Fgaofeng%2Fworkspace%2Fopl-release-evidence%2Fv26.5.19%2Fapp-release-user-path%2Fone-person-lab-app-window-20260523.png%26sha256%3D2c10730311b22578ac0845d279f36588b080cef844671f35e10b2cee0cd6bd5d` 让同 cohort screenshot gate observed；仍必须补同 cohort reload prompt 用户路径和 long operator evidence。当前 Developer Mode closeout ledger 的 operator CLI intake 是 `opl runtime developer-mode-closeout record --payload <json>`，本地 follow-through 是 `verify` 与 `list`；它只记录或验证 route eligibility、patrol observation、diff、verification、no-forbidden-write、commit 或 fork/PR、external owner acceptance refs，并让 Agent Lab 消费 verified live receipt，不写 owner receipt、不写 managed runtime truth，也不关闭 production-ready verdict。它们不生成 App artifact、不证明用户走通 reload prompt，也不关闭 release-ready / production-ready verdict。

   2026-05-23 的直接下一步继续是 owner/stage group scaleout：MAS NF-PitNET / DM-CVD `paper_autonomy/guarded-apply` 已连续消费 typed-blocker path 和 success refs path，随后本轮转向 MAS `domain_route/reconcile-apply` owner-route/default-caller 迁移链路。最新 tranche 用 MAS payload builder 生成的 DM-CVD stable typed blocker `mas-domain-dispatch-typed-blocker:medautoscience:domain_route-reconcile-apply:002-dm-china-us-mortality-attribution:owner_route_reconcile_owner_receipt_or_stable_typed_b:owner-receipt-or-live-paper-line-closeout-pending` 关闭 `sat_09350f54776273c971a0a9e6` 的 OPL refs-only accounting，并验证 receipt `opl://external-evidence/medautoscience/domain_dispatch:medautoscience:sat_09350f54776273c971a0a9e6`；fresh worklist 为 `open_worklist_item_count=73`、`closed_refs_only_item_count=98`，全部 open workorder 仍是 domain-dispatch evidence tail。该 closure 只证明 identity-matched typed-blocker path 已由 MAS/App/live owner payload 进入 OPL refs-only ledger 并被验证，不执行 MAS reconcile apply、不写 MAS study truth、不声明 domain ready 或 production ready；App safe-action route 的 dry-run preflight 已验证 `domain_id`、`task_kind`、`study_id` 和 `source_fingerprint` identity match，record/verify 以 ledger receipt 和 worklist read model 为机器真相。后续按同一模式优先消费真实 MAS/MAG/RCA/App/live owner payload 或 typed blocker；OPL 不从 workorder 模板自造 owner receipt、typed blocker、owner-chain、no-regression 或 production-ready 证据。

   App/operator safe-action shell 现在也对已闭合的 stale domain-dispatch action id 返回 typed diagnostic：当 operator 继续提交已经 recorded 或 verified 的 `domain_dispatch:<domain>:<stage_attempt>:record|verify` action 时，`opl runtime action execute` 会返回 `domain_dispatch_evidence_action_route_closed`、当前 receipt status、receipt ref、下一步 verify action（若仍只是 recorded）和 non-ready authority boundary，而不是泛化成 route missing。该诊断只提升 operator 可复验性；不重新打开已闭合 route，不写 domain truth，也不把 typed blocker 或 refs-only receipt 解释成 domain ready / production ready。

3. `generated_surface_production_consumption`
   让 OPL generated/hosted CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness 成为 MAS/MAG/RCA 的生产默认 caller。Domain repo 手写 wrapper 退成 domain handler、refs-only adapter、diagnostic cleanup 或 tombstone。

4. `domain_private_residue_retirement`
   把 framework-generic 能力上收到 OPL，把 domain truth 留在 domain。满足 replacement parity、no-active-caller、domain receipt parity、provenance/history/tombstone 和 no-forbidden-write 证据后，旧模块、接口、alias、facade、wrapper、旧测试入口和 compatibility tests 直接退役；测试改为锁定当前 machine-readable contract、generated surface、domain owner receipt 或 no-resurrection guard。

5. `opl_app_runtime_workbench`
   将 provider readiness、stage attempt、route graph、review/repair queue、source refs、artifact refs、memory refs、quality/readiness、SLO、workorder packet 和 owner-aware action routing 做成人可用工作台，并补齐真实用户路径、截图、发布包和长时 operator evidence。

6. `domain_soak_and_acceptance`
   MAS 完成真实 paper-line provider apply 证据；MAG/RCA 分别完成 controlled grant / visual stage attempt、owner receipt / no-regression evidence、expected receipt instance、monitor freshness 和 long SLO。

7. `new_domain_admission`
   新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI、stage evidence workorder policy 和 docs taxonomy 接入，不复制旧 gateway/frontdoor/local-runtime 路线。OMA / New Agent 已有 structural consumption proof；production-consumption follow-through 现在按 managed install/update、App live path、owner receipt / typed blocker scaleout 和 long-soak 四个 gate 进入 App/framework 默认读面，其中 owner receipt / typed blocker scaleout、managed install/update 和 OMA App live path 已由 observed refs 退出 open gate，剩余 production consumption tail 集中在 long-soak。

## 内容线路

| 线路 | 当前 owner | 当前要做 |
| --- | --- | --- |
| `provider_runtime` | OPL Runtime Manager / Temporal provider | 固定 Temporal production provider，保持 cadence / capability SLO satisfied；继续补真实 domain owner-chain dispatch 和长时 operator evidence。 |
| `stage_evidence_accounting` | OPL production closeout / App operator shell | workorder accounting 当前为 0；继续保留 refs-only route、payload preflight、typed blocker 和 domain/stage packet 作为未来 admitted stage 的 fail-closed 守门面。 |
| `generated_surface` | OPL pack compiler / generated surface | 从 domain descriptor/stage/action/memory/transition/receipt metadata 派生 entry/status/sidecar/workbench/harness，并迁移生产 caller。 |
| `conformance_physical_morphology` | OPL agents conformance | 保持 conformance 主入口为薄聚合器；physical morphology policy、active residue scan 和 provenance/tombstone allowance 只能在 scoped module 中演进，并由 line-budget / modularization tests 防回堆。 |
| `domain_private_residue` | OPL functional audit + domain repos | 按 OPL replacement、generated surface、refs-only adapter、minimal authority function、tombstone 分类收薄或删除；MAS runner/supervisor/workbench/SQLite lifecycle writer 是当前最高优先级物理收薄面。 |
| `lifecycle_memory_artifact` | OPL primitive + domain owner receipt | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 |
| `app_workbench` | One Person Lab App / OPL product surface | 消费 App/operator drilldown、safe action routes、cleanup plan、stage evidence accounting、OMA patch-loop closeout refs、OPL Meta Agent refs-only workbench sections、OMA production-consumption follow-through gates 和 App release/user-path evidence gates；full detail 提供 OMA evidence-after-contract counters，默认 next steps 暴露 release package / screenshot / reload prompt / provider state / long operator evidence 的 return-shape guidance，并把 App release/user-path evidence record/verify route 放入 safe action shell；App release gate 按单一 cohort 计算，当前 `26.5.19` package/provider refs 与真实已安装 App 窗口截图 receipt 已 verified，仍需同 cohort reload prompt 用户路径和 long operator evidence。 |
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
