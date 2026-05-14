# Active Docs

Status: `active_support`
Owner: `One Person Lab`

This directory holds current human-readable support documents for the active OPL runtime, activation, shared-boundary, and domain-onboarding model.

Current truth still starts in:

- [Docs Guide](../README.md)
- [Project](../project.md)
- [Status](../status.md)
- [Architecture](../architecture.md)
- [Invariants](../invariants.md)
- [Decisions](../decisions.md)
- [Contracts Overview](../../contracts/README.md)

Documents here support the current model, but they are not machine-readable authority. Code, tests, runtime dashboards, and contracts must consume `contracts/`, schemas, source files, generated artifacts, CLI/API behavior, or semantic `human_doc:*` ids.

## Contents

- `opl-family-development-reference.zh-CN.md`: main development reference for the OPL family; fixes the split between OPL global planning and repo-local plans, OPL-owned generic primitive absorption, direct retirement of stale compatibility surfaces, and same-name canonical docs taxonomy alignment.
- `current-development-lines*`: current framework-first content-level development map.
- `production-framework-closure-gap-matrix.zh-CN.md`: current production closure gap matrix and functional follow-through owner for OPL as a complete production-grade agent framework.
- `current-state-vs-ideal-gap.zh-CN.md`: compares the OPL / Foundry Agents ideal state with the current family-level gaps and completion order; MAS/MAG/RCA repo-specific completion plans live in their own ideal-state, status, active, runtime, delivery, or source documents.
- `development-document-portfolio*`: current development-document portfolio entry; classifies old content as merge, retain, downgrade, retire, or archive.
- `opl-public-surface-index*`: current public surface map.
- `opl-domain-onboarding-contract*`: candidate-domain onboarding review support.
- `opl-runtime-naming-and-boundary-contract*`: runtime naming and boundary support.
- `shared-runtime-contract*`, `shared-domain-contract*`: current shared-boundary support.

Absorbed / archived material:

- `shared-foundation*` and `shared-foundation-ownership*` moved to `docs/history/process/shared-boundary/`; their current owner split lives in the OPL family development reference, the public operating model, and the active shared runtime/domain contracts.
- The one-time 2026-05-14 production functional closure plan moved to `docs/history/process/plans/`; the active follow-through owner is `production-framework-closure-gap-matrix.zh-CN.md`.
