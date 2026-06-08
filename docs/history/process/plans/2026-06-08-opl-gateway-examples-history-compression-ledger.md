# OPL Gateway Examples History Compression Ledger

Owner: `One Person Lab`
Purpose: `gateway_examples_history_compression_ledger`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance tranche 的人读覆盖与收口。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和 repo-native tests；本文不得作为 active contract、example artifact owner、fixture owner、test oracle、compatibility interface、runtime route、workflow entry 或 gateway-first 复活依据。

## 本轮覆盖

本轮治理 `docs/history/compatibility/gateway-federation/` 下 gateway boundary、minimal activation package 与 examples corpus 七个 path-stable history 文件：

- `README.md`
- `gateway-federation.md`
- `opl-minimal-admitted-domain-federation-activation-package.md`
- `examples-corpora/opl-gateway-example-corpus.md`
- `examples-corpora/opl-operating-example-corpus.md`
- `examples-corpora/opl-operating-record-catalog.md`
- `examples-corpora/opl-routed-safety-example-corpus.md`

语义主题：旧 gateway/federation boundary、minimal admitted-domain activation package、gateway examples、operating examples、operating record catalog 与 routed-safety examples。

Single Source of Truth：

- 当前项目 truth：`README.md`、核心五件套和 `docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle truth：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`
- 机器 truth：`contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和 App/workbench projection
- 历史归档入口：`docs/history/compatibility/gateway-federation/README.md` 与 `examples-corpora/README.md`
- negative guard：`tests/src/stale-compat-retirement-guard.test.ts`

处置：

- 保留七个原路径，避免破坏 product/history 索引和 stale-compat negative guard 测试。
- `gateway-federation.md` 从旧 OPL Gateway / Domain Gateway / Domain Harness 边界长正文压缩为 tombstone。
- `opl-minimal-admitted-domain-federation-activation-package.md` 从旧 activation package 长正文压缩为 tombstone。
- 四个 `examples-corpora/*.md` 从 former example/artifact/catalog 长正文压缩为 tombstone，明确 former artifact 名称只保留 provenance，不作为 active repo path 或 fixture owner。
- `gateway-federation/README.md` 收紧机器边界，避免把历史兼容语料误读成 active machine-readable surface。
- 本轮没有改变 active docs、contracts、source、tests、CLI/read-model 或 App/workbench surface。

## 覆盖收口

本轮关闭前三个 2026-06-08 gateway history compression ledgers 留下的 carry-forward 清单：

- `2026-06-08-opl-gateway-acceptance-spec-compression-ledger.md`
- `2026-06-08-opl-gateway-core-history-compression-ledger.md`
- `2026-06-08-opl-operating-governance-history-compression-ledger.md`

这些旧 ledger 不再承担未覆盖文件清单。后续 OPL Doc governance 应从 whole-docs portfolio coverage、active gap plan 或新的 SSOT semantic lane 选择写入范围。

## 剩余范围

本轮只覆盖 OPL 主仓 gateway/federation history corpus。它不表示 OPL 主仓全部 `README*` 与 `docs/**/*.md` 已逐段覆盖，也不表示 six-repo OPL series docs-governance goal 完成。

下一轮可从以下范围继续选择：

- six-repo whole-docs coverage ledger 中仍未逐段确认的 `README*` / `docs/**/*.md`；
- OPL 主仓 `docs/history/**` 下仍带长历史增量清单、旧 route wording 或 path-stable tombstone 价值待判定的文件；
- MAS/MAG/RCA/OMA/App 各 repo active truth owner 与 stale/retire candidate 清单。

## 验证口径

最小验证应覆盖：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- `opl-doc-doctor doctor <repo-root> --format json`
- stale-compat negative guard test：`node --experimental-strip-types --test tests/src/stale-compat-retirement-guard.test.ts`

这些验证只证明本轮 docs-governance tranche 形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready 或 owner receipt / typed blocker 已闭合。
