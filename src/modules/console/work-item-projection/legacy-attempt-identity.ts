import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { record, stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import { readStandardAgentActionStoredBytes } from '../../workspace/public/standard-agent-action-runtime.ts';

const ACTION_REQUEST_IDENTITY_FIELDS = ['work_item_id', 'study_id', 'quest_id'] as const;
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ACTION_REQUEST_BYTES = 1_048_576;

export type RecoveredAttemptIdentity = {
  workItemId: string;
  actionRequestRef: string;
  actionRequestSha256: string;
};

export type AttemptIdentityRecovery = {
  identity: RecoveredAttemptIdentity | null;
  failure: {
    reason: string;
    details: JsonRecord;
  } | null;
};

function failure(reason: string, details: JsonRecord = {}): AttemptIdentityRecovery {
  return { identity: null, failure: { reason, details } };
}

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function stableWorkspaceRoot(value: string) {
  if (!path.isAbsolute(value)) return null;
  try {
    const real = fs.realpathSync.native(value);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

function normalizedIdentity(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function requestIdentity(payload: JsonRecord): AttemptIdentityRecovery {
  const declared = new Map<string, string>();
  for (const field of ACTION_REQUEST_IDENTITY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = normalizedIdentity(payload[field]);
    if (!value) {
      return failure('action_request_identity_field_invalid', { field });
    }
    declared.set(field, value);
  }
  const values = [...new Set(declared.values())];
  if (values.length === 0) {
    return failure('action_request_identity_missing', {
      expected_fields: [...ACTION_REQUEST_IDENTITY_FIELDS],
    });
  }
  if (values.length > 1) {
    return failure('action_request_identity_conflicting', {
      declared_fields: Object.fromEntries(declared),
    });
  }
  return {
    identity: {
      workItemId: values[0]!,
      actionRequestRef: '',
      actionRequestSha256: '',
    },
    failure: null,
  };
}

function actionRequestPath(input: {
  workspaceRoot: string;
  ref: string;
}) {
  let url: URL;
  try {
    url = new URL(input.ref);
  } catch {
    return { path: null, failure: failure('action_request_ref_invalid_url') };
  }
  if (url.protocol !== 'file:' || url.hostname !== '' || url.search || url.hash) {
    return {
      path: null,
      failure: failure('action_request_ref_not_local_file', {
        protocol: url.protocol,
        hostname: url.hostname,
      }),
    };
  }
  let requestPath: string;
  try {
    requestPath = fileURLToPath(url);
  } catch {
    return { path: null, failure: failure('action_request_ref_path_invalid') };
  }
  const lexicalWorkspaceRoot = path.resolve(input.workspaceRoot);
  const lexicalRequestPath = path.resolve(requestPath);
  if (!contained(lexicalWorkspaceRoot, lexicalRequestPath)) {
    return {
      path: null,
      failure: failure('action_request_ref_escapes_workspace', {
        workspace_root: lexicalWorkspaceRoot,
        request_path: lexicalRequestPath,
      }),
    };
  }
  const lexicalRelative = path.relative(lexicalWorkspaceRoot, lexicalRequestPath).split(path.sep);
  if (
    lexicalRelative.length !== 5
    || lexicalRelative[0] !== 'control'
    || lexicalRelative[1] !== 'opl'
    || lexicalRelative[2] !== 'action_runs'
    || !SAFE_RUN_ID.test(lexicalRelative[3] ?? '')
    || lexicalRelative[4] !== 'request.json'
  ) {
    return {
      path: null,
      failure: failure('action_request_ref_layout_invalid', {
        relative_path: path.relative(lexicalWorkspaceRoot, lexicalRequestPath),
      }),
    };
  }
  let current = lexicalWorkspaceRoot;
  for (const [index, segment] of lexicalRelative.entries()) {
    current = path.join(current, segment);
    let component: fs.Stats;
    try {
      component = fs.lstatSync(current);
    } catch {
      return { path: null, failure: failure('action_request_ref_missing', { ref: input.ref }) };
    }
    if (component.isSymbolicLink()) {
      return {
        path: null,
        failure: failure('action_request_ref_symbolic_link', {
          symbolic_link_path: current,
        }),
      };
    }
    const finalComponent = index === lexicalRelative.length - 1;
    if ((!finalComponent && !component.isDirectory()) || (finalComponent && !component.isFile())) {
      return {
        path: null,
        failure: failure('action_request_ref_not_regular_file', {
          invalid_component_path: current,
        }),
      };
    }
  }
  const workspaceRoot = stableWorkspaceRoot(input.workspaceRoot);
  if (!workspaceRoot) {
    return { path: null, failure: failure('action_request_workspace_root_invalid') };
  }
  let realRequestPath: string;
  try {
    realRequestPath = fs.realpathSync.native(requestPath);
  } catch {
    return { path: null, failure: failure('action_request_ref_missing', { ref: input.ref }) };
  }
  if (!contained(workspaceRoot, realRequestPath)) {
    return {
      path: null,
      failure: failure('action_request_ref_escapes_workspace', {
        workspace_root: workspaceRoot,
        request_path: realRequestPath,
      }),
    };
  }
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(realRequestPath);
  } catch {
    return { path: null, failure: failure('action_request_ref_missing', { ref: input.ref }) };
  }
  if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size)) {
    return {
      path: null,
      failure: failure('action_request_ref_not_regular_file', {
        symbolic_link: stat.isSymbolicLink(),
        regular_file: stat.isFile(),
      }),
    };
  }
  if (stat.size > MAX_ACTION_REQUEST_BYTES) {
    return {
      path: null,
      failure: failure('action_request_ref_too_large', {
        byte_size: stat.size,
        max_byte_size: MAX_ACTION_REQUEST_BYTES,
      }),
    };
  }
  return { path: realRequestPath, byteSize: stat.size, failure: null };
}

export function recoverLegacyAttemptIdentity(input: {
  workspaceRoot: string;
  actionRequestRef: string | null;
  actionRequestSha256: string | null;
}): AttemptIdentityRecovery {
  if (!input.actionRequestRef || !input.actionRequestSha256) {
    return failure('action_request_identity_ref_missing', {
      action_request_ref_present: Boolean(input.actionRequestRef),
      action_request_sha256_present: Boolean(input.actionRequestSha256),
    });
  }
  if (!SHA256.test(input.actionRequestSha256)) {
    return failure('action_request_sha256_invalid');
  }
  const resolved = actionRequestPath({ workspaceRoot: input.workspaceRoot, ref: input.actionRequestRef });
  if (!resolved.path || resolved.failure) return resolved.failure!;
  let bytes: Buffer;
  try {
    bytes = readStandardAgentActionStoredBytes({
      ref: input.actionRequestRef,
      file_path: resolved.path,
      sha256: input.actionRequestSha256,
      byte_size: resolved.byteSize!,
    }, 'legacy action request');
  } catch (error) {
    return failure('action_request_digest_mismatch', {
      ref: input.actionRequestRef,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  let payload: unknown;
  try {
    payload = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    return failure('action_request_json_invalid', {
      ref: input.actionRequestRef,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(payload)) return failure('action_request_payload_not_object');
  const identity = requestIdentity(payload);
  if (!identity.identity || identity.failure) {
    return failure(
      identity.failure?.reason ?? 'action_request_identity_unknown_failure',
      identity.failure?.details ?? {},
    );
  }
  const declaredWorkspace = stringValue(payload.workspace_root) ?? stringValue(payload.workspace_path);
  if (declaredWorkspace) {
    const expectedRoot = stableWorkspaceRoot(input.workspaceRoot);
    const requestRoot = stableWorkspaceRoot(declaredWorkspace);
    if (!expectedRoot || !requestRoot || expectedRoot !== requestRoot) {
      return failure('action_request_workspace_identity_mismatch', {
        expected_workspace_root: expectedRoot ?? input.workspaceRoot,
        declared_workspace_root: declaredWorkspace,
      });
    }
  }
  return {
    identity: {
      workItemId: identity.identity.workItemId,
      actionRequestRef: input.actionRequestRef,
      actionRequestSha256: input.actionRequestSha256,
    },
    failure: null,
  };
}

export function explicitAttemptWorkItemId(attempt: JsonRecord) {
  const locator = record(attempt.workspace_locator);
  const taskIntake = record(locator.task_intake_ref);
  const fields = [
    locator.work_item_id,
    locator.study_id,
    locator.quest_id,
    locator.work_unit_id,
    locator.task_or_work_unit_ref,
    locator.task_ref,
    taskIntake.work_item_id,
    taskIntake.study_id,
  ]
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean);
  return [...new Set(fields)].length === 1 ? fields[0]! : null;
}

export function hasExplicitAttemptWorkItemIdentity(attempt: JsonRecord) {
  const locator = record(attempt.workspace_locator);
  const taskIntake = record(locator.task_intake_ref);
  return [
    locator.work_item_id,
    locator.study_id,
    locator.quest_id,
    locator.work_unit_id,
    locator.task_or_work_unit_ref,
    locator.task_ref,
    taskIntake.work_item_id,
    taskIntake.study_id,
  ].some((value) => typeof value === 'string' && Boolean(value.trim()));
}
