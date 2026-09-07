# OPL Framework Contracts

**English** | [中文](./README.zh-CN.md)

Owner: `OPL Framework`
Purpose: `opl_framework_contract_support_index`
State: `active_support`

This page routes maintainers to Framework machine contracts. JSON contracts and schemas define the interface; source and callers establish its implementation. For product scope, architecture, or current evidence, start at the [documentation index](../../docs/README.md).

## Contract Entry Points

Choose the topic first, then follow the contract's schema, source, and consumer references. This is a reading map, not an exhaustive file inventory or a registry of installed Packages.

| Question | Machine entry points |
| --- | --- |
| Which public surface owns an interface? | [Public surface index](./public-surface-index.json), [CLI command registry](./cli-command-registry.json) |
| How do family capabilities relate to authority owners? | [Capability-domain registry](./family-capability-domain-registry.json), [target operating architecture](./target-operating-architecture-contract.json) |
| Where do Framework and Application Host responsibilities meet? | [Cordis architecture profile](./cordis-architecture-profile.json), [source module map](./source-module-map.json), [Package topology](./package-topology.json) |
| How are installed Packages discovered and hosted? | [Package host contract](./capability-package-host-contract.json), [standard Agent admission](./standard-agent-admission-gates.json), [hosted action runtime](./standard-agent-hosted-action-runtime-contract.json) |
| How does a domain pack produce callable interfaces? | [Domain pack compiler](./domain-pack-compiler-contract.json), [standard Agent interface](./standard-agent-interface.schema.json), [implementation profile](./standard-agent-implementation-profile.schema.json) |
| How are Workspace and Work Item identities bound? | [Agent workspace norm](./agent-workspace-norm-contract.json), [workspace index](./workspace-index.schema.json), [execution scope snapshot](./execution-scope-snapshot.schema.json) |
| How are StageRun identity, launch and cross-Stage routes transported? | [StageRun kernel](./stage-run-kernel-contract.json), [route transport](./stage-route-transport-contract.json), [family runtime attempts](./family-runtime-attempt-contract.json) |
| How are Stage review roles and quality policy declared? | [Stage quality cycle](./stage-quality-cycle-contract.json), [quality policy schema](./stage-quality-cycle.schema.json), [official quality profile](./official-knowledge-deliverable-quality-profile.json), [review currentness](./epistemic-review-currentness-contract.json) |
| Where do artifacts, owner answers and state indexes belong? | [Stage artifact runtime](./stage-artifact-runtime-contract.json), [owner answer](./owner-answer.schema.json), [state index kernel](./state-index-kernel-contract.json) |
| How are runtime service and executor boundaries defined? | [Runtime Manager](./runtime-manager-contract.json), [online substrate](./family-runtime-online-substrate-contract.json), [executor adapters](./family-executor-adapter-defaults.json) |
| What does the App consume? | [App operator projection](./family-product-operator-projection.json), [bounded Work Item projection](./app-runtime-fast-work-item-projection-contract.json), [current owner delta](./current-owner-delta.schema.json) |
| How are evidence and advisory context exchanged? | [Evidence ledger event](./evidence-ledger-event.schema.json), [observability conventions](./observability-semantic-conventions-contract.json), [advisory knowledge boundary](./advisory-knowledge-boundary-contract.json), [OKF context bundle](./okf-context-bundle-contract.json) |
| Where are Foundry construction and evolution interfaces? | [Foundry Agent series](./foundry-agent-series-contract.json), [scaffold materialization](./agent-scaffold-materialization-contract.json), [evolution proposal](./foundry-evolution-proposal.schema.json) |
| Where are reusable helper and source-material interfaces? | [Native helper execution](./pack-native-helper-execution-contract.json), [source material ingest](./source-material-ingest-contract.json), [submission resource request](./submission-resource-provision-request.schema.json) |
| How are generated bundles and release consumers bound? | [Pack bundle](./pack-bundle-contract.json), [release operation event](./release-bundle-operation-event.schema.json), [release consumer envelope](./release-bundle-consumer-envelope.schema.json) |
| Where do public whitepaper builds get their inputs? | [Whitepaper registry](./public-whitepaper-registry.json), [Profile schema](./public-whitepaper-profile.schema.json) |

## Consumer Reading

A schema describes a payload, a descriptor advertises a capability, and a runtime receipt records an observed operation. None independently proves installation, domain acceptance, publication, or release readiness. Read each contract's authority boundary with its referenced consumer.

The [family orchestration directory](../family-orchestration/README.md) owns companion payload shapes exchanged with domain Packages. Domain truth, artifact and memory bodies, professional verdicts, and owner receipts remain with the declared domain owner; App product and release decisions remain with the App owner.

## Detailed Guides

- [Shared domain behavior](../../docs/specs/shared-domain-contract.md) and [Standard Agent interface](../../docs/specs/standard-agent-interface.md) explain the domain integration boundary.
- [Shared runtime](../../docs/specs/shared-runtime-contract.md) and [Stage graph and route transport](../../docs/runtime/stage-graph-route-transition-runtime.md) explain execution and route semantics.
- [Artifact and Package lifecycle](../../docs/delivery/artifact-package-lifecycle-boundary.md) explains delivery ownership.
- [Source module maintenance](../../docs/references/source-module-boundary.md) explains source-boundary changes.
- [Documentation lifecycle](../../docs/policies/docs-lifecycle-policy.md) governs this index and its Chinese translation as one semantic document.
