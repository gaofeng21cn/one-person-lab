import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';
import { buildDomainManifestCatalog } from '../../../../src/management/domain-manifest-catalog.ts';
import { buildCurrentDashboardSurfaceRefs, buildCurrentReadinessProjection } from '../../../../src/management/readiness.ts';
import { buildOplDashboard } from '../../../../src/management/runtime-dashboard.ts';
import { buildWorkspaceCatalog } from '../../../../src/workspace-registry.ts';

test('public and internal command specs no longer carry removed UI adapter command ids', () => {
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

  assert.equal(
    Object.keys(internalSpecs).some((key) => key.includes('frontdoor')),
    false,
  );

  const publicSpecs = buildPublicCommandSpecs(internalSpecs, () => contracts);
  assert.equal(
    Object.keys(publicSpecs).some((key) => key.includes('frontdoor')),
    false,
  );
  assert.equal(typeof publicSpecs.system.handler, 'function');
  assert.equal(publicSpecs['web bundle'], undefined);
  assert.equal(publicSpecs['web package'], undefined);
  assert.equal(typeof publicSpecs['module install'].handler, 'function');
  assert.equal(typeof publicSpecs['engine install'].handler, 'function');
  assert.equal(publicSpecs['service install'], undefined);
});

test('current readiness projection is derived from current OPL surfaces', () => {
  const contracts = loadGatewayContracts({ contractsDir });
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-current-readiness-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;

  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
    const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
    const readiness = buildCurrentReadinessProjection(domainManifests.projects, workspaceCatalog);
    const refs = buildCurrentDashboardSurfaceRefs();

    assert.equal(readiness.surface_id, 'opl_current_readiness_projection');
    assert.equal(readiness.summary.total_projects_count, 3);
    assert.equal(readiness.projects.length, 3);
    assert.equal(readiness.domain_binding_parity.summary.total_projects_count, 3);
    assert.equal(refs.entry_guide_surface.command, 'opl start --project <project_id>');
    assert.equal(refs.readiness_surface.command, 'opl status dashboard');
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('status dashboard aggregates current OPL management surfaces into one view', () => {
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
    const previousEnv = {
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
      OPL_HERMES_BIN: process.env.OPL_HERMES_BIN,
      PATH: process.env.PATH,
    };

    let directDashboard: ReturnType<typeof buildOplDashboard> | null = null;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      process.env.OPL_HERMES_BIN = hermesPath;
      process.env.PATH = `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`;
      directDashboard = buildOplDashboard(loadGatewayContracts({ contractsDir }), {
        workspacePath: repoRoot,
        sessionsLimit: 1,
      });
    } finally {
      if (previousEnv.OPL_STATE_DIR === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousEnv.OPL_STATE_DIR;
      }
      if (previousEnv.OPL_HERMES_BIN === undefined) {
        delete process.env.OPL_HERMES_BIN;
      } else {
        process.env.OPL_HERMES_BIN = previousEnv.OPL_HERMES_BIN;
      }
      if (previousEnv.PATH === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousEnv.PATH;
      }
    }

    assert.equal(output.version, 'g2');
    assert.equal(directDashboard?.dashboard.gui_runtime.entry_guide_surface.surface_id, 'opl_current_entry_guide');
    assert.equal(output.dashboard.gui_runtime.direct_entry_command, 'opl');
    assert.equal(output.dashboard.gui_runtime.local_web_status, 'retired');
    assert.equal(output.dashboard.gui_runtime.local_web_command, null);
    assert.equal(output.dashboard.gui_runtime.desktop_shell_status, 'aionui_shell');
    assert.equal(output.dashboard.gui_runtime.desktop_default_entry_status, 'release_or_installed_app');
    assert.equal(output.dashboard.gui_runtime.recommended_entry_surfaces_count, 0);
    assert.deepEqual(output.dashboard.gui_runtime.recommended_entry_surfaces, []);
    assert.equal(output.dashboard.gui_runtime.hosted_runtime_readiness.status, 'retired');
    assert.equal(output.dashboard.gui_runtime.entry_guide_surface.surface_id, 'opl_current_entry_guide');
    assert.equal(output.dashboard.gui_runtime.readiness_surface.surface_id, 'opl_current_readiness_projection');
    assert.equal('hosted_web_status' in output.dashboard.gui_runtime, false);
    assert.equal(output.dashboard.projects.length, 4);
    assert.equal(output.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(output.dashboard.domain_manifests.summary.resolved_count, 0);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.recent_sessions.sessions.length, 1);
    assert.deepEqual(output.dashboard.gui_runtime.rollout_board_refs, [
      'docs/references/family-lightweight-direct-entry-rollout-board.md',
      'docs/references/mas-top-level-cutover-board.md',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help excludes retired local web adapter command surface', () => {
  const output = runCli(['help']);

  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web'), false);
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system initialize'),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
    false,
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'modules'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'domain launch'),
  );

  const scoped = runCli(['web', '--help']) as { help: { command: string; summary: string } };
  assert.equal(scoped.help.command, 'web');
  assert.match(scoped.help.summary, /Retired/);
});

test('help advertises initialize and environment management command surfaces', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system initialize'), true);
  assert.equal(commands.includes('engine install'), true);
  assert.equal(commands.includes('system repair'), true);
  assert.equal(commands.includes('system reinstall-support'), false);
  assert.equal(commands.includes('system update-channel'), true);
  assert.equal(commands.includes('modules'), true);
  assert.equal(commands.includes('module install'), true);
  assert.equal(commands.includes('workspace root'), true);
  assert.equal(commands.includes('workspace root set'), true);
  assert.equal(commands.includes('workspace root doctor'), true);
});

test('help keeps JSON output available through explicit flag for machine readers', () => {
  const root = runCli(['help', '--json']);
  assert.equal(root.help.usage, 'opl [command ...|request...] [args]');

  const scoped = runCli(['help', 'install', '--json']);
  assert.equal(scoped.help.command, 'install');
  assert.match(scoped.help.summary, /One-shot install/);
});

test('help supports explicit text output for human readers', () => {
  const root = runCliRaw(['help', '--text']);
  assert.match(root.stdout, /One Person Lab \(OPL\)/);
  assert.match(root.stdout, /Fast start:/);
  assert.match(root.stdout, /opl install/);

  const scoped = runCliRaw(['help', 'install', '--text']);
  assert.match(scoped.stdout, /One Person Lab command: install/);
  assert.match(scoped.stdout, /One-shot install/);
});

test('removed UI adapter command surfaces are not retained as compatibility aliases', () => {
  const removedUiAdapterPrefix = ['front', 'desk'].join('');
  const removedCommandShapes = [
    ['environment'],
    ['initialize'],
    ['modules'],
    ['module', 'install', '--module', 'medautoscience'],
    ['engine', 'install', '--engine', 'codex'],
    ['repair'],
    ['entry-guide'],
    ['domain-wiring'],
    ['readiness'],
    ['hosted-bundle'],
    ['hosted-package'],
  ] as const;

  for (const args of removedCommandShapes.map((shape) => [removedUiAdapterPrefix, ...shape])) {
    const { status, payload } = runCliFailure(args);
    assert.equal(status, 2);
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, removedUiAdapterPrefix);
  }
});

test('public service commands are retired from the default CLI surface', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  for (const command of [
    'service install',
    'service status',
    'service start',
    'service stop',
    'service open',
    'service uninstall',
  ]) {
    assert.equal(commands.includes(command), false);
  }
});
test('web bundle and web package commands are retired from the public CLI', () => {
  const bundle = runCli(['web', 'bundle']) as { error: { code: string; details: { command: string; retired: boolean } } };
  assert.equal(bundle.error.code, 'cli_usage_error');
  assert.equal(bundle.error.details.command, 'web');
  assert.equal(bundle.error.details.retired, true);

  const pack = runCli(['web', 'package']) as { error: { code: string; details: { command: string; retired: boolean } } };
  assert.equal(pack.error.code, 'cli_usage_error');
  assert.equal(pack.error.details.command, 'web');
  assert.equal(pack.error.details.retired, true);
});
