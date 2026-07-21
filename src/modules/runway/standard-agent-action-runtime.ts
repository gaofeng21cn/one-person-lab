import crypto from 'node:crypto';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord, type ErrorCode } from '../../kernel/contract-validation.ts';
import {
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
  type FamilyActionCatalogAction,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../kernel/repo-json-schema.ts';
import {
  readFoundryProviderManifest,
  validateDesignRequest,
  type FoundryProviderManifest,
} from '../foundry/index.ts';
import { startTemporalFoundryRunWorkflow } from './foundry-temporal-control.ts';
import { compileStandardAgentStageManifest } from '../pack/public/standard-agent-action-runtime.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  inspectStoredStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  readStandardAgentActionStoredBytes,
} from '../workspace/public/standard-agent-action-runtime.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { buildHostedActionStageRunInvocationId } from './family-runtime-stage-run-identity.ts';
import { openQueueDb } from './family-runtime-store.ts';
import {
  DefaultHostedAgentRuntimeBindingResolver,
  hostedRuntimeExecutionBindingRef,
  readHostedAgentRuntimeActionContracts,
  type HostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingResolver,
  type HostedAgentRuntimeBindingSnapshot,
} from './hosted-agent-runtime-binding.ts';
import {
  commitStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunState,
  reserveStandardAgentActionRunBinding,
  type StandardAgentCompletedHandlerReplay,
  type StandardAgentActionRunBinding,
  type StandardAgentActionRunCompletion,
  type StandardAgentActionRunPlan,
} from './standard-agent-action-run-state.ts';
import { recordStandardAgentActionRunEvent } from './standard-agent-action-run-recorder.ts';
import { runStandardAgentHandlerSandbox } from './standard-agent-handler-sandbox.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';
import { applyDomainArtifactCasMaterialization } from './domain-artifact-cas-materialization.ts';
import {
  bindStandardAgentLifecycleReactivation,
  materializedStandardAgentLifecycleAdmission,
  preflightStandardAgentDomainLifecycleAdmission,
  prepareStandardAgentLifecycleReactivation,
  standardAgentLifecycleAdmissionContract,
  type PreparedStandardAgentLifecycleReactivation,
} from './standard-agent-domain-lifecycle-admission.ts';

type StandardAgentActionRuntimeInput = {
  domainId: string;
  actionId: string;
  workspaceRoot: string;
  payload: Record<string, unknown>;
  runId?: string;
  timeoutMs?: number;
};

const INTERNAL_STANDARD_AGENT_ACTION_INVOCATION = Symbol('internal_standard_agent_action_invocation');

type RuntimeDependencies = {
  resolveManagedCheckout?: typeof resolveStandardAgentManagedCheckout;
  resolveRuntimeBinding?: HostedAgentRuntimeBindingResolver['resolve'];
  resolvePinnedRuntimeBinding?: HostedAgentRuntimeBindingResolver['resolvePinned'];
  foundryRootOverride?: string;
  runHandler?: typeof runStandardAgentHandlerSandbox;
  applyDomainArtifactCas?: typeof applyDomainArtifactCasMaterialization;
  runStageRuntime?: typeof runFamilyRuntime;
  compileStageManifest?: typeof compileStandardAgentStageManifest;
  recordLedger?: typeof actionLedger;
  startFoundryRun?: (input: {
    request: ReturnType<typeof validateDesignRequest>;
    run_id: string;
  }) => Promise<unknown>;
};

type StandardAgentActionContext = {
  action: FamilyActionCatalogAction;
  catalog: FamilyActionCatalog;
  registry: DomainHandlerRegistry | null;
  payload: Record<string, unknown>;
  foundryRequest: ReturnType<typeof validateDesignRequest> | null;
  foundryProvider: FoundryProviderManifest | null;
  inputValidation: Record<string, unknown>;
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
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
  authority_boundary: ReturnType<typeof actionAuthorityBoundary>;
};

type StandardAgentStageActionReadback = Omit<StandardAgentStageActionLaunch, 'status'> & {
  status: StandardAgentStageActionLaunch['status']
    | 'completed'
    | 'completed_with_quality_debt'
    | 'human_gate'
    | 'failed';
};

const STAGE_ACTION_TERMINAL_STATUSES = new Set<StandardAgentStageActionReadback['status']>([
  'completed',
  'completed_with_quality_debt',
  'blocked',
  'human_gate',
  'failed',
]);

type StandardAgentFoundryActionLaunch = {
  surface_kind: 'opl_standard_agent_foundry_action_launch';
  version: 'opl-standard-agent-foundry-action-launch.v1';
  status: 'started';
  execution_kind: 'foundry_binding';
  run_id: string;
  domain_id: string;
  action_id: string;
  binding_ref: string;
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
  foundry_run: Record<string, unknown>;
  authority_boundary: ReturnType<typeof foundryActionAuthorityBoundary>;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalRunId(value?: string) {
  if (value?.trim()) return value.trim();
  return `action_${crypto.randomUUID()}`;
}

function canonicalTimeoutMs(value?: number) {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('Standard Agent action timeoutMs must be a positive integer.', { timeout_ms: value });
  }
  return value;
}

function assertStandardAgentActionInvocationSurface(
  action: FamilyActionCatalogAction,
  invocationContext?: symbol,
) {
  const internalOnly = Object.values(action.supported_surfaces).every((surface) => surface === null);
  if (internalOnly && invocationContext !== INTERNAL_STANDARD_AGENT_ACTION_INVOCATION) {
    fail('Internal-only Standard Agent action cannot be invoked from an external runtime surface.', {
      failure_code: 'standard_agent_internal_action_external_invocation_forbidden',
      action_id: action.action_id,
      supported_surfaces: action.supported_surfaces,
    });
  }
}

function standardAgentRuntimeResolver(
  dependencies: RuntimeDependencies,
): Pick<HostedAgentRuntimeBindingResolver, 'resolve' | 'resolvePinned'> {
  const defaultResolver = new DefaultHostedAgentRuntimeBindingResolver({
    root_override: dependencies.foundryRootOverride,
    resolve_managed_checkout: dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout,
  });
  return dependencies.resolveRuntimeBinding
    ? {
        resolve: dependencies.resolveRuntimeBinding,
        resolvePinned: dependencies.resolvePinnedRuntimeBinding ?? (async () => fail(
          'A custom hosted runtime resolver must provide resolvePinned for legacy durable action replay.',
        )),
      }
    : defaultResolver;
}

function originalInvocationSha256(input: {
  domainId: string;
  actionId: string;
  runId: string;
  workspaceRoot: string;
  requestPayloadSha256: string;
  timeoutMs: number | null;
}) {
  return sha256(canonicalJsonBytes({
    canonical_domain_id: input.domainId,
    action_id: input.actionId,
    run_id: input.runId,
    workspace_root: input.workspaceRoot,
    request_payload_sha256: input.requestPayloadSha256,
    timeout_ms: input.timeoutMs,
  }));
}

function packageUseBinding(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('Hosted Agent package_use_binding must be an object or null.');
  return value;
}

function canonicalDomainIds(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
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

const WORK_ITEM_IDENTITY_FIELDS = ['work_item_id', 'study_id', 'quest_id'] as const;

function actionWorkItemIdentityLocator(
  action: FamilyActionCatalogAction,
  payload: Record<string, unknown>,
) {
  const allowedFields = new Set([
    ...action.required_fields,
    ...action.optional_fields,
    ...action.workspace_locator_fields,
  ]);
  return Object.fromEntries(WORK_ITEM_IDENTITY_FIELDS.flatMap((field) => {
    const value = payload[field];
    return allowedFields.has(field) && typeof value === 'string' && value.trim()
      ? [[field, value.trim()]]
      : [];
  }));
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

function persistedError(error: unknown) {
  return {
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_failed',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details ?? {} : {},
  };
}

function persistedFrameworkErrorCode(value: string): ErrorCode {
  const supported: ErrorCode[] = [
    'contract_file_missing',
    'contract_json_invalid',
    'contract_shape_invalid',
    'build_command_failed',
    'launcher_failed',
    'workstream_not_found',
    'domain_not_found',
    'surface_not_found',
    'missing_family_action_catalog',
    'missing_family_stage_control_plane',
    'framework_locator_invalid_root',
    'framework_locator_not_found',
    'runtime_state_lock_timeout',
    'managed_update_lock_contention',
    'cli_usage_error',
    'unknown_command',
    'codex_command_failed',
  ];
  return supported.includes(value as ErrorCode) ? value as ErrorCode : 'contract_shape_invalid';
}

function completionBase(input: {
  runId: string;
  domainId: string;
  actionId: string;
  executionKind: StandardAgentActionRunCompletion['execution_kind'];
  status: StandardAgentActionRunCompletion['status'];
  bindingRef: string;
  runtimeBindingRef: string;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}): Omit<
  StandardAgentActionRunCompletion,
  'failure_disposition' | 'sandbox' | 'error' | 'completed_handler_replay'
> {
  return {
    surface_kind: 'opl_standard_agent_action_run_completion',
    version: 'opl-standard-agent-action-run-completion.v1',
    run_id: input.runId,
    canonical_domain_id: input.domainId,
    action_id: input.actionId,
    execution_kind: input.executionKind,
    status: input.status,
    binding_ref: input.bindingRef,
    hosted_runtime_binding_ref: input.runtimeBindingRef,
    request_sha256: input.stored.request.sha256,
    request_byte_size: input.stored.request.byte_size,
    output_sha256: input.stored.output.sha256,
    output_byte_size: input.stored.output.byte_size,
  };
}

function persistCompletion(
  workspaceRoot: string,
  completion: StandardAgentActionRunCompletion,
) {
  return commitStandardAgentActionRunCompletion({ workspaceRoot, completion }).completion;
}

function assertCompletionMatchesStored(
  completion: StandardAgentActionRunCompletion,
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>,
) {
  if (
    completion.request_sha256 !== stored.request.sha256
    || completion.request_byte_size !== stored.request.byte_size
    || completion.output_sha256 !== stored.output.sha256
    || completion.output_byte_size !== stored.output.byte_size
  ) {
    fail('Standard Agent action completion does not match the persisted request or output bytes.', {
      run_id: completion.run_id,
    });
  }
}

function completedHandlerReplay(input: {
  acceptedDomainIds: readonly string[];
  requestPayloadSha256: string;
  packageUseBinding: unknown;
  inputSchemaRef: string;
  inputSchemaValidation: Record<string, unknown>;
  outputSchemaValidation: Record<string, unknown>;
}): StandardAgentCompletedHandlerReplay {
  if (!isRecord(input.packageUseBinding)) {
    fail('Completed Handler replay requires a durable package-use binding.');
  }
  return {
    accepted_domain_ids: [...new Set(input.acceptedDomainIds.map((value) => value.trim()).filter(Boolean))].sort(),
    request_payload_sha256: input.requestPayloadSha256,
    package_use_binding: input.packageUseBinding,
    input_schema_ref: input.inputSchemaRef,
    input_schema_validation: input.inputSchemaValidation,
    output_schema_validation: input.outputSchemaValidation,
  };
}

function throwPersistedFailure(
  completion: StandardAgentActionRunCompletion,
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>,
): never {
  const error = completion.error ?? {
    error_code: 'contract_shape_invalid',
    message: 'Standard Agent action failed permanently.',
    details: {},
  };
  throw new FrameworkContractError(persistedFrameworkErrorCode(error.error_code), error.message, {
    ...error.details,
    persisted_error_code: error.error_code,
    action_run_ref: stored.action_run_ref,
    request_ref: stored.request.ref,
    output_ref: stored.output.ref,
    failure_disposition: 'permanent',
  });
}

function assertRequestedDomainMatchesBinding(
  requestedDomainId: string,
  runtimeBinding: HostedAgentRuntimeBindingSnapshot,
) {
  const requested = requestedDomainId.trim();
  const accepted = new Set([
    runtimeBinding.agent_id,
    runtimeBinding.runtime_domain_id,
    runtimeBinding.target_domain_id,
    ...runtimeBinding.catalog_target_domain_ids,
  ]);
  if (!accepted.has(requested)) {
    fail('Hosted Agent action run target does not match its frozen runtime binding.', {
      requested_domain_id: requested,
      frozen_agent_id: runtimeBinding.agent_id,
      frozen_target_domain_id: runtimeBinding.target_domain_id,
    });
  }
}

function assertCompletionIdentity(input: {
  completion: StandardAgentActionRunCompletion;
  runId: string;
  domainId: string;
  actionId: string;
  executionKind: StandardAgentActionRunCompletion['execution_kind'];
  bindingRef: string;
  runtimeBindingRef: string;
}) {
  const completion = input.completion;
  if (
    completion.run_id !== input.runId
    || completion.canonical_domain_id !== input.domainId
    || completion.action_id !== input.actionId
    || completion.execution_kind !== input.executionKind
    || completion.binding_ref !== input.bindingRef
    || completion.hosted_runtime_binding_ref !== input.runtimeBindingRef
  ) {
    fail('Standard Agent action completion conflicts with its frozen run identity.', {
      run_id: input.runId,
    });
  }
}

function handlerSandboxSummary(
  binding: DomainHandlerRegistry['handlers'][number]['binding'],
) {
  return {
    runtime_kind: binding.kind === 'typescript_export'
      ? 'node_permission_model' as const
      : 'python_audit_hook' as const,
    sandbox_kind: 'macos_sandbox_exec' as const,
    exit_code: 0,
    timed_out: false,
  };
}

function unknownSuccess(error: unknown, input: {
  runId: string;
  actionRunRef: string;
  requestRef: string;
  runtimeBindingRef: string;
}): never {
  throw new FrameworkContractError(
    error instanceof FrameworkContractError ? error.code : 'contract_shape_invalid',
    error instanceof Error ? error.message : String(error),
    {
      ...(error instanceof FrameworkContractError ? error.details : {}),
      run_id: input.runId,
      action_run_ref: input.actionRunRef,
      request_ref: input.requestRef,
      hosted_runtime_binding_ref: input.runtimeBindingRef,
      failure_disposition: 'unknown_success',
      same_run_retry_required: true,
    },
  );
}

function persistedStageActionLaunch(input: {
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>;
  runId: string;
  domainId: string;
  actionId: string;
}): StandardAgentStageActionLaunch {
  const persisted = parseJsonText(
    readStandardAgentActionStoredBytes(input.stored.output, 'Stage action output').toString('utf8'),
  );
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
    || typeof persisted.hosted_runtime_binding_ref !== 'string'
    || !isRecord(persisted.hosted_runtime_binding)
    || !isRecord(persisted.authority_boundary)
  ) {
    fail('Existing Standard Agent action output is not the immutable Stage launch for this run identity.', {
      run_id: input.runId,
      output_ref: input.stored.output.ref,
    });
  }
  return persisted as unknown as StandardAgentStageActionLaunch;
}

function stageActionWorkflowId(launch: StandardAgentStageActionLaunch) {
  const stageRun = isRecord(launch.temporal_stage_run.family_runtime_stage_run)
    ? launch.temporal_stage_run.family_runtime_stage_run
    : null;
  const stageRunInput = stageRun && isRecord(stageRun.stage_run_input) ? stageRun.stage_run_input : null;
  if (!stageRunInput || typeof stageRunInput.workflow_id !== 'string' || !stageRunInput.workflow_id.trim()) {
    fail('Persisted Standard Agent Stage launch is missing its Temporal workflow id.', {
      run_id: launch.run_id,
    });
  }
  return stageRunInput.workflow_id.trim();
}

function stageActionObservedStatus(
  query: Record<string, unknown> | null,
  fallback: 'started' | 'blocked',
): StandardAgentStageActionReadback['status'] {
  const stageRunQuery = query && isRecord(query.family_runtime_stage_run_query)
    ? query.family_runtime_stage_run_query
    : null;
  const status = stageRunQuery?.status;
  if (status === 'registered' || status === 'running') return 'started';
  if (typeof status === 'string' && STAGE_ACTION_TERMINAL_STATUSES.has(status as StandardAgentStageActionReadback['status'])) {
    return status as StandardAgentStageActionReadback['status'];
  }
  return fallback;
}

function stageReadbackLedgerStatus(status: StandardAgentStageActionReadback['status']) {
  if (status === 'completed_with_quality_debt') return 'completed' as const;
  if (status === 'human_gate') return 'blocked' as const;
  return status;
}

async function refreshStageActionReadback(input: {
  launch: StandardAgentStageActionLaunch;
  runStageRuntime: typeof runFamilyRuntime;
}) {
  const durableLaunchStatus = input.launch.status === 'blocked' ? 'blocked' as const : 'started' as const;
  if (durableLaunchStatus === 'blocked') return input.launch;
  let query: Record<string, unknown> | null = null;
  let queryError: ReturnType<typeof observationFailure> | null = null;
  try {
    query = await input.runStageRuntime(['stage-run', 'query', stageActionWorkflowId(input.launch)]);
  } catch (error) {
    queryError = observationFailure(error);
  }
  return {
    ...input.launch,
    status: stageActionObservedStatus(query, durableLaunchStatus),
    temporal_stage_run_query: query,
    temporal_stage_run_query_error: queryError,
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

function foundryActionAuthorityBoundary() {
  return {
    opl_role: 'foundry_run_state_materialization_evaluation_version_activation_and_rollback_authority',
    provider_role: 'agent_design_evaluation_semantics_evidence_diagnosis_and_evolution_proposal',
    target_owner_role: 'domain_truth_protected_tests_quality_acceptance_permission_and_production_adoption',
    generated_agent_can_modify_versions_tests_permissions_or_activation: false,
    provider_completion_is_qualification_or_activation: false,
  } as const;
}

function assertDurableRuntimeProvenance(binding: StandardAgentActionRunBinding) {
  const provenance = binding.hosted_runtime_binding;
  const expectedRef = `opl://hosted-agent-runtime-binding/sha256/${sha256(canonicalJsonText(provenance))}`;
  if (
    provenance.surface_kind !== 'opl_hosted_agent_runtime_binding_provenance'
    || provenance.version !== 'opl-hosted-agent-runtime-binding-provenance.v1'
    || provenance.target_agent_id !== binding.canonical_domain_id
    || !['managed_package_checkout', 'foundry_active_agent_version'].includes(provenance.source_kind)
    || binding.hosted_runtime_binding_ref !== expectedRef
  ) {
    fail('Completed Handler replay has invalid frozen runtime provenance.', { run_id: binding.run_id });
  }
}

function replayCompletedHandlerAction(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  startedAt: string;
  binding: StandardAgentActionRunBinding;
  completion: StandardAgentActionRunCompletion;
  recordLedger: typeof actionLedger;
}) {
  const replay = input.completion.completed_handler_replay;
  if (
    input.binding.run_id !== input.runId
    || input.binding.action_id !== input.runtimeInput.actionId
    || input.completion.execution_kind !== 'handler_ref'
    || input.completion.status !== 'completed'
    || input.completion.failure_disposition !== null
    || input.completion.error !== null
    || !input.completion.sandbox
    || !input.completion.binding_ref.startsWith('handler:')
    || !replay
  ) {
    fail('Completed Handler replay metadata conflicts with its durable run identity.', { run_id: input.runId });
  }
  assertDurableRuntimeProvenance(input.binding);
  assertCompletionIdentity({
    completion: input.completion,
    runId: input.runId,
    domainId: input.binding.canonical_domain_id,
    actionId: input.binding.action_id,
    executionKind: 'handler_ref',
    bindingRef: input.completion.binding_ref,
    runtimeBindingRef: input.binding.hosted_runtime_binding_ref,
  });
  if (!replay.accepted_domain_ids.includes(input.runtimeInput.domainId.trim())) {
    fail('Completed Handler replay target does not match its frozen runtime binding.', {
      requested_domain_id: input.runtimeInput.domainId,
      accepted_domain_ids: replay.accepted_domain_ids,
    });
  }
  const requestPayloadSha256 = sha256(canonicalJsonBytes(input.runtimeInput.payload));
  if (requestPayloadSha256 !== replay.request_payload_sha256) {
    fail('Completed Handler replay payload conflicts with the original request.', { run_id: input.runId });
  }
  const stored = inspectStoredStandardAgentActionRunOutput({
    workspaceRoot: input.runtimeInput.workspaceRoot,
    runId: input.runId,
    domainId: input.binding.canonical_domain_id,
    actionId: input.binding.action_id,
  }) ?? fail('Completed Handler replay is missing persisted request or output bytes.', { run_id: input.runId });
  assertCompletionMatchesStored(input.completion, stored);
  const result = parseJsonText(
    readStandardAgentActionStoredBytes(stored.output, 'completed Handler output').toString('utf8'),
  );
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.binding.canonical_domain_id,
    actionId: input.binding.action_id,
    bindingRef: hostedRuntimeExecutionBindingRef(
      { provenance_ref: input.binding.hosted_runtime_binding_ref },
      input.completion.binding_ref,
    ),
    status: 'completed',
    startedAt: input.startedAt,
    recordedAt: new Date().toISOString(),
    stored,
  });
  return {
    version: 'g2' as const,
    standard_agent_action_run: {
      surface_kind: 'opl_standard_agent_action_run' as const,
      version: 'opl-standard-agent-action-run.v1' as const,
      status: 'completed' as const,
      execution_kind: 'handler_ref' as const,
      run_id: input.runId,
      domain_id: input.binding.canonical_domain_id,
      action_id: input.binding.action_id,
      binding_ref: input.completion.binding_ref,
      package_use_binding: replay.package_use_binding,
      input_schema_ref: replay.input_schema_ref,
      output_schema_validation: replay.output_schema_validation,
      request: stored.request,
      output: stored.output,
      result,
      sandbox: input.completion.sandbox,
      ledger: ledger.ledger_entry,
      authority_boundary: actionAuthorityBoundary(),
      hosted_runtime_binding_ref: input.binding.hosted_runtime_binding_ref,
      hosted_runtime_binding: input.binding.hosted_runtime_binding,
      input_schema_validation: replay.input_schema_validation,
    },
  };
}

function persistedFoundryActionLaunch(input: {
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>;
  runId: string;
  domainId: string;
  actionId: string;
}) {
  const persisted = parseJsonText(
    readStandardAgentActionStoredBytes(input.stored.output, 'Foundry action output').toString('utf8'),
  );
  if (
    !isRecord(persisted)
    || persisted.surface_kind !== 'opl_standard_agent_foundry_action_launch'
    || persisted.version !== 'opl-standard-agent-foundry-action-launch.v1'
    || persisted.status !== 'started'
    || persisted.execution_kind !== 'foundry_binding'
    || persisted.run_id !== input.runId
    || persisted.domain_id !== input.domainId
    || persisted.action_id !== input.actionId
    || typeof persisted.binding_ref !== 'string'
    || typeof persisted.hosted_runtime_binding_ref !== 'string'
    || !isRecord(persisted.hosted_runtime_binding)
    || !isRecord(persisted.foundry_run)
    || !isRecord(persisted.authority_boundary)
  ) {
    fail('Existing Standard Agent action output is not the immutable Foundry launch for this run identity.', {
      run_id: input.runId,
      output_ref: input.stored.output.ref,
    });
  }
  return persisted as unknown as StandardAgentFoundryActionLaunch;
}

async function runFoundryAction(input: {
  action: FamilyActionCatalogAction;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  requestBytes: Buffer;
  request: ReturnType<typeof validateDesignRequest>;
  foundryProvider: FoundryProviderManifest;
  packageUseBinding: unknown;
  runtimeBindingRef: string;
  runtimeBinding: HostedAgentRuntimeBindingProvenance;
  startedAt: string;
  startFoundryRun?: RuntimeDependencies['startFoundryRun'];
  recordLedger: typeof actionLedger;
}) {
  const executionBinding = input.action.execution_binding;
  if (executionBinding.kind !== 'foundry_binding') {
    fail('Foundry action has an invalid execution binding.', { action_id: input.action.action_id });
  }
  const provider = input.foundryProvider;
  const bindingRef = `foundry:${provider.provider_id}:${executionBinding.provider_manifest_ref}`;
  const ledgerBindingRef = hostedRuntimeExecutionBindingRef({ provenance_ref: input.runtimeBindingRef }, bindingRef);
  const prepared = prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  const existing = inspectStandardAgentActionRunOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  let recordedCompletion = inspectStandardAgentActionRunCompletion({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
  });
  if (recordedCompletion && !existing) {
    fail('Standard Agent action completion exists without persisted output bytes.', { run_id: input.runId });
  }
  if (existing) {
    const raw = parseJsonText(
      readStandardAgentActionStoredBytes(existing.output, 'Foundry action output').toString('utf8'),
    );
    if (!recordedCompletion && isRecord(raw) && raw.surface_kind === 'opl_standard_agent_action_failure') {
      recordedCompletion = persistCompletion(input.workspaceRoot, {
        ...completionBase({
          runId: input.runId,
          domainId: input.domainId,
          actionId: input.action.action_id,
          executionKind: 'foundry_binding',
          status: 'failed',
          bindingRef,
          runtimeBindingRef: input.runtimeBindingRef,
          stored: existing,
        }),
        failure_disposition: 'permanent',
        sandbox: null,
        error: {
          error_code: typeof raw.error_code === 'string' ? raw.error_code : 'contract_shape_invalid',
          message: typeof raw.message === 'string' ? raw.message : 'Foundry action failed.',
          details: isRecord(raw.details) ? raw.details : {},
        },
        completed_handler_replay: null,
      });
    }
    if (recordedCompletion) {
      assertCompletionIdentity({
        completion: recordedCompletion,
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'foundry_binding',
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
      });
      assertCompletionMatchesStored(recordedCompletion, existing);
      if (recordedCompletion.status === 'failed') throwPersistedFailure(recordedCompletion, existing);
    }
    const persisted = persistedFoundryActionLaunch({
      stored: existing,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
    });
    if (
      persisted.hosted_runtime_binding_ref !== input.runtimeBindingRef
      || canonicalJsonText(persisted.hosted_runtime_binding) !== canonicalJsonText(input.runtimeBinding)
    ) {
      fail('Existing Foundry action launch is bound to a different hosted runtime snapshot.', {
        run_id: input.runId,
        persisted_runtime_binding_ref: persisted.hosted_runtime_binding_ref,
        resolved_runtime_binding_ref: input.runtimeBindingRef,
      });
    }
    recordedCompletion ??= persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'foundry_binding',
        status: 'started',
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored: existing,
      }),
      failure_disposition: null,
      sandbox: null,
      error: null,
      completed_handler_replay: null,
    });
    const ledger = input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
      status: 'started',
      startedAt: input.startedAt,
      recordedAt: new Date().toISOString(),
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
  let foundryRun: Record<string, unknown>;
  try {
    const started = await (input.startFoundryRun ?? startTemporalFoundryRunWorkflow)({
      request: input.request,
      run_id: input.runId,
    });
    if (!isRecord(started)) fail('Foundry control returned an invalid run inspection.');
    foundryRun = started;
  } catch (error) {
    unknownSuccess(error, {
      runId: input.runId,
      actionRunRef: prepared.action_run_ref,
      requestRef: prepared.request.ref,
      runtimeBindingRef: input.runtimeBindingRef,
    });
  }
  try {
    const output: StandardAgentFoundryActionLaunch = {
      surface_kind: 'opl_standard_agent_foundry_action_launch',
      version: 'opl-standard-agent-foundry-action-launch.v1',
      status: 'started',
      execution_kind: 'foundry_binding',
      run_id: input.runId,
      domain_id: input.domainId,
      action_id: input.action.action_id,
      binding_ref: bindingRef,
      hosted_runtime_binding_ref: input.runtimeBindingRef,
      hosted_runtime_binding: input.runtimeBinding,
      foundry_run: foundryRun,
      authority_boundary: foundryActionAuthorityBoundary(),
    };
    const recordedAt = new Date().toISOString();
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
      bindingRef: ledgerBindingRef,
      status: 'started',
      startedAt: input.startedAt,
      recordedAt,
      stored,
    });
    persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'foundry_binding',
        status: 'started',
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      failure_disposition: null,
      sandbox: null,
      error: null,
      completed_handler_replay: null,
    });
    return {
      ...output,
      package_use_binding: input.packageUseBinding,
      request: stored.request,
      output: stored.output,
      ledger: ledger.ledger_entry,
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
    persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'foundry_binding',
        status: 'failed',
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      failure_disposition: 'permanent',
      sandbox: null,
      error: persistedError(error),
      completed_handler_replay: null,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
      status: 'failed',
      startedAt: input.startedAt,
      recordedAt,
      stored,
    });
    wrapFailure(error, stored);
  }
}

function materializeHandlerOutput(input: {
  action: FamilyActionCatalogAction;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  handlerRef: string;
  runtimeBindingRef: string;
  output: unknown;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}, applyMaterialization = applyDomainArtifactCasMaterialization) {
  return applyMaterialization({
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    actionId: input.action.action_id,
    runId: input.runId,
    handlerRef: input.handlerRef,
    hostedRuntimeBindingRef: input.runtimeBindingRef,
    actionAuthorityBoundary: input.action.authority_boundary,
    handlerOutput: input.output,
    handlerOutputRef: input.stored.output.ref,
    handlerOutputSha256: input.stored.output.sha256,
  });
}

async function runHandlerAction(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  action: FamilyActionCatalogAction;
  registry: DomainHandlerRegistry;
  acceptedDomainIds: readonly string[];
  requestPayloadSha256: string;
  inputSchemaValidation: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  runtimeBindingRef: string;
  startedAt: string;
  runHandler: typeof runStandardAgentHandlerSandbox;
  applyDomainArtifactCas: typeof applyDomainArtifactCasMaterialization;
  recordLedger: typeof actionLedger;
}) {
  const handlerRef = input.action.execution_binding.kind === 'handler_ref'
    ? input.action.execution_binding.handler_ref
    : fail('Handler action has an invalid execution binding.');
  const handlerId = handlerRef.slice('handler:'.length);
  const handler = input.registry.handlers.find((entry) => entry.handler_id === handlerId)
    ?? fail('Standard Agent action handler is unresolved.', { handler_ref: handlerRef });
  const ledgerBindingRef = hostedRuntimeExecutionBindingRef({ provenance_ref: input.runtimeBindingRef }, handlerRef);
  prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });

  const existing = inspectStandardAgentActionRunOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  const recordedCompletion = inspectStandardAgentActionRunCompletion({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
  });
  if (recordedCompletion && !existing) {
    fail('Standard Agent action completion exists without persisted output bytes.', { run_id: input.runId });
  }
  if (existing) {
    const persisted = parseJsonText(
      readStandardAgentActionStoredBytes(existing.output, 'Handler action output').toString('utf8'),
    );
    let completion = recordedCompletion;
    let hostMaterialization: ReturnType<typeof materializeHandlerOutput> = null;
    if (isRecord(persisted) && persisted.surface_kind === 'opl_standard_agent_action_failure') {
      const error = {
        error_code: typeof persisted.error_code === 'string' ? persisted.error_code : 'contract_shape_invalid',
        message: typeof persisted.message === 'string' ? persisted.message : 'Standard Agent handler failed.',
        details: isRecord(persisted.details) ? persisted.details : {},
      };
      completion ??= persistCompletion(input.workspaceRoot, {
        ...completionBase({
          runId: input.runId,
          domainId: input.domainId,
          actionId: input.action.action_id,
          executionKind: 'handler_ref',
          status: 'failed',
          bindingRef: handlerRef,
          runtimeBindingRef: input.runtimeBindingRef,
          stored: existing,
        }),
        failure_disposition: 'permanent',
        sandbox: null,
        error,
        completed_handler_replay: null,
      });
    } else if (!completion) {
      try {
        const outputValidation = assertRepoJsonSchemaPayload({
          repoRoot: input.checkoutRoot,
          schemaRef: input.action.output_schema_ref,
          payload: persisted,
          label: `Standard Agent action ${input.action.action_id} output`,
        });
        hostMaterialization = materializeHandlerOutput({
          action: input.action,
          workspaceRoot: input.workspaceRoot,
          domainId: input.domainId,
          runId: input.runId,
          handlerRef,
          runtimeBindingRef: input.runtimeBindingRef,
          output: persisted,
          stored: existing,
        }, input.applyDomainArtifactCas);
        completion = persistCompletion(input.workspaceRoot, {
          ...completionBase({
            runId: input.runId,
            domainId: input.domainId,
            actionId: input.action.action_id,
            executionKind: 'handler_ref',
            status: 'completed',
            bindingRef: handlerRef,
            runtimeBindingRef: input.runtimeBindingRef,
            stored: existing,
          }),
          failure_disposition: null,
          sandbox: handlerSandboxSummary(handler.binding),
          error: null,
          completed_handler_replay: completedHandlerReplay({
            acceptedDomainIds: input.acceptedDomainIds,
            requestPayloadSha256: input.requestPayloadSha256,
            packageUseBinding: input.packageUseBinding,
            inputSchemaRef: input.action.input_schema_ref,
            inputSchemaValidation: input.inputSchemaValidation,
            outputSchemaValidation: outputValidation,
          }),
        });
      } catch (error) {
        if (!(error instanceof FrameworkContractError)) {
          input.recordLedger({
            runId: input.runId,
            domainId: input.domainId,
            actionId: input.action.action_id,
            bindingRef: ledgerBindingRef,
            status: 'failed',
            startedAt: input.startedAt,
            recordedAt: new Date().toISOString(),
            stored: existing,
          });
          unknownSuccess(error, {
            runId: input.runId,
            actionRunRef: existing.action_run_ref,
            requestRef: existing.request.ref,
            runtimeBindingRef: input.runtimeBindingRef,
          });
        }
        completion = persistCompletion(input.workspaceRoot, {
          ...completionBase({
            runId: input.runId,
            domainId: input.domainId,
            actionId: input.action.action_id,
            executionKind: 'handler_ref',
            status: 'failed',
            bindingRef: handlerRef,
            runtimeBindingRef: input.runtimeBindingRef,
            stored: existing,
          }),
          failure_disposition: 'permanent',
          sandbox: handlerSandboxSummary(handler.binding),
          error: persistedError(error),
          completed_handler_replay: null,
        });
      }
    }
    assertCompletionIdentity({
      completion: completion!,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      executionKind: 'handler_ref',
      bindingRef: handlerRef,
      runtimeBindingRef: input.runtimeBindingRef,
    });
    assertCompletionMatchesStored(completion!, existing);
    const ledger = input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
      status: completion!.status,
      startedAt: input.startedAt,
      recordedAt: new Date().toISOString(),
      stored: existing,
    });
    if (completion!.status === 'failed') throwPersistedFailure(completion!, existing);
    if (completion!.status !== 'completed') {
      fail('Handler action completion has an invalid status.', { status: completion!.status });
    }
    const outputValidation = assertRepoJsonSchemaPayload({
      repoRoot: input.checkoutRoot,
      schemaRef: input.action.output_schema_ref,
      payload: persisted,
      label: `Standard Agent action ${input.action.action_id} output`,
    });
    hostMaterialization ??= materializeHandlerOutput({
      action: input.action,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      runId: input.runId,
      handlerRef,
      runtimeBindingRef: input.runtimeBindingRef,
      output: persisted,
      stored: existing,
    }, input.applyDomainArtifactCas);
    return {
      surface_kind: 'opl_standard_agent_action_run',
      version: 'opl-standard-agent-action-run.v1',
      status: 'completed' as const,
      execution_kind: 'handler_ref' as const,
      run_id: input.runId,
      domain_id: input.domainId,
      action_id: input.action.action_id,
      binding_ref: handlerRef,
      package_use_binding: input.packageUseBinding,
      input_schema_ref: input.action.input_schema_ref,
      output_schema_validation: outputValidation,
      request: existing.request,
      output: existing.output,
      result: persisted,
      host_materialization: hostMaterialization,
      sandbox: completion!.sandbox ?? handlerSandboxSummary(handler.binding),
      ledger: ledger.ledger_entry,
      authority_boundary: actionAuthorityBoundary(),
    };
  }

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
    persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'handler_ref',
        status: 'failed',
        bindingRef: handlerRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      failure_disposition: 'permanent',
      sandbox: null,
      error: persistedError(error),
      completed_handler_replay: null,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
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
    persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'handler_ref',
        status: 'failed',
        bindingRef: handlerRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      failure_disposition: 'permanent',
      sandbox: {
        runtime_kind: receipt.runtime_kind,
        sandbox_kind: receipt.sandbox_kind,
        exit_code: receipt.exit_code,
        timed_out: receipt.timed_out,
      },
      error: persistedError(error),
      completed_handler_replay: null,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
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
  let hostMaterialization: ReturnType<typeof materializeHandlerOutput>;
  try {
    hostMaterialization = materializeHandlerOutput({
      action: input.action,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      runId: input.runId,
      handlerRef,
      runtimeBindingRef: input.runtimeBindingRef,
      output: receipt.output,
      stored,
    }, input.applyDomainArtifactCas);
  } catch (error) {
    if (!(error instanceof FrameworkContractError)) {
      input.recordLedger({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        bindingRef: ledgerBindingRef,
        status: 'failed',
        startedAt: input.startedAt,
        recordedAt,
        stored,
      });
      unknownSuccess(error, {
        runId: input.runId,
        actionRunRef: stored.action_run_ref,
        requestRef: stored.request.ref,
        runtimeBindingRef: input.runtimeBindingRef,
      });
    }
    persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'handler_ref',
        status: 'failed',
        bindingRef: handlerRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      failure_disposition: 'permanent',
      sandbox: {
        runtime_kind: receipt.runtime_kind,
        sandbox_kind: receipt.sandbox_kind,
        exit_code: receipt.exit_code,
        timed_out: receipt.timed_out,
      },
      error: persistedError(error),
      completed_handler_replay: null,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
      status: 'failed',
      startedAt: input.startedAt,
      recordedAt,
      stored,
    });
    wrapFailure(error, stored);
  }
  persistCompletion(input.workspaceRoot, {
    ...completionBase({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      executionKind: 'handler_ref',
      status: 'completed',
      bindingRef: handlerRef,
      runtimeBindingRef: input.runtimeBindingRef,
      stored,
    }),
    failure_disposition: null,
    sandbox: {
      runtime_kind: receipt.runtime_kind,
      sandbox_kind: receipt.sandbox_kind,
      exit_code: receipt.exit_code,
      timed_out: receipt.timed_out,
    },
    error: null,
    completed_handler_replay: completedHandlerReplay({
      acceptedDomainIds: input.acceptedDomainIds,
      requestPayloadSha256: input.requestPayloadSha256,
      packageUseBinding: input.packageUseBinding,
      inputSchemaRef: input.action.input_schema_ref,
      inputSchemaValidation: input.inputSchemaValidation,
      outputSchemaValidation: outputValidation,
    }),
  });
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    bindingRef: ledgerBindingRef,
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
    host_materialization: hostMaterialization,
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
  payload: Record<string, unknown>;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  runtimeBindingRef: string;
  runtimeBinding: HostedAgentRuntimeBindingProvenance;
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
    ...actionWorkItemIdentityLocator(input.action, input.payload),
    domain_pack_root: input.checkoutRoot,
    ...(input.packageUseBinding ? { package_use_binding: input.packageUseBinding } : {}),
    standard_agent_action_run_ref: prepared.action_run_ref,
    action_request_ref: prepared.request.ref,
    action_request_sha256: prepared.request.sha256,
  });
  const bindingRef = `stage:${executionBinding.stage_manifest_ref}#${stageRoute.entry_stage_ref}`;
  const ledgerBindingRef = hostedRuntimeExecutionBindingRef({ provenance_ref: input.runtimeBindingRef }, bindingRef);
  const stageRunInvocationId = buildHostedActionStageRunInvocationId({
    domainId: input.domainId,
    stageId: stageRoute.entry_stage_ref,
    actionId: input.action.action_id,
    runId: input.runId,
    actionRunRef: prepared.action_run_ref,
  });

  const replayStored = async (
    existing: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>,
  ) => {
    const raw = parseJsonText(
      readStandardAgentActionStoredBytes(existing.output, 'Stage action output').toString('utf8'),
    );
    let completion = inspectStandardAgentActionRunCompletion({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
    });
    if (!completion && isRecord(raw) && raw.surface_kind === 'opl_standard_agent_action_failure') {
      completion = persistCompletion(input.workspaceRoot, {
        ...completionBase({
          runId: input.runId,
          domainId: input.domainId,
          actionId: input.action.action_id,
          executionKind: 'stage_binding',
          status: 'failed',
          bindingRef,
          runtimeBindingRef: input.runtimeBindingRef,
          stored: existing,
        }),
        failure_disposition: 'permanent',
        sandbox: null,
        error: {
          error_code: typeof raw.error_code === 'string' ? raw.error_code : 'contract_shape_invalid',
          message: typeof raw.message === 'string' ? raw.message : 'Stage action failed.',
          details: isRecord(raw.details) ? raw.details : {},
        },
        completed_handler_replay: null,
      });
    }
    if (completion) {
      assertCompletionIdentity({
        completion,
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'stage_binding',
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
      });
      assertCompletionMatchesStored(completion, existing);
      if (completion.status === 'failed') throwPersistedFailure(completion, existing);
    }
    const persisted = persistedStageActionLaunch({
      stored: existing,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
    });
    if (
      persisted.hosted_runtime_binding_ref !== input.runtimeBindingRef
      || canonicalJsonText(persisted.hosted_runtime_binding) !== canonicalJsonText(input.runtimeBinding)
    ) {
      fail('Existing Stage action launch is bound to a different hosted runtime snapshot.', {
        run_id: input.runId,
        persisted_runtime_binding_ref: persisted.hosted_runtime_binding_ref,
        resolved_runtime_binding_ref: input.runtimeBindingRef,
      });
    }
    completion ??= persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'stage_binding',
        status: persisted.status,
        bindingRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored: existing,
      }),
      failure_disposition: null,
      sandbox: null,
      error: null,
      completed_handler_replay: null,
    });
    const readback = await refreshStageActionReadback({
      launch: persisted,
      runStageRuntime: input.runStageRuntime,
    });
    const ledger = input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: ledgerBindingRef,
      status: stageReadbackLedgerStatus(readback.status),
      startedAt: input.startedAt,
      recordedAt: new Date().toISOString(),
      stored: existing,
    });
    return {
      ...readback,
      package_use_binding: input.packageUseBinding,
      request: existing.request,
      output: existing.output,
      ledger: ledger.ledger_entry,
    };
  };

  const beforeLaunch = inspectStandardAgentActionRunOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  if (beforeLaunch) return await replayStored(beforeLaunch);

  let launchRpcReturned = false;
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
      launchRpcReturned = true;
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
        hosted_runtime_binding_ref: input.runtimeBindingRef,
        hosted_runtime_binding: input.runtimeBinding,
        authority_boundary: actionAuthorityBoundary(),
      };
    } catch (error) {
      if (!launchRpcReturned) {
        unknownSuccess(error, {
          runId: input.runId,
          actionRunRef: prepared.action_run_ref,
          requestRef: prepared.request.ref,
          runtimeBindingRef: input.runtimeBindingRef,
        });
      }
      const recordedAt = new Date().toISOString();
      const stored = commitStandardAgentActionOutput({
        workspaceRoot: input.workspaceRoot,
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        requestBytes: input.requestBytes,
        outputBytes: failureBytes(error),
      });
      persistCompletion(input.workspaceRoot, {
        ...completionBase({
          runId: input.runId,
          domainId: input.domainId,
          actionId: input.action.action_id,
          executionKind: 'stage_binding',
          status: 'failed',
          bindingRef,
          runtimeBindingRef: input.runtimeBindingRef,
          stored,
        }),
        failure_disposition: 'permanent',
        sandbox: null,
        error: persistedError(error),
        completed_handler_replay: null,
      });
      input.recordLedger({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        bindingRef: ledgerBindingRef,
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
  if (existing) return await replayStored(existing);
  const stored = commitStandardAgentActionOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
    outputBytes: canonicalJsonBytes(output),
  });
  persistCompletion(input.workspaceRoot, {
    ...completionBase({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      executionKind: 'stage_binding',
      status: output.status,
      bindingRef,
      runtimeBindingRef: input.runtimeBindingRef,
      stored,
    }),
    failure_disposition: null,
    sandbox: null,
    error: null,
    completed_handler_replay: null,
  });
  const readback = {
    ...output,
    status: stageActionObservedStatus(
      output.temporal_stage_run_query,
      output.status,
    ),
  };
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    bindingRef: ledgerBindingRef,
    status: stageReadbackLedgerStatus(readback.status),
    startedAt: input.startedAt,
    recordedAt,
    stored,
  });
  return {
    ...readback,
    package_use_binding: input.packageUseBinding,
    request: stored.request,
    output: stored.output,
    ledger: ledger.ledger_entry,
  };
}

function buildLiveActionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runtimeBinding: HostedAgentRuntimeBindingSnapshot;
  dependencies: RuntimeDependencies;
}): StandardAgentActionContext {
  const { catalog, registry } = readHostedAgentRuntimeActionContracts(
    input.runtimeBinding.checkout_root,
    input.runtimeBinding.catalog_target_domain_ids,
  );
  const action = catalog.actions.find((candidate) => candidate.action_id === input.runtimeInput.actionId)
    ?? fail('Hosted Agent action is not declared by the frozen runtime binding.', {
      domain_id: input.runtimeBinding.agent_id,
      action_id: input.runtimeInput.actionId,
      available_action_ids: catalog.actions.map((candidate) => candidate.action_id),
    });
  const payload = normalizedPayload(
    action,
    input.runtimeInput.payload,
    input.runtimeBinding.workspace_root,
  );
  if (action.execution_binding.kind === 'stage_binding') {
    (input.dependencies.compileStageManifest ?? compileStandardAgentStageManifest)(
      input.runtimeBinding.checkout_root,
    );
  }
  const foundryRequest = action.execution_binding.kind === 'foundry_binding'
    ? validateDesignRequest(payload)
    : null;
  const foundryProvider = action.execution_binding.kind === 'foundry_binding'
    ? readFoundryProviderManifest(
        input.runtimeBinding.checkout_root,
        action.execution_binding.provider_manifest_ref,
      )
    : null;
  const inputValidation = foundryRequest
    ? {
        status: 'valid' as const,
        schema_ref: action.input_schema_ref,
        validator: 'opl_foundry_protocol',
      }
    : assertRepoJsonSchemaPayload({
        repoRoot: input.runtimeBinding.checkout_root,
        schemaRef: action.input_schema_ref,
        payload,
        label: `Standard Agent action ${action.action_id} input`,
      });
  return {
    action,
    catalog,
    registry,
    payload,
    foundryRequest,
    foundryProvider,
    inputValidation,
  };
}

function actionDeclaresHostMaterialization(action: FamilyActionCatalogAction) {
  return isRecord(action.authority_boundary?.host_materialization_contract);
}

function originalInternalHandlerPayload(input: {
  action: FamilyActionCatalogAction;
  plan: StandardAgentActionRunPlan;
}) {
  if (!input.plan.effective_payload) {
    fail('Lifecycle reactivation child run lacks its frozen effective Handler payload.', {
      handler_run_id: input.plan.run_id,
    });
  }
  const payload = structuredClone(input.plan.effective_payload);
  for (const field of input.action.workspace_locator_fields) {
    if (
      (field === 'workspace_root' || field === 'workspace_path')
      && payload[field] === input.plan.workspace_root
    ) delete payload[field];
  }
  if (sha256(canonicalJsonBytes(payload)) !== input.plan.request_payload_sha256) {
    fail('Lifecycle reactivation child run cannot reconstruct its frozen original Handler invocation.', {
      handler_run_id: input.plan.run_id,
    });
  }
  return payload;
}

async function materializeLifecycleAdmissionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  workspaceRoot: string;
  domainId: string;
  checkoutRoot: string;
  originalInvocationSha256: string;
  context: StandardAgentActionContext;
  dependencies: RuntimeDependencies;
}) {
  const bound = bindStandardAgentLifecycleReactivation({
    action: input.context.action,
    payload: input.context.payload,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  if (!bound) {
    const admission = preflightStandardAgentDomainLifecycleAdmission({
      action: input.context.action,
      payload: input.context.payload,
      checkoutRoot: input.checkoutRoot,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      runId: input.runId,
      originalInvocationSha256: input.originalInvocationSha256,
    });
    return { context: input.context, admission };
  }
  const handlerAction = input.context.catalog.actions.find(
    (candidate) => candidate.action_id === bound.handlerActionId,
  ) ?? fail('Lifecycle reactivation action is absent from the frozen domain catalog.', {
    reactivation_action_id: bound.handlerActionId,
  });
  if (
    handlerAction.execution_binding.kind !== 'handler_ref'
    || Object.values(handlerAction.supported_surfaces).some((surface) => surface !== null)
    || !actionDeclaresHostMaterialization(handlerAction)
  ) fail('Lifecycle reactivation action must be an internal registry-bound host-materializing Handler action.', {
    reactivation_action_id: bound.handlerActionId,
  });

  const childState = inspectStandardAgentActionRunState({
    workspaceRoot: input.workspaceRoot,
    runId: bound.handlerRunId,
  });
  let prepared: PreparedStandardAgentLifecycleReactivation;
  if (childState) {
    if (
      !childState.plan
      || childState.plan.action_id !== bound.handlerActionId
      || !childState.plan.effective_payload
    ) fail('Existing lifecycle reactivation child run lacks its frozen effective Handler payload.', {
      handler_run_id: bound.handlerRunId,
    });
    prepared = {
      ...bound,
      handlerPayload: originalInternalHandlerPayload({ action: handlerAction, plan: childState.plan }),
    };
  } else {
    prepared = prepareStandardAgentLifecycleReactivation({
      action: input.context.action,
      payload: input.context.payload,
      checkoutRoot: input.checkoutRoot,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      runId: input.runId,
      originalInvocationSha256: input.originalInvocationSha256,
    }) ?? fail('Lifecycle reactivation request could not be prepared.');
  }
  const handlerRun = await runStandardAgentAction({
    domainId: input.domainId,
    actionId: prepared.handlerActionId,
    workspaceRoot: input.workspaceRoot,
    payload: prepared.handlerPayload,
    runId: prepared.handlerRunId,
    timeoutMs: input.runtimeInput.timeoutMs,
  }, input.dependencies, INTERNAL_STANDARD_AGENT_ACTION_INVOCATION);
  const effectivePayload = {
    ...input.context.payload,
    [prepared.admissionPayloadField]: materializedStandardAgentLifecycleAdmission({
      prepared,
      handlerRun,
    }),
  };
  const inputValidation = assertRepoJsonSchemaPayload({
    repoRoot: input.checkoutRoot,
    schemaRef: input.context.action.input_schema_ref,
    payload: effectivePayload,
    label: `Standard Agent action ${input.context.action.action_id} materialized input`,
  });
  const context = {
    ...input.context,
    payload: effectivePayload,
    inputValidation,
  };
  const admission = preflightStandardAgentDomainLifecycleAdmission({
    action: context.action,
    payload: context.payload,
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  return { context, admission };
}

function requestFromFrozenPlan(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  plan: StandardAgentActionRunPlan;
}) {
  const requestedDomainId = input.runtimeInput.domainId.trim();
  if (
    input.runtimeInput.actionId !== input.plan.action_id
    || !input.plan.accepted_domain_ids.includes(requestedDomainId)
  ) {
    fail('Hosted Agent action request conflicts with its frozen run plan.', {
      run_id: input.plan.run_id,
      requested_domain_id: requestedDomainId,
      accepted_domain_ids: input.plan.accepted_domain_ids,
      requested_action_id: input.runtimeInput.actionId,
      frozen_action_id: input.plan.action_id,
    });
  }
  const requestPayloadSha256 = sha256(canonicalJsonBytes(input.runtimeInput.payload));
  if (requestPayloadSha256 !== input.plan.request_payload_sha256) {
    fail('Hosted Agent action payload conflicts with its frozen run plan.', {
      run_id: input.plan.run_id,
    });
  }
  const requestedTimeoutMs = canonicalTimeoutMs(input.runtimeInput.timeoutMs);
  if (requestedTimeoutMs !== input.plan.timeout_ms) {
    fail('Hosted Agent action timeout conflicts with its frozen run plan.', {
      run_id: input.plan.run_id,
      requested_timeout_ms: requestedTimeoutMs,
      frozen_timeout_ms: input.plan.timeout_ms,
    });
  }
  const action = input.plan.catalog.actions.find(
    (candidate) => candidate.action_id === input.plan.action_id,
  ) ?? fail('Frozen Standard Agent action plan is missing its selected action.', {
    run_id: input.plan.run_id,
    action_id: input.plan.action_id,
  });
  const invocationSha256 = originalInvocationSha256({
    domainId: input.plan.canonical_domain_id,
    actionId: input.plan.action_id,
    runId: input.plan.run_id,
    workspaceRoot: input.plan.workspace_root,
    requestPayloadSha256,
    timeoutMs: requestedTimeoutMs,
  });
  if (
    input.plan.original_invocation_sha256 !== undefined
    && input.plan.original_invocation_sha256 !== invocationSha256
  ) fail('Hosted Agent action invocation conflicts with its frozen run plan.', { run_id: input.plan.run_id });
  if (
    standardAgentLifecycleAdmissionContract(action)
    && (!input.plan.original_invocation_sha256 || !input.plan.effective_payload)
  ) fail('Lifecycle-gated action requires a frozen effective payload and original invocation fingerprint.');
  const payload = input.plan.effective_payload
    ? structuredClone(input.plan.effective_payload)
    : normalizedPayload(action, input.runtimeInput.payload, input.plan.workspace_root);
  const requestBytes = canonicalJsonBytes(payload);
  const requestSha256 = sha256(requestBytes);
  if (
    requestSha256 !== input.plan.request_sha256
    || requestBytes.byteLength !== input.plan.request_byte_size
  ) {
    fail('Hosted Agent action request bytes conflict with its frozen run plan.', {
      run_id: input.plan.run_id,
      expected_request_sha256: input.plan.request_sha256,
      actual_request_sha256: requestSha256,
      expected_request_byte_size: input.plan.request_byte_size,
      actual_request_byte_size: requestBytes.byteLength,
    });
  }
  const foundryRequest = action.execution_binding.kind === 'foundry_binding'
    ? validateDesignRequest(payload)
    : null;
  const foundryProvider = action.execution_binding.kind === 'foundry_binding'
    ? input.plan.foundry_provider_manifest as unknown as FoundryProviderManifest
    : null;
  return {
    requestBytes,
    originalInvocationSha256: invocationSha256,
    context: {
      action,
      catalog: input.plan.catalog,
      registry: input.plan.handler_registry,
      payload,
      foundryRequest,
      foundryProvider,
      inputValidation: input.plan.input_schema_validation,
    } satisfies StandardAgentActionContext,
  };
}

async function executeActionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  checkoutRoot: string;
  acceptedDomainIds: string[];
  packageUseBinding: Record<string, unknown> | null;
  runtimeBindingRef: string;
  runtimeBinding: HostedAgentRuntimeBindingProvenance;
  startedAt: string;
  timeoutMs: number | null;
  requestPayloadSha256: string;
  originalInvocationSha256: string;
  requestBytes: Buffer;
  context: StandardAgentActionContext;
  dependencies: RuntimeDependencies;
}) {
  const { action, registry, payload, foundryRequest, foundryProvider, inputValidation } = input.context;
  const lifecycleAdmission = preflightStandardAgentDomainLifecycleAdmission({
    action,
    payload,
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: action.action_id,
    requestBytes: input.requestBytes,
  });
  const common = {
    action,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    requestBytes: input.requestBytes,
    packageUseBinding: input.packageUseBinding,
    runtimeBindingRef: input.runtimeBindingRef,
    runtimeBinding: input.runtimeBinding,
    startedAt: input.startedAt,
  };
  const result = action.execution_binding.kind === 'handler_ref'
    ? await runHandlerAction({
        ...common,
        runtimeInput: {
          ...input.runtimeInput,
          workspaceRoot: input.workspaceRoot,
          payload,
          runId: input.runId,
          ...(input.timeoutMs === null ? { timeoutMs: undefined } : { timeoutMs: input.timeoutMs }),
        },
        registry: registry ?? fail('Handler-bound action requires a handler registry.'),
        acceptedDomainIds: input.acceptedDomainIds,
        requestPayloadSha256: input.requestPayloadSha256,
        inputSchemaValidation: inputValidation,
        checkoutRoot: input.checkoutRoot,
        runHandler: input.dependencies.runHandler ?? runStandardAgentHandlerSandbox,
        applyDomainArtifactCas: input.dependencies.applyDomainArtifactCas ?? applyDomainArtifactCasMaterialization,
        recordLedger: input.dependencies.recordLedger ?? actionLedger,
      })
    : action.execution_binding.kind === 'stage_binding'
      ? await runStageAction({
          ...common,
          payload,
          checkoutRoot: input.checkoutRoot,
          runtimeDomainId: input.runtimeDomainId,
          runStageRuntime: input.dependencies.runStageRuntime ?? runFamilyRuntime,
          recordLedger: input.dependencies.recordLedger ?? actionLedger,
        })
      : await runFoundryAction({
          ...common,
          checkoutRoot: input.checkoutRoot,
          request: foundryRequest ?? fail('Foundry action requires a frozen validated request.'),
          foundryProvider: foundryProvider ?? fail('Foundry action requires a frozen provider manifest.'),
          startFoundryRun: input.dependencies.startFoundryRun,
          recordLedger: input.dependencies.recordLedger ?? actionLedger,
        });
  return {
    version: 'g2' as const,
    standard_agent_action_run: {
      ...result,
      hosted_runtime_binding_ref: input.runtimeBindingRef,
      hosted_runtime_binding: input.runtimeBinding,
      input_schema_validation: inputValidation,
      domain_lifecycle_admission: lifecycleAdmission,
    },
  };
}

export async function runStandardAgentAction(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
  invocationContext?: symbol,
) {
  if (!isRecord(input.payload)) fail('Standard Agent action payload must be a JSON object.');
  const runId = canonicalRunId(input.runId);
  const observedAt = new Date().toISOString();
  const frozenState = inspectStandardAgentActionRunState({
    workspaceRoot: input.workspaceRoot,
    runId,
  });
  let frozenBinding = frozenState?.binding ?? null;
  let frozenPlan = frozenState?.plan ?? null;
  const completion = frozenBinding
    ? inspectStandardAgentActionRunCompletion({
      workspaceRoot: input.workspaceRoot,
      runId,
    })
    : null;
  if (frozenBinding && frozenPlan) {
    const frozen = requestFromFrozenPlan({ runtimeInput: input, plan: frozenPlan });
    assertStandardAgentActionInvocationSurface(frozen.context.action, invocationContext);
    if (
      completion?.execution_kind === 'handler_ref'
      && completion.status === 'completed'
      && !actionDeclaresHostMaterialization(frozen.context.action)
    ) {
      return replayCompletedHandlerAction({
        runtimeInput: input,
        runId,
        startedAt: frozenPlan.started_at,
        binding: frozenBinding,
        completion,
        recordLedger: dependencies.recordLedger ?? actionLedger,
      });
    }
    return executeActionContext({
      runtimeInput: input,
      runId,
      workspaceRoot: frozenPlan.workspace_root,
      domainId: frozenPlan.canonical_domain_id,
      runtimeDomainId: frozenPlan.runtime_domain_id,
      checkoutRoot: frozenPlan.checkout_root,
      acceptedDomainIds: frozenPlan.accepted_domain_ids,
      packageUseBinding: frozenPlan.package_use_binding,
      runtimeBindingRef: frozenBinding.hosted_runtime_binding_ref,
      runtimeBinding: frozenBinding.hosted_runtime_binding,
      startedAt: frozenPlan.started_at,
      timeoutMs: frozenPlan.timeout_ms,
      requestPayloadSha256: frozenPlan.request_payload_sha256,
      originalInvocationSha256: frozen.originalInvocationSha256,
      requestBytes: frozen.requestBytes,
      context: frozen.context,
      dependencies,
    });
  }
  if (frozenBinding && completion?.execution_kind === 'handler_ref' && completion.status === 'completed') {
    const legacyBinding = frozenBinding;
    const legacyRuntimeBinding = await standardAgentRuntimeResolver(dependencies).resolvePinned({
      provenance: legacyBinding.hosted_runtime_binding,
      provenance_ref: legacyBinding.hosted_runtime_binding_ref,
      workspaceRoot: input.workspaceRoot,
    });
    assertRequestedDomainMatchesBinding(input.domainId, legacyRuntimeBinding);
    if (
      legacyBinding.run_id !== runId
      || legacyBinding.canonical_domain_id !== legacyRuntimeBinding.agent_id
      || legacyBinding.action_id !== input.actionId
      || legacyBinding.hosted_runtime_binding_ref !== legacyRuntimeBinding.provenance_ref
      || canonicalJsonText(legacyBinding.hosted_runtime_binding)
        !== canonicalJsonText(legacyRuntimeBinding.provenance)
    ) fail('Hosted Agent action request conflicts with its frozen legacy run binding.', { run_id: runId });
    const legacyAction = readHostedAgentRuntimeActionContracts(
      legacyRuntimeBinding.checkout_root,
    ).catalog.actions.find((action) => action.action_id === legacyBinding.action_id)
      ?? fail('Frozen legacy Standard Agent action is absent from its pinned action catalog.', {
        run_id: runId,
        action_id: legacyBinding.action_id,
      });
    assertStandardAgentActionInvocationSurface(legacyAction, invocationContext);
    return replayCompletedHandlerAction({
      runtimeInput: input,
      runId,
      startedAt: observedAt,
      binding: legacyBinding,
      completion,
      recordLedger: dependencies.recordLedger ?? actionLedger,
    });
  }

  const runtimeResolver = standardAgentRuntimeResolver(dependencies);
  const runtimeBinding = frozenBinding
    ? await runtimeResolver.resolvePinned({
        provenance: frozenBinding.hosted_runtime_binding,
        provenance_ref: frozenBinding.hosted_runtime_binding_ref,
        workspaceRoot: input.workspaceRoot,
      })
    : await runtimeResolver.resolve({
        domainId: input.domainId,
        workspaceRoot: input.workspaceRoot,
      });
  assertRequestedDomainMatchesBinding(input.domainId, runtimeBinding);
  if (frozenBinding && (
    frozenBinding.run_id !== runId
    || frozenBinding.canonical_domain_id !== runtimeBinding.agent_id
    || frozenBinding.action_id !== input.actionId
    || frozenBinding.hosted_runtime_binding_ref !== runtimeBinding.provenance_ref
    || canonicalJsonText(frozenBinding.hosted_runtime_binding) !== canonicalJsonText(runtimeBinding.provenance)
  )) {
    fail('Hosted Agent action request conflicts with its frozen legacy run binding.', { run_id: runId });
  }
  let liveContext = buildLiveActionContext({
    runtimeInput: input,
    runtimeBinding,
    dependencies,
  });
  assertStandardAgentActionInvocationSurface(liveContext.action, invocationContext);
  const requestPayloadSha256 = sha256(canonicalJsonBytes(input.payload));
  const timeoutMs = canonicalTimeoutMs(input.timeoutMs);
  const invocationSha256 = originalInvocationSha256({
    domainId: runtimeBinding.agent_id,
    actionId: liveContext.action.action_id,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    requestPayloadSha256,
    timeoutMs,
  });
  const materializedContext = await materializeLifecycleAdmissionContext({
    runtimeInput: input,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    domainId: runtimeBinding.agent_id,
    checkoutRoot: runtimeBinding.checkout_root,
    originalInvocationSha256: invocationSha256,
    context: liveContext,
    dependencies,
  });
  liveContext = materializedContext.context;
  const liveRequestBytes = canonicalJsonBytes(liveContext.payload);

  if (!frozenBinding) {
    const acceptedDomainIds = canonicalDomainIds([
      input.domainId,
      runtimeBinding.agent_id,
      runtimeBinding.runtime_domain_id,
      runtimeBinding.target_domain_id,
      ...runtimeBinding.catalog_target_domain_ids,
    ]);
    const catalogTargetDomainIds = canonicalDomainIds(runtimeBinding.catalog_target_domain_ids);
    const plan: StandardAgentActionRunPlan = {
      surface_kind: 'opl_standard_agent_action_run_plan',
      version: 'opl-standard-agent-action-run-plan.v2',
      run_id: runId,
      canonical_domain_id: runtimeBinding.agent_id,
      accepted_domain_ids: acceptedDomainIds,
      action_id: liveContext.action.action_id,
      workspace_root: runtimeBinding.workspace_root,
      checkout_root: runtimeBinding.checkout_root,
      runtime_domain_id: runtimeBinding.runtime_domain_id,
      target_domain_id: runtimeBinding.target_domain_id,
      catalog_target_domain_ids: catalogTargetDomainIds,
      package_use_binding: packageUseBinding(runtimeBinding.package_use_binding),
      hosted_runtime_binding_ref: runtimeBinding.provenance_ref,
      execution_kind: liveContext.action.execution_binding.kind,
      catalog: liveContext.catalog,
      handler_registry: liveContext.registry,
      foundry_provider_manifest: liveContext.foundryProvider as unknown as Record<string, unknown> | null,
      request_payload_sha256: requestPayloadSha256,
      original_invocation_sha256: invocationSha256,
      effective_payload: liveContext.payload,
      request_sha256: sha256(liveRequestBytes),
      request_byte_size: liveRequestBytes.byteLength,
      input_schema_validation: liveContext.inputValidation,
      timeout_ms: timeoutMs,
      started_at: observedAt,
    };
    const planBytes = canonicalJsonBytes(plan);
    const reservation = reserveStandardAgentActionRunBinding({
      workspaceRoot: runtimeBinding.workspace_root,
      binding: {
        surface_kind: 'opl_standard_agent_action_run_binding',
        version: 'opl-standard-agent-action-run-binding.v2',
        run_id: runId,
        canonical_domain_id: runtimeBinding.agent_id,
        action_id: liveContext.action.action_id,
        hosted_runtime_binding_ref: runtimeBinding.provenance_ref,
        hosted_runtime_binding: runtimeBinding.provenance,
        plan_sha256: sha256(planBytes),
        plan_byte_size: planBytes.byteLength,
      },
      plan,
    });
    if (!reservation.plan || reservation.binding.version !== 'opl-standard-agent-action-run-binding.v2') {
      fail('Hosted Agent action run_id is already bound to an incompatible legacy run.', { run_id: runId });
    }
    frozenBinding = reservation.binding;
    frozenPlan = reservation.plan;
    const frozen = requestFromFrozenPlan({ runtimeInput: input, plan: frozenPlan });
    return executeActionContext({
      runtimeInput: input,
      runId,
      workspaceRoot: frozenPlan.workspace_root,
      domainId: frozenPlan.canonical_domain_id,
      runtimeDomainId: frozenPlan.runtime_domain_id,
      checkoutRoot: frozenPlan.checkout_root,
      acceptedDomainIds: frozenPlan.accepted_domain_ids,
      packageUseBinding: frozenPlan.package_use_binding,
      runtimeBindingRef: frozenBinding.hosted_runtime_binding_ref,
      runtimeBinding: frozenBinding.hosted_runtime_binding,
      startedAt: frozenPlan.started_at,
      timeoutMs: frozenPlan.timeout_ms,
      requestPayloadSha256: frozenPlan.request_payload_sha256,
      originalInvocationSha256: frozen.originalInvocationSha256,
      requestBytes: frozen.requestBytes,
      context: frozen.context,
      dependencies,
    });
  }

  return executeActionContext({
    runtimeInput: input,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    domainId: runtimeBinding.agent_id,
    runtimeDomainId: runtimeBinding.runtime_domain_id,
    checkoutRoot: runtimeBinding.checkout_root,
    acceptedDomainIds: canonicalDomainIds([
      runtimeBinding.agent_id,
      runtimeBinding.runtime_domain_id,
      runtimeBinding.target_domain_id,
      ...runtimeBinding.catalog_target_domain_ids,
    ]),
    packageUseBinding: packageUseBinding(runtimeBinding.package_use_binding),
    runtimeBindingRef: runtimeBinding.provenance_ref,
    runtimeBinding: runtimeBinding.provenance,
    startedAt: observedAt,
    timeoutMs,
    requestPayloadSha256,
    originalInvocationSha256: invocationSha256,
    requestBytes: liveRequestBytes,
    context: liveContext,
    dependencies,
  });
}
