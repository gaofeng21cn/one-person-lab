import path from 'node:path';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type {
  DomainHandlerRegistry,
  FamilyActionCatalog,
  FamilyActionCatalogAction,
} from '../../../kernel/family-action-catalog-contract.ts';
import { assertRepoJsonSchemaPayload } from '../../../kernel/repo-json-schema.ts';
import { readStandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import {
  validateDesignRequest,
  type FoundryProviderManifest,
} from '../../../authority/evolution/index.ts';
import { compileStandardAgentStageManifest } from '../../../authority/packages/public/standard-agent-action-runtime.ts';
import {
  createWorkItemExecutionScopeSnapshot,
  listWorkspaceBindings,
  requireWorkItemExecutionScopeSnapshot,
  resolveWorkItemInventoryBinding,
  resolveWorkItemIdentity,
  type WorkItemExecutionScopeSnapshot,
} from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import {
  readHostedAgentRuntimeActionContracts,
  type HostedAgentRuntimeBindingSnapshot,
} from '../hosted-agent-runtime-binding.ts';
import {
  inspectStandardAgentActionRunState,
  type StandardAgentActionRunPlan,
} from '../standard-agent-action-run-state.ts';
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
} from '../standard-agent-domain-lifecycle-admission.ts';
import { fail, sha256 } from './shared.ts';
import type { StandardAgentActionRuntimeInput } from './types.ts';

export type StandardAgentActionContext = {
  action: FamilyActionCatalogAction;
  catalog: FamilyActionCatalog;
  registry: DomainHandlerRegistry | null;
  payload: Record<string, unknown>;
  foundryRequest: ReturnType<typeof validateDesignRequest> | null;
  foundryProvider: FoundryProviderManifest | null;
  inputValidation: Record<string, unknown>;
  executionScope: WorkItemExecutionScopeSnapshot | null;
};

type ActionContextDependencies = {
  compileStageManifest?: typeof compileStandardAgentStageManifest;
};

type RunInternalStandardAgentAction = (
  input: StandardAgentActionRuntimeInput,
) => Promise<unknown>;

export function canonicalTimeoutMs(value?: number) {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('Standard Agent action timeoutMs must be a positive integer.', { timeout_ms: value });
  }
  return value;
}

export function originalInvocationSha256(input: {
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

export function resolveActionExecutionScope(input: {
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

export function actionDeclaresHostMaterialization(action: FamilyActionCatalogAction) {
  return isRecord(action.authority_boundary?.host_materialization_contract);
}

export async function buildLiveActionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runtimeBinding: HostedAgentRuntimeBindingSnapshot;
  dependencies: ActionContextDependencies;
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
      '../../../host/composition-profiles.ts'
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

export async function materializeLifecycleAdmissionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  acceptedProjectIds: readonly string[];
  checkoutRoot: string;
  originalInvocationSha256: string;
  context: StandardAgentActionContext;
  runInternalAction: RunInternalStandardAgentAction;
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
    const handlerRun = await input.runInternalAction({
      domainId: input.domainId,
      actionId: prepared.handlerActionId,
      workspaceRoot: input.workspaceRoot,
      payload: prepared.handlerPayload,
      runId: prepared.handlerRunId,
      timeoutMs: input.runtimeInput.timeoutMs,
    });
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
  const handlerRun = await input.runInternalAction({
    domainId: input.domainId,
    actionId: prepared.handlerActionId,
    workspaceRoot: input.workspaceRoot,
    payload: prepared.handlerPayload,
    runId: prepared.handlerRunId,
    timeoutMs: input.runtimeInput.timeoutMs,
  });
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

export function requestFromFrozenPlan(input: {
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
