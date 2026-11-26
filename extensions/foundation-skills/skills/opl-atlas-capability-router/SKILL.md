---
name: opl-atlas-capability-router
description: "Use when routing across OPL agent, capability, tool-card, source, and owner catalogs; choosing owner, source, skill, or connector refs; diagnosing catalog ambiguity; and preparing refs-only route packets. Helps keep catalog registry, lifecycle index, and refs graph as program authority."
---

# OPL Atlas Capability Router

Use this skill to choose a refs-only route through OPL Atlas catalogs. Keep the output as a route packet for the owning program or domain; do not turn catalog lookup into authority acceptance.

## Boundary

- Treat catalog registry, lifecycle index, and refs graph as program authority.
- Treat this skill as the AI routing layer for selecting likely owner, source, Skill, connector, tool-card, and capability refs from those catalogs.
- Keep catalog ambiguity visible. If refs disagree or are stale, report the ambiguity and route to the catalog owner instead of inventing a canonical answer.
- Do not write or sign owner receipts, typed blockers, domain truth, artifact authority, runtime queues, quality verdicts, or readiness claims.
- Do not treat a catalog match, lifecycle entry, refs graph edge, connector descriptor, tool-card, or route packet as owner acceptance, runtime ready, domain ready, release ready, or artifact authority.

## AI-first / Contract-light Semantics

- Use Atlas catalogs, indexes, and refs graphs only for identity, capability kind, graph edges, lifecycle state, recovery, and verification.
- Keep elastic routing judgment in this Skill: choose likely owner/source/Skill/tool-card refs, diagnose ambiguity, reject noisy alternatives, and shape route packets.
- If catalog signals conflict, preserve ambiguity and route to the catalog owner instead of manufacturing a canonical answer.

## Workflow / Checklist

1. Classify the request as `owner_route`, `source_route`, `skill_route`, `connector_route`, `tool_card_route`, `capability_route`, `ambiguity_diagnosis`, or `refs_only_packet`.
2. Start from the smallest relevant selector: explicit user ref, agent id, capability id, source id, owner id, tool-card id, connector id, or current workspace context.
3. Inspect catalog evidence in authority order:
   - catalog registry for identity and current owner;
   - lifecycle index for active, deprecated, candidate, or retired state;
   - refs graph for allowed edges among agent, capability, tool-card, source, owner, Skill, and connector.
4. Choose refs only when they are current enough for the task and the graph edge explains why they belong together.
5. Diagnose ambiguity before routing:
   - multiple active owners for one capability;
   - stale lifecycle state;
   - missing source or owner edge;
   - tool-card side effect not matched to authority;
   - connector or Skill ref outside the allowed owner path.
6. Prepare the smallest route packet with selected refs, rejected alternatives, ambiguity notes, no-authority flags, and the next legal owner action.
7. If the packet would require owner acceptance, artifact mutation, runtime queue work, typed blocker creation, or readiness status, stop at refs-only and name the owner surface that must consume it.

## Output Shape

Return:

- `route_intent`: one request class and the selector used;
- `selected_refs`: owner/source/Skill/connector/tool-card/capability refs with catalog evidence;
- `rejected_refs`: close alternatives and why they were not selected;
- `ambiguity`: missing, stale, conflicting, or over-authoritative catalog signals;
- `route_packet`: refs-only handoff and next legal owner action;
- `authority_boundary`: explicit no-authority caveat covering owner receipts, typed blockers, domain truth, artifact authority, and readiness claims;
- `verification`: catalog registry, lifecycle index, refs graph, or route readback the program owner should rerun.
