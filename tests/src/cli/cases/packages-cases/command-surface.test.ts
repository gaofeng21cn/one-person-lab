import { assert, test } from './helpers.ts';
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
    'packages uninstall',
  ]);
  assert.deepEqual(defaultHelpCommands, ordinaryCommands);
  assert.deepEqual(diagnosticCommands, [
    'packages status',
    'packages link-framework',
    'packages locate',
    'packages hide',
    'packages unhide',
    'packages preferences set',
  ]);
  assert.equal(commandSpecs['packages activate'], undefined);
  assert.match(commandSpecs['packages install']!.summary, /native carrier/);
  assert.match(commandSpecs['packages install']!.usage, /manifest-url/);
  assert.match(commandSpecs['packages update']!.summary, /native carrier/);
  assert.doesNotMatch(commandSpecs['packages install']!.summary, /Release Set/);
  assert.doesNotMatch(commandSpecs['packages update']!.summary, /Release Set/);
});
