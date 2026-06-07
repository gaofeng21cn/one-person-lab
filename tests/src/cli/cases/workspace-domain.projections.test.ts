import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

function readJsonFile(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('workspace ensure refreshes generated refs when reusing an active binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-refresh-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-refresh-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    for (const relativePath of [
      'workspace_inspection.json',
      'workspace_resource_inventory.json',
      'projects/deck-001/artifacts/stage_outputs/stage_outputs_index.json',
      'projects/deck-001/artifacts/stage_outputs/current_stage.json',
    ]) {
      fs.rmSync(path.join(workspacePath, relativePath));
    }

    const ensured = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--project-id',
      'deck-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(ensured.workspace_initialization.ensure_status, 'reused_active_binding');
    assert.equal(ensured.workspace_initialization.workspace_inspection_path, path.join(workspacePath, 'workspace_inspection.json'));
    assert.equal(ensured.workspace_initialization.workspace_resource_inventory_path, path.join(workspacePath, 'workspace_resource_inventory.json'));
    assert.equal(
      ensured.workspace_initialization.written_generated_files.includes(path.join(
        workspacePath,
        'deliverables',
        'deck-001',
        'artifacts',
        'stage_outputs',
        'stage_outputs_index.json',
      )),
      true,
    );
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_inspection.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_resource_inventory.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    )).isFile(), true);
    assert.equal(runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_doctor.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace validate and doctor inspect generated workspace topology semantics', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-validate-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-validate-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    const validation = runCli(['workspace', 'validate', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(validation.workspace_validation.status, 'passed');
    assert.equal(validation.workspace_validation.canonical_topology.project_unit_kind, 'slide_deck');
    assert.equal(validation.workspace_validation.display_labels.project_collection, 'deliverables');
    assert.equal(validation.workspace_validation.shared_resources[1].role, 'brand_assets');

    const doctor = runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(doctor.workspace_doctor.status, 'passed');
    assert.deepEqual(doctor.workspace_doctor.blockers, []);
    assert.equal(doctor.workspace_doctor.indexed_projects[0].project_id, 'deck-001');

    fs.rmSync(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'opl_stage_outputs_manifest.json',
    ));
    fs.rmSync(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    ));
    const blocked = runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(blocked.workspace_doctor.status, 'blocked');
    assert.equal(
      blocked.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'indexed_stage_outputs_manifest_missing'
      )),
      true,
    );
    assert.equal(
      blocked.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'indexed_current_stage_pointer_missing'
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace adopt apply materializes OPL metadata and generated inspection refs', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-adopt-apply-'));

  try {
    const output = runCli([
      'workspace',
      'adopt',
      '--agent',
      'rca',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--apply',
    ]);

    assert.equal(output.workspace_adoption.status, 'applied');
    assert.equal(output.workspace_adoption.write_allowed, true);
    assert.equal(output.workspace_adoption.profile.profile_id, 'rca_series');
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_index.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_map.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_health.json')).isFile(), true);
    assert.equal(output.workspace_adoption.workspace_inspection_path, path.join(workspacePath, 'workspace_inspection.json'));
    assert.equal(output.workspace_adoption.workspace_resource_inventory_path, path.join(workspacePath, 'workspace_resource_inventory.json'));
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_inspection.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_resource_inventory.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'opl_stage_outputs_manifest.json',
    )).isFile(), true);
    const validation = runCli(['workspace', 'validate', '--workspace', workspacePath]);
    assert.equal(validation.workspace_validation.status, 'passed');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('workspace upgrade restores generated manifests without moving project roots', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-upgrade-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-upgrade-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'mag',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'nsfc-p2c',
      '--project-id',
      'grant-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const workspacePath = path.join(workspaceRoot, 'nsfc-p2c');
    fs.rmSync(path.join(workspacePath, 'shared', 'memory', 'opl_resource_manifest.json'));
    fs.rmSync(path.join(workspacePath, 'workspace_map.json'));
    fs.rmSync(path.join(
      workspacePath,
      'deliverables',
      'grant-001',
      'artifacts',
      'stage_outputs',
      'stage_outputs_index.json',
    ));
    const currentPointerPath = path.join(
      workspacePath,
      'deliverables',
      'grant-001',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    );
    const currentPointer = readJsonFile(currentPointerPath);
    currentPointer.current_stage = {
      stage_id: 'draft',
      status: 'active',
    };
    currentPointer.current_stage_manifest_ref = 'projects/grant-001/artifacts/stage_outputs/draft/stage_manifest.json';
    currentPointer.latest_owner_receipt_ref = 'projects/grant-001/artifacts/stage_outputs/draft/receipts/owner_receipt.json';
    currentPointer.latest_typed_blocker_ref = null;
    fs.writeFileSync(currentPointerPath, `${JSON.stringify(currentPointer, null, 2)}\n`);

    const dryRun = runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--dry-run'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(dryRun.workspace_upgrade.status, 'dry_run_ready');
    assert.equal(dryRun.workspace_upgrade.write_allowed, false);
    assert.equal(fs.existsSync(path.join(workspacePath, 'workspace_map.json')), false);

    const applied = runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--apply'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(applied.workspace_upgrade.status, 'applied');
    assert.equal(applied.workspace_upgrade.authority_boundary.upgrade_moves_project_roots, false);
    assert.equal(fs.statSync(path.join(workspacePath, 'shared', 'memory', 'opl_resource_manifest.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'workspace_map.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(
      workspacePath,
      'deliverables',
      'grant-001',
      'artifacts',
      'stage_outputs',
      'stage_outputs_index.json',
    )).isFile(), true);
    const upgradedCurrentPointer = readJsonFile(currentPointerPath);
    assert.deepEqual(upgradedCurrentPointer.current_stage, {
      stage_id: 'draft',
      status: 'active',
    });
    assert.equal(
      upgradedCurrentPointer.latest_owner_receipt_ref,
      'projects/grant-001/artifacts/stage_outputs/draft/receipts/owner_receipt.json',
    );
    assert.equal(runCli(['workspace', 'validate', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_validation.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace doctor blocks invalid current pointer refs', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-pointer-shape-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'mag',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'nsfc-p2c',
      '--project-id',
      'grant-001',
    ]);
    const workspacePath = path.join(workspaceRoot, 'nsfc-p2c');
    const pointerPath = path.join(
      workspacePath,
      'deliverables',
      'grant-001',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    );
    const pointer = readJsonFile(pointerPath);
    pointer.latest_owner_receipt_ref = { invalid: true };
    fs.writeFileSync(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);

    const doctor = runCli(['workspace', 'doctor', '--workspace', workspacePath]);
    assert.equal(doctor.workspace_doctor.status, 'blocked');
    assert.equal(
      doctor.workspace_doctor.blockers.some((entry: { code: string; details?: { drift_fields?: string[] } }) => (
        entry.code === 'indexed_current_stage_pointer_drift'
        && entry.details?.drift_fields?.includes('latest_owner_receipt_ref')
      )),
      true,
    );
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
