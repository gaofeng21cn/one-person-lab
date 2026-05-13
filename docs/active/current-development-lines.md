# OPL Current Development Lines

Status: `active_support`
Owner: `One Person Lab`
Purpose: define the framework-first content-level development map after OPL became the stage-led family agent framework with Agent executors as the minimum execution unit.
Machine boundary: this is a human-readable execution map. Machine truth remains in `contracts/`, source code, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, and real workspace / app evidence.

## Current Conclusion

OPL development remains framework-first, but the current production-closeout path is now MAS-first: prove that OPL can host the MAS paper-autonomy path without writing MAS truth, then generalize MAG/RCA controlled soaks after the MAS owner chain is visible.

Current calibration on 2026-05-13: the framework control plane, shared contracts, local queue / attempt ledger, Temporal provider code, typed closeout gate, domain skeleton discovery, stage plane discovery, domain-memory descriptor index, unified domain-agent descriptor, runtime snapshot, Aion stage-attempt workbench, Codex runner repo/test harness, and repo-native Temporal live residency proof have landed as readable/testable surfaces. Fresh `./bin/opl` CLI checks show `agents list --json` at `aligned_count=3`, `missing_count=0`, `drift_detected_count=0`, `physical_skeleton_evidence_observed_count=2`, `physical_skeleton_audit_pending_count=1`; `stages list --json` at `resolved_planes_count=3`, `stages_count=18`; `domain-memory list --json` at `resolved_memory_descriptor_count=3`, `missing_memory_descriptor_count=0`; and `agents descriptors --json` as the unified entry that aggregates entry, skeleton, stage, action, memory, skill, runtime/session/progress/artifact refs, and authority boundaries in one read model with the same physical-skeleton evidence summary. MAS/MAG/RCA descriptor-level migration is complete, and maintainers no longer have to reconstruct a domain agent’s overall state from separate subcommands. The agents read model separates `descriptor_readiness`, `physical_skeleton_layout_audit`, `physical_skeleton_evidence`, and `production_closure_gaps`; MAS/MAG currently have repo-source anchor evidence observed, RCA remains pending. OPL only aggregates refs and does not write domain truth or perform domain repo physical migration.

The same calibration added MAS read-only paper-line closeout projection across three real paper lines: DM002 -> `ai_reviewer_re_eval`, DM003 -> `artifact_delta`, and Obesity -> `artifact_delta`; all three set `writes_performed=false` and explicitly forbid OPL writes to `publication_eval/latest.json`, `controller_decisions/latest.json`, `current_package`, publication quality verdicts, and memory bodies. DM002 also carries the consumed `publication_route_memory_seed__negative_result_stoploss` ref plus MAS-owned writeback receipt refs. That is enough for read-only OPL consumption of MAS owner refs; it is not yet production provider-hosted guarded apply.

This Lane F plus Lane E OPL-side operator closeout owns only documentation, public/help wording, residue scan, and no-default-caller guardrails. It does not touch OPL production runtime core files. The active path remains `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime when durable orchestration is needed -> selected domain-agent entry`. The goal is to keep old Hermes/Gateway/frontdoor/local-manager/default-compat surfaces out of the active/default path while retaining explicit legacy, provenance, diagnostic, history, and fixture references.

Work that should wait for platform maturity is external production Temporal service provisioning/readiness, long-running Codex/domain activity soak, provider-hosted guarded apply, memory body apply receipts, physical skeleton reorganization, and physical deletion of old surfaces.

Current order:

1. Finish OPL as the full agent framework: stage attempts, provider runtime, typed queue, wakeup, retry/dead-letter, approval/human gate, receipts/projections, and shared lifecycle/index primitives.
2. Use real MAS paper lines as the first production acceptance path: start from read-only closeout projection, then let MAS owner gates decide any provider-hosted guarded apply. Valid results include artifact delta, publication gate replay, AI reviewer update, route decision, human gate, stop-loss, or typed blocker.
3. Keep MAS/MAG/RCA admitted through the shared skeleton/descriptor/locator/receipt surfaces. MAG/RCA controlled soaks are delayed, but descriptor, stage-plane, domain-memory, and direct-skill parity must not regress.
4. Partition, migrate, preserve, or retire new and old capabilities: domain truth stays in domains; framework-generic lifecycle/index/restore/retention moves into OPL; local diagnostics and evidence surfaces are explicitly downgraded.
5. Retire old Hermes/Gateway/frontdoor/local-manager/default-compat wording and duplicate UI/runtime entries after replacement proof and no-default-caller evidence exist.
6. Productize the OPL App Runtime Workbench around provider, stage-attempt, domain-owner receipt, memory-ref, human-gate, and rejected-writeback projections.
7. Then run MAG/RCA controlled soaks and broader domain acceptance after the MAS owner-chain proof is stable.

“Test last” here means real provider/domain/app acceptance. Every code, contract, provider, projection, or cleanup step still needs focused tests and repo-native verification as it lands.

Structural quality gate semantics are now split by enforcement layer. `sentrux gate .` baseline drift is advisory: it should still emit OPL quality details for triage, but it does not fail the structural lane by itself. Line budget and explicit `sentrux check .` rules remain blocking. Documentation and status updates should preserve that split instead of treating all Sentrux output as the same class of failure.

## Content Lines

| order | line | current owner | what is active now |
| --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | OPL roadmap + Runtime Manager / provider contracts | complete Temporal/provider readiness, stage attempt ledger, workflow/activity/signal/query, typed queue, retry/dead-letter, human gate, receipt/projection, and shared lifecycle/index primitives |
| `2` | `mas_paper_autonomy_acceptance` | OPL provider + MAS owner surfaces | current primary production-closure line. Three MAS real paper lines already have read-only typed closeout projection; next work is provider-backed attempt -> MAS sidecar -> typed closeout -> MAS owner receipt under guarded apply, yielding progress delta or typed blocker without forbidden writes |
| `3` | `domain_framework_migration` | OPL + MAS/MAG/RCA domain repos | descriptor / manifest alignment is complete across the three active domains; `opl agents descriptors` is now the maintainer total entry, while `opl agents inspect`, `opl stages`, `opl actions`, and `opl domain-memory` remain topic drilldowns. OPL now exposes physical skeleton evidence refs / gap projection in the agents read model; current evidence is MAS/MAG observed and RCA pending. Next work is RCA anchor evidence, path compatibility audit, and continuous proof that direct skill and OPL-hosted paths share owner receipts. MAG/RCA controlled soak is delayed, but descriptor/index parity must not regress |
| `4` | `feature_partition_and_retirement` | OPL active docs + domain owner docs | lift framework-generic capabilities into OPL, keep domain-specific truth in domains, and retire old Hermes/Gateway/frontdoor/local-manager/MDS-default active-path residue through no-default-caller evidence |
| `5` | `opl_app_runtime_workbench` | OPL App / Runtime Manager | show provider readiness, stage attempts, domain status, human gates, action receipts, artifact refs, source refs, memory refs, and rejected writebacks without rewriting domain truth; the stage-attempt workbench now exposes read-only grouping, filter keys, attention counters, and memory-ref counters for App panels |
| `6` | `domain_soak_and_acceptance` | Domain repos + OPL provider | MAS finishes real paper-line read-only / guarded apply evidence first; MAG/RCA controlled grant / visual stage attempts follow after that proof is stable |
| `7` | `new_domain_admission` | OPL domain admission + candidate domain repos | admit new domains only through skeleton/descriptor/locator/authority boundaries, not old gateway/frontdoor routes |

## Merge And Retirement Rules

| content type | destination |
| --- | --- |
| stage attempts, provider runtime, queue, signal/query, retry/dead-letter, approval transport | OPL framework / Runtime Manager |
| lifecycle ledger, artifact locator/index, retention, restore proof, migration ledger, workspace lifecycle metadata | OPL framework primitive |
| MAS study truth, publication gate, evidence/review ledger, manuscript/package authority | MAS |
| MAG grant strategy, fundability / proposal quality, specific aims authority | MAG |
| RCA visual direction, creative artifact generation, review/export gate | RCA |
| old gateway/frontdoor/Hermes-first/local-manager default wording | retire / history / compatibility archive after replacement proof and no-default-caller scan |
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
| `mas_paper_autonomy_acceptance` | Read-only acceptance is satisfied when three MAS real paper lines each expose OPL-ingestable typed closeout packets and MAS-owned evidence refs without forbidden writes. Production acceptance still requires provider-hosted guarded apply attempt query, MAS owner receipt, progress delta / human gate / stop-loss / typed blocker, and no-forbidden-write proof. |
| `domain_framework_migration` | MAS/MAG/RCA are admitted through shared descriptor/skeleton/locator/receipt surfaces; maintainers can inspect the whole integration through `opl agents descriptors` before drilling into stage/action/memory subcommands; MAS/MAG repo-source anchor evidence is observed, while RCA anchor evidence, real workspace/runtime receipt proofs, and direct/OPL-hosted owner-receipt parity still need follow-through. |
| `feature_partition_and_retirement` | old default dependencies, legacy compatibility, duplicate UI, and stale manager surfaces are classified, replaced, and retired; retained items have explicit owner and use; active-path residue tests prove default help/docs no longer advertise legacy operator paths. |
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
