**English** | [中文](./README.zh-CN.md)

# OPL Reference Index

This index manages only the Layer 3 reference-grade documents under `docs/references/`.
These files exist for audit, acceptance, convergence, examples, migration, and historical tracing. They are not the default public reading path for the current `OPL` truth surface.

If you need to understand what `OPL` is today, go back to:

- [docs/README.md](../README.md)
- [project.md](../project.md)
- [status.md](../status.md)
- [architecture.md](../architecture.md)
- [invariants.md](../invariants.md)
- [decisions.md](../decisions.md)
- current runtime / product-boundary specs under [`docs/specs/`](../specs/)

## 1. Convergence And Status Alignment

- [GUI mainline pivot to AionUI](./convergence-governance/2026-04-21-gui-mainline-pivot-to-aionui.md)
- [Contract convergence v1 decision note](./convergence-governance/contract-convergence-v1-decision-note.md)
- [Family shared release maintenance](./convergence-governance/family-shared-release-maintenance.md)
- [Family user-facing maturity roadmap](./convergence-governance/family-user-facing-maturity-roadmap.md)
- [Four-repo docs sync summary, 2026-04-14](./convergence-governance/four-repo-doc-series-sync-summary-2026-04-14.md)
- [OPL positioning and convergence lessons](./convergence-governance/opl-positioning-convergence-lessons.zh-CN.md)
- [OPL GUI shell adapter boundary](./current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL fresh install and GUI first-launch testing](./current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [Docker WebUI deployment reference](./current-support/opl-docker-webui-deployment.md)
- [OPL default skill ecosystem reference](./current-support/opl-default-skill-ecosystem.md)
- [OPL release and Packages modular distribution reference](./current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL quality details reference](./current-support/opl-quality-details.md)
- `series-doc-governance-checklist.md`
- `four-repo-doc-intake-template.md`
- `contract-convergence-v1-execution-board.md`
- `ecosystem-status-matrix.md`
- `four-repo-executor-follow-up-and-hermes-evaluation.md`
- [Central federation reference sync board](./opl-phase-2-central-reference-sync-board.md)
- [Admitted-domain delta intake refresh record](./opl-phase-2-admitted-domain-delta-intake-refresh.md)
- [Ecosystem sync owner line record](./opl-phase2-ecosystem-sync-owner-line.md)

## 2. Runtime / Substrate / Migration References

- `host-agent-runtime-contract.md`
- [Hermes-Agent truth reset and target state](./runtime-substrate/hermes-agent-truth-reset-and-target-state.md)
- [Managed runtime migration readiness checklist](./runtime-substrate/managed-runtime-migration-readiness-checklist.md)
- [OPL managed runtime three-layer contract](./runtime-substrate/opl-managed-runtime-three-layer-contract.md)
- [OPL Runtime Manager target](./runtime-substrate/opl-runtime-manager-target.md)
- `hermes-agent-runtime-substrate-benchmark.md`
- `family-executor-adapter-defaults.md`
- `hermes-agent-executor-evaluation.md`
- `family-orchestration-contract-absorb-crewai.md`
- `family-product-entry-and-domain-handoff-architecture.md`
- `family-lightweight-direct-entry-rollout-board.md`
- `mas-top-level-cutover-board.md`
- `opl-product-entry-and-hermes-kernel-integration.md`
- `opl-vertical-online-agent-platform-roadmap.md`

## 3. Gateway / Admission / Surface Audit References

- `opl-gateway-rollout.md`
- `opl-gateway-rollout.zh-CN.md`
- `opl-gateway-acceptance-test-spec.md`
- `opl-gateway-acceptance-test-spec.zh-CN.md`
- `opl-candidate-domain-backlog.md`
- `opl-candidate-domain-backlog.zh-CN.md`
- `opl-candidate-workstream-tranche-closeout.md`
- `opl-candidate-workstream-tranche-closeout.zh-CN.md`
- `opl-surface-lifecycle-map.md`
- `opl-surface-lifecycle-map.zh-CN.md`
- `opl-surface-authority-matrix.md`
- `opl-surface-authority-matrix.zh-CN.md`
- `opl-surface-review-matrix.md`
- `opl-surface-review-matrix.zh-CN.md`
- `opl-governance-audit-operating-surface.md`
- `opl-governance-audit-operating-surface.zh-CN.md`
- `opl-publish-promotion-operating-surface.md`
- `opl-publish-promotion-operating-surface.zh-CN.md`
- `opl-minimal-admitted-domain-federation-activation-package.md`
- `opl-minimal-admitted-domain-federation-activation-package.zh-CN.md`

## 4. Examples, Corpora, And Operating Records

- `opl-gateway-example-corpus.md`
- `opl-gateway-example-corpus.zh-CN.md`
- `opl-routed-safety-example-corpus.md`
- `opl-routed-safety-example-corpus.zh-CN.md`
- `opl-operating-example-corpus.md`
- `opl-operating-example-corpus.zh-CN.md`
- `opl-operating-record-catalog.md`
- `opl-operating-record-catalog.zh-CN.md`

## 5. Retired Gateway / Federation Compatibility References

- `../gateway-federation.md`
- `../gateway-federation.zh-CN.md`
- `../opl-federation-contract.md`
- `../opl-federation-contract.zh-CN.md`
- `../opl-read-only-discovery-gateway.md`
- `../opl-read-only-discovery-gateway.zh-CN.md`
- `../opl-routed-action-gateway.md`
- `../opl-routed-action-gateway.zh-CN.md`
- `../../contracts/opl-gateway/README.md`
- `../../contracts/opl-gateway/README.zh-CN.md`

These prose files remain in `docs/` for audit and historical compatibility. Machine-readable contracts, tests, scripts, and runtime dashboards should refer to contract/schema/source surfaces or semantic `human_doc:*` ids; they should not pin these prose paths as stable machine interfaces.

## 6. Retired Frontdoor-Era And Historical Migration References

- `development-operating-model.md`
- `runtime-alignment-taskboard.md`
- `opl-frontdoor-delivery-board.md`
- [Frontdoor legacy archive](../history/frontdoor-legacy/README.md)
- [OMX historical archive](../history/omx/README.md)
- [Process history archive](../history/process/README.md)

## Usage Rules

- These files may explain why a freeze happened, but they must not override `README*`, `docs/README*`, or the core maintainer working set.
- `series-doc-governance-checklist.md` is the repo-scoped governance checklist for keeping this repository aligned with the four-repo series; the dated sync summary records one concrete cross-repo intake round.
- `four-repo-doc-intake-template.md` is the reusable central intake form for documenting scope, affected repositories, verification, and cleanup across a cross-repo docs round.
- New reference docs should be filed into the six buckets above.
- `docs/**` and `README*` are human-readable surfaces. Do not make scripts, contracts, tests, or runtime dashboards depend on their concrete paths; use stable contract files or semantic surface ids instead.
- Completed one-off plans, generated process specs, and superseded design drafts should move to [Process history](../history/process/README.md), not stay in active reference or specs layers.
- Retired gateway/federation corpus stays here or in the paired compatibility surfaces and must not be treated as the current implementation basis.
- Retired `frontdoor`-era material stays here for audit only and must not be treated as the current implementation basis.
- Retired OMX-era prompt, longrun, and worktree material has been removed from active references; use the historical archive only as a tombstone, not as an execution guide.
