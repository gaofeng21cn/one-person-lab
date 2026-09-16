import { FrameworkContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadFrameworkContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateFrameworkContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/entrypoints/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/entrypoints/cli/cases/public-command-specs.ts';
import { createCordisBaseHeadlessComposition } from '../../../../src/host/composition-profiles.ts';
import {
  familyStageDiagnosticLensCommands,
  familyStageDerivedLensByCommand,
} from '../../../../src/authority/stages/family-stage-derived-lenses.ts';
import { buildDomainManifestCatalog } from '../../../../src/read-models/catalog/domain-manifest/catalog-builder.ts';
import { buildCurrentDashboardSurfaceRefs, buildCurrentReadinessProjection } from '../../../../src/read-models/operator/management/readiness.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../src/kernel/standard-agent-registry.ts';
import { buildOplDashboard } from '../../../../src/read-models/operator/management/runtime-dashboard.ts';
import { buildWorkspaceCatalog } from '../../../../src/authority/workspace/workspace-registry.ts';
import {
  parseWorkspaceAdoptArgs,
  parseWorkspaceArtifactLifecycleArgs,
  parseWorkspaceInitializeArgs,
  parseWorkspaceLifecycleArgs,
  parseWorkspaceSourceIngestArgs,
  parseWorkspaceValidationArgs,
} from '../../../../src/entrypoints/cli/modules/support.ts';

const workspaceParserSpec = {
  usage: 'opl workspace test',
  examples: ['opl workspace test'],
};

async function withCordisCommandSpecs<T>(
  contracts: ReturnType<typeof loadFrameworkContracts>,
  run: (
    internalSpecs: ReturnType<typeof buildInternalCommandSpecs>,
    publicSpecs: ReturnType<typeof buildPublicCommandSpecs>,
  ) => T | Promise<T>,
) {
  const composition = await createCordisBaseHeadlessComposition();
  try {
    const parsedInput = {
      helpRequested: false,
      jsonOutput: true,
      textOutput: false,
      command: null,
      args: [],
      loadOptions: { contractsDir },
    };
    const internalSpecs = buildInternalCommandSpecs(
      parsedInput,
      () => contracts,
      composition,
    );
    const publicSpecs = buildPublicCommandSpecs(
      internalSpecs,
      () => contracts,
      composition,
    );
    return await run(internalSpecs, publicSpecs);
  } finally {
    await composition.dispose();
  }
}

test('workspace parsers preserve aliases, field mappings, and inline option values', () => {
  assert.deepEqual(parseWorkspaceInitializeArgs([
    '--agent=rca',
    '--workspace-path=/tmp/workspace',
    '--deliverable-id=deliverable-1',
    '--mode=series',
    '--dry-run',
    '--no-bind',
    '--force',
  ], workspaceParserSpec), {
    agentId: 'rca',
    workspacePath: '/tmp/workspace',
    projectId: 'deliverable-1',
    mode: 'series',
    bind: false,
    dryRun: true,
    force: true,
  });
  assert.equal(parseWorkspaceValidationArgs(['--workspace=/tmp/validated'], workspaceParserSpec).workspacePath, '/tmp/validated');
  assert.deepEqual(parseWorkspaceAdoptArgs([
    '--agent=mas',
    '--workspace-path=/tmp/adopt',
    '--study-id=study-1',
    '--mode=portfolio',
    '--apply',
  ], workspaceParserSpec), {
    agentId: 'mas',
    workspacePath: '/tmp/adopt',
    projectId: 'study-1',
    mode: 'portfolio',
    apply: true,
  });
  assert.equal(parseWorkspaceLifecycleArgs([
    '--workspace=/tmp/lifecycle', '--study-id=study-2', '--status=paused', '--superseded-by-project-id=study-3',
  ], workspaceParserSpec).supersededByProjectId, 'study-3');
  assert.equal(parseWorkspaceArtifactLifecycleArgs([
    '--workspace-path=/tmp/artifacts', '--project-id=project-1', '--dry-run',
  ], workspaceParserSpec).dryRun, true);
  assert.deepEqual(parseWorkspaceSourceIngestArgs([
    '--workspace-path=/tmp/source', '--source-file=/tmp/source.pdf', '--role=reference_design', '--apply',
  ], workspaceParserSpec), {
    apply: true,
    workspacePath: '/tmp/source',
    filePath: '/tmp/source.pdf',
    role: 'reference_design',
  });
});

test('workspace parsers keep parseArgs duplicate, unknown, and missing-option semantics', () => {
  assert.equal(
    parseWorkspaceValidationArgs([
      '--workspace-path=/tmp/alias',
      '--workspace=/tmp/final',
      '--workspace=/tmp/last',
    ], workspaceParserSpec).workspacePath,
    '/tmp/last',
  );

  for (const args of [['--unknown=value'], ['--workspace']]) {
    assert.throws(
      () => parseWorkspaceValidationArgs(args, workspaceParserSpec),
      (error) => {
        assert.equal(error instanceof FrameworkContractError, true);
        const usageError = error as FrameworkContractError;
        assert.equal(usageError.code, 'cli_usage_error');
        assert.equal(usageError.details?.parser_adapter, 'node_util_parse_args');
        return true;
      },
    );
  }
});

test('workspace parsers retain mode and status validation after parseArgs migration', () => {
  const cases: Array<{
    parse: (args: string[], spec: typeof workspaceParserSpec) => unknown;
    args: string[];
    message: RegExp;
  }> = [
    { parse: parseWorkspaceInitializeArgs, args: ['--mode=invalid'], message: /workspace init --mode requires/ },
    { parse: parseWorkspaceLifecycleArgs, args: ['--status=invalid'], message: /Workspace lifecycle --status requires/ },
  ];
  for (const { parse, args, message } of cases) {
    assert.throws(() => parse(args, workspaceParserSpec), (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const usageError = error as FrameworkContractError;
      assert.equal(usageError.code, 'cli_usage_error');
      assert.match(usageError.message, message);
      assert.equal(usageError.details?.option, args[0]!.split('=', 1)[0]);
      return true;
    });
  }
});

test('workspace parsers retain dry-run and apply precedence and mutual exclusion', () => {
  assert.equal(parseWorkspaceSourceIngestArgs([], workspaceParserSpec).apply, true);
  assert.deepEqual(
    [
      parseWorkspaceSourceIngestArgs(['--dry-run'], workspaceParserSpec).apply,
      parseWorkspaceSourceIngestArgs(['--dry-run', '--apply'], workspaceParserSpec).apply,
      parseWorkspaceSourceIngestArgs(['--apply', '--dry-run'], workspaceParserSpec).apply,
    ],
    [false, true, false],
  );

  for (const parse of [
    parseWorkspaceAdoptArgs,
    parseWorkspaceLifecycleArgs,
    parseWorkspaceArtifactLifecycleArgs,
  ]) {
    assert.throws(
      () => parse(['--dry-run', '--apply'], workspaceParserSpec),
      (error) => {
        assert.equal(error instanceof FrameworkContractError, true);
        const usageError = error as FrameworkContractError;
        assert.equal(usageError.code, 'cli_usage_error');
        assert.deepEqual(usageError.details?.mutually_exclusive, ['--dry-run', '--apply']);
        return true;
      },
    );
  }
});

test('public and internal command specs no longer carry removed UI adapter command ids', async () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  await withCordisCommandSpecs(contracts, (internalSpecs, publicSpecs) => {
    assert.equal(
      Object.keys(internalSpecs).some((key) => key.includes('product entry')),
      false,
    );
    assert.equal(
      Object.keys(publicSpecs).some((key) => key.includes('product entry')),
      false,
    );
    assert.equal(typeof publicSpecs.system.handler, 'function');
    assert.equal(typeof publicSpecs['system docker-webui doctor'].handler, 'function');
    assert.equal(publicSpecs['web bundle'], undefined);
    assert.equal(publicSpecs['web package'], undefined);
    assert.equal(publicSpecs['module install'], undefined);
    assert.equal(typeof publicSpecs['connect install'].handler, 'function');
    assert.equal(typeof publicSpecs['connect sync-skills'].handler, 'function');
    assert.equal(typeof publicSpecs['connect packages manifest'].handler, 'function');
    assert.equal(publicSpecs['connect reconcile-modules'], undefined);
    assert.equal(publicSpecs['system reconcile-modules'], undefined);
    assert.equal(typeof publicSpecs['connect scientific search'].handler, 'function');
    assert.equal(typeof publicSpecs['update status'].handler, 'function');
    assert.equal(typeof publicSpecs['update plan'].handler, 'function');
    assert.equal(typeof publicSpecs['update apply'].handler, 'function');
    assert.equal(typeof publicSpecs['foundry status'].handler, 'function');
    assert.equal(typeof publicSpecs['foundry rollback'].handler, 'function');
    assert.equal(publicSpecs['agents foundry status'], undefined);
    assert.equal(typeof publicSpecs['engine install'].handler, 'function');
    assert.equal(publicSpecs['service install'], undefined);
  });
});

test('current readiness projection is derived from current OPL surfaces', () => {
  const contracts = loadFrameworkContracts({ contractsDir });
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
    const registeredTargetDomainIds = STANDARD_AGENT_REGISTRY
      .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
      .map((entry) => entry.domain_id)
      .sort();
    assert.equal(
      readiness.domain_binding_parity.summary.total_projects_count,
      registeredTargetDomainIds.length,
    );
    assert.deepEqual(
      readiness.domain_binding_parity.projects.map((entry) => entry.project_id).sort(),
      registeredTargetDomainIds,
    );
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

test('status dashboard aggregates current OPL management surfaces into one view', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dashboard-state-'));

  try {
    const output = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      PATH: process.env.PATH ?? '',
    });
    const previousEnv = {
      OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    };

    let directDashboard: Awaited<ReturnType<typeof buildOplDashboard>> | null = null;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      directDashboard = await buildOplDashboard(loadFrameworkContracts({ contractsDir }), {
        workspacePath: repoRoot,
        sessionsLimit: 1,
      });
    } finally {
      if (previousEnv.OPL_STATE_DIR === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousEnv.OPL_STATE_DIR;
      }
    }

    assert.equal(output.version, 'g2');
    assert.equal(directDashboard?.dashboard.gui_runtime.entry_guide_surface.surface_id, 'opl_current_entry_guide');
    assert.equal(output.dashboard.gui_runtime.direct_entry_command, 'opl');
    assert.equal(Object.hasOwn(output.dashboard.gui_runtime, 'local_web_status'), false);
    assert.equal(Object.hasOwn(output.dashboard.gui_runtime, 'local_web_command'), false);
    assert.equal(output.dashboard.gui_runtime.desktop_shell_status, 'aionui_shell');
    assert.equal(output.dashboard.gui_runtime.desktop_default_entry_status, 'release_or_installed_app');
    assert.equal(output.dashboard.gui_runtime.recommended_entry_surfaces_count, 0);
    assert.deepEqual(output.dashboard.gui_runtime.recommended_entry_surfaces, []);
    assert.equal(Object.hasOwn(output.dashboard.gui_runtime, 'hosted_runtime_readiness'), false);
    assert.equal(output.dashboard.gui_runtime.entry_guide_surface.surface_id, 'opl_current_entry_guide');
    assert.equal(output.dashboard.gui_runtime.readiness_surface.surface_id, 'opl_current_readiness_projection');
    assert.equal('hosted_web_status' in output.dashboard.gui_runtime, false);
    assert.equal(output.dashboard.projects.length, 4);
    assert.equal(output.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(output.dashboard.domain_manifests.summary.resolved_count, 0);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.configured_provider, 'temporal');
    assert.equal(output.dashboard.runtime_status.managed_session_ledger.sessions.length, 0);
    assert.equal(Object.hasOwn(output.dashboard.runtime_status, 'recent_sessions'), false);
    assert.equal(Object.hasOwn(output.dashboard.runtime_status, 'hermes_diagnostics'), false);

    const explicitTemporalDashboard = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      PATH: process.env.PATH ?? '',
    });
    assert.equal(explicitTemporalDashboard.dashboard.runtime_status.configured_provider, 'temporal');
    assert.equal(explicitTemporalDashboard.dashboard.runtime_status.managed_session_ledger.sessions.length, 0);
    assert.equal(Object.hasOwn(explicitTemporalDashboard.dashboard.runtime_status, 'hermes_diagnostics'), false);
    assert.equal('rollout_board_refs' in output.dashboard.gui_runtime, false);
    assert.deepEqual(output.dashboard.gui_runtime.rollout_board_surfaces, [
      {
        surface_id: 'family_lightweight_direct_entry_rollout_board',
        ref_kind: 'human_doc_surface',
        lifecycle: 'reference',
      },
      {
        surface_id: 'mas_top_level_cutover_board',
        ref_kind: 'human_doc_surface',
        lifecycle: 'reference',
      },
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help excludes retired local web adapter command surface', () => {
  const output = runCli(['help']);

  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web'), false);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'system'), false);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'system initialize'), false);
  assert.equal(
    output.help.diagnostic_command_groups.some((entry: { group_id: string }) => entry.group_id === 'system'),
    true,
  );
  assert.equal(runCli(['help', 'system', 'initialize']).help.command, 'system initialize');
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
    false,
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'connect modules'),
  );
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'domain launch'), false);
  assert.equal(runCli(['help', 'domain', 'launch']).help.command, 'domain launch');

  const { status, payload } = runCliFailure(['web', '--help']);
  assert.equal(status, 2);
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.details.command, 'web');
});

test('default help advertises Connect canonical installation surfaces while retired install commands fail closed', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples.join('\n');

  assert.equal(commands.includes('system initialize'), false);
  assert.equal(commands.includes('engine install'), false);
  assert.equal(commands.includes('system repair'), false);
  assert.equal(commands.includes('system reinstall-support'), false);
  assert.equal(commands.includes('system update'), false);
  assert.equal(commands.includes('system startup-maintenance'), false);
  assert.equal(commands.includes('system docker-webui doctor'), false);
  assert.equal(commands.includes('system reconcile-modules'), false);
  assert.equal(commands.includes('system configure-codex'), false);
  assert.equal(commands.includes('system repair-native-helpers'), false);
  assert.equal(commands.includes('system update-channel'), false);
  assert.equal(commands.includes('system developer-supervisor'), false);
  assert.equal(commands.includes('update status'), true);
  for (const groupId of ['system', 'engine']) {
    assert.equal(
      output.help.diagnostic_command_groups.some((entry: { group_id: string }) => entry.group_id === groupId),
      true,
      groupId,
    );
  }
  assert.equal(runCli(['help', 'system', 'initialize']).help.command, 'system initialize');
  assert.equal(runCli(['help', 'system', 'docker-webui', 'doctor']).help.command, 'system docker-webui doctor');
  assert.equal(runCli(['help', 'engine', 'install']).help.command, 'engine install');
  assert.equal(runCli(['help', 'update', 'status']).help.command, 'update status');
  assert.equal(commands.includes('connect modules'), true);
  assert.equal(commands.includes('connect install'), true);
  assert.equal(commands.includes('connect sync-skills'), true);
  assert.equal(commands.includes('connect scientific search'), true);
  assert.equal(commands.includes('connect packages manifest'), true);
  assert.equal(commands.includes('connect reconcile-modules'), false);
  assert.equal(commands.includes('foundry status'), true);
  assert.equal(commands.includes('foundry approve'), true);
  assert.equal(commands.includes('foundry reject'), true);
  assert.equal(commands.includes('foundry cancel'), true);
  assert.equal(commands.includes('foundry versions'), true);
  assert.equal(commands.includes('foundry rollback'), true);
  assert.equal(commands.includes('agents foundry status'), false);
  assert.equal(commands.includes('profiles list'), true);
  assert.equal(commands.includes('profiles select'), true);
  assert.equal(commands.includes('profiles conformance'), true);
  assert.equal(commands.includes('modules'), false);
  assert.equal(commands.includes('module install'), false);
  assert.equal(commands.includes('skill sync'), false);
  assert.equal(commands.includes('packages manifest'), false);
  assert.match(examples, /opl connect install --module medautoscience/);
  assert.match(examples, /opl connect sync-skills/);
  assert.match(examples, /opl foundry status/);
  assert.match(examples, /opl foundry versions/);
  assert.doesNotMatch(examples, /opl modules/);
  assert.doesNotMatch(examples, /opl packages manifest/);
  assert.doesNotMatch(examples, /opl module install --module medautoscience/);
  assert.doesNotMatch(examples, /opl skill sync/);

  for (const [legacyArgs, replacement] of [
    [['module', 'install'], 'opl connect install'],
    [['skill', 'sync'], 'opl connect sync-skills'],
    [['packages', 'manifest'], 'opl connect packages manifest'],
  ] as const) {
    const scopedHelp = runCliFailure(['help', ...legacyArgs]);
    assert.equal(scopedHelp.status, 2);
    assert.equal(scopedHelp.payload.error.code, 'unknown_command');
    assert.equal(scopedHelp.payload.error.details.command, legacyArgs.join(' '));

    const retiredExecution = runCliFailure([...legacyArgs]);
    assert.equal(retiredExecution.status, 2);
    assert.equal(retiredExecution.payload.error.code, 'cli_usage_error');
    assert.equal(retiredExecution.payload.error.details.replacement, replacement);
  }

  assert.equal(commands.includes('workspace root'), true);
  assert.equal(commands.includes('workspace'), true);
  assert.equal(commands.includes('workspace root set'), true);
  assert.equal(commands.includes('workspace root doctor'), true);
  assert.equal(commands.includes('workspace init'), true);
  assert.equal(commands.includes('workspace validate'), true);
  assert.equal(commands.includes('workspace doctor'), true);
  assert.equal(commands.includes('workspace adopt'), true);
  assert.equal(commands.includes('workspace upgrade'), true);
  assert.equal(commands.includes('workspace project archive'), true);
  assert.equal(commands.includes('workspace project lifecycle'), true);
  assert.equal(commands.includes('workspace project delete'), true);
  assert.equal(commands.includes('workspace fleet report'), true);
  assert.equal(commands.includes('workspace export-map'), true);
  assert.equal(commands.includes('workspace health'), true);
  assert.equal(commands.includes('workspace interfaces'), true);

  const workspaceHelp = runCli(['help', 'workspace']);
  assert.equal(workspaceHelp.help.command, 'workspace');
  assert.match(workspaceHelp.help.usage, /workspace .*ensure/);
  assert.equal(
    workspaceHelp.help.subcommands.some((entry: { command: string }) => entry.command === 'workspace inspect'),
    true,
  );
  assert.equal(
    workspaceHelp.help.subcommands.some((entry: { command: string }) => entry.command === 'workspace fleet report'),
    true,
  );

  const connectHelp = runCli(['help', 'connect']);
  const connectSubcommands = connectHelp.help.subcommands.map((entry: { command: string }) => entry.command);
  assert.equal(connectHelp.help.command, 'connect');
  assert.equal(connectHelp.help.usage, 'opl connect <command>');
  for (const command of [
    'connect status',
    'connect modules',
    'connect install',
    'connect sync-skills',
    'connect packages manifest',
  ]) {
    assert.equal(connectSubcommands.includes(command), true);
  }
  assert.equal(connectSubcommands.includes('modules'), false);
  assert.equal(connectSubcommands.includes('skill sync'), false);
  assert.equal(connectSubcommands.includes('packages manifest'), false);
  assert.equal(connectSubcommands.includes('connect reconcile-modules'), false);

  for (const retired of [
    { args: ['system', 'reconcile-modules'], errorCode: 'cli_usage_error', command: undefined },
    { args: ['connect', 'reconcile-modules'], errorCode: 'unknown_command', command: 'connect' },
    { args: ['module', 'sync'], errorCode: 'unknown_command', command: 'module' },
    { args: ['module', 'reconcile'], errorCode: 'unknown_command', command: 'module' },
  ]) {
    const failure = runCliFailure(retired.args);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, retired.errorCode);
    assert.equal(failure.payload.error.details.command, retired.command);
    assert.equal(failure.payload.error.details.replacement, undefined);
  }
});

test('help keeps JSON output available through explicit flag for machine readers', () => {
  const root = runCli(['help', '--json']);
  assert.equal(root.help.usage, 'opl [command ...|request...] [args]');

  const scoped = runCli(['help', 'install', '--json']);
  assert.equal(scoped.help.command, 'install');
  assert.match(scoped.help.usage, /^opl install/);
});

test('help supports explicit text output for human readers', () => {
  const root = runCliRaw(['help', '--text']);
  assert.match(root.stdout, /One Person Lab \(OPL\)/);
  assert.match(root.stdout, /Fast start:/);
  assert.match(root.stdout, /opl install/);
  assert.match(root.stdout, /opl connect modules/);
  assert.match(root.stdout, /opl stagecraft status/);
  assert.doesNotMatch(root.stdout, /opl stages readiness --family-defaults/);
  assert.doesNotMatch(root.stdout, /opl modules\s+Inspect managed module health/);
  assert.doesNotMatch(root.stdout, /capacity-budget/);

  const stageReadiness = runCliRaw(['help', 'stages', 'readiness', '--text']);
  assert.match(stageReadiness.stdout, /opl stages readiness/);
  assert.doesNotMatch(root.stdout, /domain-validity/);

  const scoped = runCliRaw(['help', 'install', '--text']);
  assert.match(scoped.stdout, /One Person Lab command: install/);
  assert.match(scoped.stdout, /Usage:\n  opl install/);
});

test('default help surface recommends stages readiness and hides diagnostic stage lenses', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples.join('\n');
  const diagnosticStageCommands = [
    ...new Set(familyStageDiagnosticLensCommands()),
  ];
  const forbiddenDefaultEntrypoints = [
    'capacity-budget',
    'domain-validity',
    'guarantee',
    'property',
    'isolation',
  ];

  assert.equal(commands.includes('stages readiness'), false);
  assert.equal(commands.includes('stagecraft status'), true);
  assert.equal(runCli(['help', 'stages', 'readiness']).help.command, 'stages readiness');
  assert.doesNotMatch(examples, /opl stages readiness --family-defaults/);
  for (const forbidden of forbiddenDefaultEntrypoints) {
    assert.doesNotMatch(examples, new RegExp(forbidden));
    assert.equal(commands.includes(`stages ${forbidden}`), false);
  }

  for (const command of diagnosticStageCommands) {
    assert.equal(commands.includes(command), false);
    const scopedHelp = runCli(['help', ...command.split(' ')]);
    assert.equal(scopedHelp.help.command, command);
    assert.match(scopedHelp.help.summary, /Diagnostic drilldown/);
  }

  for (const command of familyStageDiagnosticLensCommands()) {
    assert.equal(familyStageDerivedLensByCommand(command)?.role, 'diagnostic_drilldown');
  }
});

test('public stage diagnostic commands require centralized derived-lens registry declarations', async () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  await withCordisCommandSpecs(contracts, (_internalSpecs, publicSpecs) => {
    const registeredDerivedLensCommands = new Set(familyStageDiagnosticLensCommands());
    const supportDiagnosticCommands = new Set<string>();
    const unregisteredDiagnosticCommands: string[] = [];

    for (const [command, spec] of Object.entries(publicSpecs)) {
      if (
        command.startsWith('stages ')
        && spec.help_surface === 'diagnostic_drilldown'
      ) {
        if (registeredDerivedLensCommands.has(command)) {
          assert.equal(familyStageDerivedLensByCommand(command)?.role, 'diagnostic_drilldown');
        } else if (!supportDiagnosticCommands.has(command)) {
          unregisteredDiagnosticCommands.push(command);
        }
      }
    }

    assert.deepEqual(
      unregisteredDiagnosticCommands,
      [],
      'Public stage diagnostic commands must be registered derived lenses or explicit support diagnostics.',
    );

    for (const command of familyStageDiagnosticLensCommands()) {
      assert.equal(publicSpecs[command]?.help_surface, 'diagnostic_drilldown');
    }
  });
});

test('public stage commands keep readiness as the only default operator surface', async () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  await withCordisCommandSpecs(contracts, (_internalSpecs, publicSpecs) => {
    const defaultStageCommands = Object.entries(publicSpecs)
      .filter(([command, spec]) => command.startsWith('stages ') && spec.help_surface !== 'diagnostic_drilldown')
      .map(([command]) => command);

    assert.deepEqual(defaultStageCommands, [
      'stages list',
      'stages inspect',
      'stages readiness',
    ]);
  });
});

test('public specs do not reintroduce budget and validity lenses as default stage entries', async () => {
  const contracts = loadFrameworkContracts({ contractsDir });
  await withCordisCommandSpecs(contracts, (_internalSpecs, publicSpecs) => {
    for (const command of [
      'stages capacity-budget',
      'stages domain-validity',
      'stages guarantee',
      'stages property',
      'stages isolation',
    ]) {
      assert.equal(publicSpecs[command], undefined, `${command} must not be a public default entrypoint`);
    }
  });
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
test('web bundle and web package commands are removed from the public CLI', () => {
  for (const args of [
    ['web', 'bundle'],
    ['web', 'package'],
  ]) {
    const { status, payload } = runCliFailure(args);
    assert.equal(status, 2);
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, 'web');
  }
});
