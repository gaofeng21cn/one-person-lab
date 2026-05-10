**English** | [中文](./README.zh-CN.md)

# OPL Reference Index

This index manages support references under `docs/references/`.
These files exist for audit, acceptance, convergence, examples, migration, and historical tracing. They are not the default public reading path for the current `OPL` truth surface.

If you need to understand what `OPL` is today, go back to:

- [docs/README.md](../README.md)
- [project.md](../project.md)
- [status.md](../status.md)
- [architecture.md](../architecture.md)
- [invariants.md](../invariants.md)
- [decisions.md](../decisions.md)
- [docs_portfolio_consolidation.md](../docs_portfolio_consolidation.md)
- current runtime / product-boundary specs under [`docs/specs/`](../specs/)

## Directory Buckets

| Directory | Role |
| --- | --- |
| `current-support/` | Current operational support references. |
| `runtime-substrate/` | Runtime substrate, product-entry, Hermes, and Runtime Manager references. |
| `convergence-governance/` | Family convergence, docs lifecycle, intake templates, and status alignment. |
| `domain-admission/` | Candidate/admitted-domain backlog and tranche records. |
| `examples-corpora/` | Example corpora and operating records. |
| `operating-governance/` | Quality, operator projection, surface governance, review, and publish references. |

Do not add new loose Markdown files under `docs/references/` unless they are README files or a new top-level lifecycle index approved by [Documentation Portfolio](../docs_portfolio_consolidation.md).

## 1. Convergence And Status Alignment

- [GUI mainline pivot to AionUI](./convergence-governance/2026-04-21-gui-mainline-pivot-to-aionui.md)
- [Contract convergence v1 decision note](./convergence-governance/contract-convergence-v1-decision-note.md)
- [Docs lifecycle management playbook](./convergence-governance/docs-lifecycle-management-playbook.zh-CN.md)
- [Family docs lifecycle governance rollout, 2026-05-09](./convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md)
- [Series docs governance checklist](./convergence-governance/series-doc-governance-checklist.md)
- [Four-repo doc intake template](./convergence-governance/four-repo-doc-intake-template.md)
- [Contract convergence v1 execution board](./convergence-governance/contract-convergence-v1-execution-board.md)
- [Ecosystem status matrix](./convergence-governance/ecosystem-status-matrix.md)
- [Four-repo executor follow-up and Hermes evaluation](./convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation.md)
- [Family shared release maintenance](./convergence-governance/family-shared-release-maintenance.md)
- [Family user-facing maturity roadmap](./convergence-governance/family-user-facing-maturity-roadmap.md)
- [Four-repo docs sync summary, 2026-04-14](./convergence-governance/four-repo-doc-series-sync-summary-2026-04-14.md)
- [OPL positioning and convergence lessons](./convergence-governance/opl-positioning-convergence-lessons.zh-CN.md)
- [Family external orchestration learning board, 2026-04-30](./convergence-governance/family-external-orchestration-learning-board-2026-04-30.md)
- [OPL family stage control plane adoption plan](./convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md)

## 2. Current Support

- [OPL GUI shell adapter boundary](./current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL fresh install and GUI first-launch testing](./current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [Docker WebUI deployment reference](./current-support/opl-docker-webui-deployment.md)
- [OPL default skill ecosystem reference](./current-support/opl-default-skill-ecosystem.md)
- [OPL release and Packages modular distribution reference](./current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL quality details reference](./current-support/opl-quality-details.md)
- [OPL test lane governance reference](./current-support/opl-test-lane-governance.zh-CN.md)

## 3. Runtime / Substrate / Migration References

- [Codex-default host-agent runtime contract](./runtime-substrate/host-agent-runtime-contract.md)
- [Hermes-Agent truth reset and target state](./runtime-substrate/hermes-agent-truth-reset-and-target-state.md)
- [Managed runtime migration readiness checklist](./runtime-substrate/managed-runtime-migration-readiness-checklist.md)
- [OPL managed runtime three-layer contract](./runtime-substrate/opl-managed-runtime-three-layer-contract.md)
- [OPL Runtime Manager target](./runtime-substrate/opl-runtime-manager-target.md)
- [OPL stage-led agent framework roadmap](./runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Hermes-Agent runtime substrate benchmark](./runtime-substrate/hermes-agent-runtime-substrate-benchmark.md)
- [Family executor adapter defaults](./runtime-substrate/family-executor-adapter-defaults.md)
- [Hermes-Agent executor evaluation](./runtime-substrate/hermes-agent-executor-evaluation.md)
- [CrewAI absorb note](./runtime-substrate/family-orchestration-contract-absorb-crewai.md)
- [Family product-entry and domain handoff architecture](./runtime-substrate/family-product-entry-and-domain-handoff-architecture.md)
- [Family lightweight direct-entry rollout board](./runtime-substrate/family-lightweight-direct-entry-rollout-board.md)
- [MAS top-level cutover board](./runtime-substrate/mas-top-level-cutover-board.md)
- [OPL product-entry and Hermes kernel integration](./runtime-substrate/opl-product-entry-and-hermes-kernel-integration.md)
- [OPL vertical online-agent platform roadmap](./runtime-substrate/opl-vertical-online-agent-platform-roadmap.md)

## 4. Domain Admission References

- [OPL candidate domain backlog](./domain-admission/opl-candidate-domain-backlog.md)
- [OPL candidate domain backlog zh-CN](./domain-admission/opl-candidate-domain-backlog.zh-CN.md)
- [Candidate workstream tranche closeout](./domain-admission/opl-candidate-workstream-tranche-closeout.md)
- [Candidate workstream tranche closeout zh-CN](./domain-admission/opl-candidate-workstream-tranche-closeout.zh-CN.md)
- [Phase 1 exit activation package](./domain-admission/opl-phase-1-exit-activation-package.md)
- [Phase 1 exit activation package zh-CN](./domain-admission/opl-phase-1-exit-activation-package.zh-CN.md)
- [Central federation reference sync board](./domain-admission/opl-phase-2-central-reference-sync-board.md)
- [Admitted-domain delta intake refresh record](./domain-admission/opl-phase-2-admitted-domain-delta-intake-refresh.md)
- [Ecosystem sync owner line record](./domain-admission/opl-phase2-ecosystem-sync-owner-line.md)

## 5. Examples, Corpora, And Operating Records

- [OPL gateway example corpus](./examples-corpora/opl-gateway-example-corpus.md)
- [OPL gateway example corpus zh-CN](./examples-corpora/opl-gateway-example-corpus.zh-CN.md)
- [OPL routed-safety example corpus](./examples-corpora/opl-routed-safety-example-corpus.md)
- [OPL routed-safety example corpus zh-CN](./examples-corpora/opl-routed-safety-example-corpus.zh-CN.md)
- [OPL operating example corpus](./examples-corpora/opl-operating-example-corpus.md)
- [OPL operating example corpus zh-CN](./examples-corpora/opl-operating-example-corpus.zh-CN.md)
- [OPL operating record catalog](./examples-corpora/opl-operating-record-catalog.md)
- [OPL operating record catalog zh-CN](./examples-corpora/opl-operating-record-catalog.zh-CN.md)

## 6. Operating Governance References

- [Family domain quality projection contract](./operating-governance/family-domain-quality-projection-contract.md)
- [Family incident learning loop](./operating-governance/family-incident-learning-loop.md)
- [Family product operator projection](./operating-governance/family-product-operator-projection.md)
- [OPL family directory governance](./operating-governance/opl-family-directory-governance.zh-CN.md)
- [OPL governance audit operating surface](./operating-governance/opl-governance-audit-operating-surface.md)
- [OPL publish promotion operating surface](./operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL surface authority matrix](./operating-governance/opl-surface-authority-matrix.md)
- [OPL surface lifecycle map](./operating-governance/opl-surface-lifecycle-map.md)
- [OPL surface review matrix](./operating-governance/opl-surface-review-matrix.md)

## 7. Retired Compatibility And Frontdoor References

- [Gateway / federation compatibility archive](../history/compatibility/gateway-federation/README.md)
- [Frontdoor legacy archive](../history/frontdoor-legacy/README.md)
- [OMX historical archive](../history/omx/README.md)
- [Process history archive](../history/process/README.md)

Retired prose files live in `docs/history/`. Machine-readable contracts, tests, scripts, and runtime dashboards should refer to contract/schema/source surfaces or semantic `human_doc:*` ids; they should not pin prose paths as stable machine interfaces.

## Usage Rules

- These files may explain why a freeze happened, but they must not override `README*`, `docs/README*`, or the core maintainer working set.
- `series-doc-governance-checklist.md` is the repo-scoped governance checklist for keeping this repository aligned with the four-repo series; the dated sync summary records one concrete cross-repo intake round.
- `four-repo-doc-intake-template.md` is the reusable central intake form for documenting scope, affected repositories, verification, and cleanup across a cross-repo docs round.
- New reference docs should be filed into the directory buckets above.
- `docs/**` and `README*` are human-readable surfaces. Do not make scripts, contracts, tests, or runtime dashboards depend on their concrete paths; use stable contract files or semantic surface ids instead.
- Completed one-off plans, generated process specs, and superseded design drafts should move to [Process history](../history/process/README.md), not stay in active reference or specs layers.
- Retired gateway/federation corpus stays here or in the paired compatibility surfaces and must not be treated as the current implementation basis.
- Retired `frontdoor`-era material stays here for audit only and must not be treated as the current implementation basis.
- Retired OMX-era prompt, longrun, and worktree material has been removed from active references; use the historical archive only as a tombstone, not as an execution guide.
