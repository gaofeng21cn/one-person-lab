import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  fs,
  os,
  path,
  test,
} from '../../helpers.ts';
import { runFamilyRuntime } from '../../../../../src/modules/runway/family-runtime.ts';

function packageLaunchRuntime() {
  let useBoundarySequence = 0;
  return {
    readinessCallCount: () => useBoundarySequence,
    stageRunRuntime: {
      ensurePackageLaunchReady: async () => {
        useBoundarySequence += 1;
        return {
          launch_allowed: true,
          runtime_source_readiness: { checkout_path: null },
          package_use_binding: {
            surface_kind: 'opl_agent_package_use_binding.v1',
            use_boundary_id: `package-use:test:${useBoundarySequence}`,
            use_receipt_ref: `opl://agent-package/use/test/${useBoundarySequence}`,
            root_package: { package_id: 'rca' },
            provider_packages: [],
            dependency_closure_digest: `sha256:${'0'.repeat(64)}`,
          },
        } as any;
      },
    },
  };
}

function setRuntimeEnv(input: {
  stateRoot: string;
  temporalAddress: string;
  temporalNamespace?: string;
  allowUnindexedVisibility?: boolean;
}) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY:
      process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY,
  };
  process.env.OPL_STATE_DIR = input.stateRoot;
  process.env.OPL_TEMPORAL_ADDRESS = input.temporalAddress;
  process.env.OPL_TEMPORAL_NAMESPACE = input.temporalNamespace ?? 'default';
  process.env.TEMPORAL_ADDRESS = '';
  if (input.allowUnindexedVisibility) {
    process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY = '1';
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('family-runtime Temporal start treats a missing stage packet as nonblocking context debt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-missing-packet-'));
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
  const restoreEnv = setRuntimeEnv({
    stateRoot,
    temporalAddress: testEnv.address,
    temporalNamespace: testEnv.namespace ?? 'default',
    allowUnindexedVisibility: true,
  });
  try {
    const runtime = packageLaunchRuntime();
    const created = await runFamilyRuntime([
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
    ], runtime) as Record<string, any>;
    const output = await runFamilyRuntime([
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], runtime) as Record<string, any>;

    assert.equal(
      output.family_runtime_stage_attempt_start.surface_id,
      'opl_family_runtime_stage_attempt_start',
    );
    assert.equal(
      output.family_runtime_stage_attempt_start.attempt.stage_attempt_id,
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.ok(output.family_runtime_stage_attempt_start.temporal_start);
    assert.equal(
      Object.hasOwn(created.family_runtime_stage_attempt.attempt.workspace_locator, 'package_use_binding'),
      false,
    );
    const startedAttempt = output.family_runtime_stage_attempt_start.attempt;
    const startedBinding = startedAttempt.workspace_locator.package_use_binding;
    assert.match(startedBinding.use_boundary_id, /^package-use:test:/);
    assert.equal(
      startedAttempt.provider_run.execution_package_use_context.status,
      'attempt_launch_binding_persisted',
    );
    assert.deepEqual(
      startedAttempt.provider_run.execution_package_use_context.package_use_binding,
      startedBinding,
    );
    assert.equal(runtime.readinessCallCount(), 2);

    const replay = await runFamilyRuntime([
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], runtime) as Record<string, any>;
    assert.equal(runtime.readinessCallCount(), 2);
    assert.deepEqual(
      replay.family_runtime_stage_attempt_start.attempt.provider_run.execution_package_use_context,
      startedAttempt.provider_run.execution_package_use_context,
    );
    assert.deepEqual(
      replay.family_runtime_stage_attempt_start.attempt.workspace_locator.package_use_binding,
      startedBinding,
    );
  } finally {
    await testEnv.teardown();
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime Temporal query keeps the local public envelope when provider is unavailable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-query-missing-'));
  const restoreEnv = setRuntimeEnv({ stateRoot, temporalAddress: '' });
  try {
    const created = await runFamilyRuntime([
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
    ], packageLaunchRuntime()) as Record<string, any>;
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const output = (await runFamilyRuntime([
      'attempt', 'query', attemptId,
    ]) as Record<string, any>).family_runtime_stage_attempt_query;

    assert.equal(output.stage_attempt_query.attempt.stage_attempt_id, attemptId);
    assert.equal(output.temporal_query.status, 'unavailable');
    assert.equal(output.temporal_query.reason, 'temporal_address_not_configured');
    assert.equal(
      output.temporal_query.authority_boundary.opl,
      'local_stage_attempt_ledger_projection_only',
    );
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
