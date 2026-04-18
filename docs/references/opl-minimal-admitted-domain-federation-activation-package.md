**English** | [中文](./opl-minimal-admitted-domain-federation-activation-package.zh-CN.md)

# OPL Minimal admitted-domain federation activation package

## Purpose

This reference-grade package freezes the smallest honest follow-on after the prior `Phase 1 exit activation package`.

It is activated now because the current `2026-04-08` repo-tracked four-repo sync shows that two admitted domain surfaces are finally stable enough to support a stronger top-level federation expression:

- `research_ops` via `MedAutoScience`
- `presentation_ops` via `RedCube AI`

This package still does **not** activate a runtime.
It still does **not** promote `OPL` into a runtime owner.
It still applies to already admitted domains only.

The machine-readable companion is [`../../contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json`](../../contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json).

## Why The Threshold Is Now Met

The predecessor `Phase 1 exit activation package` remained blocked on external readiness.
That historical freeze is preserved as repo-tracked truth.

The current reassessment changes only one thing:

- `MedAutoScience` now has its repo-side integration-harness activation baseline absorbed on `main`
- `RedCube AI` now has its repo-side source-intake + shared-source-truth baseline absorbed on `main`

Together, those two admitted domain surfaces are now stable enough for the minimum stronger federation wording that `OPL` had already pre-frozen.

## What This Package Activates

This package activates only the smallest contract-first federation follow-on:

- strengthen top-level federation wording for already admitted domains only
- make the two currently admitted domain surfaces explicit as the basis of the stronger federation expression
- keep the `OPL` formal entry at the current local `TypeScript CLI`-first / gateway contract surface

In other words, this is a docs+contracts+tests activation package, not a runtime package.

## Activated Admitted Domain Surfaces

The current activated admitted domain surfaces are:

1. `research_ops` -> `MedAutoScience`
2. `presentation_ops` -> `RedCube AI`

That does **not** mean every family or every downstream deliverable is fully mature.
It means the top-level admitted domain surfaces are now stable enough to justify a stronger federation expression.

## Explicit Non-Qualifiers

This package does **not** change the blocked truth for candidate domains:

- `Grant Foundry -> Med Auto Grant` remains signal-only / domain-direction evidence only
- `Review Ops` remains an under-definition bundle blocked below onboarding
- `Thesis Ops` remains an under-definition bundle blocked below onboarding

So this package does **not** admit `Grant Ops`, `Review Ops`, or `Thesis Ops`.

## Hard Boundaries That Still Hold

The current activation keeps these hard boundaries explicit:

- no routed-action runtime
- no mutation entry
- no run launch
- no workspace write
- no shared execution core
- no managed web runtime
- no runtime owner promotion for `OPL`

Any future successful handoff still remains `domain_gateway`-only and still follows the no-bypass rule against direct harness targeting.

## Current Honest State

At the current repo-tracked freeze, the minimum stronger-federation follow-on is **activated now**.

That does **not** create a larger runtime phase.
It only records that the predecessor `Phase 1 exit activation package` has now been honestly superseded by the current `Minimal admitted-domain federation activation package` for already admitted domains only.
