import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  readJsonFileOrNull,
  writeJsonPayloadFile,
} from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { stageRunEvent } from './stage-run-kernel.ts';
import {
  STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  type StageRunCycleIdentity,
  type StageRunCycleIdentityInput,
  type StageRunCycleManifest,
  type StageRunCycleState,
  type StageRunExecutorKind,
  type StageRunOutputLayout,
  type StageRunRouteDecision,
  type StageRunRunnerDispatchReceipt,
  type StageRunSinglePassHandlerBinding,
  type StageRunSinglePassResult,
} from './stage-run-orchestration-types.ts';

const EXECUTOR_KINDS = new Set<StageRunExecutorKind>([
  'codex_cli',
  'agent_cli',
  'domain_cli',
  'native_helper',
]);

const FORBIDDEN_HANDLER_RESULT_FIELDS = new Set([
  'artifact_body',
  'memory_body',
  'domain_truth_body',
  'owner_receipt',
  'typed_blocker',
  'quality_verdict',
  'publication_verdict',
  'domain_result',
  'workspace',
  'document',
]);

const ALLOWED_HANDLER_RESULT_FIELDS = new Set([
  'status',
  'output_refs',
  'checkpoint_ref',
  'closeout_refs',
  'runtime_blocker_refs',
]);

const ALLOWED_ROUTE_DECISION_FIELDS = new Set([
  'decision',
  'stage_ref',
  'decision_refs',
  'accepted_checkpoint_ref',
  'rollback_to_checkpoint_ref',
  'typed_blocker_refs',
  'human_gate_refs',
  'runtime_blocker_refs',
]);

const ALLOWED_MANIFEST_FIELDS = new Set([
  'surface_kind',
  'version',
  'manifest_id',
  'target_agent_ref',
  'descriptor_ref',
  'run_ref',
  'input_refs',
  'stage_bindings',
  'max_cycles',
  'max_attempts_per_cycle',
  'no_progress_limit',
]);

const ALLOWED_STAGE_BINDING_FIELDS = new Set(['stage_ref', 'handler_id']);

function contractError(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredRef(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    contractError(`StageRun orchestration requires ${field}.`, { field });
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    contractError(`StageRun orchestration requires positive integer ${field}.`, {
      field,
      value,
    });
  }
  return Number(value);
}

function uniqueRefs(value: unknown, field: string, required = false) {
  if (!Array.isArray(value)) {
    if (required) contractError(`StageRun orchestration requires ${field}.`, { field });
    return [];
  }
  const result = [...new Set(value.map((entry) => requiredRef(entry, field)))];
  if (required && result.length === 0) {
    contractError(`StageRun orchestration requires non-empty ${field}.`, { field });
  }
  return result;
}

function normalizedArgv(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    contractError('StageRun runner requires non-empty argv.', { field: 'argv' });
  }
  if (value.some((entry) => typeof entry !== 'string')) {
    contractError('StageRun runner argv entries must be strings.', { field: 'argv' });
  }
  const argv = value as string[];
  if (!argv[0].trim()) {
    contractError('StageRun runner argv[0] must name an executable.', { field: 'argv[0]' });
  }
  return [...argv];
}

function withinRoot(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function ensureDirectoryWithinRoot(root: string, candidate: string) {
  fs.mkdirSync(candidate, { recursive: true });
  const resolved = fs.realpathSync(candidate);
  if (!withinRoot(root, resolved)) {
    contractError('StageRun output directory escapes output_root.', {
      output_root: root,
      candidate: resolved,
    });
  }
  return resolved;
}

function outputRef(filePath: string) {
  return `opl-output:${filePath}`;
}

function contentEvidence(value: string) {
  return {
    sha256: createHash('sha256').update(value).digest('hex'),
    byte_count: Buffer.byteLength(value, 'utf8'),
  };
}

export function buildStageRunCycleIdentity(
  input: StageRunCycleIdentityInput,
): StageRunCycleIdentity {
  const normalized = {
    target_agent_ref: requiredRef(input.target_agent_ref, 'target_agent_ref'),
    descriptor_ref: requiredRef(input.descriptor_ref, 'descriptor_ref'),
    stage_ref: requiredRef(input.stage_ref, 'stage_ref'),
    run_ref: requiredRef(input.run_ref, 'run_ref'),
    cycle_index: positiveInteger(input.cycle_index, 'cycle_index'),
    attempt_index: positiveInteger(input.attempt_index, 'attempt_index'),
  };
  const stageRunId = stableId('stage_run', [
    normalized.target_agent_ref,
    normalized.descriptor_ref,
    normalized.run_ref,
  ]);
  const stageStepId = stableId('stage_step', [
    normalized.target_agent_ref,
    normalized.descriptor_ref,
    normalized.stage_ref,
    normalized.run_ref,
    normalized.cycle_index,
    normalized.attempt_index,
  ]);
  return {
    surface_kind: 'opl_stage_run_cycle_identity',
    version: 'stage-run-cycle-identity.v1',
    ...normalized,
    stage_run_id: stageRunId,
    stage_step_id: stageStepId,
    idempotency_key: stableId('stage_run_idempotency', [stageRunId, stageStepId]),
  };
}

export function prepareStageRunOutputLayout(input: {
  output_root: string;
  identity: StageRunCycleIdentity;
}): StageRunOutputLayout {
  const requestedRoot = path.resolve(requiredRef(input.output_root, 'output_root'));
  fs.mkdirSync(requestedRoot, { recursive: true });
  const outputRoot = fs.realpathSync(requestedRoot);
  const runDirectory = ensureDirectoryWithinRoot(
    outputRoot,
    path.join(outputRoot, input.identity.stage_run_id),
  );
  const cycleDirectory = ensureDirectoryWithinRoot(
    outputRoot,
    path.join(runDirectory, `cycle-${String(input.identity.cycle_index).padStart(4, '0')}`),
  );
  const attemptDirectory = ensureDirectoryWithinRoot(
    outputRoot,
    path.join(cycleDirectory, `attempt-${String(input.identity.attempt_index).padStart(4, '0')}`),
  );
  return {
    surface_kind: 'opl_stage_run_output_layout',
    stage_run_id: input.identity.stage_run_id,
    stage_step_id: input.identity.stage_step_id,
    output_root: outputRoot,
    run_directory: runDirectory,
    cycle_directory: cycleDirectory,
    attempt_directory: attemptDirectory,
    run_directory_ref: outputRef(runDirectory),
    step_ref: `opl-stage-step:${input.identity.stage_step_id}`,
    output_manifest_path: path.join(attemptDirectory, 'output-manifest.json'),
    runner_receipt_path: path.join(attemptDirectory, 'runner-receipt.json'),
    single_pass_receipt_path: path.join(attemptDirectory, 'single-pass-receipt.json'),
  };
}

function assertLayoutIdentity(
  identity: StageRunCycleIdentity,
  layout: StageRunOutputLayout,
) {
  if (
    layout.stage_run_id !== identity.stage_run_id
    || layout.stage_step_id !== identity.stage_step_id
  ) {
    contractError('StageRun output layout identity mismatch.', {
      expected_stage_run_id: identity.stage_run_id,
      expected_stage_step_id: identity.stage_step_id,
      actual_stage_run_id: layout.stage_run_id,
      actual_stage_step_id: layout.stage_step_id,
    });
  }
}

function exitCode(result: ReturnType<typeof spawnSync>, timedOut: boolean) {
  if (timedOut) return 124;
  if (typeof result.status === 'number') return result.status;
  return result.error ? 127 : 1;
}

function sameStrings(value: unknown, expected: string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function storedDispatchReceipt(
  filePath: string,
  expected: {
    dispatchId: string;
    identity: StageRunCycleIdentity;
    executorKind: StageRunExecutorKind;
    executorRef: string;
    argvFingerprint: string;
    argvCount: number;
    envKeys: string[];
    envFingerprint: string;
    inputRefs: string[];
    declaredOutputRefs: string[];
    timeoutMs: number;
  },
): StageRunRunnerDispatchReceipt | null {
  if (!fs.existsSync(filePath)) return null;
  const stored = readJsonFileOrNull(filePath);
  if (
    !isRecord(stored)
    || stored.surface_kind !== 'opl_stage_run_runner_dispatch_receipt'
    || stored.version !== 'stage-run-runner-dispatch.v1'
  ) {
    contractError('Stored StageRun runner receipt has an invalid envelope.', {
      receipt_ref: outputRef(filePath),
    });
  }
  if (stored.dispatch_id !== expected.dispatchId) {
    contractError('StageRun idempotency key is already bound to another runner dispatch.', {
      receipt_ref: outputRef(filePath),
      expected_dispatch_id: expected.dispatchId,
      actual_dispatch_id: stored.dispatch_id,
    });
  }
  const identity = isRecord(stored.identity) ? stored.identity : null;
  const executor = isRecord(stored.executor) ? stored.executor : null;
  const identityMatches = identity !== null
    && Object.entries(expected.identity).every(([field, value]) => identity[field] === value);
  const hashesAreValid = [stored.stdout_sha256, stored.stderr_sha256]
    .every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
  const byteCountsAreValid = [stored.stdout_byte_count, stored.stderr_byte_count]
    .every((value) => Number.isInteger(value) && Number(value) >= 0);
  const authorityBoundary = isRecord(stored.authority_boundary) ? stored.authority_boundary : null;
  const authorityMatches = authorityBoundary !== null
    && Object.entries(STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY)
      .every(([field, value]) => authorityBoundary[field] === value);
  const eventsAreValid = Array.isArray(stored.stage_run_events)
    && stored.stage_run_events.length === 2
    && stored.stage_run_events.every((event) => {
      try {
        stageRunEvent(event as Parameters<typeof stageRunEvent>[0]);
        return true;
      } catch {
        return false;
      }
    });
  if (
    stored.idempotency_key !== expected.identity.idempotency_key
    || stored.idempotent_replay !== false
    || !identityMatches
    || executor?.kind !== expected.executorKind
    || executor.executor_ref !== expected.executorRef
    || stored.argv_fingerprint !== expected.argvFingerprint
    || stored.argv_count !== expected.argvCount
    || !sameStrings(stored.env_keys, expected.envKeys)
    || stored.env_fingerprint !== expected.envFingerprint
    || !sameStrings(stored.input_refs, expected.inputRefs)
    || !sameStrings(stored.declared_output_refs, expected.declaredOutputRefs)
    || stored.output_manifest_ref !== outputRef(path.join(path.dirname(filePath), 'output-manifest.json'))
    || stored.runner_receipt_ref !== outputRef(filePath)
    || stored.timeout_ms !== expected.timeoutMs
    || stored.process_log_policy !== 'metadata_only'
    || !hashesAreValid
    || !byteCountsAreValid
    || !['process_completed', 'process_failed', 'process_timed_out'].includes(String(stored.process_status))
    || !Number.isInteger(stored.exit_code)
    || typeof stored.timed_out !== 'boolean'
    || (stored.signal !== null && typeof stored.signal !== 'string')
    || !eventsAreValid
    || stored.owner_receipt_ref !== null
    || stored.typed_blocker_ref !== null
    || stored.domain_result_ref !== null
    || !authorityMatches
  ) {
    contractError('Stored StageRun runner receipt does not match its declared dispatch binding.', {
      receipt_ref: outputRef(filePath),
      dispatch_id: expected.dispatchId,
    });
  }
  return {
    ...(stored as StageRunRunnerDispatchReceipt),
    idempotent_replay: true,
  };
}

export function executeStageRunRunnerDispatch(input: {
  identity: StageRunCycleIdentity;
  output_layout: StageRunOutputLayout;
  executor: {
    kind: StageRunExecutorKind;
    executor_ref: string;
  };
  argv: string[];
  env?: Record<string, string>;
  input_refs: string[];
  declared_output_refs?: string[];
  timeout_ms?: number;
  observed_at?: string;
}): StageRunRunnerDispatchReceipt {
  assertLayoutIdentity(input.identity, input.output_layout);
  if (!EXECUTOR_KINDS.has(input.executor.kind)) {
    contractError('Unsupported StageRun runner executor kind.', {
      executor_kind: input.executor.kind,
    });
  }
  const executorRef = requiredRef(input.executor.executor_ref, 'executor.executor_ref');
  const argv = normalizedArgv(input.argv);
  const inputRefs = uniqueRefs(input.input_refs, 'input_refs', true);
  const declaredOutputRefs = uniqueRefs(input.declared_output_refs ?? [], 'declared_output_refs');
  const env = input.env ?? {};
  const envKeys = Object.keys(env).sort();
  for (const key of envKeys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof env[key] !== 'string') {
      contractError('StageRun runner env must contain string values under portable names.', {
        env_key: key,
      });
    }
  }
  const envFingerprint = stableId('env', [envKeys.map((key) => [key, env[key]])]);
  const timeoutMs = input.timeout_ms === undefined
    ? 10 * 60 * 1000
    : positiveInteger(input.timeout_ms, 'timeout_ms');
  const argvFingerprint = stableId('argv', [argv]);
  const dispatchId = stableId('stage_dispatch', [
    input.identity.idempotency_key,
    input.executor.kind,
    executorRef,
    argv,
    envFingerprint,
    timeoutMs,
    inputRefs,
    declaredOutputRefs,
  ]);
  const stored = storedDispatchReceipt(input.output_layout.runner_receipt_path, {
    dispatchId,
    identity: input.identity,
    executorKind: input.executor.kind,
    executorRef,
    argvFingerprint,
    argvCount: argv.length,
    envKeys,
    envFingerprint,
    inputRefs,
    declaredOutputRefs,
    timeoutMs,
  });
  if (stored) return stored;

  const observedAt = input.observed_at ?? new Date().toISOString();
  const providerAttemptRef = `opl://stage-runner-dispatches/${dispatchId}`;
  const runningEvent = stageRunEvent({
    event_id: stableId('stage_event', [dispatchId, 'provider_running']),
    event_kind: 'provider_running',
    stage_run_id: input.identity.stage_run_id,
    generation: input.identity.cycle_index,
    observed_at: observedAt,
    provider_attempt_ref: providerAttemptRef,
    current_pointer: {
      stage_run_id: input.identity.stage_run_id,
      generation: input.identity.cycle_index,
      current: true,
    },
  });
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: input.output_layout.attempt_directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      OPL_STAGE_RUN_OUTPUT_DIR: input.output_layout.attempt_directory,
      OPL_STAGE_RUN_STEP_REF: input.output_layout.step_ref,
      OPL_STAGE_RUN_IDEMPOTENCY_KEY: input.identity.idempotency_key,
    },
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
  });
  const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  const normalizedExitCode = exitCode(result, timedOut);
  const stdoutEvidence = contentEvidence(result.stdout ?? '');
  const stderrEvidence = contentEvidence(result.stderr ?? result.error?.message ?? '');
  const terminalEvent = stageRunEvent({
    event_id: stableId('stage_event', [dispatchId, normalizedExitCode === 0 ? 'provider_completed' : 'infrastructure_crashed']),
    event_kind: normalizedExitCode === 0 ? 'provider_completed' : 'infrastructure_crashed',
    stage_run_id: input.identity.stage_run_id,
    generation: input.identity.cycle_index,
    observed_at: new Date().toISOString(),
    provider_attempt_ref: providerAttemptRef,
    current_pointer: {
      stage_run_id: input.identity.stage_run_id,
      generation: input.identity.cycle_index,
      current: true,
    },
  });
  const processStatus = timedOut
    ? 'process_timed_out'
    : normalizedExitCode === 0
      ? 'process_completed'
      : 'process_failed';
  const outputManifest = {
    surface_kind: 'opl_stage_run_output_manifest',
    version: 'stage-run-output-manifest.v1',
    manifest_id: stableId('stage_output_manifest', [dispatchId]),
    identity: input.identity,
    input_refs: inputRefs,
    declared_output_refs: declaredOutputRefs,
    process_log_evidence: {
      policy: 'metadata_only',
      stdout: stdoutEvidence,
      stderr: stderrEvidence,
    },
    manifest_status: 'refs_recorded_not_domain_validated',
    artifact_body_included: false,
    domain_result_included: false,
    quality_verdict_included: false,
    owner_receipt_included: false,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  };
  writeJsonPayloadFile(input.output_layout.output_manifest_path, outputManifest);
  const receipt: StageRunRunnerDispatchReceipt = {
    surface_kind: 'opl_stage_run_runner_dispatch_receipt',
    version: 'stage-run-runner-dispatch.v1',
    dispatch_id: dispatchId,
    idempotency_key: input.identity.idempotency_key,
    idempotent_replay: false,
    identity: input.identity,
    executor: {
      kind: input.executor.kind,
      executor_ref: executorRef,
    },
    argv_fingerprint: argvFingerprint,
    argv_count: argv.length,
    env_keys: envKeys,
    env_fingerprint: envFingerprint,
    input_refs: inputRefs,
    declared_output_refs: declaredOutputRefs,
    output_manifest_ref: outputRef(input.output_layout.output_manifest_path),
    runner_receipt_ref: outputRef(input.output_layout.runner_receipt_path),
    timeout_ms: timeoutMs,
    process_log_policy: 'metadata_only',
    stdout_sha256: stdoutEvidence.sha256,
    stdout_byte_count: stdoutEvidence.byte_count,
    stderr_sha256: stderrEvidence.sha256,
    stderr_byte_count: stderrEvidence.byte_count,
    process_status: processStatus,
    exit_code: normalizedExitCode,
    signal: result.signal,
    timed_out: timedOut,
    stage_run_events: [runningEvent, terminalEvent],
    owner_receipt_ref: null,
    typed_blocker_ref: null,
    domain_result_ref: null,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  };
  writeJsonPayloadFile(input.output_layout.runner_receipt_path, receipt);
  return receipt;
}

export function bindStageRunSinglePassHandler(input: {
  handler_id: string;
  run: StageRunSinglePassHandlerBinding['run'];
}): StageRunSinglePassHandlerBinding {
  if (typeof input.run !== 'function') {
    contractError('StageRun single-pass handler requires run function.', {
      handler_id: input.handler_id,
    });
  }
  return {
    surface_kind: 'opl_stage_run_single_pass_handler_binding',
    handler_id: requiredRef(input.handler_id, 'handler_id'),
    run: input.run,
  };
}

function normalizeManifest(value: StageRunCycleManifest): StageRunCycleManifest {
  if (
    !isRecord(value)
    || !Array.isArray(value.stage_bindings)
    || value.surface_kind !== 'opl_stage_run_cycle_manifest'
    || value.version !== 'stage-run-cycle.v1'
  ) {
    contractError('Invalid StageRun cycle manifest envelope.');
  }
  const unexpectedFields = Object.keys(value).filter((field) => !ALLOWED_MANIFEST_FIELDS.has(field));
  if (unexpectedFields.length > 0) {
    contractError('StageRun cycle manifest must contain refs-only contract fields.', {
      unexpected_fields: unexpectedFields,
    });
  }
  const stageBindings = value.stage_bindings.map((binding) => {
    if (!isRecord(binding)) {
      contractError('StageRun cycle manifest stage_bindings entries must be objects.');
    }
    const unexpectedBindingFields = Object.keys(binding)
      .filter((field) => !ALLOWED_STAGE_BINDING_FIELDS.has(field));
    if (unexpectedBindingFields.length > 0) {
      contractError('StageRun cycle manifest stage_bindings must contain identity fields only.', {
        unexpected_fields: unexpectedBindingFields,
      });
    }
    return {
      stage_ref: requiredRef(binding.stage_ref, 'stage_bindings.stage_ref'),
      handler_id: requiredRef(binding.handler_id, 'stage_bindings.handler_id'),
    };
  });
  if (stageBindings.length === 0) {
    contractError('StageRun cycle manifest requires stage_bindings.');
  }
  if (new Set(stageBindings.map((binding) => binding.stage_ref)).size !== stageBindings.length) {
    contractError('StageRun cycle manifest stage_ref values must be unique.');
  }
  return {
    ...value,
    manifest_id: requiredRef(value.manifest_id, 'manifest_id'),
    target_agent_ref: requiredRef(value.target_agent_ref, 'target_agent_ref'),
    descriptor_ref: requiredRef(value.descriptor_ref, 'descriptor_ref'),
    run_ref: requiredRef(value.run_ref, 'run_ref'),
    input_refs: uniqueRefs(value.input_refs, 'input_refs', true),
    stage_bindings: stageBindings,
    max_cycles: positiveInteger(value.max_cycles, 'max_cycles'),
    max_attempts_per_cycle: positiveInteger(
      value.max_attempts_per_cycle,
      'max_attempts_per_cycle',
    ),
    no_progress_limit: positiveInteger(value.no_progress_limit, 'no_progress_limit'),
  };
}

function normalizeRouteDecision(value: StageRunRouteDecision): StageRunRouteDecision {
  if (!isRecord(value) || !['dispatch', 'accepted', 'rollback', 'blocked'].includes(String(value.decision))) {
    contractError('StageRun route oracle returned an invalid decision.');
  }
  const unexpectedFields = Object.keys(value).filter((field) => !ALLOWED_ROUTE_DECISION_FIELDS.has(field));
  if (unexpectedFields.length > 0) {
    contractError('StageRun route oracle must return refs-only decision fields.', {
      unexpected_fields: unexpectedFields,
    });
  }
  return {
    decision: value.decision,
    ...(value.stage_ref ? { stage_ref: requiredRef(value.stage_ref, 'route.stage_ref') } : {}),
    decision_refs: uniqueRefs(value.decision_refs, 'route.decision_refs', true),
    ...(value.accepted_checkpoint_ref
      ? { accepted_checkpoint_ref: requiredRef(value.accepted_checkpoint_ref, 'accepted_checkpoint_ref') }
      : {}),
    ...(value.rollback_to_checkpoint_ref
      ? { rollback_to_checkpoint_ref: requiredRef(value.rollback_to_checkpoint_ref, 'rollback_to_checkpoint_ref') }
      : {}),
    typed_blocker_refs: uniqueRefs(value.typed_blocker_refs ?? [], 'typed_blocker_refs'),
    human_gate_refs: uniqueRefs(value.human_gate_refs ?? [], 'human_gate_refs'),
    runtime_blocker_refs: uniqueRefs(value.runtime_blocker_refs ?? [], 'runtime_blocker_refs'),
  };
}

function normalizeSinglePassResult(value: StageRunSinglePassResult): StageRunSinglePassResult {
  if (!isRecord(value)) contractError('StageRun single-pass handler must return an object.');
  const forbiddenFields = Object.keys(value).filter((field) => FORBIDDEN_HANDLER_RESULT_FIELDS.has(field));
  if (forbiddenFields.length > 0) {
    contractError('StageRun single-pass handler returned forbidden body or authority fields.', {
      forbidden_fields: forbiddenFields,
    });
  }
  const unexpectedFields = Object.keys(value).filter((field) => !ALLOWED_HANDLER_RESULT_FIELDS.has(field));
  if (unexpectedFields.length > 0) {
    contractError('StageRun single-pass handler must return refs-only result fields.', {
      unexpected_fields: unexpectedFields,
    });
  }
  if (value.status !== 'completed' && value.status !== 'failed') {
    contractError('StageRun single-pass handler returned invalid status.', {
      status: value.status,
    });
  }
  return {
    status: value.status,
    output_refs: uniqueRefs(value.output_refs, 'handler.output_refs'),
    ...(value.checkpoint_ref
      ? { checkpoint_ref: requiredRef(value.checkpoint_ref, 'handler.checkpoint_ref') }
      : {}),
    closeout_refs: uniqueRefs(value.closeout_refs, 'handler.closeout_refs'),
    runtime_blocker_refs: uniqueRefs(value.runtime_blocker_refs ?? [], 'handler.runtime_blocker_refs'),
  };
}

function initialState(manifest: StageRunCycleManifest): StageRunCycleState {
  const identity = buildStageRunCycleIdentity({
    target_agent_ref: manifest.target_agent_ref,
    descriptor_ref: manifest.descriptor_ref,
    stage_ref: manifest.stage_bindings[0].stage_ref,
    run_ref: manifest.run_ref,
    cycle_index: 1,
    attempt_index: 1,
  });
  return {
    surface_kind: 'opl_stage_run_cycle_state',
    version: 'stage-run-cycle.v1',
    stage_run_id: identity.stage_run_id,
    target_agent_ref: manifest.target_agent_ref,
    descriptor_ref: manifest.descriptor_ref,
    run_ref: manifest.run_ref,
    status: 'running',
    cycle_index: 1,
    attempt_index: 1,
    completed_step_count: 0,
    consecutive_no_progress_count: 0,
    checkpoint_refs: [],
    accepted_checkpoint_ref: null,
    rollback_to_checkpoint_ref: null,
    latest_output_refs: manifest.input_refs,
    step_receipt_refs: [],
    closeout_refs: [],
    output_manifest_refs: [],
    route_decision_refs: [],
    typed_blocker_refs: [],
    human_gate_refs: [],
    runtime_blocker_refs: [],
    termination_reason: null,
    domain_typed_blocker_created: false,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  };
}

function terminalState(
  state: StageRunCycleState,
  update: Partial<StageRunCycleState>,
): StageRunCycleState {
  return { ...state, ...update };
}

function writeSinglePassReceipt(input: {
  layout: StageRunOutputLayout;
  identity: StageRunCycleIdentity;
  handlerId: string;
  result: StageRunSinglePassResult;
}) {
  const receiptRef = outputRef(input.layout.single_pass_receipt_path);
  const manifestRef = outputRef(input.layout.output_manifest_path);
  writeJsonPayloadFile(input.layout.output_manifest_path, {
    surface_kind: 'opl_stage_run_output_manifest',
    version: 'stage-run-output-manifest.v1',
    manifest_id: stableId('stage_output_manifest', [input.identity.idempotency_key, input.handlerId]),
    identity: input.identity,
    output_refs: input.result.output_refs,
    checkpoint_refs: input.result.checkpoint_ref ? [input.result.checkpoint_ref] : [],
    closeout_refs: input.result.closeout_refs,
    manifest_status: 'refs_recorded_not_domain_validated',
    artifact_body_included: false,
    domain_result_included: false,
    quality_verdict_included: false,
    owner_receipt_included: false,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  });
  writeJsonPayloadFile(input.layout.single_pass_receipt_path, {
    surface_kind: 'opl_stage_run_single_pass_receipt',
    version: 'stage-run-single-pass.v1',
    receipt_id: stableId('stage_pass_receipt', [input.identity.idempotency_key, input.handlerId]),
    identity: input.identity,
    handler_id: input.handlerId,
    handler_status: input.result.status,
    output_refs: input.result.output_refs,
    checkpoint_ref: input.result.checkpoint_ref ?? null,
    closeout_refs: input.result.closeout_refs,
    runtime_blocker_refs: input.result.runtime_blocker_refs ?? [],
    output_manifest_ref: manifestRef,
    handler_completion_is_domain_result: false,
    owner_receipt_ref: null,
    typed_blocker_ref: null,
    domain_result_ref: null,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  });
  return { receiptRef, manifestRef };
}

function writeRunCloseout(
  outputRoot: string,
  manifest: StageRunCycleManifest,
  state: StageRunCycleState,
) {
  const requestedRoot = path.resolve(outputRoot);
  fs.mkdirSync(requestedRoot, { recursive: true });
  const root = fs.realpathSync(requestedRoot);
  const runDirectory = ensureDirectoryWithinRoot(root, path.join(root, state.stage_run_id));
  const closeoutPath = path.join(runDirectory, 'stage-run-closeout.json');
  const closeout = {
    surface_kind: 'opl_stage_run_orchestration_closeout',
    version: 'stage-run-orchestration-closeout.v1',
    closeout_id: stableId('stage_run_closeout', [state.stage_run_id, state.status, state.termination_reason]),
    manifest_ref: `opl-stage-run-manifest:${manifest.manifest_id}`,
    stage_run_id: state.stage_run_id,
    target_agent_ref: state.target_agent_ref,
    descriptor_ref: state.descriptor_ref,
    run_ref: state.run_ref,
    status: state.status,
    termination_reason: state.termination_reason,
    accepted_checkpoint_ref: state.accepted_checkpoint_ref,
    rollback_to_checkpoint_ref: state.rollback_to_checkpoint_ref,
    latest_output_refs: state.latest_output_refs,
    step_receipt_refs: state.step_receipt_refs,
    closeout_refs: state.closeout_refs,
    output_manifest_refs: state.output_manifest_refs,
    route_decision_refs: state.route_decision_refs,
    typed_blocker_refs: state.typed_blocker_refs,
    human_gate_refs: state.human_gate_refs,
    runtime_blocker_refs: state.runtime_blocker_refs,
    process_or_handler_completion_is_domain_result: false,
    owner_receipt_ref: null,
    domain_result_ref: null,
    quality_verdict_ref: null,
    authority_boundary: STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  };
  writeJsonPayloadFile(closeoutPath, closeout);
  return { closeout, closeoutPath };
}

export async function runStageRunCycle(input: {
  manifest: StageRunCycleManifest;
  output_root: string;
  handlers: StageRunSinglePassHandlerBinding[];
  route_oracle: (
    context: { manifest: StageRunCycleManifest; state: StageRunCycleState },
  ) => StageRunRouteDecision | Promise<StageRunRouteDecision>;
}) {
  const manifest = normalizeManifest(input.manifest);
  if (typeof input.route_oracle !== 'function') {
    contractError('StageRun cycle requires a domain route oracle.');
  }
  const handlers = new Map<string, StageRunSinglePassHandlerBinding>();
  for (const binding of input.handlers) {
    const normalized = bindStageRunSinglePassHandler(binding);
    if (handlers.has(normalized.handler_id)) {
      contractError('StageRun handler_id values must be unique.', {
        handler_id: normalized.handler_id,
      });
    }
    handlers.set(normalized.handler_id, normalized);
  }
  let state = initialState(manifest);
  while (state.status === 'running') {
    const route = normalizeRouteDecision(await input.route_oracle({ manifest, state }));
    state = {
      ...state,
      route_decision_refs: [...new Set([...state.route_decision_refs, ...route.decision_refs])],
    };
    if (route.decision === 'accepted') {
      const accepted = route.accepted_checkpoint_ref ?? null;
      if (!accepted || !state.checkpoint_refs.includes(accepted)) {
        contractError('StageRun accepted route must bind an observed checkpoint ref.', {
          accepted_checkpoint_ref: accepted,
          checkpoint_refs: state.checkpoint_refs,
        });
      }
      state = terminalState(state, {
        status: 'checkpoint_accepted',
        accepted_checkpoint_ref: accepted,
        termination_reason: 'accepted_checkpoint_observed',
      });
      continue;
    }
    if (route.decision === 'rollback') {
      const rollbackRef = route.rollback_to_checkpoint_ref ?? null;
      if (!rollbackRef || !state.checkpoint_refs.includes(rollbackRef)) {
        contractError('StageRun rollback route must bind an observed checkpoint ref.', {
          rollback_to_checkpoint_ref: rollbackRef,
          checkpoint_refs: state.checkpoint_refs,
        });
      }
      state = terminalState(state, {
        status: 'rollback_required',
        rollback_to_checkpoint_ref: rollbackRef,
        termination_reason: 'rollback_checkpoint_observed',
      });
      continue;
    }
    if (route.decision === 'blocked') {
      const typedBlockerRefs = uniqueRefs(route.typed_blocker_refs ?? [], 'typed_blocker_refs');
      const humanGateRefs = uniqueRefs(route.human_gate_refs ?? [], 'human_gate_refs');
      const runtimeBlockerRefs = uniqueRefs(route.runtime_blocker_refs ?? [], 'runtime_blocker_refs');
      if (typedBlockerRefs.length + humanGateRefs.length + runtimeBlockerRefs.length === 0) {
        contractError('StageRun blocked route requires an owner-supplied blocker or gate ref.');
      }
      state = terminalState(state, {
        status: 'blocked',
        typed_blocker_refs: [...new Set([...state.typed_blocker_refs, ...typedBlockerRefs])],
        human_gate_refs: [...new Set([...state.human_gate_refs, ...humanGateRefs])],
        runtime_blocker_refs: [...new Set([...state.runtime_blocker_refs, ...runtimeBlockerRefs])],
        termination_reason: 'owner_supplied_blocker_or_gate_observed',
      });
      continue;
    }
    if (state.completed_step_count >= manifest.max_cycles) {
      state = terminalState(state, {
        status: 'exhausted',
        termination_reason: 'max_cycles_exhausted',
      });
      continue;
    }

    const stageRef = requiredRef(route.stage_ref, 'route.stage_ref');
    const stageBinding = manifest.stage_bindings.find((binding) => binding.stage_ref === stageRef);
    if (!stageBinding) {
      contractError('StageRun route selected a stage absent from manifest.', {
        stage_ref: stageRef,
      });
    }
    const handler = handlers.get(stageBinding.handler_id);
    if (!handler) {
      contractError('StageRun manifest handler binding is unavailable.', {
        stage_ref: stageRef,
        handler_id: stageBinding.handler_id,
      });
    }
    const identity = buildStageRunCycleIdentity({
      target_agent_ref: manifest.target_agent_ref,
      descriptor_ref: manifest.descriptor_ref,
      stage_ref: stageRef,
      run_ref: manifest.run_ref,
      cycle_index: state.cycle_index,
      attempt_index: state.attempt_index,
    });
    const layout = prepareStageRunOutputLayout({
      output_root: input.output_root,
      identity,
    });
    const result = normalizeSinglePassResult(await handler.run({
      manifest,
      identity,
      output_layout: layout,
      input_refs: state.latest_output_refs,
      checkpoint_refs: state.checkpoint_refs,
      step_receipt_refs: state.step_receipt_refs,
    }));
    const written = writeSinglePassReceipt({
      layout,
      identity,
      handlerId: handler.handler_id,
      result,
    });
    const checkpointRefs = result.checkpoint_ref
      ? [...new Set([...state.checkpoint_refs, result.checkpoint_ref])]
      : state.checkpoint_refs;
    const runtimeBlockerRefs = [
      ...new Set([...state.runtime_blocker_refs, ...(result.runtime_blocker_refs ?? [])]),
    ];
    const sharedUpdate = {
      checkpoint_refs: checkpointRefs,
      step_receipt_refs: [...state.step_receipt_refs, written.receiptRef],
      closeout_refs: [...new Set([...state.closeout_refs, ...result.closeout_refs])],
      output_manifest_refs: [...state.output_manifest_refs, written.manifestRef],
      runtime_blocker_refs: runtimeBlockerRefs,
    };
    if (result.status === 'failed') {
      const nextAttempt = state.attempt_index + 1;
      state = nextAttempt > manifest.max_attempts_per_cycle
        ? terminalState(state, {
            ...sharedUpdate,
            status: 'exhausted',
            termination_reason: 'max_attempts_exhausted',
          })
        : { ...state, ...sharedUpdate, attempt_index: nextAttempt };
      continue;
    }
    const progressed = result.output_refs.length > 0 || Boolean(result.checkpoint_ref);
    if (!progressed) {
      const noProgressCount = state.consecutive_no_progress_count + 1;
      const nextAttempt = state.attempt_index + 1;
      state = noProgressCount >= manifest.no_progress_limit
        ? terminalState(state, {
            ...sharedUpdate,
            status: 'exhausted',
            consecutive_no_progress_count: noProgressCount,
            termination_reason: 'no_progress_budget_exhausted',
          })
        : nextAttempt > manifest.max_attempts_per_cycle
          ? terminalState(state, {
              ...sharedUpdate,
              status: 'exhausted',
              consecutive_no_progress_count: noProgressCount,
              termination_reason: 'max_attempts_exhausted',
            })
          : {
              ...state,
              ...sharedUpdate,
              attempt_index: nextAttempt,
              consecutive_no_progress_count: noProgressCount,
            };
      continue;
    }
    state = {
      ...state,
      ...sharedUpdate,
      cycle_index: state.cycle_index + 1,
      attempt_index: 1,
      completed_step_count: state.completed_step_count + 1,
      consecutive_no_progress_count: 0,
      latest_output_refs: result.output_refs.length > 0
        ? result.output_refs
        : [...new Set([...state.latest_output_refs, result.checkpoint_ref!])],
    };
  }
  const written = writeRunCloseout(input.output_root, manifest, state);
  return {
    surface_kind: 'opl_stage_run_cycle_result',
    version: 'stage-run-cycle.v1',
    state,
    closeout: written.closeout,
    closeout_path: written.closeoutPath,
  };
}

export { buildStageRunCycleManifestFromControlPlane } from './stage-run-orchestration-adapter.ts';
export type { StageRunControlPlaneManifestInput } from './stage-run-orchestration-adapter.ts';
export { STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY } from './stage-run-orchestration-types.ts';
export type {
  StageRunCycleIdentity,
  StageRunCycleIdentityInput,
  StageRunCycleManifest,
  StageRunCycleState,
  StageRunExecutorKind,
  StageRunOutputLayout,
  StageRunRouteDecision,
  StageRunRunnerDispatchReceipt,
  StageRunSinglePassContext,
  StageRunSinglePassHandlerBinding,
  StageRunSinglePassResult,
} from './stage-run-orchestration-types.ts';
