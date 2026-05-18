# OPL 当前状态

更新时间：`2026-05-18`

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整智能体开发/运行框架，持有 Codex-default session/runtime、activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated surface 和跨仓治理。
- `One Person Lab App` 是面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source refs、artifact refs、memory refs、SLO、repair 和 owner-aware action。
- `Foundry Agents` 当前包括 `MAS`、`MAG`、`RCA`。它们持有各自的 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt 和 direct app skill path。

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent` 与 `claude_code` 同属显式非默认 executor adapter/backend，只能用 receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 等价。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

当前 OPL 已具备 framework 主干：

- domain descriptor / stage / action / memory discovery；
- Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout；
- production closeout read model、provider proof / SLO projection、runtime snapshot 和 operator item；
- OPL-owned provider scheduler cadence/tick surface、safe runtime action shell、lifecycle refs-only SQLite index、App/operator drilldown read model；
- functional runtime harness、generic substrate projection、domain pack compiler active-caller proof、private functional audit read model；
- Agent Lab control plane、managed checkout-clean command runner、standard domain-agent scaffold 和 family docs taxonomy。
- Developer Mode 的系统配置与 App settings 消费面：`opl system` / `opl system initialize` 现在暴露 `developer_mode` surface，复用既有 `developer_supervisor` system action，App 设置页可以读取当前配置、GitHub identity 状态、repo authority 汇总、direct-fix / fork-PR 路由、endpoint、request fields 和 action payload template。

One Person Lab App 的产品运行路径默认以 OPL-managed environment 为真相：managed modules、managed skills、Codex plugin metadata、runtime tools 与 provider state 是普通用户入口的默认依赖。developer checkout 只作为显式开发/调试 override 进入运行路径；没有显式 override 时，workspace 源仓的 dirty、ahead 或实验分支不能定义 App 当前运行依赖。当前 `opl module update` / `opl skill sync` 已能手动把 managed modules、`~/.codex/skills` 和 Codex-visible metadata 对齐；App 启动时自动检查 clean managed checkout、自动更新、health check、skill sync、plugin cache freshness 与 restart/reload 提示仍是待产品化 gap。

OPL Developer Mode 已有系统配置和运行态 projection：`opl system developer-supervisor` 读写 OPL state 下的 developer supervisor 配置，并默认以 `gaofeng21cn` 作为安装期自动开启的 GitHub login 候选；`developer_mode` surface 会检测 GitHub identity、目标 repo permission，并计算 `direct_repo_fix`、`fork_pull_request`、`mixed_direct_and_pr`、observe-only 或 fail-closed route。App 设置页暴露 Developer Mode 开关，普通用户可手动开启或关闭；开启后任务默认可以启用外围 AI 巡检，Agent Lab 负责把问题归因、evidence、owner route、candidate fix 和 PR refs 组织成可审计控制面。repo developer / collaborator 可以走对应 repo 的修复提交路径；非 repo developer 只能走 fork / PR 路径。当前剩余缺口是 App 巡检自动挂载和真实 repo fix / PR route 的端到端 closeout 证据。

Fresh runtime evidence（2026-05-18）显示：默认 `opl family-runtime status` 选中 `temporal`，managed Temporal service / worker ready；显式 `OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite` 时只进入 dev/CI/offline diagnostic path，`full_online_ready=false` 且不能替代 domain daemon。`opl family-runtime scheduler install --provider temporal` 已创建 `opl-family-runtime-provider-scheduler`，`scheduler trigger` 已返回 triggered，`scheduler tick --provider temporal --force` 已生成新的 `production_residency_proven` provider SLO execution receipt，并通过 OPL typed queue 接收 domain owner receipt / typed blocker，不写 domain truth。本机 `launchctl list` 与 `~/Library/LaunchAgents` fresh check 未发现 MAS / MedAutoScience supervision scheduler label 或 plist；MAS 旧 local scheduler 只能作为 repo-local cleanup diagnostic / tombstone 语境读取。

MAS/MAG/RCA 当前均可被 OPL 识别为 standard domain agent consumer。这个状态只能说明 descriptor、read model、handoff、generated/handler target proof 和部分 replacement surface 已经存在；不能写成 production domain owner chain 已闭合，也不能写成四仓功能/结构差距归零。MAS 当前机器面已关闭未分类 generic owner 回流，`classification_gap_count=0`、`active_private_generic_residue_count=0`，但仍保留 5 个功能/结构 follow-through：generated surface active caller cutover、refs-only adapter thinning、legacy cleanup physical retirement、OPL App/workbench drilldown 和 lifecycle locator/retention/restore ledger reconciliation。MAG 当前 repo-side handler / refs-only / authority boundary 已闭合；剩余主要是外部默认 caller、App 消费、live soak 和 owner receipt scaleout 证据。RCA 当前 generated/hosted shell 消费边界已闭合；剩余主要是 controlled visual-stage long soak 和 legacy physical cleanup 证据。

当前 active gap 与实施顺序以 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md) 和 [生产级框架闭环差距矩阵](./active/production-framework-closure-gap-matrix.md) 为准。dated proof、receipt 明细和阶段 closeout 流水保存在 [OPL family 文档过程归档 2026-05](./history/process/plans/2026-05-18-opl-family-doc-process-history.md)，不在本页展开。

## 当前功能/结构差距

OPL family 当前不能写成整体 `functional_structure_gap_count=0`。仍需关闭的功能/结构差距是：

1. `generated_surface_production_consumption`
   OPL pack compiler / generated surface 已能输出 active-caller target proof；MAG/RCA repo-side generated/handler target consumption 已闭合。MAS 仍有 5 个 functional follow-through gate，其中包含 generated surface active caller cutover。descriptor ready / classification closed 只代表可生成、可分类和可路由，不代表 production domain owner chain、live caller evidence 或 domain ready 已闭合。

2. `app_workbench_drilldown`
   OPL CLI/runtime read model 已覆盖 route graph、review queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness、SLO 和 owner-aware action routing；One Person Lab App/AionUI 仍需要把这些 read model 产品化为稳定页面级工作台与真实用户路径证据。domain repo 不应复制通用 workbench。

3. `domain_private_platform_residue`
   MAS 已把未分类 generic owner 回流清零，但 5 个 functional follow-through gate 仍打开；RCA 仍保留 legacy physical cleanup evidence gap；MAG/RCA 的 live default caller 与 App/owner-chain evidence 仍需 scaleout。所有新发现或既有残留都必须按 OPL 上收、generated surface 替换、refs-only 收薄、minimal authority function、diagnostic cleanup 或 tombstone 分类处理；分类闭合不能写成物理代码路径、生产 owner chain 和 live evidence 已清零。

4. `legacy_physical_cleanup`
   Hermes/Gateway/frontdoor/local-manager/MDS-default/default-compat 等旧面只有在 provenance、diagnostic、fixture、negative guard 或 history 语境中可见。MAS local LaunchAgent 当前没有本机 active label / plist；MAS repo 内相关路径只能保留 explicit cleanup diagnostic / tombstone 角色。MAG local runtime journal / Hermes probe 与 RCA repo-local wrapper/session/sidecar residue 仍需按 no-active-caller proof 继续清理。

5. `app_managed_environment_startup_maintenance`
   App 产品路径已明确 managed environment 优先，developer checkout 只能显式 override；但启动维护仍需产品化为自动检查和受控更新：clean managed checkout 可自动 fast-forward、跑 health check、同步 skills/plugin metadata；dirty/ahead/diverged/no-upstream/health-failed/restart-required 必须展示为人工处理状态，不得静默覆盖或用 developer checkout 污染产品 runtime。

6. `developer_mode_agent_lab_repair_route`
   Developer Mode 的系统配置、App settings / initialize surface、GitHub login / repo permission projection、direct repo fix / fork PR route 计算和 Agent Lab refs-only repair route read model 已落地。剩余证据门是用真实 repo 问题跑一次 owner direct-fix 与 non-owner fork/PR 的端到端 closeout；该能力必须保持 managed runtime truth 不变，只授权开发修复和 PR 路由。

## 当前测试/证据差距

下面是目标结构正确后的证据门，不能替代功能/结构迁移；MAS/MAG/RCA 都不能把 descriptor ready、read model、replacement proof 或 provider proof 写成功能/结构迁移完成：

- MAS 多条真实 paper line 的 provider-hosted guarded apply、progress delta、AI reviewer update、artifact delta、human gate、stop-loss 或 stable typed blocker。
- MAG 真实 OPL-hosted grant-stage controlled soak、owner receipt、typed blocker 或 no-regression evidence。
- RCA 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 repeated no-regression evidence。
- MAS/MAG/RCA 的 memory / artifact / lifecycle 在真实 workspace 中形成 accepted/rejected writeback、cleanup/restore/retention 和 artifact mutation receipt。
- Temporal provider 长时 SLO、repair execution receipt、restart/re-query/signal/history 与 no-forbidden-write proof。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` 管理 Codex CLI、provider profile/readiness、module install/update、skill sync、managed environment freshness 和 local runtime state。
- `opl system developer-supervisor` 管理 Developer Mode 的系统级配置、GitHub 身份/权限 projection 与 repair route 汇总；App 设置页应消费同一个 `developer_supervisor` system action，而不是新建平行配置入口。
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
- 不能声明 MAS/MAG/RCA generated surface production caller 已全部切换。
- 不能把 MAS descriptor ready、read model、provider proof、replacement proof 或 generated bundle ready 写成 MAS 功能/结构差距归零。
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
