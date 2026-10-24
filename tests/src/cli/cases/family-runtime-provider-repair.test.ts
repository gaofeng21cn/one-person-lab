import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  fs,
  os,
  path,
  runCliFailure,
  test,
} from '../helpers.ts';

test('family-runtime provider repair reads managed Temporal service state and preserves shared schema without address env', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-managed-repair-'));
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
  try {
    const runtimeRoot = path.join(stateRoot, 'family-runtime');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'temporal_cli',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);

    const failure = runCliFailure([
      'family-runtime',
      'provider',
      'repair',
      '--provider',
      'temporal',
    ], {
      NODE_NO_WARNINGS: '1',
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
      OPL_TEMPORAL_WORKER_STATUS: 'ready',
    });
    assert.equal(failure.status, 3);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'temporal_namespace_schema_mutation_not_approved');
    assert.equal(failure.payload.error.details.resource_pool.pool_id, 'shared-default');
    const readback = await testEnv.connection.operatorService.listSearchAttributes({
      namespace: testEnv.namespace ?? 'default',
    });
    assert.deepEqual(Object.keys(readback.customAttributes ?? {}), []);
  } finally {
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
