# OPL 当前开发线路

Status: `active_support`
Owner: `One Person Lab`
Purpose: 在 OPL 已定位为 stage-led、以 Agent executor 为最小执行单位的完整智能体框架之后，给出当前 framework-first 的内容级开发线路。
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。

## 当前结论

OPL 当前开发继续按 Codex-default、provider-backed、framework-first 执行：先把 OPL 做成完整智能体开发/运行框架，再让 MAS/MAG/RCA 迁成标准 OPL Agents，并用真实 domain owner receipt / long soak 验收目标结构。

当前 OPL 已有 framework/control-plane、Temporal provider、stage attempt ledger、typed queue、typed closeout、production closeout read model、domain descriptor aggregation、functional runtime harness、generic substrate projection、Agent Lab、pack compiler handoff、external evidence refs-only receipt ledger、App/operator drilldown read model、App runtime 页面消费路径、managed clean runner 和 `opl system startup-maintenance` App 启动维护机器入口。`app_operator_drilldown` 现在也会投影 domain evidence request / remaining gate / OPL replacement coverage / observed receipt status / legacy cleanup executable plan，说明 App/operator 能看到“还差哪些 receipt、哪些 cleanup plan 可 apply、哪些 delete 被 domain owner gate 挡住”。`system startup-maintenance` 则负责 clean OPL-managed MAS/MAG/RCA modules 的 install/update、health check、domain skill sync、plugin cache freshness 和 reload prompt，并把 dirty/ahead/diverged/no-upstream/env override/sibling workspace/invalid checkout fail closed 到人工处理。这些说明 OPL 的通用底座已经存在，但仍不代表 production domain owner chain、App 发布包/截图/长时证据、generated caller migration 或 legacy / provenance / diagnostic cleanup 完成。

dated proof、receipt 事件、具体命令输出和阶段 closeout 摘要已经归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。本文只保留当前顺序和 owner 边界。

## 当前顺序

1. `opl_framework_foundation`
   完成 provider-backed stage runtime、typed queue、attempt ledger、signal/query、retry/dead-letter、human gate、receipt/projection、shared lifecycle/index primitive 和 generated surface 基础。

2. `generated_surface_production_consumption`
   让 OPL generated/hosted CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness 成为 MAS/MAG/RCA 的生产默认 caller。Domain repo 手写 wrapper 退成 domain handler、refs-only adapter、diagnostic cleanup 或 tombstone。

3. `mas_physical_thinning`
   MAS 机器合同 gap count 为 0 只说明声明边界清楚；还要把 repo-local runner / worker lease / runtime supervisor / workbench projection / SQLite lifecycle writer 收成 OPL provider runtime、queue/attempt、App workbench 和 lifecycle index 的消费面。MAS 保留 owner-route prompt、medical guard、publication/artifact/memory authority、typed blocker 和 owner receipt。

4. `mas_paper_autonomy_acceptance`
   以 MAS 真实论文线验证 provider-hosted guarded apply、AI reviewer / publication gate / artifact authority、memory writeback 和 no-forbidden-write。有效结果可以是 progress delta、human gate、stop-loss、artifact delta、AI reviewer update 或 stable typed blocker；不能把 provider completion 写成 paper closure。

5. `domain_framework_migration`
   将 MAS/MAG/RCA 迁成标准 OPL Agents：统一 skeleton、stage descriptor、action catalog、memory descriptor、artifact locator、owner receipt、sidecar/projection refs 和 authority boundary，并保持 direct skill path 与 OPL-hosted path 等价。

6. `feature_partition_and_retirement`
   把 framework-generic 能力上收到 OPL，把 domain truth 留在 domain。满足 replacement parity、no-active-caller、provenance/history/tombstone 和 no-forbidden-write 证据后，旧模块、接口、alias、facade、wrapper 和 compatibility tests 直接退役。

7. `opl_app_runtime_workbench`
   将 provider readiness、stage attempt、route graph、review/repair queue、source refs、artifact refs、memory refs、quality/readiness、SLO、transition bridge evidence 和 owner-aware action routing 做成人可用工作台，并补齐真实用户路径、截图、发布包和长时 operator evidence。

8. `domain_soak_and_acceptance`
   MAS 先完成真实 paper-line provider apply 证据；MAG/RCA 再分别完成 controlled grant / visual stage attempt、owner receipt / no-regression evidence 和 long SLO。

9. `new_domain_admission`
   新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI 和 docs taxonomy 接入，不复制旧 gateway/frontdoor/local-runtime 路线。

## 内容线路

| 线路 | 当前 owner | 当前要做 |
| --- | --- | --- |
| `provider_runtime` | OPL Runtime Manager / Temporal provider | 固定 Temporal production provider，持续补 cadence、repair execution receipt、restart/re-query/signal/history 长窗口证据。 |
| `generated_surface` | OPL pack compiler / generated surface | 从 domain descriptor/stage/action/memory/transition/receipt metadata 派生 entry/status/sidecar/workbench/harness，并迁移生产 caller。 |
| `domain_private_residue` | OPL functional audit + domain repos | 按 OPL replacement、generated surface、refs-only adapter、minimal authority function、tombstone 分类收薄或删除；MAS runner/supervisor/workbench/SQLite lifecycle writer 是当前最高优先级物理收薄面。 |
| `lifecycle_memory_artifact` | OPL primitive + domain owner receipt | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 |
| `app_workbench` | One Person Lab App / OPL product surface | 已有 `app_operator_drilldown` runtime 页面消费路径，并已投影 evidence request、replacement coverage、external evidence receipt status 和 cleanup plan；`opl system startup-maintenance` 已提供 managed environment freshness、plugin cache freshness 和 reload prompt 机器入口；继续补真实用户路径、截图、发布包和长时证据，不做 domain truth owner。 |
| `legacy_cleanup` | OPL gate + domain repo owner | replacement proof 和 no-active-caller proof 后直接删除或 tombstone；OPL 可写 cleanup ledger / tombstone refs，domain repo 文件删除需要 domain owner receipt，不保留兼容面。 |

## 合并与退役规则

| 内容类型 | 长期归属 |
| --- | --- |
| stage attempt、provider runtime、queue、signal/query、retry/dead-letter、approval transport | OPL Framework / Runtime Manager |
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
| `generated_surface_production_consumption` | MAS/MAG/RCA 生产默认 caller 使用 OPL generated/hosted surfaces；domain repo 只保留 domain handler、authority function、refs-only adapter 或 diagnostic cleanup。 |
| `mas_paper_autonomy_acceptance` | 多条真实 paper line 产出 MAS owner receipt、artifact/gate/reviewer/route/human-gate/stop-loss progress evidence 或 stable typed blocker，且 OPL 不写 MAS truth。 |
| `domain_framework_migration` | MAS/MAG/RCA 通过统一 descriptor/skeleton/locator/receipt 接入；direct path 与 OPL-hosted path 保持语义等价和 no-forbidden-write。 |
| `feature_partition_and_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；无 active caller 的旧面已经删除或 tombstone。 |
| `opl_app_runtime_workbench` | App/workbench 能按 owner drill down provider、stage attempt、domain refs、memory/artifact/source refs、SLO、repair 和 safe actions，并有截图/发布包/长时 evidence。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实 progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、no-regression evidence 或 typed blocker。 |

## 文档落点

- 当前差距、执行顺序和 baton：`docs/active/`。
- 目标态和支撑参考：`docs/references/`。
- runtime/provider/executor/control plane 支撑：`docs/runtime/` 和 `docs/references/runtime-substrate/`。
- App/workbench/product surface：`docs/product/`。
- 旧路线、完成计划、dated proof、receipt 流水和 process archive：`docs/history/`。

如果内容仍决定“接下来按什么顺序做、什么算完成”，放当前 owner doc；如果只是来龙去脉或过程证据，放 history/provenance。
