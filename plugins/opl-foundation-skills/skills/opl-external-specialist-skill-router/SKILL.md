---
name: opl-external-specialist-skill-router
description: "Use when the default OPL/domain professional skills do not cover a specialist tool, source, workflow, or method and Codex should route through OPL Connect external-skills search/inspect/sync to select one approved external skill. Keeps large external skill libraries out of default context and returns refs-only handoff without owner receipts, typed blockers, domain verdicts, or readiness claims."
---

# OPL External Specialist Skill Router

Use this source-only Skill when the current OPL/domain skill pack does not
cover a specialist capability and the agent needs one approved external Skill
candidate.

## Boundary

- OPL Connect owns the external skill source registry, `search`, `inspect`,
  selective `sync`, and sync receipts.
- This Skill is only a router. It decides whether to ask OPL Connect for one
  external Skill candidate and how to hand candidate refs back.
- Domain truth stays with the domain owner. External Skill refs are candidate
  capability refs, not owner acceptance, quality verdicts, or readiness.
- Approved sources such as `K-Dense-AI/scientific-agent-skills` are source
  registries for search/inspect/sync. Approval does not make the full library
  default context, a default install, or broad Codex metadata.
- Do not bulk-load an external library, source tree, package index, or full
  Skill catalog into context.
- Do not sign owner receipts, create typed blockers, issue domain verdicts,
  mutate artifacts, write runtime truth, or claim readiness.

## AI-first / Contract-light Semantics

- Use external-skill catalogs and Connect modules only for source identity, capability kind, candidate refs, sync receipts, recovery, and verification.
- Keep elastic specialist routing in this Skill: decide whether the default pack is insufficient, inspect one candidate, and hand refs back to the domain owner.
- If no single candidate fits, report the gap and owner route instead of syncing broad libraries or creating compatibility aliases.

## Trigger

Use this Skill only after the current default skill pack is insufficient, for
example:

- a scientific, scientific-agent, writing, design, data, workflow, compute, citation, imaging,
  chemistry, office, finance, or automation tool needs specialist instructions;
- a domain route-back candidate explicitly says an external specialist Skill may
  be needed;
- the user names a tool or method that is not present in the installed default
  pack.

Do not use it for work already covered by the active domain professional Skills.

## Workflow

1. Classify the requested capability and name the default Skill that was checked
   or why the default pack is insufficient.
2. Run or request OPL Connect `external-skills search` with the smallest query
   and, when known, the approved source selector.
3. Inspect one plausible candidate before sync. Read its skill card, category,
   keywords, risk flags, trigger policy, license, source ref, and no-authority
   boundary.
4. Sync only that selected Skill when the current workspace or quest needs it.
   Do not bulk-sync a source, expose all source metadata, or add a new physical
   router Skill for a small category.
5. Hand off source refs, selected Skill id, inspect evidence, optional sync
   receipt ref, residual risk, and the next legal domain-owner action.

## Command Pattern

```bash
opl connect external-skills search --query "<tool-or-method>" --source <approved-source> --json
opl connect external-skills inspect --skill <source>/<skill-id> --json
opl connect external-skills sync --skill <source>/<skill-id> --scope workspace --target-workspace <workspace-root> --json
```

Use `--source kdense-scientific-agent-skills` or its approved alias `kdense` for
the current K-Dense scientific-agent-skills source. Use `--source-root` only as a
maintainer override for an already available local checkout. Use `list` only for
maintainer source-index review; it is not the normal task entry because it can
expose the whole external library metadata set.

## Output Shape

Return:

- `default_pack_gap`: what the installed/default professional pack does not cover;
- `search_query`: the exact external-skills query or selector;
- `inspected_candidate`: one Skill id with source, license, category, keywords,
  trigger policy, and risk flags;
- `sync_decision`: `no_sync_needed`, `sync_one_skill`, or `blocked`;
- `refs_only_handoff`: candidate refs, optional sync receipt ref, owner route,
  and residual risk;
- `authority_boundary`: no owner receipts, no typed blockers, no domain verdicts,
  no artifact authority, no runtime truth, and no readiness claims.

Scientific routing note: this is also the canonical route for rare scientific tools, databases, workflows, and methods. There is no separate scientific alias Skill; use the smallest query and approved source selector instead of exposing another compatibility entry or creating one physical Skill per small scientific module.
