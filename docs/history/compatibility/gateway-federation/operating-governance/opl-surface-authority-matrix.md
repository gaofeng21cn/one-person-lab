# OPL Surface Authority Matrix

Owner: `One Person Lab`
Purpose: `legacy_surface_authority_matrix_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存旧 surface authority matrix 的人读 provenance。当前仓库没有发布 `surface-authority-matrix.json` 机器可读合同；当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts 与 domain-owned manifests / receipts。本文不得作为 authorization engine、runtime control plane、truth surface、test oracle、compatibility interface 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾保存历史 OPL surface stack 的 derived authority matrix 词汇，用于集中说明 routing、execution、truth、review 与 publication ownership boundary。它的作用是 reviewability，不是 authorization engine、runtime control plane 或第二真相源。

当前 authority split 已归 active core docs、active contracts/source/CLI/read-model、runtime ledger、domain-owned manifests / receipts 和 App/workbench projection。旧 surface authority matrix 只保留为历史 provenance，并由 stale-compat negative guard 测试确保它不会被写成 active machine-readable contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current authority truth：active contracts/source/tests/CLI/read-model、runtime ledger、provider receipts、domain-owned manifests / receipts 和 App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 historical authority review 语义：

| 历史 field / group | 当时用途 | 当前读法 |
| --- | --- | --- |
| `surface_id` / `owner_scope` / `surface_role` | 标记历史 surface 与 owner scope。 | 只作 history/reviewability 标签；不能定义 active owner。 |
| `route_authority` / `execution_authority` | 描述旧 route/execution authority split。 | 当前 authority 必须从 active contracts/source/read-model/domain refs 证明。 |
| `truth_authority` / `review_authority` / `publication_authority` | 防止 OPL 接管 domain truth/review/publication。 | 当前 equivalent boundary 归 active docs/contracts/domain owner gates。 |
| `allowed_follow_on_surface` | 表达旧 follow-on route surface。 | 只保留 provenance，不定义 active compatibility value。 |
| linked domain public-entry surfaces | 说明 domain-local entry 仍归 domain owner。 | 当前 MAS/MAG/RCA/OMA 身份不再由 `public_gateway` 术语定义。 |

## 已退役机器面

重要退役读法：

- 当前不存在 `contracts/opl-framework/surface-authority-matrix.json`。
- 本文不发布 active machine-readable artifact。
- 旧 `gateway`、`domain_gateway`、`public_gateway` surface id 只保留 history/reviewability 标签。
- 旧 authority fields 不构成当前 schema、authorization engine、runtime control plane 或 test oracle。

## No-Resurrection Rules

不得用本文：

- 重建 `surface-authority-matrix.json` 或任何兼容合同；
- 为旧 authority matrix fields 添加 compatibility alias、wrapper、facade、CLI/API 或 test oracle；
- 把 OPL 写成 domain execution、truth、review、publication、artifact、quality verdict 或 owner receipt authority；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 active authority boundary，恢复旧 matrix-driven authorization path。

若未来迁移确实需要历史 authority review 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 matrix 名称复活成兼容层。

## 历史证据

保留本路径是因为 operating-governance archive、examples-corpora、surface lifecycle/review tombstones 和 stale-compat-retirement guard 测试仍引用它。详细 authority field list、coverage list、mapping refs 和 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-derived surface authority matrix
- 压缩后角色：path-stable tombstone、provenance pointer 与 negative-guard scan target
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces 和 domain-owned refs
- 保留入站链接：operating-governance archive、examples-corpora、surface lifecycle/review tombstones、stale-compat negative guard
