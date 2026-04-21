import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExecutorPolicy,
  buildInteractionSurfaceCatalog,
  buildOplSessionRuntimeCatalog,
  buildOplSessionRuntimeDescriptor,
} from '../../src/opl-session-runtime.ts';

test('opl session runtime descriptor helper 输出稳定的 canonical surfaces、executor policy 与资源顺序', () => {
  const descriptor = buildOplSessionRuntimeDescriptor({
    runtime_id: 'runtime-core-main',
    summary: 'Runtime core descriptor for opl shell, ACP bridge, and product projection.',
    default_executor: 'codex',
    fallback_executors: ['acp_executor', 'hermes_agent'],
    interaction_surfaces: ['product_api_projection', 'opl_shell', 'acp_shell', 'codex_explicit'],
    resources: {
      system: {
        id: 'opl-runtime-system',
        label: 'OPL Runtime System',
        owner: 'opl_gateway',
        status: 'active',
        summary: 'Canonical runtime core for session interactions and projections.',
      },
      engines: [
        {
          id: 'engine-z',
          label: 'Engine Z',
          owner: 'runtime_core_lane',
          status: 'ready',
          summary: '备用执行引擎',
        },
        {
          id: 'engine-a',
          label: 'Engine A',
          owner: 'runtime_core_lane',
          status: 'ready',
          summary: '主执行引擎',
        },
      ],
      modules: [],
      agents: [],
      workspaces: [],
      sessions: [],
      progress: [],
      artifacts: [],
    },
  });

  assert.equal(descriptor.surface_kind, 'opl_session_runtime_descriptor');
  assert.deepEqual(
    descriptor.interaction_surfaces.map((surface) => surface.surface_id),
    ['opl_shell', 'codex_explicit', 'acp_shell', 'product_api_projection'],
  );
  assert.deepEqual(descriptor.executor_policy.fallback_executors, ['acp_executor', 'hermes_agent']);
  assert.deepEqual(descriptor.resources.engines.map((engine) => engine.id), ['engine-a', 'engine-z']);
});

test('opl session runtime helper 在未知 interaction surface 上 fail-closed', () => {
  assert.throws(
    () =>
      buildInteractionSurfaceCatalog([
        'opl_shell',
        'unknown_surface' as unknown as 'opl_shell',
      ]),
    /未知 interaction surface/,
  );
});

test('opl session runtime helper 在非法 fallback executor 上 fail-closed', () => {
  assert.throws(
    () =>
      buildExecutorPolicy({
        default_executor: 'codex',
        fallback_executors: ['codex'],
      }),
    /不能包含 default_executor/,
  );
});

test('opl session runtime catalog helper 在重复 runtime_id 上 fail-closed', () => {
  const descriptor = buildOplSessionRuntimeDescriptor({
    runtime_id: 'runtime-core-main',
    summary: 'Runtime core descriptor.',
    default_executor: 'codex',
    resources: {
      system: {
        id: 'opl-runtime-system',
        label: 'OPL Runtime System',
        owner: 'opl_gateway',
        status: 'active',
        summary: 'Canonical runtime core.',
      },
      engines: [],
      modules: [],
      agents: [],
      workspaces: [],
      sessions: [],
      progress: [],
      artifacts: [],
    },
  });

  assert.throws(
    () =>
      buildOplSessionRuntimeCatalog({
        summary: 'runtime catalog',
        runtimes: [descriptor, descriptor],
      }),
    /存在重复值/,
  );
});
