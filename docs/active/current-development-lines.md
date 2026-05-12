# OPL Current Development Lines

Status: `active_support`
Owner: `One Person Lab`
Purpose: define the framework-first content-level development map after OPL became the stage-led, Agent executor-based family agent framework.
Machine boundary: this is a human-readable execution map. Machine truth remains in `contracts/`, source code, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, and real workspace / app evidence.

## Current Conclusion

OPL development is framework-first. Do not make a single domain delivery soak the primary acceptance path before the framework and domain migration are in place.

Current calibration on 2026-05-12: the framework control plane, shared contracts, local queue / attempt ledger, Temporal provider code, typed closeout gate, domain skeleton discovery, stage plane discovery, domain-memory descriptor index, runtime snapshot, Aion stage-attempt workbench, and repo-native Temporal live residency proof have landed as readable/testable surfaces. `opl family-runtime residency proof --provider temporal --live` now starts a Temporal test server and real workers, proves completed and blocked attempts, preserves human/user/resume signals, and re-queries the completed attempt after worker restart. Fresh CLI checks show `opl agents list --json` at `aligned_count=3`, `missing_count=0`, `drift_detected_count=0`; `opl stages list --json` at `resolved_planes_count=3`, `stages_count=18`; and `opl domain-memory list --json` at `resolved_memory_descriptor_count=3`, `missing_memory_descriptor_count=0`. This means MAS/MAG/RCA descriptor-level migration is complete. The agents read model now separates `descriptor_readiness`, `physical_skeleton_layout_audit`, and `production_closure_gaps`, so physical skeleton audit / gap projection is an OPL-side readable surface rather than an inferred doc note. Work that should wait for platform maturity is production Temporal service provisioning/readiness, long-running domain soak, memory body apply receipts, physical skeleton reorganization, and physical deletion of old surfaces.

Current order:

1. Finish OPL as the full agent framework: stage attempts, provider runtime, typed queue, wakeup, retry/dead-letter, approval/human gate, receipts/projections, and shared lifecycle/index primitives.
2. Migrate MAS/MAG/RCA into OPL-admitted domain agents: standard skeleton, stage descriptors, sidecar export/dispatch, owner receipts, artifact locators, projection builders, authority refs, and direct skill equivalence.
3. Partition, migrate, preserve, or retire new and old capabilities: domain truth stays in domains; framework-generic lifecycle/index/restore/retention moves into OPL; local diagnostics and evidence surfaces are explicitly downgraded.
4. Retire old Hermes/Gateway/frontdoor/local-manager/default-compat wording and duplicate UI/runtime entries after replacement proof exists.
5. Then run real E2E / domain soak through MAS paper lines, MAG grant stages, RCA visual stages, and the OPL App workbench to validate the target shape.

“Test last” here means real provider/domain/app acceptance. Every code, contract, provider, projection, or cleanup step still needs focused tests and repo-native verification as it lands.

Structural quality gate semantics are now split by enforcement layer. `sentrux gate .` baseline drift is advisory: it should still emit OPL quality details for triage, but it does not fail the structural lane by itself. Line budget and explicit `sentrux check .` rules remain blocking. Documentation and status updates should preserve that split instead of treating all Sentrux output as the same class of failure.

## Content Lines

| order | line | current owner | what is active now |
| --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | OPL roadmap + Runtime Manager / provider contracts | complete Temporal/provider readiness, stage attempt ledger, workflow/activity/signal/query, typed queue, retry/dead-letter, human gate, receipt/projection, and shared lifecycle/index primitives |
| `2` | `domain_framework_migration` | OPL + MAS/MAG/RCA domain repos | descriptor / manifest alignment is complete across the three active domains; OPL now exposes physical skeleton audit / gap projection in the agents read model; next work is path compatibility audit and continuous proof that direct skill and OPL-hosted paths share owner receipts; workspace/runtime receipt parity and provider-hosted soak remain production-closure work |
| `3` | `feature_partition_and_retirement` | OPL active docs + domain owner docs | lift framework-generic capabilities into OPL, keep domain-specific truth in domains, retire old Hermes/Gateway/frontdoor/local-manager/MDS-default surfaces |
| `4` | `opl_app_runtime_workbench` | OPL App / Runtime Manager | show provider readiness, stage attempts, domain status, human gates, action receipts, artifact refs, and source refs without rewriting domain truth; the stage-attempt workbench now exposes read-only grouping, filter keys, attention counters, and memory-ref counters for App panels |
| `5` | `domain_soak_and_acceptance` | Domain repos + OPL provider | run real or controlled MAS/MAG/RCA soak after migration and prove progress delta, quality-gate movement, human gate, stop-loss, or typed blocker |
| `6` | `new_domain_admission` | OPL domain admission + candidate domain repos | admit new domains only through skeleton/descriptor/locator/authority boundaries, not old gateway/frontdoor routes |

## Merge And Retirement Rules

| content type | destination |
| --- | --- |
| stage attempts, provider runtime, queue, signal/query, retry/dead-letter, approval transport | OPL framework / Runtime Manager |
| lifecycle ledger, artifact locator/index, retention, restore proof, migration ledger, workspace lifecycle metadata | OPL framework primitive |
| MAS study truth, publication gate, evidence/review ledger, manuscript/package authority | MAS |
| MAG grant strategy, fundability / proposal quality, specific aims authority | MAG |
| RCA visual direction, creative artifact generation, review/export gate | RCA |
| old gateway/frontdoor/Hermes-first/local-manager default wording | retire / history / compatibility archive after replacement proof |
| external framework learning | references only until promoted into contracts/source/active owner docs |

## Priority Rules

1. Framework-first: the full OPL agent framework is a prerequisite for domain migration and real domain soak.
2. Migration before acceptance: real soak should validate the migrated target shape, not a path that is about to be retired.
3. Cleanup is migration closeout: old default paths should not linger indefinitely; deletion requires no default caller, no fixture/provenance need, and replacement diagnostic/history link.
4. App workbench follows the framework: the App displays framework/provider plus domain owner receipts and read-only stage-attempt grouping/filter metadata; it is not a second truth source or a domain action loop.
5. Domain authority does not move out: OPL may hold refs, receipts, attempt history, projection, and lifecycle metadata; quality, domain truth, and final artifact authority stay in domains.

## Done Signals

| line | done signal |
| --- | --- |
| `opl_framework_foundation` | OPL provider/framework can stably carry stage attempts, queue/wakeup, retry/dead-letter, approval/human gate, receipts/projections, and shared lifecycle/index primitives. |
| `domain_framework_migration` | MAS/MAG/RCA are admitted through shared skeleton/descriptor/locator/receipt surfaces; repo-source layout and real workspace/runtime receipt proofs are complete; direct and OPL-hosted paths share domain owner receipts. |
| `feature_partition_and_retirement` | old default dependencies, legacy compatibility, duplicate UI, and stale manager surfaces are classified, replaced, and retired; retained items have explicit owner and use. |
| `opl_app_runtime_workbench` | OPL App can read provider, stage attempt, domain progress, human gate, artifact refs, source refs, safe action receipts, and stage-attempt grouping/filter summaries in one workbench. |
| `domain_soak_and_acceptance` | MAS/MAG/RCA each produce real or controlled progress delta, quality-gate movement, human gate, stop-loss, or typed blocker in the migrated target shape. |

## Planning Doc Placement

- `docs/active/`: current execution maps and runtime/activation/shared-boundary support docs.
- `docs/active/development-document-portfolio*`: development-document portfolio entry; read it before absorbing, retaining, downgrading, retiring, or archiving old development content.
- `docs/references/runtime-substrate/`: runtime/provider/executor references, roadmap, Temporal provider support plan, and legacy migration material.
- `docs/public/`: public roadmap and product direction.
- `docs/specs/`: active runtime/product-boundary spec entry; when empty, use the core five, `docs/active/`, the runtime-substrate roadmap, and machine-readable contracts.
- `docs/history/`: retired routes, old plans, dated snapshots, compatibility / frontdoor / gateway archives.

If content still decides what happens next or what counts as done, keep it in `docs/active/` or the current roadmap owner. If it is background or comparison, use `docs/references/`. If it only preserves historical context, use `docs/history/`.
