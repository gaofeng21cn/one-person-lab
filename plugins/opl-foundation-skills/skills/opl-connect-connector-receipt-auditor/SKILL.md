---
name: opl-connect-connector-receipt-auditor
description: "Use when auditing OPL Connect connector receipt candidates, normalized source refs, invocation evidence, failed-provider records, registry fit, owner routes, and no-authority handoff briefs."
---

# OPL Connect Connector Receipt Auditor

Use this skill to audit an OPL Connect connector receipt candidate before an owner consumes it. Keep the audit refs-only: compare request, normalized refs, invocation evidence, failure records, and owner route without treating the receipt as truth.

## OPL Owner Boundary

- Treat OPL Connect as authority for connector registry, access, normalization, invocation records, connector receipt candidates, failed-provider records, and source-ref transport.
- Treat the owning program or domain as authority for consuming connector refs into domain truth, owner receipts, typed blockers, promotion, and readiness truth.
- Treat this Skill as the AI-first auditor for receipt completeness, no-authority flags, evidence fit, and route-back.
- Do not sign `owner receipts`, create `typed blockers`, mutate connector registry or domain truth, retry provider calls, or declare `readiness`.
- A connector receipt candidate is not owner acceptance, verified domain truth, artifact authority, production readiness, or domain readiness.

## Workflow

1. Identify the connector, requested resource, invocation parameters, normalized refs, receipt candidate, failed-provider records, and intended owner.
2. Check the receipt contains enough evidence for handoff: source refs, provider identity, request scope, result scope, errors, no-authority flags, and freshness signal.
3. Separate matched evidence from failed or deferred provider requirements; do not hide failed providers inside a successful receipt summary.
4. Classify findings as `registry_gap`, `access_gap`, `normalization_gap`, `receipt_evidence_gap`, `failed_provider_gap`, `owner_route_gap`, `authority_overclaim`, or `no_issue_found`.
5. Recommend the smallest route: Connect receipt fix, retry by Connect, owner consumption request, domain review, or route-back for missing access/source evidence.

## Output Shape

Return:

- `connector_ref`;
- `receipt_candidate_ref`;
- `finding_class` with evidence refs;
- `handoff_assessment`;
- `route_back`: Connect owner or consuming owner action;
- `authority_boundary`: no owner receipts, no typed blockers, no connector/domain/readiness claim.
