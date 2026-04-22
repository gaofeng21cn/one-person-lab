# Domain Agent Entry Spec V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a repo-tracked family-level `domain agent entry spec v1`, have MAS/MAG/RCA export it through their existing entry contracts, and have OPL consume it through the `agents` registry instead of repo-local blueprints.

**Architecture:** Extend the existing `family domain entry contract` rather than creating a second parallel manifest system. Add an explicit `domain_agent_entry_spec` payload to the shared entry-contract helpers, let each domain repo populate it from repo-owned truth, then update OPL's `domain manifest` normalization and `opl_agents` payload to consume that exported spec. Keep existing schema keys and public surface names stable.

**Tech Stack:** TypeScript (`one-person-lab`), Python (`opl-harness-shared`, `med-autoscience`, `med-autogrant`), Node test runner, `pytest`, repo-local CLI/web payload tests

---

### Task 1: Add Shared `domain_agent_entry_spec` Helper Surface

**Files:**
- Modify: `python/opl-harness-shared/src/opl_harness_shared/family_entry_contracts.py`
- Modify: `src/family-entry-contracts.ts`
- Test: `python/opl-harness-shared/tests/test_family_entry_contracts.py`
- Test: `tests/src/family-entry-contracts.test.ts`

- [ ] Add a shared validator/builder for `domain_agent_entry_spec` with required identity, locator, strategy, artifact/progress, and command fields.
- [ ] Allow `build_family_domain_entry_contract(...)` and `validate_family_domain_entry_contract(...)` to accept and preserve `domain_agent_entry_spec` as an explicit optional payload.
- [ ] Add tests that build a valid contract, reject missing nested fields, and preserve existing extra-payload behavior.

### Task 2: Export `domain_agent_entry_spec` From MAS/MAG/RCA

**Files:**
- Modify repo-local domain entry contract builders in MAS, MAG, and RCA
- Modify repo-local product entry builders only where needed
- Update the smallest set of tests that already assert `domain_entry_contract`

- [ ] Add repo-owned `domain_agent_entry_spec` payloads for MAS, MAG, and RCA.
- [ ] Keep existing schema keys and route surfaces stable.
- [ ] Verify each repo exports the same nested spec through the same `domain_entry_contract` surface.

### Task 3: Normalize And Consume `domain_agent_entry_spec` In OPL

**Files:**
- Modify: `src/web-frontdesk.ts`
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/fixtures/family-manifests/*.json`

- [ ] Update `buildOplAgentsPayload(...)` to prefer manifest-exported `domain_agent_entry_spec` over repo-local blueprints.
- [ ] Keep static blueprints only as fallback when no exported spec is available.
- [ ] Verify `opl agents` still merges active binding locator requirements with exported agent-entry truth.

### Task 4: Verify And Land

- [ ] Run OPL targeted verification first, then repo-local minimal sufficient verification in MAS/MAG/RCA.
- [ ] Absorb each verified lane back to repo `main`.
- [ ] Remove only the worktrees and branches created for this tranche.
