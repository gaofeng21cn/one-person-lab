import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { TemporalStageRunWorkflowState } from './family-runtime-temporal.ts';
import { stageAttemptIdFromRef } from './family-runtime-stage-quality-cycle-persistence.ts';

export function persistedArtifactProducerAttemptRef(
  attempt: Record<string, unknown>,
  stageAttemptId: string,
) {
  const rawContextManifest = attempt.context_manifest_json;
  if (typeof rawContextManifest !== 'string' || !rawContextManifest.trim()) return null;
  let contextManifest: unknown;
  try {
    contextManifest = parseJsonText(rawContextManifest);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt context manifest is invalid JSON.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!contextManifest || typeof contextManifest !== 'object' || Array.isArray(contextManifest)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt context manifest must be an object.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  const producerRef = (contextManifest as Record<string, unknown>).artifact_producer_attempt_ref;
  if (producerRef === undefined || producerRef === null) return null;
  if (typeof producerRef !== 'string' || !producerRef.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt artifact producer ref is invalid.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  return producerRef.trim();
}

function projectedAttemptStatusFromPersisted(status: unknown) {
  if (status === 'queued') return 'registered';
  if (
    status === 'running'
    || status === 'checkpointed'
    || status === 'blocked'
    || status === 'human_gate'
    || status === 'completed'
    || status === 'failed'
  ) {
    return status;
  }
  return null;
}

export function requireProjectedAttemptSummaryMatchesPersisted(
  summary: TemporalStageRunWorkflowState['attempts'][number],
  attempt: Record<string, unknown>,
) {
  const persisted = {
    attempt_role: attempt.attempt_role ?? null,
    quality_round_index: attempt.quality_round_index ?? null,
    stage_attempt_id: attempt.stage_attempt_id ?? null,
    workflow_id: attempt.workflow_id ?? null,
    execution_session_ref: attempt.execution_session_ref ?? null,
    artifact_producer_attempt_ref: persistedArtifactProducerAttemptRef(
      attempt,
      summary.stage_attempt_id,
    ),
    status: projectedAttemptStatusFromPersisted(attempt.status),
  };
  const projected = {
    attempt_role: summary.attempt_role,
    quality_round_index: summary.quality_round_index,
    stage_attempt_id: summary.stage_attempt_id,
    workflow_id: summary.workflow_id,
    execution_session_ref: summary.execution_session_ref,
    artifact_producer_attempt_ref: summary.artifact_producer_attempt_ref,
    status: summary.status,
  };
  if (canonicalJsonText(persisted) !== canonicalJsonText(projected)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun Attempt summary does not match its durable StageAttempt.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: summary.stage_attempt_id,
        persisted,
        projected,
      },
    );
  }
}

export function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function persistedJsonRecord(value: unknown, input: {
  stageAttemptId: string;
  field: string;
}) {
  if (typeof value !== 'string' || !value.trim()) return {};
  let parsed: unknown;
  try {
    parsed = parseJsonText(value);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt JSON is invalid.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const parsedRecord = recordValue(parsed);
  if (!parsedRecord) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt JSON must contain an object.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
      },
    );
  }
  return parsedRecord;
}

export function exactStringArray(value: unknown, input: {
  stageAttemptId: string;
  field: string;
}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact identity must contain exact non-empty string arrays.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
      },
    );
  }
  return value.map((entry) => (entry as string).trim());
}

export function canonicalArtifactHash(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(?:sha256:)?([a-f0-9]{64})$/i);
  return match ? `sha256:${match[1]!.toLowerCase()}` : normalized;
}

const FRAMEWORK_PROGRESS_ENVELOPE_AUTHORITY_MARKERS = new Set<string>([
  'raw_executor_output_progress_envelope_only',
  'temporal_closeout_transport_projection_only',
  'provider_quality_debt_diagnostic_projection_only',
]);

/**
 * Mirrors the ledger classification in `closeoutReceiptStatusForPacket`: a
 * closeout is a framework progress envelope when its route impact is
 * framework-generated, or when its authority boundary declares one of the
 * framework envelope markers. Keeping the two in step is what makes the
 * durable readback agree with the Temporal projection after a transport
 * projection has re-issued the envelope.
 */
function isFrameworkProgressEnvelopePacket(packet: Record<string, unknown>) {
  if (recordValue(packet.route_impact)?.framework_generated_envelope === true) return true;
  const marker = recordValue(packet.authority_boundary)?.opl;
  return typeof marker === 'string' && FRAMEWORK_PROGRESS_ENVELOPE_AUTHORITY_MARKERS.has(marker);
}

function persistedAttemptOutputArtifactIdentity(
  db: DatabaseSync,
  attempt: Record<string, unknown>,
) {
  const stageAttemptId = String(attempt.stage_attempt_id ?? '');
  const routeImpact = persistedJsonRecord(attempt.route_impact_json, {
    stageAttemptId,
    field: 'route_impact_json',
  });
  const envelope = recordValue(routeImpact.stage_quality_cycle) ?? {};
  const closeoutRow = db.prepare(`
    SELECT packet_json FROM stage_attempt_closeouts
    WHERE stage_attempt_id = ?
    ORDER BY created_at DESC, closeout_id DESC
    LIMIT 1
  `).get(stageAttemptId) as { packet_json?: unknown } | undefined;
  const packet = persistedJsonRecord(closeoutRow?.packet_json, {
    stageAttemptId,
    field: 'stage_attempt_closeouts.packet_json',
  });
  const metadata = packet.closeout_ref_metadata;
  // The Temporal transport projection re-issues the same framework progress
  // envelope under a transport-only authority marker, so the raw executor
  // output identity has to be recognised from the envelope shape rather than
  // from a single runner-authored authority marker. The `raw_executor_output`
  // ref_kind filter below stays the actual safety guard.
  const rawMetadata = isFrameworkProgressEnvelopePacket(packet) && Array.isArray(metadata)
    ? metadata.map(recordValue).filter((entry) => entry?.ref_kind === 'raw_executor_output')
    : [];
  const artifactRefs = exactStringArray(envelope.artifact_refs ?? rawMetadata.map((entry) => entry?.ref ?? entry?.uri), {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_refs',
  });
  const artifactHashes = exactStringArray(envelope.artifact_hashes ?? rawMetadata.map((entry) => entry?.sha256), {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_hashes',
  }).map(canonicalArtifactHash);
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact refs and hashes must have exact cardinality.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  if (artifactRefs.length === 0) {
    return {
      artifact_refs: [],
      artifact_hashes: [],
      artifact_identity_receipt_refs: [],
    };
  }
  if (!Array.isArray(metadata)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact identity requires closeout receipt metadata.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  const artifactIdentityReceiptRefs = artifactRefs.map((artifactRef, index) => {
    const entry = metadata.map(recordValue).find((candidate) => (
      candidate
      && (candidate.ref === artifactRef || candidate.uri === artifactRef)
      && typeof candidate.sha256 === 'string'
      && canonicalArtifactHash(candidate.sha256) === artifactHashes[index]
    ));
    const receiptRef = entry?.artifact_identity_receipt_ref;
    if (typeof receiptRef !== 'string' || !receiptRef.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Persisted Stage quality artifact receipt metadata does not match its ref and hash.',
        {
          failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
          stage_attempt_id: stageAttemptId,
          artifact_ref: artifactRef,
        },
      );
    }
    return receiptRef.trim();
  });
  const declaredReceiptRefs = exactStringArray(envelope.artifact_identity_receipt_refs, {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_identity_receipt_refs',
  });
  if (
    declaredReceiptRefs.length > 0
    && canonicalJsonText(declaredReceiptRefs) !== canonicalJsonText(artifactIdentityReceiptRefs)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact receipt refs conflict with closeout metadata.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  return {
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
    artifact_identity_receipt_refs: artifactIdentityReceiptRefs,
  };
}

export function requireProjectedAttemptArtifactIdentityMatchesPersisted(input: {
  db: DatabaseSync;
  summary: TemporalStageRunWorkflowState['attempts'][number];
  attempt: Record<string, unknown>;
  attemptAuthorities: Map<string, Record<string, unknown>>;
}) {
  const artifactProducerAttemptRef = persistedArtifactProducerAttemptRef(
    input.attempt,
    input.summary.stage_attempt_id,
  );
  const artifactAuthority = (
    input.summary.attempt_role === 'reviewer' || input.summary.attempt_role === 're_reviewer'
  )
    ? artifactProducerAttemptRef
      ? input.attemptAuthorities.get(stageAttemptIdFromRef(artifactProducerAttemptRef))
      : null
    : input.attempt;
  if (!artifactAuthority) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun review summary is missing its durable artifact producer authority.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.summary.stage_attempt_id,
      },
    );
  }
  const persisted = persistedAttemptOutputArtifactIdentity(input.db, artifactAuthority);
  const projected = {
    artifact_refs: input.summary.artifact_refs,
    artifact_hashes: input.summary.artifact_hashes.map(canonicalArtifactHash),
    artifact_identity_receipt_refs: input.summary.artifact_identity_receipt_refs,
  };
  if (canonicalJsonText(persisted) !== canonicalJsonText(projected)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun Attempt artifact identity does not match durable closeout evidence.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.summary.stage_attempt_id,
        artifact_authority_attempt_id: artifactAuthority.stage_attempt_id,
        persisted,
        projected,
      },
    );
  }
}
