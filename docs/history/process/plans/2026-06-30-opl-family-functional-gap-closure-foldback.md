# OPL family functional gap closure foldback

Owner: `One Person Lab`
Purpose: `history_process_functional_gap_closure_foldback`
State: `history_provenance`
Machine boundary: 本文是人读历史折返摘要；当前真相继续归 active owner、contracts、source、tests、CLI/read-model、runtime ledger、owner repo evidence surface 和提交历史。

## 摘要

2026-06-30 OPL family functional closure follow-through 后，默认七仓的非 live 功能/结构基线已按 `functional_structure_baseline_landed` 读取：

- `one-person-lab`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `opl-bookforge`
- `one-person-lab-app`

本轮之后，`docs/active/current-state-vs-ideal-gap.md` 不再保存已完成 gap 的长清单、tranche 流水、dated proof、branch/worktree、workflow run 或 receipt 细节。active gap 文档只保留当前理想态读法、当前是否存在 gap、后置 evidence 指针、forbidden claims 和下一轮 baton。

## 当前 owner

| 主题 | 当前 owner |
| --- | --- |
| 理想态 / north-star | `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、相关 reference/support docs、核心五件套 |
| 当前 gap / baton | `docs/active/current-state-vs-ideal-gap.md` |
| 文档生命周期规则 | `docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`、OPL Doc skill |
| 非 live 功能/结构机器折回 | `contracts/opl-framework/standard-agent-landing-evidence-status.json#functional_closure_followthrough` |
| live / release / production / owner evidence | `docs/references/operating-governance/family-live-evidence-maintenance.md` 和各 owner repo evidence surface |
| 具体实现与验证 | 各 repo source、contracts、tests、CLI/read-model、runtime ledger、提交历史 |

## 历史结论

- Gap 文档是 active work tracker，不是长期完成史。
- 功能/结构 gap 关闭后，active 文档应删除或重写已关闭条目，而不是把它们改成“已完成”段落继续保留。
- 需要保留来龙去脉时，用 compact history/provenance pointer，而不是 active 里的执行日记。
- Live evidence、release evidence、production evidence、Brand L5 evidence、owner acceptance 和 physical delete authorization 是独立 evidence lane；它们不能混入 ideal-state / active gap / active development 文档。
- Docs foldback、contract pass、focused tests、projection clean、doctor clean 或 refs-only ledger 不能替代 runtime/live/owner evidence。

## No-resurrection guard

未来如果要新增或恢复 active gap，必须重新读取 fresh repo truth，并说明：

- semantic theme
- SSOT owner
- ideal-state reference
- live truth inputs
- allowed / forbidden write set
- verification command
- completion gate
- forbidden claims

不得从本历史文档恢复旧任务清单，也不得把这里的历史结论当作当前功能缺口。
