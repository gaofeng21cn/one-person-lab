import { withFamilyRuntimeTransaction } from './family-runtime-sqlite.ts';
import {
  type TemporalStageQualityCycleProjectionInput,
  type TemporalStageRunRouteLaunchInput,
  type TemporalStageRunRouteLaunchReceipt,
} from './family-runtime-temporal.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { openQueueDb } from './family-runtime-store.ts';
import { createStageAttemptTable } from './family-runtime-stage-attempts.ts';
import { getStageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';
import {
  createStageQualityCycle,
  projectTemporalStageRunQualityCycle,
} from './family-runtime-stage-quality-cycle.ts';
import {
  findStageRunLaunch,
  recordStageRunClosed,
} from './family-runtime-stage-run-launch-registry.ts';
import { materializeStageRunRoute } from './family-runtime-stage-run-route-launch.ts';
import { launchRegisteredStageRun } from './family-runtime-stage-run-launch.ts';
import {
  requirePersistedStageRunActivityIdentity,
  requireResolvedPersistedStageAttemptIdentity,
  requireSamePersistedStageRunAttemptIdentity,
} from './family-runtime-persisted-identity-admission.ts';
import { requireSameFamilyRuntimeExecutionIdentity } from './family-runtime-execution-scope.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import {
  requireRawStageRunMutationAuthority,
  stageAttemptIdFromRef,
} from './family-runtime-temporal-activity-identity.ts';
import type { StageRouteCompositionFactory } from './composition-factory-ports.ts';
export async function stageRunRouteLaunchActivity(
  input: TemporalStageRunRouteLaunchInput,
  options: { createStageRouteComposition?: StageRouteCompositionFactory } = {},
): Promise<TemporalStageRunRouteLaunchReceipt> {
  const { db } = openQueueDb();
  try {
    requireRawStageRunMutationAuthority({
      db,
      stageRunId: input.parent_stage_run.stage_run_id,
      operation: 'temporal_stage_run_route_launch_activity:raw_parent',
    });
    const decisiveAttemptId = stageAttemptIdFromRef(input.decisive_attempt_ref);
    const decisiveAttemptRow = getStageAttemptRow(db, decisiveAttemptId);
    if (!decisiveAttemptRow) {
      throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt is not persisted.', {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        stage_attempt_id: decisiveAttemptId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      decisiveAttemptRow as unknown as Record<string, unknown>,
      'temporal_stage_run_route_launch_activity:raw_decisive_attempt',
    );
    const parentStageRun = requirePersistedStageRunActivityIdentity({
      db,
      candidateIdentity: input.parent_stage_run as unknown as Record<string, unknown>,
      operation: 'temporal_stage_run_route_launch_activity:parent',
    });
    const decisiveAttempt = requireResolvedPersistedStageAttemptIdentity({
      db,
      stageAttemptId: decisiveAttemptId,
      operation: 'temporal_stage_run_route_launch_activity:decisive_attempt',
    });
    requireSamePersistedStageRunAttemptIdentity({
      stageRunIdentity: parentStageRun as unknown as Record<string, unknown>,
      stageAttemptIdentity: decisiveAttempt as unknown as Record<string, unknown>,
      operation: 'temporal_stage_run_route_launch_activity:lineage',
    });
  } finally {
    db.close();
  }
  return materializeStageRunRoute(input, {
    createStageRouteComposition: options.createStageRouteComposition,
    findTargetStageRun: (stageRunId) => {
      const { db } = openQueueDb();
      try {
        return findStageRunLaunch(db, stageRunId)?.stage_run_input ?? null;
      } finally {
        db.close();
      }
    },
    launchTargetStageRun: async (stageRunInput) => {
      const { db, paths } = openQueueDb();
      try {
        return await launchRegisteredStageRun({
          db,
          stageRunInput,
          start: true,
          startWorkflow: async (workflowInput) => await (
            await import('./family-runtime-temporal-provider-parts/attempt-control.ts')
          ).startTemporalStageRunWorkflow(workflowInput, { paths }),
          describeWorkflow: async (workflowInput) => await (
            await import('./family-runtime-temporal-provider-parts/attempt-control.ts')
          ).describeTemporalStageRunWorkflow(workflowInput, { paths }),
        });
      } finally {
        db.close();
      }
    },
  });
}

export async function stageQualityCycleProjectActivity(
  input: TemporalStageQualityCycleProjectionInput,
) {
  const { db } = openQueueDb();
  try {
    requireRawStageRunMutationAuthority({
      db,
      stageRunId: input.stage_run.stage_run_id,
      operation: 'temporal_stage_quality_cycle_project_activity:raw_stage_run',
    });
    requirePersistedStageRunActivityIdentity({
      db,
      candidateIdentity: input.stage_run as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_cycle_project_activity',
    });
    requireSameFamilyRuntimeExecutionIdentity({
      authorityIdentity: input.stage_run as unknown as Record<string, unknown>,
      candidateIdentity: input.state as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_cycle_project_activity:workflow_state',
      compareWorkflowId: true,
      requireStageRunId: true,
    });
    createStageAttemptTable(db);
    const projected = withFamilyRuntimeTransaction(db, () => {
      requireRawStageRunMutationAuthority({
        db,
        stageRunId: input.stage_run.stage_run_id,
        operation: 'temporal_stage_quality_cycle_project_activity:stage_run_recheck',
      });
      createStageQualityCycle(db, {
        qualityCycleId: input.state.quality_cycle_id,
        stageRunId: input.stage_run.stage_run_id,
        domainId: input.stage_run.domain_id,
        stageId: input.stage_run.stage_id,
        policy: input.stage_run.quality_policy,
      });
      return projectTemporalStageRunQualityCycle(db, input.state);
    });
    const launch = findStageRunLaunch(db, input.stage_run.stage_run_id);
    if (launch?.launch_status !== 'closed') {
      recordStageRunClosed(db, {
        stageRunId: input.stage_run.stage_run_id,
        terminalStatus: input.state.status,
      });
    }
    return projected;
  } finally {
    db.close();
  }
}
