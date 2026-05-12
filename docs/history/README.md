# History Archive

**English** | [中文](./README.zh-CN.md)

This directory is the archive index for retired `One Person Lab` documentation lanes.

It is the only supported entry for repo-tracked historical material.
History is classified by content, not by filename. If a plan, roadmap, or reference still mentions an old topology such as gateway-first, frontdoor, federation, Hermes-first, host-agent, Product API, or OMX as if it were active, treat it as historical unless the current core docs explicitly restate it.
Current product truth, shared runtime boundaries, and maintainer workflow belong in:

- [Repository Home](../../README.md)
- [Docs Guide](../README.md)
- [Project](../project.md)
- [Status](../status.md)
- [Architecture](../architecture.md)
- [Invariants](../invariants.md)
- [Decisions](../decisions.md)
- current runtime / product-boundary specs under [`docs/specs/`](../specs/); if there are no active specs, use the core five and `docs/active/`

Archived lanes:

- [Compatibility archive](./compatibility/README.md)
- [Runtime substrate history archive](./runtime-substrate/README.md)
- [Process history archive](./process/README.md)
- [Frontdoor legacy notes](./frontdoor-legacy/README.md)
- [OMX historical archive](./omx/README.md)

Tombstone rules:

- Retired routes stay here for provenance, migration review, and audit only.
- Do not revive an old route because a historical file contains a command, acceptance checklist, or old path example.
- Runtime / product-entry / migration documents whose content has already been absorbed should be entered through [Runtime substrate history archive](./runtime-substrate/README.md).
- Product API / ACP native specs now live in the [process history archive](./process/README.md) as historical formation context only.
- Current planning for the complete stage-led runtime framework with Agent executors as the minimum execution unit starts from [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md).
