import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
  inspectStoredStandardAgentActionRunOutput,
  prepareStandardAgentActionRunRequest,
  readStandardAgentActionStoredBytes,
  requireWorkItemExecutionScopeSnapshot,
  type WorkItemExecutionScopeSnapshot,
} from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import { runFamilyRuntime } from '../family-runtime.ts';
import { buildHostedActionStageRunInvocationId } from '../family-runtime-stage-run-identity.ts';
import {
  actionLedger,
  assertCompletionIdentity,
  assertCompletionMatchesStored,
  completionBase,
  failureBytes,
  observationFailure,
  persistCompletion,
  persistedError,
  throwPersistedFailure,
  unknownSuccess,
  wrapFailure,
} from './action-persistence.ts';
import {
  hostedRuntimeExecutionBindingRef,
  type HostedAgentRuntimeBindingProvenance,
} from '../hosted-agent-runtime-binding.ts';
import { inspectStandardAgentActionRunCompletion } from '../standard-agent-action-run-state.ts';
import {
  prevalidatedSourceTruthFingerprint,
  readPrevalidatedSourceTruthRefs,
} from '../family-runtime-source-truth-refs.ts';
import { fail } from './shared.ts';

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
  execution_scope: WorkItemExecutionScopeSnapshot | null;
  temporal_stage_run: Record<string, unknown>;
  temporal_stage_run_query: Record<string, unknown> | null;
  temporal_stage_run_query_error: ReturnType<typeof observationFailure> | null;
  blocked_reason: string | null;
  hosted_runtime_binding_ref: string;
  hosted_runtime_binding: HostedAgentRuntimeBindingProvenance;
  authority_boundary: Record<string, unknown>;
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
    || (persisted.execution_scope !== undefined
      && persisted.execution_scope !== null
      && !isRecord(persisted.execution_scope))
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
  return {
    ...persisted,
    execution_scope: persisted.execution_scope === undefined || persisted.execution_scope === null
      ? null
      : requireWorkItemExecutionScopeSnapshot(persisted.execution_scope),
  } as unknown as StandardAgentStageActionLaunch;
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

export async function runStageAction(input: {
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
  executionScope: WorkItemExecutionScopeSnapshot | null;
  authorityBoundary: () => Record<string, unknown>;
}) {
  const executionBinding = input.action.execution_binding;
  const stageRoute = input.action.stage_route;
  if (executionBinding.kind !== 'stage_binding' || !stageRoute) {
    fail('Stage action has an invalid execution binding.', { action_id: input.action.action_id });
  }
  // A Stage that declares a controller-required review lane binds the lane at
  // launch time; the hosted Stage action surface is the controller's entry
  // point, so a controller-supplied lane must reach attempt creation intact.
  // The compiled Stage manifest remains the sole authority over which lanes
  // are legal; the family runtime validates this value against that binding.
  const requestedReviewLane = typeof input.payload.review_lane === 'string'
    && input.payload.review_lane.trim()
    ? input.payload.review_lane.trim()
    : null;
  const prepared = prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  const sourceTruthRefs = readPrevalidatedSourceTruthRefs(
    input.payload.source_truth_refs,
    'action_payload.source_truth_refs',
  );
  const sourceFingerprint = sourceTruthRefs
    ? prevalidatedSourceTruthFingerprint(sourceTruthRefs)
    : prepared.request.sha256;
  const workspaceLocator = canonicalJsonText({
    workspace_root: input.workspaceRoot,
    ...actionWorkItemIdentityLocator(input.action, input.payload),
    ...(sourceTruthRefs ? { source_truth_refs: sourceTruthRefs } : {}),
    ...(input.executionScope ? { execution_scope: input.executionScope } : {}),
    domain_pack_root: input.checkoutRoot,
    ...(input.packageUseBinding ? { package_use_binding: input.packageUseBinding } : {}),
    hosted_runtime_binding_ref: input.runtimeBindingRef,
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
    if (canonicalJsonText(persisted.execution_scope) !== canonicalJsonText(input.executionScope)) {
      fail('Existing Stage action launch is bound to a different execution scope.', {
        run_id: input.runId,
        persisted_scope_digest: persisted.execution_scope?.scope_digest ?? null,
        resolved_scope_digest: input.executionScope?.scope_digest ?? null,
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

  // Stage inputs stay inside the work item; the workspace-level run remains the ledger authority.
  const stageRequest = input.executionScope?.canonical_work_item_root
    ? prepareStandardAgentActionRunRequest({
        workspaceRoot: input.executionScope.canonical_work_item_root,
        runId: input.runId,
        domainId: input.domainId,
        actionId: input.action.action_id,
        requestBytes: input.requestBytes,
      }).request
    : prepared.request;

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
        ...(input.executionScope
          ? [
              '--scope-kind',
              'work_item',
              '--execution-scope',
              canonicalJsonText(input.executionScope),
            ]
          : []),
        '--source-fingerprint',
        sourceFingerprint,
        '--invocation-mode',
        'invocation',
        ...(requestedReviewLane ? ['--review-lane', requestedReviewLane] : []),
        '--checkpoint-ref',
        stageRequest.ref,
        '--input-artifact-ref',
        stageRequest.ref,
        '--input-artifact-sha256',
        stageRequest.sha256,
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
        execution_scope: input.executionScope,
        temporal_stage_run: created,
        temporal_stage_run_query: query,
        temporal_stage_run_query_error: queryError,
        blocked_reason: blockedReason,
        hosted_runtime_binding_ref: input.runtimeBindingRef,
        hosted_runtime_binding: input.runtimeBinding,
        authority_boundary: input.authorityBoundary(),
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
