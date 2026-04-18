**English** | [中文](./opl-phase-1-exit-activation-package.zh-CN.md)

# OPL Phase 1 Exit Activation Package

## Purpose

This reference-grade package freezes what `OPL` can honestly say at the end of the current `Phase 1` closeout.

It does **not** activate a runtime.
It does **not** admit new domains.
It does **not** promote `OPL` into a runtime owner.

Its job is to record:

- what `Phase 1` has already completed
- what stays explicitly deferred
- which thresholds must be met before `OPL` may leave the current `Phase 1`
- which thresholds depend on external domain readiness rather than on more wording edits inside this repo
- what `OPL` may still continue to do on its own
- what the minimal stronger-federation follow-on would be once the thresholds are truly met

The machine-readable companion is [`../../contracts/opl-gateway/phase-1-exit-activation-package.json`](../../contracts/opl-gateway/phase-1-exit-activation-package.json).

## Frozen `Phase 1` Completed Surface

The current `Phase 1` closeout is frozen as the following completed tranches:

1. `Phase 1 / G2 release-closeout`
2. `Phase 1 / G3 thin handoff planning freeze hardening`
3. `Phase 1 / Grant Ops candidate-domain backlog and onboarding-package hardening`
4. `Phase 1 / Review Ops candidate-domain backlog and onboarding-package hardening`
5. `Phase 1 / Thesis Ops candidate-domain backlog and onboarding-package hardening`

The resulting formal entry remains the current local `TypeScript CLI`-first / gateway contract surface.
That still means:

- no mutation entry
- no run launch
- no workspace write
- no routed-action runtime
- no shared execution core
- no managed web runtime
- no runtime-owner promotion for `OPL`

## Explicitly Deferred Surface

The following items remain explicitly deferred even after the current `Phase 1` closeout:

- any admission of `Grant Ops`, `Review Ops`, or `Thesis Ops`
- any `G2` discovery readiness for those candidate domains
- any `G3` routed-action readiness for those candidate domains
- any handoff-ready surface for those candidate domains
- any `G3` mutation / routed-action runtime
- any mutation entry, run launch, workspace write, shared execution core, or managed web runtime
- any truth-store or runtime-owner promotion for `OPL`

## Exit Thresholds

`OPL` may leave the current `Phase 1` only when all of the following are true:

1. **Public truth / contracts / tests remain stable inside this repo**
   The top-level docs, machine-readable contracts, and regression tests remain aligned.
2. **Candidate-domain paths are closed at the current definition layer**
   `Grant Ops`, `Review Ops`, and `Thesis Ops` all stay blocked / under definition / non-admitted / non-ready.
3. **The minimal next-stage tranche is honestly frozen first**
   A named follow-on exists with explicit scope, non-goals, and verification requirements.
4. **At least two admitted domain surfaces are truly stable enough to support a stronger federation expression**
   This threshold depends on external domain readiness rather than on more local wording edits in `OPL`.
5. **No wording drifts toward runtime-owner or shared-runtime claims**
   `OPL` must remain the top-level gateway/federation surface.

## Threshold Assessment at the Current Freeze

At the current freeze:

- the internal `OPL` truth/contract/test threshold is **met**
- the candidate-domain closeout threshold is **met**
- the next-stage tranche definition threshold is **met**
- the anti-runtime-drift threshold is **met**
- the “two admitted domain surfaces are stable enough” threshold is **not met yet**

The current repo-tracked blocker is external:

- the four-repo sync still records `redcube-ai` at `P0 credible green baseline repair`, with active-mainline truth and formal-entry closeout still in progress
- therefore `OPL` cannot honestly claim that at least two admitted domain surfaces are already stable enough for a stronger federation activation package

## What `OPL` May Still Do On Its Own

Before that external threshold changes, `OPL` may still:

- maintain docs/contracts/tests alignment for the current admitted-domain gateway baseline
- keep candidate-domain paths explicit and blocked without inventing admission or readiness
- keep reference-grade sync surfaces current without promoting them into public-mainline truth
- prepare stronger federation wording/contracts only after external admitted-domain readiness becomes real

## Minimal Next-Stage Tranche

The minimal follow-on is frozen as:

- **Name:** `Minimal admitted-domain federation activation package`
- **Scope:** strengthen the top-level gateway/federation expression for already admitted domains only, using docs+contracts+tests first
- **Non-goals:** no runtime activation, no mutation entry, no shared execution core, no managed web runtime, and no candidate-domain admission or readiness promotion
- **Verification:** keep the canonical verification pack green and add focused wording/contract audits

This follow-on is **not activated now**.
It remains frozen but blocked on external readiness.

## Current Honest Terminal State

At the current repo-tracked freeze, the honest program state is:

`EXTERNAL_READINESS_BLOCKED_AFTER_ABSORB`

That state means:

- `Phase 1` closeout truth is absorbed
- the minimum next-stage definition is frozen
- the next stage is **not** faked into existence
- the blocker is external domain readiness rather than a missing local wording pass
