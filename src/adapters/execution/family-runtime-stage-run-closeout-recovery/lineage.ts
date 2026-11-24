import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  validateStageQualityFindings,
} from '../../../authority/stages/index.ts';
import {
  inspectStageAttempt,
} from '../family-runtime-stage-attempts.ts';
import type {
  TemporalStageRunAttemptSummary,
} from '../family-runtime-temporal-stage-run.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function canonicalHash(value: unknown, field: string) {
  const text = requireString(value, field).toLowerCase();
  const match = text.match(/^(?:sha256:)?([a-f0-9]{64})$/);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a canonical SHA-256 digest.`, { field });
  }
  return `sha256:${match[1]}`;
}

function totalTokens(attempt: JsonRecord) {
  const providerRun = record(attempt.provider_run);
  const costSummary = record(providerRun.cost_summary);
  const tokenUsage = record(costSummary.token_usage);
  return typeof tokenUsage.total_tokens === 'number' && Number.isSafeInteger(tokenUsage.total_tokens)
    ? tokenUsage.total_tokens
    : null;
}

function attemptArtifactIdentity(attempt: JsonRecord) {
  const quality = record(record(attempt.route_impact).stage_quality_cycle);
  const refs = Array.isArray(quality.artifact_refs) ? quality.artifact_refs as string[] : [];
  const hashes = Array.isArray(quality.artifact_hashes)
    ? (quality.artifact_hashes as string[]).map((hash) => canonicalHash(hash, 'artifact_hashes[]'))
    : [];
  const receipts = Array.isArray(quality.artifact_identity_receipt_refs)
    ? quality.artifact_identity_receipt_refs as string[]
    : [];
  return { artifact_refs: refs, artifact_hashes: hashes, artifact_identity_receipt_refs: receipts };
}

export function attemptSummaryFromPersisted(
  attempt: JsonRecord,
  artifactIdentity = attemptArtifactIdentity(attempt),
): TemporalStageRunAttemptSummary {
  const contextManifest = record(attempt.context_manifest);
  return {
    attempt_role: requireString(attempt.attempt_role, 'attempt.attempt_role') as TemporalStageRunAttemptSummary['attempt_role'],
    quality_round_index: Number(attempt.quality_round_index ?? 0),
    stage_attempt_id: requireString(attempt.stage_attempt_id, 'attempt.stage_attempt_id'),
    workflow_id: requireString(attempt.workflow_id, 'attempt.workflow_id'),
    execution_session_ref: typeof attempt.execution_session_ref === 'string'
      ? attempt.execution_session_ref
      : null,
    artifact_producer_attempt_ref: typeof contextManifest.artifact_producer_attempt_ref === 'string'
      ? contextManifest.artifact_producer_attempt_ref
      : null,
    status: requireString(attempt.status, 'attempt.status') as TemporalStageRunAttemptSummary['status'],
    ...artifactIdentity,
    total_tokens_observed: totalTokens(attempt),
  };
}

function summaryArtifactIdentity(db: DatabaseSync, attempt: JsonRecord) {
  const role = requireString(
    attempt.attempt_role,
    'attempt.attempt_role',
  ) as TemporalStageRunAttemptSummary['attempt_role'];
  if (role !== 'reviewer' && role !== 're_reviewer') {
    return attemptArtifactIdentity(attempt);
  }
  const artifactProducerAttemptRef = record(attempt.context_manifest).artifact_producer_attempt_ref;
  if (typeof artifactProducerAttemptRef !== 'string' || !artifactProducerAttemptRef.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered reviewer Attempt is missing its persisted artifact producer authority.',
      {
        failure_code: 'stage_run_recovery_repair_lineage_invalid',
        stage_attempt_id: attempt.stage_attempt_id ?? null,
      },
    );
  }
  const artifactProducerAttemptId = artifactProducerAttemptRef
    .trim()
    .replace(/^opl:\/\/stage_attempts\//, '');
  if (!artifactProducerAttemptId || artifactProducerAttemptId === artifactProducerAttemptRef.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered reviewer artifact producer ref is invalid.',
      {
        failure_code: 'stage_run_recovery_repair_lineage_invalid',
        stage_attempt_id: attempt.stage_attempt_id ?? null,
        artifact_producer_attempt_ref: artifactProducerAttemptRef,
      },
    );
  }
  return attemptArtifactIdentity(inspectStageAttempt(db, artifactProducerAttemptId));
}

function selectedPriorAttemptIds(currentState: JsonRecord, recoveredAttemptId: string) {
  const attempts = Array.isArray(record(currentState.controller_readback).attempts)
    ? record(currentState.controller_readback).attempts as JsonRecord[]
    : [];
  const ids = attempts
    .map((entry) => typeof record(entry).stage_attempt_id === 'string'
      ? record(entry).stage_attempt_id as string
      : null)
    .filter((entry): entry is string => Boolean(entry));
  return ids.includes(recoveredAttemptId) ? ids.slice(0, ids.indexOf(recoveredAttemptId) + 1) : ids;
}

export function priorAttemptSummaries(
  db: DatabaseSync,
  currentState: JsonRecord,
  recoveredAttempt: JsonRecord,
  recoveredIdentity: {
    artifact_refs: string[];
    artifact_hashes: string[];
    artifact_identity_receipt_refs: string[];
  },
) {
  const recoveredAttemptId = requireString(recoveredAttempt.stage_attempt_id, 'attempt.stage_attempt_id');
  const priorIds = selectedPriorAttemptIds(currentState, recoveredAttemptId);
  if (recoveredAttempt.attempt_role === 'producer' && !priorIds.includes(recoveredAttemptId)) {
    return [attemptSummaryFromPersisted(recoveredAttempt, recoveredIdentity)];
  }
  if (!priorIds.includes(recoveredAttemptId)) {
    const expectedParentRef = typeof recoveredAttempt.parent_attempt_ref === 'string'
      ? recoveredAttempt.parent_attempt_ref
      : null;
    const parentIndex = expectedParentRef
      ? priorIds.indexOf(expectedParentRef.replace(/^opl:\/\/stage_attempts\//, ''))
      : -1;
    if (parentIndex < 0) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Recovered Attempt parent is absent from the last accepted StageRun quality lineage.',
        {
          failure_code: 'stage_run_recovery_repair_lineage_invalid',
          stage_attempt_id: recoveredAttemptId,
          parent_attempt_ref: expectedParentRef,
          prior_attempt_ids: priorIds,
        },
      );
    }
    priorIds.splice(parentIndex + 1, priorIds.length - parentIndex - 1, recoveredAttemptId);
  }
  return priorIds.map((stageAttemptId) => {
    const attempt = inspectStageAttempt(db, stageAttemptId);
    return attemptSummaryFromPersisted(
      attempt,
      stageAttemptId === recoveredAttemptId
        ? recoveredIdentity
        : summaryArtifactIdentity(db, attempt),
    );
  });
}

export function findingsFromPriorQualityLineage(
  db: DatabaseSync,
  currentState: JsonRecord,
  attempt: JsonRecord,
) {
  const projectedFindings = Array.isArray(currentState.findings)
    ? currentState.findings
    : [];
  if (projectedFindings.length > 0) {
    return validateStageQualityFindings(projectedFindings);
  }
  const parentRef = typeof attempt.parent_attempt_ref === 'string'
    ? attempt.parent_attempt_ref.trim()
    : '';
  const parentId = parentRef.replace(/^opl:\/\/stage_attempts\//, '');
  if (!parentId || parentId === parentRef) return [];
  const parentAttempt = inspectStageAttempt(db, parentId);
  const parentQuality = record(record(parentAttempt.route_impact).stage_quality_cycle);
  const findings = Array.isArray(parentQuality.findings) ? parentQuality.findings : [];
  return findings.length > 0 ? validateStageQualityFindings(findings) : [];
}
