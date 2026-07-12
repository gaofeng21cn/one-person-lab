import { spawnSync } from 'node:child_process';

import {
  assert,
  cliPath,
  fs,
  installRuntimePackageFixture,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from '../../helpers.ts';
import type {
  TemporalStageAttemptCreateOutput,
} from '../family-runtime-stage-attempts-temporal-provider-fixtures.ts';

function familyRuntimeEnv(stateRoot: string) {
  return { OPL_STATE_DIR: stateRoot };
}

test('family-runtime Temporal start fails closed without a stage packet', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-missing-packet-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const failure = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
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
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = parseJsonText(failure.stdout || failure.stderr) as Record<string, any>;

    assert.notEqual(failure.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(output.error.details.blocked_reason, 'codex_cli_stage_packet_ref_missing');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime Temporal query keeps the local public envelope when provider is unavailable', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-query-missing-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const output = runCli(['family-runtime', 'attempt', 'query', attemptId], {
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).family_runtime_stage_attempt_query;

    assert.equal(output.stage_attempt_query.attempt.stage_attempt_id, attemptId);
    assert.equal(output.temporal_query.status, 'unavailable');
    assert.equal(output.temporal_query.reason, 'temporal_address_not_configured');
    assert.equal(
      output.temporal_query.authority_boundary.opl,
      'local_stage_attempt_ledger_projection_only',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
