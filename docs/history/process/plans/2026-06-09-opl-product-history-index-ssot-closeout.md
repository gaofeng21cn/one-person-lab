# OPL Product History Index SSOT Closeout

Owner: `One Person Lab`
Purpose: `product_history_index_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance tranche 的人读覆盖与收口。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、App/workbench projection 和 repo-native tests；本文不得作为 active product surface、compatibility interface、machine contract、test oracle 或 gateway-first 复活依据。

## 本轮覆盖

语义主题：active product public surface index 对已退役 gateway/federation 历史入口的收薄。

Single Source of Truth：

- 当前 project/product truth：`README.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/product/README.md`、contracts/source/CLI/read-model、runtime ledger、provider receipts 和 App/workbench projection。
- 历史归档 owner：`docs/history/compatibility/gateway-federation/README.md`、`examples-corpora/README.md` 和 `operating-governance/README.md`。
- docs lifecycle owner：`docs/docs_portfolio_consolidation.md` 与 `docs/policies/docs-lifecycle-policy.md`。
- negative guard：`tests/src/stale-compat-retirement-guard.test.ts`。

## Peer Docs 分类

| 文档 / section | 分类 | 处置 |
| --- | --- | --- |
| `docs/product/opl-public-surface-index.md` / `历史来源材料` | `covered_by_ssot` duplicate for old per-file gateway entry list | 收薄为单个 `Gateway / Federation 来源归档` 指针；active product index 不再列出多个旧 gateway 单文件入口。 |
| `docs/history/compatibility/gateway-federation/README.md` | `history_or_provenance` SSOT for retired gateway/federation archive | 保留；继续持有历史目录入口、no-resurrection rule 和子目录导航。 |
| `docs/history/compatibility/gateway-federation/*.md` and subdirectories | `history_or_provenance` / negative-guard tombstones | 保留 path-stable tombstones；不删除仍被 history index、product history index 或 stale-compat guard 引用的文件。 |
| `docs/README.md`, `docs/history/README.md`, `docs/references/README.md` | `more_specific_detail` index pointers | 保留为当前 docs/history/reference navigation，不复制旧单文件 active surface narrative。 |
| core five docs and active gap plan | `more_specific_detail` current truth owner | 保留；不在本轮改写 current runtime/product truth。 |

## 处置

- `docs/product/opl-public-surface-index.md` 不再在 active support 文档内列出 `Gateway 联邦`、`OPL 联邦合同`、`OPL Routed Action Gateway` 和 `OPL Gateway 契约面` 四个旧文件入口。
- active product index 改为指向 `docs/history/compatibility/gateway-federation/README.md` 这个 history archive owner。
- 本轮没有删除 gateway/federation tombstone 文件：仍有 history-only 入站链接和 stale-compat negative guard；删除会破坏 provenance / no-resurrection scan，而不会退役新的 active surface。

## Retired / Guarded

退役面是 active product index 的多旧入口并列展示，不是 history tombstone 本身。不得把旧 gateway/federation 文件恢复为 active product surface、compatibility interface、routing example、workflow entry、provider fallback、readiness path、alias、facade、wrapper 或 test oracle。

## 验证口径

最小验证：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- focused stale scan for the four removed active product index labels
- `node --experimental-strip-types --test tests/src/stale-compat-retirement-guard.test.ts`
- `opl-doc-doctor doctor <repo-root> --format json`

这些验证只证明本轮 docs-governance tranche 形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready 或 owner receipt / typed blocker 已闭合。
