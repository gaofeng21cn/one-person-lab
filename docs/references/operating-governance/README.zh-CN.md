# Operating Governance 参考索引

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；机器可读 governance 行为必须使用 contracts、schemas、source、CLI/API 行为、生成产物或语义化 `human_doc:*` id。

本目录收纳 governance、quality projection、incident learning、operator projection、domain memory、目录治理和 surface review 参考。

当前 OPL topology 不是 gateway-first。本目录中部分文件仍保留 legacy-derived 的 `gateway` 或 `domain_gateway` surface id，是因为配套机器可读工件仍用这些 id 做历史兼容与 reviewability。除非核心五件套和当前合同重新确认，否则这些 id 只能按 derived compatibility vocabulary 理解。

## 当前 Owner Surfaces

| 文件组 | 生命周期状态 | 角色 |
| --- | --- | --- |
| `family-domain-memory-governance.zh-CN.md` | `active_support` | 判断 domain 经验应进入自然语言 memory、强 domain contract，还是暂缓到 framework lane。 |
| `family-domain-quality-projection-contract.md` | `active_support` | 定义 OPL 如何消费 domain-owned quality projection，而不持有 verdict。 |
| `family-product-operator-projection.md` | `support_reference` | Operator projection 支撑；不是 action authority。 |
| `family-incident-learning-loop.md` | `support_reference` | Incident learning 支撑；domain truth 仍由 domain 持有。 |
| `opl-family-directory-governance.zh-CN.md` | `support_reference` | Family repo layout 的目录治理支撑。 |
| `opl-governance-audit-operating-surface*` | `support_reference_legacy_derived` | Audit/reference surface。Gateway wording 是 legacy-derived，不定义当前 topology。 |
| `opl-publish-promotion-operating-surface*` | `support_reference_legacy_derived` | Publish/promotion 参考 surface。不授予 publication authority。 |
| `opl-surface-authority-matrix*` | `support_reference_legacy_derived` | 覆盖历史/当前 surface id 的 derived authority matrix。它不是 authorization engine。 |
| `opl-surface-lifecycle-map*` | `support_reference_legacy_derived` | 覆盖历史/当前 surface id 的 derived lifecycle graph。它不是 workflow engine。 |
| `opl-surface-review-matrix*` | `support_reference_legacy_derived` | Derived reviewability matrix。它不是 approval 或 release engine。 |
| `family-structure-advisory-report.md` | `dated_snapshot` | 只读 advisory snapshot。复用精确状态前必须刷新。 |

## 阅读规则

当 governance 文档提到 `gateway` 时，先判断该段属于：

1. 历史兼容语言；
2. derived machine-readable surface vocabulary；
3. 当前 framework activation/discovery/projection language。

只有第三类可以不带 tombstone 指针复用到 active docs。
