---
name: opl-charter-authority-reviewer
description: Use when reviewing OPL Charter or authority-boundary materials, including policy, ADR, RFC, closeout reports, owner split, no-second-truth risks, forbidden claims, readiness overclaim, authority language, and completion or ready claims before publication or handoff. This skill prepares AI authority findings only; it does not change policy source of truth or sign owner answers.
---

# OPL Charter Authority Reviewer

## Boundary

Use this skill as a source-only AI review lens for OPL foundation authority materials. Review text, diffs, packets, reports, or proposed policy/ADR/RFC language for boundary drift and overclaim risk.

This skill may:

- identify authority-boundary defects, ambiguous owner splits, second-truth risks, and forbidden claims;
- classify whether a statement is source truth, policy interpretation, candidate finding, owner answer, readiness claim, or closeout claim;
- prepare concise authority findings and rewrite suggestions for the real owner to consume.

This skill must not:

- change policy source of truth, contracts, runtime state, domain truth, artifact authority, owner receipts, typed blockers, queues, or ledgers;
- sign owner answers, create owner receipts, create typed blockers, approve domain truth, mutate artifacts, or claim readiness;
- treat docs, ADRs, RFCs, reports, tests, candidate packets, read models, or AI judgment as authority acceptance.

No-authority language: no owner receipts, no typed blockers, no domain truth, no artifact authority, no readiness claims.

## Workflow / Checklist

1. Identify the reviewed material and intended claim: Charter rule, policy wording, ADR/RFC proposal, owner split, closeout report, readiness statement, or handoff package.
2. Find the authority owner named or implied by the text. If the owner is missing, classify it as `owner_unspecified`.
3. Separate source of truth from commentary:
   - source-of-truth surface: the policy, contract, owner receipt, domain truth, artifact authority, runtime readback, or release authority that can actually decide;
   - review surface: AI finding, proposal, summary, report, packet, test result, or candidate ref.
4. Check for forbidden claims:
   - owner answer, owner receipt, owner acceptance, typed blocker, human gate, domain truth, quality verdict, artifact authority, runtime authority, release readiness, production readiness, domain readiness, or completion claim without the matching authority surface;
   - wording that turns candidate review, docs, tests, read models, queue state, or clean diff into final authority.
5. Check no-second-truth risk:
   - duplicate policy source, duplicate owner ledger, duplicate readiness register, duplicated status table, competing RFC/ADR truth, or stale report presented as current truth.
6. Check owner split:
   - OPL foundation/framework authority versus App/release authority versus domain-agent truth;
   - AI reviewer recommendation versus real owner decision;
   - transport/readback evidence versus authority acceptance.
7. Classify each issue as one of:
   - `forbidden_claim`;
   - `readiness_overclaim`;
   - `second_truth_risk`;
   - `owner_split_ambiguous`;
   - `source_of_truth_missing`;
   - `authority_language_too_strong`;
   - `closeout_evidence_gap`;
   - `no_issue`.
8. Prefer the smallest correction: delete the claim, downgrade it to candidate/review language, add the owner route, cite the real authority surface, or mark the missing evidence.

## Legacy Coverage

This reviewer covers the retired `opl-brand-l5-evidence-reviewer` entry. Brand L5 evidence language is reviewed here as authority wording and readiness-overclaim risk, not as a separate readiness surface.

## Output Shape

Return a concise review with:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`: files, sections, diffs, packet IDs, or report refs inspected;
- `findings`: issue class, exact risky wording or claim, why it exceeds authority, and the smallest correction;
- `owner_route`: the real owner or authority surface needed to decide;
- `allowed_language`: candidate wording that preserves no-authority boundaries;
- `forbidden_claims_remaining`: any owner receipt, typed blocker, domain truth, artifact authority, or readiness claim still unsupported;
- `residual_risk`: what could not be verified from the supplied refs.

If the material is clean, say why it does not create owner receipts, typed blockers, domain truth, artifact authority, readiness claims, or a second truth source.
