---
name: opl-stage-candidate-portfolio-reviewer
description: "Use when reviewing OPL stage candidate portfolio refs-only projections, candidate ref coverage, assumption/provenance/negative-path/advisory-metric refs, human-review route-back, missing refs, and domain-authority overclaim risks."
---

# OPL Stage Candidate Portfolio Reviewer

Use this skill to review `stage_candidate_portfolio` read models and projection packets. Keep the name and scope precise: this is not a research hypothesis portfolio skill. It reviews OPL-owned body-free stage candidate refs, routing, and advisory signals while the domain agent keeps candidate body, domain truth, quality verdict, artifact authority, and owner receipt authority.

## OPL Owner Boundary

- Treat `stage-candidate-portfolio.schema.json`, Foundry Lab read models, stage packs, domain owner refs, human-review refs, and owner receipts as the authority for recorded state.
- Treat this Skill as the AI-first reviewer for candidate-ref coverage, assumption/provenance/negative-path readability, advisory metric restraint, human-review route clarity, and overclaim prevention.
- Do not read or reconstruct candidate bodies, write domain truth, accept or reject candidates, rank candidates as truth, sign owner receipts, create typed blockers, mutate artifacts, or declare domain/source/publication/runtime readiness.
- A stage candidate portfolio review is not a hypothesis quality verdict, research novelty verdict, owner acceptance, human-gate decision, stage admission, or production readiness claim.

## AI-first / Contract-light Semantics

- Use portfolio schemas, indexes, and modules only for candidate identity, body-free refs, owner routes, receipts, recovery, and verification.
- Keep elastic portfolio review in this Skill: judge ref coverage, advisory metric restraint, negative-path preservation, human-review fit, and route-back quality.
- If the read model cannot support a claim, classify the missing or stale ref instead of encoding candidate judgment in a module.

## Cross-Domain Failure Patterns

Use the shared pattern ids in
`../../references/stage-cross-domain-failure-patterns.md` as portfolio review
heuristics, not new portfolio body rules. Map them to candidate-ref coverage,
advisory-metric restraint, human-review route clarity, and owner-route gaps.

## Inputs

- `stage_candidate_portfolio` packets or `stage_candidate_portfolio_summary` read models.
- Related stage context refs, evidence-pack refs, candidate refs, assumption refs, provenance refs, negative-path refs, advisory metric refs, human-review refs, owner refs, and route-back refs.
- Domain policy, Stagecraft, Foundry Lab, Atlas, runtime, or owner-evidence refs when they explain a missing or stale projection edge.

## Workflow

1. Identify `portfolio_id`, `target_domain_id`, `portfolio_status`, candidate count, owner refs, and authority boundary.
2. Confirm the packet stays body-free:
   - every candidate, evidence, assumption, provenance, negative-path, advisory, and human-review entry carries refs/status only;
   - `body_included` is false everywhere;
   - no `candidate_body`, `domain_body`, `evidence_body`, `body`, `content`, `payload_body`, or `artifact_body` field is present.
3. Review candidate coverage:
   - each candidate has `candidate_ref`, `origin_ref`, `owner_ref`, and evidence refs when evidence is required;
   - rationale refs are present when route selection depends on them;
   - candidate statuses do not imply domain acceptance unless an owner receipt ref says so.
4. Review assumption, provenance, and negative-path refs:
   - material assumptions have owner refs and support or contradiction refs;
   - provenance checks name source refs, source status, and missing/failed checks;
   - negative paths preserve failed evidence, duplicate/adverse findings, and route-back reasons instead of hiding them behind advisory ranking.
5. Review advisory metrics:
   - ranking, proximity, novelty, coverage, or score refs are treated as ordering or briefing signals only;
   - advisory metrics never suppress missing evidence, missing owner review, stale provenance, failed paths, or human gate requirements.
6. Review human-review route:
   - required review requests, decisions, owner routes, and route-back refs are present;
   - missing refs are named as evidence gaps, not converted into quality verdicts.
7. Recommend the smallest legal repair: add missing ref, refresh stale ref, route to domain owner, request human review, update Stagecraft/Foundry Lab projection, or hold as operator attention.

## Finding Classes

- `domain_body_leak`;
- `authority_boundary_overclaim`;
- `candidate_ref_gap`;
- `assumption_ref_gap`;
- `provenance_ref_gap`;
- `negative_path_gap`;
- `advisory_metric_overclaim`;
- `human_review_route_gap`;
- `owner_route_gap`;
- `stale_or_missing_read_model_ref`;
- `critique_as_repair_hint_overclaim`;
- `source_or_receipt_stale`;
- `candidate_body_reconstruction_forbidden`;
- `no_issue_found`.

## Output Shape

Return:

- `stage_candidate_portfolio_ref`;
- `stage_candidate_portfolio_summary_ref`;
- `reviewed_candidate_refs`;
- `finding_class`;
- `missing_or_stale_refs`;
- `advisory_metric_review`;
- `human_review_route`;
- `owner_route`;
- `recommended_delta`;
- `severity_recommendation`: `operator_attention`, `route_back`, or `owner_gate_needed`;
- `authority_boundary`: no candidate bodies, no domain truth, no candidate acceptance, no quality verdict, no owner receipts, no typed blockers, no artifact mutation, no readiness claim.
