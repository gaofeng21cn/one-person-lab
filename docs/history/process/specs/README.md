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

## Historical Specs

| File | Historical role | Current owner |
| --- | --- | --- |
| `2026-04-02-bilingual-homepage-and-core-docs-design.md` | 早期公开 README / public docs 双语化设计记录。 | 当前 public surface 以 root `README*`、`docs/README.md`、`docs/public/` 和核心五件套为准。 |
| `2026-04-06-med-auto-grant-top-level-design.md` | MAG 独立仓拆分前的顶层设计迁移说明。 | MAG domain truth 归 `med-autogrant` 独立仓；OPL 只保留 domain admission / projection / framework refs。 |
| `2026-04-07-unified-harness-engineering-substrate-design.md` | UHS / Gateway / Domain Harness OS 早期命名分层设计。 | 当前分层归核心五件套、runtime naming boundary、domain onboarding 与 active roadmap。 |
| `2026-04-12-opl-frontdoor-and-family-entry-design.md` | frontdoor / Hermes handoff / lightweight entry 早期设计。 | 当前入口归 `opl` / Codex-default runtime / activation layer / provider-backed stage runtime / App projection。 |
| `2026-04-20-opl-product-api-and-domain-agent-boundary-design.md` | Product API 资源模型与 domain-agent 边界形成过程。 | 当前 product/runtime/domain 边界归核心五件套、active docs、runtime/support specs 和 contracts。 |
| `2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md` | ACP-native session runtime 与 shell projection 形成过程。 | 当前 session/runtime/App/shell 边界归 core docs、runtime naming boundary、App repo contracts 和 live read-model。 |

## Tombstone Rules

- 本目录不是活跃 specs、roadmap、implementation queue、App release plan、runtime provider contract 或 readiness oracle。
- 若历史规格中的内容仍有当前价值，先提升到当前 owner doc、active support doc 或 machine-readable contract，再引用历史来源。
- 历史文件里的验收标准、建议命令、架构链、GUI/API 路径和产品名只用于 provenance；不能直接复制为当前 implementation gate。
