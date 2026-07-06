---
name: opl-shell-upstream-intake-reviewer
description: "Use when reviewing AionUI, Hermes, OPL Native Workbench, AGUI, or other upstream shell capability intake, classifying accepted/adapt/redirect/reject/requires_contract while preventing shell truth ownership."
---

# OPL Shell Upstream Intake Reviewer

## Boundary

Use this skill to review upstream shell capabilities before they influence App contracts, shell candidates, Settings, Runtime, first-run, or workbench UX.

This skill may:

- inspect upstream shell refs, candidate registry refs, adapter contracts, design references, screenshots, source notes, and proposed intake wording;
- classify shell capabilities as `accepted`, `adapt`, `redirect`, `reject`, or `requires_contract`;
- prepare a concise intake review that maps useful shell ideas into App-owned contracts or rejects authority transfer.

This skill must not:

- copy or vendor upstream code, switch the active shell, mutate App contracts, adapter contracts, release wrappers, runtime state, owner receipts, typed blockers, or domain truth;
- treat AionUI, Hermes, OPL Native Workbench, AGUI, screenshots, candidate validation, or AI review as App product truth, runtime truth, release readiness, or active-shell adoption;
- improve archived technical proofs such as AGUI unless explicitly requested by the owner.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no domain truth, no App product-truth mutation, no active-shell adoption claim, no release/readiness claims.

## Workflow

1. Identify the upstream shell, capability, source refs, candidate state, license or reuse constraint, and claimed App value.
2. Classify the intake:
   - `accepted`: shell plumbing, accessibility, layout, or i18n behavior that fits App-owned contracts;
   - `adapt`: useful UX pattern that must be re-expressed through App state/action contracts;
   - `redirect`: valid capability that belongs in secondary, advanced, candidate-only, or external-owner routing;
   - `reject`: shell-owned product IA, runtime truth, provider/backend ordinary controls, or domain authority;
   - `requires_contract`: promising capability that needs an App-owned contract or adapter gate before use.
3. Check that AionUI remains the active mainline, OPL Native Workbench remains foreground alternative candidate, Hermes remains prior reference, and AGUI remains archived proof unless explicit owner input says otherwise.
4. Verify the proposed intake does not make a shell, candidate, reference project, or screenshot the truth owner.
5. Recommend the smallest legal route: App contract proposal, adapter gate, shell implementation route, secondary redirect, reject note, or owner decision.

## Output Shape

Return:

- `verdict`: `accepted`, `adapt`, `redirect`, `reject`, `requires_contract`, or `hold`;
- `reviewed_refs`;
- `shell_candidate_state`;
- `intake_classification`;
- `authority_risk`;
- `recommended_route`;
- `proof_needed_after_owner_action`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime truth, no domain truth, no App product-truth mutation, no active-shell adoption claim, no release/readiness claims.
