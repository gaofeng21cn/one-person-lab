# OPL Domain Boundary Cleanup 2026-07-07

Owner: One Person Lab
Purpose: Record the structural cleanup that keeps OPL as the agent development, runtime, and testing foundation while moving domain elasticity back to domain packs, skills, profiles, or connector receipts.
State: active_reference
Machine boundary: Source, contracts, CLI/API behavior, tests, runtime ledgers, and domain-owned manifests remain the machine truth. This note is a human navigation surface and does not claim runtime readiness, domain readiness, publication readiness, grant readiness, visual export readiness, App release readiness, Brand L5, or production readiness.

## Boundary

OPL owns substrate surfaces: stage route intake, autonomy supervision, owner-evidence receipt transport, connector ABI, package descriptors, runtime environment bridge, owner-answer projection lookup, and profile/adaptor registries.

Domain agents and specialist packs own domain truth: paper progress, grant truth, visual/export verdicts, citation judgment, professional Skill source, artifact bodies, owner receipts, typed blockers, human gates, and readiness decisions.

## Landed Cleanup

| Area | Before | Landed shape |
| --- | --- | --- |
| Runway route intake | MAS paper mission carrier looked like the canonical route surface. | `domain_route` canonical fields and readback ids are first-class; MAS paper mission remains a compatibility profile. |
| Runway autonomy supervisor | Paper autonomy naming dominated the supervisor readback. | Domain autonomy supervisor canonical surface ids are exposed; paper autonomy remains a legacy command/profile. |
| Ledger sustained consumption | MAG manifest sustained-consumption file and command held the implementation body. | Owner-evidence sustained-consumption is the canonical ledger/action/CLI implementation; MAG command is a legacy re-export/alias. |
| Stagecraft owner-answer projection | MAS publication handoff path was hard-coded in the lookup. | Generic owner-answer projection profiles drive lookup; MAS publication handoff is one profile. |
| Stagecraft transition ingestion | Visual transition refs were RCA-only. | Visual transition adapter profile controls ref prefixes; RCA remains the default compatibility profile. |
| Kernel managed shell | Domain clean-runner roots and readonly commands were a fixed internal array. | Domain clean-runner profiles are injectable/extendable while preserving the current defaults. |
| Connect scientific connectors | Provider receipts could be mistaken for citation truth. | Scientific/PubMed readbacks expose ownership boundaries and no citation/domain truth flags. |
| ScholarSkills Pack bridge | OPL contract could be misread as professional Skill source truth. | Contract, pack readbacks, and docs separate OPL descriptors/sync/env bridge from MAS Scholar Skills professional truth. |

## Remaining Intentional Compatibility

The following names can remain as compatibility carriers until active callers retire:

- `paper_mission/*` route input and `paper-autonomy` CLI alias.
- `mag-manifest-sustained-consumption` CLI alias.
- MAS publication handoff owner-answer profile.
- RCA visual transition default adapter profile.

These compatibility carriers must not be used as new canonical OPL ontology.

## Forbidden Claims

Do not claim any of these from this cleanup alone:

- domain ready, paper progress, publication ready, grant ready, visual/export ready;
- owner receipt, typed blocker, human gate, or quality verdict creation by OPL;
- runtime ready, App release ready, Brand L5, or production ready;
- citation truth from PubMed/Crossref/OpenAlex provider metadata;
- MAS Scholar Skills source completeness from OPL plugin mirror contents.
