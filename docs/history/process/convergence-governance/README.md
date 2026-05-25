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

## 归档内容

| 文件 | 历史角色 | 当前 owner |
| --- | --- | --- |
| `ecosystem-status-matrix-2026-04.md` | 2026-04-11 四仓状态快照。 | 核心五件套、active gap plan、domain-owned manifests。 |
| `four-repo-executor-follow-up-and-hermes-evaluation-2026-04.md` | Codex-default executor 收敛与 Hermes-Agent 备选路线的早期评估。 | `docs/references/runtime-substrate/family-executor-adapter-defaults.md`、Temporal provider 支撑文档和 contracts。 |
| `four-repo-doc-series-sync-summary-2026-04-14.md` | 四仓文档系列同步快照。 | `docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md` 和各仓当前 docs。 |
| `family-user-facing-maturity-roadmap-2026-04-13.md` | 用户面成熟度和 frontdoor/product-entry 词汇的历史 snapshot。 | `docs/product/`、App 仓、active gap plan 和 machine-readable descriptors。 |
| `family-external-orchestration-learning-board-2026-04-30.md` | 外部 orchestration 学习来源和吸收分类快照。 | OPL-owned contracts、runtime read models、source 和 active support references。 |
| `gui-mainline-pivot-to-aionui-2026-04-21.md` | GUI 主线切换到 AionUI 的历史记录。 | 核心五件套、`docs/product/`、current-support 和 App 仓。 |
| `contract-convergence-v1-decision-note-2026-04-08.md` | Contract Convergence v1 决策底稿。 | 核心五件套、active truth owner 和 runtime / domain-admission specs。 |
| `contract-convergence-v1-execution-board-2026-04-11.md` | Contract Convergence v1 中央执行板。 | 当前 active gap plan；本文不再作为 program board。 |
| `family-docs-lifecycle-governance-rollout-2026-05-09.md` | MAS docs 治理经验上升为 family 标准的历史记录。 | `docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md` 和 `docs/active/opl-family-development-reference.md`。 |
| `family-content-level-docs-consolidation-2026-05-11.md` | OPL/MAS/MAG/RCA/MDS 内容级文档整理历史记录。 | OPL active docs 和各仓本地 docs。 |
| `opl-product-layer-foundry-agent-rollout-2026-05-12.md` | 三层产品模型一次性跨仓落地 closeout。 | 核心五件套、`docs/product/`、contracts 和 App/domain 仓。 |

## 禁止恢复

- 不把 `frontdoor_surface`、Gateway、federation、routed-action 或 Product API 旧词恢复成 active docs / manifest 要求。
- 不把 Hermes online runtime、Hermes provider、Gateway readiness 或 compatibility alias 写回默认 runtime / readiness / provider path。
- 不把 MDS / DeepScientist 写回 OPL 顶层 active domain agent 或 MAS 默认 backend。
