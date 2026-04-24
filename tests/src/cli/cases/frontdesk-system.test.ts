import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('status dashboard aggregates front-desk management surfaces into one view', () => {
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
  Jobs:         0
◆ Sessions
  Active:       1
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dashboard-state-'));

  try {
    const output = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.dashboard.product_api.direct_entry_command, 'opl');
    assert.equal(output.dashboard.product_api.local_web_status, 'pilot_landed');
    assert.equal(output.dashboard.product_api.desktop_shell_status, 'not_repo_tracked');
    assert.equal(output.dashboard.product_api.desktop_default_entry_status, 'external_overlay_required');
    assert.equal(output.dashboard.product_api.recommended_entry_surfaces_count, 0);
    assert.deepEqual(output.dashboard.product_api.recommended_entry_surfaces, []);
    assert.equal(output.dashboard.product_api.hosted_runtime_readiness.desktop_shell_landed, false);
    assert.equal('hosted_web_status' in output.dashboard.product_api, false);
    assert.equal('librechat_pilot_package_status' in output.dashboard.product_api, false);
    assert.equal('frontdesk_librechat_status_surface' in output.dashboard.product_api, false);
    assert.equal(output.dashboard.projects.length, 4);
    assert.equal(output.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(output.dashboard.domain_manifests.summary.resolved_count, 0);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.recent_sessions.sessions.length, 1);
    assert.deepEqual(output.dashboard.product_api.rollout_board_refs, [
      'docs/references/opl-frontdesk-delivery-board.md',
      'docs/references/opl-hosted-web-frontdesk-benchmark.md',
      'docs/references/family-lightweight-direct-entry-rollout-board.md',
      'docs/references/mas-top-level-cutover-board.md',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help advertises the local web front-desk pilot command surface', () => {
  const output = runCli(['help']);

  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system initialize'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'modules'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'domain launch'),
  );

  const scoped = runCli(['web', '--help']);
  assert.equal(scoped.help.command, 'web');
  assert.match(scoped.help.usage, /opl web/);
});

test('help advertises initialize and environment management command surfaces', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system initialize'), true);
  assert.equal(commands.includes('engine install'), true);
  assert.equal(commands.includes('system repair'), true);
  assert.equal(commands.includes('system reinstall-support'), true);
  assert.equal(commands.includes('system update-channel'), true);
  assert.equal(commands.includes('modules'), true);
  assert.equal(commands.includes('module install'), true);
  assert.equal(commands.includes('workspace root'), true);
  assert.equal(commands.includes('workspace root set'), true);
  assert.equal(commands.includes('workspace root doctor'), true);
});

test('legacy frontdesk command surfaces are retired from the public CLI', () => {
  for (const args of [
    ['frontdesk', 'manifest'],
    ['frontdesk', 'entry-guide'],
    ['frontdesk', 'domain-wiring'],
    ['frontdesk', 'readiness'],
  ]) {
    const { status, payload } = runCliFailure(args);
    assert.equal(status, 2);
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, 'frontdesk');
    assert.ok(Array.isArray(payload.error.details.commands));
    assert.equal(payload.error.details.commands.includes('frontdesk manifest'), false);
  }
});

test('service commands manage the local launchd wrapper for the web pilot', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frontdesk-home-'));
  const launchctlFixture = createFakeLaunchctlFixture();
  const openFixture = createFakeOpenFixture();
  const serviceEnv = {
    HOME: homeRoot,
    OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
    OPL_OPEN_BIN: openFixture.openPath,
  };
  const configuredPort = 8911;

  try {
    const install = runCli([
      'service',
      'install',
      '--host',
      '127.0.0.1',
      '--port',
      String(configuredPort),
      '--path',
      repoRoot,
      '--sessions-limit',
      '7',
    ], serviceEnv);

    assert.equal(install.service.action, 'install');
    assert.equal(install.service.installed, true);
    assert.equal(install.service.loaded, true);
    assert.equal(install.service.base_url, `http://127.0.0.1:${configuredPort}`);
    assert.equal(install.service.paths.launch_agent_plist.endsWith('.plist'), true);
    assert.equal(fs.existsSync(install.service.paths.launch_agent_plist), true);
    assert.equal(fs.existsSync(install.service.paths.config_file), true);

    const plistText = fs.readFileSync(install.service.paths.launch_agent_plist, 'utf8');
    assert.match(plistText, /<string>web<\/string>/);
    assert.match(plistText, new RegExp(String(configuredPort)));

    const statusWithoutHealth = runCli(['service', 'status'], serviceEnv);
    assert.equal(statusWithoutHealth.service.action, 'status');
    assert.equal(statusWithoutHealth.service.installed, true);
    assert.equal(statusWithoutHealth.service.loaded, true);
    assert.equal(statusWithoutHealth.service.health.status, 'unreachable');

    const statusWithHealth = runCli(['service', 'status'], serviceEnv);
    assert.equal(statusWithHealth.service.loaded, true);
    assert.equal(statusWithHealth.service.health.status, 'unreachable');
    assert.equal(
      statusWithHealth.service.health.url,
      `http://127.0.0.1:${configuredPort}/api/health`,
    );

    const openOutput = runCli(['service', 'open'], serviceEnv);
    assert.equal(openOutput.service.action, 'open');
    assert.match(fs.readFileSync(openFixture.capturePath, 'utf8'), new RegExp(String(configuredPort)));

    const stopOutput = runCli(['service', 'stop'], serviceEnv);
    assert.equal(stopOutput.service.action, 'stop');
    assert.equal(stopOutput.service.loaded, false);

    const stoppedStatus = runCli(['service', 'status'], serviceEnv);
    assert.equal(stoppedStatus.service.loaded, false);
    assert.equal(stoppedStatus.service.health.status, 'not_running');

    const startOutput = runCli(['service', 'start'], serviceEnv);
    assert.equal(startOutput.service.action, 'start');
    assert.equal(startOutput.service.loaded, true);

    const uninstallOutput = runCli(['service', 'uninstall'], serviceEnv);
    assert.equal(uninstallOutput.service.action, 'uninstall');
    assert.equal(uninstallOutput.service.installed, false);
    assert.equal(fs.existsSync(install.service.paths.launch_agent_plist), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('web bundle exposes an OPL web bundle with base-path aware product API endpoints', () => {
  const output = runCli([
    'web',
    'bundle',
    '--host',
    '0.0.0.0',
    '--port',
    '8787',
    '--base-path',
    '/pilot/opl',
    '--path',
    repoRoot,
    '--sessions-limit',
    '9',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.web_bundle.surface_id, 'opl_web_bundle');
  assert.equal(output.web_bundle.shell_integration_target, 'external_gui_overlay');
  assert.equal(output.web_bundle.bundle_status, 'landed');
  assert.equal(output.web_bundle.hosted_runtime_status, 'not_landed');
  assert.equal(output.web_bundle.base_path, '/pilot/opl');
  assert.equal(output.web_bundle.entry_url, 'http://127.0.0.1:8787/pilot/opl/');
  assert.equal(output.web_bundle.api_base_url, 'http://127.0.0.1:8787/pilot/opl/api');
  assert.equal(output.web_bundle.opl_api.resources.system, '/pilot/opl/api/opl/system');
  assert.equal(output.web_bundle.opl_api.actions.web_bundle, '/pilot/opl/api/opl/web/bundle');
  assert.equal(output.web_bundle.opl_api.debug.dashboard, '/pilot/opl/api/status/dashboard');
  assert.equal(output.web_bundle.defaults.workspace_path, repoRoot);
  assert.equal(output.web_bundle.defaults.sessions_limit, 9);
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.surface_kind,
    'opl_hosted_runtime_readiness',
  );
  assert.equal(output.web_bundle.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.web_bundle_landed,
    true,
  );
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.self_hostable_web_package_landed,
    true,
  );
});

test('web package exports a self-hostable OPL web package with runtime and proxy assets', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-'));

  try {
    const output = runCli([
      'web',
      'package',
      '--output',
      outputDir,
      '--public-origin',
      'https://opl.example.com',
      '--base-path',
      '/pilot/opl',
      '--host',
      '0.0.0.0',
      '--port',
      '8787',
      '--sessions-limit',
      '9',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.web_package.surface_id, 'opl_web_package');
    assert.equal(output.web_package.shell_integration_target, 'external_gui_overlay');
    assert.equal(output.web_package.package_status, 'landed');
    assert.equal(output.web_package.hosted_runtime_status, 'not_landed');
    assert.equal(output.web_package.public_origin, 'https://opl.example.com');
    assert.equal(output.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(output.web_package.api_base_url, 'https://opl.example.com/pilot/opl/api');
    assert.equal(output.web_package.opl_api.resources.system, '/pilot/opl/api/opl/system');
    assert.equal(output.web_package.opl_api.actions.web_package, '/pilot/opl/api/opl/web/package');
    assert.equal(
      output.web_package.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.self_hostable_web_package_landed,
      true,
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.service_safe_local_packaging_landed,
      true,
    );

    const assets = output.web_package.assets;
    assert.equal(fs.existsSync(assets.bundle_json), true);
    assert.equal(fs.existsSync(assets.readme), true);
    assert.equal(fs.existsSync(assets.launch_script), true);
    assert.equal(fs.existsSync(assets.service_unit), true);
    assert.equal(fs.existsSync(assets.service_install_script), true);
    assert.equal(fs.existsSync(assets.healthcheck_script), true);
    assert.equal(fs.existsSync(assets.reverse_proxy_template), true);
    assert.equal(fs.existsSync(assets.environment_template), true);
    assert.equal(fs.existsSync(assets.app_dist), true);
    assert.equal(fs.existsSync(path.join(assets.app_dist, 'cli.js')), true);
    assert.equal(fs.existsSync(path.join(assets.app_contracts, 'opl-gateway', 'workstreams.json')), true);

    assert.equal(output.web_package.operations.systemd.unit_name, 'opl-web.service');
    assert.equal(
      output.web_package.operations.systemd.install_script,
      assets.service_install_script,
    );
    assert.equal(
      output.web_package.operations.healthcheck.script,
      assets.healthcheck_script,
    );
    assert.equal(
      output.web_package.operations.healthcheck.local_url,
      'http://127.0.0.1:8787/pilot/opl/api/health',
    );
    assert.equal(
      output.web_package.operations.healthcheck.public_url,
      'https://opl.example.com/pilot/opl/api/health',
    );

    const readme = fs.readFileSync(assets.readme, 'utf8');
    assert.match(readme, /OPL Web Package/i);
    assert.match(readme, /OPL_HERMES_BIN/);
    assert.match(readme, /actual hosted runtime is still not landed/i);
    assert.match(readme, /install-systemd-service\.sh/);
    assert.match(readme, /check-opl-web-health\.sh/);
    assert.match(readme, /https:\/\/opl\.example\.com\/pilot\/opl\/api\/health/);

    const service = fs.readFileSync(assets.service_unit, 'utf8');
    assert.match(service, /EnvironmentFile=/);
    assert.match(service, /run-opl-web\.sh/);

    const runScript = fs.readFileSync(assets.launch_script, 'utf8');
    assert.match(runScript, /--base-path/);
    assert.match(runScript, /\/pilot\/opl/);
    assert.match(runScript, /OPL_WEB_WORKSPACE/);

    const caddyfile = fs.readFileSync(assets.reverse_proxy_template, 'utf8');
    assert.match(caddyfile, /opl\.example\.com/);
    assert.match(caddyfile, /handle_path \/pilot\/opl\/\*/);
    assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8787/);

    const envExample = fs.readFileSync(assets.environment_template, 'utf8');
    assert.match(envExample, /OPL_HERMES_BIN=/);
    assert.match(envExample, /OPL_WEB_WORKSPACE=/);

    const installScript = fs.readFileSync(assets.service_install_script, 'utf8');
    assert.match(installScript, /SYSTEMCTL_BIN/);
    assert.match(installScript, /daemon-reload/);
    assert.match(installScript, /opl-web\.service/);
    assert.match(installScript, /run-opl-web\.sh/);

    const healthcheckScript = fs.readFileSync(assets.healthcheck_script, 'utf8');
    assert.match(healthcheckScript, /api\/health/);
    assert.match(healthcheckScript, /node -e/);

    const bundleJson = JSON.parse(fs.readFileSync(assets.bundle_json, 'utf8'));
    assert.equal(bundleJson.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(bundleJson.web_package.base_path, '/pilot/opl');
    assert.equal(bundleJson.web_package.operations.systemd.unit_name, 'opl-web.service');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('mcp-stdio lists OPL tools and proxies session/workspace calls through the configured OPL product API', async () => {
  const fakeApi = await startFakeOplApiServer();
  const activatedWorkspacePath = '/tmp/opl-activated-workspace';

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
        '--workspace-path',
        repoRoot,
        '--sessions-limit',
        '7',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    try {
      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal(initialize.jsonrpc, '2.0');
      assert.equal(initialize.id, 1);
      assert.equal(
        (initialize.result as { capabilities: { tools: object } }).capabilities.tools !== undefined,
        true,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      const toolsList = await readJsonLine(child.stdout);
      const tools = (toolsList.result as {
        tools: Array<{ name: string; description?: string }>;
      }).tools;
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        [
          'opl_execute_request',
          'opl_project_progress',
          'opl_session',
          'opl_task_status',
          'opl_workspace',
        ],
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_project_progress')?.description ?? '',
        /哪篇论文|讲什么故事/,
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_task_status')?.description ?? '',
        /任务|进度|阶段/,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {
            action: 'activate',
            project_id: 'medautoscience',
            workspace_path: activatedWorkspacePath,
          },
        },
      });
      const activateCall = await readJsonLine(child.stdout);
      const activateContent = (activateCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(activateContent[0].type, 'text');
      assert.match(activateContent[0].text, /已切换工作区/);
      assert.match(activateContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'opl_project_progress',
          arguments: {},
        },
      });
      const progressCall = await readJsonLine(child.stdout);
      const progressContent = (progressCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(progressContent[0].type, 'text');
      assert.match(progressContent[0].text, /当前工作区：opl-activated-workspace/);
      assert.match(progressContent[0].text, /当前论文：004-invasive-architecture/);
      assert.match(progressContent[0].text, /论文题目：NF-PitNET invasive phenotype architecture/);
      assert.match(progressContent[0].text, /论文主线：当前主线是首术 NF-PitNET 的侵袭表型 architecture/);
      assert.match(progressContent[0].text, /当前阶段：论文主体内容已经完成，当前进入投稿打包收口。/);
      assert.match(progressContent[0].text, /系统下一步：优先核对 submission package 与 studies 目录中的交付面是否一致。/);
      assert.match(progressContent[0].text, /当前进度：004 论文当前仍在推进证据补强/);
      assert.match(progressContent[0].text, /最近活动：2m ago/);
      assert.match(progressContent[0].text, /当前卡点：submission package 仍需补更多主图后再建议用户审阅/);
      assert.match(progressContent[0].text, /查看位置：/);
      assert.doesNotMatch(progressContent[0].text, /entry_parity_status/);
      assert.doesNotMatch(progressContent[0].text, /continue bundle stage/i);
      assert.doesNotMatch(progressContent[0].text, /current_stage_summary|next_system_action|contract/i);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {},
        },
      });
      const projectsCall = await readJsonLine(child.stdout);
      const projectsContent = (projectsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(projectsContent[0].type, 'text');
      assert.match(projectsContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'list',
            limit: 3,
          },
        },
      });
      const sessionsCall = await readJsonLine(child.stdout);
      const sessionsContent = (sessionsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(sessionsContent[0].type, 'text');
      assert.match(sessionsContent[0].text, /最近会话：1 条/);
      assert.match(sessionsContent[0].text, /sess-frontdesk-001/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'logs',
            lines: 10,
          },
        },
      });
      const runtimeLogsCall = await readJsonLine(child.stdout);
      const runtimeLogsContent = (runtimeLogsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(runtimeLogsContent[0].type, 'text');
      assert.match(runtimeLogsContent[0].text, /runtime heartbeat ok/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'opl_task_status',
          arguments: {
            task_id: 'task-frontdesk-001',
          },
        },
      });
      const toolCall = await readJsonLine(child.stdout);
      const content = (toolCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(content[0].type, 'text');
      assert.match(content[0].text, /任务状态：运行中/);
      assert.match(content[0].text, /当前阶段：撰写中/);
      assert.doesNotMatch(content[0].text, /任务状态：running/);
      assert.doesNotMatch(content[0].text, /当前阶段：writing/);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/workspaces/activate'
        && request.body?.project_id === 'medautoscience'
        && request.body?.workspace_path === activatedWorkspacePath
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions'
        && request.query.limit === '3'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions/logs'
        && request.query.lines === '10'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/progress'
        && request.query.task_id === 'task-frontdesk-001'
      ), true);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});

test('session runtime --acp exposes a callable stdio bridge entry for external shells', async () => {
  const child = spawn(
    process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'session',
        'runtime',
        '--acp',
      ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      id: 'bridge-init-1',
      command: 'initialize',
    });
    const initialize = await readJsonLine(child.stdout);
    assert.equal(initialize.id, 'bridge-init-1');
    assert.equal(initialize.command, 'initialize');
    assert.equal(initialize.ok, true);
    assert.equal((initialize.result as { surface_id: string }).surface_id, 'opl_acp_stdio_bridge');

    writeJsonLine(child.stdin, {
      id: 'bridge-create-1',
      command: 'session_create',
      payload: {
        version: 'g2',
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: 'submitted',
          payload: {
            product_entry: {
              entry_surface: 'opl_session_api',
              mode: 'ask',
              seed: {
                session_id: 'sess-bridge-1',
              },
              task: {
                task_id: 'task-bridge-1',
                status: 'accepted',
                stage: 'queued',
                summary: 'request accepted',
                executor_backend: 'codex',
                session_id: null,
              },
            },
          },
        },
      },
    });
    const created = await readJsonLine(child.stdout);
    assert.equal(created.id, 'bridge-create-1');
    assert.equal(created.command, 'session_create');
    assert.equal(created.ok, true);
    assert.equal((created.result as { session_id: string }).session_id, 'sess-bridge-1');
    assert.equal(
      (created.result as { task_acceptance: { task_id: string } }).task_acceptance.task_id,
      'task-bridge-1',
    );
  } finally {
    await stopCliPipeChild(child);
  }
});

test('session runtime --acp supports ACP JSON-RPC lifecycle with prompt streaming and pollable session updates', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
EOF
  sleep 1
  cat <<'EOF'
{"item":{"type":"agent_message","text":"ACP HELLO FROM CODEX"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_CODEX_BIN: codexPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
      },
    });
    const initialize = await readJsonLine(child.stdout);
    assert.equal(initialize.jsonrpc, '2.0');
    assert.equal(initialize.id, 1);
    assert.equal((initialize.result as { protocolVersion: number }).protocolVersion, 1);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
        mcpServers: [],
      },
    });
    const sessionCreated = await readJsonLine(child.stdout);
    const bridgeSessionId = (sessionCreated.result as { sessionId: string }).sessionId;
    assert.match(bridgeSessionId, /^opl-acp-session-/);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 22,
      method: 'session/set_mode',
      params: {
        sessionId: bridgeSessionId,
        modeId: 'default',
      },
    });
    const setModeResponse = await readJsonLine(child.stdout);
    assert.equal(setModeResponse.id, 22);
    assert.equal((setModeResponse.result as { modes: { currentModeId: string } }).modes.currentModeId, 'default');

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'Say hello from the OPL ACP bridge.' }],
      },
    });

    const notifications: Array<Record<string, unknown>> = [];
    let promptResponse: Record<string, unknown> | null = null;
    while (!promptResponse) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 3) {
        promptResponse = message;
        break;
      }
      notifications.push(message);
    }

    assert.equal(promptResponse.result.stopReason, 'end_turn');
    assert.equal(
      notifications.some((entry) => entry.method === 'session/update'),
      true,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('OPL ACP 正在通过 Codex 默认运行时处理当前会话请求。')),
      false,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('Codex 已接管任务，会话 opl-acp-thread-1 已创建。')),
      false,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('Codex 正在读取上下文并规划下一步。')),
      false,
    );

    writeJsonLine(child.stdin, {
      id: 'bridge-updates-1',
      command: 'session_updates',
      payload: {
        session_id: bridgeSessionId,
      },
    });
    const updates = await readJsonLine(child.stdout);
    assert.equal(updates.ok, true);
    assert.equal((updates.result as { session_id: string }).session_id, bridgeSessionId);
    assert.equal(
      ((updates.result as { updates: Array<{ text: string }> }).updates).some((entry) =>
        /ACP HELLO FROM CODEX/.test(entry.text)
      ),
      true,
    );

    writeJsonLine(child.stdin, {
      id: 'bridge-list-1',
      command: 'session_list',
      payload: {
        limit: 5,
      },
    });
    const listed = await readJsonLine(child.stdout);
    assert.equal(listed.ok, true);
    assert.equal(
      ((listed.result as { items: Array<{ session_id: string }> }).items).some((entry) =>
        entry.session_id === bridgeSessionId
      ),
      true,
    );
  } finally {
    await stopCliPipeChild(child);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('session runtime --acp loads existing bridge sessions and routes follow-up prompts through codex exec resume', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "\${2:-}" = "resume" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP RESUME TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP INITIAL TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_CODEX_BIN: codexPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
      },
    });
    await readJsonLine(child.stdout);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
      },
    });
    const created = await readJsonLine(child.stdout);
    const bridgeSessionId = (created.result as { sessionId: string }).sessionId;

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'First turn' }],
      },
    });
    while (true) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 3) {
        break;
      }
    }

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'session/load',
      params: {
        sessionId: bridgeSessionId,
        cwd: repoRoot,
      },
    });
    const loaded = await readJsonLine(child.stdout);
    assert.equal((loaded.result as { sessionId: string }).sessionId, bridgeSessionId);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 5,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'Follow-up turn' }],
      },
    });

    let resumedPrompt: Record<string, unknown> | null = null;
    const resumedNotifications: Array<Record<string, unknown>> = [];
    while (!resumedPrompt) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 5) {
        resumedPrompt = message;
        break;
      }
      resumedNotifications.push(message);
    }

    assert.equal(resumedPrompt.result.stopReason, 'end_turn');
    assert.equal(
      resumedNotifications.some((entry) =>
        JSON.stringify(entry).includes('ACP RESUME TURN')
      ),
      true,
    );
  } finally {
    await stopCliPipeChild(child);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('session runtime --acp fails closed for unsupported ACP methods', async () => {
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
      params: {},
    });
    const response = await readJsonLine(child.stdout);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    assert.equal((response.error as { code: number }).code, -32601);
  } finally {
    await stopCliPipeChild(child);
  }
});

test('mcp-stdio defaults to the current shell protocol version when the client does not negotiate one', async () => {
  const fakeApi = await startFakeOplApiServer();

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    try {
      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal((initialize.result as { protocolVersion: string }).protocolVersion, '2025-03-26');
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});

test('help keeps the repo-tracked GUI lane on web adapter and service surfaces', () => {
  const output = runCli(['help']);
  const web = output.help.commands.find((entry: { command: string }) => entry.command === 'web');

  assert.ok(web);
  assert.match(web.summary, /service/i);
  assert.match(web.summary, /GUI/i);
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web package'),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
    false,
  );
});

test('system exposes user-facing engine and managed-path status from OPL defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex 0.42.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    ) as {
      system: {
        surface_id: string;
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            config_path: string | null;
            default_model: string | null;
            default_reasoning_effort: string | null;
            provider_base_url: string | null;
            health_status: string;
          };
          hermes: {
            installed: boolean;
            version: string | null;
            gateway_loaded: boolean;
            health_status: string;
          };
        };
        local_service: {
          service_installed: boolean;
          service_loaded: boolean;
          service_health: string;
          gui_shell_strategy: string;
        };
        managed_paths: {
          state_dir: string;
          modules_root: string;
          runtime_modes_file: string;
          workspace_registry_file: string;
        };
      };
    };

    assert.equal(output.system.surface_id, 'opl_system');
    assert.equal(output.system.overall_status, 'ready');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex 0.42.0');
    assert.equal(
      output.system.core_engines.codex.config_path,
      codexConfigFixture.configPath,
    );
    assert.equal(output.system.core_engines.codex.default_model, 'gpt-5.4-opl');
    assert.equal(output.system.core_engines.codex.default_reasoning_effort, 'high');
    assert.equal(
      output.system.core_engines.codex.provider_base_url,
      'https://codex-opl.example.test/v1',
    );
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.equal(output.system.core_engines.hermes.installed, true);
    assert.equal(output.system.core_engines.hermes.version, 'Hermes 1.2.3');
    assert.equal(output.system.core_engines.hermes.gateway_loaded, true);
    assert.equal(output.system.core_engines.hermes.health_status, 'ready');
    assert.equal(output.system.local_service.service_installed, false);
    assert.equal(output.system.local_service.service_loaded, false);
    assert.equal(output.system.local_service.service_health, 'not_installed');
    assert.equal(output.system.local_service.gui_shell_strategy, 'external_overlay');
    assert.match(
      output.system.managed_paths.state_dir,
      /Library\/Application Support\/OPL\/frontdesk$/,
    );
    assert.match(
      output.system.managed_paths.modules_root,
      /Library\/Application Support\/OPL\/frontdesk\/modules$/,
    );
    assert.match(
      output.system.managed_paths.runtime_modes_file,
      /runtime-modes\.json$/,
    );
    assert.match(
      output.system.managed_paths.workspace_registry_file,
      /workspace-registry\.json$/,
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize aggregates environment modules settings workspace and system surfaces', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex 0.42.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateDir,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    ) as {
      system_initialize: {
        surface_id: string;
        overall_state: string;
        core_engines: {
          codex: { installed: boolean };
          hermes: { installed: boolean };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
        }>;
        domain_modules: {
          summary: {
            installed_modules_count: number;
            total_modules_count: number;
          };
          modules_root: string;
          notes: string[];
          modules: Array<{ module_id: string }>;
        };
        settings: {
          interaction_mode: string;
          execution_mode: string;
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
        system: {
          update_channel: string;
          local_service: {
            service_health: string;
          };
        };
        endpoints: {
          system_initialize: string;
          system: string;
          modules: string;
          settings: string;
          engine_action: string;
          workspace_root: string;
          system_action: string;
        };
        recommended_next_action: {
          action_id: string;
          label: string;
          method: string;
          request_fields: string[];
        };
      };
    };

    assert.equal(output.system_initialize.surface_id, 'opl_system_initialize');
    assert.match(output.system_initialize.overall_state, /ready|attention_needed/);
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(output.system_initialize.core_engines.hermes.installed, true);
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'workspace_root' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'codex' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'domain_modules' && !entry.required),
      true,
    );
    assert.equal(output.system_initialize.domain_modules.summary.total_modules_count >= 4, true);
    assert.equal(
      output.system_initialize.domain_modules.summary.total_modules_count,
      output.system_initialize.domain_modules.modules.length,
    );
    assert.equal(output.system_initialize.domain_modules.summary.installed_modules_count >= 0, true);
    assert.equal(output.system_initialize.domain_modules.modules.length >= 4, true);
    assert.equal(output.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(output.system_initialize.settings.execution_mode, 'codex');
    assert.equal(output.system_initialize.workspace_root.selected_path, workspaceRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.system.update_channel, 'stable');
    assert.equal(output.system_initialize.system.local_service.service_health, 'not_installed');
    assert.match(output.system_initialize.endpoints.system_initialize, /\/api\/opl\/system\/initialize$/);
    assert.match(output.system_initialize.endpoints.system, /\/api\/opl\/system$/);
    assert.match(output.system_initialize.endpoints.modules, /\/api\/opl\/modules$/);
    assert.match(output.system_initialize.endpoints.settings, /\/api\/opl\/system\/settings$/);
    assert.match(output.system_initialize.endpoints.engine_action, /\/api\/opl\/engines\/actions$/);
    assert.match(output.system_initialize.endpoints.workspace_root, /\/api\/opl\/workspaces\/root$/);
    assert.match(output.system_initialize.endpoints.system_action, /\/api\/opl\/system\/actions$/);
    assert.ok(output.system_initialize.recommended_next_action.action_id.length > 0);
    assert.ok(output.system_initialize.recommended_next_action.label.length > 0);
    assert.equal(output.system_initialize.recommended_next_action.method, 'GET');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system initialize exposes first-run blocker metadata and actionable payload hints', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-first-run-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
        PATH: '/usr/bin:/bin',
      },
    ) as {
      system_initialize: {
        overall_state: string;
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          action: {
            action_id: string;
            method: string;
            request_fields: string[];
          } | null;
        }>;
        recommended_next_action: {
          action_id: string;
          method: string;
          request_fields: string[];
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'attention_needed');
    assert.equal(output.system_initialize.workspace_root.selected_path, null);
    assert.equal(output.system_initialize.workspace_root.health_status, 'missing');
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'set_workspace_root');
    assert.equal(output.system_initialize.recommended_next_action.method, 'POST');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, ['path']);

    const workspaceRootItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'workspace_root');
    const codexItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'codex');

    assert.ok(workspaceRootItem);
    assert.ok(codexItem);
    assert.equal(workspaceRootItem.required, true);
    assert.equal(workspaceRootItem.blocking, true);
    assert.equal(workspaceRootItem.action?.action_id, 'set_workspace_root');
    assert.equal(workspaceRootItem.action?.method, 'POST');
    assert.deepEqual(workspaceRootItem.action?.request_fields, ['path']);
    assert.equal(codexItem.required, true);
    assert.equal(codexItem.blocking, true);
    assert.equal(codexItem.action?.action_id, 'install_or_configure_codex');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('engine action executes env-overridden install commands and returns a structured action surface', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-action-'));
  const markerPath = path.join(fixtureRoot, 'codex-install.marker');
  const installScript = path.join(fixtureRoot, 'install-codex.sh');

  fs.writeFileSync(
    installScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(markerPath)}`,
      'echo "codex install fixture completed"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      ['engine', 'install', '--engine', 'codex'],
      {
        OPL_CODEX_INSTALL_COMMAND: installScript,
      },
    ) as {
      engine_action: {
        engine_id: string;
        action: string;
        status: string;
        command_preview: string[];
        system: {
          surface_id: string;
          core_engines: {
            codex: {
              installed: boolean;
            };
          };
        };
      };
    };

    assert.equal(output.engine_action.engine_id, 'codex');
    assert.equal(output.engine_action.action, 'install');
    assert.equal(output.engine_action.status, 'completed');
    assert.deepEqual(output.engine_action.command_preview, [installScript]);
    assert.equal('frontdesk_environment' in output.engine_action, false);
    assert.equal(output.engine_action.system.surface_id, 'opl_system');
    assert.equal(output.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace root set persists the selected root and workspace root reads it back', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const setOutput = runCli(
      ['workspace', 'root', 'set', '--path', workspaceRoot],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(setOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(setOutput.workspace_root.health_status, 'ready');

    const readOutput = runCli(
      ['workspace', 'root'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(readOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(readOutput.workspace_root.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system update-channel reports and persists the selected release channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-channel-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'update-channel'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(initial.system_action.action, 'update_channel');
    assert.equal(initial.system_action.update_channel, 'stable');
    assert.equal(initial.system_action.status, 'ready');

    const updated = runCli(
      ['system', 'update-channel', '--channel', 'preview'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(updated.system_action.action, 'update_channel');
    assert.equal(updated.system_action.update_channel, 'preview');
    assert.equal(updated.system_action.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
test('modules and module actions manage OPL-owned domain module installs and updates', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-modules-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience');
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
  };

  try {
    const initial = runCli(['modules'], env) as {
      modules: {
        summary: {
          total_modules_count: number;
          installed_modules_count: number;
        };
        items: Array<{
          module_id: string;
          installed: boolean;
          install_origin: string;
          available_actions: string[];
        }>;
      };
    };
    assert.equal(initial.modules.summary.total_modules_count >= 4, true);
    const initialMas = initial.modules.items.find((entry) => entry.module_id === 'medautoscience');
    assert.ok(initialMas);
    assert.equal(initialMas.installed, false);
    assert.equal(initialMas.install_origin, 'missing');
    assert.equal(initialMas.available_actions.includes('install'), true);

    const install = runCli(
      ['module', 'install', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          module_id: string;
          installed: boolean;
          install_origin: string;
          checkout_path: string;
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.module_id, 'medautoscience');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(
      install.module_action.module.git.head_sha,
      medAutoScienceRemote.getHeadSha(),
    );
    assert.equal(
      fs.existsSync(path.join(install.module_action.module.checkout_path, 'README.md')),
      true,
    );

    const nextSha = medAutoScienceRemote.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Added module update test\n',
      'Advance module remote',
    );
    const update = runCli(
      ['module', 'update', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(update.module_action.action, 'update');
    assert.equal(update.module_action.status, 'completed');
    assert.equal(update.module_action.module.git.head_sha, nextSha);

    const remove = runCli(
      ['module', 'remove', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          installed: boolean;
          checkout_path: string;
        };
      };
    };
    assert.equal(remove.module_action.action, 'remove');
    assert.equal(remove.module_action.status, 'completed');
    assert.equal(remove.module_action.module.installed, false);
    assert.equal(fs.existsSync(remove.module_action.module.checkout_path), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('help keeps web adapter and service commands as the default GUI lane', () => {
  const output = runCli(['help']);
  const web = output.help.commands.find((entry: { command: string }) => entry.command === 'web');

  assert.ok(web);
  assert.match(web.summary, /service/i);
  assert.match(web.summary, /GUI/i);
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web package'),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
    false,
  );
});
