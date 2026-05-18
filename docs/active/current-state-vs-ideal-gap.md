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

当前 OPL 已具备 framework 主干：domain descriptor / stage / action / memory discovery、Temporal-backed provider code、OPL-owned provider scheduler cadence/tick surface、typed family queue、stage attempt ledger、typed closeout、safe runtime action shell、lifecycle refs-only SQLite index、App/operator drilldown read model、production closeout read model、functional runtime harness、generic substrate projection、domain pack compiler active-caller proof、private functional audit read model、Agent Lab 控制面和 checkout-clean command runner。Temporal 是 production online runtime 的必需 provider；`local_sqlite` 只能作为 dev/CI/offline diagnostic baseline，不是生产 daemon 或 readiness fallback。

GraphFlow / GFL 论文中可吸收的模式已经被定位为 OPL 自有 contract pattern：stage pack 先做 admission，stage 之间用 `requires` / `ensures` 组合，可信部分拆成 `verified_static_core`，AI / 人 / 外部系统 / domain verdict 等边界进入 `runtime_enforced_boundary`，再由 selected executor 启动已准入 stage pack。当前最小机器读模型已经落到 `family-stage-admission` 和 `opl stages list|inspect` admission projection；这个吸收不引入 GraphFlow / GFL runtime dependency，也不把 GraphFlow 写成 OPL provider、planner、stage runner、executor 或 domain authority。

当前仍不能写成“family 全部功能/结构差距为 0”。Fresh OPL CLI 证据显示，MAS/MAG/RCA 的 `opl_generated_agent_interface_bundle.status=ready`，并且 generated blocks 覆盖 CLI、MCP、Skill、product-entry、OpenAI tool 和 AI SDK。MAS 侧 5 个结构 follow-through gate 已关闭，MAG/RCA repo-side boundary 也更干净；family 层剩余功能/结构工作集中在 App/workbench 产品路径、managed environment startup、Developer Mode live route、MAG/RCA legacy cleanup evidence 和新 agent scaffold 消费，而真实 provider / owner-chain long soak 继续作为 evidence gate。

OPL 的通用 read model、pack compiler proof、scheduler cadence/tick、safe action shell 和 lifecycle index 已经落成 framework surface；本机 fresh evidence 已显示 `opl family-runtime status` 默认选中 `temporal`，Temporal managed service / worker ready，`local_sqlite` 只有显式 env / 参数选择时才进入 dev/CI/offline diagnostic path；`opl family-runtime scheduler install --provider temporal` 已创建 `opl-family-runtime-provider-scheduler`，`scheduler trigger` 已返回 triggered，`scheduler tick --provider temporal --force` 已生成新的 `production_residency_proven` provider SLO execution receipt 并通过 OPL typed queue dispatch domain tasks；`launchctl list` 与 `~/Library/LaunchAgents` fresh check 未发现 MAS / MedAutoScience supervision scheduler label 或 plist。这些 proof 是 framework substrate 和迁移输入，不等于 MAS/MAG/RCA 已成为结构完全闭合的标准 OPL Agent；三仓仍需要把生产默认 caller、App/workbench 消费、lifecycle / artifact / memory 对账、private platform residue 和 legacy cleanup 继续收敛到目标态。

MAS/MAG/RCA 当前均已被 OPL 识别为标准 domain agent 的消费方。MAS 已关闭未分类 generic owner 回流和 5 个结构 follow-through gate，`classification_gap_count=0`、`active_private_generic_residue_count=0`、`functional_structure_gap_count=0`；剩余是 paper-line provider apply、memory/artifact/lifecycle receipt scaleout、human gate/resume 和 provider SLO long-soak evidence gate。MAG 当前 repo-side handler / refs-only / authority boundary 已闭合，剩外部默认 caller、App 消费、live soak 和 owner receipt scaleout 证据。RCA 当前 generated/hosted shell 消费边界已闭合，剩 controlled visual-stage long soak 和 legacy physical cleanup 证据。不能以“已有 active caller”为理由保留通用平台面。保留在 domain 内的程序面必须能解释为领域 truth、quality/export verdict、artifact mutation authorization、memory accept/reject、source readiness、owner receipt signer 或 domain-native helper implementation，并走 OPL 标准 ABI。

MAS substrate projection 也已从 partial 收敛到 refs-resolved：`opl substrate projection --domain med-autoscience --json` 当前能索引 MAS 顶层 `source_provenance`、artifact inventory、domain memory descriptor 和 lifecycle projection refs，且 non-authority flags 保持不读 memory body、不写 memory body、不写 domain truth、不解释 source truth、不改 artifact body、不授权 quality verdict。

## OPL 功能/结构差距

| 差距 | 当前状态 | 完成口径 |
| --- | --- | --- |
| Production provider 默认面 | `temporal` 是 production required provider；fresh CLI 显示默认 `configured_provider=temporal` 且 managed service / worker ready；显式 `OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite` 时 `full_online_ready=false`、`selected_provider_can_replace_domain_daemons=false`。 | 保持生产默认只走 Temporal/provider-backed path；旧 daemon/local path 只保留诊断或退役清理语境。 |
| Generated surface production consumption | `domain-pack-compiler` 已能投影 CLI/MCP/product-entry/sidecar/status/workbench/harness handoff metadata 与 active-caller target proof；MAS/MAG/RCA generated descriptor 均可读。MAS/MAG/RCA repo-side generated/handler target consumption 已闭合。descriptor ready / active-caller target proof 证明可迁移、可路由、可 fail closed；live owner chain、domain ready 和 long soak 仍走 evidence gate。 | MAG/RCA 继续补外部 default caller / App / live evidence；domain repo 手写 wrapper 退成 domain handler、refs-only adapter、必要 authority function 或删除。 |
| Stage pack admission / requires-ensures composition | 当前已有 stage descriptor、action/stage discovery、authority boundary、typed queue、attempt ledger 与 receipt projection；GraphFlow/GFL 可借鉴模式已落成 `family-stage-admission` 读模型，覆盖 stage contract、trust lane、effect boundary runtime-event requirement、composition obligation、静态 core cycle guard 与 OPL non-authority boundary，并通过 `opl stages list|inspect` 可读。当前仍不能写成生产启动路径已经逐条强制执行 selected executor binding proof、idempotency、consumed refs 与 expected receipt refs。 | 把已落地 admission read model 接入 OPL launch / queue / provider / App projection 路径：每个可启动 stage pack 都有 `requires`、`ensures`、trust lane、authority boundary、selected executor binding、idempotency、consumed refs、expected receipt refs；组合不满足时产出 typed blocker / human gate / route-back。 |
| App / workbench drilldown | OPL CLI/runtime 已有 route/attempt/source/artifact/memory/quality/SLO/safe action read model；One Person Lab App root contract 已绑定 `runtime_tray_snapshot.app_operator_drilldown`，AionUI runtime 页面已接入 `AppOperatorDrilldown` 组件消费该 read model。当前仍缺稳定页面级工作台、真实用户路径、发布包/截图证据和 domain owner-aware drilldown 消费。 | App 继续补真实用户路径、截图/发布包证据和长时 operator evidence；domain repo 不复制通用工作台，只暴露 owner truth / receipt / refs。 |
| App managed environment startup maintenance | 产品路径口径已收敛为 App / OPL-managed modules 优先，developer checkout 只能显式 override；`opl module update` 与 `opl skill sync` 已能手动更新 managed modules、Codex skills 和 plugin metadata projection。 | App 启动维护自动检查 managed modules、skills、plugin cache 和 provider state；clean managed checkout 可自动 fast-forward、health check、skill sync 和刷新投影；dirty/ahead/diverged/no-upstream/health-failed/restart-required 必须进入可见人工处理状态。 |
| Developer Mode / Agent Lab repair route | `opl system developer-supervisor` 已提供 OPL state 级配置入口，`developer_mode` projection 已能检测 GitHub identity、repo permission，并计算 `direct_repo_fix` / `fork_pull_request` / `mixed_direct_and_pr` / observe-only 路由；`opl system`、`opl system initialize` 与 App settings surface 已暴露同一 `developer_supervisor` action；Agent Lab workbench 已输出 refs-only repair route read model。 | 用真实 repo 问题跑通 owner direct-fix 与 non-owner fork/PR closeout；持续证明该路由只写 repo repair/PR refs，不写 domain truth、artifact、memory body、quality verdict 或 managed runtime。 |
| Lifecycle / artifact / memory shell | refs-only lifecycle index、guarded apply、restore/cleanup proof refs、generic substrate projection 和 domain receipt refs 已有基础。当前证明的是 OPL 可以持有 locator/index/proof refs，不等于三仓 lifecycle、artifact mutation 与 memory writeback 已完成目标态对账。 | MAS/MAG/RCA 都在真实 workspace 中持续对账 OPL-owned locator/retention/restore ledger 与 domain-owned artifact mutation / memory writeback receipt。 |
| Provider SLO / repair cadence | provider proof 和 SLO receipt projection 已可读；Temporal schedule `opl-family-runtime-provider-scheduler` 已在本机创建，`scheduler trigger` 返回 triggered，`scheduler tick --provider temporal --force` 已生成 fresh `production_residency_proven` SLO receipt。 | 长窗口内持续证明 schedule cadence、overdue repair execution receipt、restart/re-query/signal/history 和 domain owner-chain dispatch 不退化。 |
| Domain private platform residue | `functional_privatization_audit` 已分类 MAS/MAG/RCA 的标准 pack、authority function 与 private platform residue。MAS 分类、禁回流和结构 follow-through 已清零；MAG/RCA repo-side边界更干净，但 live evidence / physical cleanup 仍未全部闭合。 | 对 MAS/MAG/RCA 剩余 private platform residue 执行 OPL 上收、generated surface 替换、refs-only 收薄、diagnostic cleanup 或 tombstone；不保留兼容 alias/facade。 |
| Necessary private authority function audit | 三仓均有 private functional surface policy 或 functional privatization audit。 | 对 MAS/MAG/RCA 的 retained functions 逐项证明 AI-first boundary、active caller、cannot absorb reason、receipt/blocker/ref 输出、no-forbidden-write 和退役门；质量、创作、评审、路线判断不允许由机械函数替代 stage output。 |
| Legacy physical cleanup | physical skeleton / legacy cleanup gate 已机器化条件；MAS local LaunchAgent 当前没有本机 active label / plist；MAS repo 内相关路径只能保留 explicit cleanup diagnostic / tombstone 角色。 | 在 replacement parity、no-active-caller、provenance/history/tombstone 证据齐备后，继续清理 MAG/RCA active-path residue；MAS 同类事项只作为 cleanup diagnostic、tombstone/provenance 或 regression follow-up 阅读。 |
| New Agent scaffold / template | `opl agents scaffold` 和 standard skeleton contract 已能描述/校验目标骨架。 | 将 scaffold、pack compiler、private surface policy 和 verification lane 用作新 Agent 默认开发路径，并用真实新 Agent 消费验证。 |

## MAS 功能/结构差距与证据门

MAS 理想形态是医学研究 `Declarative Medical Research Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 MAS 已关闭未分类 generic owner 回流和结构 follow-through，`classification_gap_count=0`、`active_private_generic_residue_count=0`、`functional_structure_gap_count=0`。这表示 MAS 标准化 OPL Agent 的功能/结构 gap 已关闭；它不表示真实 paper closure、publication-ready、artifact mutation authorization、provider SLO long soak 或 App 真实用户 evidence 已完成。

MAS 当前剩余测试/证据差距包括：

- 多条真实 paper line 的 provider-hosted guarded apply、progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker。
- Temporal/provider 长窗口下 MAS owner-chain dispatch、restart/re-query/signal/history 和 no-forbidden-write proof。
- MAS memory / artifact / lifecycle 在真实 workspace 中形成 accepted/rejected writeback、cleanup/restore/retention 和 artifact mutation receipt。
- publication quality、AI reviewer decision、artifact mutation authorization、publication-route memory accept/reject 和 source readiness 继续由独立 reviewer/auditor 或 AI-first record 证明；程序只做校验、物化、签 receipt 和越权阻断。

## MAG 功能/结构差距

MAG 理想形态是基金申请 `Declarative Grant Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 MAG 已有 direct app skill、domain entry、product-entry、sidecar、6-stage control plane、receipt writer、lifecycle guarded apply、grant transition oracle 和 consumer/thinning contract。

MAG 当前 repo-side handler / refs-only / authority boundary 已闭合；剩余不应写成 MAG 仍持有通用 framework owner。MAG 当前仍需补的是外部默认 caller、App 消费、controlled live soak、owner receipt scaleout 和 legacy cleanup evidence：

- OPL generated interface descriptor 已 ready，但 hand-written product/status/user-loop/sidecar/grouped CLI/projection/lifecycle adapter 仍是迁移桥；生产默认 caller 仍需迁到 generated surface 或 domain handler target。
- Workspace/source intake shell、grant strategy memory locator/writeback transport、package/export lifecycle shell、route/quality/status/product wrapper、operator workbench、observability/SLO 仍需由 OPL/App 承接。
- Submission-ready package 和 export verdict 继续归 MAG；OPL/App 只能显示 package refs、gap report、manual portal boundary 和 owner receipt。
- Legacy runtime/journal/probe/compat residue 仍需 no-active-caller scan、replacement parity、provenance proof 和 physical cleanup。
- 必要私有函数仍需逐项 AI-first guard：fundability、authoring quality/export、package authority、memory accept/reject、transition oracle 和 owner receipt 留在 MAG；质量/创作/评审 verdict 必须由 AI-first grant stage artifact 支撑，代码只做 schema validator、materializer、receipt signer、guard 和 refs projection。

## RCA 功能/结构差距

RCA 理想形态是视觉交付 `Declarative Visual Pack + OPL generated/hosted surfaces + minimal authority functions`。当前 RCA 已有 direct route、service-safe domain entry、product sidecar、visual transition spec/evaluator、workspace receipt inventory、operator evidence readiness、stability read-model consumer projection 和 private functional audit。

RCA 当前 generated/hosted shell consumption 已闭合；剩余不应写成 RCA 仍持有长期通用 framework owner。RCA 当前仍需补的是 controlled visual-stage long soak、workspace receipt scaleout、legacy physical cleanup 和 owner-chain evidence：

- OPL generated interface descriptor 已 ready，但 repo-local CLI/MCP/product-entry/session/sidecar/status/workbench wrapper 的 active caller 仍需迁到 OPL generated/hosted surface 或收成 domain handler target。
- Focused hosted attempt 仍需接成真实 hosted path；transition receipt fixture 只是对账形状 proof。
- Artifact gallery/handoff shell、review/repair transport、workspace/source shell、native-helper generic envelope、operator projection/App drilldown、lifecycle/receipt inventory 仍需由 OPL/App 承接。
- Managed-run/session store、attempt/state-machine runner、artifact export lifecycle 等当前只能作为 refs-only adapter、visual authority implementation 或迁移桥阅读。
- Legacy compatibility residue 仍需 replacement proof、no-active-caller proof 和 physical cleanup。
- 必要私有函数仍需逐项 AI-first guard：source readiness、communication/visual direction、review/export verdict、artifact mutation authorization、visual memory accept/reject、owner receipt signer 和 native helper implementation 留在 RCA；故事、视觉方向、页面判断、review verdict 和 repair judgment 必须由 AI-authored stage artifact 持有，机械检查只表达 blocker 与 rerun target。

## 测试/证据差距

| 证据门 | 当前读法 | 完成口径 |
| --- | --- | --- |
| OPL provider long SLO | Temporal production proof 可证明当前 provider residency。 | 长窗口 cadence、repair execution receipt、restart/re-query/signal/history 和 operator SLO 证据稳定。 |
| MAS real paper apply | 已有 read-only / stable blocker / receipt consumption 证据；这证明边界可读，不证明 production caller、App/workbench、lifecycle/memory/artifact 对账已结构闭合。 | 多条真实 paper line 产生 progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker，并保留 no-forbidden-write proof。 |
| MAG controlled grant soak | 已有 receipt reconciliation 和 transition oracle proof surface。 | 真实 OPL-hosted grant-stage attempt 持续返回 owner receipt、typed blocker 或 no-regression evidence。 |
| RCA controlled visual soak | 已有 transition/evidence fixture 和 refs-only projection。 | 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 no-regression evidence 形成重复 proof。 |
| Memory / artifact apply | OPL 只能读 refs，domain 持有 body 和 verdict；descriptor、read model 或 provider proof 不等于真实 workspace apply 已完成。 | MAS/MAG/RCA 在真实 workspace 中形成 accepted/rejected memory writeback、cleanup/restore/retention、artifact mutation receipt 和 operator drilldown。 |
| Cross-family regression | 三仓都有 consumer boundary。 | generated surface caller migration 后，direct/hosted parity、no-forbidden-write、legacy no-active-caller 和 release/dist consumption 反复通过。 |

## 最短实施顺序

1. 固定 production provider 口径：Temporal 是生产必需 substrate；local provider 与旧 daemon 只保留 dev/CI/offline diagnostic 或 cleanup 语境。
2. 把已落地的 `family-stage-admission` read model 接入生产启动前 gate：每个可启动 pack 都声明 `requires` / `ensures`、trust lane、authority boundary 和 selected executor binding；组合失败时形成 typed blocker / human gate / route-back。
3. 对 MAS/MAG/RCA 完成 OPL generated surface 的生产消费：从 domain descriptor / stage / action / memory / transition / receipt metadata 派生 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness，并迁走 domain repo 手写 wrapper 的 active caller。
4. 按 `functional_privatization_audit` 逐项清 MAS/MAG/RCA private platform residue：能由 OPL 承接的迁走，不能声明化的收成最小 authority function，无 active caller 的旧面直接删除或 tombstone。
5. 验证 One Person Lab App GUI 对 `app_operator_drilldown` 的真实用户路径、截图/发布包证据和长时 operator evidence；OPL/App 已有 read model 与 runtime 页面接入，但仍需成为三仓标准 Agent 的稳定 operator surface。
6. 产品化 App startup managed-environment maintenance：默认使用 OPL-managed modules，developer checkout 只显式 override；启动时对 clean managed checkout 自动 update / health check / skill sync / plugin cache freshness，异常时 fail-closed 给人工处理。
7. 验证 Developer Mode / Agent Lab repair route：系统配置、App 开关、GitHub 身份/权限检测、外围 AI 巡检、repo fix / commit 和 fork / PR 路由已经形成机器面；下一步用真实 repo 问题跑 direct-fix 与 fork/PR closeout 证据。
8. 在真实 workspace 中扩展 lifecycle / artifact / memory 持续对账：OPL 只写自有 locator/index/ledger，domain 写 owner receipt、artifact mutation receipt、memory accept/reject receipt。
9. 完成 MAS/MAG/RCA physical skeleton / legacy cleanup：replacement parity、no-active-caller、provenance 和 tombstone 条件齐备后，不保留兼容入口。
10. 最后跑长时 provider/domain/App 验收：MAS paper、MAG grant、RCA visual 依次扩大到真实 workspace 和长窗口 SLO。

## 当前不能写成

- 不能写成 `local_sqlite` 是 production online readiness path；它只是 dev/CI/offline diagnostic baseline。
- 不能写成 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能写成 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 OPL pack compiler handoff read model 写成 MAS/MAG/RCA generated surface 已生产消费。
- 不能把 GraphFlow / GFL 的参考模式写成 OPL 已引入 runtime dependency、provider、stage runner、planner 或 executor，也不能把 `family-stage-admission` read model 写成生产启动路径已有完整 executor-binding / launch-enforcement gate。
- 不能把 MAS descriptor ready、read model、provider proof、replacement proof 或 generated bundle ready 写成 MAS 功能/结构差距归零。
- 不能把 Developer Mode repair route read model 写成真实 repo direct-fix / fork-PR closeout 证据已完成。
- 不能把 fixture、focused proof、no-regression evidence 或 typed blocker 写成真实 long soak 完成。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。
