import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

function readJsonFile(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('workspace init materializes RCA series topology and binds the workspace', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-root-'));

  try {
    const output = runCli([
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
      '--title',
      'Visual Theme A',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    const projectRoot = path.join(workspacePath, 'deliverables', 'deck-001');

    assert.equal(output.workspace_initialization.action, 'init');
    assert.equal(output.workspace_initialization.agent.agent_id, 'rca');
    assert.equal(output.workspace_initialization.profile.profile_id, 'rca_series');
    assert.equal(output.workspace_initialization.profile.workspace_mode, 'series');
    assert.equal(output.workspace_initialization.workspace_path, workspacePath);
    assert.equal(output.workspace_initialization.project_root, projectRoot);
    assert.equal(output.workspace_initialization.binding?.project_id, 'redcube');

    for (const relativePath of [
      'shared/sources',
      'shared/brand',
      'shared/visual_memory',
      'shared/style_system',
      'shared/material_inventory',
      'deliverables',
      'deliverables/deck-001/control',
      'deliverables/deck-001/artifacts/stage_outputs',
      'deliverables/deck-001/review',
      'deliverables/deck-001/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceYaml = fs.readFileSync(path.join(workspacePath, 'workspace.yaml'), 'utf8');
    assert.match(workspaceYaml, /workspace_kind: visual_theme_workspace/);
    assert.match(workspaceYaml, /workspace_mode: series/);
    assert.match(workspaceYaml, /project_collection_path: deliverables/);
    assert.match(workspaceYaml, /project_stage_outputs_root: artifacts\/stage_outputs/);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.equal(workspaceIndex.surface_kind, 'opl_workspace_index');
    assert.equal(workspaceIndex.agent.agent_id, 'rca');
    assert.equal(workspaceIndex.agent.project_id, 'redcube');
    assert.equal(workspaceIndex.workspace_topology_profile.profile_id, 'rca_series');
    assert.deepEqual(workspaceIndex.canonical_topology, {
      workspace_unit: 'workspace_group',
      project_collection_role: 'project_units',
      project_collection_path: 'deliverables',
      project_unit_kind: 'slide_deck',
      stage_artifact_unit: 'stage_artifact_unit',
      stage_outputs_root: 'artifacts/stage_outputs',
      owner_answer_unit: 'owner_receipt_or_typed_blocker',
    });
    assert.deepEqual(workspaceIndex.display_labels, {
      workspace: 'visual_theme_workspace',
      project_collection: 'deliverables',
      project_unit: 'slide_deck',
      stage_outputs: 'artifacts/stage_outputs',
      shared_resources: 'shared_resources',
    });
    assert.deepEqual(
      workspaceIndex.shared_resources.map((entry: { path: string; role: string }) => [entry.path, entry.role]),
      [
        ['shared/sources', 'source_intake'],
        ['shared/brand', 'brand_assets'],
        ['shared/visual_memory', 'visual_memory'],
        ['shared/style_system', 'style_system'],
        ['shared/material_inventory', 'material_inventory'],
      ],
    );
    assert.equal(workspaceIndex.projects[0].project_id, 'deck-001');
    assert.equal(workspaceIndex.projects[0].stage_outputs_root, 'deliverables/deck-001/artifacts/stage_outputs');
    assert.equal(
      workspaceIndex.projects[0].stage_outputs_manifest_ref,
      'deliverables/deck-001/artifacts/stage_outputs/opl_stage_outputs_manifest.json',
    );
    assert.equal(workspaceIndex.projects[0].lifecycle.status, 'active');
    assert.equal(
      workspaceIndex.shared_resources[0].manifest_ref,
      'shared/sources/opl_resource_manifest.json',
    );
    assert.equal(workspaceIndex.generated_refs.workspace_map_ref, 'workspace_map.json');
    assert.equal(workspaceIndex.generated_refs.workspace_health_ref, 'workspace_health.json');
    assert.equal(workspaceIndex.generated_refs.workspace_inspection_ref, 'workspace_inspection.json');
    assert.equal(workspaceIndex.generated_refs.workspace_resource_inventory_ref, 'workspace_resource_inventory.json');
    assert.equal(workspaceIndex.generated_refs.stage_outputs_index_basename, 'stage_outputs_index.json');
    assert.equal(workspaceIndex.generated_refs.current_stage_pointer_basename, 'current_stage.json');
    assert.equal(workspaceIndex.user_inspection.default_stage_outputs, 'deliverables/deck-001/artifacts/stage_outputs');
    assert.equal(workspaceIndex.user_inspection.workspace_inspection_ref, 'workspace_inspection.json');
    assert.equal(workspaceIndex.user_inspection.workspace_resource_inventory_ref, 'workspace_resource_inventory.json');
    assert.equal(
      workspaceIndex.user_inspection.default_stage_outputs_index_ref,
      'deliverables/deck-001/artifacts/stage_outputs/stage_outputs_index.json',
    );
    assert.equal(
      workspaceIndex.user_inspection.default_current_stage_pointer_ref,
      'deliverables/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    assert.equal(workspaceIndex.workspace_norm.norm_id, 'opl.agent_workspace_norm.v1');
    assert.equal(workspaceIndex.workspace_norm.default_workspace_precondition.command, 'opl workspace ensure');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.profile, 'rca_series');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.canonical_project_collection_role, 'project_units');
    assert.deepEqual(
      workspaceIndex.workspace_norm.domain_topology_profile.project_semantic_aliases,
      ['slide_deck', 'deck', 'deliverable'],
    );
    assert.deepEqual(
      workspaceIndex.workspace_norm.topology_contract.stage_output_root_protocol.required_stage_folder_shape,
      ['inputs', 'outputs', 'review', 'receipts', 'handoff', 'stage_manifest.json'],
    );
    assert.equal(
      workspaceIndex.workspace_norm.descriptor_delegates.openai.delegates_to_action_id,
      'opl_workspace_ensure',
    );
    assert.equal(workspaceIndex.workspace_norm.descriptor_delegates.openai.descriptor_only, true);
    assert.equal(workspaceIndex.workspace_norm.descriptor_delegates.openai.public_runtime, false);
    assert.equal(workspaceIndex.workspace_norm.descriptor_delegates.ai_sdk.descriptor_only, true);
    assert.equal(workspaceIndex.workspace_norm.user_inspection.runtime_state_is_default_user_surface, false);
    assert.deepEqual(
      workspaceIndex.workspace_norm.user_inspection.canonical_user_inspection_roots,
      [
        '<project-root>/artifacts/stage_outputs',
        '<project-root>/artifacts/stage_outputs/<stage-id>/inputs',
        '<project-root>/artifacts/stage_outputs/<stage-id>/outputs',
        '<project-root>/artifacts/stage_outputs/<stage-id>/review',
        '<project-root>/artifacts/stage_outputs/<stage-id>/receipts',
        '<project-root>/artifacts/stage_outputs/<stage-id>/handoff',
        '<project-root>/artifacts/stage_outputs/<stage-id>/stage_manifest.json',
      ],
    );
    assert.equal(workspaceIndex.workspace_norm.authority_boundary.opl_can_create_owner_receipt, false);
    assert.equal(workspaceIndex.expected_domain_topology_profile.profile, 'rca_series');
    assert.equal(workspaceIndex.expected_domain_topology_profile.project_kind, 'slide_deck');
    const sharedManifest = readJsonFile(path.join(workspacePath, 'shared', 'sources', 'opl_resource_manifest.json'));
    assert.equal(sharedManifest.surface_kind, 'opl_shared_resource_manifest');
    assert.equal(sharedManifest.body_authority.manifest_is_index_only, true);
    const stageOutputsManifest = readJsonFile(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'opl_stage_outputs_manifest.json',
    ));
    assert.equal(stageOutputsManifest.surface_kind, 'opl_stage_outputs_root_manifest');
    assert.equal(stageOutputsManifest.stage_artifact_runtime.root_manifest_is_stage_completion_proof, false);
    assert.equal(
      stageOutputsManifest.stage_artifact_runtime.stage_outputs_index_ref,
      'deliverables/deck-001/artifacts/stage_outputs/stage_outputs_index.json',
    );
    assert.equal(
      stageOutputsManifest.stage_artifact_runtime.current_stage_pointer_ref,
      'deliverables/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    const stageOutputsIndex = readJsonFile(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'stage_outputs_index.json',
    ));
    assert.equal(stageOutputsIndex.surface_kind, 'opl_stage_outputs_index');
    assert.deepEqual(stageOutputsIndex.stage_lifecycle_model, [
      'open',
      'active',
      'completed',
      'blocked',
      'superseded',
      'archived',
    ]);
    assert.equal(stageOutputsIndex.stage_folder_protocol.closeout_answer_unit, 'owner_receipt_or_typed_blocker');
    assert.equal(stageOutputsIndex.authority_boundary.index_can_claim_stage_complete, false);
    const currentStagePointer = readJsonFile(path.join(
      workspacePath,
      'deliverables',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'current_stage.json',
    ));
    assert.equal(currentStagePointer.surface_kind, 'opl_current_stage_pointer');
    assert.equal(currentStagePointer.current_stage, null);
    assert.equal(currentStagePointer.empty_state, 'no_stage_opened_yet');
    assert.equal(currentStagePointer.authority_boundary.pointer_can_replace_owner_receipt, false);
    const workspaceMap = readJsonFile(path.join(workspacePath, 'workspace_map.json'));
    assert.equal(workspaceMap.surface_kind, 'opl_workspace_map');
    assert.equal(workspaceMap.projects[0].project_id, 'deck-001');
    assert.equal(
      workspaceMap.projects[0].user_inspection.stage_manifest_pattern,
      'deliverables/deck-001/artifacts/stage_outputs/<stage-id>/stage_manifest.json',
    );
    assert.equal(
      workspaceMap.projects[0].user_inspection.receipts_pattern,
      'deliverables/deck-001/artifacts/stage_outputs/<stage-id>/receipts',
    );
    const workspaceHealth = readJsonFile(path.join(workspacePath, 'workspace_health.json'));
    assert.equal(workspaceHealth.surface_kind, 'opl_workspace_health');
    assert.equal(workspaceHealth.status, 'passed');
    const workspaceInspection = readJsonFile(path.join(workspacePath, 'workspace_inspection.json'));
    assert.equal(workspaceInspection.surface_kind, 'opl_workspace_inspection');
    assert.equal(workspaceInspection.current_project_id, 'deck-001');
    assert.equal(
      workspaceInspection.current_stage_pointer_ref,
      'deliverables/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    assert.equal(workspaceInspection.authority_boundary.inspection_can_claim_stage_complete, false);
    const workspaceResourceInventory = readJsonFile(path.join(workspacePath, 'workspace_resource_inventory.json'));
    assert.equal(workspaceResourceInventory.surface_kind, 'opl_workspace_resource_inventory');
    assert.equal(workspaceResourceInventory.resources[0].provenance_policy, 'manifest_records_source_refs_not_resource_body');
    assert.equal(workspaceResourceInventory.authority_boundary.inventory_can_store_resource_body, false);
    const inspect = runCli(['workspace', 'inspect', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.workspace_inspection.surface_kind, 'opl_workspace_inspection');
    assert.equal(inspect.workspace_inspection.current_project_id, 'deck-001');
    const inventory = runCli(['workspace', 'inventory', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inventory.workspace_resource_inventory.surface_kind, 'opl_workspace_resource_inventory');
    assert.equal(inventory.workspace_resource_inventory.resources.length, 5);

    const catalog = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const redcube = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(redcube.active_binding.workspace_path, workspacePath);
    assert.equal(redcube.active_binding.direct_entry.workspace_locator.surface_kind, 'redcube_workspace');
    assert.match(redcube.active_binding.direct_entry.command, /getProductStatus/);
    assert.match(redcube.active_binding.direct_entry.manifest_command, /getProductEntryManifest/);
    assert.equal(redcube.bindings_count.direct_entry_ready, 1);
    assert.equal(redcube.bindings_count.manifest_ready, 1);
    assert.equal(redcube.available_actions.includes('init'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init appends RCA series deliverables inside one workspace', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-rca-series-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-rca-series-root-'));

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

    const output = runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-002',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    assert.equal(output.workspace_initialization.metadata_action, 'appended_project');
    assert.equal(fs.statSync(path.join(workspacePath, 'deliverables', 'deck-002', 'artifacts', 'stage_outputs')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['deck-001', 'deck-002'],
    );
    assert.equal(workspaceIndex.projects[1].stage_outputs_root, 'deliverables/deck-002/artifacts/stage_outputs');
    const workspaceYaml = fs.readFileSync(path.join(workspacePath, 'workspace.yaml'), 'utf8');
    assert.match(workspaceYaml, /project_id: deck-001/);
    assert.match(workspaceYaml, /project_id: deck-002/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init materializes MAS portfolio topology with study roots', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-root-'));

  try {
    const output = runCli([
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
    const studyRoot = path.join(workspacePath, 'studies', 'DM002');

    assert.equal(output.workspace_initialization.agent.project_id, 'medautoscience');
    assert.equal(output.workspace_initialization.profile.profile_id, 'mas_portfolio');
    assert.equal(output.workspace_initialization.profile.workspace_mode, 'portfolio');
    assert.equal(output.workspace_initialization.project_root, studyRoot);

    for (const relativePath of [
      'data',
      'literature',
      'memory',
      'shared/sources',
      'studies/DM002/control',
      'studies/DM002/artifacts/stage_outputs',
      'studies/DM002/review',
      'studies/DM002/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.equal(workspaceIndex.workspace_topology_profile.project_collection_path, 'studies');
    assert.deepEqual(workspaceIndex.canonical_topology, {
      workspace_unit: 'workspace_group',
      project_collection_role: 'project_units',
      project_collection_path: 'studies',
      project_unit_kind: 'study',
      stage_artifact_unit: 'stage_artifact_unit',
      stage_outputs_root: 'artifacts/stage_outputs',
      owner_answer_unit: 'owner_receipt_or_typed_blocker',
    });
    assert.deepEqual(workspaceIndex.display_labels, {
      workspace: 'medical_research_workspace',
      project_collection: 'studies',
      project_unit: 'study',
      stage_outputs: 'artifacts/stage_outputs',
      shared_resources: 'shared_resources',
    });
    assert.deepEqual(
      workspaceIndex.shared_resources.map((entry: { path: string; role: string }) => [entry.path, entry.role]),
      [
        ['data', 'dataset_root'],
        ['literature', 'literature_root'],
        ['memory', 'memory_root'],
        ['shared/sources', 'source_intake'],
      ],
    );
    assert.equal(workspaceIndex.projects[0].stage_outputs_root, 'studies/DM002/artifacts/stage_outputs');
    assert.equal(workspaceIndex.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(workspaceIndex.workspace_norm.topology_contract.canonical_project_collection_role, 'project_units');
    assert.equal(
      workspaceIndex.workspace_norm.topology_contract.canonical_project_unit_semantics.mas_studies_boundary.alias_role,
      'display_domain_alias',
    );
    assert.equal(
      workspaceIndex.workspace_norm.topology_contract.canonical_project_unit_semantics.mas_studies_boundary.canonical_role,
      'project_units',
    );
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_collection_path, 'studies');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_collection_alias_role, 'display_domain_alias');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.canonical_project_collection_role, 'project_units');
    assert.deepEqual(workspaceIndex.workspace_norm.domain_topology_profile.project_semantic_aliases, ['study', 'studies']);

    const catalog = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const mas = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');
    assert.equal(mas.active_binding.workspace_path, workspacePath);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init appends MAS portfolio studies without replacing shared roots', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-portfolio-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-portfolio-root-'));

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

    const output = runCli([
      'workspace',
      'init',
      '--agent',
      'mas',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'dm-cvd',
      '--project-id',
      'DM003',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'dm-cvd');
    assert.equal(output.workspace_initialization.metadata_action, 'appended_project');
    assert.equal(fs.statSync(path.join(workspacePath, 'studies', 'DM003', 'artifacts', 'stage_outputs')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'data')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'literature')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'memory')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['DM002', 'DM003'],
    );
    assert.equal(workspaceIndex.projects[1].stage_outputs_root, 'studies/DM003/artifacts/stage_outputs');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init materializes MAG one-off deliverable topology', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mag-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mag-root-'));

  try {
    const output = runCli([
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
    assert.equal(output.workspace_initialization.agent.project_id, 'medautogrant');
    assert.equal(output.workspace_initialization.profile.profile_id, 'one_off');
    assert.equal(output.workspace_initialization.profile.workspace_mode, 'one_off');

    for (const relativePath of [
      'shared/sources',
      'shared/memory',
      'shared/style_system',
      'deliverables/grant-001/control',
      'deliverables/grant-001/artifacts/stage_outputs',
      'deliverables/grant-001/review',
      'deliverables/grant-001/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const catalog = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const mag = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    assert.equal(mag.active_binding.workspace_path, workspacePath);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init uses configured OPL workspace root when no path is provided', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-home-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-default-root-'));

  try {
    runCli(['workspace', 'root', 'set', '--path', workspaceRoot], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli([
      'workspace',
      'init',
      '--agent',
      'oma',
      '--workspace-id',
      'agent-factory',
      '--project-id',
      'capability-001',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'agent-factory');
    assert.equal(output.workspace_initialization.workspace_path, workspacePath);
    assert.equal(output.workspace_initialization.agent.project_id, 'opl-meta-agent');
    assert.equal(fs.statSync(path.join(workspacePath, 'deliverables', 'capability-001', 'artifacts', 'stage_outputs')).isDirectory(), true);
    const catalog = runCli(['workspace', 'list'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const oma = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'opl-meta-agent');
    assert.equal(oma.active_binding.workspace_path, workspacePath);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace ensure initializes once and then reuses the active binding', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-home-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-root-'));

  try {
    runCli(['workspace', 'root', 'set', '--path', workspaceRoot], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const first = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    assert.equal(first.workspace_initialization.action, 'ensure');
    assert.equal(first.workspace_initialization.ensure_status, 'initialized_default_workspace');
    assert.equal(fs.statSync(path.join(workspacePath, 'deliverables', 'deck-001', 'artifacts', 'stage_outputs')).isDirectory(), true);

    const second = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--project-id',
      'deck-001',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(second.workspace_initialization.action, 'ensure');
    assert.equal(second.workspace_initialization.ensure_status, 'reused_active_binding');
    assert.equal(second.workspace_initialization.workspace_path, workspacePath);
    assert.equal(second.workspace_initialization.created_directories.length, 0);
    assert.equal(second.workspace_initialization.binding.project_id, 'redcube');
    assert.equal(second.workspace_initialization.workspace_norm.default_workspace_precondition.default_entry_for_agents, true);
    assert.equal(second.workspace_initialization.workspace_norm.descriptor_delegates.mcp.descriptor_only, true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace ensure appends a missing project to an active series workspace', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-append-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-append-root-'));

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

    const output = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--project-id',
      'deck-002',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    assert.equal(output.workspace_initialization.ensure_status, 'initialized_missing_project_in_active_binding');
    assert.equal(output.workspace_initialization.metadata_action, 'appended_project');
    assert.equal(fs.statSync(path.join(workspacePath, 'deliverables', 'deck-002', 'artifacts', 'stage_outputs')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['deck-001', 'deck-002'],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace ensure appends to active binding when workspace-root is also provided', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-root-append-state-'));
  const firstWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-root-append-a-'));
  const secondWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-ensure-root-append-b-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      firstWorkspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--workspace-root',
      secondWorkspaceRoot,
      '--workspace-id',
      'another-theme',
      '--project-id',
      'deck-002',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const activeWorkspacePath = path.join(firstWorkspaceRoot, 'visual-theme-a');
    assert.equal(output.workspace_initialization.ensure_status, 'initialized_missing_project_in_active_binding');
    assert.equal(output.workspace_initialization.workspace_path, activeWorkspacePath);
    assert.equal(fs.statSync(path.join(activeWorkspacePath, 'deliverables', 'deck-002')).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(secondWorkspaceRoot, 'another-theme')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(firstWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(secondWorkspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init dry-run exposes CLI MCP and skill call surfaces without writing files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-dry-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-dry-root-'));

  try {
    const output = runCli([
      'workspace',
      'init',
      '--agent',
      'oma',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'agent-factory',
      '--project-id',
      'capability-001',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'agent-factory');
    assert.equal(output.workspace_initialization.dry_run, true);
    assert.equal(output.workspace_initialization.agent.project_id, 'opl-meta-agent');
    assert.equal(output.workspace_initialization.profile.profile_id, 'one_off');
    assert.equal(output.workspace_initialization.binding, null);
    assert.equal(fs.existsSync(workspacePath), false);

    assert.equal(output.workspace_initialization.interface_projection.cli.command, 'opl workspace init');
    assert.equal(output.workspace_initialization.interface_projection.cli.ensure_command, 'opl workspace ensure');
    assert.equal(output.workspace_initialization.interface_projection.mcp.tool_name, 'opl_workspace_ensure');
    assert.equal(output.workspace_initialization.interface_projection.mcp.descriptor_only, true);
    assert.equal(output.workspace_initialization.interface_projection.mcp.public_runtime, false);
    assert.equal(output.workspace_initialization.interface_projection.skill.intent, 'ensure_opl_workspace');
    assert.equal(output.workspace_initialization.workspace_norm.contract_ref, 'contracts/opl-framework/agent-workspace-norm-contract.json');
    assert.equal(output.workspace_initialization.workspace_norm.default_workspace_precondition.command, 'opl workspace ensure');
    assert.equal(output.workspace_initialization.workspace_norm.explicit_initialization.default_entry_for_agents, false);
    assert.deepEqual(
      output.workspace_initialization.interface_projection.required_inputs,
      ['agent_id'],
    );

    const catalog = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const oma = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'opl-meta-agent');
    assert.equal(oma.active_binding, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace interfaces exports the OPL-owned initializer surfaces for tools and skills', () => {
  const output = runCli(['workspace', 'interfaces']);

  assert.equal(output.workspace_interfaces.surface_kind, 'opl_workspace_initialize_interfaces');
  assert.equal(output.workspace_interfaces.boundary.is_domain_family_action_catalog, false);
  assert.equal(output.workspace_interfaces.boundary.writes_opl_workspace_registry, true);
  assert.equal(output.workspace_interfaces.boundary.writes_domain_truth, false);
  assert.equal(output.workspace_interfaces.command_contract.command, 'opl workspace ensure');
  assert.equal(output.workspace_interfaces.command_contract.initializer_command, 'opl workspace init');
  assert.equal(
    output.workspace_interfaces.command_contract.norm_contract_ref,
    'contracts/opl-framework/agent-workspace-norm-contract.json',
  );
  assert.deepEqual(output.workspace_interfaces.command_contract.required_inputs, ['agent_id']);
  assert.equal(output.workspace_interfaces.workspace_norm.norm_id, 'opl.agent_workspace_norm.v1');
  assert.equal(output.workspace_interfaces.workspace_norm.default_workspace_precondition.default_entry_for_agents, true);
  assert.equal(output.workspace_interfaces.workspace_norm.explicit_initialization.default_entry_for_agents, false);
  assert.equal(output.workspace_interfaces.workspace_norm.topology_contract.canonical_project_collection_role, 'project_units');
  assert.deepEqual(
    output.workspace_interfaces.workspace_norm.topology_contract.stage_output_root_protocol.required_stage_folder_shape,
    ['inputs', 'outputs', 'review', 'receipts', 'handoff', 'stage_manifest.json'],
  );
  assert.equal(output.workspace_interfaces.workspace_norm.user_inspection.project_stage_outputs_pattern, '<project-root>/artifacts/stage_outputs/<stage-id>/');
  assert.equal(output.workspace_interfaces.workspace_norm.runtime_state_boundary.runtime_state_can_close_stage, false);
  assert.equal(output.workspace_interfaces.workspace_norm.authority_boundary.conformance_pass_counts_as_domain_ready, false);
  assert.equal(output.workspace_interfaces.surfaces.mcp.tool_name, 'opl_workspace_ensure');
  assert.equal(output.workspace_interfaces.surfaces.mcp.descriptor_only, true);
  assert.equal(output.workspace_interfaces.surfaces.mcp.public_runtime, false);
  assert.equal(output.workspace_interfaces.surfaces.openai.descriptor_only, true);
  assert.equal(output.workspace_interfaces.surfaces.openai.public_runtime, false);
  assert.equal(output.workspace_interfaces.surfaces.ai_sdk.delegates_to_action_id, 'opl_workspace_ensure');
  assert.equal(output.workspace_interfaces.surfaces.mcp.management_delegates.validate, 'opl workspace validate');
  assert.equal(output.workspace_interfaces.surfaces.mcp.management_delegates.adopt_apply, 'opl workspace adopt --apply');
  assert.equal(output.workspace_interfaces.surfaces.mcp.management_delegates.upgrade, 'opl workspace upgrade --apply');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.validate.command, 'opl workspace validate');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.doctor.command, 'opl workspace doctor');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.adopt.command, 'opl workspace adopt');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.upgrade.command, 'opl workspace upgrade');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.project_archive.command, 'opl workspace project archive');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.export_map.command, 'opl workspace export-map');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.inspect.command, 'opl workspace inspect');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.inventory.command, 'opl workspace inventory');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.health.command, 'opl workspace health');
  assert.equal(output.workspace_interfaces.surfaces.skill.intent, 'ensure_opl_workspace');
  assert.match(output.workspace_interfaces.surfaces.skill.management_instruction, /workspace validate/);
  assert.equal(output.workspace_interfaces.surfaces.app.action_id, 'workspace_ensure');
  assert.equal(output.workspace_interfaces.surfaces.app.initializer_action_id, 'workspace_initialize');
  assert.equal(output.workspace_interfaces.surfaces.app.validator_action_id, 'workspace_validate');
  assert.equal(output.workspace_interfaces.surfaces.app.doctor_action_id, 'workspace_doctor');
  assert.equal(output.workspace_interfaces.surfaces.app.adopt_dry_run_action_id, 'workspace_adopt_dry_run');
  assert.equal(output.workspace_interfaces.surfaces.app.adopt_apply_action_id, 'workspace_adopt_apply');
  assert.equal(output.workspace_interfaces.surfaces.app.upgrade_action_id, 'workspace_upgrade');
  assert.equal(output.workspace_interfaces.surfaces.app.project_archive_action_id, 'workspace_project_archive');
  assert.equal(output.workspace_interfaces.surfaces.app.export_map_action_id, 'workspace_export_map');
  assert.equal(output.workspace_interfaces.surfaces.app.inspect_action_id, 'workspace_inspect');
  assert.equal(output.workspace_interfaces.surfaces.app.inventory_action_id, 'workspace_inventory');
  assert.equal(output.workspace_interfaces.surfaces.app.health_action_id, 'workspace_health');
  assert.deepEqual(output.workspace_interfaces.supported_agents, ['mas', 'mag', 'rca', 'oma']);
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

test('workspace validate fails closed and doctor reports blockers for missing workspace index', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-missing-index-'));

  try {
    const failure = runCliFailure(['workspace', 'validate', '--workspace', workspacePath]);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.blockers[0].code, 'workspace_config_missing');
    assert.equal(failure.payload.error.details.blockers[1].code, 'workspace_index_missing');

    const doctor = runCli(['workspace', 'doctor', '--workspace', workspacePath]);
    assert.equal(doctor.workspace_doctor.status, 'blocked');
    assert.equal(doctor.workspace_doctor.blockers[0].code, 'workspace_config_missing');
    assert.equal(doctor.workspace_doctor.blockers[1].code, 'workspace_index_missing');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('workspace adopt dry-run plans OPL topology without writing metadata', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-adopt-'));

  try {
    const output = runCli([
      'workspace',
      'adopt',
      '--agent',
      'mas',
      '--workspace',
      workspacePath,
      '--study-id',
      'DM002',
      '--dry-run',
    ]);

    assert.equal(output.workspace_adoption.status, 'dry_run_ready');
    assert.equal(output.workspace_adoption.write_allowed, false);
    assert.equal(output.workspace_adoption.profile.profile_id, 'mas_portfolio');
    assert.equal(output.workspace_adoption.canonical_topology.project_collection_path, 'studies');
    assert.equal(output.workspace_adoption.canonical_topology.project_unit_kind, 'study');
    assert.equal(output.workspace_adoption.project.stage_outputs_root, 'studies/DM002/artifacts/stage_outputs');
    assert.equal(output.workspace_adoption.would_create_metadata_files.includes(path.join(workspacePath, 'workspace_index.json')), true);
    assert.equal(output.workspace_adoption.would_create_directories.includes(path.join(workspacePath, 'studies', 'DM002', 'artifacts', 'stage_outputs')), true);
    assert.equal(output.workspace_adoption.would_index_projects[0].project_id, 'DM002');
    assert.equal(fs.existsSync(path.join(workspacePath, 'workspace_index.json')), false);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
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
    currentPointer.current_stage_manifest_ref = 'deliverables/grant-001/artifacts/stage_outputs/draft/stage_manifest.json';
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
    assert.equal(runCli(['workspace', 'validate', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_validation.status, 'passed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace project archive marks project lifecycle without deleting files or registry bindings', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-archive-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-archive-root-'));

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
      '--study-id',
      'DM002',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const workspacePath = path.join(workspaceRoot, 'dm-cvd');
    const output = runCli([
      'workspace',
      'project',
      'archive',
      '--workspace',
      workspacePath,
      '--study-id',
      'DM002',
      '--reason',
      'superseded',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.workspace_project_archive.status, 'applied');
    assert.equal(output.workspace_project_archive.lifecycle.status, 'archived');
    assert.equal(output.workspace_project_archive.lifecycle.archive_reason, 'superseded');
    assert.equal(output.workspace_project_archive.authority_boundary.archive_deletes_files, false);
    assert.equal(fs.statSync(path.join(workspacePath, 'studies', 'DM002')).isDirectory(), true);
    const workspaceMap = runCli(['workspace', 'export-map', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_map;
    assert.equal(workspaceMap.projects[0].lifecycle.status, 'archived');
    const health = runCli(['workspace', 'health', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_health;
    assert.equal(health.status, 'passed');
    assert.equal(health.archived_project_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
