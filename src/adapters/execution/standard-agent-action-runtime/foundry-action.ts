import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  validateDesignRequest,
  type FoundryProviderManifest,
} from '../../../authority/evolution/index.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  readStandardAgentActionStoredBytes,
} from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import { startTemporalFoundryRunWorkflow } from '../foundry-temporal-control.ts';
import { admitFoundrySourceMaterials } from '../foundry-source-material.ts';
import {
  hostedRuntimeExecutionBindingRef,
  type HostedAgentRuntimeBindingProvenance,
} from '../hosted-agent-runtime-binding.ts';
import { inspectStandardAgentActionRunCompletion } from '../standard-agent-action-run-state.ts';
import {
  actionLedger,
  assertCompletionIdentity,
  assertCompletionMatchesStored,
  completionBase,
  failureBytes,
  persistCompletion,
  persistedError,
  throwPersistedFailure,
  unknownSuccess,
  wrapFailure,
} from './action-persistence.ts';
import { fail } from './shared.ts';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';

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

function foundryActionAuthorityBoundary() {
  return {
    opl_role: 'foundry_run_state_materialization_evaluation_version_activation_and_rollback_authority',
    provider_role: 'agent_design_evaluation_semantics_evidence_diagnosis_and_evolution_proposal',
    target_owner_role: 'domain_truth_protected_tests_quality_acceptance_permission_and_production_adoption',
    generated_agent_can_modify_versions_tests_permissions_or_activation: false,
    provider_completion_is_qualification_or_activation: false,
  } as const;
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

type FoundryActionDependencies = {
  startFoundryRun?: (input: {
    request: ReturnType<typeof validateDesignRequest>;
    run_id: string;
  }) => Promise<unknown>;
  recordLedger: typeof actionLedger;
};

export async function runFoundryAction(input: {
  action: FamilyActionCatalogAction;
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
} & FoundryActionDependencies) {
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
  admitFoundrySourceMaterials({ workspaceRoot: input.workspaceRoot, sourceRefs: input.request.source_refs });
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
