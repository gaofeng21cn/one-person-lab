# Foundry Package Construction Acceptance

This document explains how to verify hosted Package construction. Runtime design
belongs to the [Foundry control-plane reference](../runtime/opl-foundry-kernel-control-plane.md);
remaining implementation gaps belong to the [current gap](../active/current-state-vs-ideal-gap.md).

## Construction boundary

The acceptance test uses a deterministic fixture gateway with the real
`StageRunFoundryProviderInvoker`, `ManifestFoundryDesignerAdapter`, `FoundryKernel`,
content-addressed compiler, file object store and SQLite ledger. Distinct target
identities, domains, actions and Stages exercise the generic construction path.

`startRun()` and `advanceRunStep()` advance through
`accepted -> designing -> materializing -> evaluating`. The ledger event
`candidate_materialized` supplies a `candidate_record_digest` for an
`opl_foundry_materialized_candidate` object. Verification reads that object and
checks indexed file hashes and sizes, candidate/manifest digests, resource bytes
and manifest conformance. Missing bytes, hash mismatch or wrong generation must
not produce a materialization event.

The test stops before evaluation. It does not establish a terminal successful
FoundryRun, qualification, version registration, activation or domain quality.
Fixture packages are neither published nor installed; temporary artifacts are
removed by the tests.

## Run the checks

From a checkout with repository dependencies installed:

```sh
npm run build:packages
scripts/run-with-repo-temp-env.sh node --experimental-strip-types --test \
  tests/src/foundry-agent-package-acceptance.test.ts \
  tests/src/foundry-provider-stage-run.test.ts \
  tests/src/foundry-source-material.test.ts \
  tests/src/foundry-managed-attempt-content.test.ts \
  tests/src/reviewer-snapshot-authoring.test.ts \
  tests/src/family-runtime-review-protocol-transport.test.ts \
  tests/src/foundry-temporal.test.ts
```

These checks cover construction, authoritative work-item scope, exact source and
reviewer bytes, and durable provider observation. A fixture gateway cannot prove
that an installed real model follows the full hosted protocol.

## Live acceptance

Use the public `engineer-agent` action in an isolated installed runtime. Preserve
the run identity and read the actual candidate event and content-addressed object
record. Validate resource bytes against the record, then obtain independent
owner evidence for any further evaluation, qualification or activation claim.

A failed historical Run remains terminal. Normal observation and continue-as-new
preserve in-flight execution; they do not authorize rewriting failed ledgers.

An existing isolated run may supply construction evidence when its exact source,
request, review receipts, immutable snapshots, Temporal history and candidate bytes
are available. Verify the original files and their bindings before comparing any
local runtime patch against canonical source. Absorb only the missing behavior and
retest the affected paths; do not require another complete model run solely because
the verified run used an explicitly selected developer checkout. Such evidence does
not verify a different installed native carrier.

Construction ends at the materialization event and its content-addressed candidate
record. A later evaluation configuration failure does not erase that evidence, and
must not be relabeled as qualification or activation success. Record an unexercised
route-back branch as unexercised; never induce a reviewer verdict to fabricate it.
