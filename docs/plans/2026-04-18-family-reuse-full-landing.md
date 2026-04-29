# Family Reuse Full Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the remaining high-reuse surfaces across OPL, MedAutoScience, MedAutoGrant, and RedCube AI so family contracts/builders live centrally in OPL and consumer repos keep only domain truth plus thin adapters.

**Architecture:** OPL remains the shared owner for reusable product-entry builders, orchestration graph helpers, manifest normalization, and machine-readable family contracts. MAS, MAG, and RCA consume the shared surfaces, preserve domain-owned semantics, and converge on the same family release/update path.

**Tech Stack:** TypeScript, Python, JSON Schema, `uv`, `npm`, repo-native verify scripts

---

### Task 1: Extend OPL shared builders and contracts

**Files:**
- Modify: `src/product-entry-program-companions.ts`
- Modify: `src/index.ts`
- Modify: `src/domain-manifest.ts`
- Modify: `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- Modify: `tests/*.test.*` or add focused shared-surface tests if missing

- [ ] Add failing tests for new shared TS builders and manifest normalization coverage.
- [ ] Implement TS parity for `product_entry_guardrails`, `phase3_clearance_lane`, `phase4_backend_deconstruction_lane`, and `phase5_platform_target`.
- [ ] Introduce a shared family action-graph builder layer that can express MAS/MAG/RCA graph nodes, edges, human gates, and checkpoint policy without repo-local duplication.
- [ ] Extend OPL manifest normalization and family schema so the new shared surfaces are first-class machine-readable contracts.
- [ ] Re-run focused OPL tests and adjust exports/docs to match the landed contract.

### Task 2: Converge MAS on shared phase/program surfaces

**Files:**
- Modify: `src/med_autoscience/controllers/product_entry.py`
- Modify: `src/med_autoscience/controllers/mainline_status.py`
- Modify: `tests/**`
- Modify: `docs/status.md` if the shared-boundary truth changes

- [ ] Add failing MAS tests that lock the new shared program-companion shape and family graph usage.
- [ ] Replace repo-local phase payload builders with calls into `opl_harness_shared`.
- [ ] Move MAS family action-graph assembly onto the new shared graph DSL while preserving medical-domain gate semantics.
- [ ] Remove duplicated canonical truth between `mainline_status.py` and `product_entry.py` where the shared layer now owns structure.
- [ ] Run MAS focused tests plus repo-native verify/meta lanes.

### Task 3: Converge MAG on shared graph/schema surfaces

**Files:**
- Modify: `src/med_autogrant/product_entry.py`
- Modify: `schemas/v1/product-entry-manifest.schema.json`
- Modify: `schemas/v1/product-frontdoor.schema.json`
- Modify: `tests/**`
- Modify: `docs/status.md` if needed

- [ ] Add failing MAG tests for graph-builder adoption and schema coverage of the shared surfaces.
- [ ] Replace repo-local family action-graph building with the shared graph DSL.
- [ ] Reconcile local schemas with OPL-owned family contract additions while preserving grant-domain surfaces.
- [ ] Re-run MAG focused tests and repo-native verify/meta lanes.

### Task 4: Converge RCA on shared JS graph/release surfaces

**Files:**
- Modify: `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- Modify: `packages/redcube-gateway/src/actions/get-product-preflight.js`
- Modify: `packages/redcube-gateway/package.json`
- Modify: `package-lock.json`
- Modify: `tests/**`
- Modify: `docs/status.md` if needed

- [ ] Add failing RCA tests for the shared graph builder and expanded shared program-companion payloads.
- [ ] Move RCA family action graph to the new OPL shared DSL.
- [ ] Bump the OPL git pin to the new shared-owner commit in the clean RCA worktree created from `origin/main`.
- [ ] Re-run RCA focused tests and repo-native verify/meta lanes.

### Task 5: Standardize family release discipline

**Files:**
- Modify: `docs/references/**` or `docs/status.md` in OPL if the owner/update flow needs a durable record
- Modify: consumer dependency pins and lockfiles as needed
- Modify: tests or scripts that validate shared dependency drift if such a check is added

- [ ] Add a durable shared-owner bump/check path so MAS, MAG, and RCA can detect stale OPL pins.
- [ ] Update the three consumer repos to the same OPL owner commit after OPL changes land.
- [ ] Run end-of-lane verification in all four repos, then absorb each worktree back to `main`, push, and clean up.
