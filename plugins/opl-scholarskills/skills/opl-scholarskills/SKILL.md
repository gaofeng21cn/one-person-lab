---
name: opl-scholarskills
description: "Operate OPL ScholarSkills as a Codex skill pack for repo-tracked scholarly capability modules, standard opl scholar-skills CLI readbacks, refs-only materialized candidate packages, and MAS owner-gated authority boundaries. Use when Codex needs ScholarSkills module guidance without claiming runtime, domain, quality, artifact, owner receipt, or production authority."
---

# OPL ScholarSkills

Use OPL ScholarSkills as a repo-tracked Codex entry for scholarly capability modules. Treat `contracts/opl-framework/scholar-skills-capability-modules.json` and `src/scholar-skills.ts` as the source of truth.

## Boundary

- Keep the authority false boundary explicit: `can_write_domain_truth: false`, `can_write_runtime_state: false`, `can_mutate_artifact_body: false`, `can_sign_owner_receipt: false`, and `can_create_typed_blocker: false`.
- Use ScholarSkills outputs as refs-only candidates. Do not present CLI readbacks, materialized packages, or tests as runtime-ready, domain-ready, quality verdict, publication readiness, artifact authority, owner receipt, typed blocker, or production readiness.
- Respect the MAS owner gate: MAS or another domain owner must consume candidate refs and issue the owner receipt, typed blocker, reviewer receipt, route-back, or domain artifact mutation. Do not write MAS, Yang, runtime DB, queue, owner receipt, typed blocker, or domain truth surfaces from this skill.

## Modules

The ten OPL ScholarSkills modules are:

- `opl.scholarskills.display` - Scholar Display
- `opl.scholarskills.tables` - Scholar Tables
- `opl.scholarskills.stats` - Scholar Stats
- `opl.scholarskills.omics` - Scholar Omics
- `opl.scholarskills.lit` - Scholar Lit
- `opl.scholarskills.write` - Scholar Write
- `opl.scholarskills.review` - Scholar Review
- `opl.scholarskills.submit` - Scholar Submit
- `opl.scholarskills.data` - Scholar Data
- `opl.scholarskills.intake` - Scholar Intake

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
