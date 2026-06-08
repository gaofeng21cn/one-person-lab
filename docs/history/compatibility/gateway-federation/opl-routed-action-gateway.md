# OPL Routed Action Gateway

Owner: `One Person Lab`
Purpose: `legacy_routed_action_gateway_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存 gateway-first routed-action planning contract 的历史冻结件。当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文不得作为 active mutation entry、launcher、compatibility interface、machine contract、test oracle 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾在 2026-04 gateway-first 阶段冻结 `G3 Routed Action Gateway`：`route_request`、`build_handoff_payload` 和 `audit_routing_decision` 只停留在 planning contract 层，唯一成功目标是 `domain_gateway`，并禁止 direct harness bypass。

当前 OPL action/routing 主线已经转为 stage-led framework、explicit activation、provider-backed stage runtime、owner-delta read model、domain-agent entry、authority functions 与 App/workbench projection。旧 `G3 / routed-action / domain_gateway handoff` 语义只保留为历史 provenance，不再定义 active mutation entry、launcher 或 machine contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- current action/routing truth：`contracts/`、`src/`、repo-native tests、CLI/API payload、runtime ledger、provider receipts、domain manifests / receipts、App/workbench projection
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 本路线历史入口：`docs/history/compatibility/gateway-federation/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 `G3` 历史语义：

| 历史 section | 当时用途 | 当前读法 |
| --- | --- | --- |
| `route_request` | 按 workstream/domain/family preference 产生旧 routing decision。 | 当前 routing/action truth 必须从 active source、contracts、tests、CLI/read-model 和 domain owner surfaces 证明。 |
| `build_handoff_payload` | 从 routed decision 构建旧 domain_gateway handoff payload。 | 当前 activation/stage handoff 归 active framework runtime、domain entry、authority functions 与 receipts。 |
| `audit_routing_decision` | 在进入 domain gateway 前记录 routing trace。 | 当前 audit/projection 归 active runtime/read-model/ledger；历史 trace shape 不再是 active schema。 |
| refusal / unknown-domain / ambiguous-task | 显式表达旧 gateway routing 的非成功状态。 | 可作为 fail-closed 设计 provenance，但不能复活旧 API 或 fallback。 |
| hard boundary | 禁止绕过 domain gateway 直达 harness、禁止 OPL 接管 canonical truth。 | 当前 equivalent boundary 已由 active invariants/docs/contracts/source/domain owner gates 表达。 |
| planning contract completion | 当时用 planning-level contract 与 no-bypass wording 作为完成门。 | 不证明当前 runtime readiness、domain readiness、production readiness 或 App readiness。 |

## 已退役机器面

原文包含长 JSON response 示例和 former artifact 路径。重要退役读法：

- `routed-actions.schema.json`、`handoff.schema.json` 等旧 schema 引用在本文只保留 historical context；是否存在 active 替代面必须从当前 `contracts/`、source 和 tests 证明。
- 旧 `route_request`、`build_handoff_payload`、`audit_routing_decision` operation names 不构成当前 CLI/API contract。
- `entry_surface=domain_gateway`、`decision_status=routed/refused/unknown_domain/ambiguous_task` 等字段只作 gateway-first archaeology。
- 旧 no-bypass wording 有设计价值，但当前 enforcement 不能靠本文证明。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-first routed-action API 或 launcher；
- 为旧 routed-action operation names 添加 compatibility CLI/API；
- 把历史 JSON 示例当成 active fixtures、schema oracle 或 fallback route；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 stage runtime、domain entry 和 authority functions，恢复旧 gateway-first mutation path。

若未来迁移确实需要历史 routed-action 思路，必须先映射到当前 owner surface，并从 active machine truth 证明；不得把旧 operation 名称复活成兼容层。

## 历史证据

保留本路径是因为 product/history 索引和同目录 history-only 文件仍链接到这里。详细 operation definitions、JSON examples、failure handling、hard boundary 和 planning completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-first G3 routed-action planning contract
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：current core docs、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：product historical-source index、gateway/federation examples、operating-governance tombstones
