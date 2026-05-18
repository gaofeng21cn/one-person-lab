# OPL 生产级框架闭环差距矩阵

Owner: `One Person Lab`
Purpose: 记录 OPL 距离完整生产级智能体框架的当前差距、证据门和下一跳闭环。
State: `active_plan`
Machine boundary: 本文是人读 gap matrix。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / App evidence。
Date: `2026-05-18`

## 当前判断

如果把理想状态定义为“OPL 能生产级托管 MAS/MAG/RCA 的长时间 stage attempt，同时 direct skill path 等价、domain truth 不迁出、旧默认面退役干净”，当前只能写成：framework/control-plane 与 closeout read model 已进入 live-soak-ready 基础面；MAS/MAG/RCA 已有可被 OPL 识别和消费的标准 Agent 迁移输入；MAS 5 个结构 follow-through 已关闭，MAG/RCA 的 repo-side generated/handler boundary 更干净，但三仓仍缺 production default caller / App / owner-chain / live-soak evidence。

已经成立的是 OPL framework 骨架和读模型：Temporal provider、OPL-owned provider scheduler cadence/tick surface、typed queue、stage attempt ledger、typed closeout、safe runtime action shell、lifecycle refs-only index、App/operator drilldown read model、provider proof/readiness projection、functional runtime harness、generic substrate projection、transition runner/read model、domain pack compiler active-caller proof、Agent Lab 和 private functional audit。

Fresh runtime evidence（2026-05-18）已经把 provider cadence 从“命令面存在”推进到“本机真实 receipt 存在”：默认 `family-runtime status` 选中 `temporal` 且 managed service / worker ready；Temporal schedule `opl-family-runtime-provider-scheduler` 已创建，`scheduler trigger` 已返回 triggered，`scheduler tick --provider temporal --force` 已生成新的 `production_residency_proven` SLO execution receipt。`local_sqlite` 只有显式选择时作为 dev/CI/offline diagnostic baseline，不能替代 production provider 或 domain daemon。本机 `launchctl list` 与 `~/Library/LaunchAgents` fresh check 未发现 MAS / MedAutoScience supervision scheduler label 或 plist；MAS 旧 local scheduler 只能作为 cleanup diagnostic / tombstone 处理。

仍未闭合的是 MAS/MAG/RCA production consumption、App 真实用户证据和真实 owner-chain：

- MAS 已关闭 `functional_structure_gap_count=0` 的结构 follow-through；MAG/RCA repo-side generated/handler target consumption 已闭合，但外部默认 caller、App 消费和 live owner-chain evidence 仍需 scaleout；
- One Person Lab App root contract 与 AionUI runtime 页面已消费 OPL App/operator drilldown read model；剩余是真实用户路径、截图/发布包证据和长时 operator evidence；
- lifecycle / artifact / memory locator 与三仓结构收敛、真实 workspace receipt long-soak 仍需持续对账；
- Temporal provider SLO / repair cadence 已有真实 schedule install/trigger/tick receipt，但还缺长窗口持续证据；
- MAS repo 内 active caller cutover、refs-only 收薄、physical retirement、App/workbench 与 lifecycle 对账已作为结构 closure gate 关闭；MAG/RCA 还需要按 no-active-caller proof 做 remaining legacy cleanup evidence；
- MAS/MAG/RCA 的真实 owner receipt chain、memory body/writeback apply、artifact mutation receipt 和 controlled long soak 仍需 scaleout。

过程性 proof、receipt 事件、具体 task id 和阶段 closeout 摘要不放在本矩阵，统一归档到 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。

## Closure Gap Matrix

| gap | 当前已落地 | 未闭合内容 | 下一跳完成门槛 |
| --- | --- | --- | --- |
| `production_temporal_residency` | Temporal 是 production required provider；`local_sqlite` 已降为 dev/CI/offline diagnostic baseline；provider proof/status/readiness 可读；本机 Temporal schedule 已安装并可 trigger/tick，fresh SLO receipt 为 `production_residency_proven`。 | 自动或受监督 cadence 的长窗口、overdue repair execution receipt、restart/re-query/signal/history 长窗口证据和真实 domain attempt 压测仍未闭合。 | Temporal production proof 按 cadence 持续可重复通过，并用长窗口 SLO 证明 service/worker/workflow/query/signal/history/restart recovery 不退化。 |
| `stage_launch_admission_gate` | `family-stage-admission` read model 已接入 `family-runtime attempt create`；声明 stage 的 admission blocker 会进入 blocked attempt，`needs_contracts` warning 会进入 attempt activity events；未声明旧 stage 只作为 legacy/diagnostic attempt metadata，不能当作标准 OPL Agent production launch evidence。 | selected executor binding、idempotency、consumed refs、expected receipt refs 仍需进入 queue/provider/App 的严格 launch gate；当前 gate 已阻断明确 blocker，但还未把所有启动前 contract obligation 都机器化。 | 每个 production stage attempt 在启动前都有 stage pack admission、executor binding、idempotency、consumed refs、expected receipt refs 和 owner boundary proof；不满足时产出 typed blocker / human gate / route-back。 |
| `generated_surface_production_consumption` | `domain-pack-compiler` 已能投影 CLI/MCP/product-entry/sidecar/status/workbench/harness handoff metadata 与 active-caller proof；MAS/MAG/RCA generated interface descriptor 均可读；MAS/MAG/RCA repo-side generated/handler target consumption 已闭合。 | MAG/RCA 还缺外部默认 caller / App / live owner-chain evidence；MAS 还缺真实 provider / App / owner receipt evidence，不是 domain ready。 | MAG/RCA 用 release/dist/default caller evidence、App evidence 和 live owner receipt chain 证明生产消费；MAS 用 paper-line provider/app evidence 证明迁移后目标边界持续成立。 |
| `app_operator_drilldown` | runtime snapshot、stage attempt、substrate projection、transition evidence、lifecycle refs、safe action routing 和 production closeout readiness 已有 CLI/runtime read model；One Person Lab App root contract 已绑定 `runtime_tray_snapshot.app_operator_drilldown`，AionUI runtime 页面已接入 `AppOperatorDrilldown` 组件。 | 真实用户路径、截图/发布包证据、长时 operator evidence、release artifact 证据和三仓 owner-aware drilldown 消费仍需闭合。 | App/workbench 能按 owner 展示 provider、attempt、source/artifact/memory refs、blocker、repair 和 action routing，并且不产生 domain verdict；发布包和截图证据证明该路径可用。 |
| `app_managed_environment_startup_maintenance` | `opl modules`、`opl module update` 和 `opl skill sync` 已能手动维护 OPL-managed modules、Codex skills 与 plugin metadata projection；产品口径已固定为 App managed environment 优先，developer checkout 显式 override。 | App 启动时还未形成自动 freshness check、clean-only update、health check、skill sync、plugin cache freshness 和 restart/reload 提示的完整用户路径。 | App 启动维护默认检查 managed environment；clean managed checkout 可自动 fast-forward 并同步投影；dirty/ahead/diverged/no-upstream/health-failed/restart-required 进入可见人工处理状态，不静默覆盖 developer checkout 或 managed runtime。 |
| `developer_mode_agent_lab_repair_route` | `opl system developer-supervisor` 已有系统级配置入口；`developer_mode` projection 已能检测 GitHub identity、repo permission，并计算 direct repo fix / fork PR / mixed / observe-only 路由；`opl system`、`opl system initialize` 和 App settings surface 已暴露同一个 `developer_supervisor` action；Agent Lab workbench 已输出 refs-only repair route read model。 | 真实 repo 问题上的 owner direct-fix 与 non-owner fork/PR closeout 证据尚未形成；这属于 live exercise/evidence gap，不是配置或 projection 缺口。 | Developer Mode 开启后，任务默认可触发 Agent Lab 外围巡检；有 repo 权限时走受控 worktree/branch 修复提交和 owner-visible evidence；无 repo 权限时走 fork / PR；全程不改变 managed runtime truth，不写 domain truth。 |
| `mas_paper_line_guarded_apply_soak` | MAS 三条真实 paper line 已有 OPL-ingestable refs/read-only evidence；OPL 禁止写 MAS truth 的边界可见。 | 多条真实 paper line 的 provider-hosted apply、owner receipt、progress delta、AI reviewer/gate/artifact movement、human gate 或 stable typed blocker 仍需 scaleout。 | MAS 每条主线都产出 owner receipt、progress delta 或 typed blocker；OPL 只持 attempt/proof/ref，不写 `publication_eval`、`controller_decisions`、artifact gate、review ledger、memory body 或 final verdict。 |
| `mag_controlled_soak` | MAG 已有 grant transition oracle、receipt reconciliation proof、refs-only handoff surface 和 owner receipt contract。 | 真实 OPL-hosted grant-stage attempt、持续 owner receipt / typed blocker / no-regression evidence 和 long soak 未闭合。 | MAG controlled transition / stage attempt 在真实 workspace 中持续返回 owner receipt、typed blocker 或 no-regression evidence；fundability/export authority 仍归 MAG。 |
| `rca_controlled_soak` | RCA 已有 visual transition spec/evaluator、hosted-attempt receipt shape、workspace receipt inventory 和 no-regression refs-only projection。 | 真实 artifact-producing owner receipt、visual memory body reuse、workspace receipt scaleout 和 long visual-stage no-regression evidence 未闭合。 | RCA controlled visual / transition attempt 接到真实 provider evidence，并返回 domain receipt、no-regression evidence 或 typed blocker；visual verdict/export gate 仍归 RCA。 |
| `domain_memory_apply_generalization` | MAS/MAG/RCA 都有 memory descriptor、body-free refs、writeback proposal/receipt ref 和 forbidden-write boundary。 | 真实 memory body migration/retrieval/writeback apply、accepted/rejected receipt scaleout 和 operator proof 仍归 domain workspace owner；descriptor/read model 不等于 apply 已完成。 | 三仓都能用 domain-owned surface 产出真实 memory consumed/writeback receipt；OPL 只展示 locator、attempt/proof/ref 和 blocker。 |
| `lifecycle_guarded_apply` | OPL lifecycle schema / locator / refs-only index、guarded apply 和 restore/cleanup proof refs 已存在，domain 仓暴露 guarded apply proof 或 receipt requirement refs。 | cleanup/restore/retention 与真实 workspace artifact mutation receipt 的持续对账还未闭合；replacement proof 不等于 lifecycle reconciliation 已完成。 | OPL-owned ledger/locator 只写 framework refs；domain-owned artifact mutation 必须返回 domain receipt 或 typed blocker。 |
| `generic_state_machine_runner` | OPL 已有 domain-neutral transition schema、runner、matrix runner、receipt/projection envelope 和 refs-only transition bridge projection。 | MAS/MAG/RCA 真实 sidecar dispatch 后的 accepted owner receipt、typed blocker/no-regression evidence 和 long-soak matrix evidence 仍需 scaleout。 | Domain 提供 transition table、guard、oracle fixture、typed blocker 和 owner receipt；OPL 只执行 spec、审计 matrix、hydrate provider task 和投影 refs。 |
| `physical_skeleton_layout` | OPL read model 能区分 descriptor readiness、skeleton audit、repo-source anchor evidence 和 production closure gaps。 | 三仓破坏性目录迁移未执行；直接移动仍可能破坏 direct skill path、provenance refs 或 workspace boundary。 | direct/hosted parity、restore/provenance proof、focused tests 与 no-forbidden-write proof 稳定后，逐仓迁移 repo-source schema/adapter/builder/prompt/skill/knowledge refs；workspace artifacts 不迁入 repo skeleton。 |
| `legacy_active_path_retirement` | 默认语义已转为 Codex-default executor + Temporal-backed provider；旧名只允许在 diagnostic、fixture、provenance、history 或 negative guard 语境中出现。 | Hermes/Gateway/frontdoor/local-manager/MDS/default-compat 仍可能有物理残留或文档残留。 | replacement proof 与 no-active-caller proof 同时通过后，删除 active residue 或迁入 history/tombstone；不保留兼容接口。 |
| `executor_adapter_hygiene` | `codex_cli` 是默认 executor；`hermes_agent`、Claude Code 等是显式非默认 adapter。 | 非默认 adapter 的 receipt gate、tool-event proof、timeout、closeout 和 fail-closed 仍需按 route 验证；旧 Hermes provider/readiness/Gateway 词汇不得回流。 | 非默认 adapter 只证明连接和回执，不承诺 domain quality；旧 provider/Gateway/compat 面清理到 history/tombstone。 |

## 统一口径

可以写成：

OPL 已具备完整生产级智能体框架的控制面骨架，并已进入 live-soak-ready 基础面；Temporal 是 production required provider；MAS/MAG/RCA 的 descriptor、stage/action/memory、transition refs、owner receipt refs 和 authority boundary 已能被 OPL 只读消费。这个状态是继续收敛到标准 OPL Agent 的基础，不是三仓功能/结构 gap 清零。

不能写成：

- OPL 已全量生产可用。
- MAS paper closure、MAG grant-stage soak、RCA visual-stage soak 已完成。
- 不能把 MAS/MAG/RCA generated surface repo-side closure 写成外部发布默认 caller、App 真实用户路径或 live owner-chain evidence 已全部闭合。
- App/workbench 的真实用户路径、截图/发布包证据和长时 operator evidence 已完整闭合。
- 不能把 Developer Mode repair route read model 写成真实 repo direct-fix / fork-PR closeout 证据已完成。
- private functional audit 分类完成等于代码路径物理清零。
- provider completion 等于 domain ready、quality ready、fundability ready、visual ready 或 export ready。
- 不能把 MAS descriptor ready、read model、provider proof、replacement proof 或 generated bundle ready 单独写成 MAS 功能/结构差距归零；MAS 结构闭合必须来自 closure gate proof refs，live paper evidence 仍单独验收。

## 下一跳顺序

1. `generated_surface_production_consumption` for MAS/MAG/RCA
2. `App/operator drilldown GUI evidence`
3. `App managed-environment startup maintenance`
4. `Developer Mode direct-fix / fork-PR live closeout evidence`
5. `MAS paper-line guarded apply scaleout`
6. `Temporal provider continuous proof / SLO cadence long-window evidence`
7. `transition owner receipt / no-regression evidence on OPL bridge`
8. `domain memory/lifecycle apply generalization`
9. `MAG/RCA controlled soak`
10. `physical skeleton layout`
11. `legacy physical retirement`

每一步都必须留下 repo-native verification、domain owner receipt、no-regression evidence 或 typed blocker；没有 fresh evidence 不写完成。
