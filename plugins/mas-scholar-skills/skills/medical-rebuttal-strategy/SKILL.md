---
name: medical-rebuttal-strategy
description: "Use for MAS reviewer response and rebuttal planning: reviewer comment taxonomy, response matrix, added analysis selection, manuscript delta map, evidence refs, and MAS route-back planning. Candidate strategy only; no MAS owner receipt, typed blocker, clinical data/body mutation, artifact authority, quality verdict, publication readiness, or domain readiness."
---

# Medical Rebuttal Strategy

## Boundary

Use this skill to prepare refs-only rebuttal strategy for MAS or a MAS-owned paper workspace.

This skill may create candidate plans, matrices, analysis recommendations, evidence ref lists, manuscript delta maps, and route-back suggestions.

This skill must not:

- issue a MAS owner receipt, reviewer receipt, typed blocker, quality verdict, publication readiness claim, or domain readiness claim;
- mutate clinical data, manuscript body, figure/table bodies, package authority, runtime queues, owner receipts, typed blockers, or MAS domain truth;
- present a response draft, added-analysis plan, or clean checklist as owner acceptance.

MAS or the consuming domain owner must accept, reject, route back, or mutate artifacts through its own authority surface.

## Workflow/Checklist

1. Identify source refs: reviewer letter, editor decision, manuscript version, figures/tables, supplements, prior response draft, journal instructions, and available analysis outputs.
2. Split comments into atomic items. Keep reviewer id, comment id, quoted concern, affected manuscript surface, and evidence needed.
3. Classify each item:
   - `scientific_claim`: claim needs support, narrowing, or removal.
   - `methods_or_statistics`: design, estimand, model, covariate, missingness, multiplicity, sensitivity, or reproducibility concern.
   - `display_or_table`: figure/table/caption/panel/numbering/visual consistency concern.
   - `writing_or_structure`: framing, flow, terminology, limitation, or discussion concern.
   - `policy_or_submission`: ethics, consent, funding, COI, data/code availability, reporting guideline, or journal format concern.
4. Decide the lightest defensible response type: clarify, cite, narrow claim, add sensitivity analysis, add table/figure, move to supplement, revise wording, or route back to owner.
5. For added analyses, name the exact hypothesis, population, denominator, variables, model, output surface, risk of overreach, and whether existing data support it.
6. Build a manuscript delta map: section, paragraph/table/figure, intended edit, source evidence ref, and owner decision needed.
7. Flag unsafe moves: new clinical interpretation without evidence, new data body mutation, invented result, unverified citation, response promise without executable plan, or readiness claim.
8. Produce route-back candidates for owner-only decisions: accept/reject response posture, authorize new analysis, approve artifact mutation, sign receipt, or declare blocker.

## Output Shape

Return a compact candidate package:

```yaml
rebuttal_strategy_candidate:
  source_refs: []
  comment_taxonomy:
    - reviewer: ""
      comment_id: ""
      concern: ""
      class: ""
      affected_surface: ""
      evidence_needed: []
  response_matrix:
    - comment_id: ""
      proposed_response_type: ""
      response_position: ""
      added_analysis_candidate: null
      manuscript_delta_refs: []
      owner_decision_needed: false
  manuscript_delta_map:
    - surface: ""
      proposed_delta: ""
      evidence_ref: ""
      authority_boundary: "candidate_only"
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    questions: []
    required_refs: []
  no_authority_statement: "candidate strategy only; no MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness, or domain readiness"
```
