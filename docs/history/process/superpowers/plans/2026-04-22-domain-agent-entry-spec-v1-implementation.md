# 历史实施计划：Domain Agent Entry Spec V1

Owner: `One Person Lab`
Purpose: `historical_superpowers_worker_plan`
State: `history_only`
Machine boundary: 本文是早期 worker plan 归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实验证 evidence。

> 历史读法：本文保留 2026-04-22 的 domain-agent entry spec v1 任务包。下面的 `Goal`、`Architecture`、task list 和 verification 不再定义当前 entry/admission backlog；当前 owner 是 `docs/specs/opl-domain-onboarding-contract.md`、`opl agents descriptors` / `opl agents descriptor --domain <domain>`、core docs 和 machine contracts。

> 历史生成说明：本文由早期 Superpowers worker-flow 生成；原文要求 agent 按 sub-skill 和 checkbox 执行。当前只保留为历史 provenance，不再作为执行指令。

**历史目标：** Introduce a repo-tracked family-level `domain agent entry spec v1`, have MAS/MAG/RCA export it through their existing entry contracts, and have OPL consume it through the `agents` registry instead of repo-local blueprints.

**历史架构：** Extend the existing `family domain entry contract` rather than creating a second parallel manifest system. Add an explicit `domain_agent_entry_spec` payload to the shared entry-contract helpers, let each domain repo populate it from repo-owned truth, then update OPL's `domain manifest` normalization and `opl_agents` payload to consume that exported spec. Keep existing schema keys and public surface names stable.

**历史技术栈：** TypeScript (`one-person-lab`), Python (`opl-harness-shared`, `med-autoscience`, `med-autogrant`), Node test runner, `pytest`, repo-local CLI/web payload tests

---

### 历史步骤 1： Add Shared `domain_agent_entry_spec` Helper Surface

**Files:**
- Modify: `python/opl-harness-shared/src/opl_harness_shared/family_entry_contracts.py`
- Modify: `src/family-entry-contracts.ts`
- Test: `python/opl-harness-shared/tests/test_family_entry_contracts.py`
- Test: `tests/src/family-entry-contracts.test.ts`

- 历史项：Add a shared validator/builder for `domain_agent_entry_spec` with required identity, locator, strategy, artifact/progress, and command fields.
- 历史项：Allow `build_family_domain_entry_contract(...)` and `validate_family_domain_entry_contract(...)` to accept and preserve `domain_agent_entry_spec` as an explicit optional payload.
- 历史项：Add tests that build a valid contract, reject missing nested fields, and preserve existing extra-payload behavior.

### 历史步骤 2： Export `domain_agent_entry_spec` From MAS/MAG/RCA

**Files:**
- Modify repo-local domain entry contract builders in MAS, MAG, and RCA
- Modify repo-local product entry builders only where needed
- Update the smallest set of tests that already assert `domain_entry_contract`

- 历史项：Add repo-owned `domain_agent_entry_spec` payloads for MAS, MAG, and RCA.
- 历史项：Keep existing schema keys and route surfaces stable.
- 历史项：Verify each repo exports the same nested spec through the same `domain_entry_contract` surface.

### 历史步骤 3： Normalize And Consume `domain_agent_entry_spec` In OPL

**Files:**
- Modify: `src/web-frontdoor.ts`
- Modify: `tests/src/cli.test.ts`
- Modify: `tests/fixtures/family-manifests/*.json`

- 历史项：Update `buildOplAgentsPayload(...)` to prefer manifest-exported `domain_agent_entry_spec` over repo-local blueprints.
- 历史项：Keep static blueprints only as fallback when no exported spec is available.
- 历史项：Verify `opl agents` still merges active binding locator requirements with exported agent-entry truth.

### 历史步骤 4： Verify And Land

- 历史项：Run OPL targeted verification first, then repo-local minimal sufficient verification in MAS/MAG/RCA.
- 历史项：Absorb each verified lane back to repo `main`.
- 历史项：Remove only the worktrees and branches created for this tranche.
