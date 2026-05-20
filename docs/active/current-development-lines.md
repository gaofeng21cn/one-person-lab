# OPL 当前开发线路

Owner: `One Person Lab`
Purpose: `current_execution_map`
State: `active_support`
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-05-20`

## 当前结论

OPL 当前开发继续按 Codex-default、provider-backed、framework-first 执行：先守住 OPL 作为完整智能体开发/运行框架，再让 MAS/MAG/RCA 作为标准 OPL Agents 消费 framework surface，并用真实 domain owner receipt / App evidence / long soak 验收目标结构。

当前 OPL 已有 Temporal provider、stage attempt ledger、typed queue、typed closeout、production closeout read model、domain descriptor aggregation、functional runtime harness、generic substrate projection、Agent Lab、pack compiler handoff、external evidence refs-only receipt ledger、App/operator drilldown read model、App runtime 页面消费路径、managed clean runner 和 `opl system startup-maintenance` App 启动维护机器入口。新补的 `stage_evidence_workorder_packet` 把 expected receipt / monitor freshness 的 18 个 open workorder 聚合成可审计 closeout packet，说明 OPL 不只看见缺口，也能把缺口转成受控 safe action 和 operator workorder；真实 closure 仍必须由 MAS/MAG/RCA 或 App/live operator 提供 owner receipt、monitor evidence、typed blocker、no-regression 或 long-soak refs。

dated proof、receipt 事件、具体命令输出和阶段 closeout 摘要归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。本文只保留当前顺序和 owner 边界。

## 当前顺序

1. `opl_framework_foundation`
   保持 provider-backed stage runtime、typed queue、attempt ledger、signal/query、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive、safe action shell 和 generated surface 基础。

2. `stage_evidence_workorder_closeout`
   用 `runtime app-operator-drilldown`、`runtime action execute` 和 `family-runtime production-closeout` 把 expected receipt / monitor freshness 缺口投影成 refs-only record/verify route 与 `stage_evidence_workorder_packet`。OPL 只提供 transport、preflight、workorder、ledger 和 projection；domain/App/live refs 才能关闭缺口。

3. `generated_surface_production_consumption`
   让 OPL generated/hosted CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness 成为 MAS/MAG/RCA 的生产默认 caller。Domain repo 手写 wrapper 退成 domain handler、refs-only adapter、diagnostic cleanup 或 tombstone。

4. `domain_private_residue_retirement`
   把 framework-generic 能力上收到 OPL，把 domain truth 留在 domain。满足 replacement parity、no-active-caller、domain receipt parity、provenance/history/tombstone 和 no-forbidden-write 证据后，旧模块、接口、alias、facade、wrapper 和 compatibility tests 直接退役。

5. `opl_app_runtime_workbench`
   将 provider readiness、stage attempt、route graph、review/repair queue、source refs、artifact refs、memory refs、quality/readiness、SLO、workorder packet 和 owner-aware action routing 做成人可用工作台，并补齐真实用户路径、截图、发布包和长时 operator evidence。

6. `domain_soak_and_acceptance`
   MAS 完成真实 paper-line provider apply 证据；MAG/RCA 分别完成 controlled grant / visual stage attempt、owner receipt / no-regression evidence、expected receipt instance、monitor freshness 和 long SLO。

7. `new_domain_admission`
   新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI、stage evidence workorder policy 和 docs taxonomy 接入，不复制旧 gateway/frontdoor/local-runtime 路线。

## 内容线路

| 线路 | 当前 owner | 当前要做 |
| --- | --- | --- |
| `provider_runtime` | OPL Runtime Manager / Temporal provider | 固定 Temporal production provider，保持 cadence / capability SLO satisfied；继续补真实 domain owner-chain dispatch 和长时 operator evidence。 |
| `stage_evidence_workorder` | OPL production closeout / App operator shell | 维持 18 个 expected receipt / monitor freshness workorder 的 refs-only route、payload preflight 和 domain/stage packet；等待 MAS/MAG/RCA 或 App/live operator 回填真实 refs。 |
| `generated_surface` | OPL pack compiler / generated surface | 从 domain descriptor/stage/action/memory/transition/receipt metadata 派生 entry/status/sidecar/workbench/harness，并迁移生产 caller。 |
| `domain_private_residue` | OPL functional audit + domain repos | 按 OPL replacement、generated surface、refs-only adapter、minimal authority function、tombstone 分类收薄或删除；MAS runner/supervisor/workbench/SQLite lifecycle writer 是当前最高优先级物理收薄面。 |
| `lifecycle_memory_artifact` | OPL primitive + domain owner receipt | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 |
| `app_workbench` | One Person Lab App / OPL product surface | 消费 App/operator drilldown、safe action routes、cleanup plan、workorder packet 和 OPL Meta Agent refs-only workbench sections；继续补真实用户路径、截图、发布包和长时证据。 |
| `legacy_cleanup` | OPL gate + domain repo owner | replacement proof 和 no-active-caller proof 后直接删除或 tombstone；OPL 可写 cleanup ledger / tombstone refs，domain repo 文件删除需要 domain owner receipt。 |

## 合并与退役规则

| 内容类型 | 长期归属 |
| --- | --- |
| stage attempt、provider runtime、queue、signal/query、retry/dead-letter、approval transport | OPL Framework / Runtime Manager |
| expected receipt / monitor freshness route、payload preflight、workorder packet、refs-only evidence ledger | OPL Framework / App operator shell |
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
| `stage_evidence_workorder_closeout` | OPL 能为每个 open expected receipt / monitor freshness 缺口输出 safe action route、payload workorder、preflight 和 packet；真实关闭由 domain/App/live refs 或 typed blocker 回填。 |
| `generated_surface_production_consumption` | MAS/MAG/RCA 生产默认 caller 使用 OPL generated/hosted surfaces；domain repo 只保留 domain handler、authority function、refs-only adapter 或 diagnostic cleanup。 |
| `domain_private_residue_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；无 active caller 的旧面已经删除或 tombstone。 |
| `opl_app_runtime_workbench` | App/workbench 能按 owner drill down provider、stage attempt、domain refs、memory/artifact/source refs、workorder、SLO、repair 和 safe actions，并有截图/发布包/长时 evidence。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实 progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、no-regression evidence 或 typed blocker。 |

## 文档落点

- 当前差距、执行顺序和 baton：`docs/active/`。
- 目标态和支撑参考：`docs/references/`。
- runtime/provider/executor/control plane 支撑：`docs/runtime/` 和 `docs/references/runtime-substrate/`。
- App/workbench/product surface：`docs/product/`。
- 旧路线、完成计划、dated proof、receipt 流水和 process archive：`docs/history/`。

如果内容仍决定“接下来按什么顺序做、什么算完成”，放当前 owner doc；如果只是来龙去脉或过程证据，放 history/provenance。
