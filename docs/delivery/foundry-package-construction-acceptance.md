# Foundry Package Construction Acceptance

This document explains how to verify hosted Package construction. Runtime design
belongs to the [Foundry control-plane reference](../runtime/opl-foundry-kernel-control-plane.md);
remaining implementation gaps belong to the [current gap](../active/current-state-vs-ideal-gap.md).

## Construction boundary

The acceptance checks exercise deterministic package scaffolding, manifest/lock verification, frozen-plan evaluation ledger emission, and Python extension integration using:

- `extensions/foundry/src/*` (`opl foundry init | validate | eval | compare | promote | rollback`);
- `@opl/pack` manifest v2 schema (`contracts/opl-package.v2.schema.json`) and content-lock builder/verifier;
- `opl-foundry-run-event.v1` hash-chained ledger events under `${OPL_STATE_DIR}/foundry/`.

`eval` emits an immutable `EvidenceBundle` and ledger event chain without mutating the target package directory, while `promote` and `rollback` enforce CAS `expected_revision` and owner authority checks on medium/high risk changes. Missing bytes, hash mismatch, or weakened protected gates must fail closed.

Verification stops before domain production adoption. It does not establish domain quality or published carrier acceptance.

## Run the checks

From a checkout with repository dependencies installed:

```sh
scripts/run-with-repo-temp-env.sh node --test \
  extensions/foundry/tests/foundry.test.mjs \
  extensions/foundry/tests/foundry-adversarial.test.mjs
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
request, review receipts, immutable snapshots, Runway/Ledger history and candidate bytes
are available. Verify the original files and their bindings before comparing any
local runtime patch against canonical source. Absorb only the missing behavior and
retest the affected paths; do not require another complete model run solely because
the verified run used an explicitly selected developer checkout. Such evidence does
not verify a different installed native carrier.

Construction ends at the materialization event and its content-addressed candidate
record. A later evaluation configuration failure does not erase that evidence, and
must not be relabeled as qualification or activation success. Record an unexercised
route-back branch as unexercised; never induce a reviewer verdict to fabricate it.
