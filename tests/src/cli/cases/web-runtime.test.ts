import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('web starts a local front-desk adapter and serves JSON root plus ask surfaces', async () => {
  const codexFixture = createCodexConfigFixture({
    model: 'gpt-5.4-web',
    reasoningEffort: 'xhigh',
  });
  const engineActionFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-engine-action-'));
  const engineMarkerPath = path.join(engineActionFixtureRoot, 'codex-install.marker');
  const installScript = path.join(engineActionFixtureRoot, 'install-codex.sh');
  fs.writeFileSync(
    installScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(engineMarkerPath)}`,
      'echo "web codex install fixture completed"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const { fixtureRoot: codexRuntimeFixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"web-ask-session"}
{"type":"turn.started"}
{"item":{"type":"command_execution","command":"opl handoff","status":"in_progress"}}
{"item":{"type":"agent_message","text":"WEB PILOT ASK RESPONSE"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
if [ "$1" = "resume" ] && [ "$2" = "sess_web" ]; then
  cat <<'EOF'
WEB PILOT RESUME OUTPUT
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
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
  Active:       2
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Web pilot session                                  1m ago        cli    sess_web
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "sess_web" ]; then
  cat <<'EOF'
WEB PILOT RESUME OUTPUT
EOF
  exit 0
fi
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] gateway boot
[INFO] hosted-friendly front desk ready
EOF
  exit 0
fi
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
WEB PILOT ASK RESPONSE

session_id: web-ask-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-workspace-root-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot: familyContractsFixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const sharedEnv = {
    HOME: homeRoot,
    CODEX_HOME: codexFixture.codexHome,
    OPL_CODEX_BIN: codexPath,
    OPL_CODEX_INSTALL_COMMAND: installScript,
    OPL_HERMES_BIN: hermesPath,
    OPL_FRONTDESK_STATE_DIR: stateDir,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
  };

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

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
    ], sharedEnv);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], sharedEnv);
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
    ], sharedEnv);

    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      sharedEnv,
    );
    child = startup.child;

    const oplApi = startup.payload.opl_api as {
      surface_id: string;
      entry_surface: string;
      runtime_modes: {
        interaction_mode: string;
        execution_mode: string;
      };
      resources: {
        system: string;
        engines: string;
        modules: string;
        agents: string;
        workspaces: string;
        sessions: string;
        progress: string;
        artifacts: string;
      };
      actions: {
        system: string;
        engines: string;
        modules: string;
        workspace_root: string;
        session_create: string;
        session_resume: string;
        session_logs: string;
      };
      debug: {
        dashboard: string;
        health: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(startup.payload.version, 'g2');
    assert.equal(oplApi.surface_id, 'opl_product_api_bootstrap');
    assert.equal(oplApi.entry_surface, 'opl_product_api');
    assert.equal(oplApi.resources.system, '/api/opl/system');
    assert.equal(oplApi.resources.engines, '/api/opl/engines');
    assert.equal(oplApi.resources.modules, '/api/opl/modules');
    assert.equal(oplApi.resources.agents, '/api/opl/agents');
    assert.equal(oplApi.resources.workspaces, '/api/opl/workspaces');
    assert.equal(oplApi.resources.sessions, '/api/opl/sessions');
    assert.equal(oplApi.resources.progress, '/api/opl/progress');
    assert.equal(oplApi.resources.artifacts, '/api/opl/artifacts');
    assert.equal(oplApi.actions.system, '/api/opl/system/actions');
    assert.equal(oplApi.actions.engines, '/api/opl/engines/actions');
    assert.equal(oplApi.actions.modules, '/api/opl/modules/actions');
    assert.equal(oplApi.actions.workspace_root, '/api/opl/workspaces/root');
    assert.equal(oplApi.actions.session_create, '/api/opl/sessions');
    assert.equal(oplApi.actions.session_resume, '/api/opl/sessions/resume');
    assert.equal(oplApi.actions.session_logs, '/api/opl/sessions/logs');
    assert.equal(oplApi.runtime_modes.interaction_mode, 'codex');
    assert.equal(oplApi.runtime_modes.execution_mode, 'codex');

    const baseUrl = String(oplApi.listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /application\/json/i);
    const rootPayload = await page.json() as {
      opl_api: {
        surface_id: string;
        mode: string;
        shell_integration_target: string;
        summary: string;
        recommended_gui_overlay: string;
        resources: {
          system: string;
          agents: string;
          sessions: string;
          progress: string;
          artifacts: string;
        };
        notes: string[];
      };
    };
    assert.equal(rootPayload.opl_api.surface_id, 'opl_product_api_root');
    assert.equal(rootPayload.opl_api.mode, 'api_only');
    assert.equal(rootPayload.opl_api.shell_integration_target, 'external_gui_overlay');
    assert.equal(rootPayload.opl_api.recommended_gui_overlay, 'aionui_shell');
    assert.equal(rootPayload.opl_api.resources.system, '/api/opl/system');
    assert.equal(rootPayload.opl_api.resources.agents, '/api/opl/agents');
    assert.equal(rootPayload.opl_api.resources.sessions, '/api/opl/sessions');
    assert.equal(rootPayload.opl_api.resources.progress, '/api/opl/progress');
    assert.equal(rootPayload.opl_api.resources.artifacts, '/api/opl/artifacts');
    assert.match(rootPayload.opl_api.summary, /product API resources/i);
    assert.equal(rootPayload.opl_api.notes.includes('OPL main repo now stays headless and contract-first.'), true);

    const dashboardResponse = await fetch(`${baseUrl}/api/status/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.product_api.local_web_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.projects.length, 4);
    assert.equal(dashboardPayload.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(
      dashboardPayload.dashboard.product_api.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardPayload.dashboard.product_api.domain_entry_parity.summary.total_projects_count,
      3,
    );

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.entry_surface, 'opl_local_web_product_api');
    assert.equal(healthPayload.health.status, 'ok');
    assert.equal(healthPayload.health.checks.gateway_service.loaded, true);

    const systemResponse = await fetch(`${baseUrl}/api/opl/system`);
    const systemPayload = await systemResponse.json();
    assert.equal(systemPayload.system.surface_id, 'opl_system');
    assert.equal(systemPayload.system.runtime_modes.interaction_mode, 'codex');
    assert.equal(systemPayload.system.workspace_root.health_status, 'missing');
    assert.equal(systemPayload.system.endpoints.engines, '/api/opl/engines');

    const enginesResponse = await fetch(`${baseUrl}/api/opl/engines`);
    const enginesPayload = await enginesResponse.json();
    assert.equal(enginesPayload.engines.surface_id, 'opl_engines');
    assert.equal(enginesPayload.engines.items.some((entry: { engine_id: string }) => entry.engine_id === 'codex'), true);
    assert.equal(enginesPayload.engines.items.some((entry: { engine_id: string }) => entry.engine_id === 'hermes'), true);

    const modulesResponse = await fetch(`${baseUrl}/api/opl/modules`);
    const modulesPayload = await modulesResponse.json();
    assert.equal(modulesPayload.modules.surface_id, 'opl_modules');
    assert.equal(
      modulesPayload.modules.items.some((entry: { module_id: string }) => entry.module_id === 'medautoscience'),
      true,
    );

    const agentsResponse = await fetch(`${baseUrl}/api/opl/agents`);
    const agentsPayload = await agentsResponse.json();
    assert.equal(agentsPayload.agents.surface_id, 'opl_agents');
    assert.equal(agentsPayload.agents.items.some((entry: { agent_id: string }) => entry.agent_id === 'general-chat'), true);
    assert.equal(agentsPayload.agents.items.some((entry: { agent_id: string }) => entry.agent_id === 'general-task'), true);
    const masAgent = agentsPayload.agents.items.find((entry: { agent_id: string }) => entry.agent_id === 'mas');
    assert.equal(masAgent?.requires_workspace, true);
    assert.deepEqual(masAgent?.locator_fields.required, ['cwd', 'profile_ref']);
    assert.equal(masAgent?.entry_spec.codex_entry_strategy, 'domain_agent_entry');

    const workspacesResponse = await fetch(`${baseUrl}/api/opl/workspaces`);
    const workspacesPayload = await workspacesResponse.json();
    assert.equal(workspacesPayload.workspaces.surface_id, 'opl_workspaces');
    assert.equal(workspacesPayload.workspaces.summary.total_projects_count, 4);

    const systemInitializeResponse = await fetch(`${baseUrl}/api/opl/system/initialize`);
    const systemInitializePayload = await systemInitializeResponse.json();
    assert.equal(systemInitializePayload.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(systemInitializePayload.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(systemInitializePayload.system_initialize.endpoints.system, '/api/opl/system');
    assert.equal(systemInitializePayload.system_initialize.endpoints.settings, '/api/opl/system/settings');

    const settingsResponse = await fetch(`${baseUrl}/api/opl/system/settings`);
    const settingsPayload = await settingsResponse.json();
    assert.equal(settingsPayload.system_settings.surface_id, 'opl_system_settings');
    assert.equal(settingsPayload.system_settings.interaction_mode, 'codex');
    assert.equal(settingsPayload.system_settings.execution_mode, 'codex');

    const settingsUpdateResponse = await fetch(`${baseUrl}/api/opl/system/settings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interaction_mode: 'hermes',
        execution_mode: 'codex',
      }),
    });
    const settingsUpdatePayload = await settingsUpdateResponse.json();
    assert.equal(settingsUpdatePayload.system_settings.interaction_mode, 'hermes');
    assert.equal(settingsUpdatePayload.system_settings.execution_mode, 'codex');

    const workspaceRootSetResponse = await fetch(`${baseUrl}/api/opl/workspaces/root`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: workspaceRoot,
      }),
    });
    const workspaceRootSetPayload = await workspaceRootSetResponse.json();
    assert.equal(workspaceRootSetPayload.workspace_root.selected_path, workspaceRoot);
    assert.equal(workspaceRootSetPayload.workspace_root.health_status, 'ready');

    const workspaceRootResponse = await fetch(`${baseUrl}/api/opl/workspaces/root`);
    const workspaceRootPayload = await workspaceRootResponse.json();
    assert.equal(workspaceRootPayload.workspace_root.selected_path, workspaceRoot);
    assert.equal(workspaceRootPayload.workspace_root.health_status, 'ready');

    const systemActionResponse = await fetch(`${baseUrl}/api/opl/system/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_channel',
        channel: 'preview',
      }),
    });
    const systemActionPayload = await systemActionResponse.json();
    assert.equal(systemActionPayload.system_action.action, 'update_channel');
    assert.equal(systemActionPayload.system_action.update_channel, 'preview');
    assert.equal(systemActionPayload.system_action.status, 'completed');

    const engineActionResponse = await fetch(`${baseUrl}/api/opl/engines/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'install',
        engine_id: 'codex',
      }),
    });
    const engineActionPayload = await engineActionResponse.json();
    assert.equal(engineActionPayload.engine_action.engine_id, 'codex');
    assert.equal(engineActionPayload.engine_action.action, 'install');
    assert.equal(engineActionPayload.engine_action.status, 'completed');
    assert.equal('frontdesk_environment' in engineActionPayload.engine_action, false);
    assert.equal(engineActionPayload.engine_action.system.surface_id, 'opl_system');
    assert.equal(engineActionPayload.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(engineMarkerPath), true);

    const progressResponse = await fetch(
      `${baseUrl}/api/opl/progress?workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const progressPayload = await progressResponse.json();
    assert.equal(progressPayload.progress.surface_id, 'opl_progress');
    assert.equal(progressPayload.progress.current_project.workspace_path, repoRoot);
    assert.ok(Array.isArray(progressPayload.progress.inspect_paths));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.running));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.waiting));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.delivered));
    assert.equal(typeof progressPayload.progress.headline, 'string');
    assert.equal('study' in progressPayload.progress, true);
    const domainManifestResponse = await fetch(`${baseUrl}/api/domain/manifests`);
    const domainManifestPayload = await domainManifestResponse.json();
    assert.equal(domainManifestPayload.domain_manifests.summary.total_projects_count, 3);

    const hostedPackageOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-hosted-package-'));
    try {
      const hostedBundleResponse = await fetch(`${baseUrl}/api/opl/web/bundle`);
      const hostedBundlePayload = await hostedBundleResponse.json();
      assert.equal(hostedBundlePayload.web_bundle.surface_id, 'opl_web_bundle');
      assert.equal(hostedBundlePayload.web_bundle.api_base_url, `${baseUrl}/api`);
      assert.equal(hostedBundlePayload.web_bundle.opl_api.resources.agents, '/api/opl/agents');

      const hostedPackageResponse = await fetch(`${baseUrl}/api/opl/web/package`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          output_dir: hostedPackageOutput,
          public_origin: 'https://opl.example.com',
        }),
      });
      const hostedPackagePayload = await hostedPackageResponse.json();
      assert.equal(hostedPackagePayload.web_package.surface_id, 'opl_web_package');
      assert.equal(hostedPackagePayload.web_package.public_origin, 'https://opl.example.com');
      assert.equal(hostedPackagePayload.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
      assert.equal(fs.existsSync(hostedPackagePayload.web_package.assets.bundle_json), true);
      assert.equal(fs.existsSync(hostedPackagePayload.web_package.assets.launch_script), true);
    } finally {
      fs.rmSync(hostedPackageOutput, { recursive: true, force: true });
    }

    const sessionsResponse = await fetch(`${baseUrl}/api/opl/sessions?limit=1`);
    const sessionsPayload = await sessionsResponse.json();
    assert.equal(sessionsPayload.sessions.surface_id, 'opl_sessions');
    assert.equal(sessionsPayload.sessions.items.length, 1);
    assert.equal(sessionsPayload.sessions.items[0].session_id, 'sess_web');
    assert.equal(sessionsPayload.sessions.current_runtime_continuity.project_id, 'medautogrant');
    assert.equal(sessionsPayload.sessions.current_runtime_continuity.domain_agent_id, 'mag');
    assert.equal(sessionsPayload.sessions.current_runtime_continuity.runtime_control.surface_kind, 'runtime_control');

    const oplProgressResponse = await fetch(`${baseUrl}/api/opl/progress?workspace_path=${encodeURIComponent(repoRoot)}`);
    const oplProgressPayload = await oplProgressResponse.json();
    assert.equal(oplProgressPayload.progress.surface_id, 'opl_progress');
    assert.equal(oplProgressPayload.progress.workspace_path, repoRoot);
    assert.equal(typeof oplProgressPayload.progress.headline, 'string');
    assert.equal(Array.isArray(oplProgressPayload.progress.task_cards.running), true);
    assert.equal(Array.isArray(oplProgressPayload.progress.task_cards.delivered), true);
    assert.equal(typeof oplProgressPayload.progress.recent_activity.preview, 'string');
    assert.equal(oplProgressPayload.progress.domain_agent_id, 'mag');
    assert.equal(oplProgressPayload.progress.repo_runtime_control.surface_kind, 'runtime_control');
    assert.equal(oplProgressPayload.progress.approval_surface.surface_kind, 'grant_user_loop');
    assert.equal(oplProgressPayload.progress.interrupt_surface, null);

    const oplArtifactsResponse = await fetch(`${baseUrl}/api/opl/artifacts?workspace_path=${encodeURIComponent(repoRoot)}`);
    const oplArtifactsPayload = await oplArtifactsResponse.json();
    assert.equal(oplArtifactsPayload.artifacts.surface_id, 'opl_artifacts');
    assert.equal(oplArtifactsPayload.artifacts.workspace_path, repoRoot);
    assert.equal(Array.isArray(oplArtifactsPayload.artifacts.deliverable_files), true);
    assert.equal(Array.isArray(oplArtifactsPayload.artifacts.supporting_files), true);
    assert.equal(oplArtifactsPayload.artifacts.domain_agent_id, 'mag');
    assert.equal(oplArtifactsPayload.artifacts.repo_runtime_control.surface_kind, 'runtime_control');
    assert.equal(oplArtifactsPayload.artifacts.artifact_pickup_surface.surface_kind, 'artifact_inventory');
    assert.equal(
      oplArtifactsPayload.artifacts.summary.total_files_count,
      oplArtifactsPayload.artifacts.deliverable_files.length + oplArtifactsPayload.artifacts.supporting_files.length,
    );

    const resumeResponse = await fetch(`${baseUrl}/api/opl/sessions/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'sess_web',
      }),
    });
    const resumePayload = await resumeResponse.json();
    assert.equal(resumePayload.session_resume.mode, 'resume');
    assert.match(resumePayload.session_resume.resume.output, /WEB PILOT RESUME OUTPUT/);

    const logsResponse = await fetch(`${baseUrl}/api/opl/sessions/logs?log_name=gateway&lines=20`);
    const logsPayload = await logsResponse.json();
    assert.equal(logsPayload.session_logs.mode, 'logs');
    assert.equal(logsPayload.session_logs.log_name, 'gateway');
    assert.match(logsPayload.session_logs.raw_output, /hosted-friendly front desk ready/);

    const previewResponse = await fetch(`${baseUrl}/api/opl/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'Prepare a defense-ready slide deck for a thesis committee.',
        preferred_family: 'ppt_deck',
        dry_run: true,
      }),
    });
    const previewPayload = await previewResponse.json();
    assert.equal(previewPayload.session_create.request_mode, 'dry_run');
    assert.equal(previewPayload.session_create.payload.product_entry.dry_run, true);
    assert.equal(previewPayload.session_create.payload.product_entry.executor_backend, 'hermes');
    assert.equal(previewPayload.session_create.payload.product_entry.routing.domain_id, 'redcube');

    const askResponse = await fetch(`${baseUrl}/api/opl/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'Prepare a defense-ready slide deck for a thesis committee.',
        preferred_family: 'ppt_deck',
      }),
    });
    const askPayload = await askResponse.json();
    assert.equal(askPayload.session_create.request_mode, 'submitted');
    assert.equal(askPayload.session_create.payload.product_entry.entry_surface, 'opl_session_api');
    assert.doesNotMatch(askPayload.session_create.payload.product_entry.entry_surface, /frontdesk/i);
    assert.equal(askPayload.session_create.payload.product_entry.mode, 'ask');
    assert.equal(askPayload.session_create.payload.product_entry.dry_run, false);
    assert.equal(askPayload.session_create.payload.product_entry.execution_mode, 'async_accept');
    assert.equal(askPayload.session_create.payload.product_entry.executor_backend, 'hermes');
    assert.match(askPayload.session_create.payload.product_entry.task.task_id, /^task_/);
    assert.equal(askPayload.session_create.payload.product_entry.task.status, 'accepted');
    assert.equal(askPayload.session_create.payload.product_entry.task.executor_backend, 'hermes');
    assert.match(askPayload.session_create.payload.product_entry.task.summary, /后台|受理|执行/);

    const taskStatusResponse = await fetch(
      `${baseUrl}/api/opl/progress?task_id=${encodeURIComponent(String(askPayload.session_create.payload.product_entry.task.task_id))}&workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const taskStatusPayload = await taskStatusResponse.json();
    assert.equal(taskStatusPayload.progress.surface_id, 'opl_progress');
    assert.equal(taskStatusPayload.progress.task.task_id, askPayload.session_create.payload.product_entry.task.task_id);
    assert.equal(taskStatusPayload.progress.task.executor_backend, 'hermes');
    assert.match(taskStatusPayload.progress.task.status, /accepted|running|succeeded|failed/);
    assert.equal(typeof taskStatusPayload.progress.task.recent_output, 'string');

    const refreshedSessionsResponse = await fetch(`${baseUrl}/api/opl/sessions?limit=1`);
    const refreshedSessionsPayload = await refreshedSessionsResponse.json();
    assert.equal(refreshedSessionsPayload.sessions.current_runtime_continuity.project_id, 'redcube');
    assert.equal(refreshedSessionsPayload.sessions.current_runtime_continuity.domain_agent_id, 'rca');
    assert.equal(
      refreshedSessionsPayload.sessions.current_runtime_continuity.runtime_control.surface_kind,
      'runtime_control',
    );
    assert.equal(
      refreshedSessionsPayload.sessions.current_runtime_continuity.restore_surface.surface_kind,
      'product_entry_session',
    );

    const refreshedProgressResponse = await fetch(
      `${baseUrl}/api/opl/progress?workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const refreshedProgressPayload = await refreshedProgressResponse.json();
    assert.equal(refreshedProgressPayload.progress.domain_agent_id, 'rca');
    assert.equal(refreshedProgressPayload.progress.repo_progress_projection.surface_kind, 'progress_projection');
    assert.equal(refreshedProgressPayload.progress.repo_runtime_control.surface_kind, 'runtime_control');
    assert.equal(refreshedProgressPayload.progress.approval_surface.surface_kind, 'product_entry_session');
    assert.equal(refreshedProgressPayload.progress.restore_surface.surface_kind, 'product_entry_session');

    const refreshedArtifactsResponse = await fetch(
      `${baseUrl}/api/opl/artifacts?workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const refreshedArtifactsPayload = await refreshedArtifactsResponse.json();
    assert.equal(refreshedArtifactsPayload.artifacts.domain_agent_id, 'rca');
    assert.equal(refreshedArtifactsPayload.artifacts.repo_artifact_inventory.surface_kind, 'artifact_inventory');
    assert.equal(refreshedArtifactsPayload.artifacts.repo_runtime_control.surface_kind, 'runtime_control');
    assert.equal(refreshedArtifactsPayload.artifacts.artifact_pickup_surface.surface_kind, 'artifact_inventory');

    const retiredAskResponse = await fetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'retired route probe',
      }),
    });
    assert.equal(retiredAskResponse.status, 404);

    const retiredTaskStatusResponse = await fetch(`${baseUrl}/api/task-status?task_id=retired-task`);
    assert.equal(retiredTaskStatusResponse.status, 404);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    fs.rmSync(codexRuntimeFixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(engineActionFixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(familyContractsFixtureRoot, { recursive: true, force: true });
  }
});

test('web front-desk keeps a minimal machine surface while start api stays available for resolved domain manifests', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-start-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
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
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Resolved start session                             1m ago        cli    sess_start
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

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
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    );
    child = startup.child;

    const baseUrl = String((startup.payload.opl_api as { listening: { base_url: string } }).listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /application\/json/i);
    const rootPayload = await page.json() as {
      opl_api: {
        surface_id: string;
        mode: string;
        shell_integration_target: string;
        recommended_gui_overlay: string;
        resources: {
          system: string;
        };
        actions: {
          start: string;
        };
      };
    };
    assert.equal(rootPayload.opl_api.surface_id, 'opl_product_api_root');
    assert.equal(rootPayload.opl_api.mode, 'api_only');
    assert.equal(rootPayload.opl_api.shell_integration_target, 'external_gui_overlay');
    assert.equal(rootPayload.opl_api.recommended_gui_overlay, 'aionui_shell');
    assert.equal(rootPayload.opl_api.resources.system, '/api/opl/system');
    assert.equal(rootPayload.opl_api.actions.start, '/api/opl/start');

    const startResponse = await fetch(`${baseUrl}/api/opl/start?project=redcube`);
    assert.equal(startResponse.status, 200);
    const startPayload = await startResponse.json();
    assert.equal(startPayload.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(startPayload.product_entry_start.project_id, 'redcube');
    assert.equal(startPayload.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode.command, 'redcube product frontdesk');
    assert.deepEqual(startPayload.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);

    const modeResponse = await fetch(`${baseUrl}/api/opl/start?project=redcube&mode=opl_bridge_handoff`);
    assert.equal(modeResponse.status, 200);
    const modePayload = await modeResponse.json();
    assert.equal(modePayload.product_entry_start.selected_mode_id, 'opl_bridge_handoff');
    assert.equal(modePayload.product_entry_start.selected_mode.command, 'redcube product federate');

    const launchResponse = await fetch(`${baseUrl}/api/opl/domain-launch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        project_id: 'redcube',
        dry_run: true,
      }),
    });
    assert.equal(launchResponse.status, 200);
    const launchPayload = await launchResponse.json();
    assert.equal(launchPayload.domain_entry_launch.project_id, 'redcube');
    assert.equal(launchPayload.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(launchPayload.domain_entry_launch.launch_status, 'preview_only');
    assert.equal(launchPayload.domain_entry_launch.direct_entry_locator.url, 'http://127.0.0.1:3310/redcube');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
