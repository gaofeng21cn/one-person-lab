import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAcpStdioBridgeState,
  handleAcpStdioRequest,
} from '../../src/opl-acp-stdio.ts';

test('acp stdio initialize handshake 返回最小能力面', () => {
  const state = createAcpStdioBridgeState();
  const response = handleAcpStdioRequest(
    {
      id: 'req-init-1',
      command: 'initialize',
    },
    state,
  );

  assert.equal(response.id, 'req-init-1');
  assert.equal(response.command, 'initialize');
  assert.equal(response.ok, true);
  assert.equal(response.error, undefined);
  assert.equal(response.result?.surface_id, 'opl_acp_stdio_bridge');
  assert.deepEqual(response.result?.commands, [
    'initialize',
    'session_list',
    'session_ledger',
    'session_create',
    'session_resume',
    'session_logs',
    'progress',
    'artifacts',
    'workspace_list',
  ]);
});

test('acp stdio session_create 请求返回 translator 视图', () => {
  const state = createAcpStdioBridgeState();
  handleAcpStdioRequest({ id: 'req-init-2', command: 'initialize' }, state);

  const response = handleAcpStdioRequest(
    {
      id: 'req-create-1',
      command: 'session_create',
      payload: {
        version: 'g2',
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: 'submitted',
          payload: {
            product_entry: {
              entry_surface: 'opl_session_api',
              mode: 'ask',
              seed: {
                session_id: 'sess-stdio-1',
              },
              task: {
                task_id: 'task-stdio-1',
                status: 'accepted',
                stage: 'queued',
                summary: '请求已受理',
                executor_backend: 'hermes',
                session_id: null,
              },
            },
          },
        },
      },
    },
    state,
  );

  assert.equal(response.id, 'req-create-1');
  assert.equal(response.command, 'session_create');
  assert.equal(response.ok, true);
  assert.equal(response.error, undefined);
  assert.equal(response.result?.surface_id, 'opl_session_create');
  assert.equal(response.result?.session_id, 'sess-stdio-1');
  assert.equal(response.result?.task_acceptance?.task_id, 'task-stdio-1');
});

test('acp stdio invalid command fail-closed', () => {
  const state = createAcpStdioBridgeState();
  const response = handleAcpStdioRequest(
    {
      id: 'req-unknown-1',
      command: 'session_delete',
    },
    state,
  );

  assert.equal(response.id, 'req-unknown-1');
  assert.equal(response.command, 'session_delete');
  assert.equal(response.ok, false);
  assert.equal(response.result, undefined);
  assert.equal(response.error?.code, 'unknown_command');
});

test('acp stdio session_list / session_ledger / workspace_list 通过 resolver 暴露 shell-callable surface', () => {
  const state = createAcpStdioBridgeState();
  state.commandResolvers.session_list = () => ({
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'sessions',
      limit: 5,
      sessions: [
        {
          session_id: 'sess-list-1',
          source: 'api_server',
          preview: 'Resume the manuscript session',
          updated_at: '2026-04-22T10:00:00Z',
        },
      ],
    },
  });
  state.commandResolvers.session_ledger = () => ({
    version: 'g2',
    session_ledger: {
      surface_id: 'opl_managed_session_ledger',
      ledger_scope: 'opl_product_entry_managed_sessions',
      summary: {
        entry_count: 2,
      },
      sessions: [
        {
          session_id: 'sess-ledger-1',
          event_count: 2,
          last_recorded_at: '2026-04-22T10:05:00Z',
        },
      ],
    },
  });
  state.commandResolvers.workspace_list = () => ({
    workspace_catalog: {
      surface_id: 'opl_workspaces',
      mode: 'catalog',
      summary: {
        active_binding_count: 1,
      },
      projects: [
        {
          project_id: 'medautoscience',
          label: 'Med Auto Science',
          active_binding: {
            workspace_path: '/tmp/mas',
            status: 'active',
          },
        },
      ],
    },
  });

  handleAcpStdioRequest({ id: 'req-init-3', command: 'initialize' }, state);

  const sessions = handleAcpStdioRequest({ id: 'req-list-1', command: 'session_list', payload: { limit: 5 } }, state);
  assert.equal(sessions.ok, true);
  assert.equal(sessions.result?.surface_id, 'opl_local_product_entry_shell');
  assert.equal((sessions.result as { items: Array<{ session_id: string }> }).items[0]?.session_id, 'sess-list-1');

  const ledger = handleAcpStdioRequest({ id: 'req-ledger-1', command: 'session_ledger' }, state);
  assert.equal(ledger.ok, true);
  assert.equal(ledger.result?.surface_id, 'opl_managed_session_ledger');
  assert.equal((ledger.result as { sessions: Array<{ session_id: string }> }).sessions[0]?.session_id, 'sess-ledger-1');

  const workspaces = handleAcpStdioRequest({ id: 'req-workspaces-1', command: 'workspace_list' }, state);
  assert.equal(workspaces.ok, true);
  assert.equal(workspaces.result?.surface_id, 'opl_workspaces');
  assert.equal(
    (workspaces.result as { projects: Array<{ project_id: string }> }).projects[0]?.project_id,
    'medautoscience',
  );
});
