---
name: opl-pack-admission-reviewer
description: "Use when reviewing OPL pack admission candidates, declarative pack boundaries, registry fit, contract evidence, owner routes, allowed writes, forbidden authority, and route-back decisions before a pack is admitted."
---

# OPL Pack Admission Reviewer

Use this skill to review an OPL pack admission candidate before an owning registry or program consumes it. Keep the review source-only and refs-only: inspect the packet, name admission gaps, and prepare an AI-first route-back brief.

## OPL Owner Boundary

- Treat Pack registry, pack schema, validators, compiler surfaces, and owning program contracts as authority for admission, registry state, execution, receipts, promotion, and readiness truth.
- Treat this Skill as the AI-first reviewer for admission fit, boundary clarity, evidence coverage, and route-back language.
- Do not sign `owner receipts`, create `typed blockers`, mutate registry or contract truth, execute pack admission, or declare `readiness`.
- A review recommendation is not pack admission, owner acceptance, promotion, runtime readiness, or domain readiness.

Optional helper: `kernel.py` provides stdlib-only deterministic pack-ref normalization, admission skeleton/checklist builders, and authority-phrase linting. It is local support only: no file/network/subprocess use and no owner receipt, typed blocker, registry mutation, admission, or readiness authority.

## Workflow

1. Identify the pack candidate, owning program, target registry, declared capabilities, authority refs, source refs, and validation evidence.
2. Check that stable identity, lifecycle, capability ABI, authority ABI, allowed writes, forbidden writes, and evidence refs are explicit.
3. Verify the pack does not smuggle professional method, domain truth, owner receipts, quality verdicts, or readiness claims into declarative fields.
4. Classify findings as `registry_fit_gap`, `contract_gap`, `capability_abi_gap`, `authority_abi_gap`, `evidence_gap`, `owner_route_gap`, `overclaim_gap`, or `no_issue_found`.
5. Recommend the smallest route: schema fix, pack field fix, source ref fix, owner route clarification, admission hold, or no change.

## Output Shape

Return:

- `pack_candidate_ref`;
- `target_registry`;
- `finding_class` with evidence refs;
- `admission_recommendation`: admit candidate, hold, or route back as a recommendation only;
- `recommended_delta`;
- `authority_boundary`: no owner receipts, no typed blockers, no registry mutation, no readiness claim.
