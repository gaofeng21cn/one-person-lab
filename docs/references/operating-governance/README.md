# Operating Governance 参考索引

Purpose: `references_operating_governance_index`
State: `support_reference`

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读 governance 行为必须使用 contracts、schemas、source、CLI/API 行为、生成产物或语义化 `human_doc:*` id。

本目录收纳 governance、quality projection、incident learning、operator projection、domain memory、目录治理和结构 advisory 参考。

当前 OPL topology 不是 gateway-first。旧 gateway-derived operating matrices 已迁入 [Gateway-Derived Operating Governance 归档](../../history/compatibility/gateway-federation/operating-governance/README.md)，只保留 provenance 与 reviewability。请只把这些标签理解为历史词汇；它们不是 active compatibility interface，当前机器可读行为必须来自核心五件套、当前 contracts、source、CLI/API 行为、runtime ledger 或 domain-owned manifest。

2026-05-28 live read-model 校准：`framework readiness` 读为 `framework_control_plane_available_with_open_production_tail`，hard blocker 为 0，但 12 条 production tail / stage-evidence workorder 仍需要 domain/App payload；`agents conformance` 只证明 4 个 repo structural conformance passed；`family-runtime evidence-worklist` 读到 12 条 payload-required stage-evidence workorder、0 条 domain-dispatch workorder；`app-operator-drilldown` 是 refs-only operator projection，App release/user-path evidence 可见但 release / production ready claim 仍为 false，默认 stage executor 是 `codex_cli`。因此，本目录所有 governance reference 都只能作为 owner split、projection、incident、memory、quality 和 structure advisory 支撑，不授权 domain ready、production ready、App release ready、artifact authority、quality/export verdict、owner receipt closeout 或 memory body/writeback apply。

## 当前 Owner Surfaces

| 文件组 | 生命周期状态 | 角色 |
| --- | --- | --- |
| `family-domain-memory-governance.md` | `active_support` | 判断 domain 经验应进入自然语言 memory、强 domain contract，还是暂缓到 framework lane。 |
| `family-domain-quality-projection-contract.md` | `active_support` | 定义 OPL 如何消费 domain-owned quality projection，而不持有 verdict。 |
| `family-product-operator-projection.md` | `support_reference` | Operator projection 支撑；不是 action authority。 |
| `family-incident-learning-loop.md` | `support_reference` | Incident learning 支撑；domain truth 仍由 domain 持有。 |
| `opl-family-directory-governance.md` | `support_reference` | Family repo layout 的目录治理支撑。 |
| `family-structure-advisory-report.md` | `dated_snapshot` | 只读 advisory snapshot。复用精确状态前必须刷新。 |

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
