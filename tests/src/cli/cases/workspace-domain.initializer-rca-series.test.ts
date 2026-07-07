import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  test,
} from '../helpers.ts';

function readJsonFile(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
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
    const projectRoot = path.join(workspacePath, 'projects', 'deck-001');

    assert.equal(output.workspace_initialization.action, 'init');
    assert.equal(output.workspace_initialization.agent.agent_id, 'rca');
    assert.equal(output.workspace_initialization.profile.profile_id, 'series');
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
      'projects',
      'projects/deck-001/control',
      'projects/deck-001/artifacts/stage_outputs',
      'projects/deck-001/review',
      'projects/deck-001/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceYaml = fs.readFileSync(path.join(workspacePath, 'workspace.yaml'), 'utf8');
    assert.match(workspaceYaml, /workspace_kind: visual_theme_workspace/);
    assert.match(workspaceYaml, /workspace_mode: series/);
    assert.match(workspaceYaml, /project_collection_path: projects/);
    assert.match(workspaceYaml, /project_stage_outputs_root: artifacts\/stage_outputs/);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.equal(workspaceIndex.surface_kind, 'opl_workspace_index');
    assert.equal(workspaceIndex.agent.agent_id, 'rca');
    assert.equal(workspaceIndex.agent.project_id, 'redcube');
    assert.equal(workspaceIndex.workspace_topology_profile.profile_id, 'series');
    assert.equal(workspaceIndex.profile_binding.profile_id, 'series');
    assert.equal(workspaceIndex.profile_binding.profile_version, 'workspace-topology-profile.v2');
    assert.equal(workspaceIndex.profile_binding.profile_fingerprint, 'opl-workspace-topology-profile-v2-projects-stage-outputs');
    assert.equal(workspaceIndex.profile_binding.applied_by, 'opl_workspace_init');
    assert.deepEqual(
      workspaceIndex.profile_binding.migration_history.map((entry: { event: string; project_roots_moved: boolean }) => ({
        event: entry.event,
        project_roots_moved: entry.project_roots_moved,
      })),
      [{ event: 'initialized', project_roots_moved: false }],
    );
    assert.deepEqual(
      workspaceIndex.topology_events.map((entry: { event: string; project_roots_moved: boolean }) => ({
        event: entry.event,
        project_roots_moved: entry.project_roots_moved,
      })),
      [{ event: 'initialized', project_roots_moved: false }],
    );
    assert.deepEqual(workspaceIndex.canonical_topology, {
      workspace_unit: 'workspace_group',
      project_collection_role: 'project_units',
      project_collection_path: 'projects',
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
    assert.equal(workspaceIndex.projects[0].stage_outputs_root, 'projects/deck-001/artifacts/stage_outputs');
    assert.equal(
      workspaceIndex.projects[0].stage_outputs_manifest_ref,
      'projects/deck-001/artifacts/stage_outputs/opl_stage_outputs_manifest.json',
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
    assert.equal(workspaceIndex.generated_refs.workspace_report_ref, 'workspace_report.json');
    assert.equal(workspaceIndex.generated_refs.canonical_generated_root, 'control/opl');
    assert.equal(workspaceIndex.generated_refs.canonical_projection_root, 'control/opl/projections');
    assert.equal(workspaceIndex.generated_refs.canonical_report_root, 'control/opl/reports');
    assert.equal(workspaceIndex.generated_refs.canonical_workspace_map_ref, 'control/opl/projections/workspace_map.json');
    assert.equal(workspaceIndex.generated_refs.canonical_workspace_health_ref, 'control/opl/projections/workspace_health.json');
    assert.equal(workspaceIndex.generated_refs.canonical_workspace_inspection_ref, 'control/opl/projections/workspace_inspection.json');
    assert.equal(
      workspaceIndex.generated_refs.canonical_workspace_resource_inventory_ref,
      'control/opl/projections/workspace_resource_inventory.json',
    );
    assert.equal(workspaceIndex.generated_refs.canonical_workspace_report_ref, 'control/opl/reports/workspace_report.json');
    assert.deepEqual(workspaceIndex.generated_refs.root_mirror_refs, [
      'workspace_map.json',
      'workspace_health.json',
      'workspace_inspection.json',
      'workspace_resource_inventory.json',
      'workspace_report.json',
    ]);
    assert.equal(workspaceIndex.generated_refs.stage_outputs_index_basename, 'stage_outputs_index.json');
    assert.equal(workspaceIndex.generated_refs.current_stage_pointer_basename, 'current_stage.json');
    assert.equal(workspaceIndex.user_inspection.default_stage_outputs, 'projects/deck-001/artifacts/stage_outputs');
    assert.equal(workspaceIndex.user_inspection.workspace_inspection_ref, 'workspace_inspection.json');
    assert.equal(workspaceIndex.user_inspection.workspace_resource_inventory_ref, 'workspace_resource_inventory.json');
    assert.equal(workspaceIndex.user_inspection.workspace_report_ref, 'workspace_report.json');
    assert.equal(
      workspaceIndex.user_inspection.default_stage_outputs_index_ref,
      'projects/deck-001/artifacts/stage_outputs/stage_outputs_index.json',
    );
    assert.equal(
      workspaceIndex.user_inspection.default_current_stage_pointer_ref,
      'projects/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    assert.equal(workspaceIndex.workspace_norm.norm_id, 'opl.agent_workspace_norm.v1');
    assert.equal(workspaceIndex.workspace_norm.default_workspace_precondition.command, 'opl workspace ensure');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.profile, 'series');
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
    assert.equal(workspaceIndex.expected_domain_topology_profile.profile, 'series');
    assert.equal(workspaceIndex.expected_domain_topology_profile.project_kind, 'slide_deck');
    const sharedManifest = readJsonFile(path.join(workspacePath, 'shared', 'sources', 'opl_resource_manifest.json'));
    assert.equal(sharedManifest.surface_kind, 'opl_shared_resource_manifest');
    assert.equal(sharedManifest.body_authority.manifest_is_index_only, true);
    const stageOutputsManifest = readJsonFile(path.join(
      workspacePath,
      'projects',
      'deck-001',
      'artifacts',
      'stage_outputs',
      'opl_stage_outputs_manifest.json',
    ));
    assert.equal(stageOutputsManifest.surface_kind, 'opl_stage_outputs_root_manifest');
    assert.equal(stageOutputsManifest.stage_artifact_runtime.root_manifest_is_stage_completion_proof, false);
    assert.equal(
      stageOutputsManifest.stage_artifact_runtime.stage_outputs_index_ref,
      'projects/deck-001/artifacts/stage_outputs/stage_outputs_index.json',
    );
    assert.equal(
      stageOutputsManifest.stage_artifact_runtime.current_stage_pointer_ref,
      'projects/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    const stageOutputsIndex = readJsonFile(path.join(
      workspacePath,
      'projects',
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
      'projects',
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
    assert.deepEqual(
      readJsonFile(path.join(workspacePath, 'control', 'opl', 'projections', 'workspace_map.json')),
      workspaceMap,
    );
    assert.equal(workspaceMap.surface_kind, 'opl_workspace_map');
    assert.equal(workspaceMap.projects[0].project_id, 'deck-001');
    assert.equal(
      workspaceMap.projects[0].user_inspection.stage_manifest_pattern,
      'projects/deck-001/artifacts/stage_outputs/<stage-id>/stage_manifest.json',
    );
    assert.equal(
      workspaceMap.projects[0].user_inspection.receipts_pattern,
      'projects/deck-001/artifacts/stage_outputs/<stage-id>/receipts',
    );
    const workspaceHealth = readJsonFile(path.join(workspacePath, 'workspace_health.json'));
    assert.deepEqual(
      readJsonFile(path.join(workspacePath, 'control', 'opl', 'projections', 'workspace_health.json')),
      workspaceHealth,
    );
    assert.equal(workspaceHealth.surface_kind, 'opl_workspace_health');
    assert.equal(workspaceHealth.status, 'passed');
    assert.deepEqual(workspaceHealth.project_lifecycle_counts, {
      active: 1,
      paused: 0,
      archived: 0,
      superseded: 0,
      locked: 0,
    });
    const workspaceInspection = readJsonFile(path.join(workspacePath, 'workspace_inspection.json'));
    assert.deepEqual(
      readJsonFile(path.join(workspacePath, 'control', 'opl', 'projections', 'workspace_inspection.json')),
      workspaceInspection,
    );
    assert.equal(workspaceInspection.surface_kind, 'opl_workspace_inspection');
    assert.equal(workspaceInspection.current_project_id, 'deck-001');
    assert.equal(
      workspaceInspection.current_stage_pointer_ref,
      'projects/deck-001/artifacts/stage_outputs/current_stage.json',
    );
    assert.equal(workspaceInspection.authority_boundary.inspection_can_claim_stage_complete, false);
    const workspaceResourceInventory = readJsonFile(path.join(workspacePath, 'workspace_resource_inventory.json'));
    assert.deepEqual(
      readJsonFile(path.join(workspacePath, 'control', 'opl', 'projections', 'workspace_resource_inventory.json')),
      workspaceResourceInventory,
    );
    assert.equal(workspaceResourceInventory.surface_kind, 'opl_workspace_resource_inventory');
    assert.equal(workspaceResourceInventory.resources[0].provenance_policy, 'manifest_records_source_refs_not_resource_body');
    assert.equal(workspaceResourceInventory.authority_boundary.inventory_can_store_resource_body, false);
    const workspaceReport = readJsonFile(path.join(workspacePath, 'workspace_report.json'));
    assert.deepEqual(
      readJsonFile(path.join(workspacePath, 'control', 'opl', 'reports', 'workspace_report.json')),
      workspaceReport,
    );
    assert.equal(workspaceReport.surface_kind, 'opl_workspace_report');
    assert.equal(workspaceReport.current_project.project_id, 'deck-001');
    assert.equal(workspaceReport.current_project.next_user_check, 'projects/deck-001/artifacts/stage_outputs/current_stage.json');
    assert.equal(workspaceReport.projection_refs.workspace_report_ref, 'control/opl/reports/workspace_report.json');
    assert.deepEqual(workspaceReport.projection_refs.root_mirror_refs, [
      'workspace_map.json',
      'workspace_health.json',
      'workspace_inspection.json',
      'workspace_resource_inventory.json',
      'workspace_report.json',
    ]);
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
    const report = runCli(['workspace', 'report', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(report.workspace_report.surface_kind, 'opl_workspace_report');
    assert.equal(report.workspace_report.current_project.project_id, 'deck-001');

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
