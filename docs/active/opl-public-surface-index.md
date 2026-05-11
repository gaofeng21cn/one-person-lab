**English** | [中文](./opl-public-surface-index.zh-CN.md)

# OPL Public Surface Index

## Purpose

This document maps the current authoritative public surfaces for `OPL`.

The current mainline is:

- `Codex-default session/runtime`
- `explicit activation layer`
- `shared modules / contracts / indexes`
- `family domain skill sync / discovery`

`OPL` no longer carries the older gateway/federation/routed-action corpus as an active contract or example layer.
That corpus is retained only under history/reference pages for provenance and design review.

For repository-wide document lifecycle and reference handling, see [Docs Index](../README.md) and [Documentation Portfolio](../docs_portfolio_consolidation.md).

## Current Active Surfaces

### 1. OPL-owned runtime and activation surfaces

These documents define the current `OPL` mainline:

- [README](../README.md)
- [Project](../project.md)
- [Status](../status.md)
- [Architecture](../architecture.md)
- [Invariants](../invariants.md)
- [Decisions](../decisions.md)
- [Contracts Overview](../../contracts/README.md)

These surfaces explain the default entry (`opl`, `opl exec`, `opl resume`), the current resource model (`workspaces / sessions / progress / artifacts`), and the rule that explicit domain activation or executor switching is opt-in.
They also keep `OPL Runtime Manager` scoped as the product control plane over the configured provider-backed family runtime, with typed family queue, bridge diagnostics, and Rust native helper / index work limited to native assistance and indexed discovery. Temporal-backed provider is the production substrate candidate; `Hermes-Agent` remains a migration-period legacy/optional provider or explicit executor/proof lane.

### 2. Linked domain capability surfaces

These are indexed by `OPL`, but remain repo-owned:

- `Med Auto Science`
- `Med Auto Grant`
- `RedCube AI`

`OPL` discovers and activates them through `opl skill sync` plus each domain repository's own CLI / program / script / contract surfaces.
The current top-level integration unit is therefore the repo-owned domain app skill and its underlying command contracts, not an OPL-owned gateway handoff vocabulary.

### 3. Shared-foundation companion surfaces

These remain active as shared boundary documents:

- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)

They support the current runtime/activation model, but they do not reintroduce a gateway-first public storyline.

## Historical Provenance

The earlier gateway-first phase is retained only as historical provenance:

- [Gateway Federation](../history/compatibility/gateway-federation/gateway-federation.md)
- [OPL Federation Contract](../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Routed Action Gateway](../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Gateway Contract Surface](../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.md)

These surfaces must not be used as active implementation, test, or machine-readable contract inputs for today's `OPL`.

## Reference-Grade Supporting Material

These surfaces continue to support review and traceability:

- [Reference Index](../references/README.md)
- [History Archive](../history/README.md)
- [Ecosystem Status Matrix](../references/convergence-governance/ecosystem-status-matrix.md)
- retired gateway/federation provenance under `docs/history/compatibility/`

## Reading Rule

Read this index as a **runtime/activation map**.

- If you want the current `OPL` truth, start with the core maintainer working set and `Contracts Overview`.
- If you want the current cross-repo integration unit, read the linked domain repositories and their app-skill surfaces.
- If a document still centers `OPL Gateway`, `domain_gateway`, routed handoff payloads, or gateway-owned public-surface indexing, treat it as historical provenance.

## Completion Definition

This surface index is acceptable only when:

- it makes the current `Codex-default runtime + activation + shared modules/contracts/indexes + skill sync` mainline obvious
- it distinguishes OPL-owned runtime/activation surfaces from repo-owned domain capability surfaces
- it clearly marks legacy gateway/federation material as reference or compatibility content
- it keeps domain runtime truth, progress truth, and artifact truth owned by the corresponding domain repositories
