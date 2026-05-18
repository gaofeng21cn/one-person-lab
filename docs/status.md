# OPL 当前状态

更新时间：`2026-05-19`

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
- Agent Lab control plane、managed checkout-clean command runner、standard domain-agent scaffold 和 family docs taxonomy。Agent Lab 的默认目标是全自动机制进化，常态 gate 是独立 AI reviewer、风险分级、evidence/no-forbidden-write、version ledger、canary 和 rollback；人工审核只属于高风险 owner authority surface 或显式 policy gate。ARIS 吸收点已落成 refs-only 机器面：integration contract read model、review trace ledger、log-driven mechanism candidate miner，并接入 `complete/workbench/mechanism/optimize/evolve`。MAS suite 现在可以把 runtime event ledger refs、provider/executor switch hygiene refs 和 claim assurance refs 作为 typed body-free 机制输入投影给 Agent Lab；OPL 只消费 refs，不写入 body、truth、artifact、owner receipt 或 quality verdict。
- Developer Mode 的系统配置与 App settings 消费面：`opl system` / `opl system initialize` 现在暴露 `developer_mode` surface，复用既有 `developer_supervisor` system action，App 设置页可以读取当前配置、GitHub identity 状态、repo authority 汇总、direct-fix / fork-PR 路由、endpoint、request fields 和 action payload template。

One Person Lab App 的产品运行路径默认以 OPL-managed environment 为真相：managed modules、managed skills、Codex plugin metadata、runtime tools 与 provider state 是普通用户入口的默认依赖。developer checkout 只作为显式开发/调试 override 进入运行路径；没有显式 override 时，workspace 源仓的 dirty、ahead 或实验分支不能定义 App 当前运行依赖。当前 `opl module update` / `opl skill sync` 已能手动把 managed modules、`~/.codex/skills` 和 Codex-visible metadata 对齐；App 启动时自动检查 clean managed checkout、自动更新、health check、skill sync、plugin cache freshness 与 restart/reload 提示仍是待产品化 gap。

OPL Developer Mode 已有系统配置和运行态 projection：`opl system developer-supervisor` 读写 OPL state 下的 developer supervisor 配置，并默认以 `gaofeng21cn` 作为安装期自动开启的 GitHub login 候选；`developer_mode` surface 会检测 GitHub identity、目标 repo permission，并计算 `direct_repo_fix`、`fork_pull_request`、`mixed_direct_and_pr`、observe-only 或 fail-closed route。App 设置页暴露 Developer Mode 开关，普通用户可手动开启或关闭；开启后任务默认可以启用外围 AI 巡检，Agent Lab 负责把问题归因、evidence、owner route、risk tier、independent AI reviewer refs、candidate fix、version ledger、canary / rollback 和 PR refs 组织成可审计控制面。repo developer / collaborator 可以走对应 repo 的修复、测试、canary 和 rollback-capable promotion 路径；非 repo developer 只能走 fork / PR 路径；高风险 domain truth、quality verdict、artifact mutation、memory accept/reject 或 credential/network/write policy 必须进入 owner/human gate。当前剩余缺口是 App 巡检自动挂载和真实 repo fix / PR route 的端到端 closeout 证据。

Fresh runtime evidence（2026-05-18）显示：默认 `opl family-runtime status` 选中 `temporal`，managed Temporal service / worker ready；显式 `OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite` 时只进入 dev/CI/offline diagnostic path，`full_online_ready=false` 且不能替代 domain daemon。`family-runtime status.periodic_execution` 已把 scheduler owner、cadence owner、schedule id、status/install/trigger/tick 命令和 domain-daemon replacement policy 做成机器读面；`runtime app-operator-drilldown.periodic_execution_refs` 供 App 同步消费。`runtime app-operator-drilldown.app_execution_bridge` 现在显式暴露 App 应如何把 owner-aware safe action route 交给 `opl runtime action execute`：OPL-owned query 可执行 framework read、provider route 发 provider receipt、domain route 只进入 typed queue / approval，不直接执行 domain action 或写 domain truth。`opl family-runtime scheduler install --provider temporal` 已创建 `opl-family-runtime-provider-scheduler`，`scheduler trigger` 已返回 triggered，`scheduler tick --provider temporal --force` 已生成新的 `production_residency_proven` provider SLO execution receipt，并通过 OPL typed queue 接收 domain owner receipt / typed blocker，不写 domain truth。本机 `launchctl list` 与 `~/Library/LaunchAgents` fresh check 未发现 MAS / MedAutoScience supervision scheduler label 或 plist；MAS 旧 local scheduler 只能作为 repo-local cleanup diagnostic / tombstone 语境读取。

MAS/MAG/RCA 当前均可被 OPL 识别为 standard domain agent consumer。这个状态说明 descriptor、read model、handoff、generated/handler target proof 和 replacement surface 已经存在；不能写成 production domain owner chain、App 真实用户路径或 long-soak evidence 已全部闭合。Fresh OPL proof-bundle evidence（2026-05-18）显示 `opl stages proof-bundle --domain mas|mag|rca` 均返回 `admission_status=admitted`、`blockers_count=0`、`warnings_count=0`，`opl stages list` 汇总为 18/18 stages admitted。MAS 当前机器面已关闭未分类 generic owner 回流、effect-boundary stage admission 和 5 个结构 follow-through gate，`classification_gap_count=0`、`active_private_generic_residue_count=0`、`functional_structure_gap_count=0`；2026-05-19 MAS main 又新增 `runtime_transport_handoff_projection`，把 `mas_runtime_core`、turn runner、worker lease、runtime supervisor 与 `runtime_lifecycle_store.py` 逐项约束为 OPL generic runtime 的 domain bridge / refs-only sidecar / diagnostic，不再允许 MAS 声明 queue、attempt ledger、worker residency、transition runner 或 persistence/lifecycle engine owner。MAS 剩余是真实 paper-line provider apply、memory/artifact/lifecycle receipt scaleout、human gate/resume、provider SLO long-soak evidence gate，以及 no-active-caller / OPL parity / domain receipt parity 成立后的物理删除、archive 或 tombstone。MAG 当前 repo-side handler / refs-only / authority boundary 已闭合；剩余主要是外部默认 caller、App 消费、live soak 和 owner receipt scaleout 证据。RCA 当前 generated/hosted shell 消费边界已由 OPL `agents interfaces --repo-dir` read model 承接，`generated_wrapper_bundle` 机器面显式列出 `cli`、`mcp`、`skill`、`product_entry`、`product_status`、`product_session`、`sidecar`、`workbench` 的 OPL-owned descriptor scope，并把 RCA 限定为 domain handler target 或 refs-only adapter；这仍不代表 RCA production visual-stage long soak、真实 artifact-producing owner receipt 或 domain ready 已完成。RCA 剩余主要是 controlled visual-stage long soak 和 legacy physical cleanup 证据。

Fresh substrate evidence（2026-05-18）显示：`opl substrate projection --domain med-autoscience --json` 返回 `projection_status=substrate_refs_resolved`，source refs、artifact refs、memory refs 与 lifecycle projection 均为 `resolved`。OPL 只索引 MAS manifest 暴露的 body-free source/artifact/memory refs；source truth、memory body、artifact body、publication quality verdict 和 artifact mutation authority 仍归 MAS。

当前 active gap 与实施顺序以 [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md) 和 [生产级框架闭环差距矩阵](./active/production-framework-closure-gap-matrix.md) 为准。dated proof、receipt 明细和阶段 closeout 流水保存在 [OPL family 文档过程归档 2026-05](./history/process/plans/2026-05-18-opl-family-doc-process-history.md)，不在本页展开。

## 当前功能/结构差距

OPL family 当前不能写成整体 `functional_structure_gap_count=0`。仍需关闭的功能/结构差距是：

1. `generated_surface_production_consumption`
   OPL pack compiler / generated surface 已能输出 active-caller target proof；MAS/MAG/RCA repo-side generated/handler target consumption 已闭合。descriptor ready / classification closed 代表可生成、可分类和可路由；production domain owner chain、live caller evidence 和 domain ready 仍通过真实 provider / App / owner receipt evidence gate 验收。

2. `stage_launch_admission_gate`
   `family-stage-admission` 已经是 `opl stages list|inspect` 的读模型；`family-runtime attempt create` 现在会记录 `opl_family_stage_launch_admission_gate`，声明 stage blocker 会进入 blocked attempt；`--require-stage-admission` 已在 attempt start 与 provider-hosted tick 路径阻断 executor/domain dispatch；`opl stages proof-bundle --domain <domain>` 已投影 admission、runtime-event、idempotency 与 expected receipt obligation，且三仓当前 18 个 stage 全部 admitted。`family-stage-control-plane` 现在也能声明 `runtime_assumptions` 与 `monitor_refs`，让 App/operator 看到 source freshness、provider SLO、boundary failure rate、artifact locator freshness 等运行假设的 monitor 来源；这些字段只做 projection，不授权 OPL 写 domain truth 或 domain verdict。剩余功能项是把 selected executor binding、真实 consumed refs、expected receipt refs 与 monitor freshness 的 production caller scaleout 纳入 queue/provider/App 可见证据。

3. `app_workbench_drilldown`
   OPL CLI/runtime read model 已覆盖 route graph、review queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness、SLO 和 owner-aware action routing；`app_execution_bridge` 已把 App 调用边界收口到 `opl runtime action execute`、`runtime lifecycle apply/reconcile` 和受监督 provider scheduler command refs。One Person Lab App/AionUI 仍需要把这些 read model 产品化为稳定页面级工作台与真实用户路径证据。domain repo 不应复制通用 workbench。

4. `domain_private_platform_residue`
   MAS 已把未分类 generic owner 回流和 5 个 structural follow-through gate 清零，并新增 `runtime_transport_handoff_projection` 约束 runtime runner / worker lease / supervisor / SQLite sidecar 只能作为 domain bridge、receipt、typed blocker、refs-only sidecar 或 diagnostic。RCA 仍保留 legacy physical cleanup evidence gap；MAG/RCA 的 live default caller 与 App/owner-chain evidence 仍需 scaleout。所有新发现或既有残留都必须按 OPL 上收、generated surface 替换、refs-only 收薄、minimal authority function、diagnostic cleanup 或 tombstone 分类处理；结构闭合不能写成真实生产 owner chain、live evidence 或物理代码路径已清零。

5. `legacy_physical_cleanup`
   Hermes/Gateway/frontdoor/local-manager/MDS-default/default-compat 等旧面只有在 provenance、diagnostic、fixture、negative guard 或 history 语境中可见。MAS local LaunchAgent 当前没有本机 active label / plist；MAS repo 内相关路径只能保留 explicit cleanup diagnostic / tombstone 角色。MAG local runtime journal / Hermes probe 与 RCA repo-local wrapper/session/sidecar residue 仍需按 no-active-caller proof 继续清理。

6. `app_managed_environment_startup_maintenance`
   App 产品路径已明确 managed environment 优先，developer checkout 只能显式 override；但启动维护仍需产品化为自动检查和受控更新：clean managed checkout 可自动 fast-forward、跑 health check、同步 skills/plugin metadata；dirty/ahead/diverged/no-upstream/health-failed/restart-required 必须展示为人工处理状态，不得静默覆盖或用 developer checkout 污染产品 runtime。

7. `developer_mode_agent_lab_repair_route`
   Developer Mode 的系统配置、App settings / initialize surface、GitHub login / repo permission projection、direct repo fix / fork PR route 计算和 Agent Lab refs-only repair route read model 已落地。该路线应按 Agent Lab 风险分级运行：低风险 prompt/rubric/display/read-model/test metadata 可 auto-promote；中风险 stage/tool/retry-dead-letter/memory-retrieval policy 需 independent AI approve、tests pass 和 canary 后自动推广；高风险 domain truth、quality verdict、artifact mutation、memory accept/reject 与 credential/network/write policy 必须 owner/human gate。剩余证据门是用真实 repo 问题跑一次 owner direct-fix 与 non-owner fork/PR 的端到端 closeout；该能力必须保持 managed runtime truth 不变，只授权开发修复、PR 路由和合规的低/中风险机制推广。

8. `agent_lab_external_research_absorption`
   OPL Agent Lab 已把 ARIS 风格的日志驱动机制优化、独立 AI reviewer、自动 promotion / rollback、integration contract 和 review trace 变成 machine-readable refs-only surfaces。MAS 侧负责把 research wiki、reviewer direct evidence、analysis queue manifest、runtime event ledger、provider/executor switch hygiene 和 claim assurance 投影进 `mechanism_evolution_inputs`；OPL 只消费 refs、typed graph/queue/ledger/hygiene/assurance metadata 和验证结果，不接管 paper memory body、analysis queue body、runtime event body、provider/executor transcript body、claim text body、publication verdict、owner receipt 或 artifact authority。

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
- 不能把 MAS/MAG/RCA generated surface repo-side closure 写成外部发布默认 caller、App 真实用户路径或 live owner-chain evidence 已全部闭合。
- 不能把 MAS descriptor ready、read model、provider proof、replacement proof 或 generated bundle ready 单独写成 MAS 功能/结构差距归零；MAS 结构闭合必须来自 closure gate proof refs，live paper evidence 仍单独验收。
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
