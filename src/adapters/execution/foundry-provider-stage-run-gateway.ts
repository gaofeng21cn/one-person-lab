import type { Client } from '@temporalio/client';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  FoundryTransientActivityError,
  type FoundryProviderManifest,
  type FoundryActivityIdentity,
} from '../../authority/evolution/index.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { resolveFoundryExecutionScope } from './foundry-execution-scope.ts';
import { assertSameExecutionScope, type WorkItemExecutionScopeSnapshot } from '../../authority/workspace/public/standard-agent-action-runtime.ts';
import {
  fail,
  record,
  stringValue,
  type FoundryProviderStageRunLaunch,
} from './foundry-provider-stage-run-contract.ts';
import { cancelTemporalStageRunWorkflow } from './family-runtime-temporal-provider/attempt-control.ts';
import {
  withDurableTemporalClient,
  withTemporalRpcDeadline,
} from './family-runtime-temporal-client.ts';
import { stageRunQuery } from './family-runtime-temporal-workflows.ts';

export type FoundryStageRouteCompositionFactory = NonNullable<
  NonNullable<Parameters<typeof runFamilyRuntime>[1]>['createStageRouteComposition']
>;

export interface FoundryProviderStageRunGateway {
  launch(input: {
    provider: FoundryProviderManifest;
    checkout_root: string;
    workspace_root: string;
    execution_scope: WorkItemExecutionScopeSnapshot;
    stage_id: string;
    stage_run_invocation_id: string;
    activity: FoundryActivityIdentity;
    input_artifact_refs: string[];
    input_artifact_hashes: string[];
  }): Promise<FoundryProviderStageRunLaunch>;
  query(workflowId: string): Promise<unknown>;
  cancel(workflowId: string): Promise<void>;
}

const TERMINAL_FAILURE_WORKFLOW_STATUSES = new Set([
  'FAILED',
  'TIMED_OUT',
  'CANCELED',
  'CANCELLED',
  'TERMINATED',
]);

export async function queryFoundryProviderStageRunHandle(
  client: Client,
  handle: ReturnType<Client['workflow']['getHandle']>,
) {
  const description = await withTemporalRpcDeadline(client, () => handle.describe());
  const workflowStatus = description.status.name;
  if (workflowStatus === 'COMPLETED') {
    return withTemporalRpcDeadline(client, () => handle.result());
  }
  if (TERMINAL_FAILURE_WORKFLOW_STATUSES.has(workflowStatus)) {
    const memo = record(description.memo, 'Foundry provider StageRun workflow memo');
    return {
      surface_kind: 'temporal_stage_run_query',
      provider_kind: 'temporal',
      stage_run_id: stringValue(memo.stage_run_id, 'Foundry provider StageRun memo stage_run_id'),
      workflow_id: description.workflowId,
      run_id: description.runId,
      workflow_status: workflowStatus,
      domain_id: typeof memo.domain_id === 'string' ? memo.domain_id : null,
      stage_id: stringValue(memo.stage_id, 'Foundry provider StageRun memo stage_id'),
      status: 'failed',
      artifact_refs: [],
      artifact_hashes: [],
      attempts: [],
      next_stage_run_launch: null,
      blocked_reason: `temporal_stage_run_workflow_${workflowStatus.toLowerCase()}`,
    };
  }
  return withTemporalRpcDeadline(client, () => handle.query(stageRunQuery));
}

export class OplFoundryProviderStageRunGateway implements FoundryProviderStageRunGateway {
  readonly #runFamilyRuntime: typeof runFamilyRuntime;
  readonly #createStageRouteComposition?: FoundryStageRouteCompositionFactory;

  constructor(runStageRuntime: typeof runFamilyRuntime = runFamilyRuntime, options: {
    create_stage_route_composition?: FoundryStageRouteCompositionFactory;
  } = {}) {
    this.#runFamilyRuntime = runStageRuntime;
    this.#createStageRouteComposition = options.create_stage_route_composition;
  }

  async launch(input: Parameters<FoundryProviderStageRunGateway['launch']>[0]) {
    const executionScope = resolveFoundryExecutionScope({
      provider: input.provider,
      workspace_root: input.workspace_root,
      run_id: input.activity.run_id,
    });
    assertSameExecutionScope(executionScope, input.execution_scope, { operation: 'foundry_provider_launch' });
    const workspaceLocator = canonicalJsonText({
      workspace_root: executionScope.workspace_root,
      execution_scope: executionScope,
      domain_pack_root: input.checkout_root,
      source_refs: input.input_artifact_refs,
      foundry_run_ref: `opl://foundry/runs/${encodeURIComponent(input.activity.run_id)}`,
      foundry_operation: input.activity.phase,
      foundry_iteration: input.activity.iteration,
      foundry_input_digest: input.activity.input_digest,
    });
    const args = [
      'attempt',
      'create',
      '--domain',
      input.provider.domain_id,
      '--stage',
      input.stage_id,
      '--action',
      input.provider.projection_policy.public_action_ids[0],
      '--provider',
      'temporal',
      '--workspace-locator',
      workspaceLocator,
      '--scope-kind',
      'work_item',
      '--execution-scope',
      canonicalJsonText(executionScope),
      '--source-fingerprint',
      input.activity.input_digest,
      '--stage-run-invocation-id',
      input.stage_run_invocation_id,
      '--task',
      input.activity.run_id,
      '--start',
    ];
    for (let index = 0; index < input.input_artifact_refs.length; index += 1) {
      args.push('--input-artifact-ref', input.input_artifact_refs[index]!);
      args.push('--input-artifact-sha256', input.input_artifact_hashes[index]!);
    }
    let launched: Awaited<ReturnType<typeof runFamilyRuntime>>;
    try {
      launched = await this.#runFamilyRuntime(args, {
        createStageRouteComposition: this.#createStageRouteComposition,
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun launch failed transiently.', { cause: error });
    }
    const stageRun = record(launched.family_runtime_stage_run, 'Foundry provider StageRun launch');
    const stageRunInput = record(stageRun.stage_run_input, 'Foundry provider StageRun input');
    return { workflow_id: stringValue(stageRunInput.workflow_id, 'Foundry provider workflow_id') };
  }

  async query(workflowId: string) {
    try {
      return await withDurableTemporalClient(async (client) => {
        const handle = client.workflow.getHandle(workflowId);
        return queryFoundryProviderStageRunHandle(client, handle);
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun query failed transiently.', { cause: error });
    }
  }

  async cancel(workflowId: string) {
    try {
      await cancelTemporalStageRunWorkflow({
        workflowId,
        reason: 'foundry_provider_operation_cancelled',
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FoundryTransientActivityError('Foundry provider StageRun cancellation failed transiently.', {
        cause: error,
      });
    }
  }
}
