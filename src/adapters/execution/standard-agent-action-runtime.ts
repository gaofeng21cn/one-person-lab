import crypto from 'node:crypto';
import path from 'node:path';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
  type FamilyActionCatalogAction,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../kernel/repo-json-schema.ts';
import { readStandardAgentDescriptorInterface } from '../../kernel/standard-agent-interface.ts';
import {
  validateDesignRequest,
  type FoundryProviderManifest,
} from '../../authority/evolution/index.ts';
import { compileStandardAgentStageManifest } from '../../authority/packages/public/standard-agent-action-runtime.ts';
import {
  commitStandardAgentActionOutput,
  createWorkItemExecutionScopeSnapshot,
  inspectStandardAgentActionRunOutput,
  inspectStoredStandardAgentActionRunOutput,
  listWorkspaceBindings,
  prepareStandardAgentActionRunRequest,
  readStandardAgentActionStoredBytes,
  requireWorkItemExecutionScopeSnapshot,
  resolveWorkItemInventoryBinding,
  resolveWorkItemIdentity,
  type WorkItemExecutionScopeSnapshot,
} from '../../authority/workspace/public/standard-agent-action-runtime.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import {
  actionLedger,
  assertCompletionIdentity,
  assertCompletionMatchesStored,
  completedHandlerReplay,
  completionBase,
  failureBytes,
  persistCompletion,
  persistedError,
  throwPersistedFailure,
  unknownSuccess,
  wrapFailure,
} from './standard-agent-action-runtime-parts/action-persistence.ts';
import {
  DefaultHostedAgentRuntimeBindingResolver,
  hostedRuntimeExecutionBindingRef,
  readHostedAgentRuntimeActionContracts,
  type HostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingResolver,
  type HostedAgentRuntimeBindingSnapshot,
} from './hosted-agent-runtime-binding.ts';
import { runFoundryAction } from './standard-agent-action-runtime-parts/foundry-action.ts';
import { runStageAction } from './standard-agent-action-runtime-parts/stage-action.ts';
import {
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunState,
  reserveStandardAgentActionRunBinding,
  type StandardAgentActionRunBinding,
  type StandardAgentActionRunCompletion,
  type StandardAgentActionRunPlan,
} from './standard-agent-action-run-state.ts';
import { runStandardAgentHandlerSandbox } from './standard-agent-handler-sandbox.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';
import {
  applyDomainArtifactCasMaterialization,
  DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
} from './domain-artifact-cas-materialization.ts';
import {
  bindStandardAgentLifecycleReactivation,
  materializedStandardAgentLifecycleInitializationAdmission,
  materializedStandardAgentLifecycleAdmission,
  preflightStandardAgentDomainLifecycleAdmission,
  prepareStandardAgentLifecycleInitialization,
  prepareStandardAgentLifecycleReactivation,
  standardAgentLifecycleAdmissionContract,
  type PreparedStandardAgentLifecycleInitialization,
  type PreparedStandardAgentLifecycleReactivation,
} from './standard-agent-domain-lifecycle-admission.ts';
import { fail, sha256 } from './standard-agent-action-runtime-parts/shared.ts';
import {
  assertQualificationProvisioningOutput,
  assertStandardAgentActionInvocationSurface,
  INTERNAL_STANDARD_AGENT_ACTION_INVOCATION,
  qualificationProvisioningPayload,
  QUALIFICATION_PROVISIONING_ACTION_ID,
  QUALIFICATION_PROVISIONING_INVOCATION,
} from './standard-agent-action-runtime-parts/qualification-provisioning.ts';
import { type StandardAgentActionRuntimeInput } from './standard-agent-action-runtime-parts/types.ts';

export { QUALIFICATION_PROVISIONING_ACTION_ID } from './standard-agent-action-runtime-parts/qualification-provisioning.ts';

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
  executionScope: WorkItemExecutionScopeSnapshot | null;
};

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

function resolveActionExecutionScope(input: {
  action: FamilyActionCatalogAction;
  payload: Record<string, unknown>;
  workspaceRoot: string;
  checkoutRoot: string;
  runtimeDomainId: string;
  acceptedProjectIds: readonly string[];
}) {
  if (!input.action.execution_scope || input.action.execution_scope.kind === 'none') return null;
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const pathBindings = listWorkspaceBindings().filter((binding) =>
    binding.status !== 'archived' && path.resolve(binding.workspace_path) === workspaceRoot
  );
  if (pathBindings.length === 0) {
    fail('Work-item scoped Standard Agent action requires an explicit workspace registry binding.', {
      failure_code: 'execution_scope_workspace_binding_missing',
      workspace_root: workspaceRoot,
      action_id: input.action.action_id,
    });
  }
  const acceptedProjectIds = new Set(input.acceptedProjectIds);
  const candidates = pathBindings.filter((binding) => acceptedProjectIds.has(binding.project_id));
  if (candidates.length === 0) {
    fail('Workspace binding conflicts with the Standard Agent runtime domain.', {
      failure_code: 'execution_scope_workspace_binding_conflict',
      workspace_root: workspaceRoot,
      accepted_project_ids: [...acceptedProjectIds].sort(),
      observed_bindings: pathBindings.map((binding) => ({
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        project_scope_id: binding.project_scope_id,
      })),
    });
  }
  if (candidates.length !== 1) {
    fail('Work-item scoped Standard Agent action resolves to multiple workspace bindings.', {
      failure_code: 'execution_scope_workspace_binding_ambiguous',
      workspace_root: workspaceRoot,
      candidate_bindings: candidates.map((binding) => ({
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        project_scope_id: binding.project_scope_id,
      })),
    });
  }
  const binding = candidates[0]!;
  const resolvedIdentity = resolveWorkItemIdentity({
    payload: input.payload,
    aliasFields: input.action.execution_scope.alias_fields,
  });
  const descriptor = readStandardAgentDescriptorInterface(input.checkoutRoot);
  const inventoryDeclaration = descriptor?.interface.inventory_projection ?? null;
  if (!descriptor || !inventoryDeclaration) {
    fail('Work-item scoped Standard Agent action requires a domain-owned inventory projection.', {
      failure_code: 'work_item_inventory_declaration_missing',
      checkout_root: input.checkoutRoot,
      action_id: input.action.action_id,
    });
  }
  const descriptorDomainIds = new Set([
    descriptor.domain_id,
    descriptor.interface.runtime.runtime_domain_id,
  ]);
  if (![...descriptorDomainIds].some((domainId) => acceptedProjectIds.has(domainId))) {
    fail('Domain inventory descriptor conflicts with the Standard Agent runtime identity.', {
      failure_code: 'work_item_inventory_descriptor_domain_mismatch',
      descriptor_domain_ids: [...descriptorDomainIds].sort(),
      accepted_project_ids: [...acceptedProjectIds].sort(),
    });
  }
  const inventoryBinding = resolveWorkItemInventoryBinding({
    workspaceRoot,
    declaration: inventoryDeclaration,
    domainWorkItemId: resolvedIdentity.domain_work_item_id,
    managedWorkspaceProjectIds: [...acceptedProjectIds],
  });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: binding.project_scope_id,
    workspaceBindingId: binding.binding_id,
    bindingVersionId: binding.binding_id,
    domainId: input.runtimeDomainId,
    workspaceRoot,
    payload: input.payload,
    requirement: input.action.execution_scope,
    expectedDomainWorkItemId: resolvedIdentity.domain_work_item_id,
    canonicalWorkItemRoot: inventoryBinding.canonical_work_item_root,
    inventoryDigest: inventoryBinding.inventory_digest,
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

function handlerExecutionScope(input: {
  action: FamilyActionCatalogAction;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  workspaceRoot: string;
  payload: Record<string, unknown>;
}) {
  if (input.action.execution_scope?.kind !== 'work_item') {
    if (input.executionScope) {
      fail('Unscoped Handler action must not carry a work-item execution scope.', {
        action_id: input.action.action_id,
        failure_code: 'standard_agent_handler_unexpected_execution_scope',
      });
    }
    return {
      executionScope: null,
      workspaceReadRoot: input.workspaceRoot,
    } as const;
  }
  if (!input.executionScope) {
    fail('Work-item Handler action requires an execution scope.', {
      action_id: input.action.action_id,
      failure_code: 'standard_agent_handler_execution_scope_missing',
    });
  }
  const executionScope = requireWorkItemExecutionScopeSnapshot(input.executionScope);
  if (
    executionScope.workspace_root !== input.workspaceRoot
    || executionScope.canonical_work_item_root === null
  ) {
    fail('Work-item Handler action requires a canonical read root in the current workspace.', {
      action_id: input.action.action_id,
      failure_code: 'standard_agent_handler_read_scope_unresolved',
      scope_workspace_root: executionScope.workspace_root,
      workspace_root: input.workspaceRoot,
      canonical_work_item_root: executionScope.canonical_work_item_root,
    });
  }
  resolveWorkItemIdentity({
    payload: input.payload,
    aliasFields: input.action.execution_scope.alias_fields,
    expectedDomainWorkItemId: executionScope.domain_work_item_id,
  });
  return {
    executionScope,
    workspaceReadRoot: executionScope.canonical_work_item_root,
  } as const;
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

function assertDurableRuntimeProvenance(binding: StandardAgentActionRunBinding) {
  const provenance = binding.hosted_runtime_binding;
  const expectedRef = `opl://hosted-agent-runtime-binding/sha256/${sha256(canonicalJsonText(provenance))}`;
  if (
    provenance.surface_kind !== 'opl_hosted_agent_runtime_binding_provenance'
    || provenance.version !== 'opl-hosted-agent-runtime-binding-provenance.v1'
    || provenance.target_agent_id !== binding.canonical_domain_id
    || ![
      'installed_native_carrier',
      'foundry_active_agent_version',
    ].includes(provenance.source_kind)
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
  action: FamilyActionCatalogAction;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  workspaceRoot: string;
  recordLedger: typeof actionLedger;
}) {
  const scope = handlerExecutionScope({
    action: input.action,
    executionScope: input.executionScope,
    workspaceRoot: input.workspaceRoot,
    payload: input.runtimeInput.payload,
  });
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
      execution_scope: scope.executionScope,
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

function materializeHandlerOutput(input: {
  action: FamilyActionCatalogAction;
  workspaceRoot: string;
  requestPayload: Record<string, unknown>;
  materializationDomainId: string;
  runId: string;
  handlerRef: string;
  runtimeBindingRef: string;
  output: unknown;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}, applyMaterialization = applyDomainArtifactCasMaterialization) {
  if (input.action.action_id === QUALIFICATION_PROVISIONING_ACTION_ID) {
    assertQualificationProvisioningOutput({
      workspaceRoot: input.workspaceRoot,
      requestPayload: input.requestPayload,
      output: input.output,
    });
  }
  return applyMaterialization({
    workspaceRoot: input.workspaceRoot,
    domainId: input.materializationDomainId,
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
  materializationDomainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  runtimeBindingRef: string;
  startedAt: string;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  runHandler: typeof runStandardAgentHandlerSandbox;
  applyDomainArtifactCas: typeof applyDomainArtifactCasMaterialization;
  recordLedger: typeof actionLedger;
}) {
  const scope = handlerExecutionScope({
    action: input.action,
    executionScope: input.executionScope,
    workspaceRoot: input.workspaceRoot,
    payload: input.runtimeInput.payload,
  });
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
          requestPayload: input.runtimeInput.payload,
          materializationDomainId: input.materializationDomainId,
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
      requestPayload: input.runtimeInput.payload,
      materializationDomainId: input.materializationDomainId,
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
      execution_scope: scope.executionScope,
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
      workspaceRoot: input.workspaceRoot,
      workspaceReadRoot: scope.workspaceReadRoot,
      binding: handler.binding,
      request: input.runtimeInput.payload,
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
      requestPayload: input.runtimeInput.payload,
      materializationDomainId: input.materializationDomainId,
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
    execution_scope: scope.executionScope,
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

async function buildLiveActionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runtimeBinding: HostedAgentRuntimeBindingSnapshot;
  dependencies: RuntimeDependencies;
}): Promise<StandardAgentActionContext> {
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
  const executionScope = resolveActionExecutionScope({
    action,
    payload,
    workspaceRoot: input.runtimeBinding.workspace_root,
    checkoutRoot: input.runtimeBinding.checkout_root,
    runtimeDomainId: input.runtimeBinding.runtime_domain_id,
    acceptedProjectIds: [
      input.runtimeBinding.runtime_domain_id,
      input.runtimeBinding.target_domain_id,
      ...input.runtimeBinding.catalog_target_domain_ids,
    ],
  });
  if (action.execution_binding.kind === 'stage_binding') {
    (input.dependencies.compileStageManifest ?? compileStandardAgentStageManifest)(
      input.runtimeBinding.checkout_root,
    );
  }
  const foundryRequest = action.execution_binding.kind === 'foundry_binding'
    ? validateDesignRequest(payload)
    : null;
  let foundryProvider: FoundryProviderManifest | null = null;
  if (action.execution_binding.kind === 'foundry_binding') {
    const { createCordisFoundryDevComposition } = await import(
      '../../host/composition-profiles.ts'
    );
    const composition = await createCordisFoundryDevComposition();
    try {
      foundryProvider = composition.services.foundryProviderManifest.read(
        input.runtimeBinding.checkout_root,
        action.execution_binding.provider_manifest_ref,
      );
    } finally {
      await composition.dispose();
    }
  }
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
    executionScope,
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
  runtimeDomainId: string;
  acceptedProjectIds: readonly string[];
  checkoutRoot: string;
  originalInvocationSha256: string;
  context: StandardAgentActionContext;
  dependencies: RuntimeDependencies;
}) {
  const initializationBound = prepareStandardAgentLifecycleInitialization({
    action: input.context.action,
    payload: input.context.payload,
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  if (initializationBound) {
    const handlerAction = input.context.catalog.actions.find(
      (candidate) => candidate.action_id === initializationBound.handlerActionId,
    ) ?? fail('Lifecycle initialization action is absent from the frozen domain catalog.', {
      initialization_action_id: initializationBound.handlerActionId,
    });
    if (
      handlerAction.execution_binding.kind !== 'handler_ref'
      || Object.values(handlerAction.supported_surfaces).some((surface) => surface !== null)
      || !actionDeclaresHostMaterialization(handlerAction)
    ) fail('Lifecycle initialization action must be an internal registry-bound host-materializing Handler action.', {
      initialization_action_id: initializationBound.handlerActionId,
    });

    const childState = inspectStandardAgentActionRunState({
      workspaceRoot: input.workspaceRoot,
      runId: initializationBound.handlerRunId,
    });
    let prepared: PreparedStandardAgentLifecycleInitialization;
    if (childState) {
      if (
        !childState.plan
        || childState.plan.action_id !== initializationBound.handlerActionId
        || !childState.plan.effective_payload
      ) fail('Existing lifecycle initialization child run lacks its frozen effective Handler payload.', {
        handler_run_id: initializationBound.handlerRunId,
      });
      prepared = {
        ...initializationBound,
        handlerPayload: originalInternalHandlerPayload({ action: handlerAction, plan: childState.plan }),
      };
    } else {
      prepared = initializationBound;
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
      [prepared.admissionPayloadField]: materializedStandardAgentLifecycleInitializationAdmission({
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
    const executionScope = resolveActionExecutionScope({
      action: input.context.action,
      payload: effectivePayload,
      workspaceRoot: input.workspaceRoot,
      checkoutRoot: input.checkoutRoot,
      runtimeDomainId: input.runtimeDomainId,
      acceptedProjectIds: input.acceptedProjectIds,
    });
    const context = {
      ...input.context,
      payload: effectivePayload,
      inputValidation,
      executionScope,
    };
    const admission = preflightStandardAgentDomainLifecycleAdmission({
      action: context.action,
      payload: context.payload,
      checkoutRoot: input.checkoutRoot,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      materializationDomainId: context.catalog.target_domain_id,
      runId: input.runId,
      originalInvocationSha256: input.originalInvocationSha256,
    });
    return { context, admission };
  }
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
      materializationDomainId: input.context.catalog.target_domain_id,
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
    materializationDomainId: context.catalog.target_domain_id,
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
  const executionScope = input.plan.execution_scope
    ? requireWorkItemExecutionScopeSnapshot(input.plan.execution_scope)
    : null;
  if (action.execution_scope?.kind === 'work_item') {
    if (!executionScope) {
      fail('Frozen work-item action plan is missing its execution scope.', {
        run_id: input.plan.run_id,
        action_id: action.action_id,
      });
    }
    resolveWorkItemIdentity({
      payload,
      aliasFields: action.execution_scope.alias_fields,
      expectedDomainWorkItemId: executionScope.domain_work_item_id,
    });
  } else if (executionScope) {
    fail('Frozen unscoped action plan must not carry a work-item execution scope.', {
      run_id: input.plan.run_id,
      action_id: action.action_id,
    });
  }
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
      executionScope,
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
  const {
    action,
    registry,
    payload,
    foundryRequest,
    foundryProvider,
    inputValidation,
    executionScope,
  } = input.context;
  const lifecycleAdmission = preflightStandardAgentDomainLifecycleAdmission({
    action,
    payload,
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    materializationDomainId: input.context.catalog.target_domain_id,
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
        materializationDomainId: input.context.catalog.target_domain_id,
        acceptedDomainIds: input.acceptedDomainIds,
        requestPayloadSha256: input.requestPayloadSha256,
        inputSchemaValidation: inputValidation,
        executionScope,
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
          executionScope,
          runStageRuntime: input.dependencies.runStageRuntime ?? runFamilyRuntime,
          recordLedger: input.dependencies.recordLedger ?? actionLedger,
          authorityBoundary: actionAuthorityBoundary,
        })
      : await runFoundryAction({
          ...common,
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
    assertStandardAgentActionInvocationSurface(
      frozen.context.action,
      invocationContext,
      frozen.context.registry,
    );
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
        action: frozen.context.action,
        executionScope: frozen.context.executionScope,
        workspaceRoot: frozenPlan.workspace_root,
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
    fail('Completed legacy Handler replay has unresolved execution scope identity.', {
      run_id: runId,
      failure_code: 'standard_agent_handler_replay_execution_scope_unresolved',
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
  const effectiveRuntimeInput = invocationContext === QUALIFICATION_PROVISIONING_INVOCATION
    ? { ...input, payload: qualificationProvisioningPayload(input, runtimeBinding.workspace_root) }
    : input;
  let liveContext = await buildLiveActionContext({
    runtimeInput: effectiveRuntimeInput,
    runtimeBinding,
    dependencies,
  });
  assertStandardAgentActionInvocationSurface(liveContext.action, invocationContext, liveContext.registry);
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
    runtimeInput: effectiveRuntimeInput,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    domainId: runtimeBinding.agent_id,
    runtimeDomainId: runtimeBinding.runtime_domain_id,
    acceptedProjectIds: [
      runtimeBinding.runtime_domain_id,
      runtimeBinding.target_domain_id,
      ...runtimeBinding.catalog_target_domain_ids,
    ],
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
      execution_scope: liveContext.executionScope,
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

export function runStandardAgentQualificationProvisioning(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
) {
  if (input.actionId !== QUALIFICATION_PROVISIONING_ACTION_ID) {
    fail('Qualification provisioning surface only accepts its exact MAS authority action.', {
      failure_code: 'qualification_provisioning_action_mismatch',
      action_id: input.actionId,
    });
  }
  const resolveManagedCheckout = dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout;
  return runStandardAgentAction(input, {
    ...dependencies,
    resolveManagedCheckout: (checkoutInput) => resolveManagedCheckout({
      ...checkoutInput,
      preserveWorkspaceForQualificationProvisioning: true,
    }),
  }, QUALIFICATION_PROVISIONING_INVOCATION);
}
