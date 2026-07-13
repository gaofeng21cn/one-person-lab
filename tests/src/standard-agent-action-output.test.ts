import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  commitStandardAgentActionOutput,
  prepareStandardAgentActionRunRequest,
} from '../../src/modules/workspace/standard-agent-action-output.ts';
import {
  buildStandardAgentActionRunLedgerEvent,
  recordStandardAgentActionRunEvent,
} from '../../src/modules/ledger/standard-agent-action-run-ledger.ts';
import {
  createFamilyRuntimeQueueTables,
} from '../../src/modules/runway/family-runtime-store.ts';

function sha256(bytes: Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-action-output-'));
}

function actionInput(root: string, runId: string) {
  return {
    workspaceRoot: root,
    runId,
    domainId: 'mas',
    actionId: 'authority-evaluate',
    requestBytes: Buffer.from('{"a":1,"z":[3,{"a":"value","b":true}]}\n', 'utf8'),
    outputBytes: Buffer.from('{"result":"exact"}\n', 'utf8'),
  };
}

test('Workspace atomically preserves canonical request bytes and exact handler stdout bytes', () => {
  const root = workspace();
  try {
    const input = actionInput(root, 'run-001');
    const persisted = commitStandardAgentActionOutput(input);

    assert.equal(persisted.status, 'materialized');
    assert.deepEqual(fs.readFileSync(persisted.request.file_path), input.requestBytes);
    assert.deepEqual(fs.readFileSync(persisted.output.file_path), input.outputBytes);
    assert.equal(persisted.request.sha256, sha256(input.requestBytes));
    assert.equal(persisted.output.sha256, sha256(input.outputBytes));
    assert.equal(persisted.request.byte_size, input.requestBytes.byteLength);
    assert.equal(persisted.output.byte_size, input.outputBytes.byteLength);
    assert.match(persisted.request.ref, /^file:/);
    assert.match(persisted.output.ref, /^file:/);
    assert.equal(
      path.relative(fs.realpathSync.native(root), persisted.action_run_dir),
      path.join('control', 'opl', 'action_runs', 'run-001'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Workspace exposes a SHA-bound request before a StageRun output is available', () => {
  const root = workspace();
  try {
    const input = actionInput(root, 'stage-run-input');
    const prepared = prepareStandardAgentActionRunRequest(input);
    assert.equal(prepared.status, 'prepared');
    assert.equal(fs.existsSync(path.join(prepared.action_run_dir, 'output.json')), false);
    assert.deepEqual(fs.readFileSync(prepared.request.file_path), input.requestBytes);
    assert.equal(
      prepareStandardAgentActionRunRequest(input).status,
      'already_prepared',
    );

    const completed = commitStandardAgentActionOutput(input);
    assert.equal(completed.status, 'materialized');
    assert.equal(completed.request.sha256, prepared.request.sha256);
    assert.deepEqual(fs.readFileSync(completed.output.file_path), input.outputBytes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Workspace action output is idempotent only for an exact run identity and exact bytes', () => {
  const root = workspace();
  try {
    const input = actionInput(root, 'same-run');
    commitStandardAgentActionOutput(input);
    assert.equal(commitStandardAgentActionOutput(input).status, 'already_materialized');
    assert.throws(
      () => commitStandardAgentActionOutput({
        ...input,
        outputBytes: Buffer.from('{"ok":false}\n'),
      }),
      /bytes conflict with the existing run identity/,
    );
    assert.throws(
      () => commitStandardAgentActionOutput({
        ...input,
        domainId: 'mag',
      }),
      /bytes conflict with the existing run identity/,
    );
    assert.throws(
      () => commitStandardAgentActionOutput({
        ...input,
        actionId: 'different-action',
      }),
      /bytes conflict with the existing run identity/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Workspace action output rejects path traversal and symbolic-link containment escape', () => {
  const root = workspace();
  const outside = workspace();
  try {
    assert.throws(
      () => commitStandardAgentActionOutput({
        ...actionInput(root, '../escape'),
      }),
      /single safe path segment/,
    );
    fs.mkdirSync(path.join(root, 'control', 'opl'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'control', 'opl', 'action_runs'));
    assert.throws(
      () => commitStandardAgentActionOutput(actionInput(root, 'run-escape')),
      /symbolic-link component/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Workspace action output rejects partial runs and symbolic-link byte files', () => {
  const root = workspace();
  const outside = workspace();
  try {
    const partial = path.join(root, 'control', 'opl', 'action_runs', 'partial-run');
    fs.mkdirSync(partial, { recursive: true });
    fs.writeFileSync(path.join(partial, 'identity.json'), '{}\n');
    assert.throws(
      () => commitStandardAgentActionOutput(actionInput(root, 'partial-run')),
      /partially materialized/,
    );

    const input = actionInput(root, 'linked-bytes');
    const persisted = commitStandardAgentActionOutput(input);
    const outsideRequest = path.join(outside, 'request.json');
    fs.writeFileSync(outsideRequest, input.requestBytes);
    fs.rmSync(persisted.request.file_path);
    fs.symlinkSync(outsideRequest, persisted.request.file_path);
    assert.throws(
      () => commitStandardAgentActionOutput(input),
      /request path is not a regular file/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Ledger writes refs-only action metadata into family-runtime SQLite', () => {
  const root = workspace();
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const persisted = commitStandardAgentActionOutput({
      ...actionInput(root, 'ledger-run'),
      requestBytes: Buffer.from('{"private_body":"stays in request.json only"}\n'),
      outputBytes: Buffer.from('{"domain_body":"stays in output.json only"}\n'),
    });
    const input = {
      runId: 'ledger-run',
      domainId: 'mas',
      actionId: 'authority-evaluate',
      bindingRef: 'handler:mas.authority-evaluate',
      status: 'completed' as const,
      startedAt: '2026-07-13T03:00:00.000Z',
      completedAt: '2026-07-13T03:00:01.000Z',
      input: {
        ref: persisted.request.ref,
        sha256: persisted.request.sha256,
        byte_size: persisted.request.byte_size,
      },
      output: {
        ref: persisted.output.ref,
        sha256: persisted.output.sha256,
        byte_size: persisted.output.byte_size,
      },
    };

    const event = buildStandardAgentActionRunLedgerEvent(input);
    const recorded = recordStandardAgentActionRunEvent({ db, ...input });
    assert.deepEqual(recorded.ledger_entry, event.payload);
    assert.equal(recorded.recorded_event.event_type, 'standard_agent_action_run_recorded');

    const row = db.prepare(`
      SELECT task_id, domain_id, event_type, source, payload_json
      FROM events
    `).get() as {
      task_id: string | null;
      domain_id: string;
      event_type: string;
      source: string;
      payload_json: string;
    };
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    assert.equal(row.task_id, null);
    assert.equal(row.domain_id, 'mas');
    assert.equal(row.event_type, 'standard_agent_action_run_recorded');
    assert.equal(row.source, 'opl_hosted_standard_agent_action');
    assert.equal(payload.binding_ref, 'handler:mas.authority-evaluate');
    assert.deepEqual(Object.keys(payload.input as object).sort(), ['byte_size', 'ref', 'sha256']);
    assert.deepEqual(Object.keys(payload.output as object).sort(), ['byte_size', 'ref', 'sha256']);
    assert.deepEqual(payload.authority_boundary, {
      refs_only: true,
      contains_domain_body: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_authorize_quality_or_export: false,
    });
    const encoded = JSON.stringify(payload);
    assert.equal(encoded.includes('stays in request.json only'), false);
    assert.equal(encoded.includes('stays in output.json only'), false);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Ledger rejects body fields and malformed byte identities before SQLite mutation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const input = {
      db,
      runId: 'blocked-body',
      domainId: 'mas',
      actionId: 'authority-evaluate',
      bindingRef: 'handler:mas.authority-evaluate',
      status: 'completed' as const,
      startedAt: '2026-07-13T03:00:00.000Z',
      completedAt: '2026-07-13T03:00:01.000Z',
      input: { ref: 'file:///tmp/request.json', sha256: 'a'.repeat(64), byte_size: 2 },
      output: { ref: 'file:///tmp/output.json', sha256: 'b'.repeat(64), byte_size: 2 },
    };
    assert.throws(
      () => recordStandardAgentActionRunEvent({
        ...input,
        outputBody: { forbidden: true },
      } as typeof input),
      /contains forbidden fields/,
    );
    assert.throws(
      () => recordStandardAgentActionRunEvent({
        ...input,
        output: { ...input.output, sha256: 'not-a-digest' },
      }),
      /must be lowercase SHA-256/,
    );
    const count = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
    assert.equal(count.count, 0);
  } finally {
    db.close();
  }
});
