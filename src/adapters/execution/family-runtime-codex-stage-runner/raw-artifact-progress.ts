import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';
import {
  assertRawRootIdentity,
  rawArtifactError,
  rawArtifactMetadata,
  rawExecutorOutputLocation,
  rawPhysicalLineageContinuation,
  rawProvenanceError,
  rawRootIdentity,
  readStableRawStateFile,
} from './raw-artifact-lineage.ts';
import { isRecord, type JsonRecord } from './shared.ts';

type PersistedIdentityReceipt = {
  receiptRef: string;
  rollback: () => void;
};

type PendingIdentityReceipt = {
  commit: () => PersistedIdentityReceipt;
};

export type VerifiedFrameworkRawProgress = {
  artifactRef: string;
  artifactSha256: string;
  observed: {
    sha256: string;
    sizeBytes: number;
    bytes: null;
  };
  finalizeIdentityReceipt: (prepare: () => PendingIdentityReceipt) => string;
};

function exactObjectFields(value: JsonRecord, expected: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function exactStringList(value: unknown, expected: string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
    ? value as string[]
    : null;
}

function requireCanonicalRawProgressPacket(input: {
  closeoutPacket: TypedStageCloseoutPacket;
  attempt: JsonRecord;
  routeImpact: JsonRecord;
  artifactRef: string;
  metadataRef: string;
}) {
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stageRunId = optionalString(input.attempt.stage_run_id);
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const executionScope = isRecord(input.attempt.execution_scope) ? input.attempt.execution_scope : null;
  const normalizationFindings = stringList(input.routeImpact.normalization_findings);
  const expectedQualityDebtRefs = normalizationFindings?.map(
    (finding) => 'opl://stage-attempts/'
      + encodeURIComponent(attemptId)
      + '/quality-debt/'
      + encodeURIComponent(finding),
  ) ?? [];
  const expectedPacketFields = [
    'authority_boundary',
    'closeout_ref_metadata',
    'closeout_refs',
    'consumed_memory_refs',
    'consumed_refs',
    'domain_ready_verdict',
    'next_owner',
    'rejected_writes',
    'route_impact',
    'stage_attempt_id',
    'surface_kind',
    'writeback_receipt_refs',
    ...(stageRunId ? ['stage_run_id'] : []),
    ...(idempotencyKey ? ['idempotency_key'] : []),
    ...(executionScope ? ['execution_scope', 'scope_digest'] : []),
  ];
  const expectedRouteFields = [
    'artifact_metadata_refs',
    'consumable_artifact_refs',
    'framework_generated_envelope',
    'negative_or_partial_output_counts_as_progress',
    'next_stage_may_start',
    'normalization_findings',
    'quality_debt_refs',
    'route_back_may_target_any_declared_stage',
    'route_back_selection_owner',
    'transition_outcome',
  ];
  const authority = input.closeoutPacket.authority_boundary;
  const expectedAuthorityFields = [
    'can_authorize_quality_verdict',
    'can_create_owner_receipt',
    'can_create_typed_blocker',
    'can_write_domain_truth',
    'domain',
    'opl',
    'provider_completion_is_domain_ready',
  ];
  const consumedRefs = stringList(input.closeoutPacket.consumed_refs);
  if (
    !exactObjectFields(input.closeoutPacket as unknown as JsonRecord, expectedPacketFields)
    || !exactObjectFields(input.routeImpact, expectedRouteFields)
    || !exactObjectFields(authority, expectedAuthorityFields)
    || input.closeoutPacket.surface_kind !== 'stage_attempt_closeout_packet'
    || input.closeoutPacket.stage_attempt_id !== attemptId
    || input.closeoutPacket.stage_run_id !== (stageRunId ?? undefined)
    || input.closeoutPacket.idempotency_key !== (idempotencyKey ?? undefined)
    || (executionScope
      ? JSON.stringify(input.closeoutPacket.execution_scope) !== JSON.stringify(executionScope)
        || input.closeoutPacket.scope_digest !== executionScope.scope_digest
      : input.closeoutPacket.execution_scope !== undefined || input.closeoutPacket.scope_digest !== undefined)
    || !consumedRefs
    || consumedRefs.length !== 1
    || !exactStringList(input.closeoutPacket.consumed_memory_refs, [])
    || !exactStringList(input.closeoutPacket.writeback_receipt_refs, [])
    || input.closeoutPacket.rejected_writes.length !== 0
    || input.closeoutPacket.next_owner !== (optionalString(input.attempt.domain_id) ?? null)
    || input.closeoutPacket.domain_ready_verdict !== 'completed_with_quality_debt'
    || input.routeImpact.transition_outcome !== 'completed_with_quality_debt'
    || !exactStringList(input.routeImpact.consumable_artifact_refs, [input.artifactRef])
    || !exactStringList(input.routeImpact.artifact_metadata_refs, [input.metadataRef])
    || !normalizationFindings
    || !normalizationFindings.includes('typed_closeout_not_required_raw_artifact_advanced')
    || !exactStringList(input.routeImpact.quality_debt_refs, expectedQualityDebtRefs)
    || input.routeImpact.next_stage_may_start !== true
    || input.routeImpact.route_back_selection_owner !== 'codex_cli'
    || input.routeImpact.route_back_may_target_any_declared_stage !== true
    || input.routeImpact.negative_or_partial_output_counts_as_progress !== true
    || input.routeImpact.framework_generated_envelope !== true
    || authority.opl !== 'raw_executor_output_progress_envelope_only'
    || authority.domain !== 'truth_quality_route_back_and_artifact_authority_owner'
    || authority.can_write_domain_truth !== false
    || authority.can_create_owner_receipt !== false
    || authority.can_create_typed_blocker !== false
    || authority.can_authorize_quality_verdict !== false
    || authority.provider_completion_is_domain_ready !== false
  ) {
    throw rawArtifactError({
      message: 'Framework raw progress must exactly match the canonical runner-generated closeout shape.',
      blockedReason: 'raw_executor_output_semantic_authority_violation',
      artifactRef: input.artifactRef,
      details: {
        packet_fields: Object.keys(input.closeoutPacket).sort(),
        route_impact_fields: Object.keys(input.routeImpact).sort(),
        authority_boundary_fields: Object.keys(authority).sort(),
      },
    });
  }
}

export function verifyFrameworkRawProgressEnvelope(input: {
  closeoutPacket: TypedStageCloseoutPacket;
  attempt: JsonRecord;
  routeImpact: JsonRecord;
  closeoutMetadata: JsonRecord[];
}): VerifiedFrameworkRawProgress {
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const domainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const stageId = optionalString(input.attempt.stage_id) ?? 'unknown-stage';
  const semanticFields = [
    ...(Object.prototype.hasOwnProperty.call(input.routeImpact, 'stage_quality_cycle')
      ? ['route_impact.stage_quality_cycle']
      : []),
    ...(Object.prototype.hasOwnProperty.call(input.routeImpact, 'domain_output')
      ? ['route_impact.domain_output']
      : []),
    ...(input.closeoutPacket.domain_output ? ['domain_output'] : []),
  ];
  if (semanticFields.length > 0) {
    throw rawArtifactError({
      message: 'Framework raw executor output cannot assert Stage quality or domain output semantics.',
      blockedReason: 'raw_executor_output_semantic_authority_violation',
      artifactRef: input.closeoutPacket.closeout_refs[0] ?? 'missing',
      details: { forbidden_fields: semanticFields },
    });
  }
  const rawEntries = input.closeoutMetadata.filter(
    (entry) => optionalString(entry.ref_kind) === 'raw_executor_output',
  );
  const rawEntry = rawEntries[0];
  const artifactRef = optionalString(rawEntry?.ref) ?? optionalString(rawEntry?.uri) ?? 'missing';
  const rawHash = optionalString(rawEntry?.sha256);
  const rawSize = rawEntry?.size_bytes;
  const location = rawExecutorOutputLocation(attemptId);
  const expectedArtifactRef = pathToFileURL(location.outputPath).href;
  const expectedMetadataRef = pathToFileURL(location.metadataPath).href;
  const expectedRawEntryFields = ['ref', 'ref_kind', 'sha256', 'size_bytes'];
  if (
    input.closeoutPacket.surface_kind !== 'stage_attempt_closeout_packet'
    || input.closeoutPacket.stage_attempt_id !== attemptId
    || input.closeoutMetadata.length !== 1
    || rawEntries.length !== 1
    || JSON.stringify(Object.keys(rawEntry ?? {}).sort()) !== JSON.stringify(expectedRawEntryFields)
    || !exactStringList(input.closeoutPacket.closeout_refs, [artifactRef])
    || artifactRef !== expectedArtifactRef
    || typeof rawHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(rawHash)
    || typeof rawSize !== 'number'
    || !Number.isSafeInteger(rawSize)
    || rawSize < 0
    || input.routeImpact.framework_generated_envelope !== true
    || !exactStringList(input.routeImpact.consumable_artifact_refs, [artifactRef])
    || !exactStringList(input.routeImpact.artifact_metadata_refs, [expectedMetadataRef])
    || optionalString(input.closeoutPacket.authority_boundary.opl)
      !== 'raw_executor_output_progress_envelope_only'
    || optionalString(input.closeoutPacket.authority_boundary.domain)
      !== 'truth_quality_route_back_and_artifact_authority_owner'
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output exception requires one exact framework-bound ref, hash, size, and metadata lineage.',
      details: {
        expected_artifact_ref: expectedArtifactRef,
        expected_metadata_ref: expectedMetadataRef,
        closeout_ref_count: input.closeoutPacket.closeout_refs.length,
        closeout_metadata_count: input.closeoutMetadata.length,
        raw_metadata_count: rawEntries.length,
      },
    });
  }
  requireCanonicalRawProgressPacket({
    closeoutPacket: input.closeoutPacket,
    attempt: input.attempt,
    routeImpact: input.routeImpact,
    artifactRef,
    metadataRef: expectedMetadataRef,
  });
  const rootIdentity = rawRootIdentity({ location, artifactRef });
  const { provenance, physicalLineage } = rawArtifactMetadata({
    location, rootIdentity, artifactRef, attemptId, domainId, stageId,
  });
  if (
    provenance.sha256 !== rawHash
    || provenance.size_bytes !== rawSize
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output metadata does not exactly bind its framework-owned Attempt lineage.',
      details: { metadata_ref: expectedMetadataRef },
    });
  }
  rawPhysicalLineageContinuation({ location, artifactRef, expected: physicalLineage, actual: rootIdentity });
  const output = readStableRawStateFile({
    location,
    rootIdentity,
    filePath: location.outputPath,
    artifactRef,
  });
  assertRawRootIdentity({ location, artifactRef, rootIdentity });
  const observed = {
    sha256: output.sha256.slice('sha256:'.length),
    sizeBytes: output.byte_size,
    bytes: null,
  };
  if (observed.sha256 !== rawHash || observed.sizeBytes !== rawSize) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output bytes do not match their exact framework provenance metadata.',
      details: {
        declared_sha256: rawHash,
        observed_sha256: observed.sha256,
        declared_size_bytes: rawSize,
        observed_size_bytes: observed.sizeBytes,
      },
    });
  }
  const observeExpectedOutput = () => {
    const next = readStableRawStateFile({
      location,
      rootIdentity,
      filePath: location.outputPath,
      artifactRef,
    });
    assertRawRootIdentity({ location, artifactRef, rootIdentity });
    const nextSha256 = next.sha256.slice('sha256:'.length);
    if (nextSha256 !== rawHash || next.byte_size !== rawSize) {
      return rawProvenanceError({
        artifactRef,
        message: 'Raw executor output changed before its transport identity receipt was finalized.',
        details: {
          declared_sha256: rawHash,
          observed_sha256: nextSha256,
          declared_size_bytes: rawSize,
          observed_size_bytes: next.byte_size,
        },
      });
    }
  };
  return {
    artifactRef,
    artifactSha256: rawHash,
    observed,
    finalizeIdentityReceipt(prepare) {
      const pendingReceipt = prepare();
      observeExpectedOutput();
      const receipt = pendingReceipt.commit();
      try {
        observeExpectedOutput();
        return receipt.receiptRef;
      } catch (error) {
        receipt.rollback();
        throw error;
      }
    },
  };
}
