import { assert, runCli, runCliFailure, test } from '../helpers.ts';

test('framework readiness rejects non-default invocation to avoid a second truth surface', () => {
  const failure = runCliFailure(['framework', 'readiness']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework readiness exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'readiness']);
  assert.equal(scoped.help.command, 'framework readiness');
  assert.match(scoped.help.usage, /framework readiness --family-defaults/);
});

test('framework operating maturity exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'operating-maturity']);
  assert.equal(scoped.help.command, 'framework operating-maturity');
  assert.match(scoped.help.usage, /framework operating-maturity --family-defaults/);
});

test('framework tranche backlog rejects non-default invocation to avoid a second active backlog', () => {
  const failure = runCliFailure(['framework', 'tranche-backlog']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework production closeout command is retired in favor of operating maturity', () => {
  const failure = runCliFailure(['framework', 'production-closeout']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /has been retired/);
  assert.equal(failure.payload.error.details.command, 'opl framework production-closeout');
  assert.equal(
    failure.payload.error.details.replacement,
    'opl framework operating-maturity --family-defaults --json',
  );
  assert.equal(failure.payload.error.details.retired, true);
});
