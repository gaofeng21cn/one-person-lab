import type { DatabaseSync } from 'node:sqlite';

import { isRecord } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function canonicalArtifactHashes(value: unknown) {
  return stringList(value).map((hash) => {
    const match = hash.match(/^(?:sha256:)?([a-f0-9]{64})$/i);
    return match ? `sha256:${match[1]!.toLowerCase()}` : hash;
  });
}

function record(value: unknown) {
  return isRecord(value) ? value : null;
}

function parsedState(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = parseJsonText(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parsedRecord(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = parseJsonText(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reconcile a recoverable local quality-cycle projection into a StageRun query.
 *
 * Temporal remains the provider/lifecycle authority and is returned verbatim in
 * `provider_live_state`. A recovered local artifact projection can make the
 * StageRun eligible for durable resume, but it cannot claim that a controller or
 * reviewer is running before Temporal exposes that execution.
 */
export function projectRecoveredStageRunQuery(
  db: DatabaseSync,
  providerState: JsonRecord,
) {
  const workflowId = typeof providerState.workflow_id === 'string'
    ? providerState.workflow_id.trim()
    : '';
  if (!workflowId) return providerState;

  const launch = db.prepare(`
    SELECT stage_run_id, workflow_id, domain_id, stage_id
    FROM stage_run_launches
    WHERE workflow_id = ?
  `).get(workflowId) as JsonRecord | undefined;
  if (!launch || launch.workflow_id !== workflowId || typeof launch.stage_run_id !== 'string') {
    return providerState;
  }

  const providerBlocked = providerState.status === 'blocked'
    && providerState.blocked_reason === 'stage_quality_attempt_without_consumable_artifact';
  if (!providerBlocked) return providerState;

  const cycle = db.prepare(`
    SELECT quality_cycle_id, stage_run_id, domain_id, stage_id, state_json
    FROM stage_quality_cycles
    WHERE stage_run_id = ?
    ORDER BY updated_at DESC, quality_cycle_id DESC
    LIMIT 1
  `).get(launch.stage_run_id) as JsonRecord | undefined;
  if (!cycle || cycle.stage_run_id !== launch.stage_run_id) return providerState;

  const state = parsedState(cycle.state_json);
  if (!state || state.status !== 'awaiting_review' || state.current_role !== 'reviewer') {
    return providerState;
  }
  const controllerReadback = record(state.controller_readback);
  if (!controllerReadback || controllerReadback.workflow_id !== workflowId) return providerState;

  const artifactRefs = stringList(state.selected_artifact_refs);
  const artifactHashes = canonicalArtifactHashes(controllerReadback.artifact_hashes);
  const receiptRefs = stringList(controllerReadback.artifact_identity_receipt_refs);
  if (
    artifactRefs.length === 0
    || artifactRefs.length !== artifactHashes.length
    || artifactRefs.length !== receiptRefs.length
  ) {
    return providerState;
  }
  const attempts = Array.isArray(controllerReadback.attempts)
    ? controllerReadback.attempts.filter((entry): entry is JsonRecord => isRecord(entry))
    : [];
  const producerSummary = attempts.find((attempt) => (
    attempt.attempt_role === 'producer'
    && attempt.status === 'completed'
    && typeof attempt.stage_attempt_id === 'string'
    && attempt.stage_attempt_id.trim().length > 0
  ));
  if (!producerSummary) return providerState;
  const producerAttemptId = producerSummary.stage_attempt_id as string;
  const producerAttempt = db.prepare(`
    SELECT stage_attempt_id, stage_run_id, quality_cycle_id, domain_id, stage_id,
           attempt_role, status, route_impact_json
    FROM stage_attempts
    WHERE stage_attempt_id = ?
  `).get(producerAttemptId) as JsonRecord | undefined;
  if (
    !producerAttempt
    || producerAttempt.stage_run_id !== launch.stage_run_id
    || producerAttempt.quality_cycle_id !== cycle.quality_cycle_id
    || producerAttempt.domain_id !== launch.domain_id
    || producerAttempt.stage_id !== launch.stage_id
    || producerAttempt.attempt_role !== 'producer'
    || producerAttempt.status !== 'completed'
  ) {
    return providerState;
  }
  const routeImpact = parsedRecord(producerAttempt.route_impact_json);
  const attemptQuality = record(routeImpact?.stage_quality_cycle);
  if (!attemptQuality) return providerState;
  const attemptIdentity = {
    artifact_refs: stringList(attemptQuality.artifact_refs),
    artifact_hashes: canonicalArtifactHashes(attemptQuality.artifact_hashes),
    artifact_identity_receipt_refs: stringList(attemptQuality.artifact_identity_receipt_refs),
  };
  if (canonicalJsonText(attemptIdentity) !== canonicalJsonText({
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
    artifact_identity_receipt_refs: receiptRefs,
  })) return providerState;

  const providerLiveState = { ...providerState };
  return {
    ...providerState,
    // Keep the provider observation intact and explicit. Local recovery proves
    // resumability, not a live durable controller.
    provider_live_state: providerLiveState,
    readback_source: 'temporal_provider_plus_local_quality_cycle_projection',
    status: 'blocked',
    current_role: null,
    blocked_reason: 'stage_run_execution_resume_required',
    hard_stop_class: null,
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
    artifact_identity_receipt_refs: receiptRefs,
    recovery_ready: true,
    durable_controller_running: false,
    local_quality_cycle_projection: {
      surface_kind: 'opl_stage_quality_cycle_readback_projection',
      quality_cycle_id: cycle.quality_cycle_id,
      stage_run_id: launch.stage_run_id,
      workflow_id: workflowId,
      status: state.status,
      current_role: state.current_role,
      state,
      provider_live_status: providerState.status,
      provider_live_blocked_reason: providerState.blocked_reason ?? null,
      authority_boundary: {
        temporal_provider_live_state_preserved: true,
        opl_projection_is_not_temporal_history: true,
        durable_controller_running: false,
        formal_review_pending: true,
      },
    },
  };
}
