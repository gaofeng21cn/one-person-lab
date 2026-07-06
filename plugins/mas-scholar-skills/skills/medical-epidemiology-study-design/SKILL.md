---
name: medical-epidemiology-study-design
description: "Use for observational, cohort, registry, or real-world medical study design tasks: framing the research question, defining population, exposure and outcome windows, confounding and bias strategy, estimand alignment, STROBE-style design checks, and MAS route-back. Provides candidate study-design guidance only; no MAS owner receipt, typed blocker, clinical data body mutation, artifact authority, quality verdict, publication readiness, or domain readiness."
---

# Medical Epidemiology Study Design

Use this skill to shape a candidate observational medical study design before MAS or the domain owner accepts, rejects, or routes it back.

## Boundary

- Produce refs-only candidate study-design guidance, not a MAS decision.
- Do not issue a MAS owner receipt, typed blocker, reviewer receipt, quality verdict, artifact authority, publication readiness claim, or domain readiness claim.
- Do not mutate clinical data bodies, runtime queues, owner receipts, typed blockers, source truth, publication evals, current packages, manuscripts, figures, tables, or artifact authority surfaces.
- Treat all proposed variables, windows, estimands, and checks as candidate refs for MAS owner-gate consumption.
- Route unresolved design or source-readiness gaps back to the owning MAS stage, study owner, data owner, statistician, or clinician.

## Workflow / Checklist

1. State the study question in one sentence with population, exposure or index event, comparator, outcome, and target decision.
2. Classify the design: retrospective cohort, prospective cohort, registry study, case-control, cross-sectional, descriptive atlas, emulated target trial, or other observational design.
3. Define the population:
   - source registry or care setting;
   - inclusion and exclusion criteria;
   - enrollment, baseline, follow-up, washout, and data-lock windows;
   - adult, pediatric, pregnancy, inpatient, outpatient, or disease-stage applicability.
4. Define exposure, comparator, and index date:
   - ascertainment source;
   - timing and persistence logic;
   - time-varying or fixed handling;
   - immortal-time and reverse-causation risks.
5. Define outcomes:
   - primary and secondary outcomes;
   - diagnostic, lab, medication, procedure, death, admission, or composite logic;
   - ascertainment window, censoring, competing events, and validation needs.
6. Define the estimand:
   - target population;
   - exposure contrast;
   - outcome measure;
   - follow-up horizon;
   - handling of intercurrent events, competing risks, loss to follow-up, and treatment changes.
7. Map confounding and bias:
   - key clinical confounders, severity markers, care-access markers, site or calendar effects;
   - selection, information, surveillance, collider, depletion-of-susceptibles, missingness, and measurement bias;
   - proposed adjustment, restriction, matching, weighting, stratification, negative controls, or sensitivity checks.
8. Check feasibility:
   - required variables and source availability;
   - expected sample size, event count, subgroup depth, and missingness;
   - whether candidate claims would overrun the available design.
9. Run a STROBE-style design check:
   - setting, participants, variables, data sources, bias, study size, quantitative methods, missing data, sensitivity analyses, limitations, ethics, funding, and data availability.
10. Produce the smallest route-back when evidence is insufficient; name the missing input, owner surface, legal next entry point, and why the skill cannot decide it.

## Output Shape

Return a compact candidate package:

```text
design_question:
design_type:
population:
exposure_or_index:
comparator:
outcomes:
time_windows:
estimand_candidate:
confounding_bias_plan:
missingness_and_source_feasibility:
strobe_design_checks:
claim_boundaries:
route_back_candidate:
owner_gate_handoff_ref:
authority_boundary:
```

Set `authority_boundary` to: `refs_only_no_mas_owner_receipt_no_typed_blocker_no_clinical_data_body_mutation_no_artifact_authority_no_quality_verdict_no_publication_or_domain_readiness`.
