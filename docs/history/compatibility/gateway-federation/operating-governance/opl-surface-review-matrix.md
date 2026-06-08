# OPL Surface Review Matrix

Owner: `One Person Lab`
Purpose: `legacy_surface_review_matrix_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存旧 surface review matrix 的人读 provenance。当前仓库没有发布 `surface-review-matrix.json` 机器可读合同；当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts 与 domain-owned manifests / receipts。本文不得作为 approval engine、publish controller、release engine、test oracle、compatibility interface 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾保存历史 OPL public / contract / supporting surfaces 的 derived review matrix 词汇，用于说明 human-review obligation、acceptance coverage、companion surfaces 与 publishability-stage boundary。它的作用是 historical reviewability，不是 approval engine、publish controller、release engine 或第二真相源。

当前 review / publishability / release authority 已归 active source/contracts/tests/CLI/read-model、domain-owned manifests / receipts、runtime ledger、provider receipts 和 App/workbench projection。旧 surface review matrix 只保留为历史 provenance，并由 stale-compat negative guard 测试确保它不会被写成 active machine-readable contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current review/publishability truth：domain-owned manifests / receipts、active contracts/source/tests/CLI/read-model、runtime ledger、provider receipts 和 App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 historical reviewability 语义：

| 历史 field / group | 当时用途 | 当前读法 |
| --- | --- | --- |
| `human_review_required` | 标记历史 surface 成为 public material 前是否需要 human review。 | 只作历史 reviewability 标签；不能创建 active approval gate。 |
| `required_acceptance_gates` | 引用旧 acceptance gates。 | 旧 acceptance gate 已压缩为 history tombstone，不能作为 active gate。 |
| `required_companion_surfaces` | 指向已索引 support/governing surfaces。 | 只作 historical discoverability。 |
| `cross_domain_wording_check` | 表达旧 wording review 模式。 | 当前 wording owner 归 core docs 与 docs lifecycle policy。 |
| `publishability_stage` | 描述 documentation-readiness stage。 | 不等于 publishability truth、approval status、release status 或 workflow state。 |

## 已退役机器面

重要退役读法：

- 当前不存在 `contracts/opl-framework/surface-review-matrix.json`。
- 本文不发布 active machine-readable artifact。
- 旧 `required_acceptance_gates` 不构成 current approval gate。
- 旧 `publishability_stage` 不构成 current publish/release workflow state。

## No-Resurrection Rules

不得用本文：

- 重建 `surface-review-matrix.json` 或任何兼容合同；
- 为旧 review matrix fields 添加 compatibility alias、wrapper、facade、CLI/API 或 test oracle；
- 把 OPL 写成 approval engine、publish controller、release engine、domain review truth owner 或 publication authority；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 domain review/publish authority 和 active read-model，恢复旧 matrix-driven approval path。

若未来迁移确实需要历史 reviewability 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 matrix 名称复活成兼容层。

## 历史证据

保留本路径是因为 operating-governance archive、examples-corpora、surface lifecycle/authority tombstones 和 stale-compat-retirement guard 测试仍引用它。详细 review fields、coverage list、mapping refs 和 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-derived surface review matrix
- 压缩后角色：path-stable tombstone、provenance pointer 与 negative-guard scan target
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces 和 domain-owned refs
- 保留入站链接：operating-governance archive、examples-corpora、surface lifecycle/authority tombstones、stale-compat negative guard
