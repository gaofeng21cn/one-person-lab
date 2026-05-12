# OPL Development Document Portfolio

Status: `active_development_portfolio`
Owner: `One Person Lab`
Purpose: classify OPL development documents by current content role after the 2026-05-11 framework-first reset, and define what should be merged, retained, downgraded, retired, or archived.
Machine boundary: human-readable development portfolio only. Machine-readable truth belongs in `contracts/`, source code, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, App/workbench projections, and verified evidence.

## Current Conclusion

OPL development documents should no longer be read as a queue where every old plan must be executed end to end. The current mainline is framework-first:

1. Build OPL as the complete stage-led framework with Agent executors as the minimum execution unit.
2. Migrate MAS/MAG/RCA into that framework as OPL-admitted domain agents while preserving direct skill path equivalence.
3. Partition old and new functionality by content: lift framework-generic capability into OPL, keep domain truth inside each domain repo, and downgrade historical diagnostics or compatibility material.
4. Retire old Hermes-first, Gateway-era, direct-entry, local-manager, and MDS-default routes after replacement evidence exists.
5. Use the App workbench and real domain soak to validate the target shape after migration.

The rule is: keep useful content, merge it into the current owner surface, and stop treating old documents as active whole-document backlogs. Old routes remain provenance, migration references, or tombstones.

## Execution Order

| Order | Content line | Current owner docs | Meaning now | Done signal |
| --- | --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | [OPL Current Development Lines](./current-development-lines.md), [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md), [Temporal provider plan](../references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md) | Stage attempt, provider runtime, typed queue, wakeup, retry/dead-letter, human gate, receipt/projection, and shared lifecycle/index primitives. | Provider-backed stage attempts are recoverable, queryable, projected, and do not write domain truth. |
| `2` | `domain_framework_migration` | [Domain-Agent Admission Contract](./opl-domain-onboarding-contract.md), [Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md), OPL roadmap | MAS/MAG/RCA expose skeletons, descriptors, sidecar receipts, artifact locators, projection builders, and authority refs. | Direct and OPL-hosted paths share domain owner receipts; OPL only holds refs, projection, and attempt history. |
| `3` | `feature_partition_and_retirement` | This doc, [Documentation Portfolio](../docs_portfolio_consolidation.md), runtime-substrate index, domain owner docs | Classify old development content as retain, merge, lift, degrade, retire, or archive. | Old default dependencies, compatibility aliases, obsolete managers, and duplicate UI entries have replacement evidence and owner decisions. |
| `4` | `opl_app_runtime_workbench` | [OPL Runtime Manager Target](../references/runtime-substrate/opl-runtime-manager-target.md), current-support / App references | Productize provider readiness, stage attempts, domain status, human gates, receipts, artifact refs, and source refs. | The App/workbench shows framework/provider state plus domain owner receipts without becoming a second truth source. |
| `5` | `domain_soak_and_acceptance` | OPL roadmap plus MAS/MAG/RCA status/program/runtime owner docs | Run real or controlled domain soak on the migrated target shape. | MAS/MAG/RCA produce real progress delta, quality gate movement, human gate, stop-loss, or typed blocker. |
| `6` | `new_domain_admission` | [Domain-Agent Admission Contract](./opl-domain-onboarding-contract.md), domain-admission references | Admit new domains only through the standard skeleton/descriptor/locator/authority boundary. | No new domain copies the old Gateway-era direct-entry route. |

## Portfolio Map

| Document or group | Current role | Disposition |
| --- | --- | --- |
| `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md` | Core five active truth | Keep as active truth. References, roadmaps, and old plans stay subordinate to them. |
| [Documentation Portfolio](../docs_portfolio_consolidation.md) | Repo docs lifecycle owner | Keep as the governance entry. This document only owns the development-document portfolio. |
| [OPL Current Development Lines](./current-development-lines.md) | Framework-first content-level execution map | Keep as the current development-line entry. Use it before executing old plan content. |
| [OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md) | Master framework roadmap | Keep as the master roadmap. Do not add another parallel master plan. |
| [Temporal provider plan](../references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md) | Provider-backed runtime technical plan | Keep as active support for Temporal/provider details only. |
| `docs/active/opl-domain-onboarding-contract*` | Domain-agent admission support | Keep active. It owns skeleton, descriptor, locator, and authority review support. |
| `docs/active/opl-runtime-naming-and-boundary-contract*` | Runtime naming and boundary support | Keep active. It owns Codex-default, provider-backed, managed-runtime, and MDS retirement terminology. |
| `docs/active/shared-*` | Shared foundation/runtime/domain support | Keep active. These docs define shared language without moving domain truth into OPL. |
| `docs/public/*` | Public product-direction support | Keep public support. User-facing docs are not implementation backlogs. |
| `docs/history/process/specs/2026-04-20-*`, `docs/history/process/specs/2026-04-21-*` | Archived Product API / ACP spec history | The eight-resource product model, session-runtime-first pivot, shell/projection boundary, and domain-truth boundary were absorbed into the core five, current development lines, domain onboarding, and the framework roadmap; the whole documents are no longer active specs. |
| Runtime-substrate current docs | Provider, Runtime Manager, and framework references | Keep support references. Current machine behavior must still come from contracts, source, CLI/API, and runtime evidence. |
| Runtime-substrate history docs | Hermes-first, direct-entry, Gateway-era, host-agent-only, managed-runtime checklist, MAS cutover, and online-platform migration material | Absorbed content lives in active owners; whole historical documents live in `docs/history/runtime-substrate/`. Do not expand them as active planning. |
| `docs/references/current-support/*` | GUI, install, release, test, quality support | Keep current support, subordinate to source/contracts/CLI/API truth. |
| `docs/references/operating-governance/*` | Governance, quality, operator, memory, audit, publish support | Keep governance support; legacy-derived gateway ids must be described as compatibility/audit context. |
| `docs/references/convergence-governance/*` | Family convergence and external learning references | Keep support references; promote durable rules into active owner docs. |
| `docs/references/domain-admission/*` | Candidate/admission/tranche records | Keep admission support and dated records; formal gates live in active onboarding docs. |
| `docs/references/examples-corpora/*` | Example corpora and operating records | Keep as evidence corpora, not current behavior oracles. |
| `docs/history/**` | Retired routes, dated snapshots, process archives, tombstones | Keep as history. These files explain provenance; they do not drive current implementation. |

## Merge Rules

| Old content type | Current owner |
| --- | --- |
| Stage attempt, workflow/activity/signal/query, typed queue, wakeup, retry/dead-letter, human gate, provider receipt | OPL framework / Runtime Manager / Temporal provider docs / machine contracts |
| Domain skeleton, stage descriptor, sidecar export/dispatch, artifact locator, projection builder, authority refs | OPL domain admission plus domain repo owner surfaces |
| Product-entry taxonomy, handoff envelope, entry surface / operator loop split | Active contracts, public docs, domain admission; old direct-entry boards remain provenance |
| MAS paper truth, publication gate, evidence/review ledger, manuscript/package authority | MAS |
| MAG grant strategy, fundability / proposal quality, specific aims authority | MAG |
| RCA visual direction, visual artifacts, review/export gates | RCA |
| MDS / DeepScientist backend facts | MAS provenance / parity oracle / explicit archive import, never OPL default runtime |
| Hermes-first online substrate or Hermes Kernel as default product runtime | Legacy/optional/proof/evaluation reference; current default is provider-backed framework |
| Gateway-era federation/routed-action routes | History / compatibility / tombstone |
| Dated boards, activation packages, one-off closeouts | `docs/history/process/**` or corresponding references/history, with useful conclusions promoted to current owner docs |
| External framework learning | References / convergence-governance; absorb vocabulary, contract patterns, provenance, and gate methods only |

## Retirement And Archive Rules

1. Merge useful conclusions into the current owner first: the core five, current development lines, stage-led roadmap, active contracts, Runtime Manager target, or domain owner docs.
2. If an old document still has inbound links or provenance value, add a lifecycle note or classify it in an index before moving it.
3. Move a file into `docs/history/**` only after `rg` checks inbound links, machine-readable refs, and historical audit needs.
4. Historical commands, absolute paths, and old states may remain only inside provenance or tombstone context.
5. Active docs must never present legacy wording as the current default path.
6. Document archiving is not implementation cleanup. Code aliases, compatibility paths, manager surfaces, and UI entries require replacement evidence and verification before deletion.

## Old Plans No Longer Executed Whole

| Old plan | Current handling |
| --- | --- |
| Hermes-first product-entry / kernel integration | No longer the target runtime mainline. Retained as historical decision and optional/proof background. |
| Family lightweight direct-entry rollout board | No longer a whole active backlog. Retain entry taxonomy, handoff envelope, and entry/operator boundary lessons. |
| OPL vertical online-agent platform roadmap | No longer the master roadmap. Useful content is absorbed by the stage-led framework and public roadmap. |
| MAS top-level cutover board | No longer the current MAS migration order. MAS migration now follows OPL framework-first plus the MAS program portfolio. |
| Host-agent runtime contract | No longer an independent target-runtime definition. Useful Codex-default wording is absorbed by runtime boundary, domain onboarding, and framework roadmap docs; the whole document lives in `docs/history/runtime-substrate/`. |
| Managed runtime migration checklist | No longer the active migration queue. R1-R8 readiness dimensions were absorbed into the runtime boundary; per-repository progress judgments remain historical snapshots. |
| Product API / ACP native specs | Not implementation queues; archived under `docs/history/process/specs/` as historical formation context only. |

## Verification

Docs-only consolidation:

- `git diff --check`
- `rg` spot-checks for new links and stale references
- no tests that assert Markdown prose

Contract/source/runtime/App changes:

- run the focused tests for the touched line
- run repo-native verification when contracts, schemas, CLI/API, or runtime semantics change
- real provider/domain soak must produce provider receipts, domain owner receipts, progress delta / human gate / stop-loss / typed blocker evidence
