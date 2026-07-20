import {
  assert,
  buildManifestCommand,
  createFakeOpenFixture,
  createFakeShellCommandFixture,
  fs,
  installRuntimePackageFixture,
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
  scholarSkillsCoreSkillIds,
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';

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
    ], { OPL_STATE_DIR: stateRoot });
    installRuntimePackageFixture(stateRoot, 'redcube-ai');

    const preview = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
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

test('MAS launch activates a new workspace scope and automatically recovers managed Skill drift', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-domain-launch-mas-scope-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(root, providerManifest);
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const openFixture = createFakeOpenFixture();
  const entryUrl = 'http://127.0.0.1:3310/mas';
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_OPEN_BIN: openFixture.openPath,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
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
    const ledgerBeforeDryRun = fs.readFileSync(lifecycleLedger, 'utf8');
    const dryRun = runCli([
      'domain', 'launch', '--project', 'medautoscience', '--dry-run',
    ], env).domain_entry_launch;
    assert.equal(dryRun.dry_run, true);
    assert.equal(dryRun.launch_status, 'preview_only');
    assert.equal(fs.existsSync(skillsRoot), false);
    assert.equal(fs.existsSync(openFixture.capturePath), false);
    assert.equal(fs.readFileSync(lifecycleLedger, 'utf8'), ledgerBeforeDryRun);

    const firstLaunch = runCli([
      'domain', 'launch', '--project', 'medautoscience',
    ], env).domain_entry_launch;
    assert.equal(firstLaunch.dry_run, false);
    assert.equal(firstLaunch.launch_status, 'launched');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), entryUrl);
    assert.deepEqual(fs.readdirSync(skillsRoot).sort(), [...scholarSkillsCoreSkillIds].sort());
    assert.equal(fs.existsSync(path.join(skillsRoot, 'medical-optional-specialty')), false);
    const current = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(current.materialization_readiness.status, 'current');
    assert.match(current.materialization_readiness.lifecycle_receipt_ref, /^opl:\/\/agent-package\/activate\//);

    fs.rmSync(path.join(skillsRoot, 'medical-manuscript-writing'), { recursive: true, force: true });
    const resumed = runCli([
      'domain', 'launch', '--project', 'medautoscience',
    ], env).domain_entry_launch;
    assert.equal(resumed.launch_status, 'launched');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), entryUrl);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'medical-manuscript-writing', 'SKILL.md')), true);
  } finally {
    removeFixtureTree(root);
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('quest activation materializes core skills and automatically recovers managed Skill drift', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-quest-package-activation-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const quest = path.join(root, 'quest');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(root, providerManifest);
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
  };
  fs.mkdirSync(quest, { recursive: true });
  try {
    await runCliAsync([
      'packages', 'install', 'mas',
    ], env);
    const preview = runCli([
      'packages', 'activate', 'mas', '--scope', 'quest', '--target-quest', quest, '--dry-run',
    ], env).opl_agent_package_activation;
    assert.equal(preview.status, 'validated_no_write');
    assert.equal(preview.operational_ready, false);
    assert.equal(preview.launch_allowed, false);
    assert.equal(fs.existsSync(path.join(quest, '.codex', 'skills')), false);
    const activation = runCli([
      'packages', 'activate', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_activation;
    assert.equal(activation.status, 'activated');
    assert.equal(activation.package_id, 'mas');
    assert.match(activation.lifecycle_receipt_ref, /^opl:\/\/agent-package\/activate\//);
    const skillsRoot = path.join(quest, '.codex', 'skills');
    assert.deepEqual(fs.readdirSync(skillsRoot).sort(), [...scholarSkillsCoreSkillIds].sort());
    assert.equal(fs.existsSync(path.join(skillsRoot, 'medical-optional-specialty')), false);
    const current = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_status;
    assert.equal(current.materialization_readiness.status, 'current');
    assert.equal(current.operational_ready, true);

    fs.rmSync(path.join(skillsRoot, 'medical-manuscript-writing'), { recursive: true, force: true });
    const recovered = runCli([
      'packages', 'activate', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_activation;
    assert.equal(recovered.operational_ready, true);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'medical-manuscript-writing', 'SKILL.md')), true);
    const repaired = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'quest', '--target-quest', quest,
    ], env).opl_agent_package_status;
    assert.equal(repaired.materialization_readiness.status, 'current');
    assert.equal(repaired.operational_ready, true);
  } finally {
    removeFixtureTree(root);
  }
});

test('workspace activation automatically ensures the installed MAS package scope', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/opl-workspace-package-activation-`);
  const stateRoot = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const workspaceC = path.join(root, 'workspace-c');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(root, providerManifest);
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumerManifest, providerManifest]);
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    OPL_WORKSPACE_ROOT: workspaceA,
    OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'opl-managed-package-test',
    ...releaseSet.env,
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
    assert.deepEqual(
      fs.readdirSync(path.join(workspaceC, '.codex', 'skills')).sort(),
      [...scholarSkillsCoreSkillIds].sort(),
    );

    runCli(['workspace', 'activate', '--project', 'medautoscience', '--path', workspaceA], env);
    assert.deepEqual(
      fs.readdirSync(path.join(workspaceA, '.codex', 'skills')).sort(),
      [...scholarSkillsCoreSkillIds].sort(),
    );
    const current = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspaceA,
    ], env).opl_agent_package_status;
    assert.equal(current.materialization_readiness.status, 'current');
    assert.equal(current.launch_allowed, true);
    const appState = runCli(['app', 'state', '--profile', 'fast'], env).app_state;
    assert.equal(appState.agent_packages.status_index.packages.mas.status, 'verification_deferred');
    assert.equal(
      appState.agent_packages.status_index.packages.mas.operational_ready,
      false,
    );
    assert.equal(appState.agent_packages.status_index.packages.mas.launch_allowed, false);
    assert.equal(
      appState.agent_packages.status_index.packages.mas.launch_blocked_reason,
      'live_verification_deferred',
    );

    fs.rmSync(path.join(workspaceA, '.codex', 'skills', 'medical-manuscript-writing'), {
      recursive: true,
      force: true,
    });
    const drifted = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspaceA,
    ], env).opl_agent_package_status;
    assert.equal(drifted.operational_ready, false);
    assert.equal(drifted.launch_allowed, false);
    assert.equal(
      drifted.launch_blocked_reason,
      'scope_materialization_missing',
    );
    runCli(['workspace', 'activate', '--project', 'medautoscience', '--path', workspaceB], env);
    runCli([
      'workspace', 'activate', '--project', 'medautoscience', '--path', workspaceA,
    ], env);
    assert.equal(
      fs.existsSync(path.join(workspaceA, '.codex', 'skills', 'medical-manuscript-writing', 'SKILL.md')),
      true,
    );
    const recovered = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspaceA,
    ], env).opl_agent_package_status;
    assert.equal(recovered.materialization_readiness.status, 'current');
    assert.equal(recovered.operational_ready, true);
  } finally {
    removeFixtureTree(root);
  }
});
