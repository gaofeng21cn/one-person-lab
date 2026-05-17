# OPL 系列项目开发主参考

Owner: `One Person Lab`
Purpose: `family_development_reference`
State: `active_support`
Machine boundary: 本文是人读开发参考。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-16`

## 结论

OPL 系列项目的理想态、差距和完善计划按两层维护：

1. `OPL` 仓维护全局目标、全局差距、上收边界、shared primitives、One Person Lab App/workbench 目标、domain admission 与跨仓开发顺序。
2. `MAS`、`MAG`、`RCA` 与后续 domain repo 维护本仓目标、当前差距、领域 authority、direct path、OPL-hosted path、sidecar/projection/receipt 边界，以及本仓哪些通用外围应上收到 OPL。

这份文档是 OPL 系列项目开发的总读法。它不替代各仓的当前状态、机器合同、运行证据或单仓计划；它只固定“计划放在哪里、谁负责什么、哪些内容上收、过时面如何处理、docs 目录如何按角色对齐”。

## 主参考阅读顺序

| 层级 | 入口 | 作用 |
| --- | --- | --- |
| OPL 全局目标态 | [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md) | 定义 OPL Framework、Foundry Agents、One Person Lab App、workspace/runtime artifact root 的 north-star。 |
| OPL 全局差距 | [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) | 记录 family-level 当前状态、production closure 缺口、全局完善顺序。 |
| OPL 当前路线 | [OPL 当前开发线路](./current-development-lines.md) 与 [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md) | 说明 framework-first 执行顺序、Temporal provider、standard domain-agent skeleton 与旧路线退役纪律。 |
| OPL 生产闭环矩阵 | [生产级框架闭环差距矩阵](./production-framework-closure-gap-matrix.md) | 承接跨仓 owner receipt、memory/lifecycle apply、operator workbench、legacy retirement 和 live soak gate；2026-05-14 一次性 functional closure plan 的活跃 follow-through 现在回到本矩阵。 |
| 单仓目标与计划 | 各 repo 的 `docs/references/*ideal*`、`docs/status.md`、`docs/active/`、`docs/runtime/`、`docs/delivery/` 或 `docs/source/` | 只维护本仓 domain truth、authority、direct/hosted 边界、单仓差距和上收清单；旧 `program` / `plans` / `capabilities` 目录不再作为默认落点。 |

## Owner 分层

### OPL 仓负责

OPL 仓负责所有 domain-neutral、跨 MAS/MAG/RCA 可复用、服务长期运行和产品工作台的能力：

- provider-backed stage runtime、Temporal provider、stage attempt ledger、queue、retry/dead-letter、signal/query、human gate transport 和 resume token；
- workspace/source intake shell、workspace registry、runtime artifact root locator、artifact locator、package/export lifecycle shell、restore/retention/migration ledger；
- domain memory locator/index、body-free inventory、writeback proposal/receipt transport、freshness 与 operator grouping；
- generic persistence / runtime lifecycle SQLite index、refs-only sidecar index、functional privatization audit read model、checksum/receipt ref registry 和 legacy diagnostic/tombstone projection；
- operator projection、attention queue、route/decision graph shell、review/repair queue shell、quality/readiness projection shell、observability/SLO 和 repair command projection；
- module install/update、skill sync、domain discovery、standard domain-agent skeleton、contract validation、no-forbidden-write proof 和 family release/shared helper；
- One Person Lab App 需要消费的通用 workbench contracts、action routing shell、runtime snapshot 和 drilldown 语义。

OPL 不负责 domain truth、domain quality verdict、publication/fundability/visual/export ready verdict、memory body、artifact mutation permission 或最终交付 authority。

当前继续应落在 OPL 层面的实现 / 硬化 backlog 是：

- generic state-machine runner：OPL 已持有 domain-neutral transition contract、runner 和 matrix runner；后续 OPL 层硬化应继续补幂等 tick、provider attempt bridge、retry / dead-letter、human gate transport、dispatch receipt 和 matrix audit。MAS/MAG/RCA 只声明各自的 domain transition table / guard / oracle fixture / owner action。
- provider SLO 与 repair-loop 执行证据：Temporal production proof 已有 read-model、supervised receipt 与 `family-runtime provider-slo tick --provider temporal` cadence executor；长期窗口内的周期性 proof 调度、repair execution receipt、restart / re-query / signal history SLO 仍应由 OPL runtime/provider 层闭合。
- stage activity bridge：OPL 负责从 typed queue 到 provider-backed stage attempt、sidecar dispatch、typed closeout ledger、owner receipt refs 与 typed blocker 的通用传输；真实 MAS paper、MAG grant、RCA visual owner receipt chain 继续由 domain owner 闭合。
- App / workbench 产品化：OPL App 负责把 workspace/source intake、artifact gallery、package/export lifecycle、route graph、review/repair queue、quality/readiness、observability/SLO、memory locator 和 action routing 这组通用 projection 做成人用 drilldown；domain repo 只提供 refs、verdict refs、route nodes/edges 和 receipts。
- memory / artifact / lifecycle transport：OPL 可实现 locator、body-free inventory、writeback proposal / receipt transport、retention / restore ledger 和 provenance shell；memory body、accept/reject、artifact mutation 和 package/export verdict 必须回到 domain receipt。
- functional privatization audit：OPL 持有统一读模型，读取 MAS/MAG/RCA manifest 里的私有化功能模块清单，并把每项归为 OPL replacement、domain thin adapter、domain authority 或 retire/tombstone；清单必须保留代码路径、active caller、迁移动作、保留理由或不能上收理由，避免把“仍有私有实现”误写成“已经干净”；domain repo 不能把 scheduler、persistence、native helper envelope、review/repair transport 等通用外围写成自己的长期 owner。
- physical skeleton / legacy follow-through gate：OPL 负责 no-active-caller、replacement parity、provenance retention、history/tombstone、no-retained-legacy-entry 与 delete readiness 的只读门禁；实际文件移动或删除由对应 repo owner 在 parity / provenance 证据齐备后执行。

### Domain repo 负责

MAS/MAG/RCA 这类 Foundry Agent repo 负责领域大脑、领域交付 authority 和 domain package 的薄程序面。这里的“薄程序面”是为了让 OPL 能发现、托管、审计和投影该 domain agent；它不构成第二套通用 framework/runtime。

- domain stage semantics、prompt、skill、knowledge pack、route policy、quality rubric、review gate 和 artifact gate；
- study/grant/visual truth、route decision、quality verdict、publication/fundability/visual/export authority；
- memory body、retrieval semantics、writeback proposal 的领域含义、accept/reject decision 和 owner receipt；
- canonical artifact/package/deck/manuscript/proposal authority、artifact mutation permission 和 export/submission gate；
- direct app skill path、domain CLI/MCP/API、descriptor、contract/schema、thin sidecar export/dispatch adapter、domain projection builder、domain transition spec/table、quality gate、artifact locator contract、receipt schema、tests 和 typed blocker；
- direct path 与 OPL-hosted path 的语义等价、no-forbidden-write、no-regression evidence 和 owner-chain 证据。

Domain repo 不应长期维护 generic scheduler、generic queue、generic attempt ledger、generic state-machine runner、generic workspace/source intake、generic memory locator、generic persistence engine、generic SQLite lifecycle index、generic artifact lifecycle、generic workbench、generic observability 或跨 domain App shell。需要 OPL 托管运行时，domain repo 声明 stage pack、transition spec、authority refs、receipt schema、projection builder、functional privatization audit 和 thin sidecar / adapter，由 OPL Framework 承载运行、恢复、排队、唤醒、索引、投影和审计。MAS 历史上的 `runtime_lifecycle.sqlite` 这类设计只可作为 domain sidecar reference adapter / file authority refs 继续被 OPL 消费，不能再作为 MAS-owned generic persistence layer 扩展。

反向盘点时，默认把 domain repo 中超出“定义 stage、知识/提示/质量 gate、domain receipt、thin sidecar/projection adapter”的模块列入 functional privatization inventory。若它是 transport、ledger、index、lifecycle、workbench、scheduler、runner、source intake、memory locator、artifact shell、review/repair envelope、native helper envelope 或 CLI/MCP/product shell，就先假定应上收到 OPL；只有当它直接承载领域判断、artifact/export authority、memory body/accept-reject、owner receipt 或 domain-specific helper implementation 时，才允许保留在 domain，并必须写清不能上收的原因。

单仓文档只写本仓目标、当前差距、与 OPL 的 owner boundary、哪些能力应上收、哪些能力必须保留在本仓。目录结构应与 OPL family taxonomy 保持同名一致，代码内部结构可以按领域实现差异保留，但 OPL-facing skeleton、docs taxonomy 和 owner boundary 应统一。不在 MAS 文档维护 MAG/RCA backlog，不在 MAG 文档维护 MAS/RCA backlog，不在 RCA 文档维护 MAS/MAG backlog。

gap plan 和开发计划的差距项必须拆成两类：`功能/结构差距` 记录 owner 边界、模块归属、接口退役、generated surface、目录/合同/调用链仍未到目标态的部分；`测试/证据差距` 记录真实 workspace receipt、provider-hosted apply、live soak、coverage、no-forbidden-write proof、regression proof、App drilldown evidence 等验收缺口。已经具备功能但缺少真实证据时，只能写进测试/证据差距；不能混写成“功能还没做”。

### App / Workbench 负责

One Person Lab App / Workbench 的目标、消费合同和边界由 OPL 主仓负责记录。当前 GUI shell 实现来自独立 `one-person-lab-app` 产品仓的 `shells/aionui/`，该目录作为 upstream-backed AionUI shell adapter 维护。拆分 closeout 已归档到 [One Person Lab App 仓库拆分 Closeout](../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)；当前 App/workbench 边界以 `docs/product/`、App 仓合同和真实 release artifact 为准。

它的产品工作台职责是：

- 展示 OPL runtime truth、provider proof、stage attempt、attention queue、domain projection、artifact refs、review/repair refs 和 action owner；
- 执行明确 owner 的 UI action routing：OPL CLI/provider signal、domain sidecar/direct skill、manual handoff；
- 保持 OPL fork overlay、upstream AionUI intake、packaging/update、bridge adapter 和本地 GUI shell 规则；迁移后这些规则应落在 App 仓顶层 contract 与 `shells/aionui/AGENTS.md`，避免 AionUI 规则主导 App 顶层。

App 不持有 OPL runtime，不持有 domain truth，也不把 provider completion 写成 domain ready verdict。

## 上收判断

判断一个能力是否应上收到 OPL，按下面规则：

| 问题 | 结论 |
| --- | --- |
| 是否能被 MAS/MAG/RCA 两个以上 domain 复用？ | 优先进入 OPL/shared primitive。 |
| 是否只是 transport、locator、index、ledger、projection、receipt ref、operator shell、UI shell 或 SLO？ | 优先进入 OPL/App。 |
| 是否是为了减少小文件、做 lifecycle/ref registry、projection cache 或 SQLite sidecar index？ | 优先进入 OPL refs-only persistence/lifecycle primitive；domain repo 只保留 file authority 与 receipt refs。 |
| 是否会判断研究路线、基金 fundability、视觉方向、质量、memory accept/reject 或 artifact/export readiness？ | 留在 domain repo。 |
| 是否会写真实 workspace artifact、memory body、manuscript、proposal、deck 或 package？ | 必须由 domain owner receipt 授权；OPL 只持 refs/ledger/projection。 |
| 是否只是旧 provider、旧 gateway、旧 wrapper、旧 alias 或旧 aggregate test 的兼容入口？ | 迁移 active caller 后直接删除或归档，不保留兼容层。 |

## Docs 目录结构对齐

OPL、MAS、MAG、RCA 采用同名 canonical docs taxonomy。统一目录名不是因为
这些目录现在都必须很厚，而是因为四仓长期生命周期角色已经稳定：
读者进入任意由 OPL 系列直接管理的 framework/domain repo 时，都应能在同一组目录下找到同类材料。

目录是否保留按长期职责判断，不按当前文件数量判断。有长期职责的目录可以暂时只放
README/索引，但 README 必须说明 owner、purpose、state、machine boundary、当前承载状态、
以及什么内容未来应进入该目录。没有长期职责的目录不进入 canonical taxonomy。

已有非 canonical 目录属于迁移对象；能直接迁移的直接迁入 canonical 目录。
不能迁移的，只允许作为 upstream/imported support、历史 provenance、外部依赖目录
或 tombstone 暂留，并由 canonical 目录 README 明确指向。旧目录不能继续作为
new recurring material 的默认落点。

App 顶层 `docs/` 应纳入 One Person Lab App 的产品文档、release、testing、user guide 和 screenshot lifecycle；`opl-aion-shell/docs/` 仍按 upstream AionUI 依赖文档处理，不主导 App 顶层治理。

统一目录集合如下：

| 目录 | 角色 | 迁移/保留规则 |
| --- | --- | --- |
| `docs/active/` | 当前执行、当前计划、当前差距、active baton 与 closeout evidence | MAS 旧 `program/`、MAG 旧 `plans/`、RCA 旧 `program/` 已按各仓审计迁入 `active/` 或 history；后续 active material 直接落这里。 |
| `docs/public/` | 公开叙事、用户第一阅读层、roadmap/task map、对外定位 | MAG 根层 public allowlist、App localized `readme/` 由 `public/README*` 收口，不直接删除。 |
| `docs/product/` | 人类/operator 入口、product entry、workbench、quickstart、profile、发布协作 | OPL 维护 App/workbench 的消费目标和合同；domain repo 的 direct skill/product entry 指南落这里。 |
| `docs/runtime/` | runtime topology、control plane、projection/read model、provider/executor 边界、watch/repair 语义 | root `contracts/` 仍是机器合同目录；`docs/runtime/` 只做人读说明和当前 runtime owner 索引。 |
| `docs/delivery/` | artifact/package/export/submission/deck/deliverable family 与 proof | OPL 只放通用 artifact lifecycle shell；domain repo 放本领域交付 authority。 |
| `docs/source/` | workspace/source intake、source readiness、knowledge/source truth consumption | OPL 只放通用 source/workspace shell；domain repo 放本领域 source semantics。 |
| `docs/policies/` | 稳定治理规则、运行纪律、repo-local 维护规则 | 不替代 core five 的 invariants/decisions；更细的长期政策落这里。 |
| `docs/specs/` | 当前仍有效的技术规格、active product/runtime boundary spec | 旧 dated spec 或 path-stable spec 必须在 index 标清 active/history，不作为兼容接口保留。 |
| `docs/references/` | north-star、positioning、integration、governance、verification support | 目标态和外部学习材料放这里，不能写成 current truth。 |
| `docs/history/` | retired route、completed plans、tombstone、provenance、process archive | 过时接口、旧路线和完成计划只在这里保留来龙去脉。 |

根层 `docs/` 只保留 `README*`、核心五件套和
`docs_portfolio_consolidation.md`。每个 repo 的
`docs/docs_portfolio_consolidation.md` 必须说明本仓 canonical 目录状态、
迁移来源、owner/purpose/state/machine boundary，以及哪些非 canonical 目录仍因
path stability、contract-linked `human_doc:*` 或历史归档暂留原位。

`docs/**` 是开发和维护参考，默认只保留中文 canonical 内容。稳定路径优先使用
无语言后缀 `.md` 承载中文正文；历史材料可以保留旧双语方案的描述作为 provenance，
但 active/reference 索引应指向当前无语言后缀路径。根层 `README*` 是否继续保留公开
双语入口，由各仓 public/product 需求单独判断；这不改变 `docs/**` 的中文内部开发文档定位。

## 过时面清理规则

当一个旧模块、旧接口、旧 CLI alias、旧 wrapper、旧 facade、旧测试入口或旧文档入口已经被当前 owner surface 替代时，默认处理是直接退役：

1. 先确认 active caller、合同引用、fixture/provenance 需求。
2. active caller 存在时，先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 aggregate compatibility test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确的 provenance/reference，不保留 active compatibility interface。
5. 测试只断言 contract/schema/source/CLI/API/manifest/generated artifact 行为，不断言 prose wording 或旧文档路径。

这条规则适用于 Hermes-first、Gateway/frontdoor/federation、local-manager、repo-local runtime pilot、legacy service wrapper、flat shell alias、compatibility facade、旧聚合测试和旧 active-path 文案。保留历史不等于保留兼容接口。

## 后续工作准入

任何新增 OPL 系列开发工作，先归类到以下之一：

- `OPL global`: framework/shared primitive/App workbench/domain admission/production closeout。
- `domain-owned`: MAS/MAG/RCA 的领域 truth、quality、artifact、memory body、owner receipt 或 direct skill。
- `App-owned`: GUI shell、workbench 展示、action routing、packaging/update、fork overlay。
- `reference/history`: 外部学习、旧路线、proof lane、迁移背景或 tombstone。

归类之后再决定落点。无法归类的文档不应直接新增到 active layer；先更新对应 portfolio 或进入 reference/history。
