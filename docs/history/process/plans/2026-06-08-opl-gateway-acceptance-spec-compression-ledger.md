# OPL Gateway Acceptance Spec Compression Ledger

Owner: `One Person Lab`
Purpose: `gateway_acceptance_spec_compression_ledger`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance tranche 的人读覆盖与收口。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和 repo-native tests；本文不得作为 active acceptance gate、test oracle、compatibility interface 或 gateway-first 复活依据。

## 本轮覆盖

本轮只治理 `docs/history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md`。

语义主题：旧 `OPL Gateway` acceptance / test-spec 长清单。

Single Source of Truth：

- 当前项目 truth：`README.md`、核心五件套和 `docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle truth：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`
- 机器 truth：`contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和 App/workbench projection
- 历史归档入口：`docs/history/compatibility/gateway-federation/README.md`

处置：

- 原路径保留，避免破坏 history-only 入站链接。
- 原 1274 行 A-R acceptance checklist、长 Python 验证脚本和旧命令 ledger 压缩成 82 行 tombstone。
- 明确 `contracts/opl-framework/acceptance-matrix.json` 只作 former artifact reference，不是 active required contract。
- 明确 history tree 下的 gateway-derived matrix 和 example corpus 不持有 active machine contract、fixture、routing example、workflow 或 compatibility interface。
- 增加 no-resurrection rule，禁止用该文档复活 gateway-first gate、alias、wrapper、facade、compat tests 或 readiness claim。

## 未覆盖范围

本轮没有逐段治理同目录下其他 gateway/federation tombstone 文件，也没有改变 active docs、contracts、source、tests、CLI/read-model 或 App/workbench surface。

后续同类写入范围：

- `docs/history/compatibility/gateway-federation/gateway-federation.md`
- `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md`
- `docs/history/compatibility/gateway-federation/examples-corpora/*.md`
- `docs/history/compatibility/gateway-federation/operating-governance/*.md`

下一轮需要按同一规则判断是否继续压缩原路径、合并到目录 README，或在无入站链接且无独立 provenance 价值时删除。

## 验证口径

最小验证应覆盖：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- 目标文件 lifecycle 字段与 no-resurrection 文案存在
- `opl-doc-doctor doctor <repo-root> --format json`

这些验证只证明本轮 docs-governance tranche 形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready 或 owner receipt / typed blocker 已闭合。
