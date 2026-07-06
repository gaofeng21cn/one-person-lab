---
name: medical-survival-analysis-plan
description: "Use for MAS medical survival analysis planning: time-zero definition, censoring, competing risk, Kaplan-Meier, Cox, Fine-Gray, time-varying exposure, landmark analysis, proportional hazards diagnostics, reporting, and route-back. Source-only refs guidance; no MAS owner receipt, typed blocker, clinical data/body mutation, artifact authority, quality verdict, publication readiness, domain readiness, or runtime readiness."
---

# Medical Survival Analysis Plan

Use this skill to prepare refs-only survival analysis method plans for MAS or a MAS-owned medical study workspace.

## Boundary

This skill may create source-only candidate plans, endpoint/time-window checks, model options, diagnostic recommendations, reporting checklists, and route-back suggestions.

This skill must not:

- issue a MAS owner receipt, typed blocker, reviewer receipt, quality verdict, artifact authority, publication readiness claim, domain readiness claim, or runtime readiness claim;
- mutate clinical data, source truth, manuscript bodies, figure/table bodies, package authority, runtime queues, owner receipts, typed blockers, or MAS domain truth;
- present a survival curve, hazard ratio plan, diagnostic checklist, or clean table shell as owner acceptance.

MAS or the consuming domain owner must accept, reject, route back, authorize data access, run analyses, mutate artifacts, or issue authority decisions.

## Workflow/Checklist

1. State the survival question with population, index event or exposure, comparator, endpoint, follow-up horizon, and decision context.
2. Define time zero:
   - cohort entry or eligibility date;
   - exposure assignment or landmark date;
   - washout and baseline windows;
   - avoidance of immortal time and reverse causation.
3. Define event and censoring rules:
   - primary and secondary endpoints;
   - death, loss to follow-up, study end, treatment change, withdrawal, or administrative censoring;
   - informative censoring risks and needed sensitivity checks.
4. Decide whether competing risk is present:
   - competing event definition;
   - cause-specific hazard vs cumulative incidence target;
   - Cox cause-specific model, Fine-Gray subdistribution model, or both when clinically justified.
5. Choose the smallest defensible analysis lane:
   - Kaplan-Meier with log-rank only for descriptive unadjusted comparison;
   - Cox model for adjusted hazard ratios when PH and covariate support are plausible;
   - Fine-Gray for subdistribution hazards when cumulative incidence with competing events is the target;
   - restricted mean survival time when PH is weak or clinical interpretation benefits.
6. Handle time-varying exposure or covariates:
   - fixed baseline exposure only when clinically justified;
   - time-updated exposure/covariate plan;
   - lagging, carry-forward, treatment switching, and measurement cadence;
   - avoid post-baseline adjustment that blocks the target estimand.
7. Consider landmark analysis when exposure or responder status is defined after baseline; state landmark time, eligible risk set, excluded early events, and estimand implications.
8. Plan diagnostics:
   - proportional hazards checks with Schoenfeld residuals or time-interaction terms;
   - log-log curves or visual PH checks;
   - influential observations;
   - functional form for continuous covariates;
   - event-per-variable and sparse subgroup risks.
9. Plan reporting:
   - number at risk;
   - events and censoring counts;
   - median follow-up;
   - cumulative incidence or survival at clinically meaningful time points;
   - effect estimates with confidence intervals;
   - covariate set, missing data handling, and sensitivity analyses.
10. Produce the smallest route-back when evidence is insufficient; name the missing source ref, owner surface, legal next entry point, and decision needed.

## Output Shape

Return a compact candidate package:

```yaml
survival_analysis_plan_candidate:
  source_refs: []
  survival_question:
    population: ""
    index_or_exposure: ""
    comparator: ""
    endpoint: ""
    follow_up_horizon: ""
    decision_context: ""
  time_zero:
    definition: ""
    baseline_window: ""
    immortal_time_risk: ""
  event_and_censoring:
    event_definition: ""
    censoring_rules: []
    informative_censoring_risks: []
  competing_risk_plan:
    competing_events: []
    primary_target: ""
    model_choice: ""
  method_lane:
    primary: ""
    alternatives: []
    diagnostics: []
  time_varying_or_landmark_plan:
    time_varying_exposure: ""
    time_varying_covariates: ""
    landmark: ""
  reporting_plan: []
  claim_boundaries: []
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    decisions_needed: []
    required_refs: []
  no_authority_statement: "source-only refs guidance; no MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness, domain readiness, or runtime readiness"
```
