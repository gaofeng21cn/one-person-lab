import crypto from 'node:crypto';

import {
  analyzeStageQualityRepairMap,
  normalizeStageQualityAttemptRole,
  stageQualityAttemptOutcomeFromEnvelope,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  validateStageQualityRepairObservations,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageQualityRepairObservation,
} from '../../../authority/stages/index.ts';
import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
  type TypedStageCloseoutPacket,
} from './closeout-normalization.ts';
import { isRecord, type JsonRecord } from './shared.ts';

export const STAGE_CLOSEOUT_NORMALIZATION_REASON = 'repair_map_non_required_over_coverage' as const;

export function stageCloseoutDigest(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value)).digest('hex')}`;
}

function qualityEnvelope(packet: TypedStageCloseoutPacket) {
  const routeImpact = isRecord(packet.route_impact) ? packet.route_impact : {};
  return isRecord(routeImpact.stage_quality_cycle) ? routeImpact.stage_quality_cycle : {};
}

function originalCloseoutWithId(packet: TypedStageCloseoutPacket) {
  return normalizeTypedStageCloseoutPacket({
    ...packet,
    closeout_id: packet.closeout_id ?? stableId('closeout', [
      packet.stage_attempt_id,
      packet.surface_kind,
      packet.closeout_refs,
    ]),
  });
}

// Receipt refs name OPL-owned transport identity. A declared envelope value is
// only a non-authoritative model echo of that identity, so the canonical list
// always comes from the verified closeout_ref_metadata. Missing or explicitly
// empty declarations are filled; a declared list must equal the verified list
// exactly; divergent, malformed or unverifiable declarations make the whole
// derivation decline (fail closed to the legacy strict path) so no live
// success can persist receipt identity that recovery would later reject.
function canonicalArtifactIdentityReceiptRefs(packet: TypedStageCloseoutPacket):
    { kind: 'inject'; refs: string[] } | { kind: 'keep' } | { kind: 'decline' } {
  const envelope = qualityEnvelope(packet);
  const declared = envelope.artifact_identity_receipt_refs;
  const artifactRefs = envelope.artifact_refs;
  if (!Array.isArray(artifactRefs) || artifactRefs.length === 0) {
    return declaredMissingOrEmpty(declared) ? { kind: 'keep' } : { kind: 'decline' };
  }
  const metadata = packet.closeout_ref_metadata ?? [];
  const receiptRefs = artifactRefs.map((artifactRef) => {
    if (typeof artifactRef !== 'string') return null;
    const entry = metadata.find((candidate) => candidate.ref === artifactRef || candidate.uri === artifactRef);
    return typeof entry?.artifact_identity_receipt_ref === 'string'
      && entry.artifact_identity_receipt_ref.length > 0
      ? entry.artifact_identity_receipt_ref
      : null;
  });
  const derivable = !receiptRefs.some((ref) => ref === null);
  if (declaredMissingOrEmpty(declared)) {
    return derivable ? { kind: 'inject', refs: receiptRefs as string[] } : { kind: 'keep' };
  }
  if (!Array.isArray(declared)
    || !declared.every((ref) => typeof ref === 'string' && ref.length > 0)
    || !derivable) {
    return { kind: 'decline' };
  }
  const equal = declared.length === receiptRefs.length
    && declared.every((ref, index) => ref === receiptRefs[index]);
  return equal ? { kind: 'inject', refs: receiptRefs as string[] } : { kind: 'decline' };
}

function declaredMissingOrEmpty(declared: unknown) {
  return declared === undefined || (Array.isArray(declared) && declared.length === 0);
}

function derivedPacketContentDigest(packet: TypedStageCloseoutPacket) {
  const { closeout_normalization: _lineage, ...content } = packet;
  return stageCloseoutDigest(content);
}

export function deriveNormalizedStageQualityCloseout(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
}) {
  if (input.attempt.attempt_role !== 'repairer' || !input.closeoutPacket) return null;
  if (input.closeoutPacket.closeout_normalization) return null;
  const admitted = validateCloseoutPacketForAttempt({
    closeoutPacket: input.closeoutPacket,
    attempt: input.attempt,
  });
  if (!admitted.closeoutPacket || admitted.rejection) return null;
  const originalCloseout = originalCloseoutWithId(admitted.closeoutPacket);
  const originalEnvelope = qualityEnvelope(originalCloseout);
  try {
    stageQualityAttemptOutcomeFromEnvelope({
      attemptRole: normalizeStageQualityAttemptRole(input.attempt.attempt_role),
      envelope: originalEnvelope,
    });
  } catch {
    return null;
  }
  if (originalEnvelope.repair_observations !== undefined
    && (!Array.isArray(originalEnvelope.repair_observations)
      || originalEnvelope.repair_observations.length > 0)) {
    return null;
  }

  let findings: StageQualityFinding[];
  let analysis: ReturnType<typeof analyzeStageQualityRepairMap>;
  try {
    findings = validateStageQualityFindings(originalEnvelope.findings as StageQualityFinding[]);
    analysis = analyzeStageQualityRepairMap({
      findings,
      repairMap: originalEnvelope.repair_map,
    });
  } catch {
    return null;
  }
  if (!analysis.correction_eligible || !Array.isArray(originalEnvelope.repair_map)) return null;

  const requiredIds = new Set(
    findings.filter((finding) => finding.required).map((finding) => finding.finding_id),
  );
  const originalEntries = originalEnvelope.repair_map as StageQualityRepairMapEntry[];
  const repairMap = originalEntries.filter((entry) => requiredIds.has(entry.finding_id));
  const repairObservations = originalEntries.filter((entry) => !requiredIds.has(entry.finding_id));
  // Validate without substituting normalized projections: exact-ref objects and every
  // additional entry field remain byte-for-byte canonical JSON equal to the original.
  try {
    validateStageQualityRepairMap({ findings, repairMap });
    validateStageQualityRepairObservations({
      findings,
      repairObservations: repairObservations as StageQualityRepairObservation[],
    });
  } catch {
    return null;
  }

  const originalCloseoutDigest = stageCloseoutDigest(originalCloseout);
  const originalRepairMapDigest = stageCloseoutDigest(originalEnvelope.repair_map);
  const derivedRepairMapDigest = stageCloseoutDigest(repairMap);
  const derivedRepairObservationsDigest = stageCloseoutDigest(repairObservations);
  const originalCloseoutId = originalCloseout.closeout_id!;
  const derivedCloseoutId = stableId('closeout_normalization', [
    originalCloseoutId,
    originalCloseoutDigest,
    derivedRepairMapDigest,
    derivedRepairObservationsDigest,
  ]);
  const artifactIdentityReceiptRefResolution = canonicalArtifactIdentityReceiptRefs(originalCloseout);
  if (artifactIdentityReceiptRefResolution.kind === 'decline') return null;
  const artifactIdentityReceiptRefs = artifactIdentityReceiptRefResolution.kind === 'inject'
    ? artifactIdentityReceiptRefResolution.refs
    : null;
  const derivedContent = normalizeTypedStageCloseoutPacket({
    ...originalCloseout,
    closeout_id: derivedCloseoutId,
    route_impact: {
      ...originalCloseout.route_impact,
      stage_quality_cycle: {
        ...originalEnvelope,
        repair_map: repairMap,
        repair_observations: repairObservations,
        ...(artifactIdentityReceiptRefs
          ? { artifact_identity_receipt_refs: artifactIdentityReceiptRefs }
          : {}),
      },
    },
  });
  const derivedCloseoutDigest = derivedPacketContentDigest(derivedContent);
  const derivedCloseout = normalizeTypedStageCloseoutPacket({
    ...derivedContent,
    closeout_normalization: {
      surface_kind: 'opl_stage_closeout_normalization_lineage',
      version: 'opl-stage-closeout-normalization-lineage.v1',
      status: 'normalized',
      derivation_kind: 'deterministic_repair_map_partition',
      reason: STAGE_CLOSEOUT_NORMALIZATION_REASON,
      original_closeout_id: originalCloseoutId,
      original_closeout_ref: `opl://stage_attempt_closeouts/${originalCloseoutId}`,
      original_closeout_sha256: originalCloseoutDigest,
      derived_closeout_id: derivedCloseoutId,
      derived_closeout_ref: `opl://stage_attempt_closeouts/${derivedCloseoutId}`,
      derived_closeout_sha256: derivedCloseoutDigest,
      original_repair_map_sha256: originalRepairMapDigest,
      derived_repair_map_sha256: derivedRepairMapDigest,
      derived_repair_observations_sha256: derivedRepairObservationsDigest,
      moved_finding_ids: repairObservations.map((entry) => entry.finding_id),
      original_closeout_packet: originalCloseout,
      authority_status: 'pending_unreviewed',
      review_requirement: 'fresh_re_review_required',
    },
  });
  return {
    findings,
    analysis,
    originalCloseout,
    derivedCloseout,
    originalCloseoutDigest,
    originalRepairMapDigest,
    derivedCloseoutDigest,
    derivedRepairMapDigest,
    derivedRepairObservationsDigest,
    movedFindingIds: repairObservations.map((entry) => entry.finding_id),
  };
}

export function requireCanonicalNormalizedStageQualityCloseout(input: {
  closeoutPacket: TypedStageCloseoutPacket;
  attempt: JsonRecord;
}) {
  const lineage = input.closeoutPacket.closeout_normalization;
  if (!lineage) return null;
  const original = isRecord(lineage.original_closeout_packet)
    ? normalizeTypedStageCloseoutPacket(lineage.original_closeout_packet)
    : null;
  const derived = original
    ? deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt: input.attempt })
    : null;
  if (!derived
    || canonicalJsonText(derived.derivedCloseout) !== canonicalJsonText(input.closeoutPacket)
    || derivedPacketContentDigest(input.closeoutPacket) !== lineage.derived_closeout_sha256) {
    return null;
  }
  return derived;
}
