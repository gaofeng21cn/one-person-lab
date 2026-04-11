# One Person Lab Repository Contract

This root `AGENTS.md` is the default entry contract for direct sessions from the repository root.

## Scope

Apply this file to the repository root and all descendants unless a deeper `AGENTS.md` overrides it for a narrower subtree.

## Project Identity

- `OPL` is the top-level gateway and federation model for a one-person research lab.
- `OPL` is not a synonym for any single domain repository, not a monolithic runtime that replaces domain gateways, and not a fourth `Domain Harness OS`.
- The default executor is a `Codex`-class agent runtime. This repository exists to define stable gateway, contract, and substrate boundaries rather than to replace agents as the primary driver.
- The current local default deployment shape is `Codex-default host-agent runtime`; legacy `OMX` split wording is historical reference only.

## Architecture Priorities

- Preserve the chain `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS`.
- Keep `Unified Harness Engineering Substrate` language above any one domain repository and avoid collapsing shared-foundation language into a single runtime owner.
- Keep current domain systems such as `MedAutoScience` and `RedCube AI` as independent domain gateways under the `OPL` umbrella.
- Freeze `Agent-first`, explicit formal-entry semantics, and `Auto-only current repo + future HITL sibling or upper-layer product` semantics at the `OPL` layer before domains hydrate them differently.

## Documentation Layers

- `README.md` and `docs/README.md` define the default public reading path.
- `docs/references/` holds reference-grade support material and must not crowd the default narrative.
- `docs/references/omx-*` documents are historical migration references only, not active operating policy.
- `docs/specs/**` and `docs/plans/**` are historical design and planning records rather than living truth surfaces.
- `contracts/project-truth/AGENTS.md` is the detailed appendix for deeper identity and boundary rules when the root contract is not enough.

## Execution Model

- Use Codex as the only active executor for planning, implementation, verification, and review.
- Keep diffs scoped to the task and avoid introducing side-channel control surfaces outside repo-tracked contracts and docs.
- Use isolated worktrees when parallel change lanes are required, but do not recreate OMX-specific lane ownership semantics.
- Do not describe planned workstreams as already implemented.

## Test Surface Governance

- `npm test` and `npm run test:fast` are the default developer smoke slice; do not silently widen them into the full tracked baseline.
- `npm run test:meta` is the repo-tracked contract/reference lane, and `npm run test:artifact` is the built-output verification lane.
- `npm run test:full` is the clean-clone verification entrypoint; repo-tracked contracts, docs, and operator instructions must reference this command when they mean the full baseline.
- If a repo-tracked file documents verification commands, keep those command surfaces aligned with `package.json` and the checked-in tests.
- Prefer tightening or deleting stale verification references instead of adding parallel test entrypoints that drift out of sync.

## Working Agreements

- Keep diffs small, reviewable, and reversible.
- Prefer deletion over addition when simplification preserves behavior.
- Reuse existing patterns and utilities before introducing new abstractions.
- Do not add new dependencies without explicit justification.
- Run the relevant tests, type checks, and validation commands before claiming completion.
- Final reports should include what changed and any remaining risks or known gaps.

## Local State

- `.omx/` and `.codex/` are local tooling state and must remain untracked.
- `.omx/` is retained only for historical residue and should not be used as an active control-plane dependency.
