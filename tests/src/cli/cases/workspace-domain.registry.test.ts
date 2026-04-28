import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('workspace registry commands bind activate and archive project workspaces with direct-entry locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-fixture-'));

  try {
    const bindOutput = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--label',
      'RedCube Main Workspace',
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(bindOutput.workspace_catalog.action, 'bind');
    assert.equal(bindOutput.workspace_catalog.binding.project_id, 'redcube');
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.command, 'redcube-ai frontdesk');
    assert.equal(
      bindOutput.workspace_catalog.binding.direct_entry.manifest_command,
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
    );
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.url, 'http://127.0.0.1:3310/redcube');

    const catalogOutput = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(catalogOutput.workspace_catalog.projects.length, 4);
    assert.equal(catalogOutput.workspace_catalog.projects[3].project_id, 'redcube');
    assert.equal(catalogOutput.workspace_catalog.projects[3].active_binding.workspace_path, repoRoot);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.total, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.direct_entry_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.manifest_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].last_updated_at, bindOutput.workspace_catalog.binding.updated_at);
    assert.deepEqual(catalogOutput.workspace_catalog.projects[3].available_actions, ['bind', 'activate', 'archive', 'launch']);
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.surface_id,
      'opl_project_workspace_binding_contract',
    );
    assert.deepEqual(
      catalogOutput.workspace_catalog.projects[3].binding_contract.required_locator_fields,
      [],
    );
    assert.deepEqual(
      catalogOutput.workspace_catalog.projects[3].binding_contract.optional_locator_fields,
      ['workspace_root'],
    );
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.derived_entry_command_template,
      'redcube product frontdesk --workspace-root <workspace_root>',
    );
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.derived_manifest_command_template,
      'redcube product manifest --workspace-root <workspace_root>',
    );
    assert.equal(catalogOutput.workspace_catalog.summary.active_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.direct_entry_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.manifest_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.last_binding_change_at, bindOutput.workspace_catalog.binding.updated_at);

    const archiveOutput = runCli([
      'workspace',
      'archive',
      '--project',
      'redcube',
      '--path',
      repoRoot,
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(archiveOutput.workspace_catalog.action, 'archive');
    assert.equal(archiveOutput.workspace_catalog.binding.status, 'archived');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests resolves real family manifest fixtures while workspace list stays registry-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-state-'));
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
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautogrant),
    ], env);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], env);
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], env);

    const catalogOutput = runCli(['workspace', 'list'], env);
    const magCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const masCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');
    const redcubeCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(magCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautogrant));
    assert.equal(masCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautoscience));
    assert.equal(redcubeCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.redcube));

    const manifestOutput = runCli(['domain', 'manifests'], env);
    assert.equal(manifestOutput.domain_manifests.summary.total_projects_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.manifest_configured_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.ok(
      manifestOutput.domain_manifests.notes.some((note: string) =>
        note.includes('opl workspace list') && note.includes('opl domain manifests'),
      ),
    );

    const medautogrant = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.equal(medautogrant.status, 'resolved');
    assert.equal(medautogrant.manifest.recommended_shell, 'grant_user_loop');
    assert.equal(medautogrant.manifest.frontdesk_surface.shell_key, 'product_frontdesk');
    assert.equal(medautogrant.manifest.operator_loop_surface.shell_key, 'grant_user_loop');
    assert.equal(medautogrant.manifest.product_entry_shell.grant_cockpit.surface_kind, 'grant_cockpit');
    assert.equal(medautogrant.manifest.shared_handoff.opl_handoff_builder.entry_mode, 'opl-handoff');
    assert.equal(medautogrant.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assertMagActionGraph(medautogrant.manifest.family_orchestration.action_graph);
    assert.equal(medautogrant.manifest.family_orchestration.human_gates[0].gate_id, 'mag_route_gate_revision');
    assert.equal(medautogrant.manifest.family_orchestration.resume_contract.surface_kind, 'grant_user_loop');
    assert.equal(medautogrant.manifest.family_orchestration.event_envelope_surface.ref, '/product_entry_manifest/recommended_command');
    assert.equal(medautogrant.manifest.product_entry_readiness.verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(medautogrant.manifest.product_entry_readiness.usable_now, true);
    assert.equal(medautogrant.manifest.product_entry_readiness.recommended_loop_command, 'uv run python -m med_autogrant grant-user-loop --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --task-intent <describe-task-intent> --format json');
    assert.equal(medautogrant.manifest.grant_authoring_readiness.surface_kind, 'grant_authoring_readiness');
    assert.equal(medautogrant.manifest.grant_authoring_readiness.workflow_coverage[0].step_id, 'accumulation_direction_screening');
    assert.equal(medautogrant.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautogrant.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(medautogrant.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(medautogrant.manifest.runtime_inventory.runtime_owner, 'upstream_hermes_agent');
    assert.equal(medautogrant.manifest.runtime_inventory.availability, 'ready');
    assert.equal(medautogrant.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(medautogrant.manifest.task_lifecycle.resume_surface.surface_kind, 'grant_user_loop');
    assert.equal(medautogrant.manifest.task_lifecycle.checkpoint_summary.status, 'critique');
    assert.equal(medautogrant.manifest.session_continuity.surface_kind, 'session_continuity');
    assert.equal(medautogrant.manifest.session_continuity.session_id, 'grant-run-nsfc-demo-001-baseline-001');
    assert.equal(medautogrant.manifest.session_continuity.restore_surface.surface_kind, 'runtime_resume');
    assert.equal(medautogrant.manifest.progress_projection.surface_kind, 'progress_projection');
    assert.equal(medautogrant.manifest.progress_projection.current_status, 'critique');
    assert.equal(medautogrant.manifest.artifact_inventory.surface_kind, 'artifact_inventory');
    assert.equal(medautogrant.manifest.artifact_inventory.supporting_files.length, 2);
    assert.equal(medautogrant.manifest.runtime_control.surface_kind, 'runtime_control');
    assert.equal(medautogrant.manifest.runtime_control.status, 'resumable');
    assert.equal(medautogrant.manifest.runtime_control.restore_point, 'grant-run-nsfc-demo-001-baseline-001:critique');
    assert.equal(medautogrant.manifest.runtime_control.control_surfaces.resume.surface_kind, 'runtime_resume');
    assert.equal(medautogrant.manifest.runtime_control.control_surfaces.approval.surface_kind, 'grant_user_loop');
    assert.equal(medautogrant.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(medautogrant.manifest.skill_catalog.skills.length, 2);
    assert.equal(medautogrant.manifest.skill_catalog.supported_commands[1], 'grant-user-loop');
    assert.equal(medautogrant.manifest.automation.surface_kind, 'automation');
    assert.equal(medautogrant.manifest.automation.automations[0].target_surface_kind, 'grant_user_loop');
    assert.equal(
      medautogrant.manifest.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autogrant validate-workspace --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json',
    );
    assert.equal(medautogrant.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(medautogrant.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(medautogrant.manifest.product_entry_start.modes[1].mode_id, 'continue_grant_loop');

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.recommended_shell, 'workspace_cockpit');
    assert.equal(medautoscience.manifest.frontdesk_surface.shell_key, 'product_frontdesk');
    assert.equal(medautoscience.manifest.operator_loop_actions.submit_task.requires[0], 'study_id');
    assert.match(medautoscience.manifest.product_entry_shell.launch_study.command, /launch-study/);
    assert.equal(medautoscience.manifest.shared_handoff.direct_entry_builder.entry_mode, 'direct');
    assert.equal(
      medautoscience.manifest.family_orchestration.action_graph_ref.ref,
      '/family_orchestration/action_graph',
    );
    assertMasActionGraph(medautoscience.manifest.family_orchestration.action_graph);
    assert.equal(medautoscience.manifest.family_orchestration.human_gates[0].gate_id, 'study_physician_decision_gate');
    assert.equal(medautoscience.manifest.family_orchestration.human_gates[1].gate_id, 'publication_release_gate');
    assert.equal(medautoscience.manifest.family_orchestration.resume_contract.surface_kind, 'launch_study');
    assert.equal(
      medautoscience.manifest.family_orchestration.event_envelope_surface.ref,
      'studies/<study_id>/artifacts/runtime_watch/latest.json',
    );
    assert.equal(medautoscience.manifest.product_entry_readiness.verdict, 'runtime_ready_not_standalone_product');
    assert.equal(medautoscience.manifest.product_entry_readiness.good_to_use_now, false);
    assert.equal(medautoscience.manifest.product_entry_readiness.recommended_start_surface, 'product_frontdesk');
    assert.equal(medautoscience.manifest.product_entry_guardrails.surface_kind, 'product_entry_guardrails');
    assert.equal(medautoscience.manifest.product_entry_guardrails.guardrail_classes[0].guardrail_id, 'workspace_supervision_gap');
    assert.equal(medautoscience.manifest.phase3_clearance_lane.surface_kind, 'phase3_host_clearance_lane');
    assert.equal(medautoscience.manifest.phase4_backend_deconstruction.surface_kind, 'phase4_backend_deconstruction_lane');
    assert.equal(medautoscience.manifest.phase5_platform_target.surface_kind, 'phase5_platform_target');
    assert.equal(medautoscience.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautoscience.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(medautoscience.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(medautoscience.manifest.runtime_inventory.executor_owner, 'med_deepscientist');
    assert.equal(medautoscience.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(medautoscience.manifest.task_lifecycle.resume_surface.surface_kind, 'launch_study');
    assert.equal(medautoscience.manifest.task_lifecycle.human_gate_ids.length, 2);
    assert.equal(medautoscience.manifest.session_continuity.surface_kind, 'session_continuity');
    assert.equal(medautoscience.manifest.session_continuity.domain_agent_id, 'mas');
    assert.equal(medautoscience.manifest.progress_projection.surface_kind, 'progress_projection');
    assert.equal(medautoscience.manifest.progress_projection.runtime_status, 'ready');
    assert.equal(medautoscience.manifest.artifact_inventory.surface_kind, 'artifact_inventory');
    assert.equal(medautoscience.manifest.artifact_inventory.summary.supporting_files_count, 5);
    assert.equal(medautoscience.manifest.runtime_control.surface_kind, 'runtime_control');
    assert.equal(medautoscience.manifest.runtime_control.status, 'study_scoped');
    assert.equal(medautoscience.manifest.runtime_control.restore_point, 'phase_2_user_product_loop');
    assert.equal(medautoscience.manifest.runtime_control.control_surfaces.resume.surface_kind, 'launch_study');
    assert.equal(medautoscience.manifest.runtime_control.control_surfaces.approval.surface_kind, 'study_progress');
    assert.equal(medautoscience.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(medautoscience.manifest.skill_catalog.supported_commands[0], 'product-frontdesk');
    assert.equal(medautoscience.manifest.skill_catalog.skills[1].skill_id, 'medautoscience_workspace_cockpit');
    assert.equal(medautoscience.manifest.automation.surface_kind, 'automation');
    assert.equal(medautoscience.manifest.automation.automations[0].readiness_status, 'automation_ready');
    assert.equal(
      medautoscience.manifest.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autoscience.cli doctor --profile /fixtures/med-autoscience/profile.local.toml',
    );
    assert.equal(medautoscience.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(medautoscience.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(medautoscience.manifest.product_entry_start.modes[2].mode_id, 'continue_study');

    assert.equal(redcube.status, 'resolved');
    assert.equal(redcube.manifest.recommended_shell, 'direct');
    assert.equal(redcube.manifest.recommended_command, 'redcube product invoke');
    assert.equal(redcube.manifest.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(redcube.manifest.operator_loop_surface.shell_key, 'direct');
    assert.equal(redcube.manifest.operator_loop_surface.continuation_command, 'redcube product session');
    assert.equal(redcube.manifest.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(redcube.manifest.operator_loop_actions.continue_session.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.repo_mainline.phase_id, 'repo_verified_product_entry_and_opl_federation');
    assert.equal(redcube.manifest.product_entry_status.remaining_gaps_count, 2);
    assert.equal(redcube.manifest.product_entry_shell.session.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.shared_handoff.opl_return_surface.surface_kind, 'product_entry');
    assert.equal(redcube.manifest.product_entry_overview.summary, redcube.manifest.product_entry_status.summary);
    assert.equal(redcube.manifest.product_entry_overview.progress_surface.command, 'redcube product session --entry-session-id <entry-session-id>');
    assert.equal(
      redcube.manifest.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(redcube.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assertRedcubeActionGraph(redcube.manifest.family_orchestration.action_graph);
    assert.equal(redcube.manifest.family_orchestration.human_gates[0].gate_id, 'redcube_operator_review_gate');
    assert.equal(
      redcube.manifest.family_orchestration.resume_contract.session_locator_field,
      'entry_session_contract.entry_session_id',
    );
    assert.equal(redcube.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(redcube.manifest.runtime_inventory.health_status, 'healthy');
    assert.equal(redcube.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(redcube.manifest.task_lifecycle.resume_surface.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.task_lifecycle.checkpoint_summary.status, 'operator_review_requested');
    assert.equal(redcube.manifest.session_continuity.surface_kind, 'session_continuity');
    assert.equal(redcube.manifest.session_continuity.status, 'repo_tracked');
    assert.equal(redcube.manifest.progress_projection.surface_kind, 'progress_projection');
    assert.equal(redcube.manifest.artifact_inventory.surface_kind, 'artifact_inventory');
    assert.equal(redcube.manifest.runtime_control.surface_kind, 'runtime_control');
    assert.equal(redcube.manifest.runtime_control.status, 'operator_review_requested');
    assert.equal(redcube.manifest.runtime_control.restore_point, 'continuation_snapshot.latest_managed_run_id');
    assert.equal(redcube.manifest.runtime_control.control_surfaces.resume.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.runtime_control.control_surfaces.approval.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(redcube.manifest.skill_catalog.supported_commands[3], 'product-session');
    assert.equal(redcube.manifest.automation.surface_kind, 'automation');
    assert.equal(redcube.manifest.automation.automations[0].automation_id, 'redcube_autopilot_continuation');
    assert.equal(redcube.manifest.product_entry_readiness.verdict, 'service_surface_ready_not_managed_product');
    assert.equal(redcube.manifest.product_entry_readiness.usable_now, true);
    assert.equal(redcube.manifest.product_entry_readiness.recommended_start_command, 'redcube product frontdesk');
    assert.equal(redcube.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(redcube.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(
      redcube.manifest.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.equal(redcube.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(redcube.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(redcube.manifest.product_entry_start.modes[2].mode_id, 'opl_bridge_handoff');
    assert.equal(redcube.manifest.product_entry_start.modes[3].mode_id, 'resume_session');

    const dashboardOutput = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(dashboardOutput.dashboard.gui_runtime.recommended_entry_surfaces_count, 3);
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.hosted_runtime_readiness.status,
      'retired',
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.total_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.aligned_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.partial_projects_count,
      2,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.blocked_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.domain_entry_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.domain_agent_entry_spec_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.skill_runtime_continuity_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.gateway_interaction_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.ready_for_opl_start_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.gui_runtime.domain_entry_parity.summary.ready_for_domain_handoff_count,
      3,
    );
    const grantParity = dashboardOutput.dashboard.gui_runtime.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceParity = dashboardOutput.dashboard.gui_runtime.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeParity = dashboardOutput.dashboard.gui_runtime.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantParity.entry_parity_status, 'partial');
    assert.equal(grantParity.direct_entry_locator_status, 'missing');
    assert.equal(grantParity.ready_for_opl_start, true);
    assert.equal(grantParity.ready_for_domain_handoff, true);
    assert.equal(grantParity.product_entry_readiness_verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(grantParity.domain_entry_contract_status, 'ready');
    assert.equal(grantParity.domain_agent_entry_spec_status, 'ready');
    assert.equal(grantParity.gateway_interaction_contract_status, 'ready');
    assert.equal(grantParity.skill_runtime_continuity_status, 'ready');
    assert.equal(scienceParity.entry_parity_status, 'partial');
    assert.equal(scienceParity.direct_entry_locator_status, 'missing');
    assert.equal(scienceParity.ready_for_opl_start, true);
    assert.equal(scienceParity.ready_for_domain_handoff, true);
    assert.equal(scienceParity.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(scienceParity.domain_entry_contract_status, 'ready');
    assert.equal(scienceParity.domain_agent_entry_spec_status, 'ready');
    assert.equal(scienceParity.gateway_interaction_contract_status, 'ready');
    assert.equal(scienceParity.skill_runtime_continuity_status, 'ready');
    assert.equal(redcubeParity.entry_parity_status, 'aligned');
    assert.equal(redcubeParity.direct_entry_locator_status, 'ready');
    assert.equal(redcubeParity.ready_for_opl_start, true);
    assert.equal(redcubeParity.ready_for_domain_handoff, true);
    assert.equal(redcubeParity.product_entry_readiness_verdict, 'service_surface_ready_not_managed_product');
    assert.equal(redcubeParity.domain_entry_contract_status, 'ready');
    assert.equal(redcubeParity.domain_agent_entry_spec_status, 'ready');
    assert.equal(redcubeParity.gateway_interaction_contract_status, 'ready');
    assert.equal(redcubeParity.skill_runtime_continuity_status, 'ready');
    assert.equal(redcubeParity.recommended_start_command, 'redcube product frontdesk');
    assert.equal(
      redcubeParity.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    const grantEntry = dashboardOutput.dashboard.gui_runtime.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceEntry = dashboardOutput.dashboard.gui_runtime.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const recommendedEntry = dashboardOutput.dashboard.gui_runtime.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantEntry.product_entry_shell.grant_user_loop.surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.shared_handoff.direct_entry_builder.entry_mode, 'direct');
    assert.equal(grantEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(grantEntry.family_action_graph_node_count, 2);
    assert.equal(grantEntry.family_action_graph_edge_count, 1);
    assert.equal(grantEntry.product_entry_readiness_verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(grantEntry.product_entry_readiness_usable_now, true);
    assert.equal(grantEntry.product_entry_readiness_start_command, 'uv run python -m med_autogrant product-frontdesk --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json');
    assert.equal(grantEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(grantEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(grantEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(grantEntry.product_entry_start_resume_surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.product_entry_start_mode_ids[2], 'build_direct_entry');
    assert.equal(grantEntry.active_binding_locator_status, 'missing');
    assert.equal(grantEntry.active_binding_locator.command, null);
    assert.equal(grantEntry.active_binding_locator.url, null);
    assert.equal(
      grantEntry.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autogrant validate-workspace --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json',
    );
    assert.deepEqual(grantEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(grantEntry.product_entry_preflight_checks_count, 4);
    assert.equal(grantEntry.product_entry_overview.summary, grantEntry.product_entry_status_summary);
    assert.equal(grantEntry.product_entry_overview.progress_surface.surface_kind, 'grant_progress');
    assert.equal(grantEntry.product_entry_overview.resume_surface.surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(grantEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(grantEntry.runtime_inventory_availability, 'ready');
    assert.equal(grantEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(grantEntry.task_lifecycle_status, 'resumable');
    assert.equal(grantEntry.task_lifecycle_resume_surface_kind, 'grant_user_loop');
    assert.deepEqual(grantEntry.task_lifecycle_human_gate_ids, ['mag_route_gate_revision']);
    assert.equal(grantEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(grantEntry.skill_catalog_skill_count, 2);
    assert.equal(grantEntry.skill_catalog_supported_commands[1], 'grant-user-loop');
    assert.equal(grantEntry.skill_runtime_continuity_status, 'ready');
    assert.equal(grantEntry.skill_runtime_continuity_session_locator_field, 'grant_run_id');
    assert.equal(grantEntry.skill_runtime_continuity_progress_surface_ref, '/product_entry_manifest/progress_projection');
    assert.match(grantEntry.skill_runtime_continuity_resume_command, /runtime-resume/);
    assert.match(grantEntry.skill_runtime_continuity_artifact_command, /summarize-workspace/);
    assert.equal(grantEntry.domain_entry_contract.entry_adapter, 'MedAutoGrantDomainEntry');
    assert.equal(grantEntry.domain_agent_entry_id, 'mag');
    assert.equal(grantEntry.domain_agent_entry_entry_command, 'product-frontdesk');
    assert.equal(grantEntry.domain_agent_entry_manifest_command, 'product-entry-manifest');
    assert.equal(grantEntry.gateway_interaction_contract.frontdoor_owner, 'opl_gateway_or_domain_gui');
    assert.equal(grantEntry.automation.surface_kind, 'automation');
    assert.equal(grantEntry.automation_count, 2);
    assert.equal(
      grantEntry.automation_readiness_summary,
      'Revision route follow-up 已 ready，submission-ready export 继续保持 tracked follow-on。',
    );
    assert.equal(scienceEntry.product_entry_shell.workspace_cockpit.purpose.includes('workspace'), true);
    assert.equal(scienceEntry.shared_handoff.opl_handoff_builder.entry_mode, 'opl-handoff');
    assert.equal(scienceEntry.product_entry_overview.summary, scienceEntry.product_entry_status_summary);
    assert.equal(scienceEntry.product_entry_overview.progress_surface.surface_kind, 'study_progress');
    assert.equal(scienceEntry.product_entry_overview.resume_surface.surface_kind, 'launch_study');
    assert.equal(scienceEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(scienceEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(scienceEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(scienceEntry.task_lifecycle_resume_surface_kind, 'launch_study');
    assert.deepEqual(
      scienceEntry.task_lifecycle_human_gate_ids,
      ['study_physician_decision_gate', 'publication_release_gate'],
    );
    assert.equal(scienceEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(scienceEntry.skill_catalog_skill_count, 2);
    assert.equal(scienceEntry.skill_catalog_supported_commands[0], 'product-frontdesk');
    assert.equal(scienceEntry.skill_runtime_continuity_status, 'ready');
    assert.equal(scienceEntry.skill_runtime_continuity_session_locator_field, 'study_id');
    assert.equal(scienceEntry.skill_runtime_continuity_progress_surface_ref, '/progress_projection');
    assert.match(scienceEntry.skill_runtime_continuity_resume_command, /launch-study/);
    assert.match(scienceEntry.skill_runtime_continuity_artifact_command, /study-runtime-status/);
    assert.equal(scienceEntry.domain_entry_contract.entry_adapter, 'MedAutoScienceDomainEntry');
    assert.equal(scienceEntry.domain_agent_entry_id, 'mas');
    assert.equal(scienceEntry.domain_agent_entry_entry_command, 'product-frontdesk');
    assert.equal(scienceEntry.domain_agent_entry_manifest_command, 'product-entry-manifest');
    assert.equal(scienceEntry.gateway_interaction_contract.shared_downstream_entry, 'MedAutoScienceDomainEntry');
    assert.equal(scienceEntry.automation.surface_kind, 'automation');
    assert.equal(scienceEntry.automation_count, 2);
    assert.equal(scienceEntry.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(scienceEntry.product_entry_readiness_good_to_use_now, false);
    assert.equal(scienceEntry.product_entry_readiness_loop_command, 'uv run python -m med_autoscience.cli workspace-cockpit --profile /fixtures/med-autoscience/profile.local.toml');
    assert.equal(scienceEntry.active_binding_locator_status, 'missing');
    assert.equal(scienceEntry.active_binding_locator.command, null);
    assert.equal(scienceEntry.active_binding_locator.url, null);
    assert.equal(scienceEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(scienceEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(scienceEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(scienceEntry.product_entry_start_resume_surface_kind, 'launch_study');
    assert.equal(scienceEntry.product_entry_start_mode_ids[1], 'submit_task');
    assert.equal(
      scienceEntry.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autoscience.cli doctor --profile /fixtures/med-autoscience/profile.local.toml',
    );
    assert.deepEqual(scienceEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(scienceEntry.product_entry_preflight_checks_count, 7);
    assert.equal(scienceEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(scienceEntry.family_action_graph_node_count, 4);
    assert.equal(scienceEntry.family_action_graph_edge_count, 5);
    assert.equal(scienceEntry.family_resume_surface_kind, 'launch_study');
    assert.equal(
      scienceEntry.family_event_envelope_ref,
      'studies/<study_id>/artifacts/runtime_watch/latest.json',
    );
    assert.equal(
      recommendedEntry.product_entry_status_summary,
      'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
    );
    assert.equal(recommendedEntry.product_entry_remaining_gaps_count, 2);
    assert.equal(recommendedEntry.mainline_phase_id, 'repo_verified_product_entry_and_opl_federation');
    assert.equal(recommendedEntry.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.operator_loop_shell_key, 'direct');
    assert.equal(recommendedEntry.operator_loop_command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_readiness_verdict, 'service_surface_ready_not_managed_product');
    assert.equal(recommendedEntry.product_entry_readiness_summary, '当前可以作为 RedCube 的 direct frontdesk / CLI product-entry 主线使用，但还不是成熟的最终用户前台或托管 Web 产品。');
    assert.equal(recommendedEntry.product_entry_readiness_start_command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.product_entry_readiness_loop_command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(recommendedEntry.active_binding_locator_status, 'ready');
    assert.equal(recommendedEntry.active_binding_locator.command, 'redcube-ai frontdesk');
    assert.equal(recommendedEntry.active_binding_locator.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(
      recommendedEntry.active_binding_locator.manifest_command,
      buildManifestCommand(fixtures.redcube),
    );
    assert.equal(recommendedEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(recommendedEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(recommendedEntry.product_entry_start_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.product_entry_start_mode_ids[2], 'opl_bridge_handoff');
    assert.equal(
      recommendedEntry.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.deepEqual(recommendedEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(recommendedEntry.product_entry_preflight_checks_count, 4);
    assert.equal(recommendedEntry.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_overview.summary, recommendedEntry.product_entry_status_summary);
    assert.equal(recommendedEntry.product_entry_overview.progress_surface.surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(recommendedEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(recommendedEntry.runtime_inventory_health_status, 'healthy');
    assert.equal(recommendedEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(recommendedEntry.task_lifecycle_resume_surface_kind, 'product_entry_session');
    assert.deepEqual(recommendedEntry.task_lifecycle_human_gate_ids, ['redcube_operator_review_gate']);
    assert.equal(recommendedEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(recommendedEntry.skill_catalog_skill_count, 2);
    assert.equal(recommendedEntry.skill_catalog_supported_commands[3], 'product-session');
    assert.equal(recommendedEntry.skill_runtime_continuity_status, 'ready');
    assert.equal(recommendedEntry.skill_runtime_continuity_session_locator_field, 'entry_session_id');
    assert.equal(recommendedEntry.skill_runtime_continuity_progress_surface_ref, '/progress_projection');
    assert.equal(
      recommendedEntry.skill_runtime_continuity_resume_command,
      'redcube product session --entry-session-id <entry-session-id>',
    );
    assert.equal(recommendedEntry.domain_entry_contract.entry_adapter, 'RedCubeDomainEntry');
    assert.equal(recommendedEntry.domain_agent_entry_id, 'rca');
    assert.equal(recommendedEntry.domain_agent_entry_entry_command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.domain_agent_entry_manifest_command, 'redcube product manifest');
    assert.equal(recommendedEntry.gateway_interaction_contract.frontdoor_owner, 'opl_gateway_or_domain_gui');
    assert.equal(recommendedEntry.automation.surface_kind, 'automation');
    assert.equal(recommendedEntry.automation_count, 2);
    assert.equal(
      recommendedEntry.automation_readiness_summary,
      'Continuation automation 继续保持 tracked follow-on，review state sync 保持 operator-gated。',
    );
    assert.equal(
      recommendedEntry.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(recommendedEntry.product_entry_shell.opl_bridge.surface_kind, 'federated_product_entry');
    assert.equal(recommendedEntry.shared_handoff.opl_return_surface.target_domain_id, 'redcube_ai');
    assert.equal(recommendedEntry.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assert.equal(recommendedEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(recommendedEntry.family_action_graph_node_count, 4);
    assert.equal(recommendedEntry.family_action_graph_edge_count, 4);
    assert.equal(recommendedEntry.family_orchestration.human_gates[0].gate_id, 'redcube_operator_review_gate');
    assert.equal(
      recommendedEntry.family_orchestration.resume_contract.session_locator_field,
      'entry_session_contract.entry_session_id',
    );
    assert.equal(recommendedEntry.manifest_version, 2);
    assert.equal(recommendedEntry.family_human_gate_count, 1);
    assert.deepEqual(recommendedEntry.family_human_gate_ids, ['redcube_operator_review_gate']);
    assert.equal(recommendedEntry.family_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.family_checkpoint_lineage_ref, 'runtime_watch/checkpoints/latest.json');

    const retiredGuide = runCliFailure(['frontdesk', 'entry-guide'], env);
    assert.equal(retiredGuide.status, 2);
    assert.equal(retiredGuide.payload.error.code, 'cli_usage_error');
    assert.equal(retiredGuide.payload.error.details.retired, true);
    assert.match(retiredGuide.payload.error.details.replacement, /opl start/);

    const retiredWiring = runCliFailure(['frontdesk', 'domain-wiring'], env);
    assert.equal(retiredWiring.status, 2);
    assert.equal(retiredWiring.payload.error.code, 'cli_usage_error');
    assert.equal(retiredWiring.payload.error.details.retired, true);
    assert.match(retiredWiring.payload.error.details.replacement, /opl workspace list/);

    const retiredReadiness = runCliFailure(['frontdesk', 'readiness', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(retiredReadiness.status, 2);
    assert.equal(retiredReadiness.payload.error.code, 'cli_usage_error');
    assert.equal(retiredReadiness.payload.error.details.retired, true);
    assert.match(retiredReadiness.payload.error.details.replacement, /opl status dashboard/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
