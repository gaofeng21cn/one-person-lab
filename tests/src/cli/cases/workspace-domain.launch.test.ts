import {
  assert,
  buildManifestCommand,
  createFakeCodexPluginManagerFixture,
  createFakeOpenFixture,
  createFakeShellCommandFixture,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  removeFixtureTree,
  repoRoot,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';
import {
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';

function createPackageCarrierBinary(root: string) {
  return createFakeCodexPluginManagerFixture(path.join(root, 'fixture-bin')).codexPath;
}

function createInstalledRcaCarrierFixture(root: string) {
  const sourceRoot = path.join(root, 'installed-redcube-ai');
  const skillRoot = path.join(sourceRoot, 'skills', 'redcube-ai');
  const binary = path.join(root, 'installed-redcube-ai-codex.mjs');
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'redcube-ai', version: '0.2.11', skills: './skills/' }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# RedCube AI\n');
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1',
    kind: 'agent',
    agent_id: 'rca',
    package_id: 'rca',
    domain_id: 'redcube_ai',
    display_name: 'RedCube AI',
    publisher: 'one-person-lab',
    version: '0.2.11',
    source: 'first_party_repo_local',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'redcube-ai',
      plugin_source_path: '.',
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: 'redcube-ai@redcube-ai-local',
        executor_route: 'codex_cli',
        marketplace_source: 'gaofeng21cn/redcube-ai',
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/rca:latest-stable',
      },
      required_skill_ids: ['redcube-ai'],
    },
    requires: [],
    capability_dependencies: [],
  }, null, 2)}\n`);
  fs.writeFileSync(binary, `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') !== 'plugin list --json') process.exit(2);
process.stdout.write(JSON.stringify({ installed: [{
  pluginId: 'redcube-ai@redcube-ai-local',
  version: '0.2.11',
  installed: true,
  enabled: true,
  source: { source: 'local', path: ${JSON.stringify(sourceRoot)} },
  marketplaceSource: { sourceType: 'remote', source: 'gaofeng21cn/redcube-ai' },
}], available: [] }));
`, { mode: 0o755 });
  return { OPL_CODEX_PLUGIN_BIN: binary };
}

test('domain manifests resolves bound manifests and reports owner-action configuration gaps', () => {
  const resolvedState = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-manifest-resolved-`);
  const invalidState = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-manifest-invalid-`);
  const missingState = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-manifest-missing-`);
  const masPack = createAdmittedStagePackFixture(
    loadFamilyManifestFixtures().medautoscience,
    'med-autoscience',
    'MedAutoScience',
  );
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], { OPL_STATE_DIR: resolvedState, OPL_FAMILY_WORKSPACE_ROOT: resolvedState });
    const resolved = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: resolvedState,
      OPL_FAMILY_WORKSPACE_ROOT: resolvedState,
    }).domain_manifests;
    assert.equal(resolved.summary.resolved_count, 1);
    assert.equal(resolved.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    ).manifest.target_domain_id, 'med-autoscience');

    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      "printf 'not-json'",
    ], { OPL_STATE_DIR: invalidState, OPL_FAMILY_WORKSPACE_ROOT: invalidState });
    const invalid = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: invalidState,
      OPL_FAMILY_WORKSPACE_ROOT: invalidState,
    }).domain_manifests;
    const invalidMedautoscience = invalid.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );
    assert.equal(invalidMedautoscience.status, 'invalid_json');

    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
    ], { OPL_STATE_DIR: missingState, OPL_FAMILY_WORKSPACE_ROOT: missingState });
    const missing = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: missingState,
      OPL_FAMILY_WORKSPACE_ROOT: missingState,
    }).domain_manifests;
    assert.equal(missing.summary.manifest_not_configured_count, 1);
    assert.equal(missing.projects[0].currentness_owner_action_packet.action_id, 'configure_manifest_command_or_record_typed_blocker');
    assert.equal(missing.projects[0].currentness_owner_action_packet.authority_boundary.can_claim_domain_ready, false);
  } finally {
    fs.rmSync(resolvedState, { recursive: true, force: true });
    fs.rmSync(invalidState, { recursive: true, force: true });
    fs.rmSync(missingState, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('domain manifests fail closed on stalled command but accept complete stdout before timeout', () => {
  const timeoutState = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-manifest-timeout-`);
  const stdoutState = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-manifest-stdout-`);
  const masPack = createAdmittedStagePackFixture(
    loadFamilyManifestFixtures().medautoscience,
    'med-autoscience',
    'MedAutoScience',
  );
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      `${process.execPath} -e "setTimeout(() => {}, 5000)"`,
    ], { OPL_STATE_DIR: timeoutState, OPL_FAMILY_WORKSPACE_ROOT: timeoutState });
    const timeout = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: timeoutState,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '1000',
      OPL_FAMILY_WORKSPACE_ROOT: timeoutState,
    }).domain_manifests;
    const timeoutMedautoscience = timeout.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );
    assert.equal(timeout.summary.failed_count, 1);
    assert.equal(timeoutMedautoscience.status, 'command_timeout');

    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      `${process.execPath} -e "process.stdout.write(process.argv[1]); setTimeout(() => {}, 5000)" '${
        JSON.stringify(masPack.manifest).replaceAll("'", "'\\''")
      }'`,
    ], { OPL_STATE_DIR: stdoutState, OPL_FAMILY_WORKSPACE_ROOT: stdoutState });
    const stdout = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stdoutState,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '1000',
      OPL_FAMILY_WORKSPACE_ROOT: stdoutState,
    }).domain_manifests;
    assert.equal(stdout.summary.resolved_count, 1);
    assert.equal(stdout.summary.failed_count, 0);
  } finally {
    fs.rmSync(timeoutState, { recursive: true, force: true });
    fs.rmSync(stdoutState, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('domain launch exposes honest direct-entry launcher preview without running domain truth', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-launch-state-`);
  const openFixture = createFakeOpenFixture();
  const shellFixture = createFakeShellCommandFixture();
  const carrierEnv = createInstalledRcaCarrierFixture(stateRoot);
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      `${shellFixture.commandPath} --workspace ${repoRoot}`,
      '--manifest-command',
      buildManifestCommand(loadFamilyManifestFixtures().redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], { OPL_STATE_DIR: stateRoot, ...carrierEnv });

    const preview = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
      ...carrierEnv,
    }).domain_entry_launch;

    assert.equal(preview.dry_run, true);
    assert.equal(preview.selected_strategy, 'open_url');
    assert.equal(preview.domain_agent_entry_spec.agent_id, 'rca');
    assert.equal(preview.direct_entry_locator.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(preview.workspace_locator.absolute_path, repoRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(shellFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('domain launch blocks a canonical package that is not installed', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-launch-package-gate-`);
  try {
    runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', repoRoot,
      '--entry-command', 'printf blocked',
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], { OPL_STATE_DIR: stateRoot });
    const failure = runCliFailure([
      'domain', 'launch', '--project', 'medautoscience', '--dry-run',
    ], { OPL_STATE_DIR: stateRoot });
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_not_installed');
    assert.deepEqual(failure.payload.error.details.allowed_when_blocked, ['status', 'doctor', 'repair']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain launch consumes native carrier readiness without entering legacy scope activation', () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-launch-native-readback-`);
  const stateRoot = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const pluginSource = path.join(root, 'plugin-source');
  const skillRoot = path.join(pluginSource, 'skills', 'redcube-ai');
  const binary = path.join(root, 'fake-codex.mjs');
  const invocationLog = path.join(root, 'native-carrier.log');
  const lockPath = path.join(stateRoot, 'agent-package-locks.json');
  const legacyLockBytes = '{ invalid legacy lock\n';
  const openFixture = createFakeOpenFixture();
  const entryUrl = 'http://127.0.0.1:3310/native-redcube';
  fs.mkdirSync(path.join(pluginSource, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(
    path.join(pluginSource, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'redcube-ai', version: '0.2.11', skills: './skills/' }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# RedCube AI\n');
  fs.writeFileSync(path.join(pluginSource, 'opl-package.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1',
    kind: 'agent',
    agent_id: 'rca',
    package_id: 'rca',
    domain_id: 'redcube_ai',
    display_name: 'RedCube AI',
    publisher: 'one-person-lab',
    version: '0.2.11',
    source: 'first_party_repo_local',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    source_repo: 'https://github.com/gaofeng21cn/redcube-ai.git',
    schema_ref: 'one-person-lab/contracts/opl-framework/agent-package-manifest.schema.json',
    domain_descriptor_ref: 'contracts/domain_descriptor.json',
    task_provider_ref: 'contracts/domain_descriptor.json#/standard_agent_interface/stage_catalog',
    action_catalog_ref: 'contracts/action_catalog.json',
    view_refs: [],
    entrypoints: [{
      entrypoint_id: 'codex_primary_skill',
      entrypoint_kind: 'codex_skill',
      source_ref: 'agent/primary_skill/SKILL.md',
      carrier_ref: 'skills/redcube-ai/SKILL.md',
      authority: 'carrier_only_not_domain_truth',
    }],
    codex_surface: {
      plugin_id: 'redcube-ai',
      plugin_source_path: '.',
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: 'redcube-ai@redcube-ai-local',
        executor_route: 'codex_cli',
        marketplace_source: 'gaofeng21cn/redcube-ai',
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/rca:latest-stable',
      },
      required_skill_ids: ['redcube-ai'],
    },
    requires: [],
    capability_dependencies: [],
  }, null, 2)}\n`);
  fs.writeFileSync(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_INVOCATION_LOG, args.join(' ') + '\\n');
if (args.join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: [{
    pluginId: 'redcube-ai@redcube-ai-local',
    version: '0.2.11',
    installed: true,
    enabled: process.env.FIXTURE_PLUGIN_ENABLED !== 'false',
    source: { source: 'local', path: process.env.FIXTURE_PLUGIN_SOURCE },
  }], available: [] }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  const baseEnv = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateRoot,
    OPL_OPEN_BIN: openFixture.openPath,
  };
  try {
    runCli([
      'workspace', 'bind', '--project', 'redcube', '--path', workspace,
      '--entry-url', entryUrl,
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().redcube),
    ], baseEnv);
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(lockPath, legacyLockBytes);

    const nativeEnv = {
      ...baseEnv,
      OPL_CODEX_PLUGIN_BIN: binary,
      FIXTURE_INVOCATION_LOG: invocationLog,
      FIXTURE_PLUGIN_SOURCE: pluginSource,
    };
    const launched = runCli([
      'domain', 'launch', '--project', 'redcube',
    ], nativeEnv).domain_entry_launch;

    assert.equal(launched.launch_status, 'launched');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), entryUrl);
    const disabled = runCliFailure([
      'domain', 'launch', '--project', 'redcube',
    ], {
      ...nativeEnv,
      FIXTURE_PLUGIN_ENABLED: 'false',
    });
    assert.equal(
      disabled.payload.error.details.failure_code,
      'agent_package_operational_readiness_blocked',
    );
    assert.equal(
      disabled.payload.error.details.launch_blocked_reason,
      'configured_native_carrier_disabled',
    );
    const nativeInvocations = fs.readFileSync(invocationLog, 'utf8').trim().split('\n');
    assert.equal(nativeInvocations.length >= 1, true);
    assert.equal(nativeInvocations.every((command) => command === 'plugin list --json'), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), legacyLockBytes);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-lifecycle.sqlite')), false);
    assert.equal(fs.existsSync(path.join(workspace, '.codex', 'skills')), false);
  } finally {
    removeFixtureTree(root);
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('MAS launch consumes the native carrier without private workspace materialization', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-launch-mas-scope-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    configuredCarrier: true,
  });
  const consumerManifest = writeMasConsumer(root, providerManifest, '0.1.0a4', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const openFixture = createFakeOpenFixture();
  const entryUrl = 'http://127.0.0.1:3310/mas';
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_OPEN_BIN: openFixture.openPath,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
    OPL_CODEX_PLUGIN_BIN: createPackageCarrierBinary(root),
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
      '--entry-url', entryUrl,
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], env);
    await runCliAsync([
      'packages', 'install', 'mas',
    ], env);

    const skillsRoot = path.join(workspace, '.codex', 'skills');
    const lifecycleLedger = path.join(stateRoot, 'agent-package-lifecycle-ledger.json');
    assert.equal(fs.existsSync(skillsRoot), false);
    assert.equal(fs.existsSync(lifecycleLedger), false);
    const dryRun = runCli([
      'domain', 'launch', '--project', 'medautoscience', '--dry-run',
    ], env).domain_entry_launch;
    assert.equal(dryRun.dry_run, true);
    assert.equal(dryRun.launch_status, 'preview_only');
    assert.equal(fs.existsSync(skillsRoot), false);
    assert.equal(fs.existsSync(openFixture.capturePath), false);
    assert.equal(fs.existsSync(lifecycleLedger), false);

    const firstLaunch = runCli([
      'domain', 'launch', '--project', 'medautoscience',
    ], env).domain_entry_launch;
    assert.equal(firstLaunch.dry_run, false);
    assert.equal(firstLaunch.launch_status, 'launched');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), entryUrl);
    assert.equal(fs.existsSync(skillsRoot), false);
    const current = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(Object.hasOwn(current, 'materialization_readiness'), false);
    assert.equal(current.configured_carrier.status, 'installed');
    assert.equal(current.installed_readiness.callability, 'callable');
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(lifecycleLedger), false);
  } finally {
    removeFixtureTree(root);
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('quest root activation reports the native MAS carrier already active without scope writes', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-quest-package-activation-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const quest = path.join(root, 'quest');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    configuredCarrier: true,
  });
  const consumerManifest = writeMasConsumer(root, providerManifest, '0.1.0a4', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
    OPL_CODEX_PLUGIN_BIN: createPackageCarrierBinary(root),
  };
  fs.mkdirSync(quest, { recursive: true });
  try {
    const bound = runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', quest,
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], env).workspace_catalog;
    const boundProject = bound.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(bound.action, 'bind');
    assert.equal(bound.binding.status, 'active');
    assert.equal(bound.binding.workspace_path, quest);
    assert.equal(boundProject.active_binding.binding_id, bound.binding.binding_id);
    assert.equal(boundProject.bindings[0].workspace_path_currentness.status, 'current');
    await runCliAsync([
      'packages', 'install', 'mas',
    ], env);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);
    const preview = runCli([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', quest, '--dry-run',
    ], env).opl_agent_package_activation;
    assert.equal(preview.status, 'validated_no_write');
    assert.equal(preview.operational_ready, true);
    assert.equal(preview.launch_allowed, true);
    assert.equal(preview.writes_performed, false);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);
    const activation = runCli([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', quest,
    ], env).opl_agent_package_activation;
    assert.equal(activation.status, 'already_activated');
    assert.equal(activation.package_id, 'mas');
    assert.equal(activation.writes_performed, false);
    assert.equal(Object.hasOwn(activation, 'lifecycle_receipt_ref'), false);
    assert.equal(Object.hasOwn(activation, 'package_use_binding'), false);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);
    const current = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', quest,
    ], env).opl_agent_package_status;
    assert.equal(Object.hasOwn(current, 'materialization_readiness'), false);
    assert.equal(current.operational_ready, true);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('workspace bindings reuse the native MAS carrier without per-workspace Skill projection', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-workspace-package-activation-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const workspaceC = path.join(root, 'workspace-c');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    configuredCarrier: true,
  });
  const consumerManifest = writeMasConsumer(root, providerManifest, '0.1.0a4', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_WORKSPACE_ROOT: workspaceA,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
    OPL_CODEX_PLUGIN_BIN: createPackageCarrierBinary(root),
  };
  fs.mkdirSync(workspaceA, { recursive: true });
  fs.mkdirSync(workspaceB, { recursive: true });
  fs.mkdirSync(workspaceC, { recursive: true });
  try {
    for (const workspace of [workspaceA, workspaceB]) {
      runCli([
        'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
        '--entry-command', 'printf launched',
        '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
      ], env);
    }
    await runCliAsync([
      'packages', 'install', 'mas',
    ], env);

    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills')), false);
    assert.equal(fs.existsSync(path.join(workspaceB, '.codex', 'skills')), false);
    runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', workspaceC,
      '--entry-command', 'printf launched',
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], env);
    assert.equal(fs.existsSync(path.join(workspaceC, '.codex', 'skills')), false);

    runCli(['workspace', 'activate', '--project', 'medautoscience', '--path', workspaceA], env);
    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills')), false);
    const current = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspaceA,
    ], env).opl_agent_package_status;
    assert.equal(Object.hasOwn(current, 'materialization_readiness'), false);
    assert.equal(current.launch_allowed, true);
    assert.equal(current.configured_carrier.status, 'installed');
    const appState = runCli(['app', 'state', '--profile', 'fast'], env).app_state;
    assert.equal(appState.agent_packages.status_index.packages.mas.status, 'available');
    assert.equal(
      appState.agent_packages.status_index.packages.mas.operational_ready,
      true,
    );
    assert.equal(appState.agent_packages.status_index.packages.mas.launch_allowed, true);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(
      appState.agent_packages.status_index.packages.mas.launch_blocked_reason,
      null,
    );

    runCli(['workspace', 'activate', '--project', 'medautoscience', '--path', workspaceB], env);
    runCli([
      'workspace', 'activate', '--project', 'medautoscience', '--path', workspaceA,
    ], env);
    assert.equal(fs.existsSync(path.join(workspaceA, '.codex', 'skills')), false);
    assert.equal(fs.existsSync(path.join(workspaceB, '.codex', 'skills')), false);
  } finally {
    removeFixtureTree(root);
  }
});
