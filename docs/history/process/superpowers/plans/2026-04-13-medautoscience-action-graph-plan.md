# 历史实施计划：medautoscience action_graph coverage

Owner: `One Person Lab`
Purpose: `historical_superpowers_worker_plan`
State: `history_only`
Machine boundary: 本文是早期 worker plan 归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned MAS surfaces 和真实验证 evidence。

> 历史读法：本文保留 2026-04-13 的 MAS action graph consumer coverage 任务包。下面的 `Goal`、`Architecture`、`Task`、checkbox、命令和 expected result 只按当时计划阅读；当前 action/stage/domain projection 边界回到核心五件套、active gap、MAS owner surfaces 和 OPL read models，不作为当前 implementation queue 或 readiness evidence。

> 历史生成说明：本文由早期 Superpowers worker-flow 生成；原文要求 agent 按 sub-skill 和 checkbox 执行。当前只保留为历史 provenance，不再作为执行指令。

**历史目标：** Ensure the medautoscience manifest/dashboard/handoff consumers expose the MAS family action graph reference, id, and node/edge counts so regressions are caught in the CLI tests.

**历史架构：** Extend the existing CLI fixtures-based tests to assert the MAS action graph payload at every consumption point (domain manifests, dashboard recommended surfaces, and handoff bundles) by referencing the fixture in `tests/src/cli.test.ts`.

**历史技术栈：** Node 20+ test runner (`node --test`), TypeScript CLI sources under `src/`, CLI fixture JSON files.

---

### 历史步骤 1： Increase CLI test coverage for MAS action graph fields

**Files:**
- Modify: `tests/src/cli.test.ts`
- Test: `tests/src/cli.test.ts`

- 历史项：**Step 1: Write the failing assertions for the domain-manifests test**

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

- 历史项：**Step 2: Run the domain CLI test suite to capture the new failure**

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
      'uv run python -m med_autoscience.cli product-frontdoor --profile /fixtures/med-autoscience/profile.local.toml',
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

- 历史项：**Step 4: Re-run `npm run test:fast` to confirm all assertions passed in that historical plan**

```
npm run test:fast
```

Expected: PASS; the CLI outputs already include the MAS action graph fields, so the new assertions succeed.

- 历史项：**Step 5: Commit the tests**

```bash
git add tests/src/cli.test.ts
git commit -m "test: assert MAS action graph on CLI surfaces"
```
