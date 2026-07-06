---
name: medical-display-qc
description: "Use for MAS medical figure, table, and display quality control: caption/panel alignment, PDF blank export checks, renderer drift, journal numbering, visual audit refs, claim-figure consistency, and route-back planning. QC candidate only; no MAS owner receipt, typed blocker, clinical data/body mutation, artifact authority, quality verdict, publication readiness, or domain readiness."
---

# Medical Display QC

## Boundary

Use this skill to inspect medical figures, tables, captions, exported PDFs, display packs, and reviewer-facing visual evidence as refs-only QC.

This skill may produce candidate QC findings, visual audit refs, consistency maps, renderer drift hypotheses, and MAS route-back suggestions.

This skill must not:

- edit clinical data, figure/table bodies, manuscript bodies, display packs, package authority, runtime state, owner receipts, typed blockers, or MAS domain truth;
- issue a MAS owner receipt, typed blocker, quality verdict, visual acceptance, artifact authority, publication readiness claim, or domain readiness claim;
- treat a nonblank export, passed script, or visual checklist as owner acceptance.

MAS or the consuming domain owner owns figure/table artifact mutation, visual audit acceptance, package authority, and publication gates.

## Workflow/Checklist

1. Gather refs: manuscript PDF, source figures/tables, captions, figure legends, display-pack manifest, renderer logs if provided, journal instructions, and claim/evidence refs.
2. Check presence and export integrity:
   - PDF page has the intended figure/table region, not only a heading or blank panel.
   - Raster/vector exports are nonblank, uncropped, readable, and match expected dimensions.
   - Multi-panel layouts preserve labels, legends, scales, and units.
3. Check numbering and naming:
   - Figure/table order matches manuscript mentions.
   - Captions do not retain duplicate ids such as `F1 / Figure 1: F1`.
   - Supplementary numbering follows journal conventions.
4. Check panel-caption alignment:
   - Every panel named in the caption exists.
   - Every visible panel is explained.
   - Panel labels, group names, units, statistics, sample sizes, and footnotes align.
5. Check claim-display consistency:
   - Main claims supported by the display are visible and not stronger than the underlying data ref.
   - Descriptive, causal, predictive, prevalence, and burden language is not blurred.
   - Missingness, denominators, subgroups, and exclusions are not hidden by the visual.
6. Check renderer drift:
   - Source renderer, output renderer, and final PDF surface are consistent.
   - Styling, fonts, scales, colors, wrapping, and panel ordering did not drift between source and export.
   - Wide tables route to supplement or landscape when main-text readability fails.
7. Classify each finding as `block_owner_review`, `needs_artifact_fix`, `needs_caption_fix`, `needs_claim_narrowing`, `needs_renderer_trace`, or `watch`.
8. Route back only with refs: owner surface, affected artifact, evidence ref, proposed next legal action, and verification command/readback expected from the owner lane.

## Output Shape

Return a compact candidate package:

```yaml
display_qc_candidate:
  source_refs: []
  checked_surfaces:
    - artifact_ref: ""
      surface_type: "figure|table|caption|pdf|display_pack"
      status: ""
  findings:
    - finding_id: ""
      class: ""
      affected_surface: ""
      evidence_ref: ""
      impact: ""
      proposed_route_back: ""
  claim_display_map:
    - claim_ref: ""
      figure_or_table_ref: ""
      consistency: ""
      caveat: ""
  renderer_drift_candidate:
    suspected: false
    refs: []
    owner_readback_needed: ""
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    next_legal_actions: []
  no_authority_statement: "QC candidate only; no MAS owner receipt, typed blocker, artifact authority, quality verdict, publication readiness, or domain readiness"
```
