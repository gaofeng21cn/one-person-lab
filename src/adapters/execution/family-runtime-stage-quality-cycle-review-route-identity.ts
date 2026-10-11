import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import type { TemporalStageRunWorkflowState } from './family-runtime-temporal.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import { materializePersistedStageReviewReceipt } from './family-runtime-stage-attempt-ledger.ts';
import { readOplRevisionIntake } from './family-runtime-revision-intake.ts';
import { buildStageRouteDecisionIdentity } from './family-runtime-stage-run-identity.ts';
import {
  executionIdentityLineage,
  stageAttemptIdFromRef,
} from './family-runtime-stage-quality-cycle-persistence.ts';
import {
  canonicalArtifactHash,
  exactStringArray,
  persistedJsonRecord,
  recordValue,
} from './family-runtime-stage-quality-cycle-attempt-identity.ts';

export function requireProjectedReviewReceiptMatchesPersisted(
  db: DatabaseSync,
  receipt: TemporalStageRunWorkflowState['review_receipts'][number],
) {
  const persisted = materializePersistedStageReviewReceipt(db, {
    producerAttemptId: stageAttemptIdFromRef(receipt.producer_attempt_ref),
    reviewerAttemptId: stageAttemptIdFromRef(receipt.reviewer_attempt_ref),
    rubricRefs: receipt.rubric_refs,
    verdict: receipt.verdict,
  });
  const projectedRecord = { ...(receipt as unknown as Record<string, unknown>) };
  const revisionTransport = projectedRecord.revision_transport;
  delete projectedRecord.revision_transport;
  if (canonicalJsonText(projectedRecord) !== canonicalJsonText(persisted)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun review receipt does not match durable StageAttempt evidence.',
      {
        failure_code: 'stage_quality_cycle_review_receipt_content_mismatch',
        producer_attempt_ref: receipt.producer_attempt_ref,
        reviewer_attempt_ref: receipt.reviewer_attempt_ref,
      },
    );
  }
  if (revisionTransport === undefined) return;
  const transport = recordValue(revisionTransport);
  if (!transport) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun revision transport is invalid.',
      { failure_code: 'stage_quality_cycle_revision_transport_mismatch' },
    );
  }
  const readback = readOplRevisionIntake(transport.opl_revision_intake_ref);
  if (
    transport.surface_kind !== 'opl_revision_transport'
    || transport.schema_version !== 1
    || canonicalJsonText(transport.opl_stage_review_receipt_ref)
      !== canonicalJsonText(readback.stage_review_receipt_ref)
    || canonicalJsonText(transport.opl_revision_intake_ref)
      !== canonicalJsonText(readback.revision_intake_ref)
    || canonicalJsonText(transport.opl_revision_intake)
      !== canonicalJsonText(readback.revision_intake)
    || canonicalJsonText(transport.authority_boundary)
      !== canonicalJsonText(readback.revision_intake.authority_boundary)
    || canonicalJsonText(readback.stage_review_receipt) !== canonicalJsonText(persisted)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun revision transport does not exactly bind its durable review receipt.',
      { failure_code: 'stage_quality_cycle_revision_transport_mismatch' },
    );
  }
}

const STAGE_ROUTE_LAUNCH_AUTHORITY_BOUNDARY = {
  semantic_route_decision_owner: 'decisive_codex_attempt',
  stage_transition_materialization_owner: 'opl_stage_run_controller',
  opl_can_select_semantic_stage_route: false,
} as const;

export function requireProjectedRouteLaunchMatchesPersisted(input: {
  db: DatabaseSync;
  receipt: NonNullable<TemporalStageRunWorkflowState['next_stage_run_launch']>;
  selectedStageRoute: TemporalStageRunWorkflowState['selected_stage_route'];
  stageRun: Record<string, unknown>;
  stageRunAdmission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>;
  decisiveAttempt: Record<string, unknown>;
}) {
  if (
    input.receipt.surface_kind !== 'opl_stage_run_route_launch_receipt'
    || input.receipt.version !== 'opl-stage-run-route-launch-receipt.v1'
    || canonicalJsonText(input.receipt.decision) !== canonicalJsonText(input.selectedStageRoute)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch receipt envelope does not match the selected Stage route.',
      { failure_code: 'stage_quality_cycle_route_launch_envelope_mismatch' },
    );
  }
  const decision = recordValue(input.receipt.decision);
  if (!decision) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch decision is invalid.',
      { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
    );
  }
  const identity = buildStageRouteDecisionIdentity({
    parentStageRunId: String(input.stageRun.stage_run_id),
    decisiveAttemptRef: input.receipt.decisive_attempt_ref,
    decision,
  });
  const decisiveQualityContext = persistedJsonRecord(input.decisiveAttempt.quality_context_json, {
    stageAttemptId: String(input.decisiveAttempt.stage_attempt_id),
    field: 'quality_context_json',
  });
  const decisiveExecutionBinding = recordValue(decisiveQualityContext.execution_content_binding);
  const decisiveBindingSha256 = decisiveExecutionBinding?.binding_sha256;
  if (
    typeof decisiveBindingSha256 !== 'string'
    || !decisiveBindingSha256.trim()
    || input.receipt.parent_route_decision_ref !== identity.parent_route_decision_ref
    || input.receipt.route_decision_sha256 !== identity.route_decision_sha256
    || input.receipt.decisive_execution_content_binding_sha256 !== decisiveBindingSha256.trim()
    || canonicalJsonText(input.receipt.authority_boundary)
      !== canonicalJsonText(STAGE_ROUTE_LAUNCH_AUTHORITY_BOUNDARY)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch receipt does not match its decisive Attempt binding.',
      { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
    );
  }
  if (decision.decision_kind === 'complete') {
    if (
      input.receipt.materialization_status !== 'workflow_complete'
      || input.receipt.target_stage_run_id !== null
      || input.receipt.target_stage_run_invocation_id !== null
      || input.receipt.target_stage_run_spec_sha256 !== null
      || input.receipt.target_workflow_id !== null
      || input.receipt.durable_launch !== null
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Complete Stage route receipt cannot carry a target StageRun.',
        { failure_code: 'stage_quality_cycle_route_launch_target_mismatch' },
      );
    }
    return;
  }
  const targetStageRunId = input.receipt.target_stage_run_id;
  const target = typeof targetStageRunId === 'string' && targetStageRunId.trim()
    ? input.db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?').get(
        targetStageRunId,
      ) as Record<string, unknown> | undefined
    : undefined;
  if (!target) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch target is not registered.',
      {
        failure_code: 'stage_quality_cycle_route_launch_target_mismatch',
        target_stage_run_id: targetStageRunId,
      },
    );
  }
  const targetAdmission = requireRuntimeExecutionScopeMutationAllowed(
    input.db,
    target,
    'project_temporal_stage_run_quality_cycle:target_stage_run',
  );
  const durableLaunch = recordValue(input.receipt.durable_launch);
  const durableLaunchRow = recordValue(durableLaunch?.launch);
  const expectedTarget = {
    stage_run_id: target.stage_run_id,
    stage_run_invocation_id: target.stage_run_invocation_id,
    stage_run_spec_sha256: target.stage_run_spec_sha256,
    domain_id: target.domain_id,
    stage_id: target.stage_id,
    workflow_id: target.workflow_id,
    parent_route_decision_ref: target.parent_route_decision_ref,
    scope_digest: target.scope_digest ?? null,
  };
  const projectedTarget = {
    stage_run_id: input.receipt.target_stage_run_id,
    stage_run_invocation_id: input.receipt.target_stage_run_invocation_id,
    stage_run_spec_sha256: input.receipt.target_stage_run_spec_sha256,
    domain_id: durableLaunchRow?.domain_id ?? null,
    stage_id: decision.target_stage_id ?? null,
    workflow_id: input.receipt.target_workflow_id,
    parent_route_decision_ref: input.receipt.parent_route_decision_ref,
    scope_digest: durableLaunchRow?.scope_digest ?? null,
  };
  const startStatus = durableLaunch?.start_status;
  const expectedMaterializationStatus = startStatus === 'existing' ? 'existing' : 'launched';
  if (
    canonicalJsonText(executionIdentityLineage(targetAdmission))
      !== canonicalJsonText(executionIdentityLineage(input.stageRunAdmission))
    || canonicalJsonText(expectedTarget) !== canonicalJsonText(projectedTarget)
    || target.domain_id !== input.stageRun.domain_id
    || input.receipt.materialization_status !== expectedMaterializationStatus
    || !['registered', 'existing', 'starting', 'started', 'recovered'].includes(String(startStatus))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch target does not match its durable registry authority.',
      {
        failure_code: 'stage_quality_cycle_route_launch_target_mismatch',
        target_stage_run_id: targetStageRunId,
      },
    );
  }
}
