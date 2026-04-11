# One Person Lab Project Entry Contract

This root `AGENTS.md` is the project entry contract for direct sessions that enter from the project root, including Codex App and plain Codex sessions.

It defines the default execution and collaboration rules at the repository root. It is the entry surface for this project, not the full project-truth contract by itself.
This repository now follows standard Codex execution as the only active path. Legacy OMX planning and long-run references are kept only as historical documents.

## Scope

Apply this file to the repository root and all descendants unless a deeper `AGENTS.md` overrides it for a narrower subtree.

## Project Truth

The authoritative project truth contract lives at `contracts/project-truth/AGENTS.md`.
Read that file first whenever repository-specific goals, architecture priorities, mutation rules, or domain constraints matter.

## Working Agreements

- Keep diffs small, reviewable, and reversible.
- Prefer deletion over addition when simplification preserves behavior.
- Reuse existing patterns and utilities before introducing new abstractions.
- Do not add new dependencies without explicit justification.
- Run the relevant tests, type checks, and validation commands before claiming completion.
- Final reports should include what changed and any remaining risks or known gaps.

## Execution Model

- Use Codex as the only active executor for planning, implementation, verification, and review.
- Keep diffs scoped to the task and avoid introducing side-channel control surfaces outside repo-tracked contracts and docs.
- Use isolated worktrees when parallel change lanes are required, but do not require OMX-specific lane ownership semantics.
- Treat any `docs/references/omx-*` content as historical migration guidance, not active operating policy.

## Local State

- `.omx/` and `.codex/` are local tooling state and must remain untracked.
- `.omx/` is retained only for historical local residue and should not be used as an active control-plane dependency.
