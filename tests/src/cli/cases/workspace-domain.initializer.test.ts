import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../src/kernel/standard-agent-registry.ts';
import { validateJsonSchemaPayload } from '../../../../src/kernel/schema-registry.ts';

import './workspace-domain-initializer-cases/bookforge-artifact-lifecycle.ts';
import './workspace-domain-initializer-cases/resource-provenance.ts';
import './workspace-domain-initializer-cases/source-material-ingest.ts';
import './workspace-domain-initializer-cases/validation-and-doctor.ts';

function readJsonFile(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

function assertHasKeys(surface: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    assert.equal(Object.hasOwn(surface, key), true, key);
  }
}

const workspaceIndexSchemaPath = path.join(
  repoRoot,
  'contracts/opl-framework/workspace-index.schema.json',
);
const workspaceIndexSchema = readJsonFile(workspaceIndexSchemaPath);

test('workspace init uses generic one-off topology without a current domain descriptor', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-init-mas-root-'));

  try {
    const first = runCli([
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
    const second = runCli([
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
    assert.equal(first.workspace_initialization.profile.workspace_mode, 'one_off');
    assert.equal(first.workspace_initialization.project_root, path.join(workspacePath, 'projects', 'DM002'));
    assert.equal(second.workspace_initialization.metadata_action, 'appended_project');
    for (const relativePath of [
      'shared/sources',
      'shared/memory',
      'shared/style_system',
      'projects/DM002/artifacts/stage_outputs',
      'projects/DM003/artifacts/stage_outputs',
    ]) {
      assert.equal(fs.statSync(path.join(workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['DM002', 'DM003'],
    );
    assert.equal(workspaceIndex.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(workspaceIndex.workspace_norm.domain_topology_profile.project_collection_path, 'projects');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace init and validate roundtrip every standard-agent registry profile', () => {
  const agents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  for (const agent of agents) {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-workspace-${agent.agent_id}-state-`));
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-workspace-${agent.agent_id}-root-`));
    try {
      const projectId = `${agent.agent_id}-roundtrip`;
      const initialized = runCli([
        'workspace',
        'init',
        '--agent',
        agent.agent_id,
        '--workspace-root',
        workspaceRoot,
        '--workspace-id',
        `${agent.agent_id}-roundtrip`,
        '--project-id',
        projectId,
      ], { OPL_STATE_DIR: stateRoot });
      const workspacePath = initialized.workspace_initialization.workspace_path;
      const validated = runCli([
        'workspace',
        'validate',
        '--workspace',
        workspacePath,
      ], { OPL_STATE_DIR: stateRoot });
      const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
      const schemaValidation = validateJsonSchemaPayload({
        schemaId: workspaceIndexSchema.$id,
        schema: workspaceIndexSchema,
        sourceRef: 'contracts/opl-framework/workspace-index.schema.json',
      }, workspaceIndex);

      assert.equal(validated.workspace_validation.status, 'passed', agent.agent_id);
      assert.equal(schemaValidation.ok, true, `${agent.agent_id}: ${JSON.stringify(schemaValidation)}`);
      assert.equal(workspaceIndex.agent.project_kind, 'project', agent.agent_id);
      assert.equal(workspaceIndex.profile_binding.profile_id, 'one_off', agent.agent_id);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  }
});

test('workspace ensure reuses active binding and appends missing project', () => {
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
    const second = runCli([
      'workspace',
      'ensure',
      '--agent',
      'rca',
      '--project-id',
      'deck-002',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    assert.equal(first.workspace_initialization.ensure_status, 'initialized_default_workspace');
    assert.equal(second.workspace_initialization.ensure_status, 'initialized_missing_project_in_active_binding');
    assert.equal(second.workspace_initialization.workspace_path, workspacePath);
    const workspaceIndex = readJsonFile(path.join(workspacePath, 'workspace_index.json'));
    assert.deepEqual(
      workspaceIndex.projects.map((entry: { project_id: string }) => entry.project_id),
      ['deck-001', 'deck-002'],
    );
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-002', 'artifacts', 'stage_outputs')).isDirectory(), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace interfaces exports OPL-owned initializer surfaces', () => {
  const output = runCli(['workspace', 'interfaces']);
  const interfaces = output.workspace_interfaces;

  assert.equal(interfaces.surface_kind, 'opl_workspace_initialize_interfaces');
  assert.equal(interfaces.boundary.writes_opl_workspace_registry, true);
  assert.equal(interfaces.boundary.writes_domain_truth, false);
  assert.equal(interfaces.command_contract.command, 'opl workspace ensure');
  assert.deepEqual(interfaces.command_contract.required_inputs, ['agent_id']);
  assert.equal(interfaces.surfaces.mcp.tool_name, 'opl_workspace_ensure');
  assert.equal(interfaces.surfaces.mcp.descriptor_only, true);
  assert.equal(interfaces.surfaces.app.action_id, 'workspace_ensure');
  assertHasKeys(interfaces.surfaces.management_commands, [
    'validate',
    'doctor',
    'adopt',
    'upgrade',
    'project_archive',
    'project_lifecycle',
    'project_delete',
    'fleet_report',
  ]);
  assert.equal(interfaces.supported_agents.includes('obf'), true);
});

test('workspace project lifecycle keeps physical delete behind owner gate', () => {
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
    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
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

    assert.equal(lock.workspace_project_lock.lifecycle.status, 'locked');
    assert.equal(deleteGate.workspace_project_delete.status, 'blocked_owner_receipt_required');
    assert.equal(deleteGate.workspace_project_delete.physical_delete_applied, false);
    assert.equal(deleteGate.workspace_project_delete.authority_boundary.opl_can_perform_physical_delete, false);
    assert.equal(fs.statSync(path.join(workspacePath, 'projects', 'deck-001')).isDirectory(), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
