import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

const HELPER_PATH = fileURLToPath(new URL(
  '../../../python/opl_framework/work_item_file_boundary.py',
  import.meta.url,
));
const HELPER_TIMEOUT_MS = 120_000;
const HELPER_MAX_BUFFER_BYTES = 1024 * 1024;

export type WorkItemFileBoundaryFailureCode =
  | 'work_item_file_boundary_helper_unavailable'
  | 'work_item_file_boundary_root_invalid'
  | 'work_item_file_boundary_root_drift'
  | 'work_item_file_boundary_root_attestation_mismatch'
  | 'work_item_file_boundary_escape'
  | 'work_item_file_boundary_ref_invalid'
  | 'work_item_file_boundary_ref_drift'
  | 'work_item_file_boundary_ref_hard_link'
  | 'work_item_file_boundary_ref_unreadable'
  | 'work_item_file_boundary_size_limit';

const WORK_ITEM_FILE_BOUNDARY_FAILURE_CODES = new Set<WorkItemFileBoundaryFailureCode>([
  'work_item_file_boundary_helper_unavailable',
  'work_item_file_boundary_root_invalid',
  'work_item_file_boundary_root_drift',
  'work_item_file_boundary_root_attestation_mismatch',
  'work_item_file_boundary_escape',
  'work_item_file_boundary_ref_invalid',
  'work_item_file_boundary_ref_drift',
  'work_item_file_boundary_ref_hard_link',
  'work_item_file_boundary_ref_unreadable',
  'work_item_file_boundary_size_limit',
]);

export class WorkItemFileBoundaryError extends FrameworkContractError {
  readonly failureCode: WorkItemFileBoundaryFailureCode;

  constructor(
    failureCode: WorkItemFileBoundaryFailureCode,
    message: string,
    details: Record<string, unknown>,
  ) {
    super('contract_shape_invalid', message, {
      failure_code: failureCode,
      ...details,
    });
    this.name = 'WorkItemFileBoundaryError';
    this.failureCode = failureCode;
  }
}

export const WORK_ITEM_ROOT_IDENTITY_VERSION = 'opl-work-item-root-identity.v1' as const;

export type WorkItemRootIdentity = {
  surface_kind: 'opl_work_item_root_identity';
  version: typeof WORK_ITEM_ROOT_IDENTITY_VERSION;
  workspace_device: string;
  workspace_inode: string;
  work_item_device: string;
  work_item_inode: string;
};

export type StableWorkItemFileObservation = {
  real_path: string;
  sha256: string;
  byte_size: number;
};

function decimalIdentity(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new WorkItemFileBoundaryError(
      'work_item_file_boundary_root_invalid',
      'Work-item root identity requires canonical decimal device and inode fields.',
      { field, value },
    );
  }
  return value;
}

export function requireWorkItemRootIdentity(value: unknown): WorkItemRootIdentity {
  const expectedKeys = [
    'surface_kind',
    'version',
    'workspace_device',
    'workspace_inode',
    'work_item_device',
    'work_item_inode',
  ].sort();
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new WorkItemFileBoundaryError(
      'work_item_file_boundary_root_invalid',
      'Work-item root identity must use its exact canonical shape.',
      { received_fields: isRecord(value) ? Object.keys(value).sort() : null },
    );
  }
  if (
    value.surface_kind !== 'opl_work_item_root_identity'
    || value.version !== WORK_ITEM_ROOT_IDENTITY_VERSION
  ) {
    throw new WorkItemFileBoundaryError(
      'work_item_file_boundary_root_invalid',
      'Work-item root identity has an unsupported envelope.',
      { surface_kind: value.surface_kind, version: value.version },
    );
  }
  return {
    surface_kind: 'opl_work_item_root_identity',
    version: WORK_ITEM_ROOT_IDENTITY_VERSION,
    workspace_device: decimalIdentity(value.workspace_device, 'workspace_device'),
    workspace_inode: decimalIdentity(value.workspace_inode, 'workspace_inode'),
    work_item_device: decimalIdentity(value.work_item_device, 'work_item_device'),
    work_item_inode: decimalIdentity(value.work_item_inode, 'work_item_inode'),
  };
}

function helperFailure(input: {
  message: string;
  ref: string;
  operation: string;
  details?: Record<string, unknown>;
}): never {
  throw new WorkItemFileBoundaryError(
    'work_item_file_boundary_helper_unavailable',
    input.message,
    {
      ref: input.ref,
      helper_operation: input.operation,
      helper_path: HELPER_PATH,
      ...(input.details ?? {}),
    },
  );
}

function helperCommand() {
  const managedPython = process.env.OPL_MANAGED_PYTHON?.trim();
  return managedPython || 'python3';
}

function helperEnvironment() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
  };
  if (!process.env.NODE_TEST_CONTEXT) {
    delete env.OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK;
  }
  return env;
}

function parseHelperEnvelope(stdout: string, input: { ref: string; operation: string }) {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    return helperFailure({
      message: 'Work-item file boundary helper returned invalid JSON.',
      ...input,
      details: {
        helper_stdout: stdout.slice(0, 512),
        parse_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  if (!isRecord(envelope) || typeof envelope.ok !== 'boolean') {
    return helperFailure({
      message: 'Work-item file boundary helper returned an invalid protocol envelope.',
      ...input,
      details: { helper_envelope: envelope },
    });
  }
  if (envelope.ok) {
    if (!isRecord(envelope.result)) {
      return helperFailure({
        message: 'Work-item file boundary helper omitted its result.',
        ...input,
      });
    }
    return envelope.result;
  }
  const failure = isRecord(envelope.error) ? envelope.error : {};
  const failureCode = typeof failure.failure_code === 'string'
    && WORK_ITEM_FILE_BOUNDARY_FAILURE_CODES.has(
      failure.failure_code as WorkItemFileBoundaryFailureCode,
    )
    ? failure.failure_code as WorkItemFileBoundaryFailureCode
    : 'work_item_file_boundary_helper_unavailable';
  throw new WorkItemFileBoundaryError(
    failureCode,
    typeof failure.message === 'string' && failure.message.trim()
      ? failure.message.trim()
      : 'Work-item file boundary helper rejected the request.',
    {
      ref: input.ref,
      helper_operation: input.operation,
      ...(isRecord(failure.details) ? failure.details : {}),
    },
  );
}

function runBoundaryHelper(
  request: Record<string, unknown>,
  input: { ref: string; operation: string },
) {
  if (!fs.existsSync(HELPER_PATH)) {
    return helperFailure({
      message: 'Work-item file boundary helper is absent from the Framework payload.',
      ...input,
    });
  }
  const command = helperCommand();
  const result = spawnSync(command, [HELPER_PATH], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    env: helperEnvironment(),
    timeout: HELPER_TIMEOUT_MS,
    maxBuffer: HELPER_MAX_BUFFER_BYTES,
  });
  if (result.error) {
    return helperFailure({
      message: 'Work-item file boundary helper could not be executed.',
      ...input,
      details: {
        helper_command: command,
        helper_error: result.error.message,
        helper_signal: result.signal,
      },
    });
  }
  if (!result.stdout.trim()) {
    return helperFailure({
      message: 'Work-item file boundary helper returned no protocol result.',
      ...input,
      details: {
        helper_command: command,
        helper_exit_code: result.status,
        helper_signal: result.signal,
        helper_stderr: result.stderr.slice(0, 512),
      },
    });
  }
  const parsed = parseHelperEnvelope(result.stdout, input);
  if (result.status !== 0) {
    return helperFailure({
      message: 'Work-item file boundary helper failed without a typed rejection.',
      ...input,
      details: {
        helper_command: command,
        helper_exit_code: result.status,
        helper_signal: result.signal,
        helper_stderr: result.stderr.slice(0, 512),
      },
    });
  }
  return parsed;
}

export function captureWorkItemRootIdentity(input: {
  workspaceRoot: string;
  canonicalWorkItemRoot: string;
  ref?: string;
}) {
  const ref = input.ref ?? input.canonicalWorkItemRoot;
  const result = runBoundaryHelper({
    operation: 'capture_root_identity',
    workspace_root: path.resolve(input.workspaceRoot),
    canonical_work_item_root: path.resolve(input.canonicalWorkItemRoot),
    ref,
  }, { ref, operation: 'capture_root_identity' });
  return requireWorkItemRootIdentity(result.root_identity);
}

export function readStableWorkItemFile(input: {
  workspaceRoot: string;
  canonicalWorkItemRoot: string;
  expectedRootIdentity: WorkItemRootIdentity;
  filePath: string;
  ref: string;
  maxBytes?: number;
}): StableWorkItemFileObservation {
  if (
    input.maxBytes !== undefined
    && (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 0)
  ) {
    throw new WorkItemFileBoundaryError(
      'work_item_file_boundary_size_limit',
      'Work-item file boundary size limit must be a non-negative safe integer.',
      { ref: input.ref, max_bytes: input.maxBytes },
    );
  }
  const result = runBoundaryHelper({
    operation: 'read_file',
    workspace_root: path.resolve(input.workspaceRoot),
    canonical_work_item_root: path.resolve(input.canonicalWorkItemRoot),
    expected_root_identity: requireWorkItemRootIdentity(input.expectedRootIdentity),
    file_path: path.resolve(input.filePath),
    ref: input.ref,
    max_bytes: input.maxBytes ?? null,
  }, { ref: input.ref, operation: 'read_file' });
  const byteSize = result.byte_size;
  if (
    typeof result.real_path !== 'string'
    || typeof result.sha256 !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(result.sha256)
    || typeof byteSize !== 'number'
    || !Number.isSafeInteger(byteSize)
    || byteSize < 0
  ) {
    return helperFailure({
      message: 'Work-item file boundary helper returned an invalid file observation.',
      ref: input.ref,
      operation: 'read_file',
      details: { helper_result: result },
    });
  }
  return {
    real_path: result.real_path,
    sha256: result.sha256,
    byte_size: byteSize,
  };
}
