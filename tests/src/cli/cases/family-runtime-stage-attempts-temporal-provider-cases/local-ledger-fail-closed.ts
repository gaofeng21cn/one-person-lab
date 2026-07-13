import { spawnSync } from 'node:child_process';

import { TestWorkflowEnvironment } from '@temporalio/testing';

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

test('family-runtime Temporal start treats a missing stage packet as nonblocking context debt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-missing-packet-'));
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
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
    const started = spawnSync(process.execPath, [
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
        OPL_TEMPORAL_ADDRESS: testEnv.address,
        OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = parseJsonText(started.stdout || started.stderr) as Record<string, any>;

    assert.equal(started.status, 0, started.stderr);
    assert.equal(
      output.family_runtime_stage_attempt_start.surface_id,
      'opl_family_runtime_stage_attempt_start',
    );
    assert.equal(
      output.family_runtime_stage_attempt_start.attempt.stage_attempt_id,
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.ok(output.family_runtime_stage_attempt_start.temporal_start);
  } finally {
    await testEnv.teardown();
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
