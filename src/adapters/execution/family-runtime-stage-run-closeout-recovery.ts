import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  claimStageRunRecoveryStart,
  findStageRunLaunch,
  recordStageRunClosed,
  recordStageRunRecoveryStartFailure,
  recordStageRunTemporalRecoveryStart,
} from './family-runtime-stage-run-launch-registry.ts';
import {
  listStageAttemptCloseouts,
  reconcilePersistedStageReviewReceipt,
} from './family-runtime-stage-attempt-ledger.ts';
import { materializeOplRevisionTransport } from './family-runtime-revision-intake.ts';
import {
  ingestStageAttemptCloseout,
  inspectStageAttempt,
} from './family-runtime-stage-attempts.ts';
import {
  inspectStageQualityCycle,
  projectTemporalStageRunQualityCycle,
} from './family-runtime-stage-quality-cycle.ts';
import type {
  TemporalStageRunAttemptSummary,
  TemporalStageRunWorkflowState,
} from './family-runtime-temporal-stage-run.ts';
import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';
import {
  recoverFrameworkRawArtifactForAttempt,
} from './family-runtime-codex-stage-runner-parts/raw-artifact-identity-verification.ts';
import {
  normalizeCodexTransportCloseoutCandidate,
  parseTerminalJsonRecordFromCodexMessages,
} from './family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts';
import {
  hydrateReferencedStageAttemptCloseout,
} from './family-runtime-codex-stage-runner-parts/referenced-closeout-hydration.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import {
  verifyStageQualityCloseoutArtifactIdentity,
} from './family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import type { StageRouteRecommendation } from '../../authority/stages/stage-quality-route-selection.ts';
import {
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageReviewReceipt,
} from '../../authority/stages/stage-quality-cycle.ts';

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

function canonicalArtifactRef(value: unknown, attempt: JsonRecord) {
  const ref = requireString(value, 'artifact_refs[]');
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return ref;
  }
  const executionScope = record(attempt.execution_scope);
  const root = requireString(
    executionScope.canonical_work_item_root,
    'attempt.execution_scope.canonical_work_item_root',
  );
  const resolved = path.resolve(root, ref);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered artifact ref escapes the canonical work-item root.',
      { artifact_ref: ref, canonical_work_item_root: root },
    );
  }
  return pathToFileURL(resolved).href;
}

function artifactIdentity(candidate: JsonRecord, attempt: JsonRecord) {
  const routeImpact = record(candidate.route_impact);
  const quality = record(routeImpact.stage_quality_cycle);
  let refs = Array.isArray(quality.artifact_refs) ? quality.artifact_refs : [];
  let hashes = Array.isArray(quality.artifact_hashes) ? quality.artifact_hashes : [];
  // A typed closeout may already be accepted and carry the producer artifact
  // identity in its refs-only metadata, without duplicating a quality envelope.
  // Treat that persisted identity as the recovery input, then let the normal
  // byte verification path issue fresh transport receipts.
  if (refs.length === 0 && hashes.length === 0) {
    const closeoutRefs = Array.isArray(candidate.closeout_refs) ? candidate.closeout_refs : [];
    const metadata = Array.isArray(candidate.closeout_ref_metadata)
      ? candidate.closeout_ref_metadata.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
      : [];
    const pairs = closeoutRefs.map((ref) => {
      const entry = metadata.find((item) => item.ref === ref || item.uri === ref);
      return {
        ref,
        hash: entry?.sha256,
      };
    });
    if (pairs.length > 0 && pairs.every((pair) => typeof pair.ref === 'string' && typeof pair.hash === 'string')) {
      refs = pairs.map((pair) => pair.ref);
      hashes = pairs.map((pair) => pair.hash);
    }
  }
  if (refs.length === 0 && hashes.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered closeout does not contain producer artifact identity.',
      { failure_code: 'stage_quality_attempt_without_consumable_artifact' },
    );
  }
  if (refs.length !== hashes.length || refs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered producer artifact refs and hashes must have equal non-zero cardinality.',
      { artifact_ref_count: refs.length, artifact_hash_count: hashes.length },
    );
  }
  return {
    artifact_refs: refs.map((ref) => canonicalArtifactRef(ref, attempt)),
    artifact_hashes: hashes.map((hash) => canonicalHash(hash, 'artifact_hashes[]')),
  };
}

function canonicalCloseoutMetadata(
  packet: JsonRecord,
  identity: { artifact_refs: string[]; artifact_hashes: string[] },
) {
  const existing = Array.isArray(packet.closeout_ref_metadata)
    ? packet.closeout_ref_metadata.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  const metadata = existing.map((entry) => ({ ...entry }));
  const used = new Set<number>();
  for (let index = 0; index < identity.artifact_refs.length; index += 1) {
    const ref = identity.artifact_refs[index];
    const hash = identity.artifact_hashes[index];
    let metadataIndex = metadata.findIndex((entry, candidateIndex) => (
      !used.has(candidateIndex)
      && (entry.ref === ref || entry.uri === ref)
    ));
    if (metadataIndex < 0) {
      metadataIndex = metadata.findIndex((entry, candidateIndex) => (
        !used.has(candidateIndex)
        && typeof entry.sha256 === 'string'
        && canonicalHash(entry.sha256, 'closeout_ref_metadata.sha256') === hash
      ));
    }
    if (metadataIndex < 0) {
      metadata.push({ ref_kind: 'artifact', kind: 'stage_artifact', ref, sha256: hash });
      metadataIndex = metadata.length - 1;
    } else {
      metadata[metadataIndex] = {
        ...metadata[metadataIndex],
        ref,
        sha256: hash,
      };
    }
    used.add(metadataIndex);
  }
  return metadata;
}

function readLatestCloseout(db: DatabaseSync, stageAttemptId: string) {
  const closeouts = listStageAttemptCloseouts(db, stageAttemptId);
  const latest = closeouts.at(-1);
  if (!latest || !latest.packet) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt has no persisted closeout to recover.', {
      failure_code: 'persisted_stage_attempt_closeout_not_found',
      stage_attempt_id: stageAttemptId,
    });
  }
  return latest;
}

function parseRawOutput(rawOutputRef: string, input: {
  attempt: JsonRecord;
  latestCloseoutPacket: JsonRecord;
}) {
  let filePath: string;
  try {
    filePath = fileURLToPath(rawOutputRef);
  } catch {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output ref is not a local file URL.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
    });
  }
  let bytes: string;
  try {
    bytes = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output bytes could not be read.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = parseJsonText(bytes);
  } catch (error) {
    // Codex may return a readable conclusion around one terminal JSON object.
    // Recovery is byte-bound to the immutable raw artifact, so select only the
    // single JSON object embedded in that same artifact; never rewrite it or
    // infer fields from the surrounding prose.
    parsed = parseTerminalJsonRecordFromCodexMessages([bytes]);
    if (!parsed) {
      // The Attempt runner may already have accepted a typed closeout through
      // protocol_closeout_resume while the immutable raw artifact remains the
      // producer's earlier readable summary. In that case the persisted
      // closeout is already byte- and Attempt-bound by ingest, so it is the
      // narrow recovery source of truth. Referenced-packet hydration remains
      // available when the persisted packet intentionally carries only that
      // reference.
      const persistedMetadata = Array.isArray(input.latestCloseoutPacket.closeout_ref_metadata)
        ? input.latestCloseoutPacket.closeout_ref_metadata
        : [];
      const referencedPacketMetadata = persistedMetadata.filter((entry) => (
        record(entry).kind === 'stage_attempt_closeout_packet'
      ));
      const persistedCloseout = normalizeTypedStageCloseoutPacket({
        ...input.latestCloseoutPacket,
        // Keep the accepted typed closeout's artifact metadata when it does
        // not reference another packet. For a referenced packet, retain the
        // existing isolation rule and hydrate that packet separately.
        closeout_ref_metadata: referencedPacketMetadata.length > 0
          ? referencedPacketMetadata
          : persistedMetadata,
      });
      const hydrated = hydrateReferencedStageAttemptCloseout({
        resumedCloseout: persistedCloseout,
        // The persisted transport packet already contains OPL-added artifact
        // identities, while the referenced packet is the producer-owned body.
        // Re-verify the reference and Attempt identity without treating those
        // transport additions as a conflicting second semantic assertion.
        resumedCandidate: null,
        attempt: input.attempt,
        workspaceRoot: requireString(
          record(input.attempt.execution_scope).workspace_root,
          'attempt.execution_scope.workspace_root',
        ),
      });
      if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
        parsed = hydrated.closeoutPacket;
      } else if (hydrated.status === 'not_applicable' && persistedCloseout) {
        parsed = persistedCloseout;
      }
    }
    if (!parsed) {
      throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output is not valid JSON.', {
        failure_code: 'raw_executor_output_recovery_failed',
        artifact_ref: rawOutputRef,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output must be a JSON object.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
    });
  }
  const pointer = parsed as JsonRecord;
  const quality = record(record(pointer.route_impact).stage_quality_cycle);
  const recoveryRefs = Array.isArray(quality.artifact_refs) && quality.artifact_refs.length > 0
    ? quality.artifact_refs
    : Array.isArray(pointer.closeout_refs) ? pointer.closeout_refs : [];
  // A persisted transport projection may replace the raw envelope's authority
  // marker. Its verified raw bytes still cannot become a domain repair artifact.
  if (recoveryRefs.length > 0 && recoveryRefs.every((ref) => ref === rawOutputRef)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovery requires a domain closeout; raw executor progress is not a domain artifact. Recover the existing domain-artifact Attempt or obtain its owner closeout.',
      {
        failure_code: 'stage_run_recovery_domain_closeout_required',
        stage_attempt_id: input.attempt.stage_attempt_id,
        next_owner: input.attempt.domain_id,
        artifact_ref: rawOutputRef,
        raw_artifact_is_domain_evidence: false,
      },
    );
  }
  const typedReferenceEntries = [
    ...(Array.isArray(pointer.closeout_refs) ? pointer.closeout_refs : []),
    ...(Array.isArray(pointer.closeout_ref_metadata) ? pointer.closeout_ref_metadata : []),
  ];
  if (typedReferenceEntries.some((entry) => record(entry).kind === 'stage_attempt_closeout_packet')) {
    // A typed terminal envelope may carry only exact packet metadata. Its
    // successful JSON parse does not make it the producer artifact body.
    // Normalization includes metadata refs in the transport refs; hydration
    // then verifies the same bytes and Attempt identity as ordinary closeout.
    const hydrated = hydrateReferencedStageAttemptCloseout({
      resumedCloseout: normalizeTypedStageCloseoutPacket(pointer),
      resumedCandidate: pointer,
      attempt: input.attempt,
      workspaceRoot: requireString(
        record(input.attempt.execution_scope).workspace_root,
        'attempt.execution_scope.workspace_root',
      ),
    });
    if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
      return hydrated.closeoutPacket as JsonRecord;
    }
  }
  if ('closeout_packet_ref' in pointer || 'closeout_packet_sha256' in pointer) {
    const packetRef = requireString(pointer.closeout_packet_ref, 'closeout_packet_ref');
    const hydrated = hydrateReferencedStageAttemptCloseout({
      resumedCloseout: normalizeTypedStageCloseoutPacket({
        ...input.latestCloseoutPacket,
        closeout_refs: [...new Set([
          ...(Array.isArray(input.latestCloseoutPacket.closeout_refs) ? input.latestCloseoutPacket.closeout_refs : []),
          packetRef,
        ])],
        closeout_ref_metadata: [{
          kind: 'stage_attempt_closeout_packet',
          ref: packetRef,
          sha256: canonicalHash(pointer.closeout_packet_sha256, 'closeout_packet_sha256'),
        }],
      }),
      resumedCandidate: null,
      attempt: input.attempt,
      workspaceRoot: requireString(
        record(input.attempt.execution_scope).workspace_root,
        'attempt.execution_scope.workspace_root',
      ),
    });
    if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
      return hydrated.closeoutPacket as JsonRecord;
    }
  }
  return parsed as JsonRecord;
}

export function parseRawOutputForCloseoutRecovery(rawOutputRef: string, input: {
  attempt: JsonRecord;
  latestCloseoutPacket: JsonRecord;
}) {
  return parseRawOutput(rawOutputRef, input);
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

function attemptSummaryFromPersisted(
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

function priorAttemptSummaries(
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


function findingsFromPriorQualityLineage(
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

function buildRecoveryWorkflowState(input: {
  db: DatabaseSync;
  attempt: JsonRecord;
  launch: JsonRecord;
  cycle: JsonRecord;
  artifactRefs: string[];
  artifactHashes: string[];
  artifactIdentityReceiptRefs: string[];
  routeRecommendation: JsonRecord | null;
}) {
  const currentState = record(input.cycle.state);
  const stageRunId = requireString(input.launch.stage_run_id, 'launch.stage_run_id');
  const workflowId = requireString(input.launch.workflow_id, 'launch.workflow_id');
  const qualityCycleId = requireString(input.cycle.quality_cycle_id, 'cycle.quality_cycle_id');
  const attemptRef = `opl://stage_attempts/${requireString(input.attempt.stage_attempt_id, 'attempt.stage_attempt_id')}`;
  const summary = attemptSummaryFromPersisted(input.attempt, {
    artifact_refs: input.artifactRefs,
    artifact_hashes: input.artifactHashes,
    artifact_identity_receipt_refs: input.artifactIdentityReceiptRefs,
  });
  const summaries = priorAttemptSummaries(input.db, currentState, input.attempt, {
    artifact_refs: input.artifactRefs,
    artifact_hashes: input.artifactHashes,
    artifact_identity_receipt_refs: input.artifactIdentityReceiptRefs,
  });
  const findings = findingsFromPriorQualityLineage(input.db, currentState, input.attempt);
  const resumeAfterRepairer = summary.attempt_role === 'repairer';
  return {
    surface_kind: 'temporal_stage_run_query' as const,
    provider_kind: 'temporal' as const,
    stage_run_id: stageRunId,
    workflow_id: workflowId,
    scope_kind: input.launch.scope_kind as TemporalStageRunWorkflowState['scope_kind'],
    execution_scope: input.launch.execution_scope as TemporalStageRunWorkflowState['execution_scope'],
    quality_cycle_id: qualityCycleId,
    domain_id: requireString(input.launch.domain_id, 'launch.domain_id') as TemporalStageRunWorkflowState['domain_id'],
    stage_id: requireString(input.launch.stage_id, 'launch.stage_id'),
    status: 'running' as const,
    current_role: summary.attempt_role === 'reviewer' ? 'repairer' as const
      : resumeAfterRepairer ? 're_reviewer' as const : 'reviewer' as const,
    repair_rounds_used: resumeAfterRepairer
      ? summary.quality_round_index
      : Number(currentState.repair_rounds_used ?? 0),
    max_repair_rounds: Number(currentState.max_repair_rounds ?? 3),
    route_budget: currentState.route_budget as TemporalStageRunWorkflowState['route_budget'],
    quality_scope_budget: currentState.quality_scope_budget as TemporalStageRunWorkflowState['quality_scope_budget'],
    quality_scope_budget_usage: currentState.quality_scope_budget_usage as TemporalStageRunWorkflowState['quality_scope_budget_usage'],
    quality_scope_budget_stop_reason: null,
    attempts: summaries,
    findings,
    repair_map: Array.isArray(currentState.repair_map) ? currentState.repair_map : [],
    finding_closures: Array.isArray(currentState.finding_closures) ? currentState.finding_closures : [],
    review_receipts: Array.isArray(record(currentState.controller_readback).review_receipts)
      ? record(currentState.controller_readback).review_receipts as StageReviewReceipt[]
      : [],
    artifact_refs: input.artifactRefs,
    artifact_hashes: input.artifactHashes,
    artifact_identity_receipt_refs: input.artifactIdentityReceiptRefs,
    quality_debt_refs: Array.isArray(currentState.quality_debt_refs) ? currentState.quality_debt_refs : [],
    route_quality_debt_refs: Array.isArray(currentState.route_quality_debt_refs) ? currentState.route_quality_debt_refs : [],
    decisive_attempt_role: null,
    decisive_attempt_ref: null,
    selected_stage_route: null,
    route_evidence_refs: Array.isArray(currentState.route_evidence_refs) ? currentState.route_evidence_refs : [],
    route_recommendations: input.routeRecommendation
      ? [{
          attempt_ref: attemptRef,
          attempt_role: summary.attempt_role,
          quality_round_index: summary.quality_round_index,
          recommendation: input.routeRecommendation as StageRouteRecommendation,
        }]
      : [],
    next_stage_run_launch: null,
    blocked_reason: null,
    hard_stop_class: null,
    typed_blocker_refs: [],
    human_gate_refs: [],
    source_attempt_ref: attemptRef,
    sqlite_projection: { status: 'synced' as const, error: null },
    started_at: typeof currentState.started_at === 'string' ? currentState.started_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    authority_boundary: {
      opl: 'durable_quality_loop_orchestration_and_refs_transport_only' as const,
      domain: 'review_findings_repair_artifact_and_quality_verdict_owner' as const,
      provider_completion_is_domain_ready: false as const,
    },
  } satisfies TemporalStageRunWorkflowState;
}

export async function recoverStageRunCloseoutProjection(db: DatabaseSync, input: {
  stageRunId: string;
  stageAttemptId: string;
}, options: {
  startWorkflow: (input: TemporalStageRunWorkflowInput) => Promise<Record<string, unknown>>;
  describeWorkflow?: (input: TemporalStageRunWorkflowInput) => Promise<Record<string, unknown>>;
  retryTerminalRecovery?: boolean;
  now?: () => Date;
  startLeaseMs?: number;
}) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  if (attempt.stage_run_id !== input.stageRunId) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery Attempt does not belong to the requested StageRun.', {
      failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
      stage_run_id: input.stageRunId,
      stage_attempt_id: input.stageAttemptId,
      attempt_stage_run_id: attempt.stage_run_id,
    });
  }
  const launch = findStageRunLaunch(db, input.stageRunId);
  if (!launch) {
    throw new FrameworkContractError('contract_shape_invalid', 'Requested StageRun is not registered in the launch authority.', {
      failure_code: 'stage_quality_cycle_stage_run_unregistered',
      stage_run_id: input.stageRunId,
    });
  }
  if (
    launch.domain_id !== attempt.domain_id
    || launch.stage_id !== attempt.stage_id
    || launch.execution_scope?.scope_digest !== attempt.execution_scope?.scope_digest
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery StageRun and Attempt execution lineage does not match.', {
      failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
      stage_run_id: input.stageRunId,
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const cycle = inspectStageQualityCycle(db, attempt.quality_cycle_id ?? `quality-cycle:${input.stageRunId}`);
  let effectiveLaunch = launch;
  if (launch.launch_status === 'started') {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery requires fresh Temporal observation before reconciling a missing terminal registry projection.',
        { failure_code: 'stage_run_recovery_terminal_observation_missing' },
      );
    }
    const observed = record(await options.describeWorkflow(
      launch.stage_run_input as TemporalStageRunWorkflowInput,
    ));
    const observedStatus = requireString(
      observed.workflow_status,
      'workflow_observation.workflow_status',
    ).toUpperCase();
    const observedRunId = requireString(
      observed.first_execution_run_id,
      'workflow_observation.first_execution_run_id',
    );
    const originalRunId = requireString(
      record(launch.temporal_start_receipt).first_execution_run_id,
      'launch.temporal_start_receipt.first_execution_run_id',
    );
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== launch.workflow_id
      || observedRunId !== originalRunId
      || !['COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT'].includes(observedStatus)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery found no matching terminal Temporal execution to reconcile.',
        {
          failure_code: 'stage_run_recovery_terminal_observation_mismatch',
          stage_run_id: input.stageRunId,
          observed_workflow_status: observedStatus,
          observed_run_id: observedRunId,
          expected_run_id: originalRunId,
        },
      );
    }
    effectiveLaunch = recordStageRunClosed(db, {
      stageRunId: input.stageRunId,
      terminalStatus: String(record(cycle.state).status ?? observedStatus).toLowerCase(),
    })!;
  }
  const beforeCount = Number((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE stage_run_id = ?').get(input.stageRunId) as { count: number }).count);
  const recoveryAfterReviewer = attempt.attempt_role === 'reviewer';
  const acceptedReview = recoveryAfterReviewer
    ? reconcilePersistedStageReviewReceipt(db, input.stageAttemptId)
    : null;
  if (acceptedReview && (attempt.status !== 'completed'
    || attempt.closeout_receipt_status !== 'accepted_typed_closeout'
    || acceptedReview.verdict !== 'repair_required'
    || record(record(attempt.route_impact).stage_route_recommendation).decision_kind !== 'repeat')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Reviewer recovery requires an accepted same-stage repair-required verdict.', {
      failure_code: 'stage_run_recovery_review_lineage_invalid',
    });
  }
  const artifactAttempt = acceptedReview
    ? inspectStageAttempt(db, acceptedReview.producer_attempt_ref.replace(/^opl:\/\/stage_attempts\//, ''))
    : attempt;
  const rawArtifact = acceptedReview ? null : recoverFrameworkRawArtifactForAttempt(attempt);
  if (!acceptedReview && !rawArtifact) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bound raw executor output is unavailable for recovery.', {
      failure_code: 'raw_executor_output_recovery_failed',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const latestCloseout = readLatestCloseout(db, artifactAttempt.stage_attempt_id);
  const rawCandidate = acceptedReview ? record(latestCloseout.packet) : normalizeCodexTransportCloseoutCandidate(parseRawOutput(rawArtifact!.output_ref, {
    attempt,
    latestCloseoutPacket: record(latestCloseout.packet),
  }));
  const rawArtifactAfterRead = acceptedReview ? null : recoverFrameworkRawArtifactForAttempt(attempt);
  if (!acceptedReview && (!rawArtifactAfterRead || canonicalJsonText(rawArtifactAfterRead) !== canonicalJsonText(rawArtifact))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Raw executor output changed during recovery.', {
      failure_code: 'raw_executor_output_recovery_failed',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const identity = artifactIdentity(rawCandidate, artifactAttempt);
  const persistedPacket = record(latestCloseout.packet);
  const rawRouteImpact = record(rawCandidate.route_impact);
  const mergedRouteImpact = {
    ...record(persistedPacket.route_impact),
    ...rawRouteImpact,
    stage_quality_cycle: {
      ...record(record(persistedPacket.route_impact).stage_quality_cycle),
      ...record(rawRouteImpact.stage_quality_cycle),
      artifact_refs: identity.artifact_refs,
      artifact_hashes: identity.artifact_hashes,
    },
  };
  const correctedInput = {
    ...persistedPacket,
    closeout_id: stableId('closeout-recovery', [input.stageAttemptId, identity.artifact_refs, identity.artifact_hashes]),
    closeout_refs: [...new Set([
      ...(Array.isArray(persistedPacket.closeout_refs) ? persistedPacket.closeout_refs : []),
      ...identity.artifact_refs,
    ])],
    closeout_ref_metadata: canonicalCloseoutMetadata(persistedPacket, identity),
    route_impact: mergedRouteImpact,
  };
  const verified = verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket: normalizeTypedStageCloseoutPacket(correctedInput),
    attempt: artifactAttempt,
    workspaceRoot: requireString(attempt.execution_scope?.workspace_root, 'attempt.execution_scope.workspace_root'),
  });
  if (!verified) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery closeout did not produce a typed producer packet.', {
      failure_code: 'stage_quality_attempt_without_consumable_artifact',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const verifiedRouteImpact = record(verified.route_impact);
  const verifiedQuality = record(verifiedRouteImpact.stage_quality_cycle);
  const receiptRefs = identity.artifact_refs.map((ref) => {
    const entry = (verified.closeout_ref_metadata ?? []).find((candidate) => candidate.ref === ref || candidate.uri === ref);
    return requireString(entry?.artifact_identity_receipt_ref, 'closeout_ref_metadata.artifact_identity_receipt_ref');
  });
  const correctedPacket = normalizeTypedStageCloseoutPacket({
    ...verified,
    route_impact: {
      ...verifiedRouteImpact,
      stage_quality_cycle: {
        ...verifiedQuality,
        artifact_identity_receipt_refs: receiptRefs,
      },
    },
  });
  const ingested = acceptedReview ? { closeout: { closeout_id: latestCloseout.closeout_id, idempotent_noop: true } } : ingestStageAttemptCloseout(db, {
    stageAttemptId: input.stageAttemptId,
    packet: correctedPacket,
  });
  const updatedAttempt = inspectStageAttempt(db, input.stageAttemptId);
  const recoveryState = buildRecoveryWorkflowState({
    db,
    attempt: updatedAttempt,
    launch: effectiveLaunch,
    cycle,
    artifactRefs: identity.artifact_refs,
    artifactHashes: identity.artifact_hashes,
    artifactIdentityReceiptRefs: receiptRefs,
    routeRecommendation: acceptedReview ? record(record(attempt.route_impact).stage_route_recommendation)
      : record(verifiedRouteImpact.stage_route_recommendation).decision_kind
      ? record(verifiedRouteImpact.stage_route_recommendation)
      : null,
  });
  const recoveredSummary = recoveryState.attempts.find((entry) => entry.stage_attempt_id === input.stageAttemptId)!;
  const recoveryAfterRepairer = recoveredSummary.attempt_role === 'repairer';
  if (acceptedReview) {
    recoveryState.findings = validateStageQualityFindings(record(record(attempt.route_impact).stage_quality_cycle).findings as StageQualityFinding[]);
    recoveryState.review_receipts = [{ ...acceptedReview, revision_transport: materializeOplRevisionTransport(acceptedReview) }];
    recoveryState.repair_map = [];
    const used = db.prepare("SELECT MAX(quality_round_index) AS used FROM stage_attempts WHERE stage_run_id = ? AND attempt_role = 'repairer'")
      .get(input.stageRunId) as { used: number | null };
    recoveryState.repair_rounds_used = Math.max(recoveryState.repair_rounds_used, used.used ?? 0);
  }
  if (recoveryAfterRepairer) {
    if (!Array.isArray(verifiedQuality.repair_map)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Repairer recovery requires its owner-provided repair map.', {
        failure_code: 'stage_run_recovery_repair_map_missing',
      });
    }
    recoveryState.repair_map = validateStageQualityRepairMap({
      findings: recoveryState.findings,
      repairMap: verifiedQuality.repair_map as StageQualityRepairMapEntry[],
    });
  }
  const projected = projectTemporalStageRunQualityCycle(db, recoveryState);
  const projectionAttemptCount = Number((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE stage_run_id = ?').get(input.stageRunId) as { count: number }).count);
  const findings = validateStageQualityFindings(
    recoveryState.findings,
  );
  const repairMap = recoveryAfterRepairer
    ? recoveryState.repair_map
    : [];
  const priorReviewReceipts = Array.isArray(record(record(cycle.state).controller_readback).review_receipts)
    ? record(record(cycle.state).controller_readback).review_receipts as StageReviewReceipt[]
    : [];
  const recoveryId = stableId('stage-run-recovery', [
    input.stageRunId,
    recoveryState.quality_cycle_id,
    input.stageAttemptId,
    identity.artifact_refs,
    identity.artifact_hashes,
    receiptRefs,
  ]);
  const artifactProducerAttemptRef = `opl://stage_attempts/${artifactAttempt.stage_attempt_id}`;
  const reviewInputSnapshotMaterializationRequest = acceptedReview ? null :
    verifiedQuality.review_input_snapshot_materialization_request ?? null;
  const recoveryResume = {
    surface_kind: 'opl_stage_run_recovery_resume' as const,
    version: 'opl-stage-run-recovery-resume.v1' as const,
    recovery_id: recoveryId,
    quality_cycle_id: recoveryState.quality_cycle_id,
    ...(acceptedReview
      ? {
          resume_after_role: 'reviewer' as const,
          reviewer_attempt_ref: `opl://stage_attempts/${input.stageAttemptId}`,
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          artifact_producer_attempt_summary: attemptSummaryFromPersisted(artifactAttempt, {
            ...identity, artifact_identity_receipt_refs: receiptRefs,
          }),
          prior_attempt_summaries: recoveryState.attempts,
          findings,
          review_receipts: recoveryState.review_receipts,
          repair_rounds_used: recoveryState.repair_rounds_used,
          quality_debt_refs: recoveryState.quality_debt_refs,
          route_quality_debt_refs: recoveryState.route_quality_debt_refs,
        }
      : recoveryAfterRepairer
      ? {
          resume_after_role: 'repairer' as const,
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          artifact_producer_attempt_summary: recoveredSummary,
          prior_attempt_summaries: recoveryState.attempts,
          findings,
          repair_map: repairMap,
          review_receipts: priorReviewReceipts,
          repair_rounds_used: recoveredSummary.quality_round_index,
          quality_debt_refs: recoveryState.quality_debt_refs,
          route_quality_debt_refs: recoveryState.route_quality_debt_refs,
        }
      : {
          producer_attempt_ref: artifactProducerAttemptRef,
          producer_attempt_summary: recoveredSummary,
        }),
    artifact_refs: identity.artifact_refs,
    artifact_hashes: identity.artifact_hashes,
    artifact_identity_receipt_refs: receiptRefs,
    route_recommendations: recoveryState.route_recommendations,
    review_input_snapshot_materialization_request: reviewInputSnapshotMaterializationRequest,
  };
  const workflowInput: TemporalStageRunWorkflowInput = {
    ...(effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput),
    recovery_resume: recoveryResume,
  };
  let terminalRetry: {
    recoveryRunId: string;
    workflowStatus: string;
    observationReceipt?: Record<string, unknown>;
  } | undefined;
  const launchReceipt = record(effectiveLaunch.temporal_start_receipt);
  const persistedRecoveryRun = Array.isArray(launchReceipt.recovery_runs)
    && launchReceipt.recovery_runs.length > 0
    && launchReceipt.recovery_runs[0]
    && typeof launchReceipt.recovery_runs[0] === 'object'
    && !Array.isArray(launchReceipt.recovery_runs[0])
    ? record(launchReceipt.recovery_runs[0])
    : null;
  const persistedRecoveryResume = persistedRecoveryRun
    ? persistedRecoveryRun.recovery_resume as TemporalStageRunWorkflowInput['recovery_resume']
    : null;
  const recoveryResumeChanged = persistedRecoveryResume
    ? canonicalJsonText(persistedRecoveryResume) !== canonicalJsonText(recoveryResume)
    : false;
  if (
    options.retryTerminalRecovery === true
    && persistedRecoveryRun
    && recoveryResumeChanged
  ) {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry requires fresh Temporal workflow observation.',
        { failure_code: 'stage_run_recovery_terminal_retry_observation_missing' },
      );
    }
    if (!persistedRecoveryResume) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery resume update requires the prior recovery resume.',
        { failure_code: 'stage_run_recovery_prior_identity_missing' },
      );
    }
    const observed = record(await options.describeWorkflow({
      ...(effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput),
      recovery_resume: persistedRecoveryResume,
    }));
    const persistedReceipt = record(persistedRecoveryRun.temporal_start_receipt);
    const persistedRunId = typeof persistedReceipt.recovery_run_id === 'string'
      ? persistedReceipt.recovery_run_id.trim()
      : null;
    const observedRunId = requireString(observed.first_execution_run_id, 'workflow_observation.first_execution_run_id');
    const observedStatus = requireString(observed.workflow_status, 'workflow_observation.workflow_status');
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== workflowInput.workflow_id
      || observed.recovery_id !== persistedRecoveryRun.recovery_id
      || (persistedRunId !== null && observedRunId !== persistedRunId)
      || ![
        'COMPLETED',
        'FAILED',
        'CANCELED',
        'CANCELLED',
        'TERMINATED',
        'TIMED_OUT',
      ].includes(observedStatus.toUpperCase())
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery identity replacement requires the prior Temporal Run to be terminal.',
        {
          failure_code: 'stage_run_recovery_terminal_retry_identity_mismatch',
          stage_run_id: input.stageRunId,
          prior_recovery_id: persistedRecoveryRun.recovery_id,
          persisted_recovery_run_id: persistedRunId,
          observed_recovery_id: typeof observed.recovery_id === 'string' ? observed.recovery_id : null,
          observed_recovery_run_id: observedRunId,
          observed_workflow_status: observedStatus,
        },
      );
    }
    terminalRetry = {
      recoveryRunId: observedRunId,
      workflowStatus: observedStatus,
      observationReceipt: observed,
    };
  }
  let claim = claimStageRunRecoveryStart(db, {
    workflowInput,
    now: options.now?.(),
    leaseMs: options.startLeaseMs,
    terminalRetry,
  });
  const baseReceipt = {
    surface_kind: 'opl_stage_run_closeout_recovery',
    version: 'opl-stage-run-closeout-recovery.v2',
    recovery_id: recoveryId,
    stage_run_id: input.stageRunId,
    stage_attempt_id: input.stageAttemptId,
    previous_closeout_id: latestCloseout.closeout_id,
    corrected_closeout_id: ingested.closeout.closeout_id,
    corrected_closeout_idempotent_noop: ingested.closeout.idempotent_noop,
    artifact_refs: identity.artifact_refs,
    artifact_hashes: identity.artifact_hashes,
    artifact_identity_receipt_refs: receiptRefs,
    stage_run_launch_truth: {
      launch_status: effectiveLaunch.launch_status,
      terminal_status: effectiveLaunch.terminal_status,
    },
    quality_cycle_projection: projected,
    formal_review_required: true,
    attempt_count_before: beforeCount,
    attempt_count_after_projection: projectionAttemptCount,
    quality_budget_consumed_by_recovery: false,
    new_stage_run_created: false,
    authority_boundary: {
      opl: 'same_stage_run_durable_quality_loop_recovery_only',
      domain: 'formal_review_owner_and_quality_verdict_authority_unchanged',
    },
  };
  if (
    !claim.claimed
    && claim.claim_status === 'started'
    && options.retryTerminalRecovery === true
  ) {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry requires fresh Temporal workflow observation.',
        { failure_code: 'stage_run_recovery_terminal_retry_observation_missing' },
      );
    }
    const observed = record(await options.describeWorkflow(workflowInput));
    const persistedRunId = requireString(
      claim.recovery_run.temporal_start_receipt?.recovery_run_id,
      'recovery_run.temporal_start_receipt.recovery_run_id',
    );
    const observedRunId = requireString(observed.first_execution_run_id, 'workflow_observation.first_execution_run_id');
    const observedStatus = requireString(observed.workflow_status, 'workflow_observation.workflow_status');
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== workflowInput.workflow_id
      || observed.recovery_id !== recoveryId
      || observedRunId !== persistedRunId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry observation does not match the persisted recovery Run.',
        {
          failure_code: 'stage_run_recovery_terminal_retry_identity_mismatch',
          recovery_id: recoveryId,
          persisted_recovery_run_id: persistedRunId,
          observed_recovery_run_id: observedRunId,
          observed_workflow_status: observedStatus,
        },
      );
    }
    if (![
      'COMPLETED',
      'FAILED',
      'CANCELED',
      'CANCELLED',
      'TERMINATED',
      'TIMED_OUT',
    ].includes(observedStatus.toUpperCase())) {
      return {
        ...baseReceipt,
        recovery_status: 'durable_resume_already_started',
        idempotent_replay: true,
        durable_resume: claim.recovery_run,
        temporal_start: claim.recovery_run.temporal_start_receipt,
        durable_controller_running: observedStatus.toUpperCase().endsWith('RUNNING'),
        formal_review_dispatched: true,
      };
    }
    claim = claimStageRunRecoveryStart(db, {
      workflowInput,
      now: options.now?.(),
      leaseMs: options.startLeaseMs,
      terminalRetry: {
        recoveryRunId: observedRunId,
        workflowStatus: observedStatus,
      },
    });
  }
  if (!claim.claimed || !claim.claim_token) {
    const temporalStart = claim.recovery_run.temporal_start_receipt;
    return {
      ...baseReceipt,
      recovery_status: claim.claim_status === 'started'
        ? 'durable_resume_already_started'
        : 'durable_resume_starting',
      idempotent_replay: true,
      durable_resume: claim.recovery_run,
      temporal_start: temporalStart,
      durable_controller_running: temporalStart
        ? String(temporalStart.workflow_status).toUpperCase().endsWith('RUNNING')
        : false,
      formal_review_dispatched: claim.claim_status === 'started',
    };
  }
  try {
    const temporalStart = await options.startWorkflow(workflowInput);
    const recorded = recordStageRunTemporalRecoveryStart(db, {
      stageRunId: input.stageRunId,
      recoveryId,
      temporalStartReceipt: temporalStart,
      claimToken: claim.claim_token,
      now: options.now?.(),
    });
    const producerAttemptCount = Number((db.prepare(`
      SELECT COUNT(*) AS count FROM stage_attempts
      WHERE stage_run_id = ? AND attempt_role = 'producer'
    `).get(input.stageRunId) as { count: number }).count);
    return {
      ...baseReceipt,
      recovery_status: 'durable_resume_started',
      idempotent_replay: false,
      durable_resume: recorded.recovery_run,
      temporal_start: temporalStart,
      durable_controller_running: String(temporalStart.workflow_status).toUpperCase().endsWith('RUNNING'),
      formal_review_dispatched: true,
      producer_attempt_count: producerAttemptCount,
    };
  } catch (error) {
    recordStageRunRecoveryStartFailure(db, {
      stageRunId: input.stageRunId,
      recoveryId,
      claimToken: claim.claim_token,
      error,
      now: options.now?.(),
    });
    throw error;
  }
}
