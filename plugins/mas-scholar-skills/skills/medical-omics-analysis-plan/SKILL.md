---
name: medical-omics-analysis-plan
description: "Use for MAS omics, single-cell, Nextflow, RDKit, PyHealth-style, or external specialist analysis planning when MAS needs selective external reasoning or route-back guidance. Planning and route-back only; no executable runtime install/readiness claim, MAS owner receipt, typed blocker, clinical data/body mutation, artifact authority, quality verdict, publication readiness, or domain readiness."
---

# Medical Omics Analysis Plan

## Boundary

Use this skill to plan omics, single-cell, cheminformatics, biomedical ML, workflow-engine, or external specialist analysis routes for MAS.

This skill may produce candidate analysis plans, external-skill routing suggestions, data-readiness questions, method choice rationale, QC checkpoints, and route-back candidates.

This skill must not:

- install or claim readiness of Nextflow, RDKit, PyHealth, single-cell, workflow, cloud, or external runtimes;
- mutate clinical, omics, molecule, image, manuscript, figure/table, package, runtime, owner receipt, typed blocker, or MAS domain truth bodies;
- issue a MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness claim, domain readiness claim, or executable runtime readiness claim.

MAS or the consuming domain owner must authorize data access, executable runs, artifact mutation, owner receipts, typed blockers, quality verdicts, and readiness claims.

## Workflow/Checklist

1. Identify the analysis target: biological question, cohort/sample scope, assay type, endpoint, comparison, expected deliverable, and MAS owner surface.
2. Inventory source refs without reading or mutating protected bodies: sample sheet, data dictionary, assay metadata, batch/design notes, clinical linkage refs, prior QC refs, and available pipeline outputs.
3. Choose the smallest planning lane:
   - `omics_bulk`: RNA-seq, proteomics, metabolomics, methylation, variant, microbiome, or multi-omics.
   - `single_cell`: scRNA/scATAC/spatial, cell annotation, differential abundance, trajectory, communication, or integration.
   - `workflow_engine`: Nextflow/Snakemake/WDL/container execution planning.
   - `cheminformatics`: RDKit molecule descriptors, similarity, clustering, substructure, or QSAR planning.
   - `biomedical_ml`: PyHealth-style EHR modeling, prediction setup, data split, leakage, fairness, or calibration planning.
   - `external_specialist_route`: handoff to a named specialist skill or tool owner.
4. Define minimal defensible methods: inputs, inclusion/exclusion, normalization, covariates, batch handling, QC thresholds, statistical model, multiplicity, sensitivity, and output tables/figures.
5. Name readiness gaps as questions, not blockers, unless a real owner authority surface must decide.
6. Mark unsafe moves: invented data availability, unapproved clinical linkage, unplanned executable install, hidden leakage, unvalidated batch correction, overclaiming mechanism, or publication/domain readiness language.
7. Produce route-back candidates for owner-only actions: authorize data access, approve executable runtime, choose specialist route, accept/reject method, mutate artifacts, or issue blocker/receipt.

## Output Shape

Return a compact candidate package:

```yaml
omics_analysis_plan_candidate:
  source_refs: []
  analysis_target:
    question: ""
    assay_or_modality: ""
    cohort_or_sample_scope: ""
    owner_surface: "MAS/domain owner"
  planning_lane: ""
  method_plan:
    inputs: []
    qc_checks: []
    model_or_pipeline: ""
    covariates_or_batch_plan: ""
    multiplicity_or_sensitivity: ""
    expected_outputs: []
  external_route_candidates:
    - route: ""
      why: ""
      required_owner_authorization: ""
  readiness_questions: []
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    decisions_needed: []
    required_refs: []
  no_authority_statement: "planning and route-back only; no executable runtime install/readiness claim, MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness, or domain readiness"
```
