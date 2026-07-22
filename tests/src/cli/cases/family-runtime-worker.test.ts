import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { Worker } from '@temporalio/worker';

import { buildTemporalStageAttemptWorkerOptionsForTest } from '../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import { createTemporalTestWorkflowEnvironment } from '../../temporal-test-environment.ts';

import {
  assert,
  cliPath,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  shellSingleQuote,
  test,
} from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

async function reserveLocalPort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to reserve a local Temporal test port.');
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

test('family-runtime service start waits for a delayed Temporal listener', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-service-start-'));
  const serverScript = path.join(stateRoot, 'delayed-server.mjs');
  const port = await reserveLocalPort();
  fs.writeFileSync(
    serverScript,
    [
      "import net from 'node:net';",
      'const port = Number.parseInt(process.argv[2], 10);',
      "const server = net.createServer((socket) => socket.end());",
      "setTimeout(() => server.listen(port, '127.0.0.1'), 650);",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
      'setInterval(() => {}, 1_000);',
    ].join('\n'),
    'utf8',
  );
  const env = familyRuntimeEnv(stateRoot, {
    OPL_TEMPORAL_ADDRESS: `127.0.0.1:${port}`,
    OPL_TEMPORAL_SERVICE_START_COMMAND:
      `exec ${shellSingleQuote(process.execPath)} ${shellSingleQuote(serverScript)} ${port}`,
  });

  try {
    const output = runCli(['family-runtime', 'service', 'start', '--provider', 'temporal'], env);
    const service = output.family_runtime_service;

    assert.equal(service.start_status, 'started');
    assert.equal(service.status.service_status, 'running');
    assert.equal(service.status.server_reachable, true);
  } finally {
    runCli(['family-runtime', 'service', 'stop', '--provider', 'temporal'], env);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal stable cohort gate materializes the shared workflow bundle and starts a real Worker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-stable-cohort-'));
  const testEnv = await createTemporalTestWorkflowEnvironment();
  try {
    const built = await buildTemporalStageAttemptWorkerOptionsForTest({ root: stateRoot });
    const worker = await Worker.create({
      ...built.worker_options,
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
    });
    const result = await worker.runUntil(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'worker_started';
    });

    assert.equal(result, 'worker_started');
    assert.equal(fs.statSync(built.workflow_bundle.code_path).size > 0, true);
    assert.equal(fs.existsSync(built.workflow_bundle.manifest_path), true);
    assert.equal(built.worker_options.workflowBundle && 'codePath' in built.worker_options.workflowBundle, true);
    assert.equal('workflowsPath' in built.worker_options, false);
  } finally {
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime worker parser exposes temporal lifecycle status command', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-status-'));
  try {
    const output = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );

    assert.equal(output.family_runtime_worker.surface_id, 'opl_family_runtime_worker');
    assert.equal(output.family_runtime_worker.action, 'status');
    assert.equal(output.family_runtime_worker.lifecycle_status, 'not_configured');
    assert.deepEqual(output.family_runtime_worker.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime worker start fails closed when Temporal is not configured or unreachable', () => {
  const missingStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-start-missing-'));
  const unreachableStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-start-unreachable-'));
  try {
    const missing = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
      'family-runtime',
      'worker',
      'start',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(missingStateRoot, {
          OPL_TEMPORAL_ADDRESS: '',
          TEMPORAL_ADDRESS: '',
        }),
      },
    });
    const missingPayload = parseJsonText(missing.stderr) as Record<string, any>;

    const unreachable = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
      'family-runtime',
      'worker',
      'start',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(unreachableStateRoot, {
          OPL_TEMPORAL_ADDRESS: '127.0.0.1:9',
        }),
      },
    });
    const unreachablePayload = parseJsonText(unreachable.stderr) as Record<string, any>;

    assert.equal(missing.status, 3);
    assert.equal(missingPayload.error.code, 'contract_shape_invalid');
    assert.equal(missingPayload.error.details.lifecycle_status, 'not_configured');
    assert.equal(unreachable.status, 3);
    assert.equal(unreachablePayload.error.code, 'contract_shape_invalid');
    assert.equal(unreachablePayload.error.details.lifecycle_status, 'server_unreachable');
    assert.equal(fs.existsSync(path.join(missingStateRoot, 'family-runtime', 'temporal-workflow-bundle')), false);
    assert.equal(fs.existsSync(path.join(unreachableStateRoot, 'family-runtime', 'temporal-workflow-bundle')), false);
  } finally {
    fs.rmSync(missingStateRoot, { recursive: true, force: true });
    fs.rmSync(unreachableStateRoot, { recursive: true, force: true });
  }
});
