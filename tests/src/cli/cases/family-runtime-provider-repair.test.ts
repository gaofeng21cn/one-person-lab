import { spawnSync } from 'node:child_process';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  test,
} from '../helpers.ts';

test('family-runtime provider repair uses managed Temporal service state without address env', async () => {
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

    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'provider',
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
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const provider = output.family_runtime_provider.provider;
    const repair = output.family_runtime_provider.temporal_visibility_repair;
    const workerRepair = output.family_runtime_provider.temporal_worker_repair;

    assert.equal(provider.details.address, testEnv.address);
    assert.equal(provider.details.address_source, 'managed_local_service_state');
    assert.equal(output.family_runtime_provider.visibility_readiness.address_source, 'managed_local_service_state');
    assert.equal(workerRepair.trigger, 'provider_repair');
    assert.equal(workerRepair.repair_status, 'skipped');
    assert.equal(workerRepair.authority_boundary.can_write_domain_truth, false);
    assert.equal(repair.repair_status, 'ready');
    assert.equal(repair.visibility_readiness.readiness_status, 'ready');
  } finally {
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
