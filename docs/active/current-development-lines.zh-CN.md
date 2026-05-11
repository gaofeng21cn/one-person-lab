# OPL 当前开发线路

Status: `active_support`
Owner: `One Person Lab`
Purpose: 在 OPL 已定位为 Codex-first、stage-led 完整智能体框架之后，给出当前 framework-first 的内容级开发线路。
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / app evidence。

## 当前结论

OPL 当前开发应按 framework-first 执行，而不是先拿单个 domain 的真实交付 soak 当主线验收。

当前顺序是：

1. 先把 OPL 做成完整智能体框架：stage attempt、provider runtime、typed queue、wakeup、retry/dead-letter、approval/human gate、receipt/projection、shared lifecycle/index primitive。
2. 再把 MAS/MAG/RCA 迁移为 OPL-admitted domain agents：统一 skeleton、stage descriptor、sidecar export/dispatch、owner receipt、artifact locator、projection builder、authority refs，并保持 direct skill path 等价。
3. 同步把新旧功能逐块分类、迁移、分层或沉淀：domain truth 留在 domain；framework-generic lifecycle/index/restore/retention 上收到 OPL；local diagnostics 和 evidence surfaces 显式降级。
4. 旧 Hermes/Gateway/frontdoor/local-manager/default-compat wording 和重复 UI / runtime 入口，在替代证据存在后退役清理。
5. 最后用 MAS paper line、MAG grant stage、RCA visual stage 和 OPL App workbench 做真实 E2E / domain soak，验证目标形态。

这里的“最后测试”指真实 provider/domain/app 验收。每个代码、contract、provider、projection 或 cleanup 步骤仍必须跑对应 focused tests 和 repo-native verification。

## 内容线路

| 顺序 | 线路 | 当前 owner | 当前实际要做 |
| --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | OPL roadmap + Runtime Manager / provider contracts | 完成 Temporal/provider readiness、stage attempt ledger、workflow/activity/signal/query、typed queue、retry/dead-letter、human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `2` | `domain_framework_migration` | OPL + MAS/MAG/RCA domain repos | 统一 domain-agent skeleton、stage descriptor、sidecar/receipt、artifact locator、projection builder、authority refs；证明 direct skill path 与 OPL-hosted path 共享 owner receipts。 |
| `3` | `feature_partition_and_retirement` | OPL active docs + domain owner docs | 把 framework-generic 能力上收到 OPL，把 domain-specific truth 留在 domain；退役 Hermes/Gateway/frontdoor/local-manager/MDS-default 等旧默认面。 |
| `4` | `opl_app_runtime_workbench` | OPL App / Runtime Manager | 展示 provider readiness、stage attempt、domain status、human gate、action receipt、artifact refs 和 source refs；不重写 domain truth；stage-attempt workbench 当前已提供只读分组、过滤键、attention counters 和 memory-ref counters，供 App 面板筛选。 |
| `5` | `domain_soak_and_acceptance` | Domain repos + OPL provider | 在迁移后目标形态下做 MAS/MAG/RCA 真实或 controlled soak，证明 progress delta、quality gate movement、human gate、stop-loss 或 typed blocker。 |
| `6` | `new_domain_admission` | OPL domain admission + candidate domain repos | 新 domain 只按 skeleton/descriptor/locator/authority boundary 接入，不复制旧 gateway/frontdoor 路线。 |

## 合并与退役规则

| 内容类型 | 归属 |
| --- | --- |
| stage attempt、provider runtime、queue、signal/query、retry/dead-letter、approval transport | OPL framework / Runtime Manager |
| lifecycle ledger、artifact locator/index、retention、restore proof、migration ledger、workspace lifecycle metadata | OPL framework primitive |
| MAS study truth、publication gate、evidence/review ledger、manuscript/package authority | MAS |
| MAG grant strategy、fundability / proposal quality、specific aims authority | MAG |
| RCA visual direction、creative artifact generation、review/export gate | RCA |
| old gateway/frontdoor/Hermes-first/local-manager default wording | retire / history / compatibility archive after replacement proof |
| external framework learning | references only until promoted into contracts/source/active owner docs |

## 优先级规则

1. Framework-first：OPL 完整智能体框架是 domain migration 和真实 domain soak 的前置条件。
2. 迁移优先于验收：真实 soak 应验证迁移后的目标形态，不应验证即将退役的旧路径。
3. 清理是迁移收口：旧默认路径不应无限期保留；删除前必须证明无 default caller、无 fixture/provenance 必需、已有 replacement diagnostic/history link。
4. App workbench 跟随 framework：App 展示 framework/provider + domain owner receipts 和只读 stage-attempt 分组/过滤元数据；不成为第二 truth source，也不成为 domain action loop。
5. Domain authority 不迁出：OPL 可以持有 refs、receipts、attempt history、projection 和 lifecycle metadata；质量、业务真相和最终 artifact authority 留在 domain。

## 完成信号

| 线路 | 完成信号 |
| --- | --- |
| `opl_framework_foundation` | OPL provider/framework 能稳定承载 stage attempt、queue/wakeup、retry/dead-letter、approval/human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `domain_framework_migration` | MAS/MAG/RCA 通过统一 skeleton/descriptor/locator/receipt 接入；direct path 与 OPL-hosted path 共享 domain owner receipts。 |
| `feature_partition_and_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；保留项都有明确 owner 和用途。 |
| `opl_app_runtime_workbench` | OPL App 能从一个工作台读取 provider、stage attempt、domain progress、human gate、artifact refs、source refs、safe action receipts 和 stage-attempt 分组/过滤摘要。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实或 controlled progress delta、quality gate movement、human gate、stop-loss 或 typed blocker。 |

## 规划文档落点

- `docs/active/`：当前执行地图、runtime/activation/shared-boundary 支撑文档。
- `docs/active/development-document-portfolio*`：开发文档组合整理入口；旧开发文档按内容块吸收、保留、降级、退役或归档时先读这里。
- `docs/references/runtime-substrate/`：runtime/provider/executor 参考、roadmap、Temporal provider 支撑计划、legacy migration material。
- `docs/public/`：面向用户和外部读者的公开路线图与产品方向。
- `docs/specs/`：仍活跃的 runtime/product-boundary 规格入口；当前为空时回到核心五件套、`docs/active/`、runtime-substrate roadmap 和机器可读合同。
- `docs/history/`：退役路线、旧计划、dated snapshot、compatibility / frontdoor / gateway 归档。

如果内容仍决定“接下来按什么顺序做、什么算完成”，优先放 `docs/active/` 或当前 roadmap owner；如果只是背景或对照，放 `docs/references/`；如果只保存来龙去脉，放 `docs/history/`。
