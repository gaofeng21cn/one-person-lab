import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { type StageQualityCycleState } from '../../authority/stages/index.ts';
import type { TemporalStageRunWorkflowState } from './family-runtime-temporal.ts';
import {
  getRow,
  inspectStageQualityCycle,
  parsePolicy,
  parseState,
  requireCycleAttemptMutationAuthority,
  stageAttemptIdFromRef,
  stageRunMutationAuthority,
  withQualityCycleMutation,
} from './family-runtime-stage-quality-cycle-persistence.ts';
import {
  exactStringArray,
  persistedJsonRecord,
  requireProjectedAttemptArtifactIdentityMatchesPersisted,
  requireProjectedAttemptSummaryMatchesPersisted,
} from './family-runtime-stage-quality-cycle-attempt-identity.ts';
import {
  requireProjectedReviewReceiptMatchesPersisted,
  requireProjectedRouteLaunchMatchesPersisted,
} from './family-runtime-stage-quality-cycle-review-route-identity.ts';

function projectedCycleStatus(state: TemporalStageRunWorkflowState): StageQualityCycleState['status'] {
  if (state.status === 'completed') return 'passed';
  if (state.status === 'completed_with_quality_debt') return 'quality_debt';
  if (state.status === 'blocked' || state.status === 'human_gate' || state.status === 'failed') {
    return 'hard_stopped';
  }
  if (state.current_role === 'reviewer' || state.current_role === 're_reviewer') return 'awaiting_review';
  if (state.current_role === 'repairer') return 'awaiting_repair';
  return 'awaiting_producer';
}

export function projectTemporalStageRunQualityCycle(
  db: DatabaseSync,
  state: TemporalStageRunWorkflowState,
) {
  return withQualityCycleMutation(db, () => {
    const row = getRow(db, state.quality_cycle_id);
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
        quality_cycle_id: state.quality_cycle_id,
      });
    }
    const stageRun = stageRunMutationAuthority(
      db,
      row.stage_run_id,
      'project_temporal_stage_run_quality_cycle',
    );
    if (
      row.stage_run_id !== state.stage_run_id
      || row.domain_id !== state.domain_id
      || row.stage_id !== state.stage_id
      || stageRun.row.workflow_id !== state.workflow_id
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Temporal StageRun quality projection identity mismatch.', {
        expected: {
          stage_run_id: row.stage_run_id,
          domain_id: row.domain_id,
          stage_id: row.stage_id,
          workflow_id: stageRun.row.workflow_id,
        },
        received: {
          stage_run_id: state.stage_run_id,
          domain_id: state.domain_id,
          stage_id: state.stage_id,
          workflow_id: state.workflow_id,
        },
      });
    }
    const projectedAttemptIds = state.attempts.map((attempt) => attempt.stage_attempt_id);
    if (
      projectedAttemptIds.some((stageAttemptId) => !stageAttemptId.trim() || stageAttemptId !== stageAttemptId.trim())
      || new Set(projectedAttemptIds).size !== projectedAttemptIds.length
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun Attempt summaries must contain unique canonical ids.',
        { failure_code: 'stage_quality_cycle_attempt_summary_duplicate' },
      );
    }
    const attemptIds = new Set(projectedAttemptIds);
    for (const attempt of state.attempts) {
      if (attempt.artifact_producer_attempt_ref) {
        attemptIds.add(stageAttemptIdFromRef(attempt.artifact_producer_attempt_ref));
      }
    }
    if (state.decisive_attempt_ref) attemptIds.add(stageAttemptIdFromRef(state.decisive_attempt_ref));
    if (state.source_attempt_ref) attemptIds.add(stageAttemptIdFromRef(state.source_attempt_ref));
    const reviewReceiptKeys = new Set<string>();
    for (const receipt of state.review_receipts) {
      if (receipt.stage_run_id !== row.stage_run_id || receipt.quality_cycle_id !== row.quality_cycle_id) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal StageRun review receipt does not match its durable quality cycle.',
          {
            failure_code: 'stage_quality_cycle_review_receipt_lineage_mismatch',
            quality_cycle_id: row.quality_cycle_id,
            stage_run_id: row.stage_run_id,
          },
        );
      }
      const receiptKey = `${receipt.producer_attempt_ref}\n${receipt.reviewer_attempt_ref}`;
      if (reviewReceiptKeys.has(receiptKey)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal StageRun review receipts must be unique by Attempt pair.',
          { failure_code: 'stage_quality_cycle_review_receipt_duplicate' },
        );
      }
      reviewReceiptKeys.add(receiptKey);
      attemptIds.add(stageAttemptIdFromRef(receipt.producer_attempt_ref));
      attemptIds.add(stageAttemptIdFromRef(receipt.reviewer_attempt_ref));
    }
    if (state.next_stage_run_launch) {
      if (
        state.next_stage_run_launch.parent_stage_run_id !== row.stage_run_id
        || state.next_stage_run_launch.decisive_attempt_ref !== state.decisive_attempt_ref
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal next StageRun launch receipt does not match its decisive Attempt lineage.',
          {
            failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch',
            quality_cycle_id: row.quality_cycle_id,
            stage_run_id: row.stage_run_id,
          },
        );
      }
      attemptIds.add(stageAttemptIdFromRef(state.next_stage_run_launch.decisive_attempt_ref));
    }
    const attemptAuthorities = new Map<string, Record<string, unknown>>();
    for (const stageAttemptId of attemptIds) {
      const authority = requireCycleAttemptMutationAuthority({
        db,
        cycle: row,
        stageRunAdmission: stageRun.admission,
        stageAttemptId,
        operation: 'project_temporal_stage_run_quality_cycle:attempt',
      });
      attemptAuthorities.set(stageAttemptId, authority.attempt);
    }
    for (const summary of state.attempts) {
      requireProjectedAttemptSummaryMatchesPersisted(
        summary,
        attemptAuthorities.get(summary.stage_attempt_id)!,
      );
      requireProjectedAttemptArtifactIdentityMatchesPersisted({
        db,
        summary,
        attempt: attemptAuthorities.get(summary.stage_attempt_id)!,
        attemptAuthorities,
      });
    }
    for (const receipt of state.review_receipts) {
      requireProjectedReviewReceiptMatchesPersisted(db, receipt);
    }
    const decisiveAttempt = state.decisive_attempt_ref
      ? attemptAuthorities.get(stageAttemptIdFromRef(state.decisive_attempt_ref))
      : null;
    if (
      (decisiveAttempt?.attempt_role ?? null) !== state.decisive_attempt_role
      || Boolean(state.decisive_attempt_ref) !== Boolean(state.decisive_attempt_role)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun decisive Attempt role does not match durable Attempt lineage.',
        { failure_code: 'stage_quality_cycle_decisive_attempt_mismatch' },
      );
    }
    if (state.next_stage_run_launch) {
      if (!decisiveAttempt) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal next StageRun launch requires a durable decisive Attempt.',
          { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
        );
      }
      requireProjectedRouteLaunchMatchesPersisted({
        db,
        receipt: state.next_stage_run_launch,
        selectedStageRoute: state.selected_stage_route,
        stageRun: stageRun.row,
        stageRunAdmission: stageRun.admission,
        decisiveAttempt,
      });
    }
    const projectedArtifactIdentity = {
      artifact_refs: state.artifact_refs,
      artifact_hashes: state.artifact_hashes,
      artifact_identity_receipt_refs: state.artifact_identity_receipt_refs,
    };
    const stageRunInput = persistedJsonRecord(stageRun.row.stage_run_input_json, {
      stageAttemptId: row.stage_run_id,
      field: 'stage_run_input_json',
    });
    const stageRunInputArtifactIdentity = {
      artifact_refs: exactStringArray(stageRunInput.artifact_refs, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_refs',
      }),
      artifact_hashes: exactStringArray(stageRunInput.artifact_hashes, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_hashes',
      }),
      artifact_identity_receipt_refs: exactStringArray(stageRunInput.artifact_identity_receipt_refs, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_identity_receipt_refs',
      }),
    };
    const projectedArtifactIdentityIsBound = state.attempts.some((summary) => (
      canonicalJsonText({
        artifact_refs: summary.artifact_refs,
        artifact_hashes: summary.artifact_hashes,
        artifact_identity_receipt_refs: summary.artifact_identity_receipt_refs,
      }) === canonicalJsonText(projectedArtifactIdentity)
    )) || canonicalJsonText(stageRunInputArtifactIdentity) === canonicalJsonText(projectedArtifactIdentity);
    if (!projectedArtifactIdentityIsBound) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun selected artifact identity is not bound by a durable Attempt or StageRun input.',
        { failure_code: 'stage_quality_cycle_selected_artifact_identity_mismatch' },
      );
    }
    const projected: StageQualityCycleState & { controller_readback: Record<string, unknown> } = {
      ...parseState(row),
      quality_scope_budget: parsePolicy(row).formal_review.scope_budget,
      quality_scope_budget_usage: state.quality_scope_budget_usage ?? null,
      quality_scope_budget_stop_reason: state.quality_scope_budget_stop_reason ?? null,
      repair_rounds_used: state.repair_rounds_used,
      current_role: state.current_role,
      status: projectedCycleStatus(state),
      selected_artifact_refs: [...state.artifact_refs],
      quality_debt_refs: [...state.quality_debt_refs],
      controller_readback: {
        surface_kind: state.surface_kind,
        workflow_id: state.workflow_id,
        controller_status: state.status,
        artifact_hashes: [...state.artifact_hashes],
        artifact_identity_receipt_refs: [...state.artifact_identity_receipt_refs],
        attempts: state.attempts.map((attempt) => ({
          attempt_role: attempt.attempt_role,
          quality_round_index: attempt.quality_round_index,
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          execution_session_ref: attempt.execution_session_ref,
          status: attempt.status,
          total_tokens_observed: attempt.total_tokens_observed ?? null,
        })),
        quality_scope_budget: parsePolicy(row).formal_review.scope_budget,
        quality_scope_budget_usage: state.quality_scope_budget_usage ?? null,
        quality_scope_budget_stop_reason: state.quality_scope_budget_stop_reason ?? null,
        findings: state.findings,
        repair_map: state.repair_map,
        finding_closures: state.finding_closures,
        review_receipts: state.review_receipts,
        decisive_attempt_role: state.decisive_attempt_role,
        decisive_attempt_ref: state.decisive_attempt_ref,
        selected_stage_route: state.selected_stage_route,
        route_evidence_refs: state.route_evidence_refs,
        route_recommendations: state.route_recommendations,
        route_quality_debt_refs: state.route_quality_debt_refs,
        blocked_reason: state.blocked_reason,
        hard_stop_class: state.hard_stop_class ?? null,
        typed_blocker_refs: [...(state.typed_blocker_refs ?? [])],
        human_gate_refs: [...(state.human_gate_refs ?? [])],
        source_attempt_ref: state.source_attempt_ref ?? null,
      },
    };
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE stage_quality_cycles
      SET state_json = ?, current_attempt_ref = NULL, updated_at = ?
      WHERE quality_cycle_id = ?
    `).run(JSON.stringify(projected), now, state.quality_cycle_id);
    return inspectStageQualityCycle(db, state.quality_cycle_id);
  });
}
