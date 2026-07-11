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
  shellSingleQuote,
  test,
} from '../helpers.ts';

test('workspace-bind derives family direct-entry locators from structured project locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
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
  const redcubeDomainEntryDist = path.join(
    redcubeWorkspacePath,
    'packages',
    'redcube-domain-entry',
    'dist',
  );
  fs.mkdirSync(redcubeDomainEntryDist, { recursive: true });
  fs.writeFileSync(
    path.join(redcubeDomainEntryDist, 'index.js'),
    [
      `const manifest = ${JSON.stringify(fixtures.redcube)};`,
      'export async function getProductEntryManifest() { return manifest; }',
      'export async function getProductStatus() { return { ok: true, surface_kind: "product_status", target_domain_id: manifest.target_domain_id, product_entry_manifest: manifest }; }',
      '',
    ].join('\n'),
    'utf8',
  );

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: fixtureRoot,
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
    const expectedMagEntryCommand =
      `uv run --directory ${shellSingleQuote(path.resolve(magWorkspacePath))} python -c ${
        shellSingleQuote(
          `from med_autogrant.product_entry import MedAutoGrantProductEntry; import json; print(json.dumps(MedAutoGrantProductEntry().build_product_status(input_path=${JSON.stringify(path.resolve(magInputPath))}), ensure_ascii=False))`,
        )
      }`;
    const expectedMagManifestCommand =
      `uv run --directory ${shellSingleQuote(path.resolve(magWorkspacePath))} python -c ${
        shellSingleQuote(
          `from med_autogrant.product_entry import MedAutoGrantProductEntry; import json; print(json.dumps(MedAutoGrantProductEntry().build_product_entry_manifest(input_path=${JSON.stringify(path.resolve(magInputPath))}), ensure_ascii=False))`,
        )
      }`;
    const expectedMasEntryCommand =
      `uv run --isolated --frozen --project ${shellSingleQuote(path.resolve(masWorkspacePath))} python -c ${
        shellSingleQuote(
          `from med_autoscience.profiles import load_profile; from med_autoscience.controllers.product_entry import build_product_entry_manifest, build_product_entry_status; import json; profile_ref = ${JSON.stringify(path.resolve(masProfilePath))}; print(json.dumps(build_product_entry_status(profile=load_profile(profile_ref), profile_ref=profile_ref), ensure_ascii=False))`,
        )
      }`;
    const expectedMasManifestCommand =
      `uv run --isolated --frozen --project ${shellSingleQuote(path.resolve(masWorkspacePath))} python -c ${
        shellSingleQuote(
          `from med_autoscience.profiles import load_profile; from med_autoscience.controllers.product_entry import build_product_entry_manifest, build_product_entry_status; import json; profile_ref = ${JSON.stringify(path.resolve(masProfilePath))}; print(json.dumps(build_product_entry_manifest(profile=load_profile(profile_ref), profile_ref=profile_ref), ensure_ascii=False))`,
        )
      }`;
    const redcubeModuleUrl = new URL(
      path.join(
        path.resolve(redcubeWorkspacePath),
        'packages',
        'redcube-domain-entry',
        'dist',
        'index.js',
      ),
      'file://',
    ).href;
    const expectedRedcubeEntryCommand =
      `node -e ${
        shellSingleQuote(
          `import(${JSON.stringify(redcubeModuleUrl)}).then(async (module) => { const payload = await module.getProductStatus({ workspace_root: ${JSON.stringify(path.resolve(redcubeWorkspacePath))} }); console.log(JSON.stringify(payload)); }).catch((error) => { console.error(error && error.stack ? error.stack : String(error)); process.exit(1); })`,
        )
      }`;
    const expectedRedcubeManifestCommand =
      `node -e ${
        shellSingleQuote(
          `import(${JSON.stringify(redcubeModuleUrl)}).then(async (module) => { const payload = await module.getProductEntryManifest({ workspace_root: ${JSON.stringify(path.resolve(redcubeWorkspacePath))} }); console.log(JSON.stringify(payload)); }).catch((error) => { console.error(error && error.stack ? error.stack : String(error)); process.exit(1); })`,
        )
      }`;

    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.command,
      expectedMagEntryCommand,
    );
    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.manifest_command,
      expectedMagManifestCommand,
    );
    assert.deepEqual(magBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autogrant_workspace_input',
      workspace_root: path.resolve(magWorkspacePath),
      profile_ref: null,
      input_path: path.resolve(magInputPath),
    });

    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.command,
      expectedMasEntryCommand,
    );
    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.manifest_command,
      expectedMasManifestCommand,
    );
    assert.deepEqual(masBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masWorkspacePath),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });

    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.command,
      expectedRedcubeEntryCommand,
    );
    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.manifest_command,
      expectedRedcubeManifestCommand,
    );
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
    assert.equal(
      magProject.binding_contract.derived_entry_command_template,
      'uv run --directory <workspace_path> python -c <mag_generated_product_status_materializer>',
    );
    assert.equal(
      magProject.binding_contract.derived_manifest_command_template,
      'uv run --directory <workspace_path> python -c <mag_generated_product_entry_manifest_materializer>',
    );
    assert.deepEqual(masProject.binding_contract.required_locator_fields, ['profile_ref']);
    assert.deepEqual(masProject.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(
      masProject.binding_contract.workspace_locator_surface_kind,
      'med_autoscience_workspace_profile',
    );
    assert.equal(
      masProject.binding_contract.derived_entry_command_template,
      'uv run --isolated --frozen --project <workspace_root> python -c <mas_generated_product_status_materializer>',
    );
    assert.equal(
      masProject.binding_contract.derived_manifest_command_template,
      'uv run --isolated --frozen --project <workspace_root> python -c <mas_generated_product_entry_manifest_materializer>',
    );
    assert.deepEqual(redcubeProject.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(
      redcubeProject.binding_contract.derived_entry_command_template,
      'node -e <redcube_generated_product_status_materializer>',
    );
    assert.equal(
      redcubeProject.binding_contract.derived_manifest_command_template,
      'node -e <redcube_generated_product_entry_manifest_materializer>',
    );
    assert.equal(
      redcubeProject.binding_contract.quick_bind_hint,
      '可只给 workspace_path；若额外提供 workspace_root，则 redcube direct entry 会优先指向它。',
    );

    const manifestOutput = runCliInCwd(['domain', 'manifests'], fixtureRoot, env);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 4);
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
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace-bind can bind a MAS project workspace while using a separate MAS code root', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-mas-project-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
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
    const expectedMasEntryCommand =
      `uv run --isolated --frozen --project ${shellSingleQuote(path.resolve(masCodeRoot))} python -c ${
        shellSingleQuote(
          `from med_autoscience.profiles import load_profile; from med_autoscience.controllers.product_entry import build_product_entry_manifest, build_product_entry_status; import json; profile_ref = ${JSON.stringify(path.resolve(masProfilePath))}; print(json.dumps(build_product_entry_status(profile=load_profile(profile_ref), profile_ref=profile_ref), ensure_ascii=False))`,
        )
      }`;

    assert.equal(binding.project_id, 'medautoscience');
    assert.equal(binding.workspace_path, path.resolve(masProjectWorkspace));
    assert.equal(binding.direct_entry.command, expectedMasEntryCommand);
    assert.deepEqual(binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masCodeRoot),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });
  } finally {
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
