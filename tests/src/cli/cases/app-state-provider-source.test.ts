import { spawn } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

import { assert, buildManifestCommand, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { resolveTemporalWorkerTaskQueue } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import { currentWorkerSourceVersion } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-state.ts';

function buildMasManifestWithManagedTemporalProjection(managedTemporal: Record<string, unknown>) {
  const fixtures = loadFamilyManifestFixtures();
  const fixtureProgressProjection = fixtures.medautoscience.progress_projection as Record<string, unknown>;
  return {
    ...fixtures.medautoscience,
    progress_projection: {
      ...fixtureProgressProjection,
      surface_kind: 'progress_projection',
      domain_projection: {
        ...((fixtureProgressProjection.domain_projection as Record<string, unknown>) ?? {}),
        managed_temporal_state_consistency: managedTemporal,
      },
    },
  };
}

test('app state fast fails closed on stale worker source without live manifest refresh', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-local-temporal-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const temporalServer = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve, reject) => {
    temporalServer.once('error', reject);
    temporalServer.listen(0, '127.0.0.1', resolve);
  });
  const temporalServerAddress = temporalServer.address();
  if (!temporalServerAddress || typeof temporalServerAddress === 'string') {
    throw new Error('Unable to resolve Temporal fixture port.');
  }
  const temporalAddress = `127.0.0.1:${temporalServerAddress.port}`;
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000);'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: child.pid,
      address: temporalAddress,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    const currentSourceVersion = currentWorkerSourceVersion(pathToFileURL(path.join(
      repoRoot,
      'src/modules/runway/family-runtime-temporal-provider.ts',
    )).href);
    const workerState = {
      provider_kind: 'temporal',
      pid: child.pid,
      address: temporalAddress,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: `worker-runtime:/tmp/stale:${'0'.repeat(64)}`,
    } as const;
    const workerStatePath = path.join(runtimeRoot, 'temporal-worker.json');
    fs.writeFileSync(workerStatePath, `${JSON.stringify(workerState, null, 2)}\n`);

    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    };
    const readFastState = () => runCli(['app', 'state', '--profile', 'fast'], env) as {
      app_state: {
        provider: {
          temporal: {
            ready: boolean;
            health_status: string;
            details: {
              inspection_detail: string;
              worker_readiness: {
                inspection_detail: string;
                readiness_status: string;
                service_ready: boolean | null;
                server_reachable: boolean | null;
                temporal_service_lifecycle: {
                  service_status: string;
                };
                worker_mutation_guard: {
                  mutation_guard_status: string;
                  allowed: boolean;
                };
                visibility_readiness: { readiness_status: string };
              };
              scheduler: {
                status: string;
                ready: boolean;
                observed_at: string;
                inspection_error: string | null;
              };
              scheduler_status: string;
            };
          };
        };
      };
    };

    const stale = readFastState();
    assert.equal(stale.app_state.provider.temporal.ready, false);
    assert.equal(stale.app_state.provider.temporal.health_status, 'attention_needed');
    assert.equal(
      stale.app_state.provider.temporal.details.worker_readiness.readiness_status,
      'worker_source_stale',
    );
    fs.writeFileSync(workerStatePath, `${JSON.stringify({
      ...workerState,
      source_version: currentSourceVersion,
    }, null, 2)}\n`);
    const output = readFastState();
    assert.equal(output.app_state.provider.temporal.ready, true);
    assert.equal(output.app_state.provider.temporal.health_status, 'ready');
    assert.equal(output.app_state.provider.temporal.details.inspection_detail, 'fast');
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.inspection_detail, 'fast');
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.readiness_status, 'ready');
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.service_ready, true);
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.server_reachable, true);
    assert.equal(
      output.app_state.provider.temporal.details.worker_readiness.temporal_service_lifecycle.service_status,
      'running',
    );
    assert.equal(
      typeof output.app_state.provider.temporal.details.worker_readiness.worker_mutation_guard.mutation_guard_status,
      'string',
    );
    assert.equal(
      typeof output.app_state.provider.temporal.details.worker_readiness.worker_mutation_guard.allowed,
      'boolean',
    );
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.visibility_readiness.readiness_status, 'not_verified');
    assert.equal(output.app_state.provider.temporal.details.scheduler.status, 'error');
    assert.equal(output.app_state.provider.temporal.details.scheduler.ready, false);
    assert.equal(typeof output.app_state.provider.temporal.details.scheduler.observed_at, 'string');
    assert.equal(typeof output.app_state.provider.temporal.details.scheduler.inspection_error, 'string');
    assert.equal(output.app_state.provider.temporal.details.scheduler_status, 'error');
  } finally {
    if (child.pid) {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // Test process may already have exited.
      }
    }
    await new Promise<void>((resolve) => temporalServer.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('app state full uses lifecycle-aware Temporal readiness from the same provider source as initialize', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-provider-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-provider-mas-'));
  const manifest = buildMasManifestWithManagedTemporalProjection({
    surface_kind: 'managed_temporal_state_consistency',
    projection_status: 'ready',
    provider_kind: 'temporal',
    service_status: 'ready',
    worker_status: 'ready',
    address: 'mas-managed-temporal.example.test:7233',
    namespace: 'default',
    task_queue: 'opl-stage-attempts',
    source_refs: ['mas://runtime/managed_temporal_state_consistency/latest.json'],
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      paper_closure_authority: 'mas_only',
    },
  });
  const now = new Date().toISOString();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-managed-projection',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspacePath,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: buildManifestCommand(manifest),
            url: null,
            workspace_locator: null,
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  try {
    const output = runCli(['app', 'state', '--profile', 'full'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        provider: {
          temporal: {
            health_status: string;
            status: string;
            ready: boolean;
            degraded_reason: string | null;
            details: {
              address: string | null;
              address_source: string | null;
              adapter_mode: string | null;
              worker_readiness: { readiness_status: string; worker_ready: boolean; blockers: string[] };
              scheduler: { status: string; ready: boolean; observed_at: string };
              scheduler_status: string;
            };
          };
        };
      };
    };

    assert.equal(output.app_state.provider.temporal.health_status, 'attention_needed');
    assert.equal(output.app_state.provider.temporal.status, 'provider_code_landed_unconfigured');
    assert.equal(output.app_state.provider.temporal.ready, false);
    assert.equal(output.app_state.provider.temporal.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.app_state.provider.temporal.details.address, null);
    assert.equal(output.app_state.provider.temporal.details.address_source, 'not_configured');
    assert.equal(output.app_state.provider.temporal.details.adapter_mode, 'provider_code_landed_unconfigured');
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.readiness_status, 'not_configured');
    assert.equal(output.app_state.provider.temporal.details.worker_readiness.worker_ready, false);
    assert.deepEqual(output.app_state.provider.temporal.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
    assert.equal(output.app_state.provider.temporal.details.scheduler.status, 'not_configured');
    assert.equal(output.app_state.provider.temporal.details.scheduler.ready, false);
    assert.equal(typeof output.app_state.provider.temporal.details.scheduler.observed_at, 'string');
    assert.equal(output.app_state.provider.temporal.details.scheduler_status, 'not_configured');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('app state fast shows developer checkout source when Developer Mode prefers sibling repos', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-dev-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const stateDir = path.join(homeRoot, 'opl-state');
  const medAutoSciencePath = path.join(workspaceRoot, 'med-autoscience');
  fs.mkdirSync(medAutoSciencePath, { recursive: true });
  runGitFixtureCommand(medAutoSciencePath, ['init', '--quiet']);
  fs.writeFileSync(path.join(medAutoSciencePath, 'README.md'), '# Med Auto Science\n', 'utf8');
  runGitFixtureCommand(medAutoSciencePath, ['add', 'README.md']);
  runGitFixtureCommand(medAutoSciencePath, ['commit', '--quiet', '-m', 'Initial MAS fixture']);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'developer-supervisor.json'), JSON.stringify({
    version: 'g1',
    enabled: 'on',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'gaofeng21cn',
    updated_at: '2026-05-27T00:00:00.000Z',
  }, null, 2));

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        login: 'gaofeng21cn',
        permissions: {
          'gaofeng21cn/one-person-lab': 'write',
          'gaofeng21cn/med-autoscience': 'write',
          'gaofeng21cn/med-autogrant': 'write',
          'gaofeng21cn/redcube-ai': 'write',
          'gaofeng21cn/opl-meta-agent': 'write',
        },
      }),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        developer_profile: {
          profile_id: string;
          capabilities: {
            source_channel: {
              status: string;
              level: string;
              source: string;
              impact: string;
            };
          };
        };
        developer_mode: {
          enabled: string;
          effective_state: string;
          capabilities: {
            source_channel: {
              status: string;
              level: string;
              source: string;
              impact: string;
            };
          };
        };
        runtime_source_carriers: {
          source: { mode: string; reason: string };
          items: Array<{
            package_id: string;
            source_path: string;
            source_origin: string;
            capabilities: {
              source_channel: {
                status: string;
                level: string;
                source: string;
                impact: string;
              };
            };
          }>;
        };
      };
    };

    const mas = output.app_state.runtime_source_carriers.items.find((entry) => entry.package_id === 'mas');
    assert.ok(mas);
    assert.equal(output.app_state.developer_profile.profile_id, 'runtime_maintainer');
    assert.equal(Object.hasOwn(output.app_state.developer_profile, 'legacy_developer_mode'), false);
    assert.deepEqual(output.app_state.developer_profile.capabilities.source_channel, {
      status: 'ready',
      level: 'local_checkout',
      source: 'developer_mode_git_checkout_source',
      impact: 'Module source may use local developer checkouts for App and CLI read-models.',
    });
    assert.equal(output.app_state.developer_mode.enabled, 'on');
    assert.equal(output.app_state.developer_mode.effective_state, 'active_direct');
    assert.deepEqual(output.app_state.developer_mode.capabilities.source_channel, {
      status: 'ready',
      level: 'local_checkout',
      source: 'developer_mode_git_checkout_source',
      impact: 'Module source may use local developer checkouts for App and CLI read-models.',
    });
    assert.equal(output.app_state.runtime_source_carriers.source.mode, 'developer_workspace');
    assert.equal(output.app_state.runtime_source_carriers.source.reason, 'developer_mode_prefers_local_sibling_checkouts');
    assert.equal(mas.source_path, medAutoSciencePath);
    assert.equal(mas.source_origin, 'sibling_workspace');
    assert.deepEqual(mas.capabilities.source_channel, {
      status: 'ready',
      level: 'local_checkout',
      source: 'developer_mode',
      impact: 'This module is read from a local developer checkout.',
    });
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
