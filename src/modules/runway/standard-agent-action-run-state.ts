import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { HostedAgentRuntimeBindingProvenance } from './hosted-agent-runtime-binding.ts';

const ACTION_RUN_STATE_RELATIVE_ROOT = 'control/opl/action_run_state';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type StandardAgentActionRunBinding = {
  surface_kind: 'opl_standard_agent_action_run_binding';
  version: 'opl-standard-agent-action-run-binding.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
};

export type StandardAgentCompletedHandlerReplay = {
  accepted_domain_ids: string[];
  request_payload_sha256: string;
  package_use_binding: Record<string, unknown>;
  input_schema_ref: string;
  input_schema_validation: Record<string, unknown>;
  output_schema_validation: Record<string, unknown>;
};

export type StandardAgentActionRunCompletion = {
  surface_kind: 'opl_standard_agent_action_run_completion';
  version: 'opl-standard-agent-action-run-completion.v1';
  run_id: string;
  canonical_domain_id: string;
  action_id: string;
  execution_kind: 'handler_ref' | 'stage_binding' | 'foundry_binding';
  status: 'completed' | 'started' | 'blocked' | 'failed';
  failure_disposition: 'permanent' | null;
  binding_ref: string;
  hosted_runtime_binding_ref: string;
  request_sha256: string;
  request_byte_size: number;
  output_sha256: string;
  output_byte_size: number;
  sandbox: {
    runtime_kind: 'node_permission_model' | 'python_audit_hook';
    sandbox_kind: 'macos_sandbox_exec';
    exit_code: number;
    timed_out: boolean;
  } | null;
  error: {
    error_code: string;
    message: string;
    details: Record<string, unknown>;
  } | null;
  completed_handler_replay: StandardAgentCompletedHandlerReplay | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function workspaceRoot(input: string) {
  if (!path.isAbsolute(input)) fail('Standard Agent action state requires an absolute workspace root.');
  let root: string;
  try {
    root = fs.realpathSync.native(input);
  } catch (error) {
    fail('Standard Agent action state requires an existing workspace root.', {
      workspace_root: input,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(root!).isDirectory()) fail('Standard Agent action workspace root must be a directory.');
  return root!;
}

function validateRunId(runId: string) {
  if (!RUN_ID_PATTERN.test(runId)) {
    fail('Standard Agent action run_id must be a single safe path segment.', { run_id: runId });
  }
}

function assertContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  fail('Standard Agent action state path escapes the workspace root.', { workspace_root: root, path: candidate });
}

function ensureDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    if (!fs.existsSync(candidate)) {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Standard Agent action state contains a non-directory or symbolic-link component.', { path: candidate });
    }
    current = fs.realpathSync.native(candidate);
    assertContained(root, current);
  }
  return current;
}

function fsyncDirectory(directory: string) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeExactFile(file: string, bytes: Buffer) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function stateDirectory(root: string, runId: string) {
  validateRunId(runId);
  const directory = path.join(root, ...ACTION_RUN_STATE_RELATIVE_ROOT.split('/'), runId);
  assertContained(root, directory);
  return directory;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} contains unexpected fields.`, { unexpected_fields: unexpected });
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function completedHandlerReplayRecord(value: unknown): StandardAgentCompletedHandlerReplay | null {
  if (value === null) return null;
  if (!isRecord(value)) fail('Standard Agent completed Handler replay metadata must be an object or null.');
  exactKeys(value, [
    'accepted_domain_ids',
    'request_payload_sha256',
    'package_use_binding',
    'input_schema_ref',
    'input_schema_validation',
    'output_schema_validation',
  ], 'Standard Agent completed Handler replay metadata');
  const acceptedDomainIds = Array.isArray(value.accepted_domain_ids)
    ? value.accepted_domain_ids.map((entry) => text(entry, 'completed_handler_replay.accepted_domain_ids'))
    : fail('completed_handler_replay.accepted_domain_ids must be an array.');
  const canonicalDomainIds = [...new Set(acceptedDomainIds)].sort();
  if (
    canonicalDomainIds.length === 0
    || canonicalJsonText(acceptedDomainIds) !== canonicalJsonText(canonicalDomainIds)
    || typeof value.request_payload_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_payload_sha256)
    || !isRecord(value.package_use_binding)
    || !isRecord(value.input_schema_validation)
    || !isRecord(value.output_schema_validation)
  ) {
    fail('Standard Agent completed Handler replay metadata is invalid.');
  }
  return {
    accepted_domain_ids: canonicalDomainIds,
    request_payload_sha256: value.request_payload_sha256,
    package_use_binding: value.package_use_binding,
    input_schema_ref: text(value.input_schema_ref, 'completed_handler_replay.input_schema_ref'),
    input_schema_validation: value.input_schema_validation,
    output_schema_validation: value.output_schema_validation,
  };
}

function readCanonicalRecord(file: string, label: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical file.`, { file });
  const bytes = fs.readFileSync(file);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!isRecord(value) || !bytes.equals(canonicalJsonBytes(value))) {
    fail(`${label} must contain one canonical JSON object.`, { file });
  }
  return value;
}

function bindingRecord(value: Record<string, unknown>): StandardAgentActionRunBinding {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'hosted_runtime_binding_ref',
    'hosted_runtime_binding',
  ], 'Standard Agent action run binding');
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_binding'
    || value.version !== 'opl-standard-agent-action-run-binding.v1'
    || !isRecord(value.hosted_runtime_binding)
  ) {
    fail('Standard Agent action run binding is invalid.');
  }
  const runId = text(value.run_id, 'binding.run_id');
  validateRunId(runId);
  return {
    surface_kind: 'opl_standard_agent_action_run_binding',
    version: 'opl-standard-agent-action-run-binding.v1',
    run_id: runId,
    canonical_domain_id: text(value.canonical_domain_id, 'binding.canonical_domain_id'),
    action_id: text(value.action_id, 'binding.action_id'),
    hosted_runtime_binding_ref: text(value.hosted_runtime_binding_ref, 'binding.hosted_runtime_binding_ref'),
    hosted_runtime_binding: value.hosted_runtime_binding as HostedAgentRuntimeBindingProvenance,
  };
}

function completionRecord(value: Record<string, unknown>): StandardAgentActionRunCompletion {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'execution_kind',
    'status',
    'failure_disposition',
    'binding_ref',
    'hosted_runtime_binding_ref',
    'request_sha256',
    'request_byte_size',
    'output_sha256',
    'output_byte_size',
    'sandbox',
    'error',
    'completed_handler_replay',
  ], 'Standard Agent action run completion');
  const completedHandlerReplay = completedHandlerReplayRecord(value.completed_handler_replay);
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_completion'
    || value.version !== 'opl-standard-agent-action-run-completion.v1'
    || !['handler_ref', 'stage_binding', 'foundry_binding'].includes(String(value.execution_kind))
    || !['completed', 'started', 'blocked', 'failed'].includes(String(value.status))
    || (value.failure_disposition !== null && value.failure_disposition !== 'permanent')
    || typeof value.request_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || typeof value.output_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.output_sha256)
    || !Number.isSafeInteger(value.output_byte_size)
    || Number(value.output_byte_size) < 1
    || (value.sandbox !== null && !isRecord(value.sandbox))
    || (value.error !== null && !isRecord(value.error))
    || (
      value.execution_kind === 'handler_ref'
      && value.status === 'completed'
      && completedHandlerReplay === null
    )
    || (
      (value.execution_kind !== 'handler_ref' || value.status !== 'completed')
      && completedHandlerReplay !== null
    )
  ) {
    fail('Standard Agent action run completion is invalid.');
  }
  const runId = text(value.run_id, 'completion.run_id');
  validateRunId(runId);
  return {
    ...value,
    completed_handler_replay: completedHandlerReplay,
  } as StandardAgentActionRunCompletion;
}

function readBindingFromDirectory(directory: string, runId: string) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('Standard Agent action run state must be a physical directory.', { run_id: runId });
  }
  const binding = bindingRecord(readCanonicalRecord(path.join(directory, 'binding.json'), 'Action run binding'));
  if (binding.run_id !== runId) fail('Action run binding identity does not match its directory.', { run_id: runId });
  return binding;
}

export function inspectStandardAgentActionRunBinding(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  const realDirectory = fs.realpathSync.native(directory);
  assertContained(root, realDirectory);
  return readBindingFromDirectory(realDirectory, input.runId);
}

export function reserveStandardAgentActionRunBinding(input: {
  workspaceRoot: string;
  binding: StandardAgentActionRunBinding;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const expected = bindingRecord(input.binding as unknown as Record<string, unknown>);
  const parent = ensureDirectory(root, ACTION_RUN_STATE_RELATIVE_ROOT.split('/'));
  const directory = stateDirectory(root, expected.run_id);
  if (fs.existsSync(directory)) {
    return { status: 'existing' as const, binding: readBindingFromDirectory(directory, expected.run_id) };
  }
  const staging = path.join(parent, `.${expected.run_id}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    writeExactFile(path.join(staging, 'binding.json'), canonicalJsonBytes(expected));
    fsyncDirectory(staging);
    try {
      fs.renameSync(staging, directory);
      fsyncDirectory(parent);
      return { status: 'reserved' as const, binding: expected };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'ENOTEMPTY'].includes(code ?? '') || !fs.existsSync(directory)) throw error;
      return { status: 'existing' as const, binding: readBindingFromDirectory(directory, expected.run_id) };
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function inspectStandardAgentActionRunCompletion(input: { workspaceRoot: string; runId: string }) {
  const root = workspaceRoot(input.workspaceRoot);
  const directory = stateDirectory(root, input.runId);
  if (!fs.existsSync(directory)) return null;
  readBindingFromDirectory(directory, input.runId);
  const file = path.join(directory, 'completion.json');
  if (!fs.existsSync(file)) return null;
  const completion = completionRecord(readCanonicalRecord(file, 'Action run completion'));
  if (completion.run_id !== input.runId) fail('Action run completion identity does not match its directory.');
  return completion;
}

export function commitStandardAgentActionRunCompletion(input: {
  workspaceRoot: string;
  completion: StandardAgentActionRunCompletion;
}) {
  const root = workspaceRoot(input.workspaceRoot);
  const completion = completionRecord(input.completion as unknown as Record<string, unknown>);
  const directory = stateDirectory(root, completion.run_id);
  const binding = readBindingFromDirectory(directory, completion.run_id);
  if (
    binding.canonical_domain_id !== completion.canonical_domain_id
    || binding.action_id !== completion.action_id
    || binding.hosted_runtime_binding_ref !== completion.hosted_runtime_binding_ref
  ) {
    fail('Action run completion conflicts with its frozen runtime binding.', { run_id: completion.run_id });
  }
  const file = path.join(directory, 'completion.json');
  const bytes = canonicalJsonBytes(completion);
  if (fs.existsSync(file)) {
    const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
    if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
      fail('Action run completion conflicts with the existing run identity.', { run_id: completion.run_id });
    }
    return { status: 'already_completed' as const, completion: existing };
  }
  const staging = path.join(directory, `.completion.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    writeExactFile(staging, bytes);
    try {
      fs.linkSync(staging, file);
      fsyncDirectory(directory);
      return { status: 'completed' as const, completion };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !fs.existsSync(file)) throw error;
      const existing = completionRecord(readCanonicalRecord(file, 'Action run completion'));
      if (canonicalJsonText(existing) !== canonicalJsonText(completion)) {
        fail('Action run completion conflicts with a concurrent writer.', { run_id: completion.run_id });
      }
      return { status: 'already_completed' as const, completion: existing };
    }
  } finally {
    fs.rmSync(staging, { force: true });
  }
}
