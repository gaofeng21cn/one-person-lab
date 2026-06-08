# OPL Publish / Promotion Operating Surface

Owner: `One Person Lab`
Purpose: `legacy_publish_promotion_operating_surface_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存旧 gateway-derived publish / promotion operating surface 的人读 provenance。当前机器真相继续归 active contracts、schemas、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、生成产物或语义化 `human_doc:*` id；本文不得作为 active operating contract、publish runtime、promotion authority、test oracle、compatibility interface 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾在 gateway-derived operating governance 阶段定义 `publish_outcome_index`、`promotion_candidate_signal` 和 `promotion_surface_index` 三类顶层 record。它当时的目标是让 OPL 在 domain-owned publish / release / export / submission outcome 已经存在之后，索引 outcome 与 promotion readiness，而不持有 publish truth。

当前 OPL publish / promotion 相关语义已经归 domain-owned artifact/quality/export/review/publication authority、active contracts/source/CLI/read-model、runtime ledger、provider receipts 和 App/workbench projection。旧 gateway-derived publish/promotion record kind 只保留为历史 provenance，不再定义 active publish runtime、promotion authority 或 machine contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current publish/promotion authority truth：domain-owned manifests / receipts、active contracts/source/tests/CLI/read-model、runtime ledger、provider receipts 和 App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些历史 record kind 与边界：

| 历史 surface | 当时用途 | 当前读法 |
| --- | --- | --- |
| `publish_outcome_index` | 索引 domain-owned publish / release / export / submission outcome。 | 只作历史 index 语义；不等于 canonical publish/release/export/submission record。 |
| `promotion_candidate_signal` | 表达 indexed outcome 是否具备进入 promotion gate 的条件。 | 只作历史 readiness signal；不等于 promotion truth、announcement 或 distribution。 |
| `promotion_surface_index` | 索引 outcome 关联的 public surface 和缺失 approval。 | 只作历史 reference layer；不持有 public-channel posting truth。 |
| `domain_truth_refs` | 让顶层 publish/promotion record 回指 domain-owned truth。 | 当前 equivalent boundary 必须从 domain-owned refs/receipts 和 active read-model 证明。 |
| post-publish boundary | 限定 P5.M2 只在 domain-owned outcome 存在后生效。 | 当前 publish/export/submission authority 仍由 domain owner 持有。 |

## 已退役机器面

原文包含最小 record envelope、长 JSON 示例、surface 形态和完成定义。重要退役读法：

- 本文不发布 active machine-readable artifact。
- 旧 record shape 不是当前 schema oracle、runtime envelope 或 test fixture owner。
- `publish_outcome_index` 不等于 publish truth。
- `promotion_candidate_signal` 不等于 promotion truth。
- `public_refs` 只是 reference，不等于 OPL 对 public channel 或 artifact 的 ownership。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-derived publish/promotion operating contract；
- 为旧 record kind 添加 compatibility alias、wrapper、facade、CLI/API 或 test oracle；
- 把 OPL 写成 domain publish truth、release/export/submission truth、artifact truth、public-channel posting truth 或 promotion authority owner；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 domain owner surface 和 active read-model，恢复旧 gateway-derived publish/promotion layer。

若未来迁移确实需要历史 record 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 record kind 复活成兼容层。

## 历史证据

保留本路径是因为 operating-governance archive、examples-corpora 和 historical matrix 文件仍链接到这里。详细 record shapes、JSON examples、post-publish boundary、surface 形态和 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-derived publish / promotion operating surface
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：domain-owned authority refs、current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：operating-governance archive、examples-corpora、surface lifecycle/authority/review tombstones
