# Convergence Governance 过程归档

Owner: `One Person Lab`
Purpose: `historical_convergence_governance_archive`
State: `history_only`
Machine boundary: 本目录只保存 OPL family 早期收敛治理、四仓同步、executor 评估和用户面成熟度快照的人读 provenance。当前机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App evidence 和核心五件套。

## 归档后读法

本目录中的文档已经退出 `docs/references/convergence-governance/` 的 active/support 层。它们可以解释 2026-04 到 2026-05 初期的判断来源，但不能恢复为当前 roadmap、active plan、manifest 要求、provider/readiness path、Gateway/frontdoor/federation 兼容面或 Hermes-first 执行路线。

归档后的当前 owner 跳转：

- 当前公开角色和实际状态：`docs/project.md`、`docs/status.md`、`docs/architecture.md`。
- 当前全局差距和完成顺序：`docs/active/current-state-vs-ideal-gap.md`。
- 当前目标态：`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`。
- 当前 docs lifecycle 规则：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`。

## 归档主题

| 历史主题组 | 覆盖内容 | 当前 owner / 读法 |
| --- | --- | --- |
| Four-repo status and contract convergence | 四仓状态快照、Contract Convergence v1 决策底稿和中央执行板。 | 当前公开角色、差距、domain manifests、runtime / domain-admission specs 和 active baton 回核心五件套、active gap plan、contracts/source/tests 和 live read-model；本目录不再作为 program board。 |
| Executor / runtime substrate evaluation | Codex-default executor 收敛、Hermes-Agent 备选路线和早期 executor follow-up。 | 当前 executor truth 回 `docs/references/runtime-substrate/family-executor-adapter-defaults.md`、Temporal provider 支撑文档、runtime contracts 和 fresh CLI/read-model；Hermes 只作为显式非默认 backend 或历史证明语境。 |
| Product/App/user-facing convergence | 用户面成熟度、frontdoor/product-entry 词汇、GUI 主线转 AionUI 和三层产品模型 rollout。 | 当前 product/workbench/App truth 回 `docs/product/`、One Person Lab App repo、machine-readable descriptors、core docs 和 contracts；frontdoor/product API 旧词只保留 provenance/tombstone。 |
| External orchestration learning | 外部 orchestration 学习来源和吸收分类。 | 当前外部学习只折回 OPL-owned contracts、runtime read models、source、active support references 和 explicit owner docs；不定义 provider/readiness path。 |
| Docs lifecycle and content-level consolidation | 四仓文档系列同步、MAS docs governance 上升为 family 标准、OPL/MAS/MAG/RCA/MDS 内容级整理。 | 当前 docs lifecycle truth 回 `docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`、`docs/active/opl-family-development-reference.md` 和各仓本地 active/docs owner。 |

本索引不再维护逐文件 current-owner 表。Exact historical files remain in this directory for provenance and searchability; read the original file or git history only when the compact theme row is insufficient. If a historical conclusion still governs current behavior, fold it into the current owner doc, contract, source or test before citing this directory.

## 禁止恢复

- 不把 `frontdoor_surface`、Gateway、federation、routed-action 或 Product API 旧词恢复成 active docs / manifest 要求。
- 不把 Hermes online runtime、Hermes provider、Gateway readiness 或 compatibility alias 写回默认 runtime / readiness / provider path。
- 不把 MDS / DeepScientist 写回 OPL 顶层 active domain agent 或 MAS 默认 backend。
