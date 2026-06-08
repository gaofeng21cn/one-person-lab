# OPL Federation Contract

Owner: `One Person Lab`
Purpose: `legacy_federation_contract_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存 gateway-first `G1` federation contract 的历史冻结件。当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文不得作为 active contract、compatibility interface、runtime route owner、test oracle 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾在 2026-04 gateway-first 阶段冻结 `G1 Federation Contract`：workstream registry、domain registry、routing vocabulary 与 OPL 到 domain gateway 的 handoff payload。它当时的目标是先冻结顶层控制语言，再推进 read-only discovery 和 routed-action planning。

当前 OPL 主线已经转为 stage-led framework、显式 OPL activation、Codex CLI first-class executor、Temporal-backed provider、typed queue / stage runtime、selected domain-agent entry、domain-owned authority functions 与 App/workbench projection。旧 `G1 / federation / domain_gateway / handoff` 词汇只保留为历史 provenance，不再定义 active contract 或 runtime route。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 机器真相：`contracts/`、`src/`、repo-native tests、CLI/API payload、runtime ledger、provider receipts、domain manifests / receipts、App/workbench projection
- 本路线历史入口：`docs/history/compatibility/gateway-federation/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文覆盖过这些 `G1` 历史语义：

| 历史 section | 当时用途 | 当前读法 |
| --- | --- | --- |
| workstream registry | 把 `research_ops`、`presentation_ops` 等 workstream 映射到当时的 domain gateway。 | 当前 agent/domain catalog、generated interfaces 与 active docs/contracts 持有真实入口语义。 |
| domain registry | 描述 `MedAutoScience`、`RedCube AI` 等 domain gateway / harness surface。 | 当前 MAS/MAG/RCA/OMA 是 Foundry Agent / domain repo；公开身份不再由 gateway/harness 术语定义。 |
| routing vocabulary | 冻结 `intent_id`、`workstream_id`、`request_kind`、`entry_mode` 等旧路由词汇。 | 当前路由、stage、action catalog 和 owner-delta 语义归 active contracts/source/CLI/read-model。 |
| handoff payload | 描述 OPL 到 domain gateway 的旧 handoff schema。 | 当前 handoff / activation / stage runtime 归 stage-led framework、domain entry、authority functions 与 runtime receipts。 |
| routing rules | 规定先按 workstream，再按 domain ownership，再按 family/profile preference 选择入口。 | 只作历史设计 provenance；当前 routing truth 必须从 live CLI/API/read-model 和 source 证明。 |
| G1 completion definition | 当时用 registry/schema/prose 对齐作为 G1 完成门。 | 历史完成门不能声明当前 framework readiness、domain readiness 或 production readiness。 |

## 已退役机器面

原文包含长 JSON 示例和 former artifact 路径。重要退役读法：

- `contracts/opl-framework/routing-vocabulary.json` 是 former artifact reference，不是当前 active required contract。
- `contracts/opl-framework/handoff.schema.json` 是 former artifact reference，不是当前 active required contract。
- `gateway_surface`、`harness_surface`、`domain_gateway`、`entry_mode=domain_gateway` 等字段名只在本 history tree 保留 provenance。
- 旧 `G1` registry shape 不能作为 current package schema、agent descriptor、App action metadata 或 runtime route contract。

## No-Resurrection Rules

不得用本文：

- 重建 gateway-first federation registry、routing vocabulary 或 handoff schema；
- 为已退役 gateway/federation surface 添加 compatibility alias、wrapper、facade 或 test；
- 把 MAS/MAG/RCA/OMA 的当前身份降回 `domain gateway / domain harness`；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 绕过当前 framework/runtime/domain owner surface，恢复旧 gateway-first handoff path。

若未来迁移确实需要历史设计里的某个想法，必须先把它映射到当前 owner surface，并从 active machine truth 证明；不得把旧 surface 名称复活成兼容层。

## 历史证据

保留本路径是因为 product/history 索引和同目录 history-only 文件仍链接到这里。详细 registry payload、routing vocabulary、handoff payload 和 G1 completion checklist 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-first G1 federation contract
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：当前核心文档、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：product historical-source index、gateway/federation examples、operating-governance tombstones
