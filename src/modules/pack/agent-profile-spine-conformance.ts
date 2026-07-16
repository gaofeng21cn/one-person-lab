import { isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

const TYPED_OBJECT_SPECS = [
  ['reference_design_packet', 'ReferenceDesignPacket'],
  ['transfer_map', 'TransferMap'],
  ['agent_pack_plan', 'AgentPackPlan'],
  ['design_admission_receipt', 'DesignAdmissionReceipt'],
  ['build_receipt', 'AgentBuildReceipt'],
] as const;

type TypedObjectField = (typeof TYPED_OBJECT_SPECS)[number][0];

export type SourceDerivedTypedObjects = Record<TypedObjectField, JsonRecord | null>;

function machineString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => (
    typeof entry === 'string' && entry.trim().length > 0
  )).map((entry) => entry.trim()))];
}

export function inspectSourceDerivedTypedObjectProjections(
  capabilityMap: unknown,
) {
  const blockers: string[] = [];
  const typedObjects = Object.fromEntries(
    TYPED_OBJECT_SPECS.map(([field]) => [field, null]),
  ) as SourceDerivedTypedObjects;
  for (const [field, objectName] of TYPED_OBJECT_SPECS) {
    const value = isRecord(capabilityMap) && isRecord(capabilityMap[field])
      ? capabilityMap[field]
      : null;
    if (!value) {
      blockers.push(`source_derived_design_typed_object_missing:${objectName}:capability_map`);
    }
    typedObjects[field] = value;
  }

  return { typedObjects, blockers };
}

function isSeedPacketRef(ref: string) {
  return ref.startsWith('expert-workflow-pattern:')
    || ref.startsWith('seed:')
    || ref.startsWith('seed-pattern:')
    || ref.includes('/seed/');
}

export function validateReferenceSourcePacketPolicy(
  declaredSourceRefs: string[],
  packet: JsonRecord | null,
  plannedStages: JsonRecord[],
  stages: JsonRecord[],
) {
  if (!packet) {
    return [];
  }
  const blockers: string[] = [];
  const packetSourceRefs = uniqueStrings(packet.reference_source_refs);
  const patternPacketRefs = uniqueStrings(packet.reference_design_pattern_packet_refs);
  const userPacketRefs = patternPacketRefs.filter((ref) => !isSeedPacketRef(ref));
  const designOrigin = isRecord(packet.design_origin) ? packet.design_origin : null;
  const activePatterns = Array.isArray(packet.transferable_design_patterns)
    ? packet.transferable_design_patterns.filter(isRecord)
    : [];
  const dispositions = Array.isArray(packet.pattern_dispositions)
    ? packet.pattern_dispositions.filter(isRecord)
    : [];
  const sameDeclaredSources = packetSourceRefs.length === declaredSourceRefs.length
    && declaredSourceRefs.every((ref) => packetSourceRefs.includes(ref));

  if (!sameDeclaredSources) {
    blockers.push('source_derived_design_reference_source_projection_mismatch');
  }
  if (declaredSourceRefs.length !== userPacketRefs.length) {
    blockers.push(
      `source_derived_design_reference_source_packet_cardinality_mismatch:${declaredSourceRefs.length}:${userPacketRefs.length}`,
    );
  }
  if (declaredSourceRefs.length > 0 && patternPacketRefs[0] && isSeedPacketRef(patternPacketRefs[0])) {
    blockers.push(`source_derived_design_seed_packet_cannot_be_primary:${patternPacketRefs[0]}`);
  }
  if (declaredSourceRefs.length > 0 && (
    designOrigin?.origin_kind !== 'user_supplied_reference_design'
    || designOrigin?.seed_library_role !== 'secondary_context_only'
  )) {
    blockers.push('source_derived_design_user_source_origin_invalid');
  }
  for (const pattern of activePatterns) {
    const patternRef = machineString(pattern.source_pattern_ref) ?? 'missing-pattern-ref';
    if (declaredSourceRefs.length > 0 && pattern.pattern_origin !== 'user_typed_pattern_packet') {
      blockers.push(`source_derived_design_active_pattern_origin_invalid:${patternRef}`);
    }
  }
  for (const disposition of dispositions) {
    const patternRef = machineString(disposition.pattern_ref) ?? 'missing-pattern-ref';
    if (
      declaredSourceRefs.length > 0
      && isSeedPacketRef(patternRef)
      && disposition.disposition !== 'adapt'
      && disposition.disposition !== 'reject'
    ) {
      blockers.push(`source_derived_design_seed_disposition_invalid:${patternRef}`);
    }
  }

  const expandedStages = new Map<string, string>();
  for (const plannedStage of plannedStages) {
    const stageId = machineString(plannedStage.stage_id);
    const sourcePatternRef = machineString(plannedStage.source_pattern_ref);
    if (stageId && sourcePatternRef && isSeedPacketRef(sourcePatternRef)) {
      expandedStages.set(stageId, sourcePatternRef);
    }
  }
  for (const stage of stages) {
    const stageId = machineString(stage.stage_id);
    const seedRef = uniqueStrings(stage.stage_pattern_source_refs).find(isSeedPacketRef);
    if (stageId && seedRef) {
      expandedStages.set(stageId, seedRef);
    }
  }
  if (declaredSourceRefs.length > 0 && userPacketRefs.length > 0) {
    for (const [stageId, seedRef] of expandedStages) {
      blockers.push(`source_derived_design_seed_packet_expands_active_stage_graph:${stageId}:${seedRef}`);
    }
  }

  return blockers;
}
