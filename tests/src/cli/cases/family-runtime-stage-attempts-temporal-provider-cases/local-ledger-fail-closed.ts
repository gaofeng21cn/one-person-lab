import { spawnSync } from 'node:child_process';

import {
  CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from '../../../../../src/family-runtime-temporal-constants.ts';
import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../../helpers.ts';
import type { TemporalStageAttemptCreateOutput } from '../family-runtime-stage-attempts-temporal-provider-fixtures.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime temporal attempt start blocks live Codex without stage packet', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-missing-packet-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const failure = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(failure.stdout || failure.stderr);

    assert.notEqual(failure.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(output.error.details.blocked_reason, 'codex_cli_stage_packet_ref_missing');
    assert.match(output.error.message, /stage packet ref/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query keeps local ledger readable when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-missing-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], {
      ...familyRuntimeEnv(stateRoot),
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id, attemptId);
    const timeoutPolicy = query.family_runtime_stage_attempt_query
      .stage_attempt_query.operator_visibility.codex_stage_activity_timeout_policy;
    assert.ok(timeoutPolicy);
    assert.equal(timeoutPolicy.start_to_close_timeout, CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT);
    assert.equal(timeoutPolicy.heartbeat_timeout, CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT);
    assert.equal(timeoutPolicy.heartbeat_interval_ms, DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS);
    assert.equal(timeoutPolicy.runner_timeout_ms, DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS);
    assert.equal(timeoutPolicy.runner_no_output_timeout_ms, DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS);
    assert.equal(query.family_runtime_stage_attempt_query.temporal_query.status, 'unavailable');
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.reason,
      'temporal_address_not_configured',
    );
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.authority_boundary.opl,
      'local_stage_attempt_ledger_projection_only',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
