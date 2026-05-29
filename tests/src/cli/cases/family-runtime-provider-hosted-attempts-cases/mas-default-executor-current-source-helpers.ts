import { DatabaseSync } from 'node:sqlite';

import {
  fs,
  os,
  path,
} from './helpers.ts';

import { createFamilyRuntimeQueueTables } from '../../../../../src/family-runtime-store.ts';

export function withIsolatedFamilyRuntimeEnv<T>(fn: () => T) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
  };
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-source-test-'));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

export function createQueueTables(db: DatabaseSync) {
  createFamilyRuntimeQueueTables(db);
}

export function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'ai_reviewer_record_production_handoff',
    next_executable_owner: 'ai_reviewer',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

export function defaultExecutorPayloadForOwner(input: {
  sourceFingerprint: string;
  actionType: string;
  nextOwner: 'write' | 'ai_reviewer';
  dispatchAuthority: string;
  dispatchRef: string;
}) {
  return {
    ...defaultExecutorPayload(input.sourceFingerprint),
    action_type: input.actionType,
    dispatch_authority: input.dispatchAuthority,
    next_executable_owner: input.nextOwner,
    dispatch_ref: input.dispatchRef,
  };
}

export function insertQueuedDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    sourceFingerprint: string;
    createdAt: string;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(defaultExecutorPayload(input.sourceFingerprint)),
    `mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:${input.sourceFingerprint}`,
    65,
    'queued',
    0,
    3,
    'test-domain-export',
    0,
    null,
    null,
    null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

export function insertDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    sourceFingerprint: string;
    createdAt: string;
    status: string;
    attempts?: number;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(defaultExecutorPayload(input.sourceFingerprint)),
    `mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:${input.sourceFingerprint}`,
    65,
    input.status,
    input.attempts ?? 0,
    3,
    'test-domain-export',
    0,
    null,
    input.leaseOwner ?? null,
    input.leaseExpiresAt ?? null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

export function insertDefaultExecutorTaskWithPayload(
  db: DatabaseSync,
  input: {
    taskId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    createdAt: string;
    status: string;
    attempts?: number;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(input.payload),
    input.dedupeKey,
    65,
    input.status,
    input.attempts ?? 0,
    3,
    'test-domain-export',
    0,
    null,
    input.leaseOwner ?? null,
    input.leaseExpiresAt ?? null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}
