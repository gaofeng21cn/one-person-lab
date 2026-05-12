**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Role

`OPL` is the stage-led, Agent executor-based agent runtime framework for a one-person research lab.
It uses `Codex CLI` as the default concrete executor inside a stage, organizes large work through expert-like stages, and owns the framework surfaces for activation, stage attempts, typed queues, wakeup, receipts, recovery, projection, and shared modules/contracts/indexes while domain repositories continue to own their domain truth.

Today the public `OPL` surface centers on:

- `Codex CLI` as the default concrete executor path for `opl`, `opl exec`, and `opl resume`
- explicit `OPL` activation for family-level semantics, domain discovery, stage selection, and runtime switching
- provider-backed stage runtime for queue, wakeup, attempt, receipt, approval, retry/dead-letter, and projection
- shared modules, contracts, and indexes above `MedAutoScience`, `MedAutoGrant`, and `RedCube AI`
- `OPL Runtime Manager` as the product control plane over the configured family runtime provider
- Rust native helper / index work limited to native assistance and indexed discovery, not domain truth or execution ownership

## Active Route

The active route for `OPL` has two equivalent entry paths:

- direct path: `Codex-default executor -> explicit OPL activation -> selected domain agent entry`
- durable path: `Codex-default executor -> explicit OPL activation / typed family queue -> configured family runtime provider when durable orchestration is needed -> selected domain agent entry`

Current work on that route stays focused on four priorities:

1. Keep `Codex CLI` as the default executor unless a user explicitly activates a different runtime.
2. Make family-level sessions, progress, artifacts, and shared indexes the current `OPL` truth surface rather than a web/API shell.
3. Treat `OPL Runtime Manager` as the product control plane and typed dispatch layer over the configured family runtime provider, not as a domain scheduler, domain truth owner, quality owner, artifact owner, or concrete executor owner.
4. Keep public docs, contracts, and admitted-domain wording aligned with the real family topology.

The current execution order lives in [OPL Current Development Lines](../active/current-development-lines.md): finish the OPL framework foundation first, use real MAS paper lines as the first production-closure acceptance path, keep MAS/MAG/RCA descriptor migration and direct-skill parity from regressing, retire legacy operator wording with no-default-caller evidence, productize the OPL App Runtime Workbench, then run MAG/RCA controlled soaks and broader domain acceptance after the MAS owner-chain proof is stable.

## Near-Term Priorities

- keep legacy gateway and federation wording available only as provenance/reference material while promoting the runtime/activation model to the mainline
- keep `Unified Harness Engineering Substrate`, `Shared Runtime Contract`, and `Shared Domain Contract` scoped as shared-above-domain surfaces
- keep provider-backed stage runtime honest, with Temporal as the production substrate candidate and `Hermes-Agent` retained only as migration/proof context
- keep public help, current docs, and operator-facing guidance free of default Hermes/Gateway/frontdoor/local-manager wording; retained names must be explicit legacy/provenance/diagnostic/history/fixture references
- keep future hosted and desktop entry work anchored to the same runtime truth that drives the Codex-default executor path
- keep candidate domains moving through explicit definition and onboarding lanes

## Family Shape

The current family shape is already clear enough to guide the roadmap:

- `MedAutoScience` owns the `Research Ops` domain entry, workflow, runtime truth, and harness
- `MedAutoGrant` owns the admitted `Grant Ops` domain entry, workflow, runtime truth, and harness
- `RedCube AI` owns the visual-deliverable domain entry, workflow, runtime truth, and harness
- `ppt_deck` remains the clearest current bridge into `Presentation Ops`
- `IP Ops` stays on the definition and onboarding lane for `IP Foundry` / `Med Auto Patent`
- `Award Ops` stays on the definition and onboarding lane for `Award Foundry` / `Med Auto Award`
- `Thesis Ops` stays on the definition and onboarding lane for `Thesis Foundry` / `Med Auto Thesis`
- `Review Ops` stays on the definition and onboarding lane for `Review Foundry` / `Med Auto Review`

## Historical Records And Reference Surfaces

Historical activation packages, gateway/federation material, phase freezes, convergence boards, and migration traces stay in `docs/references/` and `docs/history/`.
The root roadmap keeps only the current family route and the reading path for active readers.

Use these reference surfaces when you need deeper context:

- [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md)
- [OPL Governance / Audit Operating Surface](../references/operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../references/operating-governance/opl-publish-promotion-operating-surface.md)
- [Ecosystem Status Matrix](../references/convergence-governance/ecosystem-status-matrix.md)
- [Runtime substrate history archive](../history/runtime-substrate/README.md)
- Legacy Gateway/Federation archives under `docs/history/compatibility/` only when a provenance or diagnostic question explicitly requires them

## Evaluation Criteria

The roadmap is healthy when readers can immediately understand:

- `OPL` is the stage-led, Agent executor-based framework owner for activation, stage attempts, queue/wakeup, receipts, recovery, projection, and shared modules/contracts/indexes
- admitted domains keep their own authority under that shell
- the default executor remains `Codex CLI`, while `OPL Runtime Manager` is the product control plane over the configured family runtime provider
- the Temporal production provider now has a minimal verifiable loop: workflow/activity/signal/query, worker lifecycle contract, typed closeout ingestion, fail-closed readiness, `stage_attempt_workbench` projection, and repo-native Temporal test-server plus real-worker residency proof; external production service provisioning/readiness and domain soak remain next-stage acceptance work
- MAS paper-line read-only closeout proof has landed, while provider-hosted guarded apply and long-running MAS owner-chain proof remain the next production-closure gates
- legacy `OPL Gateway`, `opl web`, `Product API`, Hermes default, local-manager, and AionUI-first-shell material is read as provenance, diagnostic, history, or fixture context unless a current core document promotes it
- future hosted and desktop work continues the same runtime/activation truth surfaces
- new workstreams are entering as explicit domain surfaces with clear boundaries
