import { assert, runCli, runCliFailure, test } from '../helpers.ts';

test('framework readiness rejects non-default invocation to avoid a second truth surface', () => {
  const failure = runCliFailure(['framework', 'readiness']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework readiness appears in default and command-scoped help', () => {
  const root = runCli(['help']);
  const commands = root.help.commands.map((entry: { command: string }) => entry.command);
  const examples = root.help.examples.join('\n');

  assert.equal(commands.includes('framework readiness'), true);
  assert.match(examples, /opl framework readiness --family-defaults/);

  const scoped = runCli(['help', 'framework', 'readiness']);
  assert.equal(scoped.help.command, 'framework readiness');
  assert.match(scoped.help.usage, /framework readiness --family-defaults/);
});
