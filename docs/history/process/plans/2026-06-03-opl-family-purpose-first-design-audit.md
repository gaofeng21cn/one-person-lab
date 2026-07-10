# OPL 系列目的优先设计审计

Owner: `One Person Lab`
Purpose: `purpose_first_design_audit`
State: `history_provenance_compressed`
Machine boundary: 本文是人读历史顶层设计审计摘要。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/release evidence、真实 workspace evidence 和 repo-native verification。
Date: `2026-06-03`
Compressed: `2026-06-08`

## 读法

本文保留 2026-06-03 OPL family purpose-first 顶层设计审计的 compact provenance。它不再承载当前 owner、当前 gap、下一轮 agent prompt、fresh readiness 结论或跨仓执行计划。

当前 owner 回到：

- 当前目标、差距、完成口径和下一轮 baton：[OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md)
- 目的优先稳定审计标准：[OPL Foundry Agent Target Operating Architecture](../../../active/opl-foundry-agent-target-operating-architecture.md)
- production closure 证据门：[OPL 生产闭环差距矩阵支撑](../../../active/production-framework-closure-gap-matrix.md)
- 当前角色与架构：`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- 文档生命周期与历史压缩规则：[OPL 文档组合治理](../../../docs_portfolio_consolidation.md)

历史文件里的 `current`、`next`、repo dirty state、ahead/behind、workorder 数、provider attempt 数、CLI JSON path、验证命令和执行顺序都只按 2026-06-03 附近的历史审计语境阅读。继续治理 OPL series 时必须重新读取 live repo state、contracts、source、tests、CLI/read-model、runtime ledger、App release evidence 和 domain owner refs。

## Historical Question

本轮按 `TASTE.md` 的 purpose-first / executor-first / owner-delta-first 原则，从目标态反推，而不是从既有目录、历史实现、shell、状态面板或证据账本反推。

当时审计的问题是：如果从目标重新设计，是否还需要某个层级、壳、读面、证据尾项、workflow 或 wrapper；还是可以更直接地用 domain pack、OPL hosted runtime、domain authority receipt、typed blocker、App compact projection 和 owner route 达到目的。

目标态固定为：

```text
OPL Framework -> One Person Lab App -> Foundry Agents
```

并把标准 Foundry Agent 读为：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + minimal authority functions
```

## Historical Snapshot Boundary

2026-06-03 的历史 readout 曾覆盖 OPL、MAS、MAG、RCA、OMA、App、Aion shell、AG-UI candidate shell、OPL Doc、OPL Flow 和 gflab_web。该 snapshot 同时记录了多个 sibling repo 的 dirty state、ahead/behind、local changes、CLI readout 和 dynamic counters。

这些信息现在只保留为 provenance，不得作为当前 repo truth 复用：

| Snapshot class | 历史用途 | 当前边界 |
| --- | --- | --- |
| repo dirty / ahead-behind state | 说明当时只读审计可信边界。 | 当前状态必须重新 `git fetch` / `git status`。 |
| OPL CLI/read-model counters | 辅助判断 raw drilldown 是否过重、owner-delta 是否已出现。 | 当前 owner、workorder、attempt、blocker 和 safe action 必须 fresh-read。 |
| per-repo design notes | 记录目的优先角色和默认处置。 | 稳定结论已折回 active purpose-first support；细节由各 repo active truth owner 维护。 |
| App/shell/support repo observations | 说明 implementation carrier / support tool 不拥有 OPL/App/domain truth。 | 当前 App release、shell validation、doctor/profile truth 必须从对应 repo live evidence 读取。 |

## Compressed Findings

### Top-Level Finding

当前 OPL family 的顶层方向在这轮审计中被判定为正确：`OPL Framework -> One Person Lab App -> Foundry Agents`。真正需要治理的是减法和默认路径收敛，而不是增加第二 runtime、第二 read-model authority、第二 App bridge、第二 Agent Lab、domain-local scheduler、repo-local session store、App-owned runtime truth、shell-owned product truth 或 OMA-owned promotion gate。

长期优化方向是：

- 默认读面只回答 current owner、required delta、accepted answer shape、hard gate 和下一步 owner action。
- raw refs、stage replay packet、typed blocker group、private residue、payload template 和 full route list 只在 explicit full-detail / audit drilldown 展开。
- Domain repo 收薄为 domain pack、contracts、minimal authority functions、domain handler target、native helper 或 direct skill path。
- App 首屏继续按用户任务和下一步 owner action收敛，不把 provider attempt、ledger、Temporal、projection 或 stage attempt 当成普通用户词汇。
- Shell repo 和 candidate shell 只做 implementation carrier；App product truth 留在 `one-person-lab-app`。
- OMA 只做 target-agent foundry / repair / takeover 语义，不成为 Agent Lab、registry、runner、promotion gate 或 target truth owner。
- OPL Doc / OPL Flow 只做文档治理和工作流 profile，不拥有项目 truth、runtime truth 或 domain truth。

### Design Burden Disposition

| 设计负担 | 历史判断 | 当前处置 |
| --- | --- | --- |
| full-detail private residue inventory | audit 必要，ordinary path 不必要。 | 默认只显示 action-required / blocker / physical-delete-ready；raw inventory 只在 full-detail。 |
| refs-only envelope / typed blocker refs | audit 必要，但不能变成普通任务队列。 | 按 owner / stage / required delta 聚合；raw item 下沉。 |
| stage replay missing receipt workorder | 对 replay/audit 有价值，但不等于可执行 work。 | 默认写成等待 domain/human owner receipt 或 typed blocker。 |
| domain repo product/status/workbench/lifecycle shell | migration input 或 direct path；长期不是标准 agent 组成。 | replacement parity、no-active-caller、owner receipt/typed blocker、no-forbidden-write 后删除或 tombstone。 |
| App release / user-path evidence | App release 必要，对 domain ready 不必要。 | 由 App repo release gate 关闭，禁止外推为 family production ready。 |
| shell candidate / upstream implementation detail | 可替换 GUI carrier 输入。 | App repo 持有 product contract；shell 只实现和验证。 |
| OMA materializer scripts | helper 有价值，runner/gate 不应下沉到 OMA。 | 稳定 policy 上收回 `agent/`、contracts、authority functions 或 OPL primitive。 |
| workflow/doc profile plugins | 支撑协作必要，不是项目事实来源。 | 只写 profile pointer / managed block / docs lifecycle evidence。 |

### Per-Repo Stable Roles

| repo | purpose-first role | no-resurrection boundary |
| --- | --- | --- |
| `one-person-lab` | OPL Framework：runtime、provider、queue、generated surface、Agent Lab、App/operator read model owner。 | raw audit tails、provider counts、private inventory、worklist 和 drilldown 不能抢占 `current_owner_delta`。 |
| `med-autoscience` | MAS Research Foundry：医学研究 truth、publication quality、artifact/memory authority、owner receipt / typed blocker owner。 | OPL 不替 MAS 生成 paper readiness、owner receipt、typed blocker、domain ready 或 production ready。 |
| `med-autogrant` | MAG Grant Foundry：grant truth、fundability / quality / export / submission gate、package authority、owner receipt / typed blocker owner。 | grouped CLI、status/user-loop、Hermes proof lane 和 runtime shell 只能作 direct path / explicit lane / delete-gate 输入。 |
| `redcube-ai` | RCA Presentation Foundry：visual truth、review/export verdict、artifact authority、visual memory authority、owner receipt owner。 | route variants、runtimeWatch、identity aliases、HTML/native variants 和 helper tails 不恢复为 default authority。 |
| `opl-meta-agent` | OMA Agent Foundry：developer work order、target capability candidate、mechanism proposal 或 typed blocker。 | 不做第二 Framework、第二 Agent Lab、promotion gate、worktree lifecycle owner 或 target truth owner。 |
| `one-person-lab-app` | App product/release/user-path owner。 | App 不拥有 OPL runtime truth、provider implementation、domain truth、quality verdict、artifact authority、memory body 或 owner receipt。 |
| `opl-aion-shell` / `opl-agui-codex-shell` | GUI implementation carrier / candidate。 | shell behavior 和 upstream marketing 不等于 App product truth。 |
| `opl-doc` / `opl-flow` | docs lifecycle steward / workflow profile steward。 | doctor clean、profile sync 或 family-plan 不能升级为 repo truth、runtime readiness 或 domain verdict。 |
| `gflab_web` | external public website / sync surface。 | 网站 prose 或 sync scripts 不持有 OPL family current runtime truth。 |

## Historical Priority Stack

本轮历史建议后来被 active docs 吸收为以下口径：

1. `do_not_expand_abstraction_layers`: 不新增第二 runtime、第二 read-model authority、workflow compiler、proof assistant、domain-local scheduler、App-owned runtime truth、shell-owned product truth 或 OMA-owned promotion gate。
2. `owner_delta_first_default`: 默认 operator / App / CLI 只消费 `current_owner_delta` 与 accepted answer shape；raw telemetry 下沉。
3. `mas_live_owner_delta`: MAS live owner delta 必须由 MAS owner receipt、owner-chain / no-regression refs 或 stable typed blocker 关闭；OPL 只 record / verify / project。
4. `domain_repo_thinning`: domain repo 长期只保 domain pack、machine contracts、minimal authority functions、domain handler/direct skill/native helper 和 refs-only return shape。
5. `app_shell_boundary`: App 产品语义由 App contracts 和 release evidence 定义，shell 只实现。
6. `support_tools_boundary`: OPL Doc、OPL Flow、gflab_web 都不进入 Foundry Agent truth owner set。

这些不再是本文的 active backlog。当前状态、priority 和 next baton 回 active gap plan。

## Forbidden Claims

- Structural conformance passed 等于 production ready。
- Default-callers deletion evidence clean 等于 domain repo physical delete authorized。
- `open_worklist=0` 或 open safe action 变化等于 completion、domain ready 或 production ready。
- App release/user-path verified refs 等于 family production ready。
- Provider SLO / running provider attempt count 等于 MAS paper closure、MAG submission-ready 或 RCA visual ready。
- Domain-owned typed blocker verified 等于 success receipt。
- Full-detail private platform residue audit-only 等于 physical delete authorized。
- Shell implementation behavior 等于 App product authority。
- OPL Doc / OPL Flow profile pointer 等于 project truth。
- Website public prose 等于 OPL family current runtime truth。

## Fresh Read Commands

继续处理 purpose-first / owner-delta / default-surface 主题时，先 fresh-read：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl agents conformance --family-defaults --json
rtk opl agents descriptors --json
rtk opl agents default-callers --family-defaults --json
rtk opl agents platform-surfaces --family-defaults --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl runtime app-operator-drilldown --json
rtk opl app state --profile fast --json
```

跨仓推进前还必须逐仓重新 `git fetch`、确认 status、读 repo-local active truth owner，并按各仓验证入口执行。

## Compression Closeout

2026-06-08 本文件从跨仓 snapshot、dirty-state caveat、逐仓长表、动态计数、旧 JSON path、执行建议和验证流水压缩为 compact provenance。当前 purpose-first 审计标准、production closure gap、current owner / gate / next action 不在本文维护。压缩 closeout 见 [2026-06-08 OPL purpose-first history compression closeout](./2026-06-08-opl-purpose-first-history-compression-closeout.md)。
