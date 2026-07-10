import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

test('runtime snapshot ingests domain-owned projection refs without claiming domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-projection-ingestion-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = structuredClone(fixtures.medautoscience);
  const redcubeManifest = structuredClone(fixtures.redcube);

  masManifest.runtime_inventory = {
    ...(masManifest.runtime_inventory as Record<string, unknown>),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
      quality_verdict: 'ready',
    },
  };
  masManifest.task_lifecycle = {
    ...(masManifest.task_lifecycle as Record<string, unknown>),
    domain_projection: {
      surface_kind: 'mas_task_lifecycle_projection',
      owner: 'med-autoscience',
      source_ref: 'mas://runtime/task-lifecycle/latest.json',
    },
  };
  masManifest.progress_projection = {
    ...(masManifest.progress_projection as Record<string, unknown>),
    session_id: 'mas-runtime-session',
    headline: 'MAS projection fixture',
    attention_items: ['MAS projection attention'],
    domain_projection: {
      surface_kind: 'mas_progress_projection',
      research_runtime_control_projection: {
        surface_kind: 'research_runtime_control_projection',
        source_refs: ['mas://runtime/control/latest.json'],
        operator_route_lens_refs: ['mas://runtime/operator-route/latest.json'],
      },
      publication_quality_verdict: 'ready',
    },
  };
  masManifest.artifact_inventory = {
    ...(masManifest.artifact_inventory as Record<string, unknown>),
    domain_projection: {
      surface_kind: 'mas_artifact_inventory_projection',
      export_verdict: 'ready',
      artifact_refs: ['mas://artifacts/current-package.zip'],
    },
  };

  redcubeManifest.runtime_inventory = {
    ...(redcubeManifest.runtime_inventory as Record<string, unknown>),
    domain_projection: {
      surface_kind: 'rca_runtime_inventory_projection',
      source_refs: ['rca://runtime/inventory/latest.json'],
    },
  };
  redcubeManifest.skill_catalog = {
    ...(redcubeManifest.skill_catalog as Record<string, unknown>),
    skills: [
      {
        ...(((redcubeManifest.skill_catalog as Record<string, unknown>).skills as Record<string, unknown>[])[0]),
        domain_projection: {
          surface_kind: 'rca_skill_projection',
          skill_activation: {
            surface_kind: 'skill_activation_projection',
            source_refs: ['rca://skills/redcube/latest.json'],
          },
        },
      },
    ],
  };
  redcubeManifest.progress_projection = {
    ...((redcubeManifest.progress_projection as Record<string, unknown> | undefined) ?? {}),
    session_id: 'redcube-runtime-session',
    headline: 'RedCube projection fixture',
    attention_items: ['RedCube projection attention'],
  };
  redcubeManifest.controlled_stage_attempt_projection = {
    surface_kind: 'rca_controlled_stage_attempt_projection',
    owner_receipt_schema_ref: 'rca://contracts/owner-receipt.schema.json',
    source_refs: ['rca://runtime/controlled-stage-attempt/latest.json'],
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(redcubeManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const projection = output.runtime_tray_snapshot.domain_projection_ingestion;
    const trayItems = [
      ...output.runtime_tray_snapshot.running_items,
      ...output.runtime_tray_snapshot.attention_items,
      ...output.runtime_tray_snapshot.recent_items,
    ];
    const masTrayItem = trayItems.find((item: { project_id: string }) => item.project_id === 'medautoscience');
    const redcubeTrayItem = trayItems.find((item: { project_id: string }) => item.project_id === 'redcube');

    assert.equal(projection.surface_kind, 'opl_domain_projection_ingestion_projection');
    assert.equal(projection.projection_scope, 'runtime_snapshot');
    assert.equal(projection.ingestion_policy, 'manifest_projection_refs_only_no_domain_truth_reduction');
    assert.equal(projection.summary.domain_count, 2);
    assert.equal(projection.summary.projection_ref_count >= 7, true);
    assert.equal(projection.summary.by_domain.medautoscience >= 4, true);
    assert.equal(projection.summary.by_domain.redcube >= 3, true);
    assert.equal(masTrayItem?.project_label, 'Med Auto Science');
    assert.equal(redcubeTrayItem?.project_label, 'RedCube AI');
    assert.equal(projection.summary.by_surface.runtime_inventory >= 2, true);
    assert.equal(projection.summary.by_surface.controlled_stage_attempt_projection, 1);
    assert.equal(projection.items.length >= 7, true);
    for (const expectedPointer of [
      '/artifact_inventory/domain_projection',
      '/controlled_stage_attempt_projection',
      '/progress_projection/domain_projection',
      '/runtime_inventory/domain_projection',
      '/skill_catalog/skills/0/domain_projection',
      '/task_lifecycle/domain_projection',
    ]) {
      assert.equal(
        projection.items.some((item: { pointer: string }) => item.pointer === expectedPointer),
        true,
      );
    }
    assert.equal(
      projection.items.some((item: { projection_surface_kind: string }) =>
        item.projection_surface_kind === 'research_runtime_control_projection'
      ),
      true,
    );
    assert.equal(
      projection.items.some((item: { source_refs: string[] }) =>
        item.source_refs.includes('mas://runtime/control/latest.json')
      ),
      true,
    );
    assert.deepEqual(projection.items.find((item: { pointer: string }) =>
      item.pointer === '/progress_projection/domain_projection'
    )?.operator_route_lens_refs, [
      'mas://runtime/operator-route/latest.json',
    ]);
    assert.equal(projection.authority_boundary.can_read_domain_truth_body, false);
    assert.equal(projection.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(projection.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(projection.authority_boundary.can_mutate_domain_artifact, false);
    assert.equal(projection.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(projection.non_goals.includes('does_not_reduce_quality_or_export_verdict'), true);
    assert.equal(
      output.runtime_tray_snapshot.source_refs.some((ref: { role: string }) =>
        ref.role === 'domain_projection_ingestion'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
