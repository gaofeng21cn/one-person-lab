import { FrameworkContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadFrameworkContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateFrameworkContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph, parseJsonText } from '../helpers.ts';

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
      'redcube-ai product-entry',
      '--manifest-command',
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(bindOutput.workspace_catalog.action, 'bind');
    assert.equal(bindOutput.workspace_catalog.binding.project_id, 'redcube');
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.command, 'redcube-ai product-entry');
    assert.equal(
      bindOutput.workspace_catalog.binding.direct_entry.manifest_command,
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
    );
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.url, 'http://127.0.0.1:3310/redcube');

    const catalogOutput = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(catalogOutput.workspace_catalog.projects.length, 6);
    const redcubeProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    const omaProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'opl-meta-agent',
    );
    assert.equal(redcubeProject.active_binding.workspace_path, repoRoot);
    assert.equal(redcubeProject.bindings_count.total, 1);
    assert.equal(redcubeProject.bindings_count.direct_entry_ready, 1);
    assert.equal(redcubeProject.bindings_count.manifest_ready, 1);
    assert.equal(redcubeProject.last_updated_at, bindOutput.workspace_catalog.binding.updated_at);
    assert.equal(omaProject.active_binding, null);
    assert.deepEqual(omaProject.available_actions, ['init', 'bind', 'activate', 'archive']);
    assert.deepEqual(redcubeProject.available_actions, ['init', 'bind', 'activate', 'archive', 'launch']);
    assert.equal(
      redcubeProject.binding_contract.surface_id,
      'opl_project_workspace_binding_contract',
    );
    assert.deepEqual(
      redcubeProject.binding_contract.required_locator_fields,
      [],
    );
    assert.deepEqual(
      redcubeProject.binding_contract.optional_locator_fields,
      ['workspace_root'],
    );
    assert.equal(
      redcubeProject.binding_contract.derived_entry_command_template,
      'node -e <redcube_generated_product_status_materializer>',
    );
    assert.equal(
      redcubeProject.binding_contract.derived_manifest_command_template,
      'node -e <redcube_generated_product_entry_manifest_materializer>',
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

test('workspace registry hydrates derived RCA manifest commands for legacy locator-only bindings', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-rca-binding-state-'));
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(workspaceRegistryPath, `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'legacy-redcube-binding',
          project_id: 'redcube',
          project: 'redcube-ai',
          workspace_path: repoRoot,
          label: 'Legacy RedCube Binding',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'redcube_workspace',
              workspace_root: repoRoot,
              profile_ref: null,
              input_path: null,
            },
          },
          created_at: '2026-06-07T00:00:00.000Z',
          updated_at: '2026-06-07T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`);

    const catalogOutput = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const redcube = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.match(redcube.active_binding.direct_entry.command, /getProductStatus/);
    assert.match(redcube.active_binding.direct_entry.manifest_command, /getProductEntryManifest/);
    assert.equal(redcube.bindings_count.direct_entry_ready, 1);
    assert.equal(redcube.bindings_count.manifest_ready, 1);

    const manifests = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: contractsDir,
    });
    const redcubeManifest = manifests.domain_manifests.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.notEqual(redcubeManifest.manifest_command, null);
    assert.notEqual(redcubeManifest.status, 'manifest_not_configured');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace registry ignores active stale MAS locator-only bindings during readback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-state-'));
  const staleWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-root-'));
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(workspaceRegistryPath, `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'active-stale-mas-binding',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: staleWorkspace,
          label: 'Active stale MAS Binding',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: staleWorkspace,
              profile_ref: path.join(staleWorkspace, 'profile.toml'),
              input_path: null,
            },
          },
          created_at: '2026-06-07T00:00:00.000Z',
          updated_at: '2026-06-07T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`);

    const catalogOutput = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    });
    const mas = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(mas.active_binding.binding_id, 'active-stale-mas-binding');
    assert.equal(mas.bindings_count.total, 1);
    assert.equal(mas.bindings_count.direct_entry_ready, 0);
    assert.equal(mas.bindings_count.manifest_ready, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(staleWorkspace, { recursive: true, force: true });
  }
});

test('workspace bind replaces active stale MAS locator-only bindings during readback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-state-'));
  const staleWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-old-'));
  const currentWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-current-'));
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');
  const profilePath = path.join(currentWorkspaceRoot, 'profiles', 'local.toml');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.mkdirSync(path.join(currentWorkspaceRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(path.join(currentWorkspaceRoot, 'scripts', 'run-python-clean.sh'), '#!/bin/sh\n');
    fs.writeFileSync(profilePath, 'workspace_root = "."\n');
    fs.writeFileSync(workspaceRegistryPath, `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'stale-mas-binding',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: staleWorkspaceRoot,
          label: 'stale MAS binding',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: staleWorkspaceRoot,
              profile_ref: profilePath,
              input_path: null,
            },
          },
          created_at: '2026-06-27T00:00:00.000Z',
          updated_at: '2026-06-27T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`);
    fs.rmSync(staleWorkspaceRoot, { recursive: true, force: true });

    const bindOutput = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      currentWorkspaceRoot,
      '--profile',
      profilePath,
      '--label',
      'current MAS binding',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const binding = bindOutput.workspace_catalog.binding;
    assert.equal(bindOutput.workspace_catalog.action, 'bind');
    assert.equal(binding.project_id, 'medautoscience');
    assert.equal(binding.status, 'active');
    assert.equal(binding.workspace_path, currentWorkspaceRoot);
    assert.match(binding.direct_entry.command, /run-python-clean\.sh/);

    const staleBinding = bindOutput.workspace_catalog.bindings.find(
      (entry: { binding_id: string }) => entry.binding_id === 'stale-mas-binding',
    );
    assert.equal(staleBinding.status, 'inactive');
    assert.equal(staleBinding.direct_entry.command, null);
    assert.equal(staleBinding.direct_entry.manifest_command, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(staleWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(currentWorkspaceRoot, { recursive: true, force: true });
  }
});

test('workspace fleet report audits bound workspaces without executing direct-entry commands', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-fleet-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-fleet-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'visual-theme-a',
      '--project-id',
      'deck-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const workspacePath = path.join(workspaceRoot, 'visual-theme-a');
    const healthPath = path.join(workspacePath, 'workspace_health.json');
    const health = parseJsonText(fs.readFileSync(healthPath, 'utf8')) as any;
    health.status = 'blocked';
    fs.writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}\n`);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      workspaceRoot,
      '--entry-command',
      'sh -c "touch should-not-run"',
      '--manifest-command',
      'sh -c "touch manifest-should-not-run"',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const fleet = runCli(['workspace', 'fleet', 'report'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_fleet_report;
    assert.equal(fleet.surface_kind, 'opl_workspace_fleet_report');
    assert.equal(fleet.status, 'blocked');
    assert.equal(fleet.summary.ready_bindings_count, 0);
    assert.equal(fleet.summary.repairable_bindings_count, 1);
    assert.equal(fleet.summary.blocked_bindings_count, 1);
    assert.equal(fleet.authority_boundary.fleet_report_executes_direct_entry, false);
    assert.equal(fleet.authority_boundary.fleet_report_executes_manifest_command, false);
    const ready = fleet.bindings.find((entry: { workspace_path: string }) => entry.workspace_path === workspacePath);
    assert.equal(ready.fleet_status, 'repairable');
    assert.equal(ready.doctor_status, 'repairable');
    assert.deepEqual(ready.blockers, []);
    assert.equal(
      ready.repairable_findings.some((entry: { code: string }) => entry.code === 'workspace_health_drift'),
      true,
    );
    assert.equal(ready.current_project.project_id, 'deck-001');
    assert.equal(ready.project_lifecycle_counts.active, 1);
    const blocked = fleet.bindings.find((entry: { workspace_path: string }) => entry.workspace_path === workspaceRoot);
    assert.equal(blocked.fleet_status, 'blocked');
    assert.equal(blocked.blockers.some((entry: { code: string }) => entry.code === 'workspace_index_missing'), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'should-not-run')), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'manifest-should-not-run')), false);
    assert.equal(
      fleet.unbound_projects.some((entry: { project_id: string }) => entry.project_id === 'opl-meta-agent'),
      true,
    );

    const list = runCli(['workspace', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_catalog;
    assert.equal(Object.hasOwn(list, 'bindings'), true);
    assert.equal(Object.hasOwn(list, 'workspace_fleet_report'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
      'redcube-ai product-entry',
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
    assert.equal(manifestOutput.domain_manifests.opl_meta_agent_registry.surface_kind, 'opl_meta_agent_registry_extension');
    assert.equal(manifestOutput.domain_manifests.opl_meta_agent_registry.project_id, 'opl-meta-agent');
    const metaAgentRegistry = manifestOutput.domain_manifests.opl_meta_agent_registry;
    assert.equal(['resolved', 'not_bound'].includes(metaAgentRegistry.status), true);
    assert.equal(
      metaAgentRegistry.summary.app_workbench_section_count,
      metaAgentRegistry.status === 'resolved' ? 8 : 0,
    );
    assert.equal(
      metaAgentRegistry.summary.claims_domain_ready,
      false,
    );
    assert.equal(
      metaAgentRegistry.summary.patch_loop_target_count ?? 0,
      metaAgentRegistry.status === 'resolved' ? 2 : 0,
    );
    if (metaAgentRegistry.status === 'resolved') {
      assert.equal(
        metaAgentRegistry.summary.evidence_after_contract_status,
        'target_owner_receipt_or_typed_blocker_refs_projected',
      );
      assert.equal(metaAgentRegistry.summary.scaleout_owner_receipt_target_count, 2);
      assert.equal(metaAgentRegistry.summary.scaleout_typed_blocker_target_count, 1);
      assert.equal(metaAgentRegistry.summary.scaleout_owner_receipt_or_typed_blocker_target_count, 2);
      assert.equal(metaAgentRegistry.summary.scaleout_agent_lab_result_target_count, 2);
      assert.equal(metaAgentRegistry.summary.scaleout_no_forbidden_write_target_count, 2);
      assert.equal(metaAgentRegistry.summary.scaleout_cleanup_closeout_target_count, 2);
      assert.equal(metaAgentRegistry.summary.scaleout_domain_ready_claim_count, 0);
      assert.equal(metaAgentRegistry.summary.scaleout_default_promotion_claim_count, 0);
      assert.equal(
        metaAgentRegistry.oma_sections.trajectory_learning.surface_kind,
        'opl_meta_agent_trajectory_learning_app_workbench_section',
      );
      assert.equal(
        metaAgentRegistry.oma_sections.trajectory_learning.authority_boundary
          .can_promote_default_agent_without_gate,
        false,
      );
      assert.equal(
        metaAgentRegistry.oma_sections.patch_loop_closeout.refs.length >= 16,
        true,
      );
      assert.ok(
        metaAgentRegistry.oma_sections.patch_loop_closeout.required_ref_fields.includes('root_cause_refs'),
      );
      assert.ok(
        metaAgentRegistry.oma_sections.patch_loop_closeout.required_ref_fields.includes('targeted_fix_refs'),
      );
      assert.ok(
        metaAgentRegistry.oma_sections.patch_loop_closeout.required_ref_fields.includes('predicted_impact_refs'),
      );
      assert.ok(
        metaAgentRegistry.oma_sections.patch_loop_closeout.required_ref_fields.includes('next_run_falsification_refs'),
      );
    } else {
      assert.equal(metaAgentRegistry.summary.evidence_after_contract_status, 'not_observed');
      assert.equal(metaAgentRegistry.repo_dir, null);
    }
    assert.equal(
      metaAgentRegistry.authority_boundary.can_authorize_target_domain_quality_or_export,
      false,
    );
    assert.ok(
      manifestOutput.domain_manifests.notes.some((note: string) =>
        note.includes('opl workspace list') && note.includes('opl domain manifests'),
      ),
    );

    const medautogrant = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.deepEqual(
      {
        medautogrant: {
          status: medautogrant.status,
          shell: medautogrant.manifest.recommended_shell,
          readiness: medautogrant.manifest.product_entry_readiness.verdict,
          readyToTryNow: medautogrant.manifest.product_entry_preflight.ready_to_try_now,
          lifecycleResume: medautogrant.manifest.task_lifecycle.resume_surface.surface_kind,
          skillCount: medautogrant.manifest.skill_catalog.skills.length,
        },
        medautoscience: {
          status: medautoscience.status,
          shell: medautoscience.manifest.recommended_shell,
          readiness: medautoscience.manifest.product_entry_readiness.verdict,
          readyToTryNow: medautoscience.manifest.product_entry_preflight.ready_to_try_now,
          lifecycleResume: medautoscience.manifest.task_lifecycle.resume_surface.surface_kind,
          skillCount: medautoscience.manifest.skill_catalog.skills.length,
        },
        redcube: {
          status: redcube.status,
          shell: redcube.manifest.recommended_shell,
          readiness: redcube.manifest.product_entry_readiness.verdict,
          readyToTryNow: redcube.manifest.product_entry_preflight.ready_to_try_now,
          lifecycleResume: redcube.manifest.task_lifecycle.resume_surface.surface_kind,
          skillCount: redcube.manifest.skill_catalog.skills.length,
        },
      },
      {
        medautogrant: {
          status: 'resolved',
          shell: 'grant_user_loop',
          readiness: 'agent_assisted_ready_not_product_grade',
          readyToTryNow: true,
          lifecycleResume: 'grant_user_loop',
          skillCount: 2,
        },
        medautoscience: {
          status: 'resolved',
          shell: 'workspace_cockpit',
          readiness: 'runtime_ready_not_standalone_product',
          readyToTryNow: true,
          lifecycleResume: 'launch_study',
          skillCount: 2,
        },
        redcube: {
          status: 'resolved',
          shell: 'direct',
          readiness: 'service_surface_ready_not_managed_product',
          readyToTryNow: true,
          lifecycleResume: 'product_entry_session',
          skillCount: 2,
        },
      },
    );
    assert.equal(medautogrant.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assert.equal(medautoscience.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assert.equal(redcube.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assertMagActionGraph(medautogrant.manifest.family_orchestration.action_graph);
    assertMasActionGraph(medautoscience.manifest.family_orchestration.action_graph);
    assertRedcubeActionGraph(redcube.manifest.family_orchestration.action_graph);

    const dashboardOutput = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
    const guiRuntime = dashboardOutput.dashboard.gui_runtime;
    assert.equal(guiRuntime.recommended_entry_surfaces_count, 3);
    assert.equal(Object.hasOwn(guiRuntime, 'hosted_runtime_readiness'), false);
    assert.deepEqual(
      {
        total: guiRuntime.domain_entry_parity.summary.total_projects_count,
        aligned: guiRuntime.domain_entry_parity.summary.aligned_projects_count,
        partial: guiRuntime.domain_entry_parity.summary.partial_projects_count,
        blocked: guiRuntime.domain_entry_parity.summary.blocked_projects_count,
        directEntryReady: guiRuntime.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
        contractReady: guiRuntime.domain_entry_parity.summary.domain_entry_contract_ready_count,
        specReady: guiRuntime.domain_entry_parity.summary.domain_agent_entry_spec_ready_count,
        skillRuntimeReady: guiRuntime.domain_entry_parity.summary.skill_runtime_continuity_ready_count,
        userInteractionReady: guiRuntime.domain_entry_parity.summary.user_interaction_contract_ready_count,
        readyForStart: guiRuntime.domain_entry_parity.summary.ready_for_opl_start_count,
        readyForHandoff: guiRuntime.domain_entry_parity.summary.ready_for_domain_handoff_count,
      },
      {
        total: 3,
        aligned: 1,
        partial: 2,
        blocked: 0,
        directEntryReady: 1,
        contractReady: 3,
        specReady: 3,
        skillRuntimeReady: 3,
        userInteractionReady: 3,
        readyForStart: 3,
        readyForHandoff: 3,
      },
    );
    const parityByProject = Object.fromEntries(
      guiRuntime.domain_entry_parity.projects.map((entry: { project_id: string }) => [entry.project_id, entry]),
    ) as Record<string, any>;
    assert.deepEqual(
      Object.fromEntries(['medautogrant', 'medautoscience', 'redcube'].map((projectId) => {
        const entry = parityByProject[projectId];
        return [projectId, {
          entryParity: entry.entry_parity_status,
          locator: entry.direct_entry_locator_status,
          readiness: entry.product_entry_readiness_verdict,
          readyForStart: entry.ready_for_opl_start,
          readyForHandoff: entry.ready_for_domain_handoff,
          contract: entry.domain_entry_contract_status,
          spec: entry.domain_agent_entry_spec_status,
          interaction: entry.user_interaction_contract_status,
          skillRuntime: entry.skill_runtime_continuity_status,
        }];
      })),
      {
        medautogrant: {
          entryParity: 'partial',
          locator: 'missing',
          readiness: 'agent_assisted_ready_not_product_grade',
          readyForStart: true,
          readyForHandoff: true,
          contract: 'ready',
          spec: 'ready',
          interaction: 'ready',
          skillRuntime: 'ready',
        },
        medautoscience: {
          entryParity: 'partial',
          locator: 'missing',
          readiness: 'runtime_ready_not_standalone_product',
          readyForStart: true,
          readyForHandoff: true,
          contract: 'ready',
          spec: 'ready',
          interaction: 'ready',
          skillRuntime: 'ready',
        },
        redcube: {
          entryParity: 'aligned',
          locator: 'ready',
          readiness: 'service_surface_ready_not_managed_product',
          readyForStart: true,
          readyForHandoff: true,
          contract: 'ready',
          spec: 'ready',
          interaction: 'ready',
          skillRuntime: 'ready',
        },
      },
    );
    const entryByProject = Object.fromEntries(
      guiRuntime.recommended_entry_surfaces.map((entry: { project_id: string }) => [entry.project_id, entry]),
    ) as Record<string, any>;
    assert.deepEqual(
      {
        medautogrant: {
          readiness: entryByProject.medautogrant.product_entry_readiness_verdict,
          graph: [
            entryByProject.medautogrant.family_action_graph_node_count,
            entryByProject.medautogrant.family_action_graph_edge_count,
          ],
          lifecycleResume: entryByProject.medautogrant.task_lifecycle_resume_surface_kind,
          skillCount: entryByProject.medautogrant.skill_catalog_skill_count,
          domainAgent: entryByProject.medautogrant.domain_agent_entry_id,
        },
        medautoscience: {
          readiness: entryByProject.medautoscience.product_entry_readiness_verdict,
          graph: [
            entryByProject.medautoscience.family_action_graph_node_count,
            entryByProject.medautoscience.family_action_graph_edge_count,
          ],
          lifecycleResume: entryByProject.medautoscience.task_lifecycle_resume_surface_kind,
          skillCount: entryByProject.medautoscience.skill_catalog_skill_count,
          domainAgent: entryByProject.medautoscience.domain_agent_entry_id,
        },
        redcube: {
          readiness: entryByProject.redcube.product_entry_readiness_verdict,
          graph: [
            entryByProject.redcube.family_action_graph_node_count,
            entryByProject.redcube.family_action_graph_edge_count,
          ],
          lifecycleResume: entryByProject.redcube.task_lifecycle_resume_surface_kind,
          skillCount: entryByProject.redcube.skill_catalog_skill_count,
          domainAgent: entryByProject.redcube.domain_agent_entry_id,
        },
      },
      {
        medautogrant: {
          readiness: 'agent_assisted_ready_not_product_grade',
          graph: [2, 1],
          lifecycleResume: 'grant_user_loop',
          skillCount: 2,
          domainAgent: 'mag',
        },
        medautoscience: {
          readiness: 'runtime_ready_not_standalone_product',
          graph: [4, 5],
          lifecycleResume: 'launch_study',
          skillCount: 2,
          domainAgent: 'mas',
        },
        redcube: {
          readiness: 'service_surface_ready_not_managed_product',
          graph: [4, 4],
          lifecycleResume: 'product_entry_session',
          skillCount: 2,
          domainAgent: 'rca',
        },
      },
    );
    assert.equal(entryByProject.redcube.active_binding_locator.manifest_command, buildManifestCommand(fixtures.redcube));

    const removedEntryCommand = ['front', 'door'].join('');
    const removedGuide = runCliFailure([removedEntryCommand, 'entry-guide'], env);
    assert.equal(removedGuide.status, 2);
    assert.equal(removedGuide.payload.error.code, 'unknown_command');
    assert.equal(removedGuide.payload.error.details.command, removedEntryCommand);

    const removedWiring = runCliFailure([removedEntryCommand, 'domain-wiring'], env);
    assert.equal(removedWiring.status, 2);
    assert.equal(removedWiring.payload.error.code, 'unknown_command');
    assert.equal(removedWiring.payload.error.details.command, removedEntryCommand);

    const removedReadiness = runCliFailure([removedEntryCommand, 'readiness', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(removedReadiness.status, 2);
    assert.equal(removedReadiness.payload.error.code, 'unknown_command');
    assert.equal(removedReadiness.payload.error.details.command, removedEntryCommand);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
