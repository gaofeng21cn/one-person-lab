import { FrameworkContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadFrameworkContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateFrameworkContracts, writeJsonLine, writeMasCleanRunnerFixture, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('domain manifests executes manifest_command with a bash-compatible shell', () => {
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-bash-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-bash-workspace-'));
  const profilePath = path.join(workspacePath, 'ops', 'medautoscience', 'profiles', 'nfpitnet.workspace.toml');
  const shellGuardPath = path.join(workspacePath, 'manifest-shell-guard.sh');
  const commandFixture = createFamilyLocatorResolverFixture({
    masProfile: profilePath,
    magInput: path.join(workspacePath, 'unused.input.json'),
    redcubeWorkspaceRoot: path.join(workspacePath, 'unused-redcube'),
    masManifest: fixtures.medautoscience,
    magManifest: fixtures.medautogrant,
    redcubeManifest: fixtures.redcube,
  });
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');
  const now = new Date().toISOString();

  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "fixture"\n', 'utf8');
  writeMasCleanRunnerFixture(workspacePath, {
    profilePath,
    manifest: fixtures.medautoscience,
  });
  fs.writeFileSync(
    shellGuardPath,
    '#!/usr/bin/env bash\nset -euo pipefail\n: "${BASH_SOURCE[0]}"\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    workspaceRegistryPath,
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-binding',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspacePath,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command:
              `source ${shellSingleQuote(shellGuardPath)} && `
              + `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(profilePath)} --format json`,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: workspacePath,
              profile_ref: path.resolve(profilePath),
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  try {
    const output = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      PATH: `${commandFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    const medautoscienceEntry = output.domain_manifests.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(medautoscienceEntry?.status, 'resolved');
    assert.equal(medautoscienceEntry?.manifest?.target_domain_id, 'med-autoscience');
  } finally {
    fs.rmSync(commandFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('domain manifests executes managed shell commands with checkout-clean python and uv env', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-clean-env-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-clean-env-workspace-'));
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const commandPath = path.join(stateRoot, 'assert-clean-env.cjs');
  const manifest = loadFamilyManifestFixtures().medautoscience;

  try {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(
      commandPath,
      `const fs = require('node:fs');\n`
        + `const path = require('node:path');\n`
        + `const workspacePath = ${JSON.stringify(workspacePath)};\n`
        + `function fail(message) { console.error(message); process.exit(9); }\n`
        + `function assertExternalEnv(name) {\n`
        + `  const value = process.env[name];\n`
        + `  if (!value) fail(name + ' is not set');\n`
        + `  const resolved = path.resolve(value);\n`
        + `  if (resolved === workspacePath || resolved.startsWith(workspacePath + path.sep)) {\n`
        + `    fail(name + ' points inside the managed workspace: ' + value);\n`
        + `  }\n`
        + `}\n`
        + `if (process.env.PYTHONDONTWRITEBYTECODE !== '1') fail('PYTHONDONTWRITEBYTECODE is not enabled');\n`
        + `assertExternalEnv('PYTHONPYCACHEPREFIX');\n`
        + `assertExternalEnv('UV_PROJECT_ENVIRONMENT');\n`
        + `assertExternalEnv('UV_CACHE_DIR');\n`
        + `assertExternalEnv('XDG_CACHE_HOME');\n`
        + `assertExternalEnv('PIP_CACHE_DIR');\n`
        + `assertExternalEnv('OPL_DOMAIN_COMMAND_TMP_ROOT');\n`
        + `assertExternalEnv('MAS_CLEAN_RUNNER_TMP_ROOT');\n`
        + `assertExternalEnv('MAG_CLEAN_RUNNER_TMP_ROOT');\n`
        + `assertExternalEnv('RCA_CLEAN_RUNNER_TMP_ROOT');\n`
        + `assertExternalEnv('MED_AUTOGRANT_EDITABLE_SHARED_ENV_ROOT');\n`
        + `if (!process.env.PYTEST_ADDOPTS?.includes('cache_dir=')) fail('PYTEST_ADDOPTS lacks external cache dir');\n`
        + `process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8'));\n`,
      'utf8',
    );

    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspacePath,
      '--manifest-command',
      `${process.execPath} ${shellSingleQuote(commandPath)}`,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.manifest_kind, 'med_autoscience_product_entry_manifest');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('domain manifests retries manifest command once with a fresh managed root after uv archive cache corruption', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-cache-retry-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-cache-retry-workspace-'));
  const commandPath = path.join(stateRoot, 'manifest-cache-retry.sh');
  const markerPath = path.join(stateRoot, 'first-run.marker');
  const firstTmpRootPath = path.join(stateRoot, 'first-tmp-root.txt');
  const retryTmpRootPath = path.join(stateRoot, 'retry-tmp-root.txt');
  const manifest = loadFamilyManifestFixtures().medautoscience;

  try {
    fs.writeFileSync(
      commandPath,
      `#!/usr/bin/env bash
set -euo pipefail
if [ ! -f ${JSON.stringify(markerPath)} ]; then
  printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" > ${JSON.stringify(firstTmpRootPath)}
  : > ${JSON.stringify(markerPath)}
  echo 'error: Failed to install: opl_harness_shared-0.1.0-py3-none-any.whl' >&2
  echo "  Caused by: failed to open file \\\`$UV_CACHE_DIR/archive-v0/broken/opl_harness_shared-0.1.0.dist-info/METADATA\\\`: No such file or directory (os error 2)" >&2
  exit 1
fi
printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" > ${JSON.stringify(retryTmpRootPath)}
cat <<'JSON'
${JSON.stringify(manifest)}
JSON
`,
      { mode: 0o755 },
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspacePath,
      '--manifest-command',
      commandPath,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_DOMAIN_COMMAND_TMP_ROOT: path.join(os.tmpdir(), 'opl-domain-manifest-cache-retry-root'),
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 1);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.target_domain_id, 'med-autoscience');
    assert.notEqual(
      fs.readFileSync(firstTmpRootPath, 'utf8').trim(),
      fs.readFileSync(retryTmpRootPath, 'utf8').trim(),
    );
    assert.equal(
      fs.readFileSync(retryTmpRootPath, 'utf8').trim(),
      path.join(
        os.tmpdir(),
        'opl-domain-manifest-cache-retry-root',
        path.basename(workspacePath),
        'recovery',
        path.basename(workspacePath),
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('domain manifests reports invalid json when a bound manifest command is malformed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-invalid-json-state-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      "printf 'not-json'",
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.equal(medautoscience.status, 'invalid_json');
    assert.equal(medautoscience.error.code, 'invalid_json');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests reports stale workspace bindings separately from live manifest command failures', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-stale-binding-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-stale-binding-workspace-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      workspacePath,
      '--manifest-command',
      buildManifestCommand(loadFamilyManifestFixtures().redcube),
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    fs.rmSync(workspacePath, { recursive: true, force: true });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
    });
    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'redcube'
    );

    assert.equal(manifestOutput.domain_manifests.summary.stale_binding_count, 1);
    assert.deepEqual(manifestOutput.domain_manifests.summary.stale_binding_project_ids, ['redcube']);
    assert.equal(manifestOutput.domain_manifests.summary.currentness_owner_action_packet_count, 1);
    assert.deepEqual(
      manifestOutput.domain_manifests.summary.currentness_owner_action_project_ids,
      ['redcube'],
    );
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.deepEqual(manifestOutput.domain_manifests.summary.live_failed_project_ids, []);
    assert.equal(redcube.status, 'workspace_missing');
    assert.equal(redcube.currentness_owner_action_packet.status, 'owner_action_required');
    assert.equal(redcube.currentness_owner_action_packet.action_id, 'rebind_or_archive_stale_workspace_binding');
    assert.deepEqual(redcube.currentness_owner_action_packet.accepted_owner_answer_shapes, [
      'workspace_rebind_ref',
      'workspace_archive_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(redcube.currentness_owner_action_packet.safe_commands.rebind_command,
      `opl workspace bind --project redcube --path ${workspacePath} --manifest-command <manifest-command>`);
    assert.equal(redcube.currentness_owner_action_packet.safe_commands.archive_command,
      `opl workspace archive --project redcube --path ${workspacePath}`);
    assert.equal(redcube.currentness_owner_action_packet.authority_boundary.can_write_domain_truth, false);
    assert.equal(redcube.currentness_owner_action_packet.authority_boundary.can_claim_domain_ready, false);
    assert.equal(redcube.workspace_path, workspacePath);
    assert.equal(redcube.error.code, 'workspace_missing');
    assert.equal(redcube.error.message, 'Active workspace binding path does not exist.');
    assert.equal(redcube.error.stdout, null);
    assert.equal(redcube.error.stderr, null);
    assert.equal(redcube.error.timeout_ms, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('domain manifests reports missing manifest commands as binding configuration attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-config-attention-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-config-attention-workspace-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      workspacePath,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
    });
    const medautogrant = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautogrant'
    );

    assert.equal(manifestOutput.domain_manifests.summary.manifest_not_configured_count, 1);
    assert.deepEqual(
      manifestOutput.domain_manifests.summary.manifest_not_configured_project_ids,
      ['medautogrant'],
    );
    assert.equal(manifestOutput.domain_manifests.summary.currentness_owner_action_packet_count, 1);
    assert.deepEqual(
      manifestOutput.domain_manifests.summary.currentness_owner_action_project_ids,
      ['medautogrant'],
    );
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.deepEqual(manifestOutput.domain_manifests.summary.live_failed_project_ids, []);
    assert.equal(medautogrant.status, 'manifest_not_configured');
    assert.equal(medautogrant.currentness_owner_action_packet.status, 'owner_action_required');
    assert.equal(medautogrant.currentness_owner_action_packet.action_id, 'configure_manifest_command_or_record_typed_blocker');
    assert.deepEqual(medautogrant.currentness_owner_action_packet.accepted_owner_answer_shapes, [
      'manifest_command_configured_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(medautogrant.currentness_owner_action_packet.safe_commands.rebind_command,
      `opl workspace bind --project medautogrant --path ${workspacePath} --manifest-command <manifest-command>`);
    assert.equal(medautogrant.currentness_owner_action_packet.safe_commands.archive_command, null);
    assert.equal(medautogrant.currentness_owner_action_packet.authority_boundary.can_execute_manifest_command, false);
    assert.equal(medautogrant.currentness_owner_action_packet.authority_boundary.can_claim_domain_ready, false);
    assert.equal(medautogrant.manifest_command, null);
    assert.equal(medautogrant.error, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('domain manifests times out stalled manifest commands fail-closed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-timeout-state-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} -e "setTimeout(() => {}, 5000)"`,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '1000',
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 1);
    assert.equal(medautoscience.status, 'command_timeout');
    assert.equal(medautoscience.error.code, 'command_timeout');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests accepts complete stdout manifest even when command cleanup exceeds timeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-timeout-stdout-state-'));
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const slowExitCommandPath = path.join(stateRoot, 'slow-exit-manifest-command.cjs');

  try {
    fs.writeFileSync(manifestPath, `${JSON.stringify(loadFamilyManifestFixtures().medautoscience)}\n`, 'utf8');
    fs.writeFileSync(
      slowExitCommandPath,
      `const fs = require('node:fs');\n`
        + `process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8'));\n`
        + `setTimeout(() => {}, 5000);\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} ${shellSingleQuote(slowExitCommandPath)}`,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '1000',
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 1);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.manifest_kind, 'med_autoscience_product_entry_manifest');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('handoff-envelope returns a machine-readable family handoff bundle aligned with the active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handoff-state-'));
  const resolvedManifest = loadFamilyManifestFixtures().redcube;

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai product-entry',
      '--manifest-command',
      buildManifestCommand(resolvedManifest),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli([
      'contract',
      'handoff-envelope',
      'Prepare',
      'a',
      'defense-ready',
      'slide',
      'deck',
      'for',
      'a',
      'thesis',
      'committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.handoff_bundle.target_domain_id, 'redcube');
    assert.equal(output.handoff_bundle.task_intent, 'create');
    assert.equal(output.handoff_bundle.entry_mode, 'product_entry_handoff');
    assert.equal(output.handoff_bundle.workspace_locator.absolute_path, repoRoot);
    assert.equal(
      output.handoff_bundle.runtime_session_contract.runtime_substrate,
      'codex_default_executor_with_provider_backed_family_runtime',
    );
    assert.equal(output.handoff_bundle.return_surface_contract.opl.resume_command, 'opl session resume <session_id>');
    assert.equal(output.handoff_bundle.return_surface_contract.opl.runtime_status_command, 'opl status runtime --limit 10');
    assert.equal(output.handoff_bundle.return_surface_contract.opl.dashboard_command, 'opl status dashboard');
    assert.equal(output.handoff_bundle.domain_direct_entry.command, 'redcube-ai product-entry');
    assert.equal(
      output.handoff_bundle.domain_direct_entry.manifest_command,
      buildManifestCommand(resolvedManifest),
    );
    assert.equal(output.handoff_bundle.domain_direct_entry.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.status, 'resolved');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_shell, 'direct');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.manifest_target_domain_id, 'redcube_ai');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.domain_agent_entry_spec.agent_id,
      'rca',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.domain_agent_entry_spec.entry_command,
      'redcube product status',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.shared_handoff.opl_return_surface.target_domain_id,
      'redcube_ai',
    );
    const recommendation = output.handoff_bundle.domain_manifest_recommendation;
    assert.equal(recommendation.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(recommendation.runtime_inventory.runtime_owner, 'provider_backed_family_runtime');
    assert.equal(recommendation.task_lifecycle.resume_surface.surface_kind, 'product_entry_session');
    assert.equal(recommendation.product_entry_readiness.verdict, 'service_surface_ready_not_managed_product');
    assert.equal(recommendation.product_entry_preflight.ready_to_try_now, true);
    assert.equal(recommendation.product_entry_start.recommended_mode_id, 'open_product_entry');
    assert.equal(
      recommendation.product_entry_start.modes.some((mode: { mode_id: string }) => mode.mode_id === 'opl_bridge_handoff'),
      true,
    );
    assert.equal(recommendation.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.total_projects_count, 3);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.aligned_projects_count, 1);
    const routedParity = output.handoff_bundle.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(routedParity.entry_parity_status, 'aligned');
    assert.equal(routedParity.direct_entry_locator_status, 'ready');
    assert.equal(routedParity.ready_for_opl_start, true);
    assert.equal(routedParity.ready_for_domain_handoff, true);
    assert.equal(recommendation.skill_runtime_continuity_status, 'ready');
    assertRedcubeActionGraph(recommendation.family_orchestration.action_graph);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain launch resolves a bound direct-entry locator into an honest launcher surface', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-launch-state-'));
  const openFixture = createFakeOpenFixture();
  const shellFixture = createFakeShellCommandFixture();
  const resolvedManifest = loadFamilyManifestFixtures().redcube;

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
      buildManifestCommand(resolvedManifest),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const preview = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(preview.domain_entry_launch.surface_id, 'opl_domain_direct_entry_launch');
    assert.equal(preview.domain_entry_launch.project_id, 'redcube');
    assert.equal(preview.domain_entry_launch.dry_run, true);
    assert.equal(preview.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(preview.domain_entry_launch.launch_status, 'preview_only');
    assert.equal(preview.domain_entry_launch.domain_agent_entry_spec.agent_id, 'rca');
    assert.equal(preview.domain_entry_launch.domain_agent_entry_spec.entry_command, 'redcube product status');
    assert.equal(preview.domain_entry_launch.workspace_locator.absolute_path, repoRoot);
    assert.equal(preview.domain_entry_launch.available_strategies[0], 'open_url');
    assert.equal(preview.domain_entry_launch.available_strategies[1], 'spawn_command');
    assert.equal(preview.domain_entry_launch.direct_entry_locator.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(preview.domain_entry_launch.direct_entry_locator.command.includes(shellFixture.commandPath), true);
    assert.equal(preview.domain_entry_launch.action.command_preview[0], openFixture.openPath);

    const openResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(openResult.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(openResult.domain_entry_launch.launch_status, 'launched');
    assert.equal(openResult.domain_entry_launch.domain_agent_entry_spec.agent_id, 'rca');
    assert.equal(openResult.domain_entry_launch.action.kind, 'open_url');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), 'http://127.0.0.1:3310/redcube');

    const spawnResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--strategy',
      'spawn_command',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(spawnResult.domain_entry_launch.selected_strategy, 'spawn_command');
    assert.equal(spawnResult.domain_entry_launch.launch_status, 'launched');
    assert.equal(spawnResult.domain_entry_launch.domain_agent_entry_spec.agent_id, 'rca');
    assert.equal(spawnResult.domain_entry_launch.action.kind, 'spawn_command');
    assert.equal(typeof spawnResult.domain_entry_launch.action.pid, 'number');

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (fs.existsSync(shellFixture.capturePath)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(fs.existsSync(shellFixture.capturePath), true);
    assert.match(fs.readFileSync(shellFixture.capturePath, 'utf8'), new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(shellFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('session-ledger captures OPL-managed session events with honest resource samples', () => {
  const { fixtureRoot: codexFixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "resume" ] && [ "$2" = "sess_ledger" ]; then
  cat <<'EOF'
{"version":"g2","product_entry":{"entry_surface":"opl_local_product_entry_shell","mode":"resume","interactive":false,"executor_backend":"codex","resume":{"command_preview":["codex","resume","sess_ledger"],"session_id":"sess_ledger","output":"CODEX LEDGER RESUME RESPONSE\\n","exit_code":0}}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ledger-state-'));

  try {
    fs.writeFileSync(
      path.join(stateRoot, 'session-ledger.json'),
      `${JSON.stringify({
        version: 'g2',
        entries: [
          {
            ledger_id: 'seed-ledger-entry',
            recorded_at: '2026-04-24T00:00:00.000Z',
            session_id: 'sess_ledger',
            mode: 'ask',
            source_surface: 'opl_local_product_entry_shell',
            domain_id: 'redcube',
            workstream_id: 'ppt_deck',
            goal_preview: 'Prepare a defense-ready slide deck.',
            workspace_locator: {
              project_id: 'redcube',
              absolute_path: repoRoot,
              source: 'workspace_binding',
              binding_id: 'seed-redcube-binding',
            },
            resource_sample: {
              status: 'captured',
              capture_scope: 'opl_managed_runtime_sample',
              process_count: 2,
              total_rss_kb: 174616,
              total_cpu_percent: 4.4,
            },
          },
        ],
      }, null, 2)}\n`,
    );

    const resumeOutput = runCli(['session', 'resume', 'sess_ledger'], {
      OPL_CODEX_BIN: codexPath,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(resumeOutput.product_entry.mode, 'resume');

    const ledgerOutput = runCli(['session', 'ledger', '--limit', '5'], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(ledgerOutput.session_ledger.summary.entry_count, 2);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.ask, 1);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.resume, 1);
    assert.equal(ledgerOutput.session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(ledgerOutput.session_ledger.entries[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.entries[0].mode, 'resume');
    assert.equal(ledgerOutput.session_ledger.entries[1].mode, 'ask');
    assert.equal(ledgerOutput.session_ledger.sessions.length, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.sessions[0].event_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].domain_id, 'redcube');
    assert.deepEqual(ledgerOutput.session_ledger.sessions[0].modes, ['resume', 'ask']);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.samples_captured, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.samples_unavailable, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_sample_status, 'unavailable');
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.peak_process_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.peak_total_rss_kb, 174616);
    assert.equal(ledgerOutput.session_ledger.summary.session_aggregate_count, 1);

    const runtimeOutput = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.entry_count, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.session_aggregate_count, 1);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.sessions[0].session_id, 'sess_ledger');
  } finally {
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
