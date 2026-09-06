# Foundry Package Construction Acceptance

Tracks [issue #181](https://github.com/gaofeng21cn/one-person-lab/issues/181).
Comparison baseline: `892496cc29f40fe401e8bc9a9d8014502b86139c`.
The companion OMA admission fix is
[OMA PR #7](https://github.com/gaofeng21cn/opl-meta-agent/pull/7).

## Scope

IBD evidence assistance exposed failures in the generic hosted Agent construction
path. The previously delivered IBD candidate was materialized from recovered OMA
output using the existing compiler; that historical FoundryRun remained failed.
Its receipt does not prove an unmodified upstream hosted run succeeds.

This change ports the necessary normal-path fixes onto upstream, not the entire
divergent local runtime or its recovery implementation:

| Boundary | Upstream gap | Submitted correction |
| --- | --- | --- |
| Managed provider checkout | Required Connect Skill refresher was not composed | Compose existing descriptor discovery and pass the refresher; dispose on failure |
| Provider StageRun launch | Gateway flags disagreed with the real CLI parser | Use `--task` and `--input-artifact-sha256` |
| Stage routing | Host factory was not passed through the production kernel | Pass the existing Stagecraft composition to the gateway/runtime |
| Provider output | Strict consumer schema was absent from immutable input | Deliver canonical output schema closure and exact-byte requirements |
| Input evidence | Source-material refs did not deliver source bytes | Validate applied workspace intake receipts, use the existing content store, bind exact source artifacts to launch |
| Managed Attempt content | Manifest, policy and rubric refs lacked readable content | Hydrate their exact SHA/size-bound UTF-8 bytes into producer/reviewer input |
| Re-review | Nested closure field names were unspecified to the model | Project the machine contract with existing `status`/`summary` fields, without renaming the runtime protocol |
| Package verification | Compiler tests did not establish this combined admission path | Build two different target packages through the real Kernel and persist/read back materialization records |
| Professional Skills | Native marketplace content overrode an explicit developer source | Bind projection bytes to the selected developer checkout; reject an invalid override |
| Reviewer snapshot | Producer lacked the canonical request contract and fixed identity; bound external inputs could not be frozen | Supply the existing schema and immutable StageRun input inventory; copy only explicitly selected, exact-bound bytes |
| Long provider operations | All design Stages shared one polling Activity deadline | Reuse durable launch/observe/read-terminal/cancel coordination with a generation-bound cursor and workflow timers |

No target-specific compiler, receipt issuer, source-binding registry, evaluator,
activation mode, or recovery state machine is introduced. Existing strict raw
output, identity, permissions, generation, resource hash and size checks remain.

## Foundry Run Execution Scope

Foundry launches a provider StageRun in the already registered provider workspace.
Its run ID deterministically identifies a work item beneath `provider-runs/`.
The existing Workspace snapshot builder binds that item to the registry's project
and workspace binding and captures the physical directory identity. Initial design,
diagnosis, and retries retain the same run scope; different runs cannot share it.
Both the authoritative CLI execution scope and its workspace transport copy are
supplied at launch. Existing StageRun continuation, Attempt, snapshot and formal
review receipt checks preserve and verify this identity. Missing or ambiguous
bindings remain errors; a domain scope is not accepted as a work-item scope.

This repairs the admission mismatch reported in issue #183 without granting OMA
receipt, lifecycle or materialization authority. The focused gateway regression
uses the real CLI parser and scope verifier; existing receipt and persistence
tests cover strict admission. A fresh real-model construction receipt still has
to be read from the authorized provider runtime before claiming live completion.

An already failed historical FoundryRun remains terminal. Durable observation and
continue-as-new cover normal in-flight execution; they do not authorize rewriting
old failed ledgers. The historical recovery portion of #181 additionally needs
the original cursor, exact terminal artifacts and authoritative Stage recovery
receipt from the reporter's runtime. A digest quoted in an issue does not supply
those bytes or prove that a replay belongs to the same execution.

## Reproduction

From a clean checkout with repository dependencies installed:

```sh
npm ci --ignore-scripts
npm run build:packages
scripts/run-with-repo-temp-env.sh node --experimental-strip-types --test \
  tests/src/foundry-agent-package-acceptance.test.ts \
  tests/src/foundry-provider-stage-run.test.ts \
  tests/src/foundry-source-material.test.ts \
  tests/src/foundry-managed-attempt-content.test.ts \
  tests/src/standard-agent-action-runtime.test.ts \
  tests/src/standard-agent-managed-checkout.test.ts \
  tests/src/stage-quality-finding-closure-prompt-contract.test.ts
scripts/run-with-repo-temp-env.sh node --experimental-strip-types --test \
  tests/src/reviewer-snapshot-authoring.test.ts \
  tests/src/family-runtime-review-transport.test.ts \
  tests/src/foundry-temporal.test.ts \
  tests/src/temporal-activity-projection.test.ts
scripts/verify.sh smoke
npm run typecheck
npm run build
npm run lint
```

The package acceptance uses an explicitly deterministic fixture gateway, the
real `StageRunFoundryProviderInvoker`, `ManifestFoundryDesignerAdapter`,
`FoundryKernel`, content-addressed compiler, file object store and SQLite ledger.
It creates IBD-evidence and publishing fixtures with different target identities,
domains, actions and Stages; both include all seven resource classes.

`startRun()` followed by the existing `advanceRunStep()` API reaches:

```text
accepted -> designing -> materializing -> evaluating
```

At this boundary the real ledger has `candidate_materialized`, whose
`candidate_record_digest` identifies an `opl_foundry_materialized_candidate`.
The test reads that object back and checks every indexed file's SHA/size,
candidate and manifest digests, resource bytes, and manifest conformance. Missing
bytes, hash mismatch and wrong generation must produce no materialization event.

The test deliberately stops before invoking evaluation. `evaluating` is not a
successful terminal FoundryRun and is not a newly introduced build-only policy.
No qualification, version registration, activation or target semantic quality
is inferred from this construction receipt. Temporary test artifacts are cleaned
up; the test does not publish or install its fixture packages.

## Remaining Live Acceptance

These checks establish deterministic construction and the previously broken
runtime boundaries. They do not run a real LLM through all hosted OMA Stages.
Before claiming complete unattended operation, run the public `engineer-agent`
action using the patched OPL checkout and the companion OMA change in an isolated,
fully installed runtime, and read the actual candidate event and object record.
An upstream default-provider fixture uses OMA 0.4.0; it is not evidence of a live
OMA 0.4.9 execution.

The production provider now separates short launch/observe/read-terminal
Activities from durable workflow waiting. The compatibility synchronous Invoker
retains its bounded deadline; production no longer holds that Activity open
across all Stages. Cursor identity binds the request, generation, provider source
and manifest; restart/continue-as-new must not relaunch semantic generation.
This is normal execution, not recovery of an already failed FoundryRun.

A real pre-fix run reached formal design-basis Review, then quarantined because
the producer had not supplied an immutable reviewer input snapshot. It ended
before the declared terminal Stage; this is not evidence of a timeout. The
snapshot correction keeps producer-selected scope, exact input identities,
immutable review bytes and independent quality authority. No missing snapshot
is converted into a quality pass. A fresh successful live materialization
receipt remains required; focused tests alone do not establish it.
