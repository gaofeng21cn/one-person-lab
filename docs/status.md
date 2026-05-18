# OPL 当前状态

更新时间：`2026-05-18`

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整智能体开发/运行框架，持有 Codex-default session/runtime、activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated surface 和跨仓治理。
- `One Person Lab App` 是面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source refs、artifact refs、memory refs、SLO、repair 和 owner-aware action。
- `Foundry Agents` 当前包括 `MAS`、`MAG`、`RCA`。它们持有各自的 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt 和 direct app skill path。

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、Claude Code 等只能作为显式非默认 executor adapter 接入，并用 receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 等价。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

当前 OPL 已具备 framework 主干：

- domain descriptor / stage / action / memory discovery；
- Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout；
- production closeout read model、provider proof / SLO projection、runtime snapshot 和 operator item；
- functional runtime harness、generic substrate projection、domain pack compiler handoff、private functional audit read model；
- Agent Lab control plane、managed checkout-clean command runner、standard domain-agent scaffold 和 family docs taxonomy。

MAS/MAG/RCA 当前均可被 OPL 识别为 standard domain agent consumer。这个状态只能说明 descriptor、read model、handoff 和部分 replacement surface 已经存在；不能写成 production domain owner chain 已闭合，也不能写成四仓功能/结构差距归零。

当前 active gap 与实施顺序以 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md) 和 [生产级框架闭环差距矩阵](./active/production-framework-closure-gap-matrix.md) 为准。dated proof、receipt 明细和阶段 closeout 流水保存在 [OPL family 文档过程归档 2026-05](./history/process/plans/2026-05-18-opl-family-doc-process-history.md)，不在本页展开。

## 当前功能/结构差距

OPL 当前不能写成 `functional_structure_gap_count=0`。仍需关闭的功能/结构差距是：

1. `generated_surface_production_consumption`
   OPL pack compiler / generated surface 已有 handoff read model，但 MAS/MAG/RCA 的生产默认 caller 还没有全面迁到 OPL generated/hosted CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness。

2. `app_workbench_drilldown`
   generic read model 已覆盖“怎么看”，但 One Person Lab App 还需要把 route graph、review queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness、SLO 和 action routing 做成人可用 drilldown。

3. `lifecycle_artifact_memory_reconciliation`
   OPL-owned locator、retention、restore ledger、refs-only index 与 domain-owned artifact mutation / memory writeback receipt 还需要持续对账和真实 workspace consumption。

4. `provider_slo_repair_cadence`
   Temporal 是 production 默认 provider，当前 proof/readiness 可读；自动或受监督 cadence、overdue repair execution receipt、restart/re-query/signal/history 长窗口证据仍需闭合。

5. `domain_private_platform_residue`
   MAS/MAG/RCA 内仍有历史手写 shell、sidecar、status、workbench、session、lifecycle、memory/artifact transport、observability 或 wrapper 作为迁移桥存在。它们必须按 OPL 上收、generated surface 替换、refs-only 收薄、minimal authority function 或 tombstone 分类处理。

6. `legacy_physical_cleanup`
   Hermes/Gateway/frontdoor/local-manager/MDS-default/default-compat 等旧面只有在 provenance、diagnostic、fixture、negative guard 或 history 语境中可见。active caller 迁走并具备 replacement parity / no-active-caller / tombstone proof 后，旧模块、接口、alias、facade 和 compatibility tests 直接退役。

## 当前测试/证据差距

下面是目标结构正确后的证据门，不能替代功能/结构迁移：

- MAS 多条真实 paper line 的 provider-hosted guarded apply、progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker。
- MAG 真实 OPL-hosted grant-stage controlled soak、owner receipt、typed blocker 或 no-regression evidence。
- RCA 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 repeated no-regression evidence。
- Memory / artifact / lifecycle 在真实 workspace 中形成 accepted/rejected writeback、cleanup/restore/retention 和 artifact mutation receipt。
- Temporal provider 长时 SLO、repair execution receipt、restart/re-query/signal/history 与 no-forbidden-write proof。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` 管理 Codex CLI、provider profile/readiness、module install/update、skill sync 和 local runtime state。
- `opl agents descriptors` 是当前 domain-agent 总入口；专题 drilldown 继续由 agents/stages/actions/domain-memory/substrate/runtime/Agent Lab 等命令承担。

## 当前 Foundry 产品线

| 产品家族 | 当前实现 | 当前覆盖范围 | 状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 基金方向判断、申请书写作、修订工作 | 活跃 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `IP Foundry` | Planned | 专利申请、技术交底、权利要求、实施例整理 | 定义阶段 |
| `Award Foundry` | Planned | 科技奖、成果奖和荣誉材料 | 定义阶段 |
| `Thesis Foundry` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Foundry` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前维护边界

- 当前事实优先读 `project / architecture / invariants / decisions / status`、contracts、source、CLI/API、runtime ledger、provider receipt 和 domain-owned manifest。
- `docs/**` 是中文内部开发与维护参考，不作为机器接口；需要关联人读材料时使用 schema/source/contract path 或 `human_doc:*` 语义 ID。
- `docs/active/` 承接当前差距、当前计划和当前执行顺序；`docs/references/` 承接目标态和支撑参考；`docs/history/` 承接历史归档、完成计划、旧路线、tombstone 和 proof 流水。
- `opl-aion-shell/docs` 属上游 AionUI 依赖文档，不纳入 OPL/MAS/MAG/RCA docs taxonomy 治理。

## 当前不能声明

- 不能声明 OPL 已全量生产可用。
- 不能声明 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能声明 private functional audit 分类完成就等于物理代码路径清零。
- 不能声明 OPL pack compiler handoff read model 已经被四仓生产 caller 全面消费。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 参考入口

- [文档索引](./README.md)
- [项目概览](./project.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
