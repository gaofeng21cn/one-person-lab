# OPL 生产级框架闭环差距矩阵

Owner: `One Person Lab`
Purpose: 记录 OPL 距离完整生产级智能体框架的当前差距、证据和下一跳闭环。
State: `active_support`
Machine boundary: 本文是人读 program / gap matrix。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / app evidence。
Date: `2026-05-12`

## 当前判断

如果把理想状态定义为“OPL 能生产级托管 MAS/MAG/RCA 的长时间 stage attempt，同时 direct skill path 等价、domain truth 不迁出、旧默认面退役干净”，当前约为 `60-70% framework/control-plane landed`，仍有 `30-40% production closure remaining`。

这个比例是工程判断，不是测试分数。已落地部分主要是 framework 骨架和控制面：shared contracts、domain descriptors、Temporal provider code、本机 service lifecycle、worker lifecycle contract、repo-native Temporal live proof、typed family queue、stage attempt ledger、Codex runner repo/test harness、Agent Executor Adapter、Aion stage-attempt workbench projection，以及 MAS/MAG/RCA descriptor alignment。

未闭合部分集中在 production closure：production Temporal residency、真实长时 domain activity soak、MAS/MAG/RCA domain owner receipt chain、domain memory apply 泛化、OPL lifecycle guarded apply 跨域实证、domain repo physical skeleton layout，以及 active-path legacy residue 的最终物理退役。

## Closure Gap Matrix

| gap | 当前已落地 | 未闭合证据 | 下一跳完成门槛 |
| --- | --- | --- | --- |
| `production_temporal_residency` | Temporal provider code、`family-runtime service start|status|stop --provider temporal`、worker lifecycle contract、`residency proof --provider temporal --live` repo-native Temporal server + real worker proof、`--production` fail-closed typed blocker surface。 | 仍缺外部或本机 managed Temporal service / worker 的长时 residency、restart 后连续 re-query、operator repair loop 和真实 domain attempt 压测证据。 | `residency proof --provider temporal --production` 在真实配置下返回 production proof receipt，并能持续证明 service reachable、worker ready、workflow query/signal/history 和 typed closeout boundary。 |
| `mas_paper_line_guarded_apply_soak` | MAS 三条真实 paper line 已有 OPL-ingestable closeout / owner ref surface；MAS 侧 provider guarded apply receipt 与 DM002 route-memory consumed/writeback receipt chain 已落地；OPL 禁止写 MAS truth 的边界可见。 | 仍缺生产 Temporal attempt 长时托管真实 MAS owner chain，逐条 paper line 留下 sidecar dispatch receipt、MAS owner receipt、artifact/gate/reviewer/route/human-gate/stop-loss evidence 或 typed blocker。 | DM002、DM003、Obesity 各自产出 provider-hosted guarded apply receipt 或 typed blocker；OPL 只持 attempt/proof/ref，不写 `publication_eval`、`controller_decisions`、artifact gate、review ledger、memory body 或 final verdict。 |
| `domain_memory_apply_generalization` | `family-domain-memory-ref` / `family-domain-memory-writeback` descriptor 已三仓 resolved；attempt query/workbench 可投影 consumed memory refs、writeback receipt refs 与 rejected writes；DM002 route-memory receipt chain 已存在。 | 仍缺 MAG/RCA 的 accepted/rejected writeback receipt 泛化、真实 memory body migration / retrieval / writeback apply，以及按 domain/stage 分组的 operator proof。 | 三仓都能用 domain-owned surface 产出 memory consumed/writeback receipt；OPL 只展示 locator、attempt/proof/ref 和 blocker，不写 memory body 或 accept/reject truth。 |
| `lifecycle_guarded_apply` | OPL lifecycle schema / locator / owner-route primitives 已落地，MAS lifecycle 经验已拆成 framework-generic 与 domain-specific 方向。 | cleanup/restore/retention 仍缺跨 MAS/MAG/RCA 的 guarded apply proof；domain-owned artifact 删除或重写仍必须返回 domain receipt requirement 或 typed blocker。 | OPL-owned ledger/locator 可以 apply；domain-owned artifact mutation 必须有 domain receipt 或 typed blocker；三仓 adapter 只暴露 locator、receipt、blocker。 |
| `mag_controlled_soak` | OPL controlled apply contract projection 已开放；MAG manifest、standard skeleton、controlled memory apply proof 与 controlled soak typed blocker surface 已对齐到 domain receipt / no-regression evidence required。 | MAG 仍未产出真实 grant-stage domain owner receipt 或 no-regression evidence，不能声明 production soak success。 | MAG controlled attempt 返回 domain receipt、no-regression evidence 或 typed blocker；grant truth、fundability verdict 与 submission-ready authority 仍归 MAG。 |
| `rca_controlled_soak` | OPL controlled visual apply contract projection 已开放；RCA product-entry、sidecar、standard skeleton、controlled memory apply proof、runtime architecture alignment 与 controlled soak typed blocker surface 已对齐到 domain receipt / no-regression evidence required；既有 PPT review helper line-budget 债已登记 reviewed baseline。 | RCA 仍未产出真实 visual-stage domain owner receipt 或 no-regression evidence，不能声明 production soak success；review helper baseline 后续仍需独立拆分消除。 | RCA controlled visual attempt 返回 domain receipt、no-regression evidence 或 typed blocker；visual verdict、export gate 与 canonical artifact authority 仍归 RCA。 |
| `physical_skeleton_layout` | OPL agents read model 已能区分 `descriptor_readiness`、`physical_skeleton_layout_audit` 与 `production_closure_gaps`；MAS/MAG/RCA 当前 descriptor-level aligned。 | 三仓 repo-source 目录仍未统一成完整 `agent/`、`contracts/`、`runtime/`、`docs/` physical skeleton；直接移动仍可能破坏 direct skill path 或 provenance refs。 | direct skill path、OPL-hosted path、restore/provenance proof、focused tests 与 no-forbidden-write proof 都稳定后，逐仓迁移 repo-source schema/adapter/builder/prompt/skill/knowledge refs；workspace/runtime artifacts 不迁入 repo skeleton。 |
| `legacy_active_path_retirement` | 默认语义已转为 Codex-default executor + Temporal-backed provider；active-path residue scan 已证明当前保留旧名只落在 explicit adapter、diagnostic、fixture、provenance、history 或 `retire_after_parity` 语境。 | Hermes/Gateway/frontdoor/local-manager/MDS/default-compat vocabulary 的部分物理残留仍需等待无 active caller、direct-skill parity 与 domain fixture/provenance 需求闭合。 | replacement proof 与 no-active-caller proof 同时通过后，删除 active residue 或迁入 history/tombstone；保留项必须有明确 adapter/provenance/test/diagnostic 语境。 |

## 统一口径

当前可以写成“OPL 已经具备完整生产级智能体框架的控制面骨架”，不能写成“OPL 已经全量生产可用”。准确边界是：framework contracts、runtime provider code、attempt ledger、executor adapter、domain descriptors 和 workbench projection 已落地；production residency、真实 domain owner receipt chain、domain memory apply 泛化、physical skeleton layout 和 legacy physical retirement 仍是未完成闭环。

后续实现不需要再新建平行大计划。下一跳应直接围绕 `Temporal production residency -> MAS paper-line guarded apply soak -> domain memory/lifecycle apply generalization -> MAG/RCA controlled soak -> physical skeleton layout -> legacy physical retirement` 收口，每一步都必须留下 repo-native verification、domain owner receipt 或 typed blocker。
