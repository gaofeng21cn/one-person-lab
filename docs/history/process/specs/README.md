# Process Specs History

Owner: `One Person Lab`
Purpose: `process_specs_history_index`
State: `historical_archive`
Machine boundary: 本目录只保留人读历史 design-spec provenance。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 与 `human_doc:*` 语义标识。

本目录收纳已退出 active specs 层的早期设计规格。正文中的 `current`、`当前`、`目标`、`建议`、`acceptance criteria`、`Product API`、`ACP`、`frontdoor`、`Gateway`、`Domain Harness OS`、`Hermes`、`AionUI` 和 GUI shell wording 都按文件日期附近的历史设计语境阅读。

当前有效入口回到：

- [项目概览](../../../project.md)
- [当前状态](../../../status.md)
- [架构](../../../architecture.md)
- [关键决策](../../../decisions.md)
- [OPL 当前开发线路](../../../active/current-development-lines.md)
- [OPL Runtime 命名与边界合同](../../../runtime/opl-runtime-naming-and-boundary-contract.md)
- [Domain-Agent Admission Contract](../../../specs/opl-domain-onboarding-contract.md)
- [OPL stage-led agent framework roadmap](../../../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)

## Historical Spec Themes

| Theme | Covered history body | Current owner / readout |
| --- | --- | --- |
| Public docs and README surface formation | 2026-04 bilingual homepage / core docs design. | Current public surface belongs to root `README*`, `docs/README.md`, `docs/public/` and the core five docs. Historical bilingual rollout wording is provenance only. |
| Domain admission and MAG pre-split design | 2026-04 MAG top-level design before independent repo split. | MAG domain truth belongs to the `med-autogrant` repo. OPL keeps only domain admission, projection, framework refs and cross-repo owner boundaries. |
| Runtime, product and shell boundary formation | UHS / Gateway / Domain Harness OS design, frontdoor / Hermes handoff design, Product API / domain-agent boundary design and ACP-native runtime / shell projection design. | Current runtime/product/domain/App boundaries return to the core five docs, active docs, `docs/runtime/`, `docs/product/`, active specs, contracts/source/tests and live read-model. Gateway, frontdoor, Product API, ACP, Domain Harness OS, Hermes and GUI shell wording stays historical design context unless current machine surfaces re-authorize it. |

This index does not maintain a file-by-file current-owner table. Exact historical spec files remain in this directory for provenance and searchability; use the original file or git history only when the compact theme row is insufficient. If an old design decision is still current, fold it into the current owner doc, active support doc or machine-readable contract first.

## Tombstone Rules

- 本目录不是活跃 specs、roadmap、implementation queue、App release plan、runtime provider contract 或 readiness oracle。
- 若历史规格中的内容仍有当前价值，先提升到当前 owner doc、active support doc 或 machine-readable contract，再引用历史来源。
- 历史文件里的验收标准、建议命令、架构链、GUI/API 路径和产品名只用于 provenance；不能直接复制为当前 implementation gate。
