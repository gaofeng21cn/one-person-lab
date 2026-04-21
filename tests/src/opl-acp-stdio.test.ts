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
    'session_create',
    'session_resume',
    'session_logs',
    'progress',
    'artifacts',
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
