# medautoscience action_graph coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the medautoscience manifest/dashboard/handoff consumers expose the MAS family action graph reference, id, and node/edge counts so regressions are caught in the CLI tests.

**Architecture:** Extend the existing CLI fixtures-based tests to assert the MAS action graph payload at every consumption point (domain manifests, dashboard recommended surfaces, and handoff bundles) by referencing the fixture in `tests/src/cli.test.ts`.

**Tech Stack:** Node 20+ test runner (`node --test`), TypeScript CLI sources under `src/`, CLI fixture JSON files.

---

### Task 1: Increase CLI test coverage for MAS action graph fields

**Files:**
- Modify: `tests/src/cli.test.ts`
- Test: `tests/src/cli.test.ts`

- [ ] **Step 1: Write the failing assertions for the domain-manifests test**

```ts
assert.equal(
  medautoscience.manifest.family_orchestration.action_graph_ref.ref,
  '/family_orchestration/action_graph',
);
assert.equal(
  medautoscience.manifest.family_orchestration.action_graph.graph_id,
  'mas_workspace_frontdoor_study_runtime_graph',
);
assert.equal(
  medautoscience.manifest.family_orchestration.action_graph.nodes.length,
  4,
);
assert.equal(
  medautoscience.manifest.family_orchestration.action_graph.edges.length,
  5,
);
```

- [ ] **Step 2: Run the domain CLI test suite to capture the new failure**

```
npm run test:fast
```

Expected: the new assertions fail once because MAS action graph data is not yet asserted (the CLI output might already satisfy them, but running the suite ensures we are in sync).

 - [ ] **Step 3: Add dashboard/handoff assertions to finish the coverage**

- ```ts
assert.equal(scienceEntry.family_action_graph_ref, '/family_orchestration/action_graph');
assert.equal(scienceEntry.family_action_graph_node_count, 4);
assert.equal(scienceEntry.family_action_graph_edge_count, 5);

// Later in the file, open a new medautoscience handoff test.
test('handoff-envelope routes a manuscript request to medautoscience and exposes the action graph', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handoff-state-'));
  try {
    runCli([
      'workspace-bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
      '--entry-command',
      'uv run python -m med_autoscience.cli product-frontdesk --profile /fixtures/med-autoscience/profile.local.toml',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    const output = runCli([
      'handoff-envelope',
      '--intent',
      'submission_delivery',
      '--target',
      'publication',
      'Prepare the manuscript package for journal review.',
      '--preferred-family',
      'ppt_deck',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    assert.equal(output.handoff_bundle.target_domain_id, 'medautoscience');
    const familyOrchestration = output.handoff_bundle.domain_manifest_recommendation?.family_orchestration ?? null;
    assert.equal(familyOrchestration?.action_graph_ref?.ref, '/family_orchestration/action_graph');
    assert.equal(familyOrchestration?.action_graph?.graph_id, 'mas_workspace_frontdoor_study_runtime_graph');
    assert.equal(familyOrchestration?.action_graph?.nodes.length, 4);
    assert.equal(familyOrchestration?.action_graph?.edges.length, 5);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
```

> Notes: `fixtures` (from `loadFamilyManifestFixtures()` near the domain-manifest test) supplies the MAS manifest fixture, and `repoRoot`/`buildManifestCommand` helpers already exist earlier in the file.
```

- [ ] **Step 4: Re-run `npm run test:fast` to confirm all assertions now pass**

```
npm run test:fast
```

Expected: PASS; the CLI outputs already include the MAS action graph fields, so the new assertions succeed.

- [ ] **Step 5: Commit the tests**

```bash
git add tests/src/cli.test.ts
git commit -m "test: assert MAS action graph on CLI surfaces"
```
