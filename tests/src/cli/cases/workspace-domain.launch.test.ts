import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

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

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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

    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.command,
      `uv run python -m med_autogrant product frontdoor --input ${path.resolve(magInputPath)}`,
    );
    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.manifest_command,
      `uv run python -m med_autogrant product manifest --input ${path.resolve(magInputPath)} --format json`,
    );
    assert.deepEqual(magBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autogrant_workspace_input',
      workspace_root: path.resolve(magWorkspacePath),
      profile_ref: null,
      input_path: path.resolve(magInputPath),
    });

    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.command,
      `uv run python -m med_autoscience.cli product frontdoor --profile ${path.resolve(masProfilePath)}`,
    );
    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.manifest_command,
      `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(masProfilePath)} --format json`,
    );
    assert.deepEqual(masBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masWorkspacePath),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });

    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.command,
      `redcube product frontdoor --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
    );
    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.manifest_command,
      `redcube product manifest --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
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
      'uv run python -m med_autogrant product frontdoor --input <input_path>',
    );
    assert.deepEqual(masProject.binding_contract.required_locator_fields, ['profile_ref']);
    assert.equal(
      masProject.binding_contract.workspace_locator_surface_kind,
      'med_autoscience_workspace_profile',
    );
    assert.equal(
      masProject.binding_contract.derived_manifest_command_template,
      'uv run python -m med_autoscience.cli product manifest --profile <profile_ref> --format json',
    );
    assert.deepEqual(redcubeProject.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(
      redcubeProject.binding_contract.quick_bind_hint,
      '可只给 workspace_path；若额外提供 workspace_root，则 redcube direct entry 会优先指向它。',
    );

    const manifestOutput = runCli(['domain', 'manifests'], env);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant')?.manifest_command,
      `uv run python -m med_autogrant product manifest --input ${path.resolve(magInputPath)} --format json`,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience')?.manifest_command,
      `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(masProfilePath)} --format json`,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube')?.manifest_command,
      `redcube product manifest --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
    );

    const dashboardOutput = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
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

test('start returns the routed family start surface for a bound project', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-start-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdoor',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], env);

    const output = runCli(['start', '--project', 'redcube'], env);
    assert.equal(output.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(output.product_entry_start.project_id, 'redcube');
    assert.equal(output.product_entry_start.target_domain_id, 'redcube_ai');
    assert.equal(output.product_entry_start.recommended_mode_id, 'open_frontdoor');
    assert.equal(output.product_entry_start.selected_mode_id, 'open_frontdoor');
    assert.equal(output.product_entry_start.selected_mode.mode_id, 'open_frontdoor');
    assert.equal(output.product_entry_start.selected_mode.command, 'redcube product frontdoor');
    assert.equal(output.product_entry_start.available_modes[2].mode_id, 'opl_bridge_handoff');
    assert.equal(output.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
    assert.deepEqual(output.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
      'redcube-ai frontdoor',
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
    assert.equal(output.handoff_bundle.runtime_session_contract.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.handoff_bundle.return_surface_contract.opl.resume_command, 'opl session resume <session_id>');
    assert.equal(
      output.handoff_bundle.return_surface_contract.opl.logs_command,
      'opl session logs gateway --session <session_id>',
    );
    assert.equal(output.handoff_bundle.return_surface_contract.opl.dashboard_command, 'opl status dashboard');
    assert.equal(output.handoff_bundle.domain_direct_entry.command, 'redcube-ai frontdoor');
    assert.equal(
      output.handoff_bundle.domain_direct_entry.manifest_command,
      buildManifestCommand(resolvedManifest),
    );
    assert.equal(output.handoff_bundle.domain_direct_entry.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.status, 'resolved');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_shell, 'direct');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_command, 'redcube product invoke');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.frontdoor_surface.command, 'redcube product frontdoor');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.operator_loop_surface.shell_key, 'direct');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.operator_loop_surface.continuation_command,
      'redcube product session',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.operator_loop_actions.start_deliverable.command,
      'redcube product invoke',
    );
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.manifest_target_domain_id, 'redcube_ai');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_shell.opl_bridge.surface_kind,
      'federated_product_entry',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.domain_agent_entry_spec.agent_id,
      'rca',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.domain_agent_entry_spec.entry_command,
      'redcube product frontdoor',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.shared_handoff.opl_return_surface.target_domain_id,
      'redcube_ai',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_status.summary,
      'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.runtime_inventory.surface_kind,
      'runtime_inventory',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.runtime_inventory.runtime_owner,
      'upstream_hermes_agent',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.task_lifecycle.surface_kind,
      'task_lifecycle',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.task_lifecycle.resume_surface.surface_kind,
      'product_entry_session',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.session_continuity.surface_kind,
      'session_continuity',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.progress_projection.surface_kind,
      'progress_projection',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.artifact_inventory.surface_kind,
      'artifact_inventory',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.runtime_control.surface_kind,
      'runtime_control',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_catalog.surface_kind,
      'skill_catalog',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_catalog.skills.length,
      2,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.automation.surface_kind,
      'automation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.automation.automations[0].automation_id,
      'redcube_autopilot_continuation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_readiness.verdict,
      'service_surface_ready_not_managed_product',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_readiness.recommended_start_command,
      'redcube product frontdoor',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.surface_kind,
      'product_entry_preflight',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.ready_to_try_now,
      true,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.surface_kind,
      'product_entry_start',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.recommended_mode_id,
      'open_frontdoor',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.modes[2].mode_id,
      'opl_bridge_handoff',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_overview.progress_surface.command,
      'redcube product session --entry-session-id <entry-session-id>',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.repo_mainline.phase_id,
      'repo_verified_product_entry_and_opl_federation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.action_graph_ref.ref,
      '/family_orchestration/action_graph',
    );
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.total_projects_count, 3);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.aligned_projects_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.runtime_inventory_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.task_lifecycle_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.runtime_control_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.session_continuity_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.progress_projection_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.artifact_inventory_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.skill_catalog_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.skill_runtime_continuity_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.automation_ready_count, 1);
    assert.equal(
      output.handoff_bundle.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    const routedParity = output.handoff_bundle.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(routedParity.entry_parity_status, 'aligned');
    assert.equal(routedParity.direct_entry_locator_status, 'ready');
    assert.equal(routedParity.ready_for_opl_start, true);
    assert.equal(routedParity.ready_for_domain_handoff, true);
    assert.equal(routedParity.runtime_inventory_status, 'ready');
    assert.equal(routedParity.task_lifecycle_status, 'ready');
    assert.equal(routedParity.runtime_control_status, 'ready');
    assert.equal(routedParity.session_continuity_status, 'ready');
    assert.equal(routedParity.progress_projection_status, 'ready');
    assert.equal(routedParity.artifact_inventory_status, 'ready');
    assert.equal(routedParity.skill_catalog_status, 'ready');
    assert.equal(routedParity.skill_runtime_continuity_status, 'ready');
    assert.equal(routedParity.automation_status, 'ready');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_runtime_continuity_status,
      'ready',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_runtime_continuity_session_locator_field,
      'entry_session_id',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_runtime_continuity_resume_command,
      'redcube product session --entry-session-id <entry-session-id>',
    );
    assertRedcubeActionGraph(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.action_graph,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.resume_contract.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
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
    assert.equal(preview.domain_entry_launch.domain_agent_entry_spec.entry_command, 'redcube product frontdoor');
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

    for (let attempt = 0; attempt < 20; attempt += 1) {
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
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "--resume" ] && [ "$2" = "sess_ledger" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
SESSION LEDGER RESUME RESPONSE

session_id: sess_ledger
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Ledger session                                     1m ago        cli    sess_ledger
EOF
  exit 0
fi
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         1
◆ Sessions
  Active:       1
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.2 0.4 49616 00:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 4.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume sess_ledger`);
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

    const resumeOutput = runCli(['session', 'resume', 'sess_ledger', '--executor', 'hermes'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(resumeOutput.product_entry.mode, 'resume');

    const ledgerOutput = runCli(['session', 'ledger', '--limit', '5'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(ledgerOutput.session_ledger.summary.entry_count, 2);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.ask, 1);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.resume, 1);
    assert.equal(ledgerOutput.session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(ledgerOutput.session_ledger.summary.workspace_binding_count, 1);
    assert.equal(ledgerOutput.session_ledger.entries[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.entries[0].mode, 'resume');
    assert.equal(ledgerOutput.session_ledger.entries[0].domain_id, 'redcube');
    assert.equal(ledgerOutput.session_ledger.entries[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerOutput.session_ledger.entries[1].mode, 'ask');
    assert.equal(ledgerOutput.session_ledger.sessions.length, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.sessions[0].event_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].domain_id, 'redcube');
    assert.deepEqual(ledgerOutput.session_ledger.sessions[0].modes, ['resume', 'ask']);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.samples_captured, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_sample_status, 'captured');
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_process_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_total_rss_kb, 174616);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_total_cpu_percent, 4.4);
    assert.equal(ledgerOutput.session_ledger.sessions[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerOutput.session_ledger.summary.session_aggregate_count, 1);

    const runtimeOutput = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.entry_count, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.session_aggregate_count, 1);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.sessions[0].session_id, 'sess_ledger');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
