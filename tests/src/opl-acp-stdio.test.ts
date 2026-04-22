import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAcpStdioBridgeState,
  handleAcpStdioRequest,
} from '../../src/opl-acp-stdio.ts';

test('acp stdio initialize handshake 返回最小能力面', async () => {
  const state = createAcpStdioBridgeState();
  const response = await handleAcpStdioRequest(
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
    'prompt',
    'session_updates',
  ]);
});

test('acp stdio session_create 请求返回 translator 视图', async () => {
  const state = createAcpStdioBridgeState();
  await handleAcpStdioRequest({ id: 'req-init-2', command: 'initialize' }, state);

  const response = await handleAcpStdioRequest(
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
                executor_backend: 'codex',
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

test('acp stdio invalid command fail-closed', async () => {
  const state = createAcpStdioBridgeState();
  const response = await handleAcpStdioRequest(
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

test('acp stdio session_list / session_ledger 暴露 bridge lifecycle surfaces', async () => {
  const state = createAcpStdioBridgeState();
  await handleAcpStdioRequest({ id: 'req-init-3', command: 'initialize' }, state);
  await handleAcpStdioRequest(
    {
      id: 'req-create-2',
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
                session_id: 'sess-list-1',
              },
              task: {
                task_id: 'task-list-1',
                status: 'accepted',
                stage: 'queued',
                summary: '请求已受理',
                executor_backend: 'codex',
                session_id: null,
              },
            },
          },
        },
      },
    },
    state,
  );

  const sessions = await handleAcpStdioRequest(
    { id: 'req-list-1', command: 'session_list', payload: { limit: 5 } },
    state,
  );
  assert.equal(sessions.ok, true);
  assert.equal(sessions.result?.surface_id, 'opl_acp_session_list');
  assert.equal(
    (sessions.result as { items: Array<{ session_id: string }> }).items[0]?.session_id,
    'sess-list-1',
  );

  const ledger = await handleAcpStdioRequest({ id: 'req-ledger-1', command: 'session_ledger' }, state);
  assert.equal(ledger.ok, true);
  assert.equal(ledger.result?.surface_id, 'opl_managed_session_ledger');
  assert.equal(
    typeof (ledger.result as { summary?: { entry_count?: number } }).summary?.entry_count,
    'number',
  );
});
