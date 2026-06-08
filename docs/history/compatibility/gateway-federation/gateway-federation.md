# OPL Gateway Federation

Owner: `One Person Lab`
Purpose: `legacy_gateway_federation_boundary_tombstone`
State: `history_only`
Machine boundary: 本文只保存 gateway-first 阶段的边界 provenance。当前机器真相继续归 `README.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`contracts/`、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection。本文不得作为 active runtime、domain route、compatibility interface、machine contract、test oracle、alias、facade 或 wrapper 保留依据。

## 当前读法

这份文档曾把 OPL family 描述成顶层 gateway、domain 内部 gateway 与 domain harness 的分层关系。该表述现在只作为历史来源材料保留。

当前 OPL 主线已经收敛为：

- `Codex CLI` first-class executor；
- explicit OPL activation；
- provider-backed stage runtime / typed queue；
- stage attempt、receipt、projection 与 App/operator read model；
- MAS/MAG/RCA/OMA 等 repo-owned Foundry Agent surface。

旧 gateway/federation 词汇不能恢复为 active route、launcher、compatibility layer 或 readiness gate。当前 domain ownership、admission、runtime、receipt、typed blocker、artifact authority 与 App projection 必须从 live contracts/source/tests/CLI/read-model 和各 domain repo truth 读取。

## 历史保留内容

本文只保留一个历史判断：早期 gateway-first 设计试图避免把 OPL 误读成吞并所有 domain 的单体 runtime，同时也避免把 domain repo 降成没有独立 truth / delivery / review authority 的私有实现细节。

这个判断的当前 owner 已经转移：

- OPL 持有 framework-level runtime、activation、shared contracts、projection 和 App/operator read model；
- domain repo 持有 domain truth、quality/export verdict、artifact authority、owner receipt、typed blocker 和 direct skill path；
- App repo 持有 end-user workbench、release、installer 和 product evidence；
- OMA 是 Agent Foundry / new-agent builder-test module，不持有 MAS/MAG/RCA domain truth。

## 退役面

以下历史面已退役，不允许用本文复活：

- gateway-first registry、discovery API 或 routed-action launcher；
- domain route compatibility value；
- harness bypass、direct execution fallback 或 hidden best-effort handoff；
- gateway-derived acceptance matrix、example corpus 或 operating record 作为 active test oracle；
- 为旧入口存在的 alias、facade、wrapper 或 compatibility-only aggregate test。

## 当前 SSOT

- 项目当前 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`。
- 当前 active plan：`docs/active/current-state-vs-ideal-gap.md`。
- docs lifecycle truth：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`。
- runtime / domain / App machine truth：`contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection。
- 历史入口：`docs/history/compatibility/gateway-federation/README.md`。

## No-Resurrection Rule

需要讲历史时，引用本目录作为 provenance。需要实现、测试、验证或判断当前状态时，必须回到当前 SSOT 与 live machine surfaces。不得从本文派生新的兼容合同、旧路线别名、route fallback、workflow entry、acceptance gate 或 readiness claim。
