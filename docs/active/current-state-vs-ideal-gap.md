# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: `family_ideal_state_gap_plan`
State: `active_plan`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-18`

## 文档读法

- 本文只维护 OPL family 的当前差距、完成顺序和验收口径；目标态定义回到 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md)。
- 结论只记录当前真实状态，不保存历史演变、dated closeout 或过程性 proof。过程性记录统一归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。
- 功能/结构差距按目标态判断，不按现有实现是否能跑判断。凡 MAS/MAG/RCA 内仍承担通用 runtime、runner、queue、session、lifecycle、workbench、memory/artifact transport、sidecar/status/product wrapper 或 generated surface 职责的实现，都必须进入 OPL 上收、generated surface 替换、refs-only 收薄或退役分类。
- 测试/证据差距只记录目标结构已经正确、但还缺真实运行、长时证据、owner receipt scaleout 或 no-regression proof 的事项。不能把功能未完成写成测试尾巴。

## 当前结论

OPL family 的目标形态已经明确：`OPL Framework` 是完整智能体开发/运行框架；`One Person Lab App` 是面向人的工作台；`MAS`、`MAG`、`RCA` 是基于 OPL 的标准 Foundry Agents。标准 Agent 目标形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`。

当前 OPL 已具备 framework 主干：domain descriptor / stage / action / memory discovery、Temporal-backed provider code、typed family queue、stage attempt ledger、typed closeout、production closeout read model、functional runtime harness、generic substrate projection、domain pack compiler handoff、private functional audit read model、Agent Lab 控制面和 checkout-clean command runner。Temporal 是 production online runtime 的必需 provider；`local_sqlite` 只能作为 dev/CI/offline diagnostic baseline，不是生产 daemon 或 readiness fallback。

当前仍不能写成“功能/结构差距为 0”。OPL 的通用 read model 和 pack compiler handoff 已经说明“应该怎么看”和“应该怎么生成”，但 generated surface 还没有成为四仓生产默认 caller，App/workbench drilldown 还没有产品化，provider SLO / repair cadence 还没有长期自动或受监督闭环，domain repo 内仍有迁移桥和 legacy residue 需要 active caller cutover、refs-only 收薄、物理删除或 tombstone。

MAS/MAG/RCA 当前均已被 OPL 识别为标准 domain agent 的消费方，但三仓仍保留各自历史私有功能实现。它们可以为了目标态重构；不能以“已有 active caller”为理由保留通用平台面。保留在 domain 内的程序面必须能解释为领域 truth、quality/export verdict、artifact mutation authorization、memory accept/reject、source readiness、owner receipt signer 或 domain-native helper implementation，并走 OPL 标准 ABI。

## OPL 功能/结构差距

| 差距 | 当前状态 | 完成口径 |
| --- | --- | --- |
| Production provider 默认面 | `temporal` 是 production required provider；`local_sqlite` 已降为 dev/CI/offline diagnostic baseline。 | 保持生产默认只走 Temporal/provider-backed path；旧 daemon/local path 只保留诊断或退役清理语境。 |
| Generated surface production consumption | `domain-pack-compiler` 已能投影 CLI/MCP/product-entry/sidecar/status/workbench/harness handoff metadata。 | 让 MAS/MAG/RCA 的生产默认 caller 消费 OPL generated/hosted surface；domain repo 手写 wrapper 退成 domain handler、refs-only adapter 或删除。 |
| App / workbench drilldown | OPL 已有 route/attempt/substrate/evidence read model。 | App 做成人可用的 route graph、review queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness、SLO 和 owner-aware action routing。 |
| Lifecycle / artifact / memory shell | refs-only lifecycle index、generic substrate projection 和 domain receipt refs 已有基础。 | OPL-owned locator/retention/restore ledger、refs-only SQLite index 与 domain-owned artifact mutation / memory writeback receipt 持续对账。 |
| Provider SLO / repair cadence | provider proof 和 SLO receipt projection 已可读。 | 建立自动或受监督 cadence、overdue repair execution receipt、restart/re-query/signal/history 长窗口证据。 |
| Domain private platform residue | `functional_privatization_audit` 已分类 MAS/MAG/RCA 的标准 pack、authority function 与 private platform residue。 | 对 private platform residue 执行 OPL 上收、generated surface 替换、refs-only 收薄、diagnostic cleanup 或 tombstone；不保留兼容 alias/facade。 |
| Legacy physical cleanup | physical skeleton / legacy cleanup gate 已机器化条件。 | 在 replacement parity、no-active-caller、provenance/history/tombstone 证据齐备后，逐项物理删除 active-path residue 或迁入 tombstone。 |
| New Agent scaffold / template | `opl agents scaffold` 和 standard skeleton contract 已能描述/校验目标骨架。 | 将 scaffold、pack compiler、private surface policy 和 verification lane 用作新 Agent 默认开发路径，并用真实新 Agent 消费验证。 |

## MAS 功能/结构差距

MAS 理想形态是医学研究 `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 MAS 已完成 default scheduler owner 迁到 OPL replacement，并把 functional consumer boundary 投影到 manifest、sidecar 和 supervision projection；但这只是分类和禁回流 guard。

MAS 当前功能/结构差距仍包括：

- OPL generated surface active caller cutover 尚未完成，MAS hand-written CLI/MCP/Skill/product-entry/sidecar/status/workbench/projection shell 仍是迁移桥。
- SQLite/lifecycle、paper outbox、storage maintenance、workspace/source intake、publication-route memory transport、artifact lifecycle、Portal/workbench、terminal/log projection、runtime supervisor scan/dispatch loop 仍需 refs-only 收薄或上收到 OPL primitive。
- local LaunchAgent/status/remove cleanup diagnostic 与 workspace-local wrappers 仍需 physical retirement 或 tombstone。
- OPL App drilldown 与 lifecycle locator/retention/restore ledger 对账仍未产品化。
- AI-first quality gate 必须保持 executor agent 与 reviewer/auditor agent 分离；程序只能校验、持久化、签 receipt、阻止越权，不能用规则或 fallback 替代医学质量判断。

## MAG 功能/结构差距

MAG 理想形态是基金申请 `Declarative Grant Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 MAG 已有 direct app skill、domain entry、product-entry、sidecar、6-stage control plane、receipt writer、lifecycle guarded apply、grant transition oracle 和 consumer/thinning contract。

MAG 当前功能/结构差距仍包括：

- OPL generated surface 尚未生产消费，hand-written product/status/user-loop/sidecar/grouped CLI/projection/lifecycle adapter 仍需迁到 generated surface。
- Workspace/source intake shell、grant strategy memory locator/writeback transport、package/export lifecycle shell、route/quality/status/product wrapper、operator workbench、observability/SLO 仍需由 OPL/App 承接。
- Submission-ready package 和 export verdict 继续归 MAG；OPL/App 只能显示 package refs、gap report、manual portal boundary 和 owner receipt。
- Legacy runtime/journal/probe/compat residue 仍需 no-active-caller scan、replacement parity、provenance proof 和 physical cleanup。

## RCA 功能/结构差距

RCA 理想形态是视觉交付 `Declarative Visual Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 RCA 已有 direct route、service-safe domain entry、product sidecar、visual transition spec/evaluator、workspace receipt inventory、operator evidence readiness、stability read-model consumer projection 和 private functional audit。

RCA 当前功能/结构差距仍包括：

- OPL generated surface 未生产消费，repo-local CLI/MCP/product-entry/session/sidecar/status/workbench wrapper 的 active caller 仍需迁到 OPL generated/hosted surface。
- Focused hosted attempt 仍需接成真实 hosted path；transition receipt fixture 只是对账形状 proof。
- Artifact gallery/handoff shell、review/repair transport、workspace/source shell、native-helper generic envelope、operator projection/App drilldown、lifecycle/receipt inventory 仍需由 OPL/App 承接。
- Managed-run/session store、attempt/state-machine runner、artifact export lifecycle 等当前只能作为 refs-only adapter、visual authority implementation 或迁移桥阅读。
- Legacy compatibility residue 仍需 replacement proof、no-active-caller proof 和 physical cleanup。

## 测试/证据差距

| 证据门 | 当前读法 | 完成口径 |
| --- | --- | --- |
| OPL provider long SLO | Temporal production proof 可证明当前 provider residency。 | 长窗口 cadence、repair execution receipt、restart/re-query/signal/history 和 operator SLO 证据稳定。 |
| MAS real paper apply | 已有 read-only / stable blocker / receipt consumption 证据。 | 多条真实 paper line 产生 progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker，并保留 no-forbidden-write proof。 |
| MAG controlled grant soak | 已有 receipt reconciliation 和 transition oracle proof surface。 | 真实 OPL-hosted grant-stage attempt 持续返回 owner receipt、typed blocker 或 no-regression evidence。 |
| RCA controlled visual soak | 已有 transition/evidence fixture 和 refs-only projection。 | 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 no-regression evidence 形成重复 proof。 |
| Memory / artifact apply | OPL 只能读 refs，domain 持有 body 和 verdict。 | MAS/MAG/RCA 在真实 workspace 中形成 accepted/rejected memory writeback、cleanup/restore/retention、artifact mutation receipt 和 operator drilldown。 |
| Cross-family regression | 三仓都有 consumer boundary。 | generated surface caller migration 后，direct/hosted parity、no-forbidden-write、legacy no-active-caller 和 release/dist consumption 反复通过。 |

## 最短实施顺序

1. 固定 production provider 口径：Temporal 是生产必需 substrate；local provider 与旧 daemon 只保留 dev/CI/offline diagnostic 或 cleanup 语境。
2. 完成 OPL generated surface 的生产消费：从 domain descriptor / stage / action / memory / transition / receipt metadata 派生 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness，并迁走 domain repo 手写 wrapper 的 active caller。
3. 按 `functional_privatization_audit` 逐项收薄 domain private platform residue：能由 OPL 承接的迁走，不能声明化的收成最小 authority function，无 active caller 的旧面直接删除或 tombstone。
4. 产品化 OPL App/workbench：让人能 drill down route graph、attempt、source refs、artifact refs、memory refs、quality/readiness、SLO、repair 和 owner-aware action。
5. 接通 lifecycle / artifact / memory 持续对账：OPL 只写自有 locator/index/ledger，domain 写 owner receipt、artifact mutation receipt、memory accept/reject receipt。
6. 完成 physical skeleton / legacy cleanup：replacement parity、no-active-caller、provenance 和 tombstone 条件齐备后，不保留兼容入口。
7. 最后跑长时 provider/domain/App 验收：MAS paper、MAG grant、RCA visual 依次扩大到真实 workspace 和长窗口 SLO。

## 当前不能写成

- 不能写成 `local_sqlite` 是 production online readiness path；它只是 dev/CI/offline diagnostic baseline。
- 不能写成 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能写成 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 OPL pack compiler handoff read model 写成 generated surface 已生产消费。
- 不能把 fixture、focused proof、no-regression evidence 或 typed blocker 写成真实 long soak 完成。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。
