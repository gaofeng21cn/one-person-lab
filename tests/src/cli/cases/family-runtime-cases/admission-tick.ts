import { spawnSync } from 'node:child_process';

import {
  assert,
  cliPath,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  shellSingleQuote,
  test,
} from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './helpers.ts';

test('family-runtime attempt create blocks executor launch when stage admission is required but unavailable', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-admission-create-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:admission-required',
      '--require-stage-admission',
      '--start',
    ], familyRuntimeEnv(stateRoot));

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(
      created.family_runtime_stage_attempt.attempt.blocked_reason,
      'stage_admission_manifest_missing',
    );
    assert.equal(created.family_runtime_stage_attempt.temporal_start, null);
    assert.equal(created.family_runtime_stage_attempt.stage_launch_admission_gate.status, 'blocked');
    assert.equal(
      created.family_runtime_stage_attempt.stage_launch_admission_gate.authority_boundary.can_execute_stage,
      false,
    );
    assert.equal(
      created.family_runtime_stage_attempt.conflict_or_blocker_envelopes[0].reason,
      'stage_admission_manifest_missing',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick blocks provider-hosted tasks at admission gate before domain dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-admission-dispatch-'));
  const dispatch = createDispatchFixture(`
touch ${shellSingleQuote(path.join(stateRoot, 'dispatch-ran'))}
echo '{"accepted":true,"surface_kind":"should_not_run"}'
`);
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/scout',
      '--payload',
      '{"provider_hosted_stage_attempt":true,"stage_id":"scout","workspace_root":"/tmp/mas"}',
      '--dedupe-key',
      'mas:admission:scout',
      '--require-stage-admission',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      enqueue.family_runtime_enqueue.task.task_id,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(enqueue.family_runtime_enqueue.accepted, true);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'stage_admission_manifest_missing');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'blocked');
    assert.equal(
      tick.family_runtime_tick.dispatches[0].stage_attempts[0].blocked_reason,
      'stage_admission_manifest_missing',
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(fs.existsSync(path.join(stateRoot, 'dispatch-ran')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt create requires explicit workspace locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-locator-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr); // reuse-first: allow CLI error JSON parser in migrated test case.

    assert.equal(result.status, 2);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /workspace-locator/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
