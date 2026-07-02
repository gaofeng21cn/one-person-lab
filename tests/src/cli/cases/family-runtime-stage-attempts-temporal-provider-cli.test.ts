import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createFamilyRuntimeQueueTables } from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';

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
      'scout',
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

test('family-runtime temporal attempt start blocks dirty MAS checkout before Temporal transport', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-currentness-'));
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  const checkoutRoot = path.join(masFixture.fixtureRoot, 'dirty-checkout');
  try {
    const clone = spawnSync('git', ['clone', masFixture.remoteRoot, checkoutRoot], {
      cwd: path.dirname(checkoutRoot),
      encoding: 'utf8',
    });
    assert.equal(clone.status, 0, clone.stderr);
    const queueDbPath = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    fs.mkdirSync(path.dirname(queueDbPath), { recursive: true });
    const db = new DatabaseSync(queueDbPath);
    createFamilyRuntimeQueueTables(db);
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'historical-queued-default-executor',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: checkoutRoot },
      sourceFingerprint: 'test:historical-queued-currentness',
      executorKind: 'codex_cli',
      checkpointRefs: ['packet:historical-queued-currentness'],
    });
    db.close();
    fs.writeFileSync(path.join(checkoutRoot, 'dirty-uncommitted.txt'), 'dirty\n', 'utf8');
    const attemptId = created.attempt.stage_attempt_id;
    const started = runCli([
      'family-runtime',
      'attempt',
      'start',
      attemptId,
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
    const result = started.family_runtime_stage_attempt_start;

    assert.equal(result.temporal_start, null);
    assert.equal(result.attempt.status, 'blocked');
    assert.equal(result.attempt.blocked_reason, 'dirty_checkout');
    assert.equal(result.checkout_currentness_preflight.status, 'blocked');
    assert.equal(result.checkout_currentness_preflight.currentness_status, 'dirty_fail_closed');
    assert.equal(result.checkout_currentness_preflight.workspace_path, checkoutRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
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
    assert.equal(
      result.current_provider_readiness?.surface_kind,
      'stage_attempt_current_provider_readiness',
    );
    assert.deepEqual(
      result.current_provider_readiness,
      result.stage_attempt_query.current_provider_readiness,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query/list do not treat stale running ledger as running proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stale-running-attempt-'));
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
      '{"workspace_root":"/tmp/mas","study_id":"dm002"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const staleLedger = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE stage_attempts SET status = 'running', provider_run_json = '{}' WHERE stage_attempt_id = ?").run(${JSON.stringify(attemptId)});
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(staleLedger.status, 0, staleLedger.stderr);

    const env = familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], env);
    const stageQuery = query.family_runtime_stage_attempt_query.stage_attempt_query;
    const list = runCli(['family-runtime', 'attempt', 'list', '--domain', 'medautoscience'], env);
    const listed = list.family_runtime_stage_attempts.attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === attemptId,
    );

    assert.equal(stageQuery.attempt.status, 'running');
    assert.equal(stageQuery.operator_visibility.effective_runtime_status, 'not_running');
    assert.equal(stageQuery.operator_visibility.runtime_currentness.running_proof_status, 'not_running');
    assert.equal(stageQuery.operator_visibility.runtime_currentness.projection_status, 'stale_projection');
    assert.equal(stageQuery.operator_visibility.runtime_currentness.observed_provider_status, null);
    assert.equal(stageQuery.operator_visibility.runtime_currentness.observed_last_heartbeat_at, null);
    assert.deepEqual(stageQuery.operator_visibility.runtime_currentness.running_proof_sources, []);
    assert.equal(listed.effective_runtime_status, 'not_running');
    assert.equal(listed.runtime_currentness.running_proof_status, 'not_running');
    assert.equal(listed.operator_summary.effective_runtime_status, 'not_running');
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
