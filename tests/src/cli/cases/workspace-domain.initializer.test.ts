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
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-002', 'artifacts', 'stage_outputs')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['deck-001', 'deck-002'],
    );
    assert.equal(workspaceIndex.projects[1].stage_outputs_root, 'projects/deck-002/artifacts/stage_outputs');
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
    const studyRoot = path.join(workspacePath, 'projects', 'DM002');

    assert.equal(output.workspace_initialization.agent.project_id, 'medautoscience');
    assert.equal(output.workspace_initialization.profile.profile_id, 'mas_portfolio');
    assert.equal(output.workspace_initialization.profile.workspace_mode, 'portfolio');
    assert.equal(output.workspace_initialization.project_root, studyRoot);

    for (const relativePath of [
      'data',
      'literature',
      'memory',
      'shared/sources',
      'projects/DM002/control',
      'projects/DM002/artifacts/stage_outputs',
      'projects/DM002/review',
      'projects/DM002/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.equal(workspaceIndex.workspace_topology_profile.project_collection_path, 'projects');
    assert.deepEqual(workspaceIndex.canonical_topology, {
      workspace_unit: 'workspace_group',
      project_collection_role: 'project_units',
      project_collection_path: 'projects',
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
    assert.equal(workspaceIndex.projects[0].stage_outputs_root, 'projects/DM002/artifacts/stage_outputs');
    assert.equal(workspaceIndex.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(workspaceIndex.workspace_norm.topology_contract.canonical_project_collection_role, 'project_units');
    assert.equal(
      workspaceIndex.workspace_norm.topology_contract.canonical_project_unit_semantics.mas_studies_boundary.alias_role,
      'legacy_display_domain_alias',
    );
    assert.equal(
      workspaceIndex.workspace_norm.topology_contract.canonical_project_unit_semantics.mas_studies_boundary.canonical_role,
      'project_units',
    );
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_collection_path, 'projects');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_collection_alias_role, 'legacy_display_alias');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.canonical_project_collection_role, 'project_units');
    assert.deepEqual(workspaceIndex.workspace_norm.domain_topology_profile.project_semantic_aliases, ['study', 'studies']);
    assert.deepEqual(workspaceIndex.workspace_norm.domain_topology_profile.legacy_project_collection_aliases, ['studies']);

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
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'DM003', 'artifacts', 'stage_outputs')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'data')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'literature')).isDirectory(), true);
    assert.equal(fs.statSync(path.join(workspacePath, 'memory')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['DM002', 'DM003'],
    );
    assert.equal(workspaceIndex.projects[1].stage_outputs_root, 'projects/DM003/artifacts/stage_outputs');
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
      'projects/grant-001/control',
      'projects/grant-001/artifacts/stage_outputs',
      'projects/grant-001/review',
      'projects/grant-001/handoff',
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

test('workspace init materializes BookForge one-off book topology', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-bookforge-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-bookforge-root-'));

  try {
    const output = runCli([
      'workspace',
      'init',
      '--agent',
      'bookforge',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'bookforge-workspace',
      '--project-id',
      'book-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'bookforge-workspace');
    assert.equal(output.workspace_initialization.agent.project_id, 'opl-bookforge');
    assert.equal(output.workspace_initialization.profile.profile_id, 'one_off');
    assert.equal(output.workspace_initialization.profile.workspace_mode, 'one_off');

    for (const relativePath of [
      'shared/sources',
      'shared/memory',
      'shared/style_system',
      'projects/book-001/control',
      'projects/book-001/artifacts/stage_outputs',
      'projects/book-001/review',
      'projects/book-001/handoff',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.equal(workspaceIndex.canonical_topology.project_unit_kind, 'book_project');
    assert.equal(workspaceIndex.display_labels.project_collection, 'books');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.profile, 'one_off');
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_kind, 'book_project');
    assert.deepEqual(workspaceIndex.workspace_norm.domain_topology_profile.project_semantic_aliases, ['book_project', 'book']);
    assert.equal(workspaceIndex.expected_domain_topology_profile.project_kind, 'book_project');
    assert.equal(workspaceIndex.expected_domain_topology_profile.projected_profile.project_collection_display_label, 'books');

    const catalog = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const bookforge = catalog.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'opl-bookforge');
    assert.equal(bookforge.active_binding.workspace_path, workspacePath);
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
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'capability-001', 'artifacts', 'stage_outputs')).isDirectory(), true);
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
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-001', 'artifacts', 'stage_outputs')).isDirectory(), true);

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
    assert.equal(second.workspace_initialization.profile_binding.applied_by, 'opl_workspace_ensure');
    assert.deepEqual(
      second.workspace_initialization.profile_binding.migration_history.map((entry: { event: string }) => entry.event),
      ['initialized', 'ensured'],
    );
    assert.deepEqual(
      second.workspace_initialization.topology_events.map((entry: { event: string; triggered_by: string }) => ({
        event: entry.event,
        triggered_by: entry.triggered_by,
      })),
      [
        { event: 'initialized', triggered_by: 'opl_workspace_init' },
        { event: 'ensured', triggered_by: 'opl_workspace_ensure' },
      ],
    );
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
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-002', 'artifacts', 'stage_outputs')).isDirectory(), true);

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['deck-001', 'deck-002'],
    );
    assert.deepEqual(
      workspaceIndex.profile_binding.migration_history.map((entry: { event: string }) => entry.event),
      ['initialized', 'project_appended'],
    );
    assert.equal(workspaceIndex.topology_events[1].event, 'project_appended');
    assert.equal(workspaceIndex.topology_events[1].project_roots_moved, false);
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
    assert.equal(fs.statSync(path.join(activeWorkspacePath, 'projects', 'deck-002')).isDirectory(), true);
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
  assert.equal(output.workspace_interfaces.surfaces.management_commands.project_lifecycle.command, 'opl workspace project lifecycle');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.project_delete.command, 'opl workspace project delete');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.fleet_report.command, 'opl workspace fleet report');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.export_map.command, 'opl workspace export-map');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.inspect.command, 'opl workspace inspect');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.inventory.command, 'opl workspace inventory');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.health.command, 'opl workspace health');
  assert.equal(output.workspace_interfaces.surfaces.management_commands.report.command, 'opl workspace report');
  assert.equal(output.workspace_interfaces.surfaces.cli.report_command, 'opl workspace report');
  assert.equal(output.workspace_interfaces.surfaces.cli.fleet_report_command, 'opl workspace fleet report');
  assert.equal(output.workspace_interfaces.surfaces.skill.intent, 'ensure_opl_workspace');
  assert.match(output.workspace_interfaces.surfaces.skill.management_instruction, /workspace fleet report/);
  assert.equal(output.workspace_interfaces.surfaces.app.action_id, 'workspace_ensure');
  assert.equal(output.workspace_interfaces.surfaces.app.initializer_action_id, 'workspace_initialize');
  assert.equal(output.workspace_interfaces.surfaces.app.validator_action_id, 'workspace_validate');
  assert.equal(output.workspace_interfaces.surfaces.app.doctor_action_id, 'workspace_doctor');
  assert.equal(output.workspace_interfaces.surfaces.app.adopt_dry_run_action_id, 'workspace_adopt_dry_run');
  assert.equal(output.workspace_interfaces.surfaces.app.adopt_apply_action_id, 'workspace_adopt_apply');
  assert.equal(output.workspace_interfaces.surfaces.app.upgrade_action_id, 'workspace_upgrade');
  assert.equal(output.workspace_interfaces.surfaces.app.project_archive_action_id, 'workspace_project_archive');
  assert.equal(output.workspace_interfaces.surfaces.app.project_lifecycle_action_id, 'workspace_project_lifecycle');
  assert.equal(output.workspace_interfaces.surfaces.app.project_pause_action_id, 'workspace_project_pause');
  assert.equal(output.workspace_interfaces.surfaces.app.project_resume_action_id, 'workspace_project_resume');
  assert.equal(output.workspace_interfaces.surfaces.app.project_lock_action_id, 'workspace_project_lock');
  assert.equal(output.workspace_interfaces.surfaces.app.project_supersede_action_id, 'workspace_project_supersede');
  assert.equal(output.workspace_interfaces.surfaces.app.project_delete_action_id, 'workspace_project_delete');
  assert.equal(output.workspace_interfaces.surfaces.app.export_map_action_id, 'workspace_export_map');
  assert.equal(output.workspace_interfaces.surfaces.app.inspect_action_id, 'workspace_inspect');
  assert.equal(output.workspace_interfaces.surfaces.app.inventory_action_id, 'workspace_inventory');
  assert.equal(output.workspace_interfaces.surfaces.app.health_action_id, 'workspace_health');
  assert.equal(output.workspace_interfaces.surfaces.app.report_action_id, 'workspace_report');
  assert.equal(output.workspace_interfaces.surfaces.app.fleet_report_action_id, 'workspace_fleet_report');
  assert.deepEqual(output.workspace_interfaces.supported_agents, ['mas', 'mag', 'rca', 'oma', 'bookforge']);
  assert.match(output.workspace_interfaces.surfaces.cli.usage, /bookforge/);
});

test('workspace validate fails closed and doctor reports blockers for missing workspace index', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-missing-index-'));

  try {
    const failure = runCliFailure(['workspace', 'validate', '--workspace', workspacePath]);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.blockers[0].code, 'workspace_index_missing');
    assert.equal(failure.payload.error.details.repairable_findings[0].code, 'workspace_config_missing');

    const doctor = runCli(['workspace', 'doctor', '--workspace', workspacePath]);
    assert.equal(doctor.workspace_doctor.status, 'blocked');
    assert.equal(doctor.workspace_doctor.blockers[0].code, 'workspace_index_missing');
    assert.equal(doctor.workspace_doctor.repairable_findings[0].code, 'workspace_config_missing');
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
    assert.equal(output.workspace_adoption.canonical_topology.project_collection_path, 'projects');
    assert.equal(output.workspace_adoption.canonical_topology.project_unit_kind, 'study');
    assert.equal(output.workspace_adoption.project.stage_outputs_root, 'projects/DM002/artifacts/stage_outputs');
    assert.equal(output.workspace_adoption.would_create_metadata_files.includes(path.join(workspacePath, 'workspace_index.json')), true);
    assert.equal(output.workspace_adoption.would_create_directories.includes(path.join(workspacePath, 'projects', 'DM002', 'artifacts', 'stage_outputs')), true);
    assert.equal(output.workspace_adoption.would_index_projects[0].project_id, 'DM002');
    assert.equal(fs.existsSync(path.join(workspacePath, 'workspace_index.json')), false);
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
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
    assert.equal(output.workspace_project_archive.lifecycle.paused_at, null);
    assert.equal(output.workspace_project_archive.lifecycle.superseded_at, null);
    assert.equal(output.workspace_project_archive.lifecycle.locked_at, null);
    assert.equal(output.workspace_project_archive.lifecycle.safe_delete_gate, 'domain_owner_receipt_required');
    assert.equal(output.workspace_project_archive.authority_boundary.archive_deletes_files, false);
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'DM002')).isDirectory(), true);
    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.profile_binding.migration_history.map((entry: { event: string }) => entry.event),
      ['initialized', 'project_lifecycle_updated'],
    );
    assert.equal(workspaceIndex.topology_events[1].event, 'project_lifecycle_updated');
    const workspaceMap = runCli(['workspace', 'export-map', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_map;
    assert.equal(workspaceMap.projects[0].lifecycle.status, 'archived');
    const health = runCli(['workspace', 'health', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_health;
    assert.equal(health.status, 'passed');
    assert.deepEqual(health.project_lifecycle_counts, {
      active: 0,
      paused: 0,
      archived: 1,
      superseded: 0,
      locked: 0,
    });
    assert.equal(health.archived_project_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace project lifecycle supports pause restore lock supersede and delete safe gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-lifecycle-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-project-lifecycle-root-'));

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
    runCli([
      'workspace',
      'ensure',
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

    const pause = runCli([
      'workspace',
      'project',
      'lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--status',
      'paused',
      '--reason',
      'waiting-for-review',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(pause.workspace_project_lifecycle.status, 'applied');
    assert.equal(pause.workspace_project_lifecycle.lifecycle.status, 'paused');
    assert.equal(pause.workspace_project_pause.lifecycle.pause_reason, 'waiting-for-review');
    assert.equal(pause.workspace_project_pause.authority_boundary.pause_deletes_files, false);

    let report = runCli(['workspace', 'report', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_report;
    assert.equal(report.current_project.project_id, 'deck-002');
    let health = runCli(['workspace', 'health', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_health;
    assert.deepEqual(health.project_lifecycle_counts, {
      active: 1,
      paused: 1,
      archived: 0,
      superseded: 0,
      locked: 0,
    });

    const restore = runCli([
      'workspace',
      'project',
      'lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--status',
      'active',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(restore.workspace_project_restore.lifecycle.status, 'active');
    assert.equal(restore.workspace_project_restore.lifecycle.pause_reason, null);

    const lock = runCli([
      'workspace',
      'project',
      'lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--status',
      'locked',
      '--reason',
      'owner-review',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(lock.workspace_project_lock.lifecycle.status, 'locked');
    assert.equal(lock.workspace_project_lock.lifecycle.lock_reason, 'owner-review');

    const supersedeDryRun = runCli([
      'workspace',
      'project',
      'lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--status',
      'superseded',
      '--superseded-by-project-id',
      'deck-002',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(supersedeDryRun.workspace_project_supersede.status, 'dry_run_ready');
    assert.equal(
      readJsonFile(path.join(workspacePath, 'workspace_index.json')).projects[0].lifecycle.status,
      'locked',
    );

    const deleteGate = runCli([
      'workspace',
      'project',
      'delete',
      '--workspace',
      workspacePath,
      '--project-id',
      'deck-001',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(deleteGate.workspace_project_delete.status, 'blocked_owner_receipt_required');
    assert.equal(deleteGate.workspace_project_delete.physical_delete_applied, false);
    assert.equal(deleteGate.workspace_project_delete.authority_boundary.opl_can_perform_physical_delete, false);
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-001')).isDirectory(), true);

    report = runCli(['workspace', 'report', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_report;
    assert.equal(report.current_project.project_id, 'deck-002');
    health = runCli(['workspace', 'health', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_health;
    assert.deepEqual(health.project_lifecycle_counts, {
      active: 1,
      paused: 0,
      archived: 0,
      superseded: 0,
      locked: 1,
    });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace upgrade preserves shared resource provenance records and exposes them in inventory', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-resource-provenance-root-'));

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
    ]);
    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    const manifestPath = path.join(workspacePath, 'shared', 'sources', 'opl_resource_manifest.json');
    const manifest = readJsonFile(manifestPath);
    manifest.resources = [
      {
        resource_id: 'source-001',
        source_ref: 'shared/sources/source-001.pdf',
        material_ref: 'human_doc:source-001',
        checksum: 'sha256:abc',
        provenance_ref: 'receipt:source-001',
        reuse_scope: 'workspace_group_or_project_series',
        staleness: 'fresh',
        recorded_at: '2026-06-08T00:00:00.000Z',
        body_ref: 'should_be_normalized_to_null',
      },
    ];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    runCli(['workspace', 'upgrade', '--workspace', workspacePath, '--apply']);
    const upgradedManifest = readJsonFile(manifestPath);
    assert.equal(upgradedManifest.resources[0].resource_id, 'source-001');
    assert.equal(upgradedManifest.resources[0].body_ref, null);

    const inventory = runCli(['workspace', 'inventory', '--workspace', workspacePath]).workspace_resource_inventory;
    const sourceRoot = inventory.resources.find((entry: { path: string }) => entry.path === 'shared/sources');
    assert.equal(sourceRoot.resource_record_count, 1);
    assert.equal(sourceRoot.resource_records[0].provenance_ref, 'receipt:source-001');
    assert.equal(sourceRoot.resource_records[0].body_ref, null);
    assert.equal(runCli(['workspace', 'doctor', '--workspace', workspacePath]).workspace_doctor.status, 'passed');
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
