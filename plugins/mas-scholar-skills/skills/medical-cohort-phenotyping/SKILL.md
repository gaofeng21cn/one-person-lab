---
name: medical-cohort-phenotyping
description: "Use for clinical cohort phenotype definition and phenotype review tasks: inclusion and exclusion rules, ICD/lab/medication/time-window logic, adult or child applicability, diagnostic ascertainment, missingness and availability checks, and source-readiness handoff. Provides refs-only phenotype candidate guidance only; no MAS owner receipt, typed blocker, clinical data body mutation, artifact authority, quality verdict, publication readiness, or domain readiness."
---

# Medical Cohort Phenotyping

Use this skill to define or review candidate clinical cohort phenotypes before MAS or the source owner accepts, rejects, or routes them back.

## Boundary

- Produce refs-only phenotype candidate guidance, not a MAS phenotype decision.
- Do not issue a MAS owner receipt, typed blocker, reviewer receipt, quality verdict, artifact authority, publication readiness claim, or domain readiness claim.
- Do not mutate clinical data bodies, diagnosis maps, code lists, source truth, runtime queues, current packages, manuscripts, figures, tables, or artifact authority surfaces.
- Treat all phenotype definitions, code lists, windows, and ascertainment checks as candidate refs for MAS owner-gate or source-readiness consumption.
- Route unresolved source, clinical, coding, or data-availability gaps back to the MAS stage, source owner, data steward, statistician, or clinician.

## Workflow / Checklist

1. State the phenotype purpose:
   - cohort entry, exposure, outcome, covariate, subgroup, severity marker, exclusion, or sensitivity definition.
2. Define the clinical concept:
   - disease, event, treatment, lab state, procedure, utilization marker, or composite;
   - clinical rationale and what the phenotype must not imply.
3. Specify inclusion and exclusion logic:
   - qualifying records;
   - required observation period;
   - lookback, washout, baseline, follow-up, and censoring windows;
   - repeated-code, confirmatory-lab, medication, procedure, or clinician-confirmation requirements.
4. Map source logic:
   - ICD, SNOMED, CPT, procedure, medication, lab, vital sign, registry field, note-derived, or death-source inputs;
   - code-set version, local-code mapping, units, thresholds, and normalization requirements;
   - source priority when fields disagree.
5. Check adult and child applicability:
   - age cutoffs;
   - pediatric-specific codes, reference ranges, medication dosing, growth metrics, congenital conditions, or pregnancy boundaries;
   - whether an adult phenotype can be reused without clinical distortion.
6. Review diagnostic ascertainment:
   - single code vs repeated code;
   - inpatient vs outpatient reliability;
   - lab-confirmed, medication-supported, specialist-confirmed, registry-confirmed, or adjudicated status;
   - false-positive and false-negative risks.
7. Review time-window consistency:
   - index date;
   - baseline eligibility;
   - incident vs prevalent status;
   - outcome-at-risk period;
   - exposure-outcome ordering and immortal-time risk.
8. Check missingness and availability:
   - variable presence by site, period, setting, age group, and source table;
   - structural missingness vs not measured vs unavailable source;
   - whether missingness changes interpretation or sample inclusion.
9. Define sensitivity and audit candidates:
   - narrow vs broad phenotype;
   - alternative code sets or thresholds;
   - minimum observation depth;
   - site or calendar robustness;
   - manual review or adjudication sample when needed.
10. Produce the smallest source-readiness handoff when evidence is insufficient; name missing variables, code maps, source owner, legal next entry point, and review evidence needed.

## Output Shape

Return a compact candidate package:

```text
phenotype_name:
phenotype_role:
clinical_concept:
inclusion_logic:
exclusion_logic:
source_fields_and_code_sets:
time_windows:
adult_child_applicability:
diagnostic_ascertainment:
missingness_and_availability:
sensitivity_or_audit_candidates:
claim_boundaries:
source_readiness_handoff:
owner_gate_handoff_ref:
authority_boundary:
```

Set `authority_boundary` to: `refs_only_no_mas_owner_receipt_no_typed_blocker_no_clinical_data_body_mutation_no_artifact_authority_no_quality_verdict_no_publication_or_domain_readiness`.
