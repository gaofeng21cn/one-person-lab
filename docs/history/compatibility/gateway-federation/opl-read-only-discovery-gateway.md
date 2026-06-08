# OPL Gateway 契约面

Owner: `One Person Lab`
Purpose: `legacy_read_only_discovery_gateway_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存 gateway-first `G2` 只读 discovery 契约面历史。当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文不得作为 active discovery API、compatibility interface、machine contract、test oracle 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾在 2026-04 gateway-first 阶段冻结 `G2 Read-Only Discovery Gateway`：人类或 Agent 可以先问顶层 gateway 当前有哪些 workstream、哪些 domain system、哪些 surface，以及请求应该落到哪个 domain gateway。

当前 OPL discovery/read-model 主线已经转为 active CLI/API payload、generated interfaces、agent/domain descriptors、stage runtime projection、owner-delta read model 和 App/workbench projection。旧 `G2 / read-only gateway / list_workstreams / resolve_request_surface` 语义只保留为历史 provenance，不再定义 active discovery API 或 machine contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current discovery/read-model truth：`contracts/`、`src/`、repo-native tests、CLI/API payload、runtime ledger、provider receipts、domain manifests / receipts、App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 `G2` 历史操作：

| 历史 operation | 当时用途 | 当前读法 |
| --- | --- | --- |
| `list_workstreams` | 返回旧 workstream registry 摘要。 | 当前 workstream/agent/domain 读面必须从 active contracts/source/CLI/read-model 证明。 |
| `get_workstream` | 返回单个 workstream 的旧注册含义。 | 只作历史示例；当前语义归 active descriptors / docs / generated interfaces。 |
| `list_domains` | 返回旧 domain gateway 列表。 | 当前 MAS/MAG/RCA/OMA 身份不再由 gateway/harness 术语定义。 |
| `get_domain` | 返回单个 domain gateway 的旧含义。 | 只作 provenance，不是 active domain metadata contract。 |
| `list_surfaces` | 返回旧 public surface index 摘要。 | 当前 product/public surfaces 归 active product docs、contracts/source 和 generated/read-model surfaces。 |
| `get_surface` | 返回旧 surface 的 link / role / owner_scope。 | 只作历史 surface archaeology。 |
| `resolve_request_surface` | 用旧 vocabulary 判断请求应落到哪个 gateway。 | 当前 request routing / action authority 归 active framework runtime、domain entry 和 owner boundaries。 |
| `explain_domain_boundary` | 解释 OPL 与 domain gateway 的旧边界。 | 当前 boundary truth 归核心五件套、active docs、contracts/source 和 domain-owned manifests / receipts。 |

## 已退役机器面

原文包含长 JSON response 示例和 former artifact 路径。重要退役读法：

- `routing-vocabulary.json` 是 former artifact reference，不是当前 active required contract。
- 旧 `G2` operation names 不构成当前 CLI/API contract。
- `domain_gateway`、`gateway_surface`、`harness_surface` 和 `owner_scope=opl/domain` 在本文件中只保留历史语境。
- 旧 read-only gateway completion definition 不证明当前 discovery/read-model、App path 或 production readiness。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-first discovery API；
- 为旧 `list_*` / `get_*` / `resolve_request_surface` 名称添加兼容 CLI/API；
- 把历史 JSON 示例当成 active fixtures 或 schema oracle；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 generated/read-model/domain owner surfaces，恢复旧 gateway-first discovery path。

若未来迁移确实需要历史 discovery 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 operation 名称复活成兼容层。

## 历史证据

保留本路径是因为 product/history 索引和同目录 history-only 文件仍链接到这里。详细 operation definitions、JSON examples、source-of-truth rules 和 G2 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-first G2 read-only discovery contract
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：product historical-source index、gateway/federation examples、operating-governance tombstones
