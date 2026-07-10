import {
  assert,
  contractsDir,
  fs,
  loadFrameworkContracts,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/entrypoints/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/entrypoints/cli/cases/public-command-specs.ts';
import {
  familyStageDerivedLensByCommand,
  familyStageDiagnosticLensCommands,
} from '../../../../src/modules/stagecraft/family-stage-derived-lenses.ts';
import { buildDomainManifestCatalog } from '../../../../src/modules/atlas/domain-manifest/catalog-builder.ts';
import {
  buildCurrentDashboardSurfaceRefs,
  buildCurrentReadinessProjection,
} from '../../../../src/modules/console/management/readiness.ts';
import { buildWorkspaceCatalog } from '../../../../src/modules/workspace/workspace-registry.ts';

function publicSpecs() {
  const contracts = loadFrameworkContracts({ contractsDir });
  return buildPublicCommandSpecs(
    buildInternalCommandSpecs(
      {
        helpRequested: false,
        jsonOutput: true,
        textOutput: false,
        command: null,
        args: [],
        loadOptions: { contractsDir },
      },
      () => contracts,
    ),
    () => contracts,
  );
}

test('current readiness is derived from current manifests and workspace registry', () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  const readiness = buildCurrentReadinessProjection(
    buildDomainManifestCatalog(contracts).domain_manifests.projects,
    buildWorkspaceCatalog(contracts).workspace_catalog,
  );
  const refs = buildCurrentDashboardSurfaceRefs();

  assert.equal(readiness.surface_id, 'opl_current_readiness_projection');
  assert.equal(readiness.summary.total_projects_count, 3);
  assert.equal(readiness.domain_binding_parity.summary.total_projects_count, 5);
  assert.equal(refs.entry_guide_surface.command, 'opl start --project <project_id>');
  assert.equal(refs.readiness_surface.command, 'opl status dashboard');
});

test('status dashboard keeps current provider and removes stale local runtime fields', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dashboard-state-'));
  try {
    const output = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      PATH: process.env.PATH ?? '',
    });
    const runtime = output.dashboard.runtime_status;
    const gui = output.dashboard.gui_runtime;

    assert.equal(runtime.configured_provider, 'temporal');
    assert.equal(runtime.managed_session_ledger.sessions.length, 0);
    assert.equal(Object.hasOwn(runtime, 'recent_sessions'), false);
    assert.equal(Object.hasOwn(runtime, 'hermes_diagnostics'), false);
    assert.equal(gui.desktop_shell_status, 'aionui_shell');
    assert.equal(Object.hasOwn(gui, 'local_web_status'), false);
    assert.equal(Object.hasOwn(gui, 'hosted_runtime_readiness'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('stage help derives diagnostics from one registry and keeps them out of the default surface', () => {
  const specs = publicSpecs();
  const rootHelp = runCli(['help']);
  const defaultCommands = rootHelp.help.commands.map((entry: { command: string }) => entry.command);
  const diagnosticCommands = familyStageDiagnosticLensCommands();

  for (const command of diagnosticCommands) {
    assert.equal(specs[command]?.help_surface, 'diagnostic_drilldown');
    assert.equal(familyStageDerivedLensByCommand(command)?.role, 'diagnostic_drilldown');
    assert.equal(defaultCommands.includes(command), false);
    assert.equal(runCli(['help', ...command.split(' ')]).help.command, command);
  }

  assert.deepEqual(
    Object.entries(specs)
      .filter(([command, spec]) => command.startsWith('stages ') && spec.help_surface !== 'diagnostic_drilldown')
      .map(([command]) => command),
    ['stages list', 'stages inspect', 'stages readiness'],
  );
  for (const retired of ['web bundle', 'web package', 'service install', 'module install']) {
    assert.equal(specs[retired], undefined, retired);
    assert.equal(defaultCommands.includes(retired), false, retired);
  }
});
