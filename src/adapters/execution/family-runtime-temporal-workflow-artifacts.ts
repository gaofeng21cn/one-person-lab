import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { TemporalStageAttemptWorkflowState } from './family-runtime-temporal.ts';
import {
  normalizeStageQualityArtifactIdentity,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  type StageQualityFinding,
  type StageQualityFindingClosure,
  type StageQualityRepairMapEntry,
} from '../../authority/stages/public/stage-quality-cycle.ts';
import { asRecord, asRecordList, requiredRecordList } from './family-runtime-temporal-workflow-values.ts';

export function qualityEnvelopeFromAttempt(state: TemporalStageAttemptWorkflowState) {
  const closeout = asRecord(state.closeout_packet);
  const routeImpact = asRecord(closeout.route_impact);
  return asRecord(routeImpact.stage_quality_cycle);
}

export function executionSessionRefFromAttemptState(state: TemporalStageAttemptWorkflowState) {
  for (let index = state.activity_events.length - 1; index >= 0; index -= 1) {
    const event = asRecord(state.activity_events[index]);
    if (event.activity_kind !== 'codex_stage_activity') continue;
    const progress = asRecord(event.progress_summary);
    if (typeof progress.execution_session_ref === 'string' && progress.execution_session_ref) {
      return progress.execution_session_ref;
    }
    if (typeof progress.thread_id === 'string' && progress.thread_id) {
      return `codex://threads/${progress.thread_id}`;
    }
  }
  return null;
}

export function qualityArtifactIdentity(
  state: TemporalStageAttemptWorkflowState,
  value: Record<string, unknown>,
  requireDeclaredArtifactIdentity: boolean,
  inputIdentity?: {
    artifactRefs: string[];
    artifactHashes: string[];
    artifactIdentityReceiptRefs: string[];
  },
  structuredReviewerIdentityFailure = false,
) {
  const sourceAttemptRef = `opl://stage_attempts/${state.stage_attempt_id}`;
  const declaredArtifactRefs = Array.isArray(value.artifact_refs) ? value.artifact_refs : [];
  const declaredArtifactHashes = Array.isArray(value.artifact_hashes) ? value.artifact_hashes : [];
  if (declaredArtifactRefs.length === 0 && declaredArtifactHashes.length === 0 && inputIdentity) {
    return inputIdentity;
  }
  const closeout = asRecord(state.closeout_packet);
  const closeoutAuthority = asRecord(closeout.authority_boundary);
  const legacyRawArtifactIdentity = !requireDeclaredArtifactIdentity
    && closeoutAuthority.opl === 'raw_executor_output_progress_envelope_only'
    ? asRecordList(closeout.closeout_ref_metadata)
      .filter((entry) => entry.ref_kind === 'raw_executor_output')
      .map((entry) => ({
        ref: typeof entry.ref === 'string' ? entry.ref : typeof entry.uri === 'string' ? entry.uri : null,
        hash: typeof entry.sha256 === 'string' ? entry.sha256 : null,
      }))
      .filter((entry): entry is { ref: string; hash: string } => Boolean(entry.ref && entry.hash))
    : [];
  const artifactIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: declaredArtifactRefs.length > 0
      ? declaredArtifactRefs
      : legacyRawArtifactIdentity.map((entry) => entry.ref),
    artifactHashes: declaredArtifactHashes.length > 0
      ? declaredArtifactHashes
      : legacyRawArtifactIdentity.map((entry) => entry.hash),
    allowEmpty: true,
  });
  const artifactRefs = artifactIdentity.artifact_refs;
  const artifactHashes = artifactIdentity.artifact_hashes;
  if (artifactRefs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality producer or repairer did not declare a consumable artifact identity in stage_quality_cycle.',
      {
        hard_stop_class: 'zero_consumable_artifact',
        blocked_reason: 'stage_quality_attempt_without_consumable_artifact',
        source_attempt_ref: sourceAttemptRef,
        artifact_ref_count: artifactRefs.length,
        artifact_hash_count: artifactHashes.length,
      },
    );
  }
  if (
    inputIdentity
    && (
      JSON.stringify(artifactRefs) !== JSON.stringify(inputIdentity.artifactRefs)
      || JSON.stringify(artifactHashes) !== JSON.stringify(inputIdentity.artifactHashes)
    )
  ) {
    if (structuredReviewerIdentityFailure) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Reviewer Attempt cannot replace the exact artifact identity it was asked to review.',
        {
          hard_stop_class: 'stale_or_mismatched_stage_identity',
          blocked_reason: 'reviewed_artifact_identity_mismatch',
          source_attempt_ref: sourceAttemptRef,
        },
      );
    }
    throw new Error('Reviewer Attempt cannot replace the exact artifact identity it was asked to review.');
  }
  if (inputIdentity) return inputIdentity;

  const metadata = asRecordList(closeout.closeout_ref_metadata);
  const receiptRefs = artifactRefs.map((artifactRef, index) => {
    const entry = metadata.find((candidate) => candidate.ref === artifactRef || candidate.uri === artifactRef);
    if (!entry || typeof entry.sha256 !== 'string' || entry.sha256 !== artifactHashes[index]) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Producer and repairer artifact identity must match transport-verified closeout_ref_metadata SHA receipts.',
        {
          hard_stop_class: 'stale_or_mismatched_stage_identity',
          blocked_reason: 'artifact_byte_identity_mismatch',
          source_attempt_ref: sourceAttemptRef,
          artifact_ref: artifactRef,
        },
      );
    }
    if (typeof entry.artifact_identity_receipt_ref !== 'string' || !entry.artifact_identity_receipt_ref.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Producer and repairer artifacts require a verified artifact identity receipt before formal Review.',
        {
          hard_stop_class: 'authority_boundary_violation',
          blocked_reason: 'artifact_identity_receipt_missing_authority_violation',
          source_attempt_ref: sourceAttemptRef,
          artifact_ref: artifactRef,
        },
      );
    }
    return entry.artifact_identity_receipt_ref.trim();
  });
  return {
    artifactRefs,
    artifactHashes,
    artifactIdentityReceiptRefs: receiptRefs,
  };
}

export function findingList(value: unknown, field = 'findings') {
  return validateStageQualityFindings(requiredRecordList(value, field) as StageQualityFinding[]);
}

export function repairMapList(value: unknown, findings: StageQualityFinding[]) {
  return validateStageQualityRepairMap({
    findings,
    repairMap: asRecordList(value) as StageQualityRepairMapEntry[],
  });
}

export function findingClosureList(value: unknown) {
  return requiredRecordList(value, 'finding_closures') as StageQualityFindingClosure[];
}

