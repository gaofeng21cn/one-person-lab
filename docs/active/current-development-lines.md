# OPL 当前开发线路

Owner: `One Person Lab`
Purpose: `current_execution_map`
State: `active_support`
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-05-30`

## 当前结论

OPL 当前开发继续按 Codex-default、provider-backed、framework-first 执行：先守住 OPL 作为完整智能体开发/运行框架，再让 MAS/MAG/RCA/OMA 作为标准 OPL Agents 消费 framework surface，并用真实 domain owner receipt、App evidence、no-regression 和 long-soak refs 验收目标结构。

本文只保留当前顺序、owner 边界和完成口径。dated proof、receipt id、具体命令输出、attempt id、worktree/branch 流水和单次 closeout 摘要归档到 `docs/history/**`、runtime ledger、提交历史或 automation memory；当前计数必须重新读取 live CLI/read-model。

当前 OPL 已具备的 framework surface 包括 Temporal provider、stage attempt ledger、typed queue、typed closeout、evidence worklist read model、domain descriptor aggregation、functional runtime harness、generic substrate projection、Agent Lab、pack compiler handoff、external evidence refs-only receipt ledger、App/operator drilldown read model、App runtime 页面消费路径、managed clean runner、App 启动维护入口以及 Developer Mode / OMA / App release / Codex App runtime / standard-agent template consumption 等 refs-only ledger。它们共同构成 OPL control plane，不授权 domain ready、artifact authority、App release ready 或 production ready。

## Live Truth 读取

每轮开发先读取这些机器面，不从本文继承旧数字：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

当前 read-model schema 使用嵌套 payload：`framework_readiness.summary`、`runtime app-operator-drilldown` 的 summary、`family_runtime_evidence_worklist.summary`、`standard_domain_agent_conformance.summary` 和 `agent_default_caller_readiness.summary` 是默认摘要入口。新增文档或工具不得假设这些摘要字段永远在顶层。

本轮 fresh 读取的 durable 结论（2026-05-30）：

- `standard_domain_agent_conformance.summary` 读为 4 个 repo passed、0 blocked，`structural_conformance_status=passed`，`production_evidence_tail_count=4` 仍单独报告。
- `agent_default_caller_readiness.summary` 读为 32 个 generated/default caller surfaces、0 blocked、32 个 deletion-evidence worklist，并且 owner/typed-blocker、no-forbidden-write、tombstone/provenance 缺口均为 0。
- `stages readiness` 读为 13 个 stage admitted、0 blocked、0 hard blocker、23 个 launch warning；warning 只作为 runtime-budget / replay / cohort advisory 读取，不是 domain ready 或 production ready。
- `framework_readiness.summary` 读为 `framework_control_plane_available_with_operator_attention`，framework/stage/pack/compiler hard blocker 为 0，operator actionable attention tail 为 3，且 3 个均为 payload-required；domain blocked refs-only attention 仍为主要读面，main post-merge fresh 计数为 evidence envelope open 3、blocked 1131、domain dispatch attention 11、domain blocked attention 1142，provider cadence / capability SLO 均 satisfied。
- `family_runtime_evidence_worklist.summary` 读为 3 个 open worklist item、3 个 payload-required safe action、0 个 payload-free safe action、0 个 stage receipt freshness workorder、415 个 closed refs-only item；这表示当前又出现可提交 route，payload 仍必须来自 domain/App/live owner 的真实 refs 或 typed blocker，不授权 OPL 自造 owner receipt、typed blocker、owner-chain、no-regression、completion、domain ready 或 production ready。该计数在本轮验证中已从 2 漂移到 3，精确数量只从 fresh CLI 读取。
- App/operator drilldown 显示 provider cadence/capability satisfied、App release/user-path evidence gate open count 为 0、Codex App runtime evidence gate open count 为 0、Developer Mode live route closeout refs ready 且 scaleout follow-through open gate 为 0、OMA production-consumption ready 为 true；这些都只是 refs-only / owner-boundary 读面，不是 release ready、domain ready 或 production ready verdict。

## 当前顺序

1. `opl_framework_foundation`
   保持 provider-backed stage runtime、typed queue、attempt ledger、signal/query、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive、safe action shell 和 generated surface 基础。Temporal-backed provider 是 production online runtime 的必需 substrate，local provider 只作为 dev/CI/offline diagnostic baseline。

2. `production_evidence_scaleout`
   保持 `runtime app-operator-drilldown`、`runtime action execute` 和 `family-runtime evidence-worklist` 的 refs-only worklist、typed blocker、payload preflight 和 workorder 能力。当前重心是真实 production evidence、domain owner-chain、memory/artifact/lifecycle receipt、direct/hosted parity、no-regression、expected receipt、monitor freshness 和 long-soak refs。Open worklist 只说明有可提交 route；payload 必须来自 domain/App/live owner 的真实 refs 或 typed blocker，OPL 不从模板自造 owner receipt、typed blocker、owner-chain、no-regression、release-ready 或 production-ready 证据。

3. `strict_standard_agent_source_purity`
   让 OPL generated/hosted CLI、MCP、Skill/product-entry、status、session、workbench、domain-handler 和 harness 成为 MAS/MAG/RCA/OMA 的生产默认 caller。Domain repo 最终只留 domain pack、machine-readable contract、authority function、domain handler target、domain-specific implementation 与必要 native helper。repo-local default caller、wrapper、runtime projection、diagnostic cleanup shell、compat facade、re-export wrapper 和 compatibility-only tests 在 replacement/no-active-caller/provenance 证据成立后直接删除或进入 history/tombstone。

4. `domain_private_residue_retirement`
   把 framework-generic 能力上收到 OPL，把 domain truth 留在 domain。满足 replacement parity、no-active-caller、domain receipt parity、provenance/history 和 no-forbidden-write 证据后，旧模块、接口、alias、facade、wrapper、旧测试入口和 compatibility tests 直接退役。测试改为锁定当前 machine-readable contract、generated surface、domain owner receipt、fail-closed 行为或 no-resurrection guard。

5. `opl_app_runtime_workbench`
   App/workbench 消费 provider readiness、stage attempt、route graph、review/repair queue、source refs、artifact refs、memory refs、SLO、workorder packet、owner-aware action routing 和 refs-only graph/timeline/research lens。该面只做展示与 drilldown，不读取论文正文、memory body 或 artifact body，不声明 publication ready、domain ready 或 production ready。

6. `domain_soak_and_acceptance`
   MAS/MAG/RCA 在迁移后目标形态下持续产出真实 progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、typed blocker、no-regression evidence、expected receipt、monitor freshness、memory/artifact/lifecycle receipt 或 long-soak refs。

7. `new_domain_admission`
   新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI、stage evidence workorder policy 和 docs taxonomy 接入。旧 gateway/frontdoor/local-runtime/Hermes-first 路线已退役，不得恢复为默认入口。

## 内容线路

| 线路 | 当前 owner | 当前要做 |
| --- | --- | --- |
| `provider_runtime` | OPL Runtime Manager / Temporal provider | 固定 Temporal production provider，保持 cadence / capability SLO satisfied；继续补真实 domain owner-chain dispatch、typed closeout、retry/dead-letter 和 no-forbidden-write 证据。 |
| `stage_evidence_accounting` | OPL production closeout / App operator shell | Stage/domain evidence workorder 继续是 refs-only route、payload preflight、typed blocker 和 domain/stage packet 守门面；candidate refs 不自动关闭 route、不生成 owner receipt、不声明 domain ready 或 production ready。 |
| `generated_surface` | OPL pack compiler / generated surface | 从 domain descriptor/stage/action/memory/transition/receipt metadata 派生 entry/status/workbench/harness，并迁移生产 caller。 |
| `conformance_physical_morphology` | OPL agents conformance | 保持 conformance 主入口为薄聚合器；physical morphology policy、active residue scan 和 provenance/tombstone allowance 只能在 scoped module 中演进，并由 line-budget / modularization tests 防回堆。 |
| `domain_private_residue` | OPL functional audit + domain repos | 按 OPL replacement、generated surface、refs-only adapter、minimal authority function、tombstone 分类收薄或删除；剩余风险按 no-resurrection、physical-delete authority 和 production evidence tail 读取。 |
| `lifecycle_memory_artifact` | OPL primitive + domain owner receipt | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。Observed refs 不授权 package/export/visual readiness、physical delete、domain ready、Temporal visual-stage long soak 或 production ready。 |
| `app_workbench` | One Person Lab App / OPL product surface | 消费 App/operator drilldown、runtime visualization graph/timeline/lens、safe action routes、cleanup plan、stage evidence accounting、OMA production-consumption gates、App release/user-path gates 和 Codex App runtime evidence gates；不生成 release-ready 或 production-ready verdict。 |
| `legacy_cleanup` | OPL gate + domain repo owner | replacement proof 和 no-active-caller proof 后直接删除或 tombstone；OPL 可写 cleanup ledger / tombstone refs，domain repo 文件物理删除需要 domain owner receipt 或明确 owner-side proof。 |

## 当前直接退役优先级

| surface family | 当前实际状态 | 执行动作 |
| --- | --- | --- |
| OPL 历史 gateway/frontdoor/federation docs | 已在 `docs/history/compatibility/**` 或 `docs/history/frontdoor-legacy/**` 承担 provenance。 | 不恢复 active reference；若有 active doc / README / policy 继续指向旧路线，改为当前 OPL runtime / App / Foundry Agent 边界。 |
| `family-runtime production-closeout` 等旧 CLI alias | 已被当前 readiness / evidence-worklist / App drilldown route 替代；`opl framework production-closeout` 只作为 framework-level 汇总命令保留。 | 不保留 compatibility alias；仍被测试或文档引用时迁到当前命令或 negative guard。 |
| domain repo 手写 product/status/workbench/sidecar wrappers | MAS/MAG/RCA 仍有 retained adapter / domain handler / refs-only projection tail。 | 只按 domain handler、refs-only adapter、diagnostic 或 migration input 读取；OPL generated/default caller parity 和 owner proof 成立后删除旧 wrapper 和兼容测试。 |
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
| OMA agent-building semantics、candidate package/work-order/proposal materialization refs | OMA / target-agent owner |
| old gateway/frontdoor/Hermes-first/local-manager default wording | replacement proof 与 no-active-caller scan 通过后删除或进入 history/tombstone |
| external framework learning | references only，除非明确提升为 contracts/source/active owner docs |

## 完成信号

| 线路 | 完成信号 |
| --- | --- |
| `opl_framework_foundation` | OPL provider/framework 能稳定承载 stage attempt、queue/wakeup、retry/dead-letter、approval/human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `production_evidence_scaleout` | OPL closeout/workorder accounting 可 fail-closed 投影；真实 production closure 由 App release/user path、domain owner-chain、memory/artifact/lifecycle receipt、direct/hosted parity、no-regression 或 long-soak refs 关闭。 |
| `generated_surface_production_consumption` | MAS/MAG/RCA/OMA 生产默认 caller 使用 OPL generated/hosted surfaces；domain repo 只保留 domain handler、authority function、refs-only adapter 或 diagnostic cleanup。 |
| `domain_private_residue_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；无 active caller 的旧模块、接口、测试、alias、facade 和 wrapper 已删除或 tombstone，不保留兼容入口。 |
| `opl_app_runtime_workbench` | App/workbench 能按 owner drill down provider、stage attempt、route graph、timeline、domain refs、memory/artifact/source refs、workorder、SLO、repair 和 safe actions，并有截图/发布包/长时 evidence。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实 progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、no-regression evidence 或 typed blocker。 |

## 文档落点

- 当前差距、执行顺序和 baton：`docs/active/`。
- 目标态和支撑参考：`docs/references/`。
- runtime/provider/executor/control plane 支撑：`docs/runtime/` 和 `docs/references/runtime-substrate/`。
- App/workbench/product surface：`docs/product/`。
- 旧路线、完成计划、dated proof、receipt 流水和 process archive：`docs/history/`。

如果内容仍决定“接下来按什么顺序做、什么算完成”，放当前 owner doc；如果只是来龙去脉或过程证据，放 history/provenance。
