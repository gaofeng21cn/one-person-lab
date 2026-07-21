import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';

type JsonRecord = Record<string, unknown>;

const PROVIDER_PENDING_STATUSES = new Set(['created', 'pending', 'queued', 'scheduled']);

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase() ?? null;
}

function providerRunHasRunningEvidence(providerRun: JsonRecord) {
  const providerStatus = normalizedStatus(providerRun.provider_status);
  return providerStatus === 'running'
    || providerStatus === 'started'
    || providerStatus === 'checkpointed'
    || Boolean(stringValue(providerRun.last_heartbeat_at));
}

function providerRunStatusHasRunningEvidence(providerRun: JsonRecord) {
  return ['running', 'started', 'checkpointed'].includes(
    normalizedStatus(providerRun.provider_status) ?? '',
  );
}

function temporalQueryWorkflowStatus(temporalQuery: JsonRecord | null) {
  return normalizedStatus(temporalQuery?.workflow_status);
}

function temporalQueryStatus(temporalQuery: JsonRecord | null) {
  const query = isRecord(temporalQuery?.query) ? temporalQuery.query : null;
  return normalizedStatus(query?.status);
}

export function buildStageAttemptRuntimeCurrentness(input: {
  ledgerStatus: string;
  providerKind: string;
  providerRun: JsonRecord;
  temporalQuery?: JsonRecord | null;
}) {
  const providerStatus = normalizedStatus(input.providerRun.provider_status);
  const temporalWorkflowStatus = temporalQueryWorkflowStatus(input.temporalQuery ?? null);
  const temporalStateStatus = temporalQueryStatus(input.temporalQuery ?? null);
  const temporalHasRunningEvidence = temporalWorkflowStatus === 'running'
    || ['running', 'checkpointed'].includes(temporalStateStatus ?? '');
  const runningProofSources = [
    providerRunHasRunningEvidence(input.providerRun) ? 'provider_run' : null,
    temporalWorkflowStatus === 'running' ? 'temporal_workflow_visibility' : null,
    ['running', 'checkpointed'].includes(temporalStateStatus ?? '') ? 'temporal_workflow_query' : null,
  ].filter((source): source is string => Boolean(source));
  const staleRunningProjection =
    input.ledgerStatus === 'running'
    && input.providerKind === 'temporal'
    && runningProofSources.length === 0;
  const laggingRunningProjection =
    PROVIDER_PENDING_STATUSES.has(input.ledgerStatus)
    && input.providerKind === 'temporal'
    && (providerRunStatusHasRunningEvidence(input.providerRun) || temporalHasRunningEvidence);
  const running_proof_status = input.ledgerStatus === 'running' || laggingRunningProjection
    ? staleRunningProjection
      ? 'not_running'
      : 'running_confirmed'
    : 'not_applicable';
  const effectiveRuntimeStatus = laggingRunningProjection
    ? 'running'
    : staleRunningProjection
      ? 'not_running'
      : input.ledgerStatus;
  const projectionStatus = laggingRunningProjection
    ? 'ledger_lagging_projection'
    : staleRunningProjection
      ? 'stale_projection'
      : 'current_or_not_running_claim';
  const reason = laggingRunningProjection
    ? 'ledger_pending_while_provider_or_temporal_running'
    : staleRunningProjection
      ? 'ledger_running_without_provider_status_heartbeat_or_temporal_running_visibility'
      : null;
  return {
    surface_kind: 'stage_attempt_runtime_currentness',
    ledger_status: input.ledgerStatus,
    effective_runtime_status: effectiveRuntimeStatus,
    running_proof_status,
    projection_status: projectionStatus,
    reason,
    running_proof_sources: runningProofSources,
    observed_provider_status: providerStatus,
    observed_last_heartbeat_at: stringValue(input.providerRun.last_heartbeat_at),
    observed_temporal_workflow_status: temporalWorkflowStatus,
    observed_temporal_query_status: temporalStateStatus,
    authority_boundary: {
      opl: 'attempt_read_model_currentness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_provider_ledger: false,
      can_claim_domain_ready: false,
    },
  };
}
