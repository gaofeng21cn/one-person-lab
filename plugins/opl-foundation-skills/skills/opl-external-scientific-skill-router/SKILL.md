---
name: opl-external-scientific-skill-router
description: "Compatibility scientific specialization of opl-external-specialist-skill-router. Use when MAS/default professional skills do not cover a rare scientific tool, database, workflow, or method and Codex should route through OPL Connect external-skills search/inspect/sync to select one approved external skill. Keeps K-Dense-scale libraries out of default context and hands candidate refs back without owner receipts, typed blockers, domain verdicts, or readiness claims."
---

# OPL External Scientific Skill Router

This is the scientific compatibility specialization of
`opl-external-specialist-skill-router`. Use it when the user names a specialist
scientific tool, database, workflow, or method that is not covered by the
MAS/default professional Skill pack.

## Boundary

- Treat OPL Connect as the owner of external skill source registry,
  `search`, `inspect`, selective `sync`, and sync receipts.
- Treat this Skill as a thin router. It only decides whether to ask OPL
  Connect for one external Skill candidate and how to hand the refs back.
- For non-scientific specialist capability routing, use
  `opl-external-specialist-skill-router` instead.
- Keep MAS/domain truth with the domain owner. External Skill refs are
  candidate capability refs, not medical truth or owner acceptance.
- Do not load a full external library, K-Dense source tree, package index, or
  bulk Skill catalog into context.
- Do not sign owner receipts, create typed blockers, issue domain verdicts,
  mutate artifacts, write runtime truth, or claim readiness.

## Trigger

Use this Skill only after the default professional pack is insufficient, for
example:

- omics or single-cell tools such as `scanpy`, `pydeseq2`, or pathway
  enrichment;
- clinical AI, imaging, chemistry, survival modeling, citation API, workflow,
  or compute tools such as `pyhealth`, `pydicom`, `rdkit`,
  `scikit-survival`, `pyzotero`, or `nextflow`;
- a MAS route-back candidate explicitly says a specialist external Skill may
  be needed.

Do not use it for ordinary manuscript writing, review, figures, tables,
submission prep, statistical review, data governance, or other work already
covered by MAS professional Skills.

## Workflow

1. Classify the requested capability and name the default MAS Skill that was
   checked or why the default pack is insufficient.
2. Run or request OPL Connect `search` with the smallest query and, when
   known, the approved source selector.
3. Inspect one plausible candidate before sync. Read its skill card,
   category, keywords, risk flags, trigger policy, license, source ref, and
   no-authority boundary.
4. Sync only that selected Skill when the current workspace or quest needs it.
   Do not bulk-sync a source.
5. Hand off source refs, selected Skill id, inspect evidence, sync receipt ref
   if any, residual risk, and the next legal domain-owner action.

## Command Pattern

```bash
opl connect external-skills search --query "<tool-or-method>" --source kdense --json
opl connect external-skills inspect --skill kdense/<skill-id> --json
opl connect external-skills sync --skill kdense/<skill-id> --scope workspace --target-workspace <workspace-root> --json
```

When an approved source is registered without a local checkout, OPL Connect
materializes it into its external-skills cache on `search`, `inspect`, or
`sync`. Use `--source-root` only as a maintainer override for an already
available local checkout.

Use `list` only for maintainer source-index review. It is not the normal task
entry because it can expose the whole external library metadata set.

## Output Shape

Return:

- `default_pack_gap`: what the MAS/default professional pack does not cover;
- `search_query`: the exact external-skills query or selector;
- `inspected_candidate`: one Skill id with source, license, category, keywords,
  trigger policy, and risk flags;
- `sync_decision`: `no_sync_needed`, `sync_one_skill`, or `blocked`;
- `refs_only_handoff`: candidate refs, optional sync receipt ref, owner route,
  and residual risk;
- `authority_boundary`: no owner receipts, no typed blockers, no domain
  verdicts, no artifact authority, no runtime truth, and no readiness claims.
