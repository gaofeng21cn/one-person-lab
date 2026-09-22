import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type {
  DomainHandlerRegistry,
  FamilyActionCatalogAction,
} from '../../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../../kernel/repo-json-schema.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  inspectStoredStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  readStandardAgentActionStoredBytes,
  requireWorkItemExecutionScopeSnapshot,
  resolveWorkItemIdentity,
  type WorkItemExecutionScopeSnapshot,
} from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import {
  applyDomainArtifactCasMaterialization,
} from '../domain-artifact-cas-materialization.ts';
import {
  hostedRuntimeExecutionBindingRef,
  type HostedAgentRuntimeBindingProvenance,
} from '../hosted-agent-runtime-binding.ts';
import {
  inspectStandardAgentActionRunCompletion,
  type StandardAgentActionRunBinding,
  type StandardAgentActionRunCompletion,
} from '../standard-agent-action-run-state.ts';
import { runStandardAgentHandlerSandbox } from '../standard-agent-handler-sandbox.ts';
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
} from './action-persistence.ts';
import { actionDeclaresHostMaterialization } from './action-context.ts';
import {
  assertQualificationProvisioningOutput,
  QUALIFICATION_PROVISIONING_ACTION_ID,
} from './qualification-provisioning.ts';
import { actionAuthorityBoundary, fail, sha256 } from './shared.ts';
import type { StandardAgentActionRuntimeInput } from './types.ts';

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

export function replayCompletedHandlerAction(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  startedAt: string;
  binding: StandardAgentActionRunBinding;
  completion: StandardAgentActionRunCompletion;
  action: FamilyActionCatalogAction;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  workspaceRoot: string;
  recordLedger: typeof actionLedger;
  materializationDomainId: string;
  applyDomainArtifactCas?: typeof applyDomainArtifactCasMaterialization;
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
  const materializes = actionDeclaresHostMaterialization(input.action);
  const hostMaterialization = materializes
    ? (input.applyDomainArtifactCas ?? applyDomainArtifactCasMaterialization)({
        workspaceRoot: input.workspaceRoot,
        domainId: input.materializationDomainId,
        actionId: input.binding.action_id,
        runId: input.runId,
        handlerRef: input.completion.binding_ref,
        hostedRuntimeBindingRef: input.binding.hosted_runtime_binding_ref,
        actionAuthorityBoundary: input.action.authority_boundary,
        handlerOutput: result,
        handlerOutputRef: stored.output.ref,
        handlerOutputSha256: stored.output.sha256,
        replayOnly: true,
      })
    : null;
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
      ...(materializes ? { host_materialization: hostMaterialization } : {}),
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
  checkoutRoot: string;
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
      action: input.action,
      checkoutRoot: input.checkoutRoot,
      domainId: input.materializationDomainId,
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

export async function runHandlerAction(input: {
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

  function persistHandlerCompletion(
    stored: ReturnType<typeof commitStandardAgentActionOutput>,
    completion: Pick<StandardAgentActionRunCompletion,
      'status' | 'failure_disposition' | 'sandbox' | 'error' | 'completed_handler_replay'>,
  ) {
    return persistCompletion(input.workspaceRoot, {
      ...completionBase({
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        executionKind: 'handler_ref',
        status: completion.status,
        bindingRef: handlerRef,
        runtimeBindingRef: input.runtimeBindingRef,
        stored,
      }),
      ...completion,
    });
  }

  function materializeOutput(output: unknown, stored: ReturnType<typeof commitStandardAgentActionOutput>) {
    return materializeHandlerOutput({
      action: input.action,
      checkoutRoot: input.checkoutRoot,
      workspaceRoot: input.workspaceRoot,
      requestPayload: input.runtimeInput.payload,
      materializationDomainId: input.materializationDomainId,
      runId: input.runId,
      handlerRef,
      runtimeBindingRef: input.runtimeBindingRef,
      output,
      stored,
    }, input.applyDomainArtifactCas);
  }

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
      completion ??= persistHandlerCompletion(existing, {
        status: 'failed',
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
        hostMaterialization = materializeOutput(persisted, existing);
        completion = persistHandlerCompletion(existing, {
          status: 'completed',
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
        completion = persistHandlerCompletion(existing, {
          status: 'failed',
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
    hostMaterialization ??= materializeOutput(persisted, existing);
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
    persistHandlerCompletion(stored, {
      status: 'failed',
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
    persistHandlerCompletion(stored, {
      status: 'failed',
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
    hostMaterialization = materializeOutput(receipt.output, stored);
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
    persistHandlerCompletion(stored, {
      status: 'failed',
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
  persistHandlerCompletion(stored, {
    status: 'completed',
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
