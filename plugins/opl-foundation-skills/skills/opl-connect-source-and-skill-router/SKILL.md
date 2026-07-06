---
name: opl-connect-source-and-skill-router
description: "Use for OPL Connect external skill/source search-inspect-sync routing, connector receipt debugging, single-skill sync decisions, and source refs/no-authority review. Helps Codex decide whether an external source or skill is needed, which candidate to inspect or sync, whether connector metadata or receipts are too risky, and how to hand candidate refs to a domain owner without claiming domain truth, quality verdict, owner acceptance, or readiness."
---

# OPL Connect Source And Skill Router

Use this skill when a task needs OPL Connect to find, inspect, debug, or selectively sync an external source, connector, package descriptor, or Codex Skill.

Optional helper: `kernel.py` provides deterministic source/ref normalization, request classification, handoff skeleton, and forbidden-claim lint helpers.
It is stdlib-only, writes nothing, performs no network or subprocess calls, and does not claim domain truth, owner acceptance, or readiness.

## Boundary

- Treat OPL Connect as the program owner for registry lookup, source and skill search, candidate inspection, selective sync, API normalization, and connector invocation receipt candidates.
- Treat this Skill as the AI judgment layer: decide whether external source or skill help is needed, which candidate fits the task and owner, whether the risk is too high, whether exactly one Skill should be synced, and how results should be handed to the owning domain.
- Keep domain truth with the domain owner. Connect output and this Skill's judgment are candidate refs only.

## Router Workflow

1. Classify the request as `source_search`, `skill_search`, `candidate_inspect`, `single_skill_sync`, `connector_receipt_debug`, or `refs_only_review`.
2. Start with search or an explicit selector. Use list/index views only for source review; do not turn a whole external library into default context.
3. Inspect the smallest plausible candidate before syncing. Check owner, source path or URL, capability kind, sync scope, expected target, authority boundary, and stale or missing source signals.
4. Prefer one-skill sync. Sync only the selected Skill or refs-only subset needed for the current workspace or quest unless the domain owner explicitly requires a package-level install.
5. For connector receipt debug, compare requested resource, normalized refs, invocation parameters, errors, no-authority flags, and receipt candidate path. Classify failures as access, normalization, receipt construction, sync target mismatch, or authority overclaim.
6. Hand off `source_refs`, `candidate_refs`, `sync_receipt_ref`, `connector_invocation_ref`, `no_authority_flags`, `owner_route`, residual risk, and the next legal owner action.

## Forbidden Claims

- Do not full-install external skill libraries, source repos, runtime packages, caches, generated assets, or connector payloads by default.
- Do not treat connector metadata, registry entries, descriptor status, sync success, cache existence, package payload presence, or invocation receipts as domain truth, quality verdict, owner acceptance, artifact authority, typed blocker, human gate, release readiness, production readiness, or domain readiness.
- Do not write domain truth, owner receipts, typed blockers, runtime queues, provider attempts, artifact bodies, quality verdicts, or live readiness surfaces from this Skill.
- Do not promote a contract module, source index, or reference pack into a real Codex Skill unless there is a true stage prompt or professional Skill wrapper with its authority boundary stated.
