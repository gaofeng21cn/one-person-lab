import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

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

function projectionSources(
  capabilityMap: unknown,
  stageControlPlane: unknown,
  stages: JsonRecord[],
) {
  return [
    { label: 'capability_map', payload: capabilityMap },
    { label: 'stage_control_plane', payload: stageControlPlane },
    ...stages.map((stage, index) => ({
      label: `stage:${machineString(stage.stage_id) ?? index}`,
      payload: stage,
    })),
  ];
}

export function inspectSourceDerivedTypedObjectProjections(
  capabilityMap: unknown,
  stageControlPlane: unknown,
  stages: JsonRecord[],
) {
  const blockers: string[] = [];
  const typedObjects = Object.fromEntries(
    TYPED_OBJECT_SPECS.map(([field]) => [field, null]),
  ) as SourceDerivedTypedObjects;
  const sources = projectionSources(capabilityMap, stageControlPlane, stages);

  for (const [field, objectName] of TYPED_OBJECT_SPECS) {
    let canonical: JsonRecord | null = null;
    for (const source of sources) {
      const value = isRecord(source.payload) && isRecord(source.payload[field])
        ? source.payload[field]
        : null;
      if (!value) {
        blockers.push(`source_derived_design_typed_object_projection_missing:${objectName}:${source.label}`);
        continue;
      }
      if (!canonical) {
        canonical = value;
      } else if (!isDeepStrictEqual(value, canonical)) {
        blockers.push(`source_derived_design_typed_object_projection_mismatch:${objectName}:${source.label}`);
      }
    }
    typedObjects[field] = canonical;
  }

  return { typedObjects, blockers };
}

function nestedRefStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(nestedRefStrings);
  }
  if (!isRecord(value)) {
    return [];
  }
  return [value.ref, value.path, value.file_ref, value.repo_path].flatMap(nestedRefStrings);
}

function repoFileRef(value: string): string | null {
  const withoutFragment = value.split('#', 1)[0].replace(/^\.\//, '');
  if (
    !withoutFragment
    || path.isAbsolute(withoutFragment)
    || withoutFragment.split('/').includes('..')
    || !withoutFragment.includes('/')
    || withoutFragment.split('/')[0].includes(':')
  ) {
    return null;
  }
  return path.normalize(withoutFragment);
}

function plannedFileRefs(agentPackPlan: JsonRecord | null) {
  if (!agentPackPlan) {
    return { fileRefs: [], invalidRefs: [] };
  }
  const topLevelRefs = Object.entries(agentPackPlan).flatMap(([field, value]) => {
    if (!/^planned_.+_refs$/.test(field) || field === 'planned_stage_refs') {
      return [];
    }
    return nestedRefStrings(value);
  });
  const stageRefs = Array.isArray(agentPackPlan.planned_stage_refs)
    ? agentPackPlan.planned_stage_refs.filter(isRecord).flatMap((stage) => [
        ...nestedRefStrings(stage.prompt_ref),
        ...nestedRefStrings(stage.stage_path),
        ...nestedRefStrings(stage.skill_ref),
        ...nestedRefStrings(stage.knowledge_refs),
        ...nestedRefStrings(stage.tool_refs),
        ...nestedRefStrings(stage.quality_gate_refs),
      ])
    : [];
  const rawRefs = [...topLevelRefs, ...stageRefs];
  const invalidRefs = rawRefs.filter((ref) => {
    const withoutFragment = ref.split('#', 1)[0];
    return path.isAbsolute(withoutFragment) || withoutFragment.split('/').includes('..');
  });
  return {
    fileRefs: [...new Set(rawRefs.map(repoFileRef).filter((entry): entry is string => entry !== null))],
    invalidRefs: [...new Set(invalidRefs)],
  };
}

export function validateBuildReceiptMaterialization(
  repoDir: string,
  agentPackPlan: JsonRecord | null,
  buildReceipt: JsonRecord | null,
) {
  const blockers: string[] = [];
  const { fileRefs, invalidRefs } = plannedFileRefs(agentPackPlan);
  const materialization = isRecord(buildReceipt?.materialization)
    ? buildReceipt.materialization
    : null;
  const digestEntries = Array.isArray(materialization?.materialized_file_digests)
    ? materialization.materialized_file_digests.filter(isRecord)
    : [];
  const digests = new Map<string, string>();

  for (const invalidRef of invalidRefs) {
    blockers.push(`source_derived_design_agent_pack_plan_invalid_planned_file_ref:${invalidRef}`);
  }
  if (agentPackPlan && fileRefs.length === 0) {
    blockers.push('source_derived_design_agent_pack_plan_missing_planned_file_refs');
  }

  for (const entry of digestEntries) {
    const rawRef = machineString(entry.ref);
    const digest = machineString(entry.sha256);
    const fileRef = rawRef ? repoFileRef(rawRef) : null;
    if (!rawRef || !fileRef || !digest || !/^[a-f0-9]{64}$/.test(digest)) {
      blockers.push(`source_derived_design_build_receipt_invalid_materialized_file_digest:${rawRef ?? 'missing-ref'}`);
      continue;
    }
    if (digests.has(fileRef)) {
      blockers.push(`source_derived_design_build_receipt_duplicate_materialized_file_digest:${fileRef}`);
      continue;
    }
    digests.set(fileRef, digest);
  }

  for (const fileRef of fileRefs) {
    if (!digests.has(fileRef)) {
      blockers.push(`source_derived_design_build_receipt_missing_planned_file_digest:${fileRef}`);
    }
  }
  const repoRoot = fs.realpathSync(repoDir);
  for (const [fileRef, expectedDigest] of digests) {
    const filePath = path.resolve(repoDir, fileRef);
    if (!filePath.startsWith(`${path.resolve(repoDir)}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      blockers.push(`source_derived_design_build_receipt_materialized_file_missing:${fileRef}`);
      continue;
    }
    const realFilePath = fs.realpathSync(filePath);
    if (!realFilePath.startsWith(`${repoRoot}${path.sep}`)) {
      blockers.push(`source_derived_design_build_receipt_materialized_file_outside_target_root:${fileRef}`);
      continue;
    }
    const actualDigest = createHash('sha256').update(fs.readFileSync(realFilePath)).digest('hex');
    if (actualDigest !== expectedDigest) {
      blockers.push(`source_derived_design_build_receipt_materialized_file_digest_mismatch:${fileRef}`);
    }
  }

  return blockers;
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
