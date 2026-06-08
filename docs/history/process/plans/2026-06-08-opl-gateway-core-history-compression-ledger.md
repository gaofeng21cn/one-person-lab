# OPL Gateway Core History Compression Ledger

Owner: `One Person Lab`
Purpose: `gateway_core_history_compression_ledger`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance tranche 的人读覆盖与收口。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和 repo-native tests；本文不得作为 active contract、discovery API、mutation entry、rollout plan、compatibility interface 或 gateway-first 复活依据。

## 本轮覆盖

本轮治理 `docs/history/compatibility/gateway-federation/` 下四个 gateway-first core history 文件：

- `opl-federation-contract.md`
- `opl-read-only-discovery-gateway.md`
- `opl-routed-action-gateway.md`
- `opl-gateway-rollout.md`

语义主题：旧 `G1 Federation Contract`、`G2 Read-Only Discovery Gateway`、`G3 Routed Action Gateway` 与 gateway-first rollout roadmap。

Single Source of Truth：

- 当前项目 truth：`README.md`、核心五件套和 `docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle truth：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`
- 机器 truth：`contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和 App/workbench projection
- 历史归档入口：`docs/history/compatibility/gateway-federation/README.md`

处置：

- 四个原路径全部保留，避免破坏 product/history 索引和 history-only 入站链接。
- `opl-federation-contract.md` 从旧 registry / routing vocabulary / handoff payload 长正文压缩为 G1 tombstone。
- `opl-read-only-discovery-gateway.md` 从旧 `list_*` / `get_*` / `resolve_request_surface` 操作长正文压缩为 G2 tombstone。
- `opl-routed-action-gateway.md` 从旧 `route_request` / `build_handoff_payload` / `audit_routing_decision` 和 failure-state 长正文压缩为 G3 tombstone。
- `opl-gateway-rollout.md` 从旧 G0-G5 roadmap、follow-on 和 readiness gate 长正文压缩为 rollout tombstone。
- 四个文件均明确 no-resurrection rule，禁止复活 gateway-first registry、discovery API、routed-action launcher、rollout roadmap、compat alias、wrapper、facade 或 readiness claim。

## 未覆盖范围

本轮没有逐段治理同目录下其他 gateway/federation tombstone 文件，也没有改变 active docs、contracts、source、tests、CLI/read-model 或 App/workbench surface。

后续同类写入范围：

- `docs/history/compatibility/gateway-federation/gateway-federation.md`
- `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md`
- `docs/history/compatibility/gateway-federation/examples-corpora/*.md`

下一轮需要按同一规则判断是否继续压缩原路径、合并到目录 README，或在无入站链接且无独立 provenance 价值时删除。

## 验证口径

最小验证应覆盖：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- 四个目标文件 lifecycle 字段与 no-resurrection 文案存在
- `opl-doc-doctor doctor <repo-root> --format json`

这些验证只证明本轮 docs-governance tranche 形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready 或 owner receipt / typed blocker 已闭合。
