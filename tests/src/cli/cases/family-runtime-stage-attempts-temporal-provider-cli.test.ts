import { spawnSync } from 'node:child_process';

import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime temporal attempt signal fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-signal-missing-'));
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
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"reason":"operator_resume"}',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt cancel fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-cancel-missing-'));
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
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'cancel',
      attemptId,
      '--reason',
      'superseded_by_current_owner_route',
      '--source',
      'test-supervisor',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt cancel refuses non-temporal attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cancel-provider-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'cancel',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--reason',
      'operator_superseded',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /temporal stage attempt/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query exposes stable top-level attempt alias', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-query-alias-'));
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
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
    const result = query.family_runtime_stage_attempt_query;

    assert.equal(result.attempt.stage_attempt_id, attemptId);
    assert.equal(result.attempt.stage_attempt_id, result.stage_attempt_query.attempt.stage_attempt_id);
    assert.equal(result.attempt_status, result.stage_attempt_query.attempt.status);
    assert.equal(result.attempt_ref, `opl://stage_attempts/${attemptId}`);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start refuses non-temporal attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-start-provider-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const result = spawnSync(process.execPath, [
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
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /temporal stage attempt/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
