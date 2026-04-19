# OPL Gateway Contracts

This directory is the repository-local materialization of the `G1` federation contract for `One Person Lab`.

It freezes the machine-readable gateway surfaces that later discovery and routed-action layers consume.

## Shared-foundation ownership boundary

These contract and reference artifacts live in the shared-foundation materialization layer only.
`OPL` owns the top-level contract language, indexing, and cross-domain reuse rules frozen here, but domain gateways and domain harnesses still own runtime execution, canonical truth, review truth, and publication truth once a routed request crosses the gateway boundary.
This directory therefore materializes gateway surfaces for discoverability / reviewability / acceptance alignment.
The `Unified Harness Engineering Substrate` named around this layer remains the shared architectural umbrella language for the ecosystem.
Within that umbrella, the long-running runtime portion is now converging into the `Shared Runtime Contract`, while the cross-domain formal behavior portion is converging into the `Shared Domain Contract`.
For the broader ownership split, see [Shared Foundation](../../docs/shared-foundation.md) and [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md).

## Current baseline and absorbed follow-on alignment

As of `2026-04-11`, the active public `opl-mainline` has already moved into the family-level front desk / hosted-entry hardening line around the local GUI front desk, the local `opl` shell shortcuts, and `opl web`, while the repo-tracked formal entry still remains the `Phase 1` local `TypeScript CLI`-first gateway contract baseline that reads the frozen contract artifacts in this directory.
The current public default path is `GUI front desk -> Codex -> OPL gateway surfaces`: `opl frontdesk bootstrap --path <workspace>` prepares the local `OPL Atlas` Desktop shell, the local web front desk stays as a companion surface, and this directory freezes the gateway surfaces behind that front door without declaring Codex as the product runtime substrate owner.
The completed `Phase 1 / G2 release-closeout` has already closed the `G2 stable public baseline` into one stable repo-tracked public entry.
That repo-tracked baseline therefore remains the current `OPL` formal entry contract and public system surface even though the public mainline has already absorbed the minimal admitted-domain federation package and continued into the front-desk layer above it.
The completed repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` remains closed at the planning-contract layer: this directory freezes the planning gate / planning-level contract around `route_request`, `build_handoff_payload`, and `audit_routing_decision`. The only allowed successful handoff target remains `domain_gateway`, the no-bypass rule still forbids direct domain-harness targeting, and `routed-actions.schema.json` stays in the planning-dependency layer.
The repo-tracked `Phase 1` candidate-domain closeout order is frozen as `Review Foundry` then `Thesis Foundry`: both candidate paths remain below domain admission, `G2` discovery readiness, `G3` routed-action readiness, and handoff readiness.
The absorbed predecessor gate is `Phase 1 exit + next-stage activation package freeze`, and the current `Phase 2 / Minimal admitted-domain federation activation package` is already absorbed into repo-tracked top-level truth for the already admitted `MedAutoScience` and `RedCube AI` domain surfaces. No new active follow-on tranche is currently open; another central sync only becomes truthful when an admitted-domain repository lands a new absorbed delta or the central reference surfaces drift. Runtime ownership continues to stay with the admitted domains.
The current repo-tracked formal entry at the OPL layer therefore remains the local `TypeScript CLI`-first / gateway contract surface.
The current user-facing front door above that contract now centers on the GUI front desk plus its local shell shortcuts and `opl web` companion surface, including the hosted-friendly `opl frontdesk manifest`, `opl frontdesk entry-guide`, `opl frontdesk readiness`, `opl frontdesk domain-wiring`, `opl frontdesk hosted-bundle`, and related handoff surfaces.
Within that front door, `interaction_mode=codex` and `execution_mode=codex` are the default public modes, while `Hermes-Agent` stays available only as an explicit alternate mode for interactive continuation and selected executor routing.
Within that front-desk set, `frontdesk-readiness` is the operator-facing derived board for local service status, hosted pilot readiness, and domain-owned `product_entry_readiness / preflight` truth; it stays downstream of existing manifest / binding / runtime surfaces and must not become a second truth source.
Within the same set, `frontdesk-entry-guide` is the family-level machine-readable entry layer for AI / GUI shells: it freezes workspace taxonomy, domain workspace mapping, and per-domain start guidance without replacing domain-owned manifests.
`opl frontdesk manifest` and the `opl web` startup payload now freeze the shell bootstrap order explicitly: `opl frontdesk entry-guide` is the primary discovery surface, `opl frontdesk readiness` plus `opl frontdesk domain-wiring` are follow-on alignment surfaces, and `opl status dashboard` is kept as the operator debug / aggregate surface rather than the default shell entry source.
If a higher-level shell is later branded as `OPL Cortex`, that remains a product-shell name above these repo-internal `frontdesk_*` contract ids unless a separate rename tranche is explicitly frozen.
`Paperclip` remains outside the primary front door as an optional downstream control-plane bridge, and `LibreChat` remains outside the primary front door as an optional compatibility / fallback lane.
That delivery target keeps the existing top-level contract language executable through local GUI and CLI surfaces, while any honest upstream `Hermes-Agent` rollout remains a domain-side migration target rather than a current OPL-layer fact.

## Current reference-sync companions

These reference-grade companions freeze the current cross-repo status picture and GUI-first / Codex-default runtime wording while keeping this directory aligned with the authoritative public surfaces.
This active companion set is anchored to `2026-04-11` and carries the responsibility of keeping the latest admitted-domain absorbed deltas visible in top-level OPL reference-sync surfaces without promoting those references into public-mainline truth.

- [Ecosystem Status Matrix](../../docs/references/ecosystem-status-matrix.md) — Chinese-only internal reference for the current four-repo stage/status picture
- [Contract Convergence v1 Execution Board](../../docs/references/contract-convergence-v1-execution-board.md) — Chinese-only internal reference for the current unified program, active phase, and exit criteria
- [Codex-default Host-Agent Runtime Contract](../../docs/references/host-agent-runtime-contract.md) — Chinese-only internal reference for the current local default runtime wording
- [Family Executor Adapter Defaults](../../docs/references/family-executor-adapter-defaults.md) — Chinese-only internal reference for the current family default executor route and Hermes-native guardrails
- [Four-Repo Executor Follow-up And Hermes Evaluation](../../docs/references/four-repo-executor-follow-up-and-hermes-evaluation.md) — Chinese-only internal reference for the remaining executor-unification work and Hermes-agent evaluation

## Historical migration references

These references are kept for historical migration and offboarding context only. The active execution mainline continues to be documented through the current GUI-first / Codex-default public surfaces.

- [Development Operating Model](../../docs/references/development-operating-model.md) — Chinese-only historical migration reference for `Codex Host` / `OMX` operating discipline
- [Runtime Alignment Taskboard](../../docs/references/runtime-alignment-taskboard.md) — Chinese-only historical reference for the retired four-repo convergence checklist
- [OMX historical archive](../../docs/history/omx/README.md) — Chinese-only historical archive entry

## Governing documents

- [OPL Gateway Federation](../../docs/gateway-federation.md)
- [OPL Gateway Federation（中文）](../../docs/gateway-federation.zh-CN.md)
- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Operating Model](../../docs/operating-model.md)
- [OPL Operating Model（中文）](../../docs/operating-model.zh-CN.md)
- [Shared Runtime Contract](../../docs/shared-runtime-contract.md)
- [Shared Runtime Contract（中文）](../../docs/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/shared-domain-contract.md)
- [Shared Domain Contract（中文）](../../docs/shared-domain-contract.zh-CN.md)
- [Shared Foundation](../../docs/shared-foundation.md)
- [Shared Foundation（中文）](../../docs/shared-foundation.zh-CN.md)
- [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md)
- [Shared Foundation Ownership（中文）](../../docs/shared-foundation-ownership.zh-CN.md)
- [OPL Gateway Contract Surface](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Gateway Contract Surface（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Routed Action Gateway（中文）](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.md)
- [OPL Domain Onboarding Contract（中文）](../../docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../../docs/references/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../../docs/references/opl-publish-promotion-operating-surface.md)
- [OPL Publish / Promotion Operating Surface（中文）](../../docs/references/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Candidate Domain Backlog](../../docs/references/opl-candidate-domain-backlog.md)
- [OPL Candidate Domain Backlog（中文）](../../docs/references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../docs/references/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Acceptance Test Spec（中文）](../../docs/references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Rollout](../../docs/references/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/references/opl-gateway-rollout.zh-CN.md)
- [OPL Public Surface Index](../../docs/opl-public-surface-index.md)
- [OPL Public Surface Index（中文）](../../docs/opl-public-surface-index.zh-CN.md)
- [OPL Task Map](../../docs/task-map.md)
- [OPL Task Map（中文）](../../docs/task-map.zh-CN.md)
- [中文说明](./README.zh-CN.md)

## Companion examples

- [OPL Gateway Example Corpus](../../docs/references/opl-gateway-example-corpus.md) — canonical illustrative contract-level compositions across the frozen gateway layers
- [OPL Routed-Safety Example Corpus](../../docs/references/opl-routed-safety-example-corpus.md) — canonical illustrative safety walkthroughs for the explicit non-success G3 routing states
- [OPL Operating Example Corpus](../../docs/references/opl-operating-example-corpus.md) — canonical standalone operating-record examples for the frozen P5.M1 / P5.M2 surfaces

These corpora are companion references only. They do not replace the governing contracts in this directory.

## Companion reference surfaces

- [OPL Candidate Domain Backlog](../../docs/references/opl-candidate-domain-backlog.md) — reference-only machine-readable admission-blocker backlog for the current under-definition workstreams
- [OPL Phase 1 Exit Activation Package](../../docs/references/opl-phase-1-exit-activation-package.md) — reference-grade freeze for the current `Phase 1` exit thresholds, deferred surface, and minimal next-stage decision
- [OPL Minimal admitted-domain federation activation package](../../docs/references/opl-minimal-admitted-domain-federation-activation-package.md) — reference-grade activation freeze for the minimum stronger federation wording across already admitted domains only
- [OPL Surface Lifecycle Map](../../docs/references/opl-surface-lifecycle-map.md) — derived machine-readable lifecycle view across the frozen gateway / operating / supporting surfaces
- [OPL Surface Authority Matrix](../../docs/references/opl-surface-authority-matrix.md) — derived machine-readable authority split across the frozen OPL surfaces and linked domain public-entry surfaces
- [OPL Surface Review Matrix](../../docs/references/opl-surface-review-matrix.md) — derived machine-readable review obligations across the frozen OPL public, contract, and supporting surfaces
- [Paperclip Control Plane Operator Guide](../../docs/references/paperclip-control-plane-operator-guide.md) — optional downstream Paperclip bridge operator loop, bootstrap, and sync guide

These backlog and mapping surfaces stay reference-only companions to the governing contracts in this directory.

## Files

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — shared routing vocabulary groups plus frozen routing rules
- [`handoff.schema.json`](./handoff.schema.json) — JSON Schema for the frozen G1 handoff payload
- [`routed-actions.schema.json`](./routed-actions.schema.json) — planning dependency kept at the closeout boundary of `Phase 1 / G3 thin handoff planning freeze hardening`; it is a planning-level contract artifact, not a launcher, and does not mean the current mainline has entered a routed-action runtime
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — JSON Schema for the machine-readable domain onboarding readiness gate
- [`family-executor-adapter-defaults.json`](./family-executor-adapter-defaults.json) — machine-readable freeze for the current family default executor-adapter route and its hard guardrails
- [`managed-runtime-three-layer-contract.json`](./managed-runtime-three-layer-contract.json) — machine-readable freeze for the shared `runtime_owner / domain_owner / executor_owner` envelope plus supervision / recovery surface locators
- [`paperclip-control-plane.schema.json`](./paperclip-control-plane.schema.json) — JSON Schema for the optional downstream `OPL -> Paperclip` control-plane bridge surface, including config/binding/status/bootstrap/task/gate/sync payloads
- [`governance-audit.schema.json`](./governance-audit.schema.json) — JSON Schema for the frozen P5.M1 governance / audit operating contract
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — JSON Schema for the frozen P5.M2 publish / promotion operating contract
- [`acceptance-matrix.json`](./acceptance-matrix.json) — declarative acceptance matrix for the frozen gateway and operating surfaces
- [`public-surface-index.json`](./public-surface-index.json) — machine-readable index of current authoritative OPL public surfaces and linked domain public entries
- runtime-derived `frontdesk-*` discovery surfaces intentionally stay implemented in code rather than frozen as static JSON files in this directory; they remain downstream machine-readable surfaces built from the governing contracts above
- [`task-topology.json`](./task-topology.json) — machine-readable top-level task topology across admitted and under-definition OPL workstreams
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — machine-readable admission-blocker backlog for the current under-definition workstreams
- [`phase-1-exit-activation-package.json`](./phase-1-exit-activation-package.json) — machine-readable freeze for the current `Phase 1` exit thresholds, deferred surface, and minimal next-stage activation decision
- [`minimal-admitted-domain-federation-activation-package.json`](./minimal-admitted-domain-federation-activation-package.json) — machine-readable activation freeze for the minimum stronger federation wording across already admitted domains only
- [`operating-record-catalog.json`](./operating-record-catalog.json) — machine-readable reference catalog for the frozen P5.M1 / P5.M2 operating record kinds
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — machine-readable derived lifecycle map for the frozen gateway / operating / supporting surfaces
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — machine-readable derived authority matrix for the frozen OPL surfaces and linked domain public-entry surfaces
- [`surface-review-matrix.json`](./surface-review-matrix.json) — machine-readable derived review matrix for the frozen OPL public, contract, and supporting surfaces

## Shared managed runtime companion

- [OPL Managed Runtime Three-Layer Contract](../../docs/references/opl-managed-runtime-three-layer-contract.md) — reference-grade owner envelope for admitted-domain managed runtime, supervision, and executor boundaries

## Frozen current mappings

- `research_ops` routes to `medautoscience`
- `presentation_ops` routes to `redcube`
- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may route to `redcube`, but does not automatically equal `presentation_ops`

## Boundary rules

- `OPL` remains the top-level gateway and federation surface.
- Domain gateways remain independently usable after routing.
- Domain harnesses stay below domain gateways.
- Canonical truth ownership stays with the domains that own it.
- Successful routing continues to flow through domain gateways only.

## Current scope

This directory includes:

- admitted registry / contract artifacts for the workstreams and domains whose boundaries are already frozen in the public G1 contract
- derived / reference-only task-topology material that may mention under-definition workstreams without admitting them into `G1`, `G2`, or `G3`
- derived / reference-only candidate-domain backlog material that records missing admission boundaries without inventing placeholder domains or routed targets
- no separate candidate-domain-definition contract surface beyond the current `task-topology + candidate-domain-backlog + domain-onboarding` composition unless a real missing boundary is first proven

Planned workstreams such as `Grant Foundry`, `Review Foundry`, and `Thesis Foundry` remain on candidate-definition paths until their domain boundaries are explicitly frozen.
If the current public docs mention `Grant Foundry -> Med Auto Grant`, that mention should be framed as an active grant-domain repository line whose top-level federation admission / handoff wording is still separately gated; it does not automatically count as an admitted, discovery-ready, routed-action-ready, or handoff-ready surface.

## Materialization note

The prose docs describe canonical contract intent using `opl/...` surface names.
This directory is the concrete materialization for the current repository while preserving the same contract shape.
