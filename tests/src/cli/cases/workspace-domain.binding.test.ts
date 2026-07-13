import {
  assert,
  createFamilyContractsFixtureRoot,
  createFamilyLocatorResolverFixture,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  runCliInCwd,
  test,
} from '../helpers.ts';
import { createWorkspaceDescriptorFamilyFixture } from './workspace-domain-test-helper.ts';

test('workspace-bind derives family direct-entry locators from structured project locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const descriptorFixture = createWorkspaceDescriptorFamilyFixture(
    ['mas', 'mag', 'rca'],
    { includeExecutableCommands: true },
  );
  const locatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-locators-'));
  const masWorkspacePath = path.join(locatorRoot, 'medautoscience-workspace');
  const magWorkspacePath = path.join(locatorRoot, 'medautogrant-workspace');
  const redcubeWorkspacePath = path.join(locatorRoot, 'redcube-workspace');
  const masProfilePath = path.join(locatorRoot, 'profile.local.toml');
  const magInputPath = path.join(locatorRoot, 'workspace.json');
  const commandFixture = createFamilyLocatorResolverFixture({
    masProfile: masProfilePath,
    magInput: magInputPath,
    redcubeWorkspaceRoot: redcubeWorkspacePath,
    masManifest: fixtures.medautoscience,
    magManifest: fixtures.medautogrant,
    redcubeManifest: fixtures.redcube,
  });

  fs.mkdirSync(masWorkspacePath, { recursive: true });
  fs.mkdirSync(magWorkspacePath, { recursive: true });
  fs.mkdirSync(redcubeWorkspacePath, { recursive: true });
  fs.writeFileSync(masProfilePath, '[workspace]\nname = "fixture"\n', 'utf8');
  fs.writeFileSync(magInputPath, '{}\n', 'utf8');
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
    PATH: `${commandFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
  };

  try {
    const magBind = runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      magWorkspacePath,
      '--input',
      magInputPath,
    ], env);
    const masBind = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspacePath,
      '--profile',
      masProfilePath,
    ], env);
    const redcubeBind = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      redcubeWorkspacePath,
    ], env);
    const expectedMagEntryCommand = String(magBind.workspace_catalog.binding.direct_entry.command);
    const expectedMagManifestCommand = String(magBind.workspace_catalog.binding.direct_entry.manifest_command);
    const expectedMasEntryCommand = String(masBind.workspace_catalog.binding.direct_entry.command);
    const expectedMasManifestCommand = String(masBind.workspace_catalog.binding.direct_entry.manifest_command);
    const expectedRedcubeEntryCommand = String(redcubeBind.workspace_catalog.binding.direct_entry.command);
    const expectedRedcubeManifestCommand = String(redcubeBind.workspace_catalog.binding.direct_entry.manifest_command);

    assert.match(expectedMagEntryCommand, /^opl-test-domain-entry mag status /);
    assert.ok(expectedMagEntryCommand.includes(path.resolve(magWorkspacePath)));
    assert.ok(expectedMagEntryCommand.includes(path.resolve(magInputPath)));
    assert.match(expectedMagManifestCommand, /^opl-test-domain-entry mag manifest /);
    assert.match(expectedMasEntryCommand, /^opl-test-domain-entry mas status /);
    assert.ok(expectedMasEntryCommand.includes(path.resolve(masWorkspacePath)));
    assert.ok(expectedMasEntryCommand.includes(path.resolve(masProfilePath)));
    assert.match(expectedMasManifestCommand, /^opl-test-domain-entry mas manifest /);
    assert.match(expectedRedcubeEntryCommand, /^opl-test-domain-entry rca status /);
    assert.ok(expectedRedcubeEntryCommand.includes(path.resolve(redcubeWorkspacePath)));
    assert.match(expectedRedcubeManifestCommand, /^opl-test-domain-entry rca manifest /);

    assert.deepEqual(magBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autogrant_workspace_input',
      workspace_root: null,
      profile_ref: null,
      input_path: path.resolve(magInputPath),
    });

    assert.deepEqual(masBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masWorkspacePath),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });

    assert.deepEqual(redcubeBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'redcube_workspace',
      workspace_root: path.resolve(redcubeWorkspacePath),
      profile_ref: null,
      input_path: null,
    });

    const catalogOutput = runCli(['workspace', 'list'], env);
    assert.equal(catalogOutput.workspace_catalog.summary.direct_entry_ready_projects_count, 3);
    assert.equal(catalogOutput.workspace_catalog.summary.manifest_ready_projects_count, 3);
    const magProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const masProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.deepEqual(magProject.binding_contract.required_locator_fields, ['input_path']);
    assert.equal(
      magProject.binding_contract.workspace_locator_surface_kind,
      'med_autogrant_workspace_input',
    );
    assert.match(magProject.binding_contract.derived_entry_command_template, /\{workspace_path\}/);
    assert.match(magProject.binding_contract.derived_entry_command_template, /^opl-test-domain-entry mag status /);
    assert.match(magProject.binding_contract.derived_manifest_command_template, /^opl-test-domain-entry mag manifest /);
    assert.deepEqual(masProject.binding_contract.required_locator_fields, ['profile_ref']);
    assert.deepEqual(masProject.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(
      masProject.binding_contract.workspace_locator_surface_kind,
      'med_autoscience_workspace_profile',
    );
    assert.match(masProject.binding_contract.derived_entry_command_template, /\{workspace_root\}/);
    assert.match(masProject.binding_contract.derived_entry_command_template, /^opl-test-domain-entry mas status /);
    assert.match(masProject.binding_contract.derived_manifest_command_template, /^opl-test-domain-entry mas manifest /);
    assert.deepEqual(redcubeProject.binding_contract.required_locator_fields, ['workspace_root']);
    assert.deepEqual(redcubeProject.binding_contract.optional_locator_fields, []);
    assert.match(redcubeProject.binding_contract.derived_entry_command_template, /^opl-test-domain-entry rca status /);
    assert.match(redcubeProject.binding_contract.derived_manifest_command_template, /^opl-test-domain-entry rca manifest /);
    assert.equal(
      redcubeProject.binding_contract.quick_bind_hint,
      'Use the locator fields declared by the selected Standard Agent descriptor.',
    );

    const manifestOutput = runCliInCwd(['domain', 'manifests'], fixtureRoot, env);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant')?.manifest_command,
      expectedMagManifestCommand,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience')?.manifest_command,
      expectedMasManifestCommand,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube')?.manifest_command,
      expectedRedcubeManifestCommand,
    );

    const dashboardOutput = runCliInCwd(
      ['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'],
      fixtureRoot,
      env,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.aligned_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.partial_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.projects.find(
        (entry: { project_id: string }) => entry.project_id === 'medautogrant',
      )?.direct_entry_locator_status,
      'ready',
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.projects.find(
        (entry: { project_id: string }) => entry.project_id === 'medautoscience',
      )?.direct_entry_locator_status,
      'ready',
    );
  } finally {
    fs.rmSync(commandFixture.fixtureRoot, { recursive: true, force: true });
    descriptorFixture.cleanup();
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace-bind can bind a MAS project workspace while using a separate MAS code root', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-mas-project-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const descriptorFixture = createWorkspaceDescriptorFamilyFixture(
    ['mas'],
    { includeExecutableCommands: true },
  );
  const locatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-mas-project-'));
  const masCodeRoot = path.join(locatorRoot, 'med-autoscience');
  const masProjectWorkspace = path.join(locatorRoot, 'Yang', 'Obesity');
  const masProfilePath = path.join(masProjectWorkspace, 'ops', 'medautoscience', 'profiles', 'obesity.local.toml');

  fs.mkdirSync(masCodeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(masProfilePath), { recursive: true });
  fs.writeFileSync(masProfilePath, '[workspace]\nname = "obesity"\n', 'utf8');

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
  };

  try {
    const bindOutput = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masProjectWorkspace,
      '--workspace-root',
      masCodeRoot,
      '--profile',
      masProfilePath,
      '--label',
      'Obesity',
    ], env);
    const binding = bindOutput.workspace_catalog.binding;
    const expectedMasEntryCommand = String(binding.direct_entry.command);

    assert.equal(binding.project_id, 'medautoscience');
    assert.equal(binding.workspace_path, path.resolve(masProjectWorkspace));
    assert.match(expectedMasEntryCommand, /^opl-test-domain-entry mas status /);
    assert.ok(expectedMasEntryCommand.includes(path.resolve(masCodeRoot)));
    assert.ok(expectedMasEntryCommand.includes(path.resolve(masProfilePath)));
    assert.deepEqual(binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masCodeRoot),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });
  } finally {
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    descriptorFixture.cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
