---
name: mas-scholar-skills
description: "Operate MAS Scholar Skills as a Codex skill pack for MAS medical-paper capability modules, syncable professional specialist skills, standard opl scholar-skills CLI readbacks, refs-only materialized candidate packages, and MAS owner-gated authority boundaries. Use when Codex needs ScholarSkills module guidance without claiming runtime, domain, quality, artifact, owner receipt, typed blocker, publication readiness, or production authority."
---

# MAS Scholar Skills

Use MAS Scholar Skills as a repo-tracked Codex entry for MAS medical-paper capability modules and syncable professional specialist skills. Treat `contracts/opl-framework/scholar-skills-capability-modules.json` and the OPL Framework `scholar-skills` builders as the source of truth for OPL CLI/readback behavior; treat the external `mas-scholar-skills` repo as the source for the specialist Skill bodies.

## Boundary

- Keep the authority false boundary explicit: `can_write_domain_truth: false`, `can_write_runtime_state: false`, `can_mutate_artifact_body: false`, `can_sign_owner_receipt: false`, and `can_create_typed_blocker: false`.
- Use ScholarSkills outputs as refs-only candidates. Do not present CLI readbacks, materialized packages, or tests as runtime-ready, domain-ready, quality verdict, publication readiness, artifact authority, owner receipt, typed blocker, or production readiness.
- Respect the MAS owner gate: MAS or another domain owner must consume candidate refs and issue the owner receipt, typed blocker, reviewer receipt, route-back, or domain artifact mutation. Do not write MAS, Yang, runtime DB, queue, owner receipt, typed blocker, or domain truth surfaces from this skill.

## Modules

The ten MAS Scholar Skills modules are:

- `opl.scholarskills.display` - Scholar Display
- `opl.scholarskills.tables` - Scholar Tables
- `opl.scholarskills.stats` - Scholar Stats
- `opl.scholarskills.omics` - Scholar Omics
- `opl.scholarskills.lit` - Scholar Lit
- `opl.scholarskills.write` - Scholar Write
- `opl.scholarskills.review` - Scholar Review
- `opl.scholarskills.submit` - Scholar Submit
- `opl.scholarskills.data` - Medical Data Governance legacy descriptor
- `opl.scholarskills.intake` - Scholar Intake

The default syncable professional specialist skills are:

- `medical-research-lit`
- `medical-manuscript-writing`
- `medical-manuscript-review`
- `medical-figure-design`
- `medical-statistical-review`
- `medical-table-design`
- `medical-submission-prep`
- `medical-data-governance`

Use `medical-data-governance` for clinical cohort data asset manifests, data dictionaries, cleaning/normalization readiness, version impact, study data binding, privacy/access tier, retention/lifecycle guardrails, and refs-only source-readiness route-back. The legacy `opl.scholarskills.data` module id remains a readback compatibility key; new human-facing guidance should foreground `medical-data-governance`.

## CLI

Use the standard CLI surface:

```bash
opl scholar-skills list --json
opl scholar-skills inspect --module <module_id> --json
opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json
opl scholar-skills run-context --module <module_id> --profile <profile> --json
opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json
opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json
opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json
opl scholar-skills runtime-prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> [--apply] --json
opl scholar-skills runtime-run-context --module <module_id> --profile <profile> --platform <platform> --paper-root <path> --json
opl scholar-skills interfaces --json
opl scholar-skills validate --json
opl scholar-skills doctor --json
```

`materialize` writes a deterministic refs-only `materialized_candidate_package` containing package manifests and an unsigned execution receipt candidate. It must not write artifact bodies or authority surfaces.

## Display Gallery

For `opl.scholarskills.display`, use the OPL-side gallery entry at `docs/active/opl-scholar-skills-display-gallery.md`. It points to the MAS-owned human review gallery:

- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery.pdf`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_reference.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_status.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_quality_audit.md`
- `med-autoscience/docs/delivery/medical-display/examples/gallery_manifest.json`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_assets/gallery_manifest.json`

Treat these refs as human review and visual-audit preview refs only. They do not prove publication readiness, owner acceptance, artifact authority, or paper truth.
