import { pathToFileURL } from 'node:url';

import {
  assert,
  fs,
  os,
  path,
  test,
} from '../../helpers.ts';
import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
} from '../../../../../src/modules/runway/family-runtime-temporal.ts';
import {
  buildTemporalWorkerReadiness,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  buildTemporalWorkerMutationGuard,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  resolveTemporalWorkerTaskQueue,
  resolveTemporalWorkerTaskQueueDetail,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import {
  currentWorkerSourceVersion,
  workerSourceVersionDiagnostic,
  workerSourceVersionsEquivalent,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-state.ts';

test('Temporal worker source version ignores documentation-only git HEAD drift', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-runtime-source-version-'));
  const srcRoot = path.join(repoRoot, 'src');
  const modulePath = path.join(srcRoot, 'family-runtime-temporal-provider.ts');
  const helperPath = path.join(srcRoot, 'family-runtime-temporal-provider-parts', 'worker-state.ts');
  const docsPath = path.join(repoRoot, 'docs', 'status.md');
  const headPath = path.join(repoRoot, '.git', 'refs', 'heads', 'main');
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    fs.mkdirSync(path.dirname(docsPath), { recursive: true });
    fs.mkdirSync(path.dirname(headPath), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(headPath, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
    fs.writeFileSync(modulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(helperPath, 'export const helperRuntime = 1;\n');
    fs.writeFileSync(docsPath, 'initial docs\n');

    const initial = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(headPath, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
    fs.writeFileSync(docsPath, 'updated docs\n');
    const docsOnly = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(modulePath, 'export const workerRuntime = 2;\n');
    const runtimeChanged = currentWorkerSourceVersion(pathToFileURL(modulePath).href);

    assert.equal(docsOnly, initial);
    assert.notEqual(runtimeChanged, initial);
    fs.writeFileSync(helperPath, 'export const helperRuntime = 2;\n');
    assert.notEqual(currentWorkerSourceVersion(pathToFileURL(modulePath).href), runtimeChanged);
  } finally {
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Temporal worker source version covers the executable source dependency closure', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-dependency-closure-'));
  const srcRoot = path.join(repoRoot, 'src');
  const modulePath = path.join(srcRoot, 'modules', 'runway', 'family-runtime-temporal-provider.ts');
  const runwayHelperPath = path.join(
    srcRoot,
    'modules',
    'runway',
    'family-runtime-temporal-provider-parts',
    'worker-state.ts',
  );
  const stagecraftPath = path.join(srcRoot, 'modules', 'stagecraft', 'stage-quality-scope-budget.ts');
  const packPath = path.join(srcRoot, 'modules', 'pack', 'index.ts');
  const kernelPath = path.join(srcRoot, 'kernel', 'contract-validation.ts');
  const docsPath = path.join(repoRoot, 'docs', 'status.md');
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    for (const filePath of [modulePath, runwayHelperPath, stagecraftPath, packPath, kernelPath, docsPath]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(modulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(runwayHelperPath, 'export const helperRuntime = 1;\n');
    fs.writeFileSync(stagecraftPath, 'export const stageBudget = 1;\n');
    fs.writeFileSync(packPath, 'export const packageBinding = 1;\n');
    fs.writeFileSync(kernelPath, 'export const contractValidation = 1;\n');
    fs.writeFileSync(docsPath, 'initial docs\n');

    const initial = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(docsPath, 'updated docs\n');
    assert.equal(currentWorkerSourceVersion(pathToFileURL(modulePath).href), initial);

    fs.writeFileSync(stagecraftPath, 'export const stageBudget = 2;\n');
    const stagecraftChanged = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    assert.notEqual(stagecraftChanged, initial);

    fs.writeFileSync(packPath, 'export const packageBinding = 2;\n');
    const packChanged = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    assert.notEqual(packChanged, stagecraftChanged);

    fs.writeFileSync(kernelPath, 'export const contractValidation = 2;\n');
    assert.notEqual(currentWorkerSourceVersion(pathToFileURL(modulePath).href), packChanged);
    assert.equal(initial.startsWith(`worker-runtime:${srcRoot}:`), true);
  } finally {
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Temporal worker source version tracks executable dist runtime for built provider module', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-runtime-built-source-version-'));
  const srcRoot = path.join(repoRoot, 'src');
  const distRoot = path.join(repoRoot, 'dist');
  const srcModulePath = path.join(srcRoot, 'family-runtime-temporal-provider.ts');
  const srcHelperPath = path.join(srcRoot, 'family-runtime-temporal-provider-parts', 'worker-state.ts');
  const distModulePath = path.join(distRoot, 'family-runtime-temporal-provider.js');
  const distHelperPath = path.join(distRoot, 'family-runtime-temporal-provider-parts', 'worker-state.js');
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    fs.mkdirSync(path.dirname(srcModulePath), { recursive: true });
    fs.mkdirSync(path.dirname(srcHelperPath), { recursive: true });
    fs.mkdirSync(path.dirname(distModulePath), { recursive: true });
    fs.mkdirSync(path.dirname(distHelperPath), { recursive: true });
    fs.writeFileSync(srcModulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(srcHelperPath, 'export const helperRuntime = 1;\n');
    fs.writeFileSync(distModulePath, 'export const compiledWorkerRuntime = 1;\n');
    fs.writeFileSync(distHelperPath, 'export const compiledHelperRuntime = 1;\n');

    const fromSrc = currentWorkerSourceVersion(pathToFileURL(srcModulePath).href);
    const fromDist = currentWorkerSourceVersion(pathToFileURL(distModulePath).href);
    fs.writeFileSync(distModulePath, 'export const compiledWorkerRuntime = 2;\n');
    const distOnlyChanged = currentWorkerSourceVersion(pathToFileURL(distModulePath).href);
    fs.writeFileSync(srcModulePath, 'export const workerRuntime = 2;\n');
    const srcChanged = currentWorkerSourceVersion(pathToFileURL(distModulePath).href);

    assert.notEqual(fromDist, fromSrc);
    assert.notEqual(distOnlyChanged, fromDist);
    assert.equal(srcChanged, distOnlyChanged);
    assert.equal(fromSrc.startsWith(`worker-runtime:${srcRoot}:`), true);
    assert.equal(fromDist.startsWith(`worker-runtime:${distRoot}:`), true);
  } finally {
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Temporal worker source version currentness follows runtime content hash across source roots', () => {
  const hash = 'a'.repeat(64);
  const otherHash = 'b'.repeat(64);
  assert.equal(
    workerSourceVersionsEquivalent(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${hash}`,
    ),
    true,
  );
  assert.equal(
    workerSourceVersionsEquivalent(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${otherHash}`,
    ),
    false,
  );
  assert.equal(workerSourceVersionsEquivalent('git:old-worker-source', 'git:new-worker-source'), false);
  assert.equal(
    workerSourceVersionDiagnostic(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${hash}`,
    ).diagnostic_id,
    'same_content_hash_different_source_root',
  );
});

test('Temporal worker mutation guard blocks developer checkout against default shared state', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-guard-home-'));
  const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-guard-dev-'));
  const modulePath = path.join(
    devRoot,
    'src',
    'modules',
    'runway',
    'family-runtime-temporal-provider.ts',
  );
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousAllow = process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
  try {
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.join(devRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(devRoot, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(devRoot, 'package.json'), '{"name":"one-person-lab"}\n');
    fs.writeFileSync(path.join(devRoot, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(modulePath, 'export const fixture = true;\n');
    fs.writeFileSync(path.join(devRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(devRoot, '.git', 'refs', 'heads', 'main'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');

    process.env.HOME = homeRoot;
    delete process.env.OPL_STATE_DIR;
    delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;

    const sharedRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'family-runtime');
    const configDir = path.dirname(sharedRoot);
    const configPath = path.join(configDir, 'developer-supervisor.json');
    const blocked = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    const readiness = buildTemporalWorkerReadiness({
      address: '127.0.0.1:7233',
      serverReachable: true,
      workerStatus: null,
      workerMutationGuard: blocked,
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(blocked.source_is_git_checkout, true);
    assert.equal(blocked.state_dir_explicit, false);
    assert.equal(readiness.worker_mutation_guard?.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(readiness.repair_action.action_id, 'start_temporal_worker');

    process.env.OPL_STATE_DIR = path.join(homeRoot, 'explicit-dev-state');
    const explicitState = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: path.join(process.env.OPL_STATE_DIR, 'family-runtime') },
    });
    assert.equal(explicitState.allowed, true);
    assert.equal(explicitState.mutation_guard_status, 'allowed_explicit_state_dir');

    delete process.env.OPL_STATE_DIR;
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'auto',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const autoDeveloperMode = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(autoDeveloperMode.allowed, false);
    assert.equal(autoDeveloperMode.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(autoDeveloperMode.developer_supervisor_override, false);

    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'on',
      mode: 'external_observe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const observeDeveloperMode = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(observeDeveloperMode.allowed, false);
    assert.equal(observeDeveloperMode.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(observeDeveloperMode.developer_supervisor_override, false);

    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'on',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const developerApplySafe = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(developerApplySafe.allowed, true);
    assert.equal(developerApplySafe.mutation_guard_status, 'allowed_explicit_developer_supervisor');
    assert.equal(developerApplySafe.developer_supervisor_override, true);
    assert.equal(developerApplySafe.developer_supervisor_config?.enabled, 'on');
    assert.equal(developerApplySafe.developer_supervisor_config?.mode, 'developer_apply_safe');

    delete process.env.OPL_STATE_DIR;
    process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER = '1';
    const explicitOverride = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(explicitOverride.allowed, true);
    assert.equal(explicitOverride.mutation_guard_status, 'allowed_explicit_developer_override');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousAllow === undefined) {
      delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
    } else {
      process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER = previousAllow;
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(devRoot, { recursive: true, force: true });
  }
});

test('Temporal worker task queue isolates non-default roots unless explicitly configured', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-task-queue-home-'));
  const tempStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-task-queue-state-'));
  const previousHome = process.env.HOME;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.HOME = homeRoot;
    delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    delete process.env.OPL_STATE_DIR;

    const sharedRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'family-runtime');
    const isolatedRoot = path.join(tempStateRoot, 'family-runtime');

    const shared = resolveTemporalWorkerTaskQueueDetail({ root: sharedRoot });
    const isolated = resolveTemporalWorkerTaskQueueDetail({ root: isolatedRoot });

    assert.equal(shared.task_queue, DEFAULT_TEMPORAL_TASK_QUEUE);
    assert.equal(shared.task_queue_source, 'default_shared_state_root');
    assert.equal(shared.uses_default_shared_state_root, true);
    assert.notEqual(isolated.task_queue, DEFAULT_TEMPORAL_TASK_QUEUE);
    assert.match(isolated.task_queue, /^opl-stage-attempts-isolated-[a-f0-9]{12}$/);
    assert.equal(isolated.task_queue_source, 'isolated_worker_root');
    assert.equal(isolated.uses_default_shared_state_root, false);
    assert.equal(resolveTemporalWorkerTaskQueue({ root: isolatedRoot }), isolated.task_queue);

    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-explicit-worker-queue';
    const explicit = resolveTemporalWorkerTaskQueueDetail({ root: isolatedRoot });
    assert.equal(explicit.task_queue, 'opl-explicit-worker-queue');
    assert.equal(explicit.task_queue_source, 'explicit_env');
    assert.equal(explicit.uses_default_shared_state_root, false);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(tempStateRoot, { recursive: true, force: true });
  }
});
