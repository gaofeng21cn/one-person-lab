import { spawnSync } from 'node:child_process';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  cliPath,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';
import { familyRuntimeEnv } from './helpers.ts';

test('family-runtime local provider status fails closed after provider retirement', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-provider-'));
  try {
    const output = runCliFailure(
      ['family-runtime', 'status', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot, {
        OPL_HERMES_BIN: path.join(stateRoot, 'missing-hermes'),
      }),
    );

    assert.equal(output.payload.error.code, 'cli_usage_error');
    assert.equal(output.payload.error.details.provider_kind, 'local_sqlite');
    assert.deepEqual(output.payload.error.details.allowed_provider_kinds, ['temporal', 'external_sandbox']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime doctor rejects explicit local sqlite provider', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-doctor-'));
  try {
    const output = runCliFailure(
      ['family-runtime', 'doctor', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot),
    );

    assert.equal(output.payload.error.code, 'cli_usage_error');
    assert.equal(output.payload.error.details.provider_kind, 'local_sqlite');
    assert.deepEqual(output.payload.error.details.allowed_provider_kinds, ['temporal', 'external_sandbox']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider reports landed code separately from live runtime readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-'));
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;

    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(provider.status, 'provider_code_landed_unconfigured');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(provider.details.adapter_mode, 'provider_code_landed_unconfigured');
    assert.equal(provider.capabilities.includes('stage_attempt_workflow_provider_code'), true);
    assert.equal(provider.details.worker_readiness.surface_kind, 'temporal_worker_lifecycle_status');
    assert.equal(provider.details.worker_readiness.readiness_status, 'not_configured');
    assert.equal(provider.details.worker_readiness.visibility_readiness, null);
    assert.deepEqual(provider.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime local queue commands are retired public runtime entrypoints', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-queue-boundary-'));
  try {
    const enqueue = runCliFailure([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:test:temporal-queue-boundary',
    ], familyRuntimeEnv(stateRoot));
    const queueList = runCliFailure(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const tick = runCliFailure(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot));

    assert.equal(enqueue.payload.error.code, 'unknown_command');
    assert.equal(queueList.payload.error.code, 'unknown_command');
    assert.equal(tick.payload.error.code, 'unknown_command');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider repair installs visibility Search Attributes when service is reachable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-repair-'));
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
      'family-runtime',
      'repair',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: testEnv.address,
        OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout); // reuse-first: allow CLI stdout JSON parser in migrated test case.
    const repair = output.family_runtime_provider.temporal_visibility_repair;
    const workerRepair = output.family_runtime_provider.temporal_worker_repair;
    assert.equal(repair.surface_kind, 'temporal_visibility_repair_receipt');
    assert.equal(repair.repair_status, 'ready');
    assert.equal(workerRepair.trigger, 'provider_repair');
    assert.equal(workerRepair.repair_status, 'skipped');
    assert.equal(workerRepair.authority_boundary.can_write_domain_truth, false);
    assert.deepEqual(repair.installed_search_attributes, [
      'OplStageAttemptId',
      'OplDomainId',
      'OplStageId',
      'OplAttemptStatus',
      'OplStagePhase',
      'OplBlockedReason',
      'OplTaskId',
      'OplSourceFingerprint',
      'OplExecutorKind',
    ]);
    assert.equal(repair.visibility_readiness.readiness_status, 'ready');
    assert.equal(fs.existsSync(queueDb), true);
  } finally {
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
