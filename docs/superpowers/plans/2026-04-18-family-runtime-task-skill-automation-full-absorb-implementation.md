# Family Runtime/Task/Skill/Automation Full Absorb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize family orchestration, runtime/task descriptors, skill catalog, and automation descriptors in `OPL`, then migrate `MAS / MAG / RCA` to thin adapters that consume the same shared modules.

**Architecture:** `OPL` owns JS/Python shared builders, validators, and top-level consumer normalization. `MAS / MAG / RCA` keep domain truth extraction and domain-specific wording, then map that truth into the shared family surfaces through repo-local adapters. `MAS` keeps `MedDeepScientist`-dependent runtime internals local while aligning its outward family surfaces with the other repos.

**Tech Stack:** TypeScript, Node.js test runner, Python, pytest, git worktrees, existing OPL shared package exports

---

## File Map

### OPL shared layer

- Create: `src/family-orchestration.ts`
- Create: `src/runtime-task-companions.ts`
- Create: `src/skill-catalog.ts`
- Create: `src/automation-companions.ts`
- Modify: `src/index.ts` or existing export surface if required by package layout
- Modify: `python/opl-harness-shared/src/opl_harness_shared/__init__.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/family_orchestration.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/runtime_task_companions.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/skill_catalog.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/automation_companions.py`
- Test: `tests/src/family-orchestration.test.ts`
- Test: `tests/src/runtime-task-companions.test.ts`
- Test: `tests/src/skill-catalog.test.ts`
- Test: `tests/src/automation-companions.test.ts`
- Test: `python/opl-harness-shared/tests/test_family_orchestration.py`
- Test: `python/opl-harness-shared/tests/test_runtime_task_companions.py`
- Test: `python/opl-harness-shared/tests/test_skill_catalog.py`
- Test: `python/opl-harness-shared/tests/test_automation_companions.py`

### OPL top-level consumers

- Modify: `src/domain-manifest.ts`
- Modify: `src/handoff-bundle.ts`
- Historical target: `src/management.ts`（已退役；当前实现使用 `src/management/*` leaf surfaces）
- Modify: `src/product-entry.ts`
- Modify: `src/web-frontdesk.ts`
- Test: existing focused OPL consumer tests that cover domain manifests, handoff, management, and web frontdesk

### MAS adapters

- Modify: `src/med_autoscience/controllers/study_runtime_family_orchestration.py`
- Modify: `src/med_autoscience/controllers/product_entry.py`
- Modify: `src/med_autoscience/controllers/runtime_watch.py`
- Modify: `src/med_autoscience/controllers/study_runtime_decision.py`
- Modify: `src/med_autoscience/controllers/domain_entry_contract.py` if shared skill catalog seam needs it
- Modify: `src/med_autoscience/policies/automation_ready.py` if shared automation descriptor seam needs it
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Test: focused MAS tests covering product entry, runtime watch, runtime docs, and orchestration

### MAG adapters

- Modify: `src/med_autogrant/product_entry.py`
- Modify: `src/med_autogrant/route_report.py`
- Modify: `src/med_autogrant/hermes_runtime.py`
- Modify: `src/med_autogrant/submission_ready.py`
- Modify: `src/med_autogrant/hosted_contract_bundle.py`
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Test: focused MAG tests covering product entry, route report, hosted contract bundle, and submission readiness

### RCA adapters

- Modify: `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- Modify: `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- Modify: `packages/redcube-gateway/src/actions/get-product-entry-session.js`
- Modify: `packages/redcube-gateway/src/types.ts`
- Modify: `packages/redcube-gateway/package.json`
- Modify: `package-lock.json`
- Test: focused RCA tests covering product entry, session, and MCP gateway surfaces

### Repo docs/status surfaces

- Modify: `docs/status.md` in OPL, MAS, MAG, RCA
- Modify: any affected MAS gate wording docs if implementation changes the live truth

---

### Task 1: Freeze OPL shared family-orchestration core

**Files:**
- Create: `src/family-orchestration.ts`
- Create: `python/opl-harness-shared/src/opl_harness_shared/family_orchestration.py`
- Modify: `python/opl-harness-shared/src/opl_harness_shared/__init__.py`
- Test: `tests/src/family-orchestration.test.ts`
- Test: `python/opl-harness-shared/tests/test_family_orchestration.py`

- [ ] **Step 1: Write the failing JS tests for shared family-orchestration builder**

Create `tests/src/family-orchestration.test.ts` with coverage for:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFamilyHumanGate,
  buildFamilyOrchestrationCompanion,
  resolveActiveRunId,
  resolveProgramId,
} from '../../src/family-orchestration.ts';

test('buildFamilyHumanGate normalizes required gate fields', () => {
  const gate = buildFamilyHumanGate({
    gate_id: 'gate-1',
    gate_kind: 'operator_review',
    requested_at: '2026-04-18T00:00:00Z',
    request_surface_kind: 'runtime_watch',
    request_surface_id: 'runtime_watch/latest.json',
    evidence_refs: [{ ref_kind: 'repo_path', ref: 'foo.json', label: 'foo' }],
    decision_options: ['approve', 'pause'],
  });

  assert.equal(gate.gate_id, 'gate-1');
  assert.equal(gate.request_surface.surface_kind, 'runtime_watch');
  assert.deepEqual(gate.decision_options, ['approve', 'pause']);
});

test('buildFamilyOrchestrationCompanion materializes event envelope and checkpoint lineage', () => {
  const payload = buildFamilyOrchestrationCompanion({
    surface_kind: 'runtime_watch',
    surface_id: 'runtime_watch/latest.json',
    event_name: 'runtime_watch.runtime_scanned',
    source_surface: 'runtime_watch',
    session_id: 'session-1',
    program_id: 'program-1',
    active_run_id: 'run-1',
    target_domain_id: 'medautoscience',
    human_gates: [{ gate_id: 'gate-1' }],
    event_envelope_surface: { ref_kind: 'json_pointer', ref: '/foo' },
    checkpoint_lineage_surface: { ref_kind: 'json_pointer', ref: '/bar' },
  });

  assert.equal(payload.resume_contract.session_locator_field, 'event_envelope.session.session_id');
  assert.equal(payload.event_envelope.session.active_run_id, 'run-1');
  assert.equal(payload.checkpoint_lineage.lineage_id.startsWith('lineage-'), true);
});
```

- [ ] **Step 2: Run JS tests to verify they fail**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/family-orchestration.test.ts`

Expected: FAIL because `src/family-orchestration.ts` does not exist yet.

- [ ] **Step 3: Write the minimal JS implementation**

Implement `src/family-orchestration.ts` by extracting the currently repeated family-orchestration core semantics:

- stable id generation
- program/run resolution
- human gate normalization
- event envelope builder
- checkpoint lineage builder
- resume contract defaults

Keep graph nodes, route ids, and domain wording outside this file.

- [ ] **Step 4: Write the failing Python tests**

Create `python/opl-harness-shared/tests/test_family_orchestration.py` with equivalent coverage:

```python
from opl_harness_shared.family_orchestration import (
    build_family_human_gate,
    build_family_orchestration_companion,
    resolve_active_run_id,
    resolve_program_id,
)


def test_build_family_human_gate_normalizes_required_fields() -> None:
    gate = build_family_human_gate(
        gate_id="gate-1",
        gate_kind="operator_review",
        requested_at="2026-04-18T00:00:00Z",
        request_surface_kind="runtime_watch",
        request_surface_id="runtime_watch/latest.json",
        evidence_refs=[{"ref_kind": "repo_path", "ref": "foo.json", "label": "foo"}],
        decision_options=["approve", "pause"],
    )
    assert gate["gate_id"] == "gate-1"
    assert gate["request_surface"]["surface_kind"] == "runtime_watch"


def test_build_family_orchestration_companion_materializes_event_and_lineage() -> None:
    payload = build_family_orchestration_companion(
        surface_kind="runtime_watch",
        surface_id="runtime_watch/latest.json",
        event_name="runtime_watch.runtime_scanned",
        source_surface="runtime_watch",
        session_id="session-1",
        program_id="program-1",
        active_run_id="run-1",
        target_domain_id="medautoscience",
        human_gates=[{"gate_id": "gate-1"}],
        event_envelope_surface={"ref_kind": "json_pointer", "ref": "/foo"},
        checkpoint_lineage_surface={"ref_kind": "json_pointer", "ref": "/bar"},
    )
    assert payload["resume_contract"]["session_locator_field"] == "event_envelope.session.session_id"
    assert payload["event_envelope"]["session"]["active_run_id"] == "run-1"
```

- [ ] **Step 5: Run Python tests to verify they fail**

Run: `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_family_orchestration.py -q`

Expected: FAIL because the new module is not exported yet.

- [ ] **Step 6: Write the minimal Python implementation and export it**

Implement `family_orchestration.py` with the same normalized behavior as the JS module and export it from `__init__.py`.

- [ ] **Step 7: Run focused JS and Python tests to verify they pass**

Run:

- `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/family-orchestration.test.ts`
- `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_family_orchestration.py -q`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add \
  tests/src/family-orchestration.test.ts \
  src/family-orchestration.ts \
  python/opl-harness-shared/src/opl_harness_shared/family_orchestration.py \
  python/opl-harness-shared/src/opl_harness_shared/__init__.py \
  python/opl-harness-shared/tests/test_family_orchestration.py
git commit -m "feat: add shared family orchestration helpers"
```

### Task 2: Freeze OPL shared runtime/task, skill, and automation descriptors

**Files:**
- Create: `src/runtime-task-companions.ts`
- Create: `src/skill-catalog.ts`
- Create: `src/automation-companions.ts`
- Create: `python/opl-harness-shared/src/opl_harness_shared/runtime_task_companions.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/skill_catalog.py`
- Create: `python/opl-harness-shared/src/opl_harness_shared/automation_companions.py`
- Modify: `python/opl-harness-shared/src/opl_harness_shared/__init__.py`
- Test: `tests/src/runtime-task-companions.test.ts`
- Test: `tests/src/skill-catalog.test.ts`
- Test: `tests/src/automation-companions.test.ts`
- Test: `python/opl-harness-shared/tests/test_runtime_task_companions.py`
- Test: `python/opl-harness-shared/tests/test_skill_catalog.py`
- Test: `python/opl-harness-shared/tests/test_automation_companions.py`

- [ ] **Step 1: Write failing JS tests for runtime/task descriptors**

Cover normalized builders for:

- `buildRuntimeInventory`
- `buildTaskLifecycle`
- `buildCheckpointSummary`
- `buildTaskSurfaceDescriptor`

Use one MAS-like sample, one MAG-like sample, and one RCA-like sample in the tests.

- [ ] **Step 2: Verify the runtime/task tests fail**

Run: `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/runtime-task-companions.test.ts`

Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Implement minimal JS runtime/task builders**

Keep them generic and fail-closed:

- required ids, status, summary, surface refs
- optional domain-specific payload nested under `domain_projection`

- [ ] **Step 4: Write failing JS tests for skill catalog and automation descriptors**

Cover:

- `buildSkillDescriptor`
- `buildSkillCatalog`
- `buildAutomationDescriptor`
- `buildAutomationCatalog`

Use current repo data patterns:

- MAS `supported_commands / command_contracts / medical_overlay_skills`
- MAG `supported_commands / command_contracts / automation_scope`
- RCA frontdesk/operator commands and autopilot continuation metadata

- [ ] **Step 5: Verify the skill and automation tests fail**

Run:

- `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/skill-catalog.test.ts`
- `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/automation-companions.test.ts`

Expected: FAIL

- [ ] **Step 6: Implement minimal JS skill and automation builders**

Require canonical shared fields:

- descriptor id
- owner
- surface kind
- command or target surface
- distribution mode
- readiness or gate policy

- [ ] **Step 7: Write failing Python equivalents**

Create matching pytest files for runtime/task, skill catalog, and automation helpers.

- [ ] **Step 8: Verify the Python tests fail**

Run:

- `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_runtime_task_companions.py -q`
- `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_skill_catalog.py -q`
- `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_automation_companions.py -q`

Expected: FAIL

- [ ] **Step 9: Implement the Python modules and export them**

Mirror the JS contract names and fail-closed rules.

- [ ] **Step 10: Run all new shared helper tests**

Run:

- `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/runtime-task-companions.test.ts tests/src/skill-catalog.test.ts tests/src/automation-companions.test.ts`
- `PYTHONPATH=python/opl-harness-shared/src uv run --directory python/opl-harness-shared pytest tests/test_runtime_task_companions.py tests/test_skill_catalog.py tests/test_automation_companions.py -q`

Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add \
  src/runtime-task-companions.ts \
  src/skill-catalog.ts \
  src/automation-companions.ts \
  tests/src/runtime-task-companions.test.ts \
  tests/src/skill-catalog.test.ts \
  tests/src/automation-companions.test.ts \
  python/opl-harness-shared/src/opl_harness_shared/runtime_task_companions.py \
  python/opl-harness-shared/src/opl_harness_shared/skill_catalog.py \
  python/opl-harness-shared/src/opl_harness_shared/automation_companions.py \
  python/opl-harness-shared/src/opl_harness_shared/__init__.py \
  python/opl-harness-shared/tests/test_runtime_task_companions.py \
  python/opl-harness-shared/tests/test_skill_catalog.py \
  python/opl-harness-shared/tests/test_automation_companions.py
git commit -m "feat: add shared runtime task skill and automation helpers"
```

### Task 3: Upgrade OPL top-level consumers to normalize and expose the new shared surfaces

**Files:**
- Modify: `src/domain-manifest.ts`
- Modify: `src/handoff-bundle.ts`
- Historical target: `src/management.ts`（已退役；当前实现使用 `src/management/*` leaf surfaces）
- Modify: `src/product-entry.ts`
- Modify: `src/web-frontdesk.ts`
- Test: focused consumer tests already covering manifests, handoff, management, and web startup payloads

- [ ] **Step 1: Add failing OPL consumer tests for new normalized surfaces**

Update existing tests to assert that normalized manifests and downstream bundles now include:

- `runtime_inventory`
- `task_lifecycle`
- `skill_catalog`
- `automation`

- [ ] **Step 2: Run the focused consumer tests to verify they fail**

Run the smallest relevant existing test commands for domain manifest, handoff bundle, management, and web frontdesk payloads.

Expected: FAIL because the new surfaces are not normalized yet.

- [ ] **Step 3: Implement the normalization changes**

Use the new shared helper contracts to normalize the four surfaces in `domain-manifest.ts`, then thread them through handoff, management, product-entry, and web frontdesk.

- [ ] **Step 4: Re-run the focused consumer tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/domain-manifest.ts \
  src/handoff-bundle.ts \
  src/management/* \
  src/product-entry.ts \
  src/web-frontdesk.ts \
  <focused-opl-consumer-tests>
git commit -m "feat: expose shared runtime task skill and automation surfaces"
```

### Task 4: Migrate MAS to shared family boundary modules while preserving the MAS monorepo seam

**Files:**
- Modify: `src/med_autoscience/controllers/study_runtime_family_orchestration.py`
- Modify: `src/med_autoscience/controllers/product_entry.py`
- Modify: `src/med_autoscience/controllers/runtime_watch.py`
- Modify: `src/med_autoscience/controllers/study_runtime_decision.py`
- Modify: `src/med_autoscience/domain_entry_contract.py`
- Modify: `src/med_autoscience/policies/automation_ready.py`
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Test: focused MAS tests

- [ ] **Step 1: Write or update failing MAS tests for the new family surfaces**

Cover:

- manifest exposes shared `family_orchestration / runtime_inventory / task_lifecycle / skill_catalog / automation`
- runtime watch and runtime decision still produce the same domain truth, but now project through shared helpers

- [ ] **Step 2: Run focused MAS tests to verify they fail**

Run:

- `uv run pytest tests/test_product_entry.py tests/test_runtime_contract_docs.py -q`
- add the smallest runtime watch / orchestration-focused test files that exercise the new fields

Expected: FAIL on missing new surfaces or old builder assumptions.

- [ ] **Step 3: Implement the MAS adapters**

Rules:

- use shared `family_orchestration` builder for event envelope, checkpoint lineage, resume contract, and human gate normalization
- use shared runtime/task descriptors to map study runtime truth outward
- use shared skill catalog descriptors for domain entry command contracts and medical overlay skill projection
- use shared automation descriptors for automation-ready summary and runtime supervision readiness
- keep MDS-dependent runtime extraction local

- [ ] **Step 4: Run focused MAS tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/med_autoscience/controllers/study_runtime_family_orchestration.py \
  src/med_autoscience/controllers/product_entry.py \
  src/med_autoscience/controllers/runtime_watch.py \
  src/med_autoscience/controllers/study_runtime_decision.py \
  src/med_autoscience/domain_entry_contract.py \
  src/med_autoscience/policies/automation_ready.py \
  pyproject.toml \
  uv.lock \
  <focused-mas-tests>
git commit -m "refactor: align mas family surfaces with shared modules"
```

### Task 5: Migrate MAG to shared family boundary modules

**Files:**
- Modify: `src/med_autogrant/product_entry.py`
- Modify: `src/med_autogrant/route_report.py`
- Modify: `src/med_autogrant/hermes_runtime.py`
- Modify: `src/med_autogrant/submission_ready.py`
- Modify: `src/med_autogrant/hosted_contract_bundle.py`
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Test: focused MAG tests

- [ ] **Step 1: Write or update failing MAG tests for the new family surfaces**

Assert manifest and related projections expose:

- shared family orchestration
- shared task lifecycle/checkpoint descriptor
- shared skill catalog
- shared automation descriptor

- [ ] **Step 2: Run focused MAG tests to verify they fail**

Run the smallest product-entry, route report, hosted bundle, and submission readiness tests that exercise those surfaces.

Expected: FAIL

- [ ] **Step 3: Implement the MAG adapters**

Map:

- route truth and checkpoint truth -> shared task lifecycle
- domain entry command contracts -> shared skill catalog
- automation scope and route-driven readiness -> shared automation

- [ ] **Step 4: Run focused MAG tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/med_autogrant/product_entry.py \
  src/med_autogrant/route_report.py \
  src/med_autogrant/hermes_runtime.py \
  src/med_autogrant/submission_ready.py \
  src/med_autogrant/hosted_contract_bundle.py \
  pyproject.toml \
  uv.lock \
  <focused-mag-tests>
git commit -m "refactor: align mag family surfaces with shared modules"
```

### Task 6: Migrate RCA to shared family boundary modules

**Files:**
- Modify: `packages/redcube-gateway/src/actions/family-orchestration-companion.js`
- Modify: `packages/redcube-gateway/src/actions/get-product-entry-manifest.js`
- Modify: `packages/redcube-gateway/src/actions/get-product-entry-session.js`
- Modify: `packages/redcube-gateway/src/types.ts`
- Modify: `packages/redcube-gateway/package.json`
- Modify: `package-lock.json`
- Test: focused RCA tests

- [ ] **Step 1: Write or update failing RCA tests for the new family surfaces**

Assert manifest and session outputs expose:

- shared family orchestration fields
- shared runtime/task descriptor
- shared skill catalog
- shared automation descriptor

- [ ] **Step 2: Run focused RCA tests to verify they fail**

Run:

- `node --test tests/product-entry.test.js tests/mcp-gateway.test.js`
- add `tests/product-entry-session.test.js` if needed for session-specific assertions

Expected: FAIL

- [ ] **Step 3: Implement the RCA adapters**

Map:

- product entry session and rerun lineage -> shared task lifecycle
- product/frontdesk command surfaces -> shared skill catalog
- autopilot continuation board and governance truth -> shared automation descriptor

- [ ] **Step 4: Run focused RCA tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  packages/redcube-gateway/src/actions/family-orchestration-companion.js \
  packages/redcube-gateway/src/actions/get-product-entry-manifest.js \
  packages/redcube-gateway/src/actions/get-product-entry-session.js \
  packages/redcube-gateway/src/types.ts \
  packages/redcube-gateway/package.json \
  package-lock.json \
  <focused-rca-tests>
git commit -m "refactor: align rca family surfaces with shared modules"
```

### Task 7: Sync docs/status truth and perform cross-repo verification + absorb

**Files:**
- Modify: `docs/status.md` in OPL, MAS, MAG, RCA
- Modify: any affected repo docs that describe live shared boundary truth

- [ ] **Step 1: Update docs/status truth**

Make each repo state clearly that `family_orchestration / runtime_inventory / task_lifecycle / skill_catalog / automation` shared boundary modules are now centrally owned by `OPL`.

- [ ] **Step 2: Run fresh focused verification in all four worktrees**

Use the focused commands proven during implementation, plus repo-specific meta lanes where docs or contracts changed.

- [ ] **Step 3: Fast-forward absorb to each root `main`**

Run, in order:

- OPL root `git merge --ff-only codex/family-runtime-task-skill-automation`
- MAS root `git merge --ff-only codex/family-runtime-task-skill-automation`
- MAG root `git merge --ff-only codex/family-runtime-task-skill-automation`
- RCA root `git merge --ff-only codex/family-runtime-task-skill-automation`

- [ ] **Step 4: Push all four `main` branches**

Run: `git push origin main` in each root checkout.

- [ ] **Step 5: Clean up worktrees and branches**

Run:

```bash
git worktree remove <path>
git branch -d codex/family-runtime-task-skill-automation
```

- [ ] **Step 6: Final status check**

Run in each repo:

```bash
git status --short --branch
git worktree list
```

Expected: root `main...origin/main`, no residue from this lane.

## Self-Review

- Spec coverage: this plan covers the shared central modules, OPL consumer upgrades, MAS monorepo-compatible adapter seam, MAG adapter seam, RCA adapter seam, docs sync, verification, absorb, push, and cleanup.
- Placeholder scan: command placeholders remain only where the exact existing focused test file depends on current repo test names and must be filled from live repo context during execution. Before claiming completion, replace every `<focused-...>` placeholder with the actual file paths used in this rollout.
- Type consistency: shared surface names are fixed as `family_orchestration`, `runtime_inventory`, `task_lifecycle`, `skill_catalog`, and `automation`. Keep these exact names across OPL, MAS, MAG, and RCA.
