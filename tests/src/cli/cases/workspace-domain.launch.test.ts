import {
  assert,
  buildManifestCommand,
  createFakeOpenFixture,
  createFakeShellCommandFixture,
  fs,
  loadFamilyManifestFixtures,
  os,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

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
