# Operating Governance 参考索引

Purpose: `references_operating_governance_index`
State: `support_reference`

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读 governance 行为必须使用 contracts、schemas、source、CLI/API 行为、生成产物或语义化 `human_doc:*` id。

本目录收纳 governance、quality projection、incident learning、operator projection、domain memory、目录治理、结构 advisory、cleanup runbook 和 live evidence 维护参考。

当前 OPL topology 不是 gateway-first。旧 gateway-derived operating matrices 已迁入 [Gateway-Derived Operating Governance 归档](../../history/compatibility/gateway-federation/operating-governance/README.md)，只保留 provenance 与 reviewability。请只把这些标签理解为历史词汇；它们不是 active compatibility interface，当前机器可读行为必须来自核心五件套、当前 contracts、source、CLI/API 行为、runtime ledger 或 domain-owned manifest。

Currentness policy：本目录不冻结 hard blocker、stage attempt、route、worklist、receipt、provider proof、App release/user-path、Brand L5、owner gate、cleanup 或 domain-dispatch counters。当前读数必须从 fresh `opl framework readiness --family-defaults --json`、`opl framework operating-maturity --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl brand-modules l5-status --json`、`opl agents default-callers --family-defaults --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json` 读取。

稳定读法是：`framework readiness` 只能报告 OPL control plane、provider SLO、operator attention 和 refs-only authority boundary；`framework operating-maturity` 是 owner-gate inventory 和 evidence aggregation，不是 ready authority；`agents conformance` 只证明 standard-domain-agent structural conformance，production evidence tail 另读；`family-runtime evidence-worklist` 只是 refs-only operator attention lens，open worklist 为 0 也不是 completion、domain ready 或 production ready；`app-operator-drilldown` 是 refs-only operator projection，App release/user-path evidence、route graph、decision map、safe-action route、memory/artifact refs、cleanup-retirement projection 和 provider SLO 均不授权 App release ready、production ready、domain ready、artifact authority、quality/export verdict、owner receipt closeout、physical delete 或 memory body/writeback apply；`brand-modules l5-status` 的 wrapper payload 是 `.brand_module_l5_status`，verified ledger 只说明 refs-only evidence transport，不关闭 Brand L5。

## 当前 Owner Surfaces

| 文件组 | 生命周期状态 | 角色 |
| --- | --- | --- |
| `family-domain-memory-governance.md` | `active_support` | 判断 domain 经验应进入自然语言 memory、强 domain contract，还是暂缓到 framework lane。 |
| `family-domain-quality-projection-contract.md` | `active_support` | 定义 OPL 如何消费 domain-owned quality projection，而不持有 verdict。 |
| `family-product-operator-projection.md` | `support_reference` | Operator projection 支撑；不是 action authority。 |
| `family-incident-learning-loop.md` | `support_reference` | Incident learning 支撑；domain truth 仍由 domain 持有。 |
| `opl-family-directory-governance.md` | `support_reference` | Family repo layout 的目录治理支撑。 |
| `family-structure-advisory-report.md` | `support_reference` | 结构 advisory 稳定读法与命令入口；不复制 fresh generated counts、line lists 或 public-surface risk 列表。 |
| `family-live-evidence-maintenance.md` | `support_reference` | Live / production / release / owner evidence 的独立维护入口；防止 live evidence tail 混入 ideal/current gap 和 active development 文档。 |
| `opl-family-ponytail-cleanup-runbook.md` | `support_reference` | Ponytail cleanup 的矩阵字段、启动策略、第一批 lane 边界和完成度审计模板；不复制 fresh audit finding，不授权物理删除。 |
| `opl-family-ponytail-audit-matrix-2026-06-27.md` | `superseded_pointer` | 2026-06-27 Ponytail cleanup 矩阵已迁入 history；本路径只保留兼容指针。当前 cleanup 协议读 `opl-family-ponytail-cleanup-runbook.md`，候选与证据必须 fresh 读取。 |

## 已归档的 Gateway-Derived Surface

| 历史文件组 | 当前位置 | 当前读法 |
| --- | --- | --- |
| `opl-governance-audit-operating-surface.md` | `docs/history/compatibility/gateway-federation/operating-governance/` | Audit/reference surface 的历史 provenance，不定义当前 topology。 |
| `opl-publish-promotion-operating-surface.md` | `docs/history/compatibility/gateway-federation/operating-governance/` | Publish/promotion 参考历史。不授予 publication authority。 |
| `opl-surface-authority-matrix.md` | `docs/history/compatibility/gateway-federation/operating-governance/` | 旧 derived authority matrix；不是 authorization engine。 |
| `opl-surface-lifecycle-map.md` | `docs/history/compatibility/gateway-federation/operating-governance/` | 旧 derived lifecycle graph；不是 workflow engine。 |
| `opl-surface-review-matrix.md` | `docs/history/compatibility/gateway-federation/operating-governance/` | 旧 derived reviewability matrix；不是 approval 或 release engine。 |

## 阅读规则

当 governance 文档提到 `gateway` 时，先判断该段属于：

1. 历史 provenance 语言；
2. 已归档 example / reviewability vocabulary；
3. 当前 framework activation/discovery/projection language。

只有第三类可以不带 tombstone 指针复用到 active docs。
