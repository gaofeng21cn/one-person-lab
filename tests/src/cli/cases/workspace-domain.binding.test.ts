import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

function writeStandardAgentDescriptor(repoRoot: string) {
  fs.mkdirSync(path.join(repoRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
    domain_id: 'medautoscience',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      workspace_binding: {
        locator_surface_kind: 'med_autoscience_workspace_profile',
        default_profile_id: 'portfolio',
        workspace_kind: 'medical_research_workspace',
        project_kind: 'study',
        project_collection_label: 'studies',
        default_workspace_id: 'research-workspace',
        default_project_id: 'study-001',
        required_locator_fields: ['profile_ref'],
        optional_locator_fields: ['workspace_root'],
      },
      runtime: {
        runtime_domain_id: 'medautoscience',
        registration_ref: 'contracts/domain_descriptor.json#/runtime',
      },
      progress: {
        deliverable_delta_aliases: ['paper_progress_delta'],
        platform_delta_aliases: ['platform_repair_delta'],
      },
      routing: {
        explicit_aliases: ['mas'],
        workstream_ids: ['research_ops'],
        intent_signals: ['submission_delivery'],
        ambiguity_policy: 'require_explicit_workstream',
      },
    },
  }, null, 2)}\n`);
}

test('workspace-bind projects structured locators without deriving private commands', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const locatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-locators-'));
  const codeRoot = path.join(locatorRoot, 'med-autoscience');
  const workspacePath = path.join(locatorRoot, 'Yang', 'Obesity');
  const profilePath = path.join(workspacePath, 'ops', 'medautoscience', 'profiles', 'obesity.local.toml');

  writeStandardAgentDescriptor(codeRoot);
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "obesity"\n', 'utf8');

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    const bindOutput = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspacePath,
      '--workspace-root',
      codeRoot,
      '--profile',
      profilePath,
    ], env).workspace_catalog;
    assert.equal(bindOutput.binding.direct_entry.command, null);
    assert.equal(bindOutput.binding.direct_entry.manifest_command, null);
    assert.deepEqual(bindOutput.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(codeRoot),
      profile_ref: path.resolve(profilePath),
      input_path: null,
    });

    const project = bindOutput.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.deepEqual(project.binding_contract.required_locator_fields, ['profile_ref']);
    assert.deepEqual(project.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(project.binding_contract.workspace_locator_surface_kind, 'med_autoscience_workspace_profile');
    assert.equal('derived_entry_command_template' in project.binding_contract, false);
    assert.equal('derived_manifest_command_template' in project.binding_contract, false);
    assert.equal(bindOutput.summary.direct_entry_ready_projects_count, 0);
    assert.equal(bindOutput.summary.manifest_ready_projects_count, 0);

    const explicit = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspacePath,
      '--workspace-root',
      codeRoot,
      '--profile',
      profilePath,
      '--entry-command',
      'explicit-status-command',
      '--manifest-command',
      'explicit-manifest-command',
    ], env).workspace_catalog.binding;
    assert.equal(explicit.direct_entry.command, 'explicit-status-command');
    assert.equal(explicit.direct_entry.manifest_command, 'explicit-manifest-command');
  } finally {
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace-bind preserves project scope when an active workspace moves', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-move-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const locatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-move-locators-'));
  const codeRoot = path.join(locatorRoot, 'med-autoscience');
  const firstWorkspacePath = path.join(locatorRoot, 'Yang', 'DM-CVD-001');
  const secondWorkspacePath = path.join(locatorRoot, 'Yang', 'DM-CVD-001-moved');
  const firstProfilePath = path.join(firstWorkspacePath, 'ops', 'profile.toml');
  const secondProfilePath = path.join(secondWorkspacePath, 'ops', 'profile.toml');

  writeStandardAgentDescriptor(codeRoot);
  fs.mkdirSync(path.dirname(firstProfilePath), { recursive: true });
  fs.mkdirSync(path.dirname(secondProfilePath), { recursive: true });
  fs.writeFileSync(firstProfilePath, '[workspace]\nname = "first"\n', 'utf8');
  fs.writeFileSync(secondProfilePath, '[workspace]\nname = "moved"\n', 'utf8');

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    const first = runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', firstWorkspacePath,
      '--workspace-root', codeRoot, '--profile', firstProfilePath,
    ], env).workspace_catalog.binding;
    const second = runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', secondWorkspacePath,
      '--workspace-root', codeRoot, '--profile', secondProfilePath,
    ], env).workspace_catalog.binding;

    assert.equal(second.project_scope_id, first.project_scope_id);
    assert.notEqual(second.binding_id, first.binding_id);
  } finally {
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
