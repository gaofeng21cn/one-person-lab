# OPL Surface Lifecycle Map

Owner: `One Person Lab`
Purpose: `legacy_surface_lifecycle_map_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存旧 surface lifecycle map 的人读 provenance。当前仓库没有发布 `surface-lifecycle-map.json` 机器可读合同；当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts 与 domain-owned manifests / receipts。本文不得作为 workflow engine、transition authority、runtime control plane、test oracle、compatibility interface 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾保存历史 OPL surface stack 的 derived lifecycle graph，用于说明 contract、routing、operating、discoverability 与 acceptance surface 的遍历关系。它的作用是 historical reviewability，不是 workflow engine、transition authority 或第二真相源。

当前 lifecycle / transition / workflow truth 已归 active source/contracts/tests/CLI/read-model、stage transition authority、runtime ledger、provider receipts、domain-owned manifests / receipts 和 App/workbench projection。旧 lifecycle map 只保留为历史 provenance，并由 stale-compat negative guard 测试确保它不会被写成 active machine-readable contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current lifecycle / transition truth：active contracts/source/tests/CLI/read-model、runtime ledger、provider receipts、domain-owned manifests / receipts 和 App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 historical lifecycle review 语义：

| 历史 field / group | 当时用途 | 当前读法 |
| --- | --- | --- |
| `surface_id` / `layer_id` | 标记旧 surface stack 和层级。 | 只作 history/reviewability 标签；不能定义 active topology。 |
| `control_mode` / `truth_mode` | 防止 surface 被误读成 control plane 或 truth owner。 | 当前 control/truth boundary 必须从 active contracts/source/read-model/domain refs 证明。 |
| `requires_surfaces` / `enables_surfaces` | 展示旧 surface dependency / discoverability graph。 | 只作 historical graph；不授权 transition 或 workflow execution。 |
| `follow_on_route_surface` | 表达旧 follow-on route boundary。 | legacy values 只保留 provenance，不定义 active compatibility value。 |
| lifecycle completion definition | 当时要求 references 可解析且 maps 不升级为 execution surface。 | 历史完成门不能声明当前 workflow/runtime readiness。 |

## 已退役机器面

重要退役读法：

- 当前不存在 `contracts/opl-framework/surface-lifecycle-map.json`。
- 本文不发布 active machine-readable artifact。
- 旧 `requires_surfaces` / `enables_surfaces` graph 不是 active workflow engine。
- 旧 `follow_on_route_surface` 不构成 current route contract。

## No-Resurrection Rules

不得用本文：

- 重建 `surface-lifecycle-map.json` 或任何兼容合同；
- 为旧 lifecycle map fields 添加 compatibility alias、wrapper、facade、CLI/API 或 test oracle；
- 把 OPL 写成 transition authority、workflow engine、runtime control plane、domain truth owner 或 publication/review authority；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 stage transition authority、runtime ledger 和 domain owner surfaces，恢复旧 map-driven workflow path。

若未来迁移确实需要历史 lifecycle review 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 matrix/map 名称复活成兼容层。

## 历史证据

保留本路径是因为 operating-governance archive、examples-corpora、surface authority/review tombstones 和 stale-compat-retirement guard 测试仍引用它。详细 lifecycle fields、coverage list、mapping refs 和 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-derived surface lifecycle map
- 压缩后角色：path-stable tombstone、provenance pointer 与 negative-guard scan target
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces 和 domain-owned refs
- 保留入站链接：operating-governance archive、examples-corpora、surface authority/review tombstones、stale-compat negative guard
