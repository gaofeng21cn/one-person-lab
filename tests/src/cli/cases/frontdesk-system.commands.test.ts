import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';

test('public command specs no longer depend on legacy frontdesk command ids', () => {
  const contracts = loadGatewayContracts({ contractsDir });
  const internalSpecs = buildInternalCommandSpecs(
    {
      helpRequested: false,
      command: null,
      args: [],
      loadOptions: { contractsDir },
    },
    () => contracts,
  );

  for (const key of [
    'frontdesk hosted-bundle',
    'frontdesk hosted-package',
    'frontdesk environment',
    'frontdesk initialize',
    'frontdesk repair',
    'frontdesk reinstall-support',
    'frontdesk update-channel',
    'frontdesk modules',
    'frontdesk-module-install',
    'frontdesk-module-update',
    'frontdesk-module-reinstall',
    'frontdesk-module-remove',
    'frontdesk engine install',
    'frontdesk engine update',
    'frontdesk engine reinstall',
    'frontdesk engine remove',
    'frontdesk-service-install',
    'frontdesk-service-status',
    'frontdesk-service-start',
    'frontdesk-service-stop',
    'frontdesk-service-open',
    'frontdesk-service-uninstall',
  ]) {
    delete internalSpecs[key];
  }

  const publicSpecs = buildPublicCommandSpecs(internalSpecs, () => contracts);
  assert.equal(typeof publicSpecs.system.handler, 'function');
  assert.equal(typeof publicSpecs['web bundle'].handler, 'function');
  assert.equal(typeof publicSpecs['module install'].handler, 'function');
  assert.equal(typeof publicSpecs['engine install'].handler, 'function');
  assert.equal(typeof publicSpecs['service install'].handler, 'function');
});

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
      OPL_STATE_DIR: stateRoot,
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
