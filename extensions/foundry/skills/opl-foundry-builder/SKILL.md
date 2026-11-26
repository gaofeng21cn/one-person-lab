---
name: opl-foundry-builder
description: Guide scaffolding, v2 manifest conformance validation, frozen evaluation, non-weakening comparison, and CAS promotion/rollback via OPL Foundry.
---

# OPL Foundry Builder

## Scope and Invariants

1. **Single Source Manifest (`opl.package.v2`)**: Every package must declare a strict `opl-package.json` with kebab-case `identity.id`, SemVer `identity.version`, bilingual `zh-CN`/`en-US` `name` and `summary`, and valid relative POSIX paths without symlinks or root escapes.
2. **Zero Source Mirror Pollution**: Agent and capability repos must never keep legacy `plugins/<name>/` source mirror directories alongside `opl-package.json`.
3. **Immutable Evaluation & Non-Weakening Policy**: Candidate comparisons must preserve frozen `public_cases`, `protected_requirements`, gate operators/thresholds, and `regression_tolerance`. Never weaken evaluation rules to force a pass.
4. **External State Separation**: All Foundry run ledgers, version records, and activation pointers belong under `${OPL_STATE_DIR:-~/.opl/state}/foundry/` so target package digests (`opl-release.lock.json`) remain deterministic.
5. **Fail-Closed Owner Gates & CAS**: Medium/high-risk promotions and all rollbacks require an explicit `--authority-receipt-ref` and matching `--expected-revision` CAS check.
