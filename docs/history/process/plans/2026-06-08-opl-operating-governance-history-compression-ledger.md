# OPL Operating Governance History Compression Ledger

Owner: `One Person Lab`
Purpose: `operating_governance_history_compression_ledger`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance tranche 的人读覆盖与收口。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和 repo-native tests；本文不得作为 active operating contract、authorization engine、workflow engine、approval engine、publish controller、compatibility interface 或 gateway-derived matrix 复活依据。

## 本轮覆盖

本轮治理 `docs/history/compatibility/gateway-federation/operating-governance/` 下五个 gateway-derived operating governance history 文件：

- `opl-governance-audit-operating-surface.md`
- `opl-publish-promotion-operating-surface.md`
- `opl-surface-authority-matrix.md`
- `opl-surface-lifecycle-map.md`
- `opl-surface-review-matrix.md`

语义主题：旧 governance/audit record、publish/promotion record、surface authority matrix、surface lifecycle map 与 surface review matrix。

Single Source of Truth：

- 当前项目 truth：`README.md`、核心五件套和 `docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle truth：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`
- 当前 operating governance support：`docs/references/operating-governance/README.md` 和该目录下 active support docs
- 机器 truth：`contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和 App/workbench projection
- 历史归档入口：`docs/history/compatibility/gateway-federation/operating-governance/README.md`

处置：

- 五个原路径全部保留，避免破坏 operating-governance archive、examples-corpora、roadmap/reference 索引和 stale-compat negative guard 测试。
- `opl-governance-audit-operating-surface.md` 从旧 routing/governance/publish-readiness/review-index record 长正文压缩为 tombstone。
- `opl-publish-promotion-operating-surface.md` 从旧 publish-outcome/promotion record 长正文压缩为 tombstone。
- `opl-surface-authority-matrix.md` 从旧 authority field/coverage/checklist 长正文压缩为 negative-guard tombstone。
- `opl-surface-lifecycle-map.md` 从旧 lifecycle field/graph/checklist 长正文压缩为 negative-guard tombstone。
- `opl-surface-review-matrix.md` 从旧 review field/publishability/checklist 长正文压缩为 negative-guard tombstone。
- 五个文件均明确 no-resurrection rule，禁止复活 gateway-derived operating contract、authorization engine、workflow engine、approval engine、publish controller、compat alias、wrapper、facade 或 readiness claim。

## 未覆盖范围

本轮没有逐段治理同目录外的 gateway/federation tombstone 文件，也没有改变 active docs、contracts、source、tests、CLI/read-model 或 App/workbench surface。

后续同类写入范围：

- `docs/history/compatibility/gateway-federation/gateway-federation.md`
- `docs/history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md`
- `docs/history/compatibility/gateway-federation/examples-corpora/*.md`

下一轮需要按同一规则判断是否继续压缩原路径、合并到目录 README，或在无入站链接且无独立 provenance 价值时删除。

## 验证口径

最小验证应覆盖：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- 五个目标文件 lifecycle 字段与 no-resurrection 文案存在
- `opl-doc-doctor doctor <repo-root> --format json`
- stale-compat negative guard test：`node --experimental-strip-types --test tests/src/stale-compat-retirement-guard.test.ts`

这些验证只证明本轮 docs-governance tranche 形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready 或 owner receipt / typed blocker 已闭合。
