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

test('framework source structure rejects non-default invocation to avoid a second structure truth', () => {
  const failure = runCliFailure(['framework', 'source-structure']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework source structure exposes command-scoped help and guard readback', () => {
  const scoped = runCli(['help', 'framework', 'source-structure']);
  assert.equal(scoped.help.command, 'framework source-structure');
  assert.match(scoped.help.usage, /framework source-structure --family-defaults/);

  const readback = runCli(['framework', 'source-structure', '--family-defaults'])
    .source_structure_operator_readback;
  assert.equal(readback.surface_kind, 'opl_source_structure_operator_readback');
  assert.equal(readback.owner, 'one-person-lab');
  assert.equal(readback.contract_ref, 'contracts/opl-framework/source-structure-budget.json#opl_source_structure_budget.v1');
  assert.equal(readback.mode, 'advisory_readback');
  assert.equal(readback.default_limit, 1000);
  assert.equal(readback.advisory_passed, true);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.authority_boundary.can_claim_plan_completion, false);
  assert.equal(readback.false_ready_guard.source_structure_readback_can_claim_goal_complete, false);
});

test('framework source structure strict flag exposes strict ratchet mode as readback only', () => {
  const readback = runCli(['framework', 'source-structure', '--family-defaults', '--strict'])
    .source_structure_operator_readback;

  assert.equal(readback.mode, 'strict_readback');
  assert.equal(Array.isArray(readback.findings), true);
  assert.equal(typeof readback.strict_ratchet_passed, 'boolean');
  assert.equal(readback.false_ready_guard.strict_ratchet_passed_can_claim_ready, false);
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
