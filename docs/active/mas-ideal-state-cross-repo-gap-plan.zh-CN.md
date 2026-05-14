# MAS 理想态跨仓差距与完善计划

Owner: `One Person Lab / MedAutoScience boundary`
Purpose: 以 MAS 理想目标态为参照，记录 OPL、MAS、MAG、RCA、One Person Lab App 与 MDS/DeepScientist 当前实际状态、差距和完善计划。
State: `active_support`
Machine boundary: 本文是人读 gap / execution plan。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App 证据。
Date: `2026-05-14`

## 结论

MAS 理想态给出的 family 校准是：MAS 不应长期维护一套通用 agent OS；MAS 应成为医学研究 `Domain Knowledge / Authority Pack`，持有医学 stage pack、研究路线知识、publication-route memory、AI reviewer / quality rubric、artifact authority、owner receipt 和 domain projection。通用 runtime、queue、human gate transport、memory locator/index、artifact lifecycle、restore/retention、workbench shell、route graph renderer、observability/SLO 和 repair command projection，应尽量上收到 OPL Framework / One Person Lab App。

对照当前各 repo，结论分三层：

1. `Descriptor / skeleton / projection` 层已经基本对齐：OPL 能解析 MAS/MAG/RCA 三个 domain agent，三仓 stage plane、action catalog 和 domain-memory descriptor 都 resolved。
2. `Functional surface` 层已进入可用但证据化不足状态：OPL provider proof、stage attempt ledger、MAS sidecar / functional closure projection、MAG/RCA sidecar receipt/no-regression evidence refs、route decision graph projection 都已经能被读模型消费，但多数仍是 refs、typed blocker、no-regression evidence 或只读图投影，不是 domain owner 长时执行成功。
3. `Production evidence` 层仍是主缺口：真实 provider-hosted domain activity long soak、MAS paper-line owner chain、MAG grant-stage owner receipt、RCA artifact-producing owner receipt、真实 memory body/writeback receipt、artifact lifecycle apply、App route/decision 产品化 drilldown 和 legacy physical cleanup 还没有闭合。

当前计划不应再新增一套平行大路线。后续工作应按 owner 分流：OPL 上收通用 primitives，MAS 收窄医学研究 authority，MAG/RCA 对齐同一 Foundry Agent 形态，App 只做通用用户工作台，MDS/DeepScientist 保持 archive/oracle/intake reference。

## Fresh Evidence

本轮文档基于以下 fresh checks 和 repo 状态：

| surface | fresh result | 读法 |
| --- | --- | --- |
| OPL `git status --short` | `docs/active/current-state-vs-ideal-gap.zh-CN.md` 与 `docs/references/runtime-substrate/opl-family-agent-ideal-state.zh-CN.md` 已有本轮未提交修改 | 本文在已有 OPL 理想态 / gap 文档基础上新增，不把未提交文档写成发布后事实。 |
| MAS `git status --short` | MAS 当前有 `mas_ideal_state`、status、current lines、sidecar / closure projection 相关未提交改动 | MAS 理想态和 functional closure projection 是当前本地工作区事实；后续提交前仍需 MAS 自身验证和收口。 |
| MAG / RCA / MDS `git status --short` | MAG 当前有 `docs/plans/` 规划文档改动；RCA / MDS 本轮读取时 clean | MAG 当前未提交规划文档不改变 OPL read model；这些仓的 domain 状态仍来自各自 status/project 入口、manifest 与 OPL read model。 |
| OPL App `docs/` | 当前没有 `docs/status.md`；active OPL fork boundary 主要在 root README、`AGENTS.md`、`docs/architecture/opl-gui-shell-maintenance.md`、guides/contributing | App 仍是 OPL-branded AionUI fork / workbench shell；repo 内缺少与 OPL 主仓同构的 status/core five docs 是产品治理缺口。 |
| `./bin/opl agents list --json` | `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`、`production_closure_gap_count=12`、`provider_temporal_residency_gap_status=closed_by_fresh_proven_proof` | MAS/MAG/RCA descriptor / skeleton 层已对齐；Temporal provider residency gap 已由 fresh proof 关闭；production closure 仍有跨仓 live evidence 缺口。 |
| `./bin/opl agents descriptors --json` | `descriptor_surfaces_resolved_count=3`、`memory_descriptor_resolved_count=3`、`stage_control_plane_resolved_count=3`、`action_catalog_resolved_count=3`、`production_closure_gap_count=12`、`provider_temporal_residency_gap_status=closed_by_fresh_proven_proof` | OPL unified descriptor read model 已能读三仓 stage/action/memory surface；它仍只持 refs、readiness 和 authority boundary，不承载 domain truth 或 memory body。 |
| `./bin/opl framework production-closeout --json` | `status=functional_closure_ready_for_live_soak`、`typed_blocker_count=0`、`resolved_manifest_count=3`、`stage_attempt_count=4`、`provider_continuous_proof.latest_closeout_status=production_residency_proven` | OPL functional closeout gate 当前无阻断型 typed blocker；下一层仍是 live soak、domain owner chain、memory body/writeback apply 和 artifact lifecycle evidence。 |
| `./bin/opl runtime snapshot --json` | snapshot 为 `needs_attention`，默认 provider 是 `local_sqlite`；`running_items=0`、`attention_items=7`、`stage_attempt_workbench.summary.total=4`，并已有 `route_decision_graph.availability=available` | App/Workbench 有可消费 read model 和 route/decision 图投影；当前没有 running domain attempt，provider proof / route projection 都不等于 domain ready。 |
| MAS status/current lines | MAS 当前 `mas_functional_closure_status_projection` 为 `functional_surfaces_projected_production_evidence_gated`，并显式声明 `publication_closure_claimed=false` | MAS repo 内 planning/projection/function surface 已收口；真实 paper-line production evidence gate 仍待跑。 |
| MAG status/project | MAG 已是 OPL-compatible Foundry Agent，具备 6-stage grant plane、sidecar export/dispatch、owner receipt contract、domain-memory receipt evidence writer、lifecycle proof、skeleton anchors | MAG 缺真实 OPL-hosted grant-stage long-run/no-regression proof，不缺 descriptor。 |
| RCA status/project | RCA 已是 OPL-compatible Foundry Agent，direct route landed，OPL-hosted route contract/projection landed，image-first route 默认，sidecar/no-regression evidence refs 已可写 | RCA 缺真实 visual-stage long soak、artifact-producing owner receipt 和 reusable visual lesson body writeback。 |
| MDS status/project | MDS 是 frozen source archive、historical fixture、explicit legacy diagnostic target 与 upstream intake reference | MDS 不应补成 active Foundry Agent；差距是继续收缩 archive/diagnostic 残留。 |

## 目标边界

| 能力族 | 理想 owner | 当前主要缺口 | 完善方向 |
| --- | --- | --- | --- |
| Provider-backed runtime | OPL Framework | provider proof 已可见，但真实 domain activity long soak 不足 | OPL 继续证明 Temporal service/worker、query/signal、retry/dead-letter、restart recovery；domain 只回传 owner receipt 或 typed blocker。 |
| Queue / human gate | OPL Framework + domain owner semantics | queue/attempt ledger 可用，human gate/resume 进入 domain owner chain 的运行证明不足 | OPL 做 transport、resume token、operator ledger；MAS/MAG/RCA 定义 gate 边界、stop-loss、next owner。 |
| Memory locator/index | OPL shared primitive + domain memory owner | 三仓 descriptor resolved，但真实 memory body/writeback receipt 仍不足 | OPL 上收 locator/index/freshness/grouping；domain 保留 body、accept/reject、writeback receipt。 |
| Artifact lifecycle | OPL lifecycle primitive + domain artifact authority | locator/proof 已有，真实 cleanup/restore/retention apply 证据不足 | OPL 做 registry、retention、restore refs、migration ledger；domain 授权 mutation 并回传 receipt。 |
| Workbench / route graph | OPL App + domain projection | OPL runtime snapshot 已有 route/decision graph projection，但 App 侧交互式 drilldown、路线解释和 action owner 体验未产品化 | OPL/App 提供通用 shell 和 graph renderer；domain 输出 route nodes/edges、rationale、source refs。 |
| Observability/SLO | OPL shared observability + domain read model | provider proof freshness 可见，domain SLO / blocker / repair command 分组仍不足 | OPL 上收 trace/log/event/freshness/SLO/stale scan；domain 提供 safe repair hint 和 authority boundary。 |
| Quality / final authority | Domain agents | OPL read model 容易被误读为 ready verdict | 所有 publication/fundability/visual quality/export verdict 只来自 MAS/MAG/RCA owner surface。 |

## Repo 差距矩阵

| Repo | 当前已成立 | 离 MAS 理想态 / family 理想态的差距 | 完善计划 |
| --- | --- | --- | --- |
| `one-person-lab` | OPL 三层产品认知成立；MAS/MAG/RCA descriptor aligned；Temporal provider proof、stage attempt ledger、runtime snapshot、route decision graph projection、production closeout 和 family descriptors 已可用。 | 通用 primitives 仍偏 read-model / receipt-ref / typed-blocker / graph projection 层；真实 domain owner chain、memory/lifecycle live apply、route graph productization、operator SLO 和 legacy physical cleanup 未闭合。 | 先上收 MAS 暴露出的 generic primitives：provider workflow、queue/human gate、memory locator/index、artifact lifecycle、route graph shell、observability/SLO；用 MAS/MAG/RCA refs/receipts/typed blockers 做跨仓验收。 |
| `med-autoscience` | MAS 理想态已明确；stage-led autonomy、publication-route memory、stage surface、stage review locator、sidecar export/dispatch、functional closure projection 和 OPL proof ingestion 已落地到 repo surface。 | MAS 仍不能声明 OPL production-hosted paper automation 已闭合；真实 paper-line owner receipt chain、human gate/resume、domain activity long soak、更多 accepted/rejected memory receipts 和 legacy physical cleanup 未完成。 | 把 MAS 收窄为医学研究 authority pack：继续跑 DM002/DM003/Obesity 等真实 paper-line guarded apply；产出 artifact delta、gate replay、AI reviewer update、route decision、human gate、stop-loss 或 typed blocker；把通用 runtime/lifecycle/workbench 需求交给 OPL。 |
| `med-autogrant` | MAG 是 clean OPL-compatible Grant Foundry Agent；6-stage grant control plane、sidecar、domain-memory receipt evidence writer、owner receipt contract、lifecycle proof 和 skeleton anchors 已有。 | 还缺真实 OPL-hosted grant-stage attempt 的 domain owner receipt / no-regression evidence；grant strategy memory body/writeback apply 泛化不足；legacy active-path 物理清理仍需 no-active-caller proof。 | 对齐 MAS 的 authority-pack 模式：MAG 只保留 fundability、proposal quality、submission-ready export authority；OPL 提供 runtime/memory/lifecycle/workbench shell；下一步跑真实 grant-stage controlled attempt 和 lifecycle guarded apply receipt。 |
| `redcube-ai` | RCA 是 clean OPL-compatible Presentation Foundry Agent；direct route landed；OPL-hosted route contract/projection landed；image-first PPT/XHS route、sidecar/no-regression evidence refs、lifecycle proof、skeleton follow-through 已有。 | 还缺真实 OPL-hosted visual-stage long soak、artifact-producing owner receipt、visual pattern memory body writeback 和 App-level visual artifact drilldown。 | RCA 保留 visual direction、review/export verdict 和 artifact authority；OPL 提供 provider/queue/lifecycle/workbench primitives；下一步跑真实 controlled visual stage attempt，并把 artifact-producing receipt / typed blocker 接入 OPL closeout。 |
| `opl-aion-shell` | 当前是 OPL-branded AionUI fork；docs index 明确 OPL fork active docs 和 `opl-gui-shell-maintenance` owner。 | 缺与 OPL 主仓同构的 current status / product workbench gap doc；route/decision graph、stage-attempt drilldown、domain receipt/artifact mutation drilldown、action owner routing 的产品化仍不足。 | 不让 App 成为 runtime/domain truth owner；补 App 侧 OPL product workbench status 文档或架构说明，产品化 route graph shell、attention queue、domain/stage/route/memory/artifact drilldown 和 safe action owner routing。 |
| `med-deepscientist` | MDS 已收缩为 MAS 的 frozen source archive、historical fixture、explicit legacy diagnostic target 与 upstream intake reference；不是 OPL active domain agent。 | 旧 daemon/WebUI/quest layout/connector/docs/runtime home/compat namespace 仍作为 archive/diagnostic/fixture surface 存在；可能被误读成 MAS 默认 backend 或 OPL stage adapter。 | 保持 MDS 不进入 Foundry Agent admission；只做 provenance/oracle/intake；等 MAS replacement proof、parity proof 和 no-active-reference 成立后，逐步物理删除或 tombstone 旧面。 |

## 完善计划

### Lane 1：OPL generic primitive absorption

Owner: `one-person-lab`

目标：把 MAS 理想态中不该由 domain agent 私有维护的通用能力上收到 OPL。

实施单元：

1. `provider_workflow_core`：继续把 Temporal service/worker、stage attempt、query/signal、heartbeat、retry/dead-letter、restart recovery 和 provider receipt 做成 OPL-owned contract。
2. `queue_human_gate_transport`：把 typed queue、approval transport、resume token、human gate signal、operator action ledger 和 handoff history 做成 family primitive。
3. `memory_locator_index`：把 domain memory descriptor discovery、locator/index、freshness、body-free inventory、consumed refs、writeback proposal/ref transport 和 App grouping 上收。
4. `artifact_lifecycle`：把 artifact locator、runtime artifact root registry、retention、safe cleanup、restore proof、migration ledger 和 lifecycle projection 上收。
5. `route_graph_shell`：固化通用 route/decision graph renderer，只渲染 domain projection，不推断路线。
6. `observability_slo`：统一 trace/log/event/freshness/SLO/stale scan/repair command projection。

验收：

- OPL 只写 framework-owned metadata / ledger / refs；
- MAS/MAG/RCA 返回 owner receipt、typed blocker、no-regression evidence 或 authority refs；
- closeout gate 能区分 provider completion、domain ready、quality verdict 和 artifact authority；
- App/CLI 能 drill down 到 source refs 和 action owner。

### Lane 2：MAS authority-pack hardening

Owner: `med-autoscience`

目标：让 MAS 从“医学研究 domain agent + 部分通用外围实现”进一步收窄为医学研究 `Domain Knowledge / Authority Pack`。

实施单元：

1. `paper_line_provider_apply`：用 DM002、DM003、Obesity 等真实 paper line 跑 provider-hosted guarded apply。
2. `owner_receipt_chain`：每条 paper line 留下 MAS owner receipt、artifact delta、gate replay、AI reviewer update、route decision、human gate、stop-loss 或 stable typed blocker。
3. `publication_memory_receipt_scaleout`：扩展真实 accepted/rejected publication-route memory receipts，保持 memory body 在 MAS workspace。
4. `stage_review_live_followthrough`：让真实 provider apply 持续产出 Stage Review Page / Index refs。
5. `generic_need_handoff_to_opl`：把 runtime、memory locator、artifact lifecycle、workbench、observability 需求转成 OPL primitive issue，而不是继续在 MAS 内复制。
6. `legacy_cleanup`：按 legacy residue audit 做 no-active-caller scan、replacement proof、physical delete 或 tombstone。

验收：

- `provider_completion_is_paper_closure=false` 保持成立；
- publication/artifact/quality verdict 只来自 MAS owner surface；
- OPL 可消费 refs/receipts，但不能写 MAS truth、memory body、current package 或 publication eval。

### Lane 3：MAG/RCA authority-pack parity

Owner: `med-autogrant`, `redcube-ai`

目标：让 MAG/RCA 按 MAS 的边界校准为纯 domain authority pack，不再重复 OPL 通用平台能力。

实施单元：

1. MAG 跑真实 OPL-hosted controlled grant-stage attempt，返回 domain owner receipt、typed blocker 或 no-regression evidence。
2. MAG 把 grant strategy memory 从 descriptor/proof 推进到真实 workspace accepted/rejected receipt，并保持 fundability/submission-ready authority 在 MAG。
3. RCA 跑真实 OPL-hosted controlled visual-stage attempt，返回 artifact-producing owner receipt、typed blocker 或 no-regression evidence。
4. RCA 把 visual pattern memory 从 descriptor/proof 推进到 runtime writeback，保持 visual route/review/export authority 在 RCA。
5. 两仓都继续把 cleanup/restore/retention guarded apply 交给 domain receipt，不让 OPL 直接改 artifact truth。

验收：

- 两仓 direct skill path 与 OPL-hosted path 使用同一 domain owner surface；
- no-forbidden-write proof 能覆盖 memory body、artifact blob、quality/export verdict；
- OPL closeout 只消费 typed refs。

### Lane 4：One Person Lab App workbench productization

Owner: `opl-aion-shell` + `one-person-lab`

目标：把 MAS 理想工作台中的“研究路线地图 / route decision trail”做成 family 通用体验。

实施单元：

1. `app_status_doc`：补 App 侧当前 product/workbench boundary 文档，明确 App 不是 runtime owner 或 domain truth owner。
2. `route_decision_graph`：产品化已有 OPL route/decision graph projection，渲染 domain-owned route map nodes/edges、decision rationale、superseded path、active/winning path 和 source refs。
3. `stage_attempt_drilldown`：把 provider proof、stage attempt、domain receipt、typed blocker、memory refs、artifact refs 放进同一 drilldown。
4. `attention_queue`：按 owner/action 分组展示 human gate、repair、provider wait、domain owner action。
5. `safe_action_routing`：所有按钮必须路由到 OPL CLI/provider signal/domain sidecar/direct skill，并返回 receipt 或 typed blocker。

验收：

- App 不产生 domain ready verdict；
- provider completion、domain blocker、quality verdict、artifact authority 分轴展示；
- 用户能直观看到“为什么转向、卡在哪里、谁负责、下一步能做什么”。

### Lane 5：MDS/DeepScientist archive contraction

Owner: `med-deepscientist` + `med-autoscience`

目标：保留 MDS 作为 MAS 能力吸收与 parity oracle，不让它回流成默认 runtime/backend/product。

实施单元：

1. `archive_inventory`：继续标明 daemon/WebUI/quest layout/connector/runtime home/compat namespace 的 archive/diagnostic/fixture 用途。
2. `promotion_gate`：任何 MDS surface 若要被 MAS 默认消费，先进入 runtime protocol / MAS owner implementation / parity proof。
3. `no_reflux_guard`：阻断 publication readiness、submission authority、medical research design、medical evidence interpretation、user-visible progress 回流到 MDS。
4. `physical_retirement`：有 replacement proof 和 no-active-reference 后，删除或 tombstone 旧面。

验收：

- MDS 不出现在 OPL active Foundry Agent list；
- MAS 默认 status/progress/publication/artifact/Portal 不要求 MDS checkout；
- upstream intake 只产生 MAS-owned implementation 或 reference record。

## 执行顺序

1. `OPL generic primitive absorption`
   先把通用 primitives 的 owner 明确并产品化，否则 MAS/MAG/RCA 会继续各自重复 runtime/memory/lifecycle/workbench 外围。

2. `MAS live paper owner chain`
   用真实 paper line 证明 OPL provider -> MAS sidecar -> MAS owner chain 能闭环；这条是 Research Foundry 的最高价值验收。

3. `Route / Decision workbench`
   旧 MDS/DeepScientist 给用户最直观的是研究路线感。OPL 已有 route decision graph projection，App 下一步应把 MAS route map / decision trail 产品化成可钻取的通用 route graph shell，再扩到 MAG/RCA。

4. `MAG/RCA production owner receipts`
   在 MAS 证明路径后，让 MAG/RCA 分别跑 grant-stage / visual-stage owner receipt 或 no-regression evidence。

5. `Memory and artifact lifecycle apply`
   三仓继续产出真实 accepted/rejected writeback receipts、cleanup/restore/retention receipts 和 artifact mutation permission receipts。

6. `Legacy physical cleanup`
   有 no-active-caller、replacement parity 和 provenance 后逐项删除；没有证据时只 tombstone，不把历史面重新提升为 active path。

## 当前不能写成

- 不能写成 MAS production-hosted paper automation 已闭合。
- 不能写成 OPL provider proof 等于 MAS/MAG/RCA domain ready。
- 不能写成 OPL 持有医学研究路线、fundability、visual quality、memory body 或 artifact authority。
- 不能写成 App 是 runtime owner 或 domain truth owner。
- 不能写成 MDS/DeepScientist 是新的 active Foundry Agent。
- 不能写成 descriptor aligned 等于真实 long-running domain soak 完成。
- 不能写成 read-only route graph 可以自动推断 domain route 或 quality verdict。

## 后续维护规则

- 这份文档记录跨仓差距和完善计划；当前事实仍先读各仓 `docs/status.md`、`docs/project.md`、OPL read models 和 domain manifests。
- 新增机器接口必须落在对应 repo 的 contract/schema/source/CLI/API/manifest/receipt surface，不落在本文 prose。
- 每次推进 lane 后，同步更新本文件的 repo gap、owner lane 和不能写成列表。
- Docs-only 更新使用 `git diff --check` 和链接/关键词 spot-check；改 machine-readable surface 时回到各仓 native verification。
