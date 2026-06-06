# OPL Active Docs Role Split SSOT Closeout

Owner: `One Person Lab`
Purpose: `opl_active_docs_role_split_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL active docs 角色治理 closeout。当前执行目标、差距、完成口径和下一轮 baton 继续归 `docs/active/current-state-vs-ideal-gap.md`；机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

## Semantic Theme

本轮治理主题是 `OPL active docs role split / single active truth owner`。

目标不是按文件重新整理 `docs/active/**`，而是按语义确认：

- OPL family 当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 baton 只能有一个 active owner。
- 支撑文档可以保留标准、owner map、证据门、目标架构、Stage Native 设计、private inventory 和 docs portfolio 规则。
- dated proof、receipt 流水、branch/worktree closeout、line-count closeout、历史 counter 和 process transcript 必须留在 history/provenance。

## Single Source of Truth

唯一 active truth owner:

- `docs/active/current-state-vs-ideal-gap.md`

它胜出是因为该文档 front matter 标记为 `State: active_plan`，正文明确维护当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 baton，并把 live truth 让位给 contracts/source/tests/CLI/read-model/runtime evidence。

文档角色 owner:

- `docs/docs_portfolio_consolidation.md`

它维护 docs taxonomy、active docs 生命周期台账、长清单治理和 direct retirement 规则；它不接管 active gap / next baton。

Active docs index/support:

- `docs/active/README.md`

它只做索引和统一读法，把执行顺序、差距闭环和当前完成门槛指回 `current-state-vs-ideal-gap.md`。

## Peer Docs Reviewed

已按内容主题核查以下 peer docs 和 evidence surfaces：

- `docs/active/README.md`
- `docs/active/current-development-lines.md`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/active/opl-family-ideal-operating-model-redesign.md`
- `docs/active/opl-stage-native-kernel-rollout-plan.md`
- `docs/active/standard-agent-private-platform-inventory.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/status.md`
- `docs/README.md`
- `docs/history/process/plans/README.md`

## Classification

| Classification | Readout |
| --- | --- |
| `covered_by_ssot` | Active current state、ideal-state gaps、completion criteria、next baton 和 docs foldback gate 已由 `docs/active/current-state-vs-ideal-gap.md` 覆盖。 |
| `more_specific_detail` | `docs/active/README.md` 保留索引；`current-development-lines.md` 保留 owner map；`production-framework-closure-gap-matrix.md` 保留证据门解释；`opl-family-ideal-operating-model-redesign.md` 保留 audit standard；`opl-stage-native-kernel-rollout-plan.md` 保留 Stage Native 设计；`standard-agent-private-platform-inventory.md` 保留 private-surface 分类。 |
| `conflicts_with_ssot` | 未发现当前 active docs 中还有第二个 `State: active_plan` 或独立 live readiness / domain ready / App release ready / production ready / physical delete authorization owner。 |
| `history_or_provenance` | prior process、dated proof、branch/worktree closeout、line-count closeout、receipt/proof 流水和历史计划继续归 `docs/history/process/plans/**` 或对应 repo-local history ledger。 |
| `stale_or_superseded` | 本轮没有需要改写的 active 正文；stale pattern 是被现有 role split 和 portfolio policy 守住的二次污染风险。 |
| `out_of_scope` | 不改 contracts、source、tests、runtime behavior、domain/App readiness、physical-delete authority 或六仓 broader docs portfolio。 |

## Edit Decision

本轮是 docs-only / no-rewrite closeout。

没有重写 active/support 文档，因为 peer docs 已经明确：

- `docs/active/current-state-vs-ideal-gap.md` 是唯一 `active_plan`。
- support docs 不维护独立路线图、live counters、dated proof ledger、canary 顺序、当前落地清单、line-count closeout 或第二 active backlog。
- docs portfolio policy 已经把长清单压缩、history/provenance 归位和 direct retirement 规则写清楚。

本轮只新增本 closeout，并折回 OPL series tranche ledger 与 process plans history index。

## Verification

已执行：

```bash
rtk rg -n 'State: `active_plan`|State: active_plan' docs/active docs/docs_portfolio_consolidation.md
rtk /Users/gaofeng/.local/bin/opl-doc-doctor doctor . --format json
```

结果：

- active-plan scan 只返回 `docs/active/current-state-vs-ideal-gap.md`。
- OPL doctor 返回 `finding_count=0`，`active_truth_health.status=pass`，owner docs 为 `docs/active/current-state-vs-ideal-gap.md`。

Doctor 只作为风险图使用；本轮 SSOT 判断来自 active owner、docs portfolio 角色台账、peer docs 正文和当前文件角色声明。

## Remaining Scope

本 closeout 只关闭 `one-person-lab` 仓 OPL active docs role split / single active truth owner 主题。

六仓全局 `/goal` 仍未完成：`docs/*.md` 与 `docs/**/*.md` 还需要继续按语义主题逐段覆盖；未覆盖主题、剩余 stale/retire 候选和下一轮写入范围继续由 OPL series tranche ledger 和各 repo active owner 维护。
