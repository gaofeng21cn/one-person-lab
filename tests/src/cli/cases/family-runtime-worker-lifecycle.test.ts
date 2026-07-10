import { pathToFileURL } from 'node:url';

import { assert, fs, os, path, test } from '../helpers.ts';
import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
} from '../../../../src/modules/runway/family-runtime-temporal.ts';
import {
  buildTemporalWorkerMutationGuard,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  resolveTemporalWorkerTaskQueue,
  resolveTemporalWorkerTaskQueueDetail,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import {
  currentWorkerSourceVersion,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-state.ts';

import './family-runtime-worker-lifecycle-cases/dependency-readiness.ts';
import './family-runtime-worker-lifecycle-cases/worker-orphan-cleanup.ts';

test('Temporal worker source currentness follows runtime content, not docs or git HEAD', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-currentness-'));
  const modulePath = path.join(repoRoot, 'src', 'family-runtime-temporal-provider.ts');
  const helperPath = path.join(
    repoRoot,
    'src',
    'family-runtime-temporal-provider-parts',
    'worker-state.ts',
  );
  const docsPath = path.join(repoRoot, 'docs', 'status.md');
  const headPath = path.join(repoRoot, '.git', 'refs', 'heads', 'main');
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    for (const filePath of [modulePath, helperPath, docsPath, headPath]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(headPath, `${'a'.repeat(40)}\n`);
    fs.writeFileSync(modulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(helperPath, 'export const helperRuntime = 1;\n');
    fs.writeFileSync(docsPath, 'initial docs\n');

    const initial = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(headPath, `${'b'.repeat(40)}\n`);
    fs.writeFileSync(docsPath, 'updated docs\n');
    const docsOnly = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(modulePath, 'export const workerRuntime = 2;\n');
    const runtimeChanged = currentWorkerSourceVersion(pathToFileURL(modulePath).href);

    assert.equal(docsOnly, initial);
    assert.notEqual(runtimeChanged, initial);
  } finally {
    if (previousSourceVersion === undefined) delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    else process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Temporal worker mutation guard blocks a developer checkout against shared state', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-guard-home-'));
  const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-guard-dev-'));
  const modulePath = path.join(devRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-provider.ts');
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousAllow = process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
  try {
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.join(devRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(devRoot, 'package.json'), '{"name":"one-person-lab"}\n');
    fs.writeFileSync(path.join(devRoot, '.git', 'HEAD'), `${'a'.repeat(40)}\n`);
    fs.writeFileSync(modulePath, 'export const fixture = true;\n');

    process.env.HOME = homeRoot;
    delete process.env.OPL_STATE_DIR;
    delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
    const sharedRoot = path.join(
      homeRoot,
      'Library',
      'Application Support',
      'OPL',
      'state',
      'family-runtime',
    );
    const blocked = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.mutation_guard_status, 'blocked_developer_checkout_shared_state');

    process.env.OPL_STATE_DIR = path.join(homeRoot, 'isolated-state');
    const isolated = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: path.join(process.env.OPL_STATE_DIR, 'family-runtime') },
    });
    assert.equal(isolated.allowed, true);
    assert.equal(isolated.mutation_guard_status, 'allowed_explicit_state_dir');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousAllow === undefined) delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
    else process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER = previousAllow;
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(devRoot, { recursive: true, force: true });
  }
});

test('Temporal worker task queue isolates non-default roots and honors explicit configuration', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-queue-home-'));
  const isolatedState = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-queue-state-'));
  const previousHome = process.env.HOME;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.HOME = homeRoot;
    delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    delete process.env.OPL_STATE_DIR;
    const sharedRoot = path.join(
      homeRoot,
      'Library',
      'Application Support',
      'OPL',
      'state',
      'family-runtime',
    );
    const isolatedRoot = path.join(isolatedState, 'family-runtime');
    const shared = resolveTemporalWorkerTaskQueueDetail({ root: sharedRoot });
    const isolated = resolveTemporalWorkerTaskQueueDetail({ root: isolatedRoot });

    assert.equal(shared.task_queue, DEFAULT_TEMPORAL_TASK_QUEUE);
    assert.equal(shared.task_queue_source, 'default_shared_state_root');
    assert.match(isolated.task_queue, /^opl-stage-attempts-isolated-[a-f0-9]{12}$/);
    assert.equal(isolated.task_queue_source, 'isolated_worker_root');
    assert.equal(resolveTemporalWorkerTaskQueue({ root: isolatedRoot }), isolated.task_queue);

    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-explicit-worker-queue';
    assert.equal(
      resolveTemporalWorkerTaskQueueDetail({ root: isolatedRoot }).task_queue,
      'opl-explicit-worker-queue',
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(isolatedState, { recursive: true, force: true });
  }
});
