# OPL Family Ponytail Cleanup Runbook

Owner: `One Person Lab`
Purpose: `references_operating_governance_ponytail_cleanup_runbook`
State: `support_reference`
Machine boundary: 本文是人读 cleanup runbook 与矩阵模板。它不承载 fresh audit 输出、物理删除授权、domain ready、production ready、owner receipt、typed blocker、runtime truth、release truth 或机器合同。当前机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/release evidence 与 fresh ponytail-audit / repo-native 验证输出。

## 读法

本文为 OPL family 的 Ponytail cleanup 建立 durable 操作面：它规定如何把 `delete`、`shrink`、`yagni`、`stdlib`、`native` 候选从一次性审计输出转成可接力的小批量 lane。它只承接审计矩阵、owner boundary、验证口径和完成度审计模板，不复制某次审计的逐文件清单。

Source of truth：

- 文档生命周期与落点：[`docs/docs_portfolio_consolidation.md`](../../docs_portfolio_consolidation.md)。
- 维护开发 taste：用户级 `~/.codex/TASTE.md`，尤其是真相归主、目标先于路径、单源派生、结构收敛和证据匹配风险。
- Cleanup candidate 输入：fresh `ponytail-audit` 输出、repo-native structure advisory、当前代码调用链、contracts/source/tests/readback。
- Owner boundary：OPL 持有 framework/shared primitive、generated/hosted surface、projection 与 cleanup gate；MAS/MAG/RCA 持有各自 domain truth、quality/export verdict、artifact authority、owner receipt 与 typed blocker；App 仓持有 GUI/product/release truth。

涉及的 OPL 品牌模块：

- 主模块：`OPL Charter` 和 `OPL Atlas`。Charter 持有 cleanup 的命名、authority boundary、forbidden claim 和 lifecycle discipline；Atlas 持有 repo/module/owner surface 的 catalog 读法。
- 协同模块：`OPL Pack`、`OPL Runway`、`OPL Ledger`、`OPL Console` 和 `OPL Connect`。Pack/Connect 决定 generated/hosted surface 与外部调用面是否可收薄；Runway/Ledger 决定 runtime evidence、receipt、typed blocker 与 refs-only ledger 边界；Console 只消费 projection，不授权 cleanup。
- 不触碰范围：本文不新增品牌模块，不修改 brand module registry，不改 machine-readable contract，不把 cleanup matrix 升级成 App/product/runtime/domain authority。

## 启动策略

Ponytail cleanup 默认分三步启动：

| 阶段 | 目标 | 允许动作 | 禁止动作 |
| --- | --- | --- | --- |
| 联合只读 inventory | 读取 OPL family 多仓 fresh audit 输出，形成候选分类与 owner 初判。 | 只读扫描、记录 repo/module/候选/owner blocker、标记 wave。 | 不跨仓写 source，不移动 contracts，不把 audit finding 写成删除授权。 |
| 单仓落地 | 在 owner 清楚、写集隔离、验证入口明确的单仓执行最小 slice。 | 删除无 caller 的旧面、收薄 command/docs、行为保持拆分、更新本仓 docs/history/tombstone。 | 不替 domain repo 签 receipt，不写 runtime DB/provider/domain authority，不制造兼容 shim。 |
| 小批量 shared-boundary 联动 | 多仓共享边界确实需要同步时，按 owner surface 分成小批 lane。 | 先落 framework/shared primitive 或 App projection，再由 domain repo 消费；每批有独立验证和吸收证据。 | 不用一次性大改覆盖六仓，不把 OPL refs-only projection 当成 domain physical delete authority。 |

启动前必须读当前 repo 的 `AGENTS.md`、用户级 `~/.codex/TASTE.md`、相关 owner docs 和 fresh `git status` / worktree gate。存在并发 lane 时，dirty 文件只阻塞同一写集；不相交的 docs/command lane 可以继续。

## 审计矩阵字段

每条候选必须用下列字段记录。矩阵可以放在本文件的临时执行副本、lane handoff、PR 描述或对应 repo 的 owner doc 中；不要把动态逐文件清单永久复制进 support reference 正文。

| 字段 | 含义 | 例子或取值 |
| --- | --- | --- |
| `repo` | 候选所在仓库。 | `one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app` |
| `module/owner surface` | 真实 owner 面，不只写文件名。 | `OPL CLI command specs`、`MAS paper runtime owner route`、`App shell candidate policy` |
| `tag` | Ponytail 分类。 | `delete`、`shrink`、`yagni`、`stdlib`、`native` |
| `candidate` | 可执行候选，写成最小可验证动作。 | `删除无 active caller 的旧 alias`、`把单实现 wrapper 收薄到 direct export` |
| `authority blocker` | 阻止直接落地的 authority 条件。 | `needs owner receipt`、`active caller unknown`、`contract refs unresolved`、`runtime truth owner external`、`none` |
| `write owner` | 谁能写入并吸收。 | `OPL framework lane`、`MAS repo owner lane`、`App release owner lane` |
| `validation` | 证明该候选的最小充分证据。 | `rg caller check + focused CLI test`、`npm run typecheck`、`scripts/verify.sh`、`domain owner readback` |
| `wave` | 推进批次。 | `inventory`、`single-repo-slice`、`shared-boundary-batch`、`owner-gated` |
| `status` | 当前状态。 | `candidate`、`accepted`、`in_progress`、`done`、`blocked`、`rejected`、`history_only` |

模板：

| repo | module/owner surface | tag | candidate | authority blocker | write owner | validation | wave | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<repo>` | `<owner surface>` | `<delete/shrink/yagni/stdlib/native>` | `<smallest safe action>` | `<none or blocker>` | `<lane owner>` | `<fresh evidence>` | `<wave>` | `<status>` |

## 第一批 Lane 边界

当前第一批以 OPL 主仓为 coordination surface，不把 sibling repo cleanup 直接写入本 worktree。

| Lane | 目的 | 允许写集 | 不触碰范围 | 验证 |
| --- | --- | --- | --- | --- |
| `ponytail-family-readonly-audit-20260627` | 跨 OPL family 做只读 inventory，输出候选矩阵与 owner 初判。 | 无 sibling repo 写入；若需要，只能在该 lane 自身 worktree 写矩阵草案。 | sibling repo source、contracts、runtime/domain authority、root checkout。 | fresh audit 命令输出、repo/worktree 状态、候选矩阵完整性。 |
| `ponytail-command-docs-20260627` | 在 OPL 主仓落地本 runbook / matrix support，并可做低风险 command/docs 收薄。 | `docs/active/**` 或 `docs/references/operating-governance/**`；只有发现非常低风险行为保持拆分时，才触碰 `src/cli/cases/*command-specs*.ts` 与相关 tests。 | `contracts/**`、runtime DB/provider/domain authority、`src/system-installation/**`、`src/opl-skills-parts/paths.ts`、sibling repos、其他活跃 lane 写集。 | docs-only 时做 markdown links / `rg` sanity；若改 TS，必须 `npm run typecheck` 加相关 focused tests。 |

第一批明确不做：

- 不改 root checkout，不吸收或 revert 其他 worktree 的 dirty diff。
- 不改 `contracts/**`，不改 runtime DB/provider state，不写 owner receipt、typed blocker、human gate 或 domain authority。
- 不在 sibling repos 直接落 cleanup；跨仓候选先进入只读矩阵，再由对应 repo owner lane 单独实施。
- 不把 docs、audit matrix、focused tests、projection clean 或 queue clean 写成 physical delete authorized、domain ready、App release ready 或 production ready。

## 落地规则

1. 每个候选先从 `candidate` 收敛到一个最小 action。无法说明最小 action 的候选留在 `inventory`，不进入写 lane。
2. `delete` 需要同时满足 no-active-caller、replacement owner、provenance/tombstone 需要已处理、验证能覆盖回归风险；涉及 domain authority 时还需要 domain owner receipt 或 typed blocker。
3. `shrink` 只做行为保持收薄。若需要改变 CLI/API 行为、schema、contract 或 runtime/write authority，升级到对应 owner lane，不再按 Ponytail cleanup 处理。
4. `yagni` 必须证明只有一个真实实现或配置无人消费；如果只是当前看起来少用，先标 `owner-gated`。
5. `stdlib` / `native` 替换必须命名具体标准库或平台能力，并确认目标 runtime 支持；不要新增依赖来替代可删除代码。
6. Shared-boundary cleanup 先改 canonical owner，再改 consumers；consumer 侧只读 projection 或 docs 不授权 canonical owner 的物理删除。
7. 每个 lane 完成后记录 changed files、验证命令、残余风险和未闭合 owner blocker；过程流水进 handoff/PR/history，不追加到本 support reference 的长期正文。

## 完成度审计模板

当用户要求“全部落地”“彻底完成”或 lane 准备 closeout 时，用原始目标和矩阵条目做 Plan Completion Audit。不要用实际完成的提交摘要替代原计划。

| 验收项 | 状态 | 完成度 | fresh evidence | 缺口 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 联合只读 inventory 已完成并绑定 fresh output | `<done/partial/not_started/blocked>` | `<0-100%>` | `<command/ref>` | `<gap>` | `<next action>` |
| 单仓落地候选已按 owner lane 验证 | `<done/partial/not_started/blocked>` | `<0-100%>` | `<command/ref>` | `<gap>` | `<next action>` |
| shared-boundary 小批联动未越权 | `<done/partial/not_started/blocked>` | `<0-100%>` | `<command/ref>` | `<gap>` | `<next action>` |
| authority blocker 均有 owner route | `<done/partial/not_started/blocked>` | `<0-100%>` | `<receipt/blocker/ref>` | `<gap>` | `<next action>` |
| docs/runbook/matrix 已落到正确 lifecycle layer | `<done/partial/not_started/blocked>` | `<0-100%>` | `<file/ref>` | `<gap>` | `<next action>` |
| 验证与 residual risk 已记录 | `<done/partial/not_started/blocked>` | `<0-100%>` | `<command/ref>` | `<gap>` | `<next action>` |

`100%` 只能用于已有 fresh executable evidence 的条目。文档、矩阵、focused tests、read-model clean 或提交存在，只能证明对应的文档/测试/提交条目完成；它们不能单独证明 runtime readiness、physical delete authorization、domain ready、App release ready 或 family production ready。
