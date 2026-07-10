import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveOplStatePaths } from '../../src/kernel/runtime-state-paths.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  importCloudContinuation,
  listCloudChanges,
  listCloudConflicts,
  listPendingCloudMutations,
  pullCloudChanges,
  pushCloudOutbox,
  queueCloudMutation,
  readCloudCursor,
  resolveCanonicalAlias,
  saveCanonicalAlias,
  saveCloudChange,
  saveCloudCursor,
} from '../../src/modules/workspace/cloud-sync.ts';

async function withStateDir(run: () => void | Promise<void>) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cloud-sync-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

test('workspace cloud sync persists outbox identity, aliases, and monotonic cursors', async () => {
  await withStateDir(() => {
    const queued = queueCloudMutation({
      operationId: 'operation-persist',
      workspaceId: 'workspace-alpha',
      entityKind: 'project',
      localId: 'local-project-alpha',
      projectId: 'project-alpha',
      baseVersion: 1,
      operation: 'replace',
      payload: { title: 'Offline title' },
    });
    const pending = listPendingCloudMutations('workspace-alpha');
    assert.equal(pending[0].operation_id, queued.operation_id);
    assert.equal(pending[0].idempotency_key, queued.idempotency_key);
    assert.deepEqual(pending[0].payload, { title: 'Offline title' });

    saveCanonicalAlias('workspace-alpha', 'local-project-alpha', 'project-alpha', 'project');
    assert.equal(resolveCanonicalAlias('workspace-alpha', 'local-project-alpha', 'project'), 'project-alpha');
    saveCanonicalAlias('workspace-beta', 'local-project-alpha', 'project-beta', 'project');
    assert.equal(resolveCanonicalAlias('workspace-beta', 'local-project-alpha', 'project'), 'project-beta');
    assert.throws(
      () => saveCanonicalAlias('workspace-alpha', 'local-project-alpha', 'project-other', 'project'),
      /canonical alias already bound/,
    );
    saveCloudCursor('workspace-alpha', 12);
    saveCloudCursor('workspace-alpha', 4);
    assert.equal(readCloudCursor('workspace-alpha'), 12);
  });
});

test('workspace cloud sync deduplicates caller-stable queue identity and rejects credential payloads', async () => {
  await withStateDir(() => {
    const input = {
      operationId: 'operation-alpha',
      workspaceId: 'workspace-alpha',
      entityKind: 'project' as const,
      localId: 'local-project-alpha',
      projectId: 'project-alpha',
      baseVersion: 1,
      operation: 'replace' as const,
      payload: { title: 'Offline title' },
    };
    const first = queueCloudMutation(input);
    const replay = queueCloudMutation(input);
    assert.equal(replay.operation_id, first.operation_id);
    assert.equal(replay.idempotency_key, first.idempotency_key);
    assert.equal(listPendingCloudMutations('workspace-alpha').length, 1);
    assert.throws(
      () => queueCloudMutation({ ...input, payload: { title: 'Changed' } }),
      /operation identity already bound/,
    );
    assert.throws(
      () => queueCloudMutation({ ...input, operationId: 'operation-secret', payload: { auth: { accessToken: 'secret' } } }),
      /unsupported metadata field/,
    );
  });
});

test('workspace cloud sync retries push identity and surfaces non-durable conflicts', async () => {
  await withStateDir(async () => {
    const queued = queueCloudMutation({
      operationId: 'operation-push',
      workspaceId: 'workspace-alpha',
      entityKind: 'project',
      localId: 'local-project-alpha',
      projectId: 'project-alpha',
      baseVersion: 1,
      operation: 'replace',
      payload: { title: 'Offline title' },
    });
    const requests: Array<{ key: string | null; operationId: unknown }> = [];
    let attempt = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = parseJsonText(String(init?.body)) as Record<string, unknown>;
      requests.push({ key: new Headers(init?.headers).get('Idempotency-Key'), operationId: body.operationId });
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return new Response(JSON.stringify({ status: 'accepted', projectId: 'project-alpha', taskId: '' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };
    const options = {
      origin: 'https://cloud.example', workspaceId: 'workspace-alpha', organizationId: 'org-alpha',
      clientId: 'client-alpha', sessionCookie: 'opl_session=secret', csrfToken: 'csrf-secret', fetchImpl,
    };
    await pushCloudOutbox(options);
    await pushCloudOutbox(options);
    assert.deepEqual(requests, [
      { key: queued.idempotency_key, operationId: queued.operation_id },
      { key: queued.idempotency_key, operationId: queued.operation_id },
    ]);
    assert.equal(listPendingCloudMutations('workspace-alpha').length, 0);

    queueCloudMutation({
      operationId: 'operation-conflict',
      workspaceId: 'workspace-alpha', entityKind: 'project', localId: 'local-project-beta',
      projectId: 'project-beta', baseVersion: 1, operation: 'replace', payload: {},
    });
    await assert.rejects(
      pushCloudOutbox({
        ...options,
        fetchImpl: async () => new Response(JSON.stringify({ error: 'idempotency_conflict' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      }),
      /cloud sync push conflict: idempotency_conflict/,
    );
  });
});

test('workspace cloud sync stores pull events before advancing its cursor', async () => {
  await withStateDir(async () => {
    const accepted = { id: 'event-one', cursor: 1, status: 'accepted', payload: { title: 'Cloud' } };
    const conflict = { id: 'event-two', conflictId: 'conflict-one', cursor: 2, status: 'conflict' };
    await pullCloudChanges({
      origin: 'https://cloud.example',
      workspaceId: 'workspace-alpha',
      sessionCookie: 'opl_session=secret',
      fetchImpl: async () => new Response(JSON.stringify({ changes: [conflict, accepted], nextCursor: 2, hasMore: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });
    assert.deepEqual(listCloudChanges('workspace-alpha'), [accepted]);
    assert.deepEqual(listCloudConflicts('workspace-alpha'), [conflict]);
    assert.equal(readCloudCursor('workspace-alpha'), 2);

    assert.throws(
      () => saveCloudChange('workspace-alpha', { id: 'event-other', cursor: 1, status: 'accepted' }),
      /cloud change cursor already bound/,
    );

    const applied: string[] = [];
    await pullCloudChanges({
      origin: 'https://cloud.example',
      workspaceId: 'workspace-beta',
      sessionCookie: 'opl_session=secret',
      applyChange: (change) => {
        assert.deepEqual(listCloudChanges('workspace-beta'), [change]);
        applied.push(String(change.id));
      },
      fetchImpl: async () => new Response(JSON.stringify({
        changes: [{ id: 'event-three', cursor: 1, status: 'accepted' }],
        nextCursor: 1,
        hasMore: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    assert.deepEqual(applied, ['event-three']);

    await assert.rejects(
      pullCloudChanges({
        origin: 'https://cloud.example',
        workspaceId: 'workspace-gamma',
        sessionCookie: 'opl_session=secret',
        fetchImpl: async () => new Response(JSON.stringify({
          changes: [{ id: 'event-four', cursor: 1, status: 'future_status' }],
          nextCursor: 1,
          hasMore: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
      }),
      /invalid cloud change status/,
    );
    assert.equal(readCloudCursor('workspace-gamma'), 0);

    await assert.rejects(
      pullCloudChanges({
        origin: 'https://cloud.example',
        workspaceId: 'workspace-delta',
        sessionCookie: 'opl_session=secret',
        fetchImpl: async () => new Response(JSON.stringify({
          changes: [{
            id: 'event-five', cursor: 1, status: 'accepted',
            payload: { title: 'Cloud', clientSecret: 'must-not-persist' },
          }],
          nextCursor: 1,
          hasMore: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
      }),
      /unsupported metadata field/,
    );
    assert.deepEqual(listCloudChanges('workspace-delta'), []);
    assert.equal(readCloudCursor('workspace-delta'), 0);
  });
});

test('workspace cloud continuation is identity-bound, refs-only, and path-contained', async () => {
  await withStateDir(() => {
    saveCanonicalAlias('workspace-alpha', 'local-project-alpha', 'project-alpha', 'project');
    saveCanonicalAlias('workspace-alpha', 'local-task-alpha', 'task-alpha', 'task');
    assert.throws(() => importCloudContinuation({
      workspaceId: 'workspace-alpha',
      localProjectId: 'local-project-alpha', localTaskId: 'local-task-alpha',
      continuation: { continuationId: 'c', receiptId: 'r', projectId: 'other', taskId: 'task-alpha' },
    }), /identity mismatch/);
    const refs = importCloudContinuation({
      workspaceId: 'workspace-alpha',
      localProjectId: 'local-project-alpha', localTaskId: 'local-task-alpha',
      continuation: {
        continuationId: 'continuation-alpha', receiptId: 'receipt-alpha',
        projectId: 'project-alpha', taskId: 'task-alpha', token: 'secret', artifactBytes: 'bytes',
      },
    });
    assert.deepEqual(refs, {
      continuationId: 'continuation-alpha', receiptId: 'receipt-alpha',
      projectId: 'project-alpha', taskId: 'task-alpha',
    });
    assert.doesNotMatch(
      fs.readFileSync(path.join(resolveOplStatePaths().task_state_dir, 'local-task-alpha', 'cloud-continuation.json'), 'utf8'),
      /secret|bytes/,
    );
    saveCanonicalAlias('workspace-alpha', '..', 'task-parent', 'task');
    assert.throws(() => importCloudContinuation({
      workspaceId: 'workspace-alpha',
      localProjectId: 'local-project-alpha', localTaskId: '..',
      continuation: { continuationId: 'c', receiptId: 'r', projectId: 'project-alpha', taskId: 'task-parent' },
    }), /invalid local task id/);

    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-continuation-external-'));
    const taskLink = path.join(resolveOplStatePaths().task_state_dir, 'linked-task');
    fs.mkdirSync(resolveOplStatePaths().task_state_dir, { recursive: true });
    fs.symlinkSync(external, taskLink, 'dir');
    saveCanonicalAlias('workspace-alpha', 'linked-task', 'task-linked', 'task');
    assert.throws(() => importCloudContinuation({
      workspaceId: 'workspace-alpha',
      localProjectId: 'local-project-alpha', localTaskId: 'linked-task',
      continuation: { continuationId: 'c', receiptId: 'r', projectId: 'project-alpha', taskId: 'task-linked' },
    }), /symlink/);
    assert.equal(fs.existsSync(path.join(external, 'cloud-continuation.json')), false);
    fs.rmSync(external, { recursive: true, force: true });
  });
});
