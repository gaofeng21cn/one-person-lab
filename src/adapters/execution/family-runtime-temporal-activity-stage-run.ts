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
import { FOUNDRY_EVALUATION_STAGE_CANDIDATE, type FoundryEvaluationStageAdmission } from './foundry-evaluation-stage-candidate.ts';
import {
  localPathForRef,
  observeStableFile,
} from './family-runtime-codex-stage-runner/artifact-identity-verification/file-observation.ts';
import {
  observeCurrentArtifactBytes,
  verifyIdentityReceipt,
} from './family-runtime-codex-stage-runner/artifact-identity-verification/transport-receipts.ts';

function comparableArtifactHash(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const digest = /^(?:sha256:)?([a-fA-F0-9]{64})$/.exec(value.trim());
  return digest ? digest[1]!.toLowerCase() : value.trim();
}

function stageRunWorkspaceRoot(input: TemporalStageQualityCycleProjectionInput) {
  const scopeRoot = input.stage_run.execution_scope?.workspace_root;
  if (typeof scopeRoot === 'string' && scopeRoot.trim()) return scopeRoot.trim();
  const locatorRoot = input.stage_run.workspace_locator?.workspace_root;
  return typeof locatorRoot === 'string' && locatorRoot.trim() ? locatorRoot.trim() : null;
}

function observeContentArtifactBytes(
  input: TemporalStageQualityCycleProjectionInput,
  artifact: { ref: string; expected: string | null; workspaceRoot: string; index: number },
) {
  const { ref, expected, workspaceRoot, index } = artifact;
  const producingAttemptRef = input.state.artifact_identity_authority?.authoritative_attempt_ref;
  const receiptRef = input.state.artifact_identity_receipt_refs?.[index];
  if (!producingAttemptRef || !receiptRef || !expected || ref !== `opl-content://sha256/${expected}`) return null;
  const scope = input.stage_run.execution_scope ?? null;
  const receipt = verifyIdentityReceipt({
    receiptRef,
    workspaceRoot,
    domainId: input.stage_run.domain_id,
    expectedAttemptId: stageAttemptIdFromRef(producingAttemptRef),
    expectedIdentity: {
      stageRunId: input.stage_run.stage_run_id,
      scopeKind: input.stage_run.scope_kind ?? (scope ? 'work_item' : 'domain'),
      executionScope: scope,
    },
    artifactRef: ref,
    artifactSha256: expected,
  });
  if (receipt.surface_kind !== 'opl_transport_artifact_identity_receipt'
    || typeof receipt.artifact_source_ref !== 'string') return null;
  return observeCurrentArtifactBytes({
    artifactRef: ref,
    artifactSourceRef: receipt.artifact_source_ref,
    artifactSha256: expected,
    workspaceRoot,
    canonicalWorkItemRoot: scope?.canonical_work_item_root,
    canonicalWorkItemRootIdentity: scope?.canonical_work_item_root_identity,
    scopeWorkspaceRoot: scope?.workspace_root,
  });
}

/**
 * Read-only terminal observation of the authoritative artifact bytes.
 *
 * This intentionally reuses the projection activity instead of introducing a
 * separately registered activity type: every existing StageRun worker already
 * hosts it, so old histories do not gain a missing-activity failure. It never
 * writes SQLite and never mutates the authoritative set; it only reports
 * whether each live locator still hashes to the reviewed identity.
 */
function observeAuthoritativeArtifactBytes(input: TemporalStageQualityCycleProjectionInput) {
  const refs = input.state.artifact_refs ?? [];
  const hashes = input.state.artifact_hashes ?? [];
  const workspaceRoot = stageRunWorkspaceRoot(input);
  const artifacts = refs.map((ref, index) => {
    const expected = comparableArtifactHash(hashes[index]);
    if (!workspaceRoot) {
      return { ref, expected_sha256: expected, observed_sha256: null, status: 'unknown' as const };
    }
    try {
      const artifactRoot = input.stage_run.execution_scope?.canonical_work_item_root ?? workspaceRoot;
      const localPath = localPathForRef(ref, artifactRoot);
      const observed = localPath
        ? observeStableFile({ filePath: localPath, artifactRef: ref })
        : observeContentArtifactBytes(input, { ref, expected, workspaceRoot, index });
      if (!observed) {
        return { ref, expected_sha256: expected, observed_sha256: null, status: 'unknown' as const };
      }
      const observedHash = comparableArtifactHash(observed.sha256);
      return {
        ref,
        expected_sha256: expected,
        observed_sha256: observedHash,
        status: !expected
          ? 'unknown' as const
          : observedHash === expected ? 'matches' as const : 'differs' as const,
      };
    } catch {
      return { ref, expected_sha256: expected, observed_sha256: null, status: 'unknown' as const };
    }
  });
  const liveBytesStatus = artifacts.some((artifact) => artifact.status === 'differs')
    ? 'differs' as const
    : artifacts.length > 0 && artifacts.every((artifact) => artifact.status === 'matches')
      ? 'matches' as const
      : 'unknown' as const;
  return {
    artifact_identity_observation: {
      live_bytes_status: liveBytesStatus,
      artifacts,
    },
  };
}
export async function stageRunRouteLaunchActivity(
  input: TemporalStageRunRouteLaunchInput,
  options: {
    createStageRouteComposition?: StageRouteCompositionFactory;
    admitEvaluationStage?: FoundryEvaluationStageAdmission;
  } = {},
): Promise<TemporalStageRunRouteLaunchReceipt> {
  const { db } = openQueueDb();
  let parentStageRunInput = input.parent_stage_run;
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
    if (
      FOUNDRY_EVALUATION_STAGE_CANDIDATE in parentStageRun.stage_run_input.workspace_locator
      || FOUNDRY_EVALUATION_STAGE_CANDIDATE in input.parent_stage_run.workspace_locator
    ) {
      parentStageRunInput = parentStageRun.stage_run_input;
    }
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
  return materializeStageRunRoute({ ...input, parent_stage_run: parentStageRunInput }, {
    createStageRouteComposition: options.createStageRouteComposition,
    admitEvaluationStage: options.admitEvaluationStage,
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
            await import('./family-runtime-temporal-provider/attempt-control.ts')
          ).startTemporalStageRunWorkflow(workflowInput, { paths }),
          describeWorkflow: async (workflowInput) => await (
            await import('./family-runtime-temporal-provider/attempt-control.ts')
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
): Promise<Record<string, any>> {
  if (input.artifact_identity_observation_only === true) {
    return observeAuthoritativeArtifactBytes(input);
  }
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
