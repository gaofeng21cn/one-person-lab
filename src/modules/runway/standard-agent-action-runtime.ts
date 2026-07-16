import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
  type FamilyActionCatalogAction,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../kernel/repo-json-schema.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import { compileStandardAgentStageManifest } from '../pack/public/standard-agent-action-runtime.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
} from '../workspace/public/standard-agent-action-runtime.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { buildHostedActionStageRunInvocationId } from './family-runtime-stage-run-identity.ts';
import { openQueueDb } from './family-runtime-store.ts';
import { recordStandardAgentActionRunEvent } from './standard-agent-action-run-recorder.ts';
import { runStandardAgentHandlerSandbox } from './standard-agent-handler-sandbox.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';

type StandardAgentActionRuntimeInput = {
  domainId: string;
  actionId: string;
  workspaceRoot: string;
  payload: Record<string, unknown>;
  runId?: string;
  timeoutMs?: number;
};

type RuntimeDependencies = {
  resolveManagedCheckout?: typeof resolveStandardAgentManagedCheckout;
  runHandler?: typeof runStandardAgentHandlerSandbox;
  runStageRuntime?: typeof runFamilyRuntime;
  compileStageManifest?: typeof compileStandardAgentStageManifest;
  recordLedger?: typeof actionLedger;
  actionRunReservationDb?: DatabaseSync;
};

type StandardAgentActionRunPlan = {
  surface_kind: 'opl_standard_agent_action_run_plan';
  version: 'opl-standard-agent-action-run-plan.v1';
  reservation_key: string;
  run_id: string;
  domain_id: string;
  action_id: string;
  workspace_root: string;
  package_id: string;
  runtime_domain_id: string;
  checkout_root: string;
  package_use_binding: Record<string, unknown> | null;
  catalog: FamilyActionCatalog;
  handler_registry: DomainHandlerRegistry | null;
  request_sha256: string;
  request_byte_size: number;
  input_schema_validation: ReturnType<typeof assertRepoJsonSchemaPayload>;
  timeout_ms: number | null;
  started_at: string;
};

type StandardAgentHandlerRunCompletion = {
  surface_kind: 'opl_standard_agent_handler_run_completion';
  version: 'opl-standard-agent-handler-run-completion.v1';
  execution_kind: 'handler_ref';
  output_schema_validation: ReturnType<typeof assertRepoJsonSchemaPayload>;
  sandbox: {
    runtime_kind: string;
    sandbox_kind: string;
    exit_code: number;
    timed_out: boolean;
  };
};

type StandardAgentActionRunReservation = {
  plan: StandardAgentActionRunPlan;
  completion: StandardAgentHandlerRunCompletion | null;
};

type StandardAgentStageActionLaunch = {
  surface_kind: 'opl_standard_agent_stage_action_launch';
  version: 'opl-standard-agent-stage-action-launch.v1';
  status: 'started' | 'blocked';
  execution_kind: 'stage_binding';
  run_id: string;
  domain_id: string;
  action_id: string;
  binding_ref: string;
  stage_route: NonNullable<FamilyActionCatalogAction['stage_route']>;
  request_ref: string;
  stage_run_invocation_id: string;
  expected_domain_output_schema_ref: string;
  temporal_stage_run: Record<string, unknown>;
  temporal_stage_run_query: Record<string, unknown> | null;
  temporal_stage_run_query_error: ReturnType<typeof observationFailure> | null;
  blocked_reason: string | null;
  authority_boundary: ReturnType<typeof actionAuthorityBoundary>;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function readRepoJson(checkoutRoot: string, ref: string, label: string) {
  try {
    const resolved = resolveContainedRepoJsonFile(checkoutRoot, ref, label, 'managed package checkout');
    const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
    if (!isRecord(parsed)) fail(`${label} must contain an object.`, { ref });
    return parsed;
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail(`${label} could not be resolved from the managed package checkout.`, {
      ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function actionContracts(checkoutRoot: string) {
  let catalog: FamilyActionCatalog | null;
  let registry: DomainHandlerRegistry | null;
  try {
    catalog = normalizeFamilyActionCatalog(
      readRepoJson(checkoutRoot, 'contracts/action_catalog.json', 'Standard Agent action catalog'),
    );
    registry = fs.existsSync(`${checkoutRoot}/contracts/domain_handler_registry.json`)
      ? normalizeDomainHandlerRegistry(
          readRepoJson(checkoutRoot, 'contracts/domain_handler_registry.json', 'Standard Agent handler registry'),
        )
      : null;
    if (!catalog) fail('Standard Agent action catalog is missing.');
    assertFamilyActionHandlerRefsResolve(catalog, registry);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('Standard Agent action contracts are invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return { catalog: catalog!, registry };
}

const ACTION_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function canonicalRunId(value?: string) {
  if (value?.trim()) {
    const runId = value.trim();
    if (!ACTION_RUN_ID_PATTERN.test(runId)) {
      fail('Standard Agent action run_id must be a single safe path segment.', { run_id: runId });
    }
    return runId;
  }
  return `action_${crypto.randomUUID()}`;
}

function canonicalActionId(value: string) {
  const actionId = value.trim();
  if (!actionId) fail('Standard Agent action_id must be non-empty.');
  return actionId;
}

function canonicalTimeoutMs(value?: number) {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('Standard Agent handler timeout must be a positive integer.', { timeout_ms: value });
  }
  return value;
}

function canonicalWorkspaceRoot(value: string) {
  if (!path.isAbsolute(value)) {
    fail('Standard Agent action workspace_root must be absolute.', { workspace_root: value });
  }
  let root: string;
  try {
    root = fs.realpathSync.native(value);
  } catch (error) {
    fail('Standard Agent action workspace_root must resolve to an existing directory.', {
      workspace_root: value,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(root!).isDirectory()) {
    fail('Standard Agent action workspace_root must be a directory.', { workspace_root: root! });
  }
  return root!;
}

function sha256Bytes(bytes: Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function actionRunReservationKey(input: {
  workspaceRoot: string;
  runId: string;
  domainId: string;
  actionId: string;
}) {
  return crypto.createHash('sha256').update(canonicalJsonText({
    workspace_root: input.workspaceRoot,
    run_id: input.runId,
    domain_id: input.domainId,
    action_id: input.actionId,
  })).digest('hex');
}

type ActionRunReservationRow = {
  reservation_key: string;
  plan_json: string;
  completion_json: string | null;
};

function createActionRunReservationTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS standard_agent_action_run_reservations (
      reservation_key TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      workspace_root TEXT NOT NULL,
      request_sha256 TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      completion_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function requireSchemaValidation(value: unknown, field: string) {
  if (
    !isRecord(value)
    || typeof value.schema_ref !== 'string'
    || typeof value.schema_path !== 'string'
    || typeof value.schema_id !== 'string'
    || value.status !== 'valid'
  ) {
    fail(`Standard Agent action reservation ${field} is invalid.`, { field });
  }
  return value as ReturnType<typeof assertRepoJsonSchemaPayload>;
}

function catalogContractProjection(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.actions)) return value;
  return {
    ...value,
    actions: value.actions.map((entry) => {
      if (!isRecord(entry)) return entry;
      const {
        parameter_fields_explicit: _parameterFieldsExplicit,
        ...projected
      } = entry;
      if (projected.authority_boundary === null) delete projected.authority_boundary;
      return projected;
    }),
  };
}

function requireActionRunPlan(value: unknown): StandardAgentActionRunPlan {
  if (
    !isRecord(value)
    || value.surface_kind !== 'opl_standard_agent_action_run_plan'
    || value.version !== 'opl-standard-agent-action-run-plan.v1'
    || typeof value.reservation_key !== 'string'
    || typeof value.run_id !== 'string'
    || typeof value.domain_id !== 'string'
    || typeof value.action_id !== 'string'
    || typeof value.workspace_root !== 'string'
    || !path.isAbsolute(value.workspace_root)
    || typeof value.package_id !== 'string'
    || typeof value.runtime_domain_id !== 'string'
    || typeof value.checkout_root !== 'string'
    || !path.isAbsolute(value.checkout_root)
    || typeof value.request_sha256 !== 'string'
    || !SHA256_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || (value.timeout_ms !== null && (!Number.isSafeInteger(value.timeout_ms) || Number(value.timeout_ms) < 1))
    || typeof value.started_at !== 'string'
    || !value.started_at.trim()
  ) {
    fail('Standard Agent action run reservation plan is invalid.');
  }
  const catalog = normalizeFamilyActionCatalog(catalogContractProjection(value.catalog));
  const registry = value.handler_registry === null
    ? null
    : normalizeDomainHandlerRegistry(value.handler_registry);
  if (!catalog) fail('Standard Agent action run reservation catalog is missing.');
  assertFamilyActionHandlerRefsResolve(catalog, registry);
  const action = catalog.actions.find((candidate) => candidate.action_id === value.action_id);
  const requestedAgent = resolveStandardAgent(value.domain_id);
  const runtimeAgent = resolveStandardAgent(value.runtime_domain_id);
  const catalogAgent = resolveStandardAgent(catalog.target_domain_id);
  if (
    !action
    || !requestedAgent
    || !runtimeAgent
    || !catalogAgent
    || requestedAgent.agent_id !== runtimeAgent.agent_id
    || requestedAgent.agent_id !== catalogAgent.agent_id
    || value.package_id !== requestedAgent.agent_id
    || requestedAgent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP
  ) {
    fail('Standard Agent action run reservation identity is inconsistent.', {
      domain_id: value.domain_id,
      runtime_domain_id: value.runtime_domain_id,
      package_id: value.package_id,
      action_id: value.action_id,
    });
  }
  const plan = {
    ...value,
    package_use_binding: value.package_use_binding === null
      ? null
      : isRecord(value.package_use_binding)
        ? value.package_use_binding
        : fail('Standard Agent action run reservation package binding is invalid.'),
    catalog,
    handler_registry: registry,
    request_byte_size: Number(value.request_byte_size),
    input_schema_validation: requireSchemaValidation(
      value.input_schema_validation,
      'input_schema_validation',
    ),
    timeout_ms: value.timeout_ms === null ? null : Number(value.timeout_ms),
  } as StandardAgentActionRunPlan;
  const expectedKey = actionRunReservationKey({
    workspaceRoot: plan.workspace_root,
    runId: plan.run_id,
    domainId: plan.domain_id,
    actionId: plan.action_id,
  });
  if (plan.reservation_key !== expectedKey) {
    fail('Standard Agent action run reservation key is invalid.', {
      reservation_key: plan.reservation_key,
      expected_reservation_key: expectedKey,
    });
  }
  return plan;
}

function requireHandlerRunCompletion(value: unknown): StandardAgentHandlerRunCompletion {
  if (
    !isRecord(value)
    || value.surface_kind !== 'opl_standard_agent_handler_run_completion'
    || value.version !== 'opl-standard-agent-handler-run-completion.v1'
    || value.execution_kind !== 'handler_ref'
    || !isRecord(value.sandbox)
    || typeof value.sandbox.runtime_kind !== 'string'
    || typeof value.sandbox.sandbox_kind !== 'string'
    || !Number.isSafeInteger(value.sandbox.exit_code)
    || typeof value.sandbox.timed_out !== 'boolean'
  ) {
    fail('Standard Agent handler run completion reservation is invalid.');
  }
  return {
    surface_kind: value.surface_kind,
    version: value.version,
    execution_kind: value.execution_kind,
    output_schema_validation: requireSchemaValidation(
      value.output_schema_validation,
      'output_schema_validation',
    ),
    sandbox: {
      runtime_kind: value.sandbox.runtime_kind,
      sandbox_kind: value.sandbox.sandbox_kind,
      exit_code: Number(value.sandbox.exit_code),
      timed_out: value.sandbox.timed_out,
    },
  };
}

function reservationFromRow(row: ActionRunReservationRow): StandardAgentActionRunReservation {
  const plan = requireActionRunPlan(parseJsonText(row.plan_json));
  if (row.reservation_key !== plan.reservation_key) {
    fail('Standard Agent action run reservation row identity is inconsistent.', {
      row_reservation_key: row.reservation_key,
      plan_reservation_key: plan.reservation_key,
    });
  }
  return {
    plan,
    completion: row.completion_json
      ? requireHandlerRunCompletion(parseJsonText(row.completion_json))
      : null,
  };
}

function withActionRunReservationDb<T>(
  dependencies: RuntimeDependencies,
  operation: (db: DatabaseSync) => T,
) {
  if (dependencies.actionRunReservationDb) {
    createActionRunReservationTable(dependencies.actionRunReservationDb);
    return operation(dependencies.actionRunReservationDb);
  }
  const { db } = openQueueDb();
  try {
    createActionRunReservationTable(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function inspectActionRunReservation(
  identity: { workspaceRoot: string; runId: string; domainId: string; actionId: string },
  dependencies: RuntimeDependencies,
) {
  const reservationKey = actionRunReservationKey(identity);
  return withActionRunReservationDb(dependencies, (db) => {
    const row = db.prepare(`
      SELECT reservation_key, plan_json, completion_json
      FROM standard_agent_action_run_reservations
      WHERE reservation_key = ?
    `).get(reservationKey) as ActionRunReservationRow | undefined;
    return row ? reservationFromRow(row) : null;
  });
}

function reserveActionRunPlan(
  candidate: StandardAgentActionRunPlan,
  dependencies: RuntimeDependencies,
) {
  const validatedCandidate = requireActionRunPlan(candidate);
  return withActionRunReservationDb(dependencies, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare(`
        SELECT reservation_key, plan_json, completion_json
        FROM standard_agent_action_run_reservations
        WHERE reservation_key = ?
      `).get(validatedCandidate.reservation_key) as ActionRunReservationRow | undefined;
      if (existing) {
        db.exec('COMMIT');
        return reservationFromRow(existing);
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO standard_agent_action_run_reservations (
          reservation_key, run_id, domain_id, action_id, workspace_root,
          request_sha256, plan_json, completion_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(
        validatedCandidate.reservation_key,
        validatedCandidate.run_id,
        validatedCandidate.domain_id,
        validatedCandidate.action_id,
        validatedCandidate.workspace_root,
        validatedCandidate.request_sha256,
        canonicalJsonText(validatedCandidate),
        now,
        now,
      );
      db.exec('COMMIT');
      return { plan: validatedCandidate, completion: null };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

function recordHandlerRunCompletion(
  plan: StandardAgentActionRunPlan,
  completion: StandardAgentHandlerRunCompletion,
  dependencies: RuntimeDependencies,
) {
  return withActionRunReservationDb(dependencies, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare(`
        SELECT reservation_key, plan_json, completion_json
        FROM standard_agent_action_run_reservations
        WHERE reservation_key = ?
      `).get(plan.reservation_key) as ActionRunReservationRow | undefined;
      if (!row) fail('Standard Agent action run completion requires a durable reservation.');
      const reservation = reservationFromRow(row!);
      if (canonicalJsonText(reservation.plan) !== canonicalJsonText(plan)) {
        fail('Standard Agent action run completion conflicts with its reserved generation.');
      }
      if (reservation.completion) {
        if (canonicalJsonText(reservation.completion) !== canonicalJsonText(completion)) {
          fail('Standard Agent action run completion conflicts with the persisted completion.');
        }
        db.exec('COMMIT');
        return reservation;
      }
      db.prepare(`
        UPDATE standard_agent_action_run_reservations
        SET completion_json = ?, updated_at = ?
        WHERE reservation_key = ? AND completion_json IS NULL
      `).run(canonicalJsonText(completion), new Date().toISOString(), plan.reservation_key);
      db.exec('COMMIT');
      return { plan, completion };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

function normalizedPayload(action: FamilyActionCatalogAction, payload: Record<string, unknown>, workspaceRoot: string) {
  const normalized = { ...payload };
  for (const field of action.workspace_locator_fields) {
    if (field !== 'workspace_root' && field !== 'workspace_path') continue;
    const declared = normalized[field];
    if (declared !== undefined && declared !== workspaceRoot) {
      fail(`Standard Agent action ${field} conflicts with --workspace.`, {
        field,
        declared,
        workspace_root: workspaceRoot,
      });
    }
    normalized[field] = workspaceRoot;
  }
  return normalized;
}

function actionFromRunPlan(plan: StandardAgentActionRunPlan) {
  return plan.catalog.actions.find((candidate) => candidate.action_id === plan.action_id)
    ?? fail('Standard Agent action run reservation no longer contains its selected action.', {
      action_id: plan.action_id,
      reservation_key: plan.reservation_key,
    });
}

function preparedRequestForRunPlan(input: {
  payload: Record<string, unknown>;
  plan: StandardAgentActionRunPlan;
}) {
  const action = actionFromRunPlan(input.plan);
  const payload = normalizedPayload(action, input.payload, input.plan.workspace_root);
  const requestBytes = canonicalJsonBytes(payload);
  const requestSha256 = sha256Bytes(requestBytes);
  if (
    requestSha256 !== input.plan.request_sha256
    || requestBytes.byteLength !== input.plan.request_byte_size
  ) {
    fail('Standard Agent action run_id is already bound to different canonical request bytes.', {
      run_id: input.plan.run_id,
      expected_request_sha256: input.plan.request_sha256,
      actual_request_sha256: requestSha256,
      expected_request_byte_size: input.plan.request_byte_size,
      actual_request_byte_size: requestBytes.byteLength,
    });
  }
  const prepared = prepareStandardAgentActionRunRequest({
    workspaceRoot: input.plan.workspace_root,
    runId: input.plan.run_id,
    domainId: input.plan.domain_id,
    actionId: input.plan.action_id,
    requestBytes,
  });
  return { action, payload, requestBytes, prepared };
}

function storedBytesRef(value: { ref: string; sha256: string; byte_size: number }) {
  return { ref: value.ref, sha256: value.sha256, byte_size: value.byte_size };
}

function actionLedger(input: {
  runId: string;
  domainId: string;
  actionId: string;
  bindingRef: string;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  startedAt: string;
  recordedAt: string;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}) {
  const { db } = openQueueDb();
  try {
    return recordStandardAgentActionRunEvent({
      db,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.actionId,
      bindingRef: input.bindingRef,
      status: input.status,
      startedAt: input.startedAt,
      recordedAt: input.recordedAt,
      input: storedBytesRef(input.stored.request),
      output: storedBytesRef(input.stored.output),
    });
  } finally {
    db.close();
  }
}

function failureBytes(error: unknown) {
  return canonicalJsonBytes({
    surface_kind: 'opl_standard_agent_action_failure',
    version: 'opl-standard-agent-action-failure.v1',
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_failed',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details : {},
  });
}

function observationFailure(error: unknown) {
  return {
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_observation_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function persistedStageActionLaunch(input: {
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>;
  runId: string;
  domainId: string;
  actionId: string;
}): StandardAgentStageActionLaunch {
  const persisted = parseJsonText(fs.readFileSync(input.stored.output.file_path, 'utf8'));
  if (
    !isRecord(persisted)
    || persisted.surface_kind !== 'opl_standard_agent_stage_action_launch'
    || persisted.version !== 'opl-standard-agent-stage-action-launch.v1'
    || persisted.execution_kind !== 'stage_binding'
    || persisted.run_id !== input.runId
    || persisted.domain_id !== input.domainId
    || persisted.action_id !== input.actionId
    || (persisted.status !== 'started' && persisted.status !== 'blocked')
    || typeof persisted.binding_ref !== 'string'
    || !isRecord(persisted.stage_route)
    || typeof persisted.request_ref !== 'string'
    || typeof persisted.stage_run_invocation_id !== 'string'
    || typeof persisted.expected_domain_output_schema_ref !== 'string'
    || !isRecord(persisted.temporal_stage_run)
    || (persisted.temporal_stage_run_query !== null && !isRecord(persisted.temporal_stage_run_query))
    || (persisted.temporal_stage_run_query_error !== null && !isRecord(persisted.temporal_stage_run_query_error))
    || (persisted.blocked_reason !== null && typeof persisted.blocked_reason !== 'string')
    || !isRecord(persisted.authority_boundary)
  ) {
    fail('Existing Standard Agent action output is not the immutable Stage launch for this run identity.', {
      run_id: input.runId,
      output_ref: input.stored.output.ref,
    });
  }
  return persisted as unknown as StandardAgentStageActionLaunch;
}

function replayPersistedHandlerAction(input: {
  plan: StandardAgentActionRunPlan;
  action: FamilyActionCatalogAction;
  completion: StandardAgentHandlerRunCompletion | null;
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>;
  recordLedger: typeof actionLedger;
}) {
  const handlerRef = input.action.execution_binding.kind === 'handler_ref'
    ? input.action.execution_binding.handler_ref
    : fail('Reserved handler action has an invalid execution binding.');
  if (!input.completion) {
    fail('Existing Standard Agent handler output is missing its durable completion record.', {
      run_id: input.plan.run_id,
      output_ref: input.stored.output.ref,
      failure_code: 'standard_agent_handler_completion_missing',
    });
  }
  const result = parseJsonText(fs.readFileSync(input.stored.output.file_path, 'utf8'));
  const recordedAt = new Date().toISOString();
  const ledger = input.recordLedger({
    runId: input.plan.run_id,
    domainId: input.plan.domain_id,
    actionId: input.plan.action_id,
    bindingRef: handlerRef,
    status: 'completed',
    startedAt: input.plan.started_at,
    recordedAt,
    stored: input.stored,
  });
  return {
    surface_kind: 'opl_standard_agent_action_run',
    version: 'opl-standard-agent-action-run.v1',
    status: 'completed',
    execution_kind: 'handler_ref' as const,
    run_id: input.plan.run_id,
    domain_id: input.plan.domain_id,
    action_id: input.plan.action_id,
    binding_ref: handlerRef,
    package_use_binding: input.plan.package_use_binding,
    input_schema_ref: input.action.input_schema_ref,
    output_schema_validation: input.completion.output_schema_validation,
    request: input.stored.request,
    output: input.stored.output,
    result,
    sandbox: input.completion.sandbox,
    ledger: ledger.ledger_entry,
    authority_boundary: actionAuthorityBoundary(),
  };
}

function replayPersistedStageAction(input: {
  plan: StandardAgentActionRunPlan;
  action: FamilyActionCatalogAction;
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>;
  recordLedger: typeof actionLedger;
}) {
  const executionBinding = input.action.execution_binding;
  const stageRoute = input.action.stage_route;
  if (executionBinding.kind !== 'stage_binding' || !stageRoute) {
    fail('Reserved Stage action has an invalid execution binding.', {
      action_id: input.plan.action_id,
    });
  }
  const bindingRef = `stage:${executionBinding.stage_manifest_ref}#${stageRoute.entry_stage_ref}`;
  const persisted = persistedStageActionLaunch({
    stored: input.stored,
    runId: input.plan.run_id,
    domainId: input.plan.domain_id,
    actionId: input.plan.action_id,
  });
  if (
    persisted.binding_ref !== bindingRef
    || canonicalJsonText(persisted.stage_route) !== canonicalJsonText(stageRoute)
    || persisted.request_ref !== input.stored.request.ref
    || persisted.expected_domain_output_schema_ref !== input.action.output_schema_ref
  ) {
    fail('Existing Standard Agent Stage output conflicts with its reserved generation.', {
      run_id: input.plan.run_id,
      output_ref: input.stored.output.ref,
      reservation_key: input.plan.reservation_key,
    });
  }
  const recordedAt = new Date().toISOString();
  const ledger = input.recordLedger({
    runId: input.plan.run_id,
    domainId: input.plan.domain_id,
    actionId: input.plan.action_id,
    bindingRef,
    status: persisted.status,
    startedAt: input.plan.started_at,
    recordedAt,
    stored: input.stored,
  });
  return {
    ...persisted,
    package_use_binding: input.plan.package_use_binding,
    request: input.stored.request,
    output: input.stored.output,
    ledger: ledger.ledger_entry,
  };
}

function wrapFailure(error: unknown, stored: ReturnType<typeof commitStandardAgentActionOutput>): never {
  throw new FrameworkContractError(
    error instanceof FrameworkContractError ? error.code : 'contract_shape_invalid',
    error instanceof Error ? error.message : String(error),
    {
      ...(error instanceof FrameworkContractError ? error.details : {}),
      action_run_ref: stored.action_run_ref,
      request_ref: stored.request.ref,
      output_ref: stored.output.ref,
    },
  );
}

function actionAuthorityBoundary() {
  return {
    opl_role: 'host_transport_schema_validation_exact_byte_persistence_and_refs_only_ledger',
    domain_role: 'truth_artifact_memory_quality_owner_receipt_typed_blocker_and_human_gate_authority',
    provider_completion_is_domain_ready: false,
    opl_can_write_domain_truth: false,
    opl_can_create_owner_receipt: false,
    opl_can_create_typed_blocker: false,
    opl_can_claim_quality_or_export_ready: false,
  } as const;
}

async function runHandlerAction(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  action: FamilyActionCatalogAction;
  registry: DomainHandlerRegistry;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  startedAt: string;
  runHandler: typeof runStandardAgentHandlerSandbox;
  recordLedger: typeof actionLedger;
}) {
  const handlerRef = input.action.execution_binding.kind === 'handler_ref'
    ? input.action.execution_binding.handler_ref
    : fail('Handler action has an invalid execution binding.');
  const handlerId = handlerRef.slice('handler:'.length);
  const handler = input.registry.handlers.find((entry) => entry.handler_id === handlerId)
    ?? fail('Standard Agent action handler is unresolved.', { handler_ref: handlerRef });
  prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });

  let receipt: ReturnType<typeof input.runHandler>;
  try {
    receipt = input.runHandler({
      checkoutRoot: input.checkoutRoot,
      binding: handler.binding,
      request: input.runtimeInput.payload,
      readRoots: [input.workspaceRoot],
      timeoutMs: input.runtimeInput.timeoutMs,
    });
  } catch (error) {
    const recordedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: failureBytes(error),
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: handlerRef,
      status: 'failed',
      startedAt: input.startedAt,
      recordedAt,
      stored,
    });
    wrapFailure(error, stored);
  }

  let outputValidation: ReturnType<typeof assertRepoJsonSchemaPayload>;
  try {
    outputValidation = assertRepoJsonSchemaPayload({
      repoRoot: input.checkoutRoot,
      schemaRef: input.action.output_schema_ref,
      payload: receipt.output,
      label: `Standard Agent action ${input.action.action_id} output`,
    });
  } catch (error) {
    const recordedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: receipt.stdout_bytes,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: handlerRef,
      status: 'failed',
      startedAt: input.startedAt,
      recordedAt,
      stored,
    });
    wrapFailure(error, stored);
  }

  const recordedAt = new Date().toISOString();
  const stored = commitStandardAgentActionOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
    outputBytes: receipt.stdout_bytes,
  });
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    bindingRef: handlerRef,
    status: 'completed',
    startedAt: input.startedAt,
    recordedAt,
    stored,
  });
  return {
    surface_kind: 'opl_standard_agent_action_run',
    version: 'opl-standard-agent-action-run.v1',
    status: 'completed',
    execution_kind: 'handler_ref' as const,
    run_id: input.runId,
    domain_id: input.domainId,
    action_id: input.action.action_id,
    binding_ref: handlerRef,
    package_use_binding: input.packageUseBinding,
    input_schema_ref: input.action.input_schema_ref,
    output_schema_validation: outputValidation,
    request: stored.request,
    output: stored.output,
    result: receipt.output,
    sandbox: {
      runtime_kind: receipt.runtime_kind,
      sandbox_kind: receipt.sandbox_kind,
      exit_code: receipt.exit_code,
      timed_out: receipt.timed_out,
    },
    ledger: ledger.ledger_entry,
    authority_boundary: actionAuthorityBoundary(),
  };
}

async function runStageAction(input: {
  action: FamilyActionCatalogAction;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  startedAt: string;
  runStageRuntime: typeof runFamilyRuntime;
  recordLedger: typeof actionLedger;
}) {
  const executionBinding = input.action.execution_binding;
  const stageRoute = input.action.stage_route;
  if (executionBinding.kind !== 'stage_binding' || !stageRoute) {
    fail('Stage action has an invalid execution binding.', { action_id: input.action.action_id });
  }
  const prepared = prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  const workspaceLocator = canonicalJsonText({
    workspace_root: input.workspaceRoot,
    standard_agent_action_run_ref: prepared.action_run_ref,
    action_request_ref: prepared.request.ref,
    action_request_sha256: prepared.request.sha256,
  });
  const bindingRef = `stage:${executionBinding.stage_manifest_ref}#${stageRoute.entry_stage_ref}`;
  const stageRunInvocationId = buildHostedActionStageRunInvocationId({
    domainId: input.domainId,
    stageId: stageRoute.entry_stage_ref,
    actionId: input.action.action_id,
    runId: input.runId,
    actionRunRef: prepared.action_run_ref,
  });

  const output: StandardAgentStageActionLaunch = await (async () => {
    try {
      const created = await input.runStageRuntime([
        'attempt',
        'create',
        '--domain',
        input.runtimeDomainId,
        '--stage',
        stageRoute.entry_stage_ref,
        '--action',
        input.action.action_id,
        '--provider',
        'temporal',
        '--workspace-locator',
        workspaceLocator,
        '--source-fingerprint',
        prepared.request.sha256,
        '--invocation-mode',
        'invocation',
        '--checkpoint-ref',
        prepared.request.ref,
        '--input-artifact-ref',
        prepared.request.ref,
        '--input-artifact-sha256',
        prepared.request.sha256,
        '--stage-run-invocation-id',
        stageRunInvocationId,
        '--start',
      ]);
      const stageRun = isRecord(created.family_runtime_stage_run)
        ? created.family_runtime_stage_run
        : null;
      if (!stageRun) {
        fail('Stage-bound Standard Agent actions require the Temporal StageRun controller.', {
          action_id: input.action.action_id,
          returned_surface: Object.keys(created),
          failure_code: 'standard_agent_stage_action_requires_temporal_stage_run',
        });
      }
      const stageRunInput = isRecord(stageRun.stage_run_input) ? stageRun.stage_run_input : {};
      const workflowId = typeof stageRunInput.workflow_id === 'string' ? stageRunInput.workflow_id : '';
      const blockedReason = typeof stageRun.blocked_reason === 'string' && stageRun.blocked_reason.trim()
        ? stageRun.blocked_reason.trim()
        : null;
      if (!workflowId) fail('Temporal StageRun launch did not return a workflow id.');
      let query: Awaited<ReturnType<typeof input.runStageRuntime>> | null = null;
      let queryError: ReturnType<typeof observationFailure> | null = null;
      if (!blockedReason) {
        try {
          query = await input.runStageRuntime(['stage-run', 'query', workflowId]);
        } catch (error) {
          queryError = observationFailure(error);
        }
      }
      return {
        surface_kind: 'opl_standard_agent_stage_action_launch',
        version: 'opl-standard-agent-stage-action-launch.v1',
        status: blockedReason ? 'blocked' as const : 'started' as const,
        execution_kind: 'stage_binding' as const,
        run_id: input.runId,
        domain_id: input.domainId,
        action_id: input.action.action_id,
        binding_ref: bindingRef,
        stage_route: stageRoute,
        request_ref: prepared.request.ref,
        stage_run_invocation_id: stageRunInvocationId,
        expected_domain_output_schema_ref: input.action.output_schema_ref,
        temporal_stage_run: created,
        temporal_stage_run_query: query,
        temporal_stage_run_query_error: queryError,
        blocked_reason: blockedReason,
        authority_boundary: actionAuthorityBoundary(),
      };
    } catch (error) {
      const recordedAt = new Date().toISOString();
      const stored = commitStandardAgentActionOutput({
        workspaceRoot: input.workspaceRoot,
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        requestBytes: input.requestBytes,
        outputBytes: failureBytes(error),
      });
      input.recordLedger({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        bindingRef,
        status: 'failed',
        startedAt: input.startedAt,
        recordedAt,
        stored,
      });
      wrapFailure(error, stored);
    }
  })();

  const recordedAt = new Date().toISOString();
  const existing = inspectStandardAgentActionRunOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  if (existing) {
    const persisted = persistedStageActionLaunch({
      stored: existing,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
    });
    const ledger = input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef,
      status: persisted.status,
      startedAt: input.startedAt,
      recordedAt,
      stored: existing,
    });
    return {
      ...persisted,
      package_use_binding: input.packageUseBinding,
      request: existing.request,
      output: existing.output,
      ledger: ledger.ledger_entry,
    };
  }
  const stored = commitStandardAgentActionOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
    outputBytes: canonicalJsonBytes(output),
  });
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    bindingRef,
    status: output.status,
    startedAt: input.startedAt,
    recordedAt,
    stored,
  });
  return {
    ...output,
    package_use_binding: input.packageUseBinding,
    request: stored.request,
    output: stored.output,
    ledger: ledger.ledger_entry,
  };
}

export async function runStandardAgentAction(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
) {
  if (!isRecord(input.payload)) fail('Standard Agent action payload must be a JSON object.');
  const runId = canonicalRunId(input.runId);
  const actionId = canonicalActionId(input.actionId);
  const workspaceRoot = canonicalWorkspaceRoot(input.workspaceRoot);
  const requestedAgent = resolveStandardAgent(input.domainId);
  if (!requestedAgent || requestedAgent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    throw new FrameworkContractError(
      'domain_not_found',
      'agents run requires one registered Standard OPL Agent.',
      { domain_id: input.domainId },
    );
  }
  const identity = {
    workspaceRoot,
    runId,
    domainId: requestedAgent.agent_id,
    actionId,
  };
  let reservation = inspectActionRunReservation(identity, dependencies);

  if (!reservation) {
    const startedAt = new Date().toISOString();
    const resolveManagedCheckout = dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout;
    const managed = await resolveManagedCheckout({
      domainId: requestedAgent.agent_id,
      workspaceRoot,
    });
    const managedWorkspaceRoot = canonicalWorkspaceRoot(managed.workspace_root);
    const catalogAgent = resolveStandardAgent(managed.agent.target_domain_id);
    if (
      !catalogAgent
      || requestedAgent.agent_id !== catalogAgent.agent_id
      || managed.agent.agent_id !== requestedAgent.agent_id
      || managed.package_id !== requestedAgent.agent_id
      || managedWorkspaceRoot !== workspaceRoot
    ) {
      fail('Standard Agent managed checkout identity is inconsistent.', {
        requested_domain_id: input.domainId,
        requested_agent_id: requestedAgent.agent_id,
        managed_agent_id: managed.agent.agent_id,
        managed_package_id: managed.package_id,
        requested_workspace_root: workspaceRoot,
        managed_workspace_root: managedWorkspaceRoot,
      });
    }
    const checkoutRoot = canonicalWorkspaceRoot(managed.checkout_root);
    const { catalog, registry } = actionContracts(checkoutRoot);
    const declaredAgent = resolveStandardAgent(catalog.target_domain_id);
    if (!declaredAgent || declaredAgent.agent_id !== managed.agent.agent_id) {
      fail('Standard Agent action catalog target does not match the managed package.', {
        package_id: managed.package_id,
        catalog_target_domain_id: catalog.target_domain_id,
      });
    }
    const action = catalog.actions.find((candidate) => candidate.action_id === actionId)
      ?? fail('Standard Agent action is not declared by the managed package.', {
        domain_id: managed.agent.agent_id,
        action_id: actionId,
        available_action_ids: catalog.actions.map((candidate) => candidate.action_id),
      });
    const payload = normalizedPayload(action, input.payload, workspaceRoot);
    if (action.execution_binding.kind === 'stage_binding') {
      (dependencies.compileStageManifest ?? compileStandardAgentStageManifest)(checkoutRoot);
    }
    const inputValidation = assertRepoJsonSchemaPayload({
      repoRoot: checkoutRoot,
      schemaRef: action.input_schema_ref,
      payload,
      label: `Standard Agent action ${action.action_id} input`,
    });
    const requestBytes = canonicalJsonBytes(payload);
    prepareStandardAgentActionRunRequest({
      workspaceRoot,
      runId,
      domainId: requestedAgent.agent_id,
      actionId,
      requestBytes,
    });
    const packageUseBinding = managed.package_use_binding == null
      ? null
      : isRecord(managed.package_use_binding)
        ? managed.package_use_binding
        : fail('Standard Agent managed checkout package_use_binding must be an object or null.');
    reservation = reserveActionRunPlan({
      surface_kind: 'opl_standard_agent_action_run_plan',
      version: 'opl-standard-agent-action-run-plan.v1',
      reservation_key: actionRunReservationKey(identity),
      run_id: runId,
      domain_id: requestedAgent.agent_id,
      action_id: actionId,
      workspace_root: workspaceRoot,
      package_id: managed.package_id,
      runtime_domain_id: managed.agent.domain_id,
      checkout_root: checkoutRoot,
      package_use_binding: packageUseBinding,
      catalog,
      handler_registry: registry,
      request_sha256: sha256Bytes(requestBytes),
      request_byte_size: requestBytes.byteLength,
      input_schema_validation: inputValidation,
      timeout_ms: canonicalTimeoutMs(input.timeoutMs),
      started_at: startedAt,
    }, dependencies);
  }

  const plan = reservation.plan;
  const prepared = preparedRequestForRunPlan({ payload: input.payload, plan });
  const recordLedger = dependencies.recordLedger ?? actionLedger;
  const stored = inspectStandardAgentActionRunOutput({
    workspaceRoot: plan.workspace_root,
    runId: plan.run_id,
    domainId: plan.domain_id,
    actionId: plan.action_id,
    requestBytes: prepared.requestBytes,
  });
  let result;
  if (stored) {
    result = prepared.action.execution_binding.kind === 'handler_ref'
      ? replayPersistedHandlerAction({
          plan,
          action: prepared.action,
          completion: reservation.completion,
          stored,
          recordLedger,
        })
      : replayPersistedStageAction({
          plan,
          action: prepared.action,
          stored,
          recordLedger,
        });
  } else if (prepared.action.execution_binding.kind === 'handler_ref') {
    result = await runHandlerAction({
      action: prepared.action,
      workspaceRoot: plan.workspace_root,
      domainId: plan.domain_id,
      runId: plan.run_id,
      requestBytes: prepared.requestBytes,
      packageUseBinding: plan.package_use_binding,
      startedAt: plan.started_at,
      runtimeInput: {
        domainId: plan.domain_id,
        actionId: plan.action_id,
        workspaceRoot: plan.workspace_root,
        payload: prepared.payload,
        runId: plan.run_id,
        ...(plan.timeout_ms === null ? {} : { timeoutMs: plan.timeout_ms }),
      },
      registry: plan.handler_registry ?? fail('Handler-bound action requires a handler registry.'),
      checkoutRoot: plan.checkout_root,
      runHandler: dependencies.runHandler ?? runStandardAgentHandlerSandbox,
      recordLedger,
    });
    const completion: StandardAgentHandlerRunCompletion = {
      surface_kind: 'opl_standard_agent_handler_run_completion',
      version: 'opl-standard-agent-handler-run-completion.v1',
      execution_kind: 'handler_ref',
      output_schema_validation: result.output_schema_validation,
      sandbox: result.sandbox,
    };
    recordHandlerRunCompletion(plan, completion, dependencies);
  } else {
    result = await runStageAction({
      action: prepared.action,
      workspaceRoot: plan.workspace_root,
      domainId: plan.domain_id,
      runtimeDomainId: plan.runtime_domain_id,
      runId: plan.run_id,
      requestBytes: prepared.requestBytes,
      packageUseBinding: plan.package_use_binding,
      startedAt: plan.started_at,
      runStageRuntime: dependencies.runStageRuntime ?? runFamilyRuntime,
      recordLedger,
    });
  }
  return {
    version: 'g2',
    standard_agent_action_run: {
      ...result,
      input_schema_validation: plan.input_schema_validation,
    },
  };
}
