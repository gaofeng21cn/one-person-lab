import { assert, fs, installRuntimePackageFixture, os, path, runCli, test } from '../helpers.ts';

test('family-runtime usage readback exposes a refs-only public envelope', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-usage-envelope-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'artifact_creation',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--retry-budget',
      '{"max_attempts":2}',
      '--source-fingerprint',
      'sha256:usage-envelope',
    ], { OPL_STATE_DIR: stateRoot });
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], { OPL_STATE_DIR: stateRoot }).family_runtime_stage_attempt_query.stage_attempt_query;
    const usage = query.usage_projection;

    assert.equal(usage.surface_kind, 'opl_stage_attempt_usage_projection');
    assert.equal(usage.projection_scope, 'stage_attempt');
    assert.equal(usage.telemetry_status, 'missing');
    assert.equal(usage.retry_budget.max_attempts, 2);
    assert.equal(usage.token.total_tokens_observed, null);
    assert.equal(usage.authority_boundary.can_change_executor, false);
    assert.equal(query.operator_visibility.usage_projection.surface_kind, usage.surface_kind);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
