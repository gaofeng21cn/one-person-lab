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

## 1. Convergence And Status Alignment

- `contract-convergence-v1-execution-board.md`
- `ecosystem-status-matrix.md`
- `opl-phase-2-central-reference-sync-board.md`
- `opl-phase-2-admitted-domain-delta-intake-refresh.md`
- `opl-phase2-ecosystem-sync-owner-line.md`

## 2. Runtime / Substrate / Migration References

- `host-agent-runtime-contract.md`
- `managed-runtime-migration-readiness-checklist.md`
- `hermes-agent-runtime-substrate-benchmark.md`
- `family-product-entry-and-domain-handoff-architecture.md`
- `family-lightweight-direct-entry-rollout-board.md`
- `mas-top-level-cutover-board.md`
- `opl-frontdesk-delivery-board.md`
- `opl-hosted-web-frontdesk-benchmark.md`
- `opl-product-entry-and-hermes-kernel-integration.md`
- `opl-vertical-online-agent-platform-roadmap.md`
- `contract-convergence-v1-decision-note.md`

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

## 5. Historical Migration And Legacy Execution References

- `development-operating-model.md`
- `runtime-alignment-taskboard.md`
- [OMX historical archive](../history/omx/README.md)

## Usage Rules

- These files may explain why a freeze happened, but they must not override `README*`, `docs/README*`, or the core maintainer working set.
- New reference docs should be filed into the five buckets above. Historical closeout or migration traces should stay Layer 3 rather than leaking back into the default public mainline.
- Runbooks, longrun prompt templates, and worktree discipline for the retired execution surface should no longer be entered from `docs/references/`; use `docs/history/omx/` instead.
