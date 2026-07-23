import {
  assert,
  fs,
  os,
  path,
  runCliAsync,
  test,
} from './helpers.ts';
import { buildPackagesCommandSpecs } from '../../../../../src/entrypoints/cli/cases/public-command-specs-parts/packages.ts';
import {
  buildRootHelp,
  type CommandSpec,
} from '../../../../../src/entrypoints/cli/modules/support.ts';

const commandSpecs = (() => {
  const specs: Record<string, CommandSpec> = {};
  Object.assign(
    specs,
    buildPackagesCommandSpecs(
      () => {
        throw new Error('package command surface test must not load Framework contracts');
      },
      (command) => specs[command],
    ),
  );
  return specs;
})();

test('package help surface keeps lifecycle commands ordinary and routes internals to diagnostics', () => {
  const ordinaryCommands = Object.entries(commandSpecs)
    .filter(([, spec]) => spec.help_surface === 'default')
    .map(([command]) => command);
  const diagnosticCommands = Object.entries(commandSpecs)
    .filter(([, spec]) => spec.help_surface === 'diagnostic_drilldown')
    .map(([command]) => command);
  const defaultHelpCommands = buildRootHelp(commandSpecs).help.commands
    .map((entry) => entry.command);

  assert.deepEqual(ordinaryCommands, [
    'packages list',
    'packages install',
    'packages update',
    'packages enable',
    'packages disable',
    'packages repair',
    'packages rollback',
    'packages uninstall',
  ]);
  assert.deepEqual(defaultHelpCommands, ordinaryCommands);
  assert.deepEqual(diagnosticCommands, [
    'packages status',
    'packages registry refresh',
    'packages validate-manifest',
    'packages link-framework',
    'packages hide',
    'packages unhide',
    'packages preferences set',
    'packages optimize',
    'packages profile apply',
  ]);
  assert.equal(commandSpecs['packages activate']?.help_surface, 'migration_compatibility');
});

test('legacy package activate invocation remains parseable and returns a dry-run compatibility result', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-command-surface-state-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-command-surface-workspace-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-command-surface-home-'));

  try {
    const result = await runCliAsync([
      'packages',
      'activate',
      'legacy.package',
      '--scope',
      'workspace',
      '--target-workspace',
      workspace,
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateDir,
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
    }) as {
      opl_agent_package_activation: {
        status: string;
        package_id: string;
        writes_performed: boolean;
        launch_blocked_reason: string | null;
      };
    };

    assert.equal(result.opl_agent_package_activation.status, 'validated_no_write');
    assert.equal(result.opl_agent_package_activation.package_id, 'legacy.package');
    assert.equal(result.opl_agent_package_activation.writes_performed, false);
    assert.equal(result.opl_agent_package_activation.launch_blocked_reason, 'package_not_installed');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
