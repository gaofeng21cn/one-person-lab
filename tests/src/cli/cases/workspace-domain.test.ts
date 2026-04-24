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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
    OPL_FRONTDESK_STATE_DIR: stateRoot,
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
    assert.equal(dashboardOutput.dashboard.product_api.recommended_entry_surfaces_count, 3);
    assert.equal(
      dashboardOutput.dashboard.product_api.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.total_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.aligned_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.partial_projects_count,
      2,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.blocked_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.domain_entry_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.domain_agent_entry_spec_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.skill_runtime_continuity_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.gateway_interaction_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.ready_for_opl_start_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.ready_for_domain_handoff_count,
      3,
    );
    const grantParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
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
    const grantEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const recommendedEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
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
    assert.equal(retiredGuide.payload.error.code, 'unknown_command');

    const retiredWiring = runCliFailure(['frontdesk', 'domain-wiring'], env);
    assert.equal(retiredWiring.status, 2);
    assert.equal(retiredWiring.payload.error.code, 'unknown_command');

    const retiredReadiness = runCliFailure(['frontdesk', 'readiness', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(retiredReadiness.status, 2);
    assert.equal(retiredReadiness.payload.error.code, 'unknown_command');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('project-progress promotes current MAS study into a paper-facing summary instead of stopping at project-level wording', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-progress-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masWorkspace = createMasWorkspaceFixture();
  const studyId = '004-invasive-architecture';
  const studyRoot = path.join(masWorkspace.fixtureRoot, 'studies', studyId);
  const controllerDir = path.join(studyRoot, 'artifacts', 'controller');
  const paperDir = path.join(studyRoot, 'paper');
  const questRoot = path.join(
    masWorkspace.fixtureRoot,
    'ops',
    'med-deepscientist',
    'runtime',
    'quests',
    '004-invasive-architecture-managed-20260408',
  );
  const questPaperDir = path.join(questRoot, 'paper');
  const questPaperBuildDir = path.join(questPaperDir, 'build');
  const questPaperFiguresDir = path.join(questPaperDir, 'figures');
  const questPaperTablesDir = path.join(questPaperDir, 'tables');

  fs.mkdirSync(controllerDir, { recursive: true });
  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(questPaperBuildDir, { recursive: true });
  fs.mkdirSync(questPaperFiguresDir, { recursive: true });
  fs.mkdirSync(questPaperTablesDir, { recursive: true });
  fs.writeFileSync(
    path.join(controllerDir, 'study_charter.json'),
    `${JSON.stringify({
      study_id: studyId,
      title: 'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
      publication_objective:
        '在首术 NF-PitNET 中，重构由侵袭负担、Knosp、视觉压迫与切除负担组成的 clinically interpretable invasive phenotype architecture，并把公开 MRI / omics 用作 anatomy / biology anchors。',
      paper_framing_summary:
        'The paper-facing route is a first-surgery NF-PitNET invasive phenotype architecture study rather than a generic workflow summary.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(paperDir, 'paper_experiment_matrix.json'),
    `${JSON.stringify({
      current_judgment: {
        current_judgment:
          'EXP-001 confirmed a deterministic Knosp split for invasiveness, EXP-002 stayed negative beyond Knosp, and EXP-003 preserved a bounded secondary non-GTR extension.',
      },
      rows: [
        {
          exp_id: 'EXP-001',
          status: 'first_compute_completed',
          title: 'Local phenotype architecture map',
        },
        {
          exp_id: 'EXP-002',
          status: 'negative_compute_completed',
          title: 'Beyond-Knosp invasiveness audit',
        },
        {
          exp_id: 'EXP-003',
          status: 'first_compute_completed',
          title: 'Non-GTR bounded extension audit',
          key_metrics: {
            auroc: 0.7999,
            delta_brier_vs_knosp_only: -0.011845,
          },
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'review_manuscript.md'),
    [
      '---',
      'title: "Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET"',
      'bibliography: ../references.bib',
      '---',
      '',
      '## Abstract',
      '',
      '**Objective:** To reconstruct the local invasive phenotype architecture around the prespecified Knosp boundary in first-surgery NF-PitNET.\\',
      '**Results:** Knosp remained the dominant structural organizer, beyond-Knosp stayed negative, and the bounded non-GTR extension reached AUROC 0.7999 with delta Brier -0.011845.\\',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'reference_coverage_report.json'),
    `${JSON.stringify({
      record_count: 32,
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'compile_report.json'),
    `${JSON.stringify({
      page_count: 12,
      proofing_summary: 'Compiled manuscript refreshed into a 12-page reviewer-facing PDF.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'paper_bundle_manifest.json'),
    `${JSON.stringify({
      title: 'Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET',
      summary:
        'The current reviewer bundle keeps main-text figures F1-F3, one supplementary figure S1, main tables T1-T2, and appendix table TA1 in sync.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperFiguresDir, 'figure_catalog.json'),
    `${JSON.stringify({
      figures: [
        { figure_id: 'F1', paper_role: 'main_text' },
        { figure_id: 'F2', paper_role: 'main_text' },
        { figure_id: 'F3', paper_role: 'main_text' },
        { figure_id: 'S1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperTablesDir, 'table_catalog.json'),
    `${JSON.stringify({
      tables: [
        { table_id: 'T1', paper_role: 'main_text' },
        { table_id: 'T2', paper_role: 'main_text' },
        { table_id: 'TA1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  const workspaceCockpitPayload = {
    schema_version: 1,
    workspace_root: masWorkspace.fixtureRoot,
    studies: [
      {
        study_id: studyId,
        current_stage: 'publication_supervision',
        current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        current_blockers: [
          '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
        ],
        next_system_action: 'continue bundle stage',
        status_narration_contract: {
          schema_version: 1,
          contract_kind: 'ai_status_narration',
          contract_id: `study-progress::${studyId}`,
          surface_kind: 'study_progress',
          audience: 'human_user',
          milestone: {},
          stage: {
            current_stage: 'publication_supervision',
            recommended_next_stage: 'bundle_stage_ready',
            checkpoint_status: 'forward_progress',
          },
          readiness: {
            needs_physician_decision: false,
          },
          remaining_scope: {},
          current_blockers: [
            '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
          ],
          latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
          next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
          human_gate: {},
          facts: {
            study_id: studyId,
            quest_id: '004-invasive-architecture-managed-20260408',
          },
          narration_policy: {
            mode: 'ai_first',
            legacy_summary_role: 'fallback_only',
            style: 'plain_language',
            answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
          },
        },
        needs_physician_decision: false,
        monitoring: {
          browser_url: 'http://127.0.0.1:21001',
          quest_session_api_url: 'http://127.0.0.1:21001/api/quests/004/session',
          active_run_id: 'run-884e2a72',
          health_status: 'live',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:24:35+00:00',
          latest_progress_time_label: '2026-04-15 11:24 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        },
        commands: {
          progress: `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(
            [
              '# 研究进度',
              '',
              `- study_id: \`${studyId}\``,
              '- 当前阶段: 论文可发表性监管',
              '- 阶段摘要: 投稿打包阶段已被全局门控放行，可以进入关键路径。',
            ].join('\n'),
          )}`,
        },
      },
      {
        study_id: '003-endocrine-burden-followup',
        current_stage: 'managed_runtime_recovering',
        current_stage_summary: '系统正在推进托管运行进入可监督的在线状态。',
        current_blockers: ['仍有主线阻塞。'],
        next_system_action: '等待下一次巡检确认 worker 已重新上线并恢复 live。',
        needs_physician_decision: false,
        monitoring: {
          browser_url: null,
          quest_session_api_url: null,
          active_run_id: null,
          health_status: 'recovering',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:20:00+00:00',
          latest_progress_time_label: '2026-04-15 11:20 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '论文包雏形已经存在，但当前硬阻塞仍在论文可发表性面。',
        },
        commands: {
          progress: buildManifestCommand({
            study_id: '003-endocrine-burden-followup',
          }),
        },
      },
    ],
    attention_queue: [],
    workspace_supervision: {
      summary: '4 个 study；当前监管心跳新鲜。',
    },
  };

  const manifest = structuredClone(fixtures.medautoscience) as Record<string, any>;
  manifest.workspace_locator.workspace_root = masWorkspace.fixtureRoot;
  manifest.workspace_locator.profile_ref = masWorkspace.profilePath;
  manifest.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_shell.workspace_cockpit.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_surface.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.operator_loop_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.progress_surface.command = buildManifestCommand({
    study_id: studyId,
    study_root: studyRoot,
    quest_id: '004-invasive-architecture-managed-20260408',
    quest_root: questRoot,
    current_stage: 'publication_supervision',
    current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
    paper_stage: 'bundle_stage_ready',
    paper_stage_summary: '论文当前建议推进到投稿打包阶段。',
    current_blockers: [
      '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    ],
    next_system_action: 'continue bundle stage',
    status_narration_contract: {
      schema_version: 1,
      contract_kind: 'ai_status_narration',
      contract_id: `study-progress::${studyId}`,
      surface_kind: 'study_progress',
      audience: 'human_user',
      milestone: {},
      stage: {
        current_stage: 'publication_supervision',
        recommended_next_stage: 'bundle_stage_ready',
        checkpoint_status: 'forward_progress',
      },
      readiness: {
        needs_physician_decision: false,
      },
      remaining_scope: {},
      current_blockers: [
        '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
      ],
      latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
      next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
      human_gate: {},
      facts: {
        study_id: studyId,
        quest_id: '004-invasive-architecture-managed-20260408',
      },
      narration_policy: {
        mode: 'ai_first',
        legacy_summary_role: 'fallback_only',
        style: 'plain_language',
        answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
      },
    },
    progress_freshness: {
      latest_progress_time_label: '2026-04-15 11:24 UTC',
      latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      latest_progress_source: 'publication_eval',
    },
    supervision: {
      browser_url: 'http://127.0.0.1:21001',
      active_run_id: 'run-884e2a72',
      health_status: 'live',
    },
    latest_events: [
      {
        time_label: '2026-04-15 11:24 UTC',
        title: '发表可行性评估更新',
        summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      },
    ],
    refs: {
      publication_eval_path: path.join(studyRoot, 'artifacts', 'publication_eval', 'latest.json'),
    },
  });
  manifest.operator_loop_actions.open_loop.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_actions.inspect_progress.command = buildManifestCommand({
    study_id: '<study_id>',
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspace.fixtureRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const contracts = loadGatewayContracts({ contractsDir: fixtureContractsRoot });
    const originalArgv1 = process.argv[1];
    const originalStateDir = process.env.OPL_FRONTDESK_STATE_DIR;
    const originalContractsDir = process.env.OPL_CONTRACTS_DIR;
    let payload: Awaited<ReturnType<typeof buildProjectProgressBrief>>;
    try {
      process.argv[1] = cliPath;
      process.env.OPL_FRONTDESK_STATE_DIR = stateRoot;
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      payload = await buildProjectProgressBrief(contracts, {
        workspacePath: masWorkspace.fixtureRoot,
        sessionsLimit: 1,
      });
    } finally {
      process.argv[1] = originalArgv1;
      if (originalStateDir === undefined) {
        delete process.env.OPL_FRONTDESK_STATE_DIR;
      } else {
        process.env.OPL_FRONTDESK_STATE_DIR = originalStateDir;
      }
      if (originalContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = originalContractsDir;
      }
    }

    const currentStudy = payload.project_progress.current_study;
    assert.ok(currentStudy);
    const storySummary = currentStudy.story_summary;
    assert.ok(storySummary);
    const paperSnapshot = currentStudy.paper_snapshot;
    assert.ok(paperSnapshot);
    const currentEffectSummary = paperSnapshot.current_effect_summary;
    assert.ok(currentEffectSummary);

    assert.equal(currentStudy.study_id, studyId);
    assert.equal(
      currentStudy.title,
      'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
    );
    assert.match(storySummary, /侵袭负担.*Knosp.*公开 MRI \/ omics/);
    assert.equal(currentStudy.current_stage, 'publication_supervision');
    assert.equal(currentStudy.monitoring.health_status, 'live');
    assert.equal(paperSnapshot.main_figure_count, 3);
    assert.equal(paperSnapshot.supplementary_figure_count, 1);
    assert.equal(paperSnapshot.main_table_count, 2);
    assert.equal(paperSnapshot.supplementary_table_count, 1);
    assert.equal(paperSnapshot.reference_count, 32);
    assert.equal(paperSnapshot.page_count, 12);
    assert.ok(currentEffectSummary.includes('AUROC 0.7999'));
    assert.match(currentEffectSummary, /negative/i);
    assert.match(payload.project_progress.progress_summary, /004-invasive-architecture/);
    assert.match(payload.project_progress.progress_summary, /3 张主图/);
    assert.match(payload.project_progress.progress_summary, /32 篇参考文献/);
    assert.ok(currentStudy.status_narration_contract);
    assert.equal(currentStudy.status_narration_contract.latest_update, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.equal(payload.project_progress.progress_feedback.current_status, 'publication_supervision');
    assert.equal(payload.project_progress.progress_feedback.runtime_status, 'live');
    assert.equal(payload.project_progress.progress_feedback.headline, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.match(payload.project_progress.progress_feedback.latest_update, /2026-04-15 11:24 UTC/);
    assert.equal(
      payload.project_progress.progress_feedback.next_step,
      '优先核对 submission package 与 studies 目录中的交付面是否一致。',
    );
    assert.equal(payload.project_progress.workspace_inbox.summary.known_task_count, 3);
    assert.equal(payload.project_progress.workspace_inbox.summary.running_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.waiting_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.ready_count, 0);
    assert.equal(payload.project_progress.workspace_inbox.summary.delivered_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.active_task_id, studyId);
    assert.equal(payload.project_progress.workspace_inbox.sections.running[0].task_id, studyId);
    assert.equal(payload.project_progress.runtime_continuity.control.surface_kind, 'runtime_control');
    assert.equal(payload.project_progress.runtime_continuity.control.restore_point, 'phase_2_user_product_loop');
    assert.equal(
      payload.project_progress.runtime_continuity.control.control_surfaces.resume.surface_kind,
      'launch_study',
    );
    assert.equal(
      payload.project_progress.recommended_commands.approval,
      'uv run python -m med_autoscience.cli study-runtime-status --profile /fixtures/med-autoscience/profile.local.toml --study-id <study_id> --format json',
    );
    assert.equal(
      payload.project_progress.recommended_commands.artifacts,
      'uv run python -m med_autoscience.cli study-runtime-status --profile /fixtures/med-autoscience/profile.local.toml --study-id <study_id> --format json',
    );
    assert.equal(
      payload.project_progress.workspace_inbox.sections.running[0].summary,
      '当前状态：论文可发表性监管；下一阶段：投稿打包就绪；当前卡点：当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    );
    assert.ok(
      payload.project_progress.workspace_inbox.sections.waiting.some(
        (entry: { task_id: string }) => entry.task_id === '003-endocrine-burden-followup',
      ),
    );
    assert.equal(payload.project_progress.workspace_inbox.sections.delivered[0].deliverable_count, 3);
    assert.ok(payload.project_progress.user_options.includes('展开当前论文的详细进度'));
    assert.ok(payload.project_progress.inspect_paths.includes(studyRoot));
    assert.equal(payload.project_progress.workspace_files.deliverable_files.length, 3);
    assert.equal(payload.project_progress.workspace_files.supporting_files.length, 4);
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].file_id, 'review_manuscript');
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].kind, 'deliverable');
    assert.match(
      payload.project_progress.workspace_files.deliverable_files[0].path,
      /paper\/build\/review_manuscript\.md$/,
    );
    assert.ok(
      payload.project_progress.workspace_files.supporting_files.some(
        (entry: { file_id: string }) => entry.file_id === 'figure_catalog',
      ),
    );
    assert.equal(
      payload.project_progress.recommended_commands.progress,
      workspaceCockpitPayload.studies[0].commands.progress,
    );
    assert.doesNotMatch(
      payload.project_progress.recommended_commands.progress,
      /--format json/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masWorkspace.fixtureRoot, { recursive: true, force: true });
  }
});

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
    OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      `uv run python -m med_autogrant product frontdesk --input ${path.resolve(magInputPath)}`,
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
      `uv run python -m med_autoscience.cli product frontdesk --profile ${path.resolve(masProfilePath)}`,
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
      `redcube product frontdesk --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
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
      'uv run python -m med_autogrant product frontdesk --input <input_path>',
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
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.aligned_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.partial_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
        (entry: { project_id: string }) => entry.project_id === 'medautogrant',
      )?.direct_entry_locator_status,
      'ready',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
    OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], env);

    const output = runCli(['start', '--project', 'redcube'], env);
    assert.equal(output.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(output.product_entry_start.project_id, 'redcube');
    assert.equal(output.product_entry_start.target_domain_id, 'redcube_ai');
    assert.equal(output.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode.mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode.command, 'redcube product frontdesk');
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(resolvedManifest),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
    assert.equal(output.handoff_bundle.domain_direct_entry.command, 'redcube-ai frontdesk');
    assert.equal(
      output.handoff_bundle.domain_direct_entry.manifest_command,
      buildManifestCommand(resolvedManifest),
    );
    assert.equal(output.handoff_bundle.domain_direct_entry.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.status, 'resolved');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_shell, 'direct');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_command, 'redcube product invoke');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.frontdesk_surface.command, 'redcube product frontdesk');
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
      'redcube product frontdesk',
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
      'redcube product frontdesk',
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
      'open_frontdesk',
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const preview = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(preview.domain_entry_launch.surface_id, 'opl_domain_direct_entry_launch');
    assert.equal(preview.domain_entry_launch.project_id, 'redcube');
    assert.equal(preview.domain_entry_launch.dry_run, true);
    assert.equal(preview.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(preview.domain_entry_launch.launch_status, 'preview_only');
    assert.equal(preview.domain_entry_launch.domain_agent_entry_spec.agent_id, 'rca');
    assert.equal(preview.domain_entry_launch.domain_agent_entry_spec.entry_command, 'redcube product frontdesk');
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(resumeOutput.product_entry.mode, 'resume');

    const ledgerOutput = runCli(['session', 'ledger', '--limit', '5'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
      OPL_FRONTDESK_STATE_DIR: stateRoot,
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
