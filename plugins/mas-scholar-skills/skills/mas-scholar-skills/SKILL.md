---
name: mas-scholar-skills
description: "Operate MAS Scholar Skills as an OPL Connect pointer to the canonical external mas-scholar-skills source repo for MAS medical-paper capability discovery, workspace/quest skill sync, refs-only candidate packages, and MAS owner-gated authority boundaries. Use from the MAS overlay or MAS stage operating prompts when Codex needs MAS Scholar Skills guidance without claiming runtime, domain, quality, artifact, owner receipt, or production authority."
---

# MAS Scholar Skills

This entry is a thin OPL-side pointer. The canonical source for professional
`medical-*` Skill bodies is the external `mas-scholar-skills` repository,
normally resolved as a sibling checkout such as
`/Users/gaofeng/workspace/mas-scholar-skills`. Do not infer missing MAS Skill
capability from the physical contents of this `one-person-lab/plugins` mirror.

Use OPL Connect to inspect and sync the canonical source into a workspace or
quest:

```bash
opl connect skills --domain mas-scholar-skills --json
opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace_root> --json
opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest <quest_root> --json
```

Framework readback commands remain available for the OPL-owned contract bridge:

```bash
opl scholar-skills list --json
opl scholar-skills inspect --module <module_id> --json
opl scholar-skills prepare --module <module_id> --json
opl scholar-skills run-context --module <module_id> --json
opl scholar-skills invoke --module <module_id> --json
opl scholar-skills receipt --module <module_id> --json
opl scholar-skills materialize --module <module_id> --json
opl scholar-skills runtime-prepare --module <module_id> --json
opl scholar-skills runtime-run-context --module <module_id> --json
opl scholar-skills validate --json
opl scholar-skills doctor --json
```

Active module ids are `mas-scholar-skills.display`,
`mas-scholar-skills.tables`, `mas-scholar-skills.stats`,
`mas-scholar-skills.lit`, `mas-scholar-skills.write`,
`mas-scholar-skills.review`, `mas-scholar-skills.submit`, and
`mas-scholar-skills.data`. Their display names are Scholar Display, Scholar Tables,
Scholar Stats, Scholar Lit, Scholar Write, Scholar Review, Scholar Submit, and
Medical Data Governance. The actual specialist playbooks live in the canonical
source repo and are installed as refs-only workspace/quest copies.

Boundary:

- authority false
- MAS owner gate
- can_write_domain_truth: false
- can_sign_owner_receipt: false
- can_create_typed_blocker: false
- refs-only
- materialized_candidate_package

This pointer, local plugin mirror, CLI readback, synced workspace copy, or test
fixture cannot sign MAS owner receipts, create typed blockers, mutate artifact
authority, write domain truth, or claim runtime, domain, quality, publication,
or production readiness.

Display gallery refs remain human review and visual-audit preview refs only:

- `gallery/medical-display/medical_display_gallery.pdf`
- `gallery/medical-display/display_pack_gallery_quality_audit.md`
- `display_pack_gallery_quality_audit.md`
