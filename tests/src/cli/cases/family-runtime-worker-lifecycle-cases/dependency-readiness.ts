import {
  assert,
  fs,
  os,
  path,
  test,
} from '../../helpers.ts';
import { pathToFileURL } from 'node:url';
import {
  buildTemporalWorkerReadiness,
} from '../../../../../src/adapters/execution/family-runtime-temporal-provider.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from '../../../../../src/adapters/execution/family-runtime-temporal-provider-parts/worker-dependencies.ts';

test('Temporal worker readiness blocks missing SWC native workflow bundler dependency', () => {
  const failingRequire = (() => {
    throw new Error('Failed to load native binding');
  }) as unknown as NodeJS.Require;
  Object.assign(failingRequire, {
    resolve: () => '/tmp/opl-runtime/node_modules/@swc/core/index.js',
    cache: {},
    extensions: {},
    main: undefined,
  });
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({
    dependencyRequire: failingRequire,
  });
  const readiness = buildTemporalWorkerReadiness({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerStatus: 'ready',
    workerDependencyHealth: dependencyHealth,
  });

  assert.equal(dependencyHealth.status, 'blocked');
  assert.equal(dependencyHealth.blocker?.blocker_id, 'temporal_worker_swc_native_binding_unavailable');
  assert.equal(readiness.readiness_status, 'worker_dependency_unavailable');
  assert.equal(readiness.worker_ready, false);
  assert.deepEqual(readiness.blockers, ['temporal_worker_dependency_unavailable']);
  assert.equal(readiness.repair_action.action_id, 'repair_temporal_worker_runtime_dependencies');
  assert.match(readiness.repair_action.next_command ?? '', /npm install --include=optional/);
  assert.equal(readiness.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
});

test('Temporal dependency repair targets the package for source, dist and parts entrypoints', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-worker-runtime-$literal-'"));
  const failingRequire = Object.assign(() => { throw new Error('Missing native binding'); }, {
    resolve: () => path.join(root, 'node_modules/@swc/core/index.js'),
  }) as unknown as NodeJS.Require;
  const quotedRoot = process.platform === 'win32' ? JSON.stringify(root) : `'${root.replaceAll("'", "'\\''")}'`;
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"opl-framework"}');
    for (const relativePath of [
      'src/adapters/execution/family-runtime-temporal-provider.ts',
      'dist/adapters/execution/family-runtime-temporal-provider.js',
      'src/adapters/execution/family-runtime-temporal-provider-parts/worker-dependencies.ts',
      'dist/adapters/execution/family-runtime-temporal-provider-parts/worker-dependencies.js',
    ]) {
      const health = inspectTemporalWorkerRuntimeDependencies({
        moduleUrl: pathToFileURL(path.join(root, relativePath)).href,
        dependencyRequire: failingRequire,
      });
      assert.equal(health.status, 'blocked');
      assert.equal(health.module_root, root);
      assert.equal(
        health.blocker?.repair_command,
        `cd ${quotedRoot} && npm install --include=optional --ignore-scripts=false`,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
