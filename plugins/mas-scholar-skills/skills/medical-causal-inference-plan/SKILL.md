---
name: medical-causal-inference-plan
description: "Use for MAS medical causal inference planning: target trial emulation, estimand definition, confounding/DAG review, negative controls, IPTW, matching, adjustment, sensitivity analysis, and route-back. Source-only refs guidance; no MAS owner receipt, typed blocker, clinical data/body mutation, artifact authority, quality verdict, publication readiness, domain readiness, or runtime readiness."
---

# Medical Causal Inference Plan

Use this skill to prepare refs-only causal inference method plans for MAS or a MAS-owned medical study workspace.

## Boundary

This skill may create source-only candidate plans, DAG/confounding notes, estimand checks, analysis options, sensitivity recommendations, and route-back suggestions.

This skill must not:

- issue a MAS owner receipt, typed blocker, reviewer receipt, quality verdict, artifact authority, publication readiness claim, domain readiness claim, or runtime readiness claim;
- mutate clinical data, source truth, manuscript bodies, figure/table bodies, package authority, runtime queues, owner receipts, typed blockers, or MAS domain truth;
- present a causal plan, balanced covariate table, sensitivity proposal, or clean checklist as owner acceptance.

MAS or the consuming domain owner must accept, reject, route back, authorize data access, run analyses, mutate artifacts, or issue authority decisions.

## Workflow/Checklist

1. State the causal question with target population, treatment or exposure strategy, comparator, outcome, follow-up horizon, and decision context.
2. Emulate the target trial:
   - eligibility criteria;
   - treatment strategies;
   - assignment time and time zero;
   - follow-up, outcome, censoring, and analysis plan;
   - per-protocol, intention-to-treat, or treatment-policy analogue.
3. Define the estimand:
   - population;
   - exposure contrast;
   - outcome measure;
   - time horizon;
   - handling of competing events, censoring, treatment switching, and intercurrent events.
4. Map confounding with a DAG-style narrative:
   - baseline confounders;
   - disease severity, care access, calendar time, site, indication, and prior outcome history;
   - mediators, colliders, instruments, and post-baseline variables that should not be adjusted away.
5. Choose the smallest defensible adjustment lane:
   - restriction or stratification;
   - regression adjustment;
   - propensity score matching;
   - IPTW or overlap weighting;
   - doubly robust adjustment when source support is explicit.
6. Check positivity, exchangeability, consistency, missingness, immortal time, reverse causation, measurement error, surveillance bias, and informative censoring.
7. Plan negative controls when available:
   - negative control outcome;
   - negative control exposure;
   - falsification endpoint or subgroup;
   - what result would route the plan back.
8. Plan sensitivity analyses:
   - unmeasured confounding;
   - alternative exposure definitions;
   - alternative covariate windows;
   - trimming or overlap diagnostics;
   - missing data handling;
   - competing assumptions for censoring or outcome ascertainment.
9. Flag unsafe claims: causal language without design support, treatment effect claims from descriptive data, unsupported transportability, overadjustment, post-treatment adjustment, or publication/readiness wording.
10. Produce the smallest route-back when evidence is insufficient; name the missing source ref, owner surface, legal next entry point, and decision needed.

## Output Shape

Return a compact candidate package:

```yaml
causal_inference_plan_candidate:
  source_refs: []
  causal_question:
    population: ""
    exposure_strategy: ""
    comparator: ""
    outcome: ""
    follow_up_horizon: ""
    decision_context: ""
  target_trial_emulation:
    eligibility: []
    treatment_strategies: []
    time_zero: ""
    follow_up: ""
    analysis_analogue: ""
  estimand_candidate:
    contrast: ""
    measure: ""
    intercurrent_events: ""
  confounding_dag_notes:
    adjust_for: []
    do_not_adjust_for: []
    bias_risks: []
  method_lane:
    primary: ""
    alternatives: []
    diagnostics: []
  negative_controls: []
  sensitivity_plan: []
  claim_boundaries: []
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    decisions_needed: []
    required_refs: []
  no_authority_statement: "source-only refs guidance; no MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness, domain readiness, or runtime readiness"
```
