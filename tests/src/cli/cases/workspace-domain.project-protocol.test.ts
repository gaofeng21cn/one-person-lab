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

test('workspace init materializes project unit metadata and stage output required shape', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-protocol-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-protocol-root-'));

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
    const projectRoot = path.join(workspacePath, 'deliverables', 'deck-001');

    for (const relativePath of [
      'inputs',
      'artifacts/stage_outputs',
      'artifacts/exports',
      'artifacts/packages',
      'archive',
    ]) {
      assert.equal(fs.statSync(path.join(projectRoot, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    const project = workspaceIndex.projects[0];
    assert.equal(project.canonical_semantics.unit, 'project_unit');
    assert.equal(project.canonical_semantics.collection_role, 'project_units');
    assert.equal(project.canonical_semantics.domain_alias_is_canonical, false);
    assert.equal(project.project_config_ref, 'deliverables/deck-001/project.yaml');
    assert.equal(project.project_index_ref, 'deliverables/deck-001/project_index.json');
    assert.equal(project.stage_outputs_index_ref, 'deliverables/deck-001/artifacts/stage_outputs/stage_outputs_index.json');
    assert.equal(project.current_stage_pointer_ref, 'deliverables/deck-001/artifacts/stage_outputs/current_stage.json');
    assert.equal(project.inputs_root, 'deliverables/deck-001/inputs');
    assert.equal(project.exports_root, 'deliverables/deck-001/artifacts/exports');
    assert.equal(project.packages_root, 'deliverables/deck-001/artifacts/packages');
    assert.equal(project.archive_root, 'deliverables/deck-001/archive');

    const projectYaml = fs.readFileSync(path.join(projectRoot, 'project.yaml'), 'utf8');
    assert.match(projectYaml, /unit: project_unit/);
    assert.match(projectYaml, /stage_folder_pattern: <project-root>\/artifacts\/stage_outputs\/<stage-id>\//);
    assert.match(projectYaml, /project_config_can_replace_owner_receipt: false/);

    const projectIndex = readJsonFile(path.join(projectRoot, 'project_index.json'));
    assert.equal(projectIndex.surface_kind, 'opl_workspace_project_index');
    assert.equal(projectIndex.canonical_semantics.unit, 'project_unit');
    assert.equal(projectIndex.canonical_semantics.collection_role, 'project_units');
    assert.equal(projectIndex.canonical_semantics.domain_alias_is_canonical, false);
    assert.deepEqual(projectIndex.stage_artifact_unit.required_directories, [
      'inputs',
      'outputs',
      'review',
      'receipts',
      'handoff',
    ]);
    assert.deepEqual(projectIndex.stage_artifact_unit.required_files, ['stage_manifest.json']);
    assert.equal(projectIndex.stage_artifact_unit.index_ref, 'deliverables/deck-001/artifacts/stage_outputs/stage_outputs_index.json');
    assert.equal(projectIndex.stage_artifact_unit.current_stage_pointer_ref, 'deliverables/deck-001/artifacts/stage_outputs/current_stage.json');
    assert.deepEqual(projectIndex.stage_artifact_unit.lifecycle_model, [
      'open',
      'active',
      'completed',
      'blocked',
      'superseded',
      'archived',
    ]);
    assert.equal(projectIndex.authority_boundary.project_index_can_claim_stage_complete, false);

    const stageOutputsManifest = readJsonFile(path.join(
      projectRoot,
      'artifacts',
      'stage_outputs',
      'opl_stage_outputs_manifest.json',
    ));
    assert.deepEqual(stageOutputsManifest.stage_folder_required_shape.required_directories, [
      'inputs',
      'outputs',
      'review',
      'receipts',
      'handoff',
    ]);
    assert.deepEqual(stageOutputsManifest.stage_folder_required_shape.required_files, ['stage_manifest.json']);
    assert.equal(stageOutputsManifest.stage_artifact_runtime.stage_folder_shape_is_completion_proof, false);
    assert.equal(stageOutputsManifest.authority_boundary.stage_folder_shape_can_replace_owner_receipt, false);
    const stageOutputsIndex = readJsonFile(path.join(
      projectRoot,
      'artifacts',
      'stage_outputs',
      'stage_outputs_index.json',
    ));
    assert.equal(stageOutputsIndex.surface_kind, 'opl_stage_outputs_index');
    assert.equal(stageOutputsIndex.authority_boundary.index_can_replace_typed_blocker, false);
    const currentStagePointer = readJsonFile(path.join(
      projectRoot,
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    ));
    assert.equal(currentStagePointer.surface_kind, 'opl_current_stage_pointer');
    assert.equal(currentStagePointer.authority_boundary.pointer_can_claim_stage_complete, false);

    const validation = runCli(['workspace', 'validate', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(validation.workspace_validation.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace upgrade restores project unit protocol refs without moving roots', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-upgrade-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-upgrade-root-'));

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
    const projectRoot = path.join(workspacePath, 'deliverables', 'grant-001');
    fs.rmSync(path.join(projectRoot, 'project_index.json'));
    fs.rmSync(path.join(projectRoot, 'artifacts', 'exports'), { recursive: true, force: true });

    const blocked = runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(blocked.workspace_doctor.status, 'blocked');
    assert.equal(
      blocked.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'indexed_project_index_missing'
      )),
      true,
    );
    assert.equal(
      blocked.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'indexed_exports_root_missing'
      )),
      true,
    );

    const upgraded = runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--apply'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(upgraded.workspace_upgrade.authority_boundary.upgrade_moves_project_roots, false);
    assert.equal(fs.statSync(path.join(projectRoot, 'project_index.json')).isFile(), true);
    assert.equal(fs.statSync(path.join(projectRoot, 'artifacts', 'exports')).isDirectory(), true);
    assert.equal(runCli(['workspace', 'validate', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_validation.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace doctor blocks MAS alias drift and invalid stage lifecycle drift', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-drift-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-drift-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'mas',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'dm-cvd',
      '--project-id',
      'DM002',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'dm-cvd');
    const workspaceIndexPath = path.join(workspacePath, 'workspace_index.json');
    const workspaceIndex = readJsonFile(workspaceIndexPath);
    workspaceIndex.canonical_topology.project_collection_role = 'studies';
    workspaceIndex.projects[0].canonical_semantics.unit = 'study';
    workspaceIndex.projects[0].canonical_semantics.domain_alias_is_canonical = true;
    fs.writeFileSync(workspaceIndexPath, `${JSON.stringify(workspaceIndex, null, 2)}\n`);

    const aliasDrift = runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(aliasDrift.workspace_doctor.status, 'blocked');
    assert.equal(
      aliasDrift.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'canonical_topology_drift'
      )),
      true,
    );

    const restored = runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--apply'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(restored.workspace_upgrade.status, 'applied');
    const currentPointerPath = path.join(
      workspacePath,
      'studies',
      'DM002',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    );
    const currentPointer = readJsonFile(currentPointerPath);
    currentPointer.current_stage = {
      stage_id: 'draft',
      status: 'success',
    };
    fs.writeFileSync(currentPointerPath, `${JSON.stringify(currentPointer, null, 2)}\n`);

    const stageDrift = runCli(['workspace', 'doctor', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(stageDrift.workspace_doctor.status, 'blocked');
    assert.equal(
      stageDrift.workspace_doctor.blockers.some((entry: { code: string }) => (
        entry.code === 'indexed_current_stage_pointer_drift'
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
