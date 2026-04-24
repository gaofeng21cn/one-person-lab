**English** | [中文](./opl-public-surface-index.zh-CN.md)

# OPL Public Surface Index

## Purpose

This document maps the current authoritative public surfaces for `OPL`.

The current mainline is:

- `Codex-default session/runtime`
- `explicit activation layer`
- `family domain skill sync / discovery`

`OPL` no longer treats the older gateway/federation corpus as its default public integration contract.
That corpus is still repo-tracked for audit, compatibility checks, and schema archaeology, but it is no longer the first place to recover the current runtime model.

For repository-wide document layering and reference handling, see [Docs Index](./README.md).

## Current Active Surfaces

### 1. OPL-owned runtime and activation surfaces

These documents define the current `OPL` mainline:

- [README](../README.md)
- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)

These surfaces explain the default entry (`opl`, `opl exec`, `opl resume`), the current resource model (`workspaces / sessions / progress / artifacts`), and the rule that explicit activation or runtime switching is opt-in.

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

## Legacy Compatibility Surfaces

The following corpus is retained as legacy compatibility material from the earlier gateway-first phase:

- [Gateway Federation](./gateway-federation.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

These surfaces may still appear in tests, audit workflows, compatibility checks, and historical design reviews.
They must not be used as the default implementation basis for today's `OPL`.

## Reference-Grade Supporting Material

These surfaces continue to support review and traceability:

- [Reference Index](./references/README.md)
- [History Archive](./history/README.md)
- [Ecosystem Status Matrix](./references/ecosystem-status-matrix.md)
- the retained gateway/federation corpora, examples, lifecycle maps, and acceptance specs under `docs/references/`

## Reading Rule

Read this index as a **runtime/activation map**.

- If you want the current `OPL` truth, start with the core maintainer working set and `Contracts Overview`.
- If you want the current cross-repo integration unit, read the linked domain repositories and their app-skill surfaces.
- If a document still centers `OPL Gateway`, `domain_gateway`, routed handoff payloads, or gateway-owned public-surface indexing, treat it as legacy compatibility material unless a newer core doc explicitly promotes it back.

## Completion Definition

This surface index is acceptable only when:

- it makes the current `Codex-default runtime + activation + skill sync` mainline obvious
- it distinguishes OPL-owned runtime/activation surfaces from repo-owned domain capability surfaces
- it clearly marks legacy gateway/federation material as reference or compatibility content
- it keeps domain runtime truth, progress truth, and artifact truth owned by the corresponding domain repositories
