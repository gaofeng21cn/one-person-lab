---
name: mas-scholar-skills
description: "Operate MAS Scholar Skills as the OPL-owned external enhancement pack and maintained professional Codex skill source for MAS medical-paper capability discovery, medical-manuscript-writing, medical-manuscript-review, medical-figure-design, medical-research-lit, medical-statistical-review, medical-table-design, medical-submission-prep, medical-data-governance, repo-tracked module refs, packs, quality floors, templates, candidate refs, and MAS owner-gated authority boundaries. Use from the MAS overlay or MAS stage operating prompts when Codex needs MAS Scholar Skills guidance without claiming runtime, domain, quality, artifact, owner receipt, or production authority."
---

# MAS Scholar Skills

Use MAS Scholar Skills as the repo-tracked Codex discovery and reference entry for the OPL-owned MAS medical-paper enhancement pack. The historical `opl-scholarskills` name is a legacy alias only. Treat `contracts/scholar-skills-capability-modules.json` as this skill pack's module catalog snapshot. The executable `opl scholar-skills *` CLI and runtime bridge remain owned by OPL Framework.

This repository is the professional specialist source for the MAS-consumed skills `medical-manuscript-writing`, `medical-manuscript-review`, `medical-figure-design`, `medical-research-lit`, `medical-statistical-review`, `medical-table-design`, `medical-submission-prep`, and `medical-data-governance`. In MAS work, start from the MAS overlay runtime entry or a MAS stage operating prompt, then route high-frequency writing, review, figure, literature, statistics, table, submission, or clinical data governance work through these synced professional skills. Use MAS Scholar Skills to pull enhancement material: references, packs, quality floors, templates, module contracts, candidate refs, and route-back hints. Keep MAS stage operating prompts as the stage, evidence, route-back, and owner-gate entries.

For literature discovery, use the real specialist skill `medical-research-lit` when a task needs PubMed-oriented search planning, query iteration, source screening, citation verification, evidence mapping, or a MAS route-back handoff. Do not reduce literature discovery to the `mas-scholar-skills.lit` descriptor alone.

## MAS Overlay Call Path

Default route:

```text
MAS overlay or stage operating prompt
  -> medical-manuscript-writing / medical-manuscript-review / medical-figure-design
     / medical-statistical-review / medical-table-design / medical-submission-prep
     / medical-data-governance
  -> MAS Scholar Skills discovery refs or medical-research-lit
  -> source_pack_ref / candidate_package_ref / quality_floor_ref / owner_gate_handoff_ref
  -> MAS owner gate consume / reject / route back
```

MAS Scholar Skills can improve the material those MAS skills use. It cannot replace the MAS overlay, issue MAS owner receipts, create typed blockers, update ledgers, mutate current packages, write runtime queues, or claim publication readiness.

## Local Install / Discovery

This `mas-scholar-skills` repository is the source of truth for the MAS Scholar Skills professional pack. The recommended MAS consumption path is a compact local Codex discovery install inside the active paper workspace or runtime quest:

```text
<workspace_root>/.codex/skills/mas-scholar-skills/
<workspace_root>/.codex/skills/medical-manuscript-writing/
<workspace_root>/.codex/skills/medical-manuscript-review/
<workspace_root>/.codex/skills/medical-figure-design/
<workspace_root>/.codex/skills/medical-research-lit/
<workspace_root>/.codex/skills/medical-statistical-review/
<workspace_root>/.codex/skills/medical-table-design/
<workspace_root>/.codex/skills/medical-submission-prep/
<workspace_root>/.codex/skills/medical-data-governance/
<quest_root>/.codex/skills/mas-scholar-skills/
<quest_root>/.codex/skills/medical-manuscript-writing/
<quest_root>/.codex/skills/medical-manuscript-review/
<quest_root>/.codex/skills/medical-figure-design/
<quest_root>/.codex/skills/medical-research-lit/
<quest_root>/.codex/skills/medical-statistical-review/
<quest_root>/.codex/skills/medical-table-design/
<quest_root>/.codex/skills/medical-submission-prep/
<quest_root>/.codex/skills/medical-data-governance/
```

Use OPL Connect to sync that compact install:

```bash
opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace_root> --json
opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest <quest_root> --json
```

The local install is refs-only and authority false. It may include this Skill entry, the professional skills `medical-manuscript-writing`, `medical-manuscript-review`, `medical-figure-design`, `medical-research-lit`, `medical-statistical-review`, `medical-table-design`, `medical-submission-prep`, and `medical-data-governance`, plugin/module refs, compact gallery review refs, and lightweight manifests needed for discovery and review. Do not copy this whole source repository into a paper directory or quest. Do not copy MAS `outputs/display-pack-gallery/`, render caches, single-figure PNG/SVG/HTML exports, dependency locks, run-context files, or other gallery intermediates into each consuming workspace. Do not treat a MAS program-repo `plugins/mas-scholar-skills/` mirror or system Codex registry install as the recommended runtime quest discovery surface.

## Boundary

- Keep the authority false boundary explicit: `can_write_domain_truth: false`, `can_write_runtime_state: false`, `can_mutate_artifact_body: false`, `can_sign_owner_receipt: false`, and `can_create_typed_blocker: false`.
- Treat this repository as the source, contract, and docs home for the active professional skill modules in MAS Scholar Skills, not only Display. Lit, Tables, Stats, Submit, Write, Review, and Data use the same refs-only/no-authority boundary.
- Keep the stage/specialist split single-sourced: MAS stage operating prompts own stage validity, routing, owner gates, and acceptance; `medical-manuscript-writing`, `medical-manuscript-review`, `medical-figure-design`, `medical-research-lit`, `medical-statistical-review`, `medical-table-design`, `medical-submission-prep`, and `medical-data-governance` own the professional playbooks and are maintained in this repository for MAS consumption.
- Require every module handoff to name `source_pack_ref`, `candidate_package_ref`, `execution_receipt_ref`, and `owner_gate_handoff_ref`; these are candidate refs only and must not be read as runtime authority, owner acceptance, publication readiness, typed blocker creation, or a human gate.
- Use MAS Scholar Skills outputs as refs-only candidates. Do not present CLI readbacks, materialized packages, or tests as runtime-ready, domain-ready, quality verdict, publication readiness, artifact authority, owner receipt, typed blocker, or production readiness.
- Respect the MAS owner gate: MAS or another domain owner must consume candidate refs and issue the owner receipt, typed blocker, reviewer receipt, route-back, or domain artifact mutation. Do not write MAS, Yang, runtime DB, queue, owner receipt, typed blocker, current package authority, publication eval, controller decision, or domain truth surfaces from this skill.
- Treat any `owner_receipt_ref`, `typed_blocker_ref`, `reviewer_receipt_ref`, `route_back_evidence_ref`, or current-package ref exposed by MAS Scholar Skills as downstream owner-consumption refs only, not as MAS Scholar Skills acceptance, receipt signing, blocker creation, publication readiness, or current package authority.

## Capability Module Classification

Keep the physical shape explicit:

- Eight active professional skill modules: `display`, `tables`, `stats`, `lit`, `write`, `review`, `submit`, and `data`.
- Eight real syncable specialist skills: `medical-manuscript-writing`, `medical-manuscript-review`, `medical-figure-design`, `medical-research-lit`, `medical-statistical-review`, `medical-table-design`, `medical-submission-prep`, and `medical-data-governance`.
- No contract-layer module is active in this repository.

Generic source or external-learning intake belongs to OPL Framework or MAS stage/source surfaces and is not kept here as a contract placeholder. Omics belongs here only when MAS has a stable real omics specialist workflow that should be maintained as a professional Codex skill.

## Professional Skill Quality Floor

The eight real specialist skills carry the default AI-first quality
floor for MAS medical-paper work:

- `medical-figure-design`: figure contract, evidence chain, archetype, renderer
  decision, style brief, candidate set, critic review, and visual QA.
- `medical-manuscript-writing`: one-sentence argument, terminology ledger,
  paragraph job map, section contract, citation integrity, figure/table binding,
  and data/code availability audit.
- `medical-manuscript-review`: shared fact base, technical/significance/reader
  reviewer lanes, cross-review synthesis, reviewer action matrix, and route-back
  closeout.
- `medical-research-lit`: PubMed-first source routing, query plan,
  deduplication, retain/reject/watchlist screening, fallback source refs,
  support-strength matrix, and citation integrity floor.
- `medical-statistical-review`: statistical question, estimand, analysis plan,
  denominator/missingness, assumption diagnostics, effect size, multiplicity,
  sensitivity, table/figure consistency, and action matrix.
- `medical-table-design`: table job, shell, source metrics, denominators,
  statistical display, table QC, claim-table alignment, and journal table
  contract.
- `medical-submission-prep`: journal instructions, reporting guideline,
  declaration inventory, data/code availability, package consistency, reviewer
  response candidate, author-input list, and submission action matrix.
- `medical-data-governance`: clinical data asset manifests, data dictionaries,
  cleaning/normalization readiness, version-diff impact, study binding,
  privacy/access tiers, lifecycle/retention guardrails, and MAS owner-gate
  route-back.

These requirements absorb useful patterns from `K-Dense-AI/scientific-agent-skills`
and `Yuan1z0825/nature-skills` into MAS-consumed professional playbooks. They do
not require installing those external runtimes before MAS can produce candidate
refs, and they do not create a parallel stage authority.

## MAS Progress And AI Judgment Rules

- Use progress-first and AI auto-judgment-first routing: AI should continue when available evidence is enough for a candidate judgment, instead of waiting for a human by default.
- Provide AI-consumable evidence plus `verdict_candidate`, `route_back_candidate`, and `stop_or_continue_recommendation` refs whenever the module can judge a candidate handoff.
- Missing external runtime installation is not a blocker for refs-only candidate judgment, checklist generation, or route-back recommendation. It blocks only when a named owner requires that runtime's executable artifact.
- Only authority surfaces block MAS Scholar Skills progression: domain truth, publication readiness, owner receipt, typed blocker, artifact authority, current package authority, or a real human gate.
- If evidence is insufficient, produce the smallest `route_back_candidate` that names the missing evidence, owner surface, and next legal entry point; do not create a typed blocker from this skill.

## Scholar Lit And OPL Connect

For PubMed-oriented literature work, use `medical-research-lit` for the AI workflow and OPL Connect for stable external source access:

```bash
opl connect pubmed search --query "<query>" --limit <n> --json
```

Record connector output as `pubmed_source_refs` and `pubmed_connector_invocation_ref` in the Lit handoff. MAS Scholar Skills owns query strategy, citation-map guidance, reference-integrity floors, route-back hints, and AI candidate judgments. OPL Connect owns the PubMed API call, normalized `pubmed:<pmid>` refs, request metadata, connector errors, and read-only receipt candidate.

## FeedbackOps Refs-Only Adapter

MAS Scholar Skills may act as the OPL FeedbackOps refs-only capability adapter for evidence profile `target_agent_feedback_external_suite`. From delivery feedback it may generate `candidate_refs`, quality hints, display/write/review capability suggestions, `route_back_candidate_ref`, and `stop_or_continue_recommendation_ref` as evidence input. MAS or OMA may consume `feedbackops_intake_ref` and route-back refs from this adapter, then issue any owner receipt, typed blocker, quality verdict, artifact mutation, or current-package update from their own authority surface.

This adapter cannot sign owner receipts, create typed blockers, claim quality verdicts, write MAS/current_package, mutate domain artifacts, or claim owner acceptance, current-package authority, or publication readiness. The machine-readable policy is `feedbackops_refs_only_adapter_policy` in `contracts/scholar-skills-capability-modules.json`.

For `mas-scholar-skills.review` on observational, cohort, registry, real-world, or descriptive atlas drafts, include `registry_initial_draft_quality_floor_ref` and, for medical SCI initial drafts, `scholarskills_medical_sci_initial_draft_quality_floor.v1` when relevant. It should flag missing enrollment/data-lock windows, missing inclusion/exclusion flow or ethics/consent/funding/COI/data-availability statements, undefined BMI or diagnostic ascertainment, adult/child applicability gaps, selected diagnostic-field positivity being written as prevalence or burden, figure-caption payload drift, too-thin missingness/availability atlas claims, limitation-only discussion, submission-source prose residue, workflow/tool-pipeline prose in the manuscript body, and conclusion self-evaluation instead of evidence-based clinical conclusion. The medical SCI initial-draft floor adds refs-only checks for `reference_integrity_floor_ref`, `manuscript_body_volume_floor_ref`, `figure_table_volume_and_clinical_value_ref`, `internal_report_prose_route_back_ref`, `figure_polish_alignment_ref`, and `registry_descriptive_scientific_boundary_ref`. Use these to produce review hints, `verdict_candidate`, `route_back_candidate`, and `stop_or_continue_recommendation` refs when citations are missing, references are placeholders, the body is below the expected section floor, result figures/tables are too sparse or clinically low-value, manuscript prose reads like an internal workflow report, figure-polish expectations drift from the current skill contract, or a descriptive registry paper overclaims prevalence, burden, prediction, causality, or publication readiness. Concrete route-back triggers include phrases such as "calendar enrollment period is not promoted", "this restriction is intentional", "submission metadata remain incomplete", "TRIPOD is cited only as a boundary reference", "MAS display-pack renderer", and "defensible clinical story" in manuscript body text. This is a refs-only review hint for MAS or the domain owner; it is not a quality verdict, reviewer receipt, typed blocker, owner acceptance, publication readiness claim, or current-package authority.

## Active Modules

The active MAS Scholar Skills modules use the `mas-scholar-skills.*` module IDs. Historical `opl.scholarskills.*` IDs are legacy aliases/provenance only:

- `mas-scholar-skills.display` - Scholar Display
- `mas-scholar-skills.tables` - Scholar Tables
- `mas-scholar-skills.stats` - Scholar Stats
- `mas-scholar-skills.lit` - Scholar Lit
- `mas-scholar-skills.write` - Scholar Write
- `mas-scholar-skills.review` - Scholar Review
- `mas-scholar-skills.submit` - Scholar Submit
- `mas-scholar-skills.data` - Medical Data Governance

## External Learning Module Fit

External learning improves module fit by adding candidate refs and checklist items; it does not require installing external runtimes before owner-gated work can move. Display, Tables, Stats, Lit, Write, Review, Submit, and Data may all expose learned refs from upstream research-skill, paper-writing, paper-management, figure-QA, and panel-to-code projects, but those refs stay candidate-only.

Keep the progress rule simple: if the consuming agent can produce the module's refs-only checklist, continue toward the MAS/domain owner gate. Missing external runtime installation is not a blocker unless the owner explicitly needs that runtime's executable artifact; the contract policy token is `external_runtime_install_not_required_before_candidate_refs_or_checklists`.

## Medical Data Governance Guardrails

For large medical cohort datasets, use `medical-data-governance` as the real MAS Scholar Skills specialist skill. The active Data module id is `mas-scholar-skills.data`; the legacy `opl.scholarskills.data` id remains an alias/provenance key only. New human-facing guidance should foreground `medical-data-governance`. The skill must keep data management refs explicit instead of treating every file copy as a durable version. The module expects refs that separate:

- authoritative release bodies from convenience interchange files, indexed working copies, study-local extracts, reports, caches, and runtime artifacts;
- hot / warm / cold / external placement and the reason each tier is allowed;
- manifest-declared body inventory, registry lineage, semantic readiness, study binding, privacy/access tier, and retention guardrails;
- analytical format strategy for repeated local work, including CSV interchange plus SQLite/DuckDB/Parquet working copies when appropriate, without making a working copy a second truth source;
- byte-level cold-store restore proof, checksum, owner authorization, and rehydrate verification before any clinical dataset body leaves online storage.
- completed or parked project data closeout refs, including exact `data_asset_manifest_ref`, `lifecycle_classification_ref`, `important_result_reproduction_ref`, `data_body_boundary_ref`, `study_impact_ref`, `owner_decision_ref`, `post_cleanup_readback_ref`, `prune_dry_run_ref`, and `lifecycle_catalog_ref`.

Lifecycle states are refs-only labels: `hot_current_body`, `warm_parent_or_provenance`, `paper_facing_current`, `active_runtime`, `semantic_closed`, `byte_closed`, `delete_safe_cache`, and `retired_tombstone`. `owner_decision_ref` names the downstream decision target; it is not a MAS Scholar Skills owner decision, deletion approval, retention waiver, or receipt.

These refs follow FAIR-style metadata discipline and data package resource inventories, but they remain refs-only candidate guidance. They do not authorize moving, thinning, deleting, compacting, or publishing a clinical dataset. MAS or the consuming domain owner must issue the retention decision, owner receipt, typed blocker, or route-back evidence.

For completed projects, prefer semantic reproducibility over byte preservation of historical process bodies: keep current cohort bodies hot, migrate useful historical information into semantic reproducible capsules when documented sources and commands can reproduce important results, keep byte-level capsules only when exact restore is required by active analysis, legal/regulatory retention, external handoff, or an explicit owner decision, use audit-only tombstones only after an explicit owner waiver, and delete covered raw history and rebuildable caches.

Every module should expose the standard refs-only handoff family when materialized: `source_pack_ref`, `candidate_package_ref`, `execution_receipt_ref`, and `owner_gate_handoff_ref`. These are handoff refs only; they do not sign an owner receipt, create a typed blocker, authorize publication readiness, or make MAS Scholar Skills a domain owner.

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

For `mas-scholar-skills.display`, use this repo's compact gallery review package:

- `gallery/medical-display/medical_display_gallery.pdf`
- `gallery/medical-display/medical_display_gallery_reference.md`
- `gallery/medical-display/display_pack_gallery_status.md`
- `gallery/medical-display/display_pack_gallery_quality_audit.md`
- `gallery/medical-display/gallery_manifest.json`
- `gallery/medical-display/gallery_snapshot.json`

The package is maintained in this repository beside the MAS Scholar Skills-owned `packs/medical-display-core` source pack for direct human review. Treat these refs as human review and visual-audit preview refs only. They do not prove publication readiness, owner acceptance, artifact authority, or paper truth. Local workspace and quest installs should copy only these compact review refs when needed, not the gallery build workspace or intermediate outputs. MAS remains the owner for medical display truth, actual figure artifacts, visual audit receipts, and publication gates.

## Scholar Display Pack

`packs/medical-display-core/` is the MAS Scholar Skills-managed source pack for generic medical display templates. It contains template descriptors, R/ggplot2 renderers, shared R helpers, pack Python helpers, dependency profile, and canonical template metadata. It deliberately excludes generated gallery outputs, render caches, layout sidecars, and single-figure preview exports.

Use this pack as a reusable Display capability source. Do not treat it as MAS publication truth. The pack manifest keeps `authority = false`, `publication_ready = false`, `artifact_authority = false`, `owner_receipt_authority = false`, and `typed_blocker_authority = false`. MAS or the consuming domain owner must bind the pack output to paper-local figure purpose, claim/data refs, visual audit receipts, publication gate, owner receipt, typed blocker, or human gate.

## Display Quality Floor

For scientific figures, including data evidence figures, page-level composite figures, graphical abstracts, and other design-led display work, apply `scholarskills_scientific_figure_quality_floor.v1`. Do not reuse the current gallery `submission_graphical_abstract` as a final template. Treat it as a lower-bound design shell only.

Use `Scholar Display` policy `brief_first_reference_guided_ai_candidate_not_single_template_reuse` for graphical abstracts, and the same brief/reference/candidate/critic discipline as the general refs-only scientific figure quality-floor workflow:

1. Start from the paper-local core claim, evidence chain, figure contract, target audience, journal/export needs, and forbidden claim drift.
2. Select or cite style references, then produce a style brief. A reference is a visual target, not data truth, claim authority, or a template authority.
3. Let the AI executor choose the suitable figure form, layout, panel hierarchy, renderer, and candidate count. The skill raises the lower bound; it must not cap the upper bound.
4. Require candidate refs for `core_claim_and_evidence_chain_ref`, `figure_contract_ref`, `reference_selection_ref`, `style_brief_ref`, `candidate_artifact_ref`, `critic_review_ref`, `final_size_inspection_ref`, `source_preservation_ref`, and `domain_owner_gate_ref`.
5. Run an AI/VLM or human visual critic pass before owner consumption. The critic should check semantic claim fit, reference-style adherence, label readability at final size, overlap, panel hierarchy, visual drift, and source/evidence preservation.

This policy adapts current external patterns from `scientific-agent-skills`, `nature-skills`, `PaperVizAgent` / `PaperBanana`, `FigMirror`, and a minimal scientific plotting skill. It does not install those runtimes, import their agents, or authorize publication readiness. MAS or the consuming domain owner still decides accept / reject / route-back.
