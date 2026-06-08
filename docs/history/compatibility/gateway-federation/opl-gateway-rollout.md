# OPL Gateway 落地路线

Owner: `One Person Lab`
Purpose: `legacy_gateway_rollout_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存 2026-04 gateway-first rollout 路线的人读 provenance。当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文不得作为当前 rollout plan、active runtime、compatibility interface、machine contract、readiness gate 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾说明 `OPL Gateway` 如何从文档优先公开表面，逐步推进为真实入口，并避免压扁 domain 边界。历史控制链曾写作 `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS`。

当前目标拓扑已经收敛为 stage-led OPL framework、显式 activation、Codex CLI first-class executor、Temporal-backed provider、typed queue / stage runtime、selected domain-agent entry、domain-owned authority functions 与 App/workbench projection。旧 G0-G5 gateway-first rollout phases 只保留为 history provenance，不再定义当前 rollout plan、readiness gate 或 product entry。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current runtime/product truth：`contracts/`、`src/`、repo-native tests、CLI/API payload、runtime ledger、provider receipts、domain manifests / receipts、App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 gateway-first rollout phase：

| 历史 phase | 当时用途 | 当前读法 |
| --- | --- | --- |
| `G0 定位冻结` | 冻结 `OPL Gateway`、`domain gateway`、`domain harness` 公开语言。 | 这些术语只在 history / diagnostic / negative-guard 语境保留。 |
| `G1 Federation Contract Freeze` | 定义最小机器可读 federation contract。 | 旧 federation contract 已压缩为 history-only provenance；当前 contract truth 回 active `contracts/`、source、tests 和 CLI/read-model。 |
| `G2 只读入口先落地` | 把 gateway 做成 discovery/read-only 入口。 | 旧 G2 文档已压缩为 tombstone；当前 discovery truth 回 active generated/read-model surfaces。 |
| `G3 Routed Action Entry` | 把顶层 action request 路由到旧 domain gateway。 | 旧 G3 文档已压缩为 tombstone；当前 action/routing truth 回 stage runtime、domain entry 和 authority boundaries。 |
| `G4 候选跨 Domain Shared Index` | 设想 future-only shared indexes。 | 当前 workspace/source/delivery/shared-boundary truth 回 active contracts/docs；不得恢复旧 candidate-index gate。 |
| `G5 真实公开产品面` | 设想顶层 gateway 产品入口。 | 当前 product entry 归 OPL App/workbench、Codex App wrapper 和 active product docs。 |
| readiness gate / ideal end state | 把 gateway-first 是否 green 作为 rollout 判断。 | 历史 readiness gate 不能声明当前 runtime/domain/production/App readiness。 |

## 已退役机器面

原文包含多段阶段状态、follow-on tranche、candidate-domain closeout 和 readiness wording。重要退役读法：

- `G0-G5` phase names 只在本 history tree 保留 provenance。
- `gateway-first`、`domain gateway`、`domain harness`、`routed action`、`shared index candidate` 不再是当前 active topology。
- `G2 stable public baseline`、`G3 thin handoff planning freeze` 等历史 closeout 不等同于当前 CLI/API/runtime readiness。
- 旧 roadmap-only/future-only candidate index wording 不构成当前 shared index 或 product surface plan。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-first rollout roadmap 或 readiness gate；
- 为旧 G0-G5 phase、gateway/discovery/routed-action/shared-index 名称添加兼容入口；
- 把历史 phase closeout 当成当前 active plan、test oracle 或 product readiness evidence；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 stage-led framework、App/workbench 和 domain owner surfaces，恢复旧 gateway-first product path。

若未来迁移确实需要历史 rollout 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 phase 名称复活成兼容层。

## 历史证据

保留本路径是因为同目录 history-only 文件仍链接到这里。详细 G0-G5 phase narrative、follow-on notes、candidate-domain wording 和 readiness gate 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-first rollout roadmap
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：gateway acceptance tombstone、gateway/federation history docs、operating-governance tombstones
