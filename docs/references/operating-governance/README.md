# Operating Governance References

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; machine-readable governance behavior must use contracts, schemas, source, CLI/API behavior, generated artifacts, or semantic `human_doc:*` ids.

This directory holds governance, quality projection, incident learning, operator projection, domain memory, directory governance, and surface-review references.

The current OPL topology is not gateway-first. Some files here intentionally preserve legacy-derived `gateway` or `domain_gateway` surface IDs because paired machine-readable artifacts still use them for historical compatibility and reviewability. Treat those IDs as derived compatibility vocabulary unless the core five and current contracts restate them.

## Current Owner Surfaces

| File group | Lifecycle state | Role |
| --- | --- | --- |
| `family-domain-memory-governance.zh-CN.md` | `active_support` | Decides whether domain experience belongs in natural-language memory, strong domain contracts, or a deferred framework lane. |
| `family-domain-quality-projection-contract.md` | `active_support` | Defines how OPL may consume domain-owned quality projection without owning verdicts. |
| `family-product-operator-projection.md` | `support_reference` | Operator projection support; not an action authority. |
| `family-incident-learning-loop.md` | `support_reference` | Incident learning support; domain truth remains domain-owned. |
| `opl-family-directory-governance.zh-CN.md` | `support_reference` | Directory governance support for family repo layout. |
| `opl-governance-audit-operating-surface*` | `support_reference_legacy_derived` | Audit/reference surface. Gateway wording is legacy-derived and does not define current topology. |
| `opl-publish-promotion-operating-surface*` | `support_reference_legacy_derived` | Publish/promotion reference surface. It does not grant publication authority. |
| `opl-surface-authority-matrix*` | `support_reference_legacy_derived` | Derived authority matrix over historical/current surface IDs. It is not an authorization engine. |
| `opl-surface-lifecycle-map*` | `support_reference_legacy_derived` | Derived lifecycle graph over historical/current surface IDs. It is not a workflow engine. |
| `opl-surface-review-matrix*` | `support_reference_legacy_derived` | Derived reviewability matrix. It is not an approval or release engine. |
| `family-structure-advisory-report.md` | `dated_snapshot` | Read-only advisory snapshot. Refresh before reusing exact status. |

## Reading Rule

When a governance document says `gateway`, first classify whether the paragraph is:

1. historical compatibility language,
2. derived machine-readable surface vocabulary,
3. current framework activation/discovery/projection language.

Only the third category can be reused in active docs without a tombstone pointer.
