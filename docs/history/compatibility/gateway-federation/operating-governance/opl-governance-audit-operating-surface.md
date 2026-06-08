# OPL Governance / Audit Operating Surface

Owner: `One Person Lab`
Purpose: `legacy_governance_audit_operating_surface_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存旧 gateway-derived governance / audit operating surface 的人读 provenance。当前机器真相继续归 active contracts、schemas、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、生成产物或语义化 `human_doc:*` id；本文不得作为 active operating contract、runtime control plane、truth surface、test oracle、compatibility interface 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾在 gateway-derived operating governance 阶段定义 `routing_audit`、`governance_decision`、`publish_readiness_signal` 和 `cross_domain_review_index` 四类顶层 record。它当时的目标是允许 OPL 索引顶层治理信号与 routing audit trace，同时不接管 domain runtime/review/publish/artifact truth。

当前 OPL governance / audit 主线已经转为 stage-led framework、domain-owned authority split、active contracts/source/CLI/read-model、runtime ledger、provider receipts 和 domain-owned manifests / receipts。旧 gateway-derived record kind 只保留为历史 provenance，不再定义 active operating contract、runtime control plane 或 truth surface。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current operating governance truth：`docs/references/operating-governance/README.md`、active governance support docs、`contracts/`、`src/`、repo-native tests、CLI/read-model、runtime ledger、provider receipts 和 domain-owned manifests / receipts
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些历史 record kind 与边界：

| 历史 surface | 当时用途 | 当前读法 |
| --- | --- | --- |
| `routing_audit` | 顶层记录请求如何路由到 domain-owned capability entry。 | 只作历史 routing audit provenance；当前 audit truth 回 active runtime/read-model/ledger。 |
| `governance_decision` | 记录顶层 continue/stop/reframe/gate 决策语言。 | 当前 decision/gate 语义归 active governance docs、runtime owner surfaces 和 human/domain owner gates。 |
| `publish_readiness_signal` | 在 publish truth 形成前暴露顶层 readiness signal。 | 不能声明 publish truth、publication event、submission result、release result、export result 或 domain approval truth。 |
| `cross_domain_review_index` | 索引跨 domain review surface 与 gate。 | 只作历史 index 语义；当前 review / quality / artifact authority 留在 domain owner。 |
| `domain_truth_refs` | 防止顶层 record 被误读成 domain truth owner。 | 当前 equivalent boundary 必须从 active source/contracts/read-model/domain refs 证明。 |

## 已退役机器面

原文包含最小 record envelope、长 JSON 示例、surface 形态和完成定义。重要退役读法：

- 本文不发布 active machine-readable artifact。
- 旧 record shape 不是当前 schema oracle、runtime envelope 或 test fixture owner。
- legacy `gateway` / `domain_gateway` literal 只保留 provenance 和 reviewability 语义。
- `publish_readiness_signal` 不等于 publish truth；任何当前 publish/export/submission 结论必须来自 domain-owned truth。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-derived governance/audit operating contract；
- 为旧 record kind 添加 compatibility alias、wrapper、facade、CLI/API 或 test oracle；
- 把 OPL 写成 domain runtime audit truth、review truth、publish truth、artifact truth 或 quality verdict owner；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 stage-led framework、domain owner surface 和 active governance/read-model，恢复旧 gateway-derived operating layer。

若未来迁移确实需要历史 record 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 record kind 复活成兼容层。

## 历史证据

保留本路径是因为 operating-governance archive、examples-corpora 和 historical matrix 文件仍链接到这里。详细 record shapes、JSON examples、surface 形态和 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-derived governance / audit operating surface
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：current core docs、active gap plan、operating-governance support docs、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：operating-governance archive、examples-corpora、surface lifecycle/authority/review tombstones
