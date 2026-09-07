# Family Orchestration Contracts

**English** | [中文](./README.zh-CN.md)

Owner: `OPL Framework`
Purpose: `family_orchestration_contract_support_index`
State: `active_support`

This page helps domain Package maintainers locate shared payload schemas. Framework owns these exchange shapes; domain owners retain the underlying content, decisions, and authorized effects. The [shared domain contract](../../docs/specs/shared-domain-contract.md) explains that boundary.

## Discovery

Start with [family-product-entry-manifest-v2.schema.json](./family-product-entry-manifest-v2.schema.json) for product-entry discovery. The manifest locates the action catalog, generated Stage control plane, continuity projections, and optional companion surfaces. Its locator definitions specify accepted source kinds and paths; the domain-owned Stage manifest feeds the Framework compiler.

The [descriptor normalizer](../../src/read-models/catalog/domain-manifest/normalizers.ts) and [domain pack compiler](../../src/authority/packages/domain-pack-compiler/repo-contract-descriptor.ts) are the corresponding consumers. Public inspection uses `opl agents descriptors --json` or `opl agents descriptor --domain <domain> --json`; this page does not maintain a fixed Agent or repository roster.

## Payload Navigation

Each row identifies one exchange concern. Required fields, allowed values, and authority flags belong to the linked schema, not a duplicate prose inventory.

| Exchange concern | Schema entry points |
| --- | --- |
| Callable actions and declared topology | [Action catalog](./family-action-catalog.schema.json), [action graph](./family-action-graph.schema.json) |
| Stage descriptors and static conformance | [Stage control plane](./family-stage-control-plane.schema.json), [conformance](./family-stage-conformance.schema.json) |
| Stage pack evidence and graph projection | [Proof bundle](./family-stage-proof-bundle.schema.json), [graph projection](./family-stage-graph-projection.schema.json), [integrity metadata](./family-stage-integrity-metadata.schema.json) |
| Stage pack source and lifecycle references | [Pack registry](./family-stage-pack-registry.schema.json), [source spec](./family-stage-pack-source-spec.schema.json), [replay certification](./family-stage-replay-certification.schema.json) |
| Advisory diagnostics | [Assumption lifecycle](./family-stage-assumption-lifecycle.schema.json), [cohort loop](./family-stage-cohort-loop.schema.json), [runtime budget](./family-stage-runtime-budget.schema.json), [candidate portfolio](./stage-candidate-portfolio.schema.json) |
| Event, checkpoint and StageRun evidence references | [Event envelope](./family-event-envelope.schema.json), [checkpoint lineage](./family-checkpoint-lineage.schema.json), [StageRun evidence pack](./stage-run-evidence-pack.schema.json) |
| Owner decision, human gate and conflict exchange | [Owner route](./family-owner-route.schema.json), [human gate](./family-human-gate.schema.json), [conflict envelope](./family-conflict-envelope.schema.json) |
| Persistence roles and lifecycle receipts | [Persistence policy](./family-persistence-policy.schema.json), [lifecycle ledger](./family-lifecycle-ledger.schema.json) |
| Read-only runtime supervision | [Runtime supervision](./family-runtime-supervision.schema.json) |
| Domain memory references and writeback exchange | [Memory ref](./family-domain-memory-ref.schema.json), [memory writeback](./family-domain-memory-writeback.schema.json) |

## Read Alongside The Runtime Owner

A shared graph, conformance report, proof bundle, or supervision projection does not itself execute a Stage or decide its professional route. Review [Stage graph and route transport](../../docs/runtime/stage-graph-route-transition-runtime.md) for the decisive Attempt, controller, quality-debt, and launch-boundary semantics. The machine owner is [stage-route-transport-contract.json](../opl-framework/stage-route-transport-contract.json), together with the [Stage quality cycle contract](../opl-framework/stage-quality-cycle-contract.json).

Use the [shared runtime contract](../../docs/specs/shared-runtime-contract.md) for Temporal execution and state-index responsibilities. Memory exchange follows the [advisory knowledge boundary](../opl-framework/advisory-knowledge-boundary-contract.json); refs and writeback receipts do not transfer memory-body ownership or accept/reject authority to Framework.

For implementation work, follow the [Standard Agent interface](../../docs/specs/standard-agent-interface.md) and [implementation guide](../../docs/specs/standard-domain-agent-implementation.md). Descriptor availability, static conformance, and provider completion remain scoped evidence; domain acceptance and App release decisions require their respective owners.

Return to the [Framework contract navigation](../opl-framework/README.md) for runtime, Package, Workspace, App, and delivery contracts. This bilingual index follows the [documentation lifecycle policy](../../docs/policies/docs-lifecycle-policy.md).
