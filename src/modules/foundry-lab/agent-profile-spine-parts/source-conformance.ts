import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import {
  buildStandardAgentRepoContractReadout,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from '../../pack/index.ts';
import {
  inspectSourceDerivedTypedObjectProjections,
  validateReferenceSourcePacketPolicy,
} from '../agent-profile-spine-conformance.ts';
import { validateReferenceBuildReceiptMaterialization } from '../reference-build-proof.ts';
import { SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS } from '../source-derived-agent-design-abi.ts';
import {
  AGENT_PACK_PLAN_REF_FIELDS,
  AGENT_PACK_PLAN_REQUIREMENT_FIELDS,
  BUILD_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  BUILD_RECEIPT_REF_FIELDS,
  BUILD_RECEIPT_REJECTED_PATTERN_FIELDS,
  BUILD_RECEIPT_REQUIREMENT_FIELDS,
  BUILD_RECEIPT_SOURCE_STAGE_FIELDS,
  capabilityEntries,
  collectDirectMachineFieldStrings,
  conformanceProfileFor,
  DESIGN_ADMISSION_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  DESIGN_ADMISSION_RECEIPT_REF_FIELDS,
  DESIGN_ADMISSION_RECEIPT_REJECTED_PATTERN_FIELDS,
  DESIGN_ADMISSION_RECEIPT_REQUIREMENT_FIELDS,
  DESIGN_ADMISSION_RECEIPT_SOURCE_STAGE_FIELDS,
  hasDirectMachineField,
  hasSourceDerivedRoute,
  includesProfileRef,
  matchesSourceDerivedProfileId,
  missingRequired,
  parseConformanceArgs,
  profileRequirements,
  REFERENCE_DESIGN_PACKET_REF_FIELDS,
  REFERENCE_DESIGN_PACKET_REQUIREMENT_FIELDS,
  REFERENCE_DESIGN_SOURCE_REF_FIELDS,
  selectedProfileRefs,
  stageEntries,
  STAGE_PATTERN_SOURCE_REF_FIELDS,
  TARGET_ONLY_REQUIREMENT_FIELDS,
  TRANSFER_MAP_REF_FIELDS,
  TRANSFER_MAP_REQUIREMENT_FIELDS,
  uniqueStrings,
} from './catalog-selection.ts';

type SourceWorkflowStep = {
  key: string;
  pattern_id: string;
  step_id: string;
  source_anchor_refs: string[];
};

function machineString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasTypedObjectIdentity(
  value: Record<string, unknown> | null,
  surfaceKind: string,
  version: string,
  refField: string,
) {
  return value?.surface_kind === surfaceKind
    && value.version === version
    && machineString(value[refField]) !== null;
}

function buildSourceDerivedTypedObjectFloor(
  repoDir: string,
  capabilityMap: unknown,
  stageEntries: Record<string, unknown>[],
  declaredReferenceSourceRefs: string[],
) {
  const projectionIntegrity = inspectSourceDerivedTypedObjectProjections(capabilityMap);
  const blockers = [...projectionIntegrity.blockers];
  const packet = projectionIntegrity.typedObjects.reference_design_packet;
  const transferMap = projectionIntegrity.typedObjects.transfer_map;
  const agentPackPlan = projectionIntegrity.typedObjects.agent_pack_plan;
  const admissionReceipt = projectionIntegrity.typedObjects.design_admission_receipt;
  const buildReceipt = projectionIntegrity.typedObjects.build_receipt;
  const typedObjects = [
    ['ReferenceDesignPacket', packet],
    ['TransferMap', transferMap],
    ['AgentPackPlan', agentPackPlan],
    ['DesignAdmissionReceipt', admissionReceipt],
    ['AgentBuildReceipt', buildReceipt],
  ] as const;
  typedObjects.forEach(([name, value]) => {
    if (!value) {
      blockers.push(`source_derived_design_missing_typed_object:${name}`);
    }
  });

  const packetRef = machineString(packet?.packet_ref);
  if (packet && !hasTypedObjectIdentity(
    packet,
    SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.reference_design_packet.surface_kind,
    SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.reference_design_packet.version,
    SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.reference_design_packet.identity_ref_field,
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:ReferenceDesignPacket');
  }
  const steps: SourceWorkflowStep[] = [];
  const patterns = recordArray(packet?.transferable_design_patterns);
  if (packet && patterns.length === 0) {
    blockers.push('source_derived_design_reference_design_packet_missing_transferable_design_patterns');
  }
  patterns.forEach((pattern, patternIndex) => {
    const patternId = machineString(pattern.pattern_id);
    const workflowSteps = recordArray(pattern.transferable_workflow_steps);
    if (!patternId || workflowSteps.length === 0) {
      blockers.push(`source_derived_design_reference_design_packet_workflow_steps_invalid:${patternId ?? patternIndex}`);
      return;
    }
    workflowSteps.forEach((step, stepIndex) => {
      const stepId = machineString(step.step_id);
      const stageArchetype = machineString(step.stage_archetype);
      const provenanceKind = machineString(step.provenance_kind);
      const sourceAnchorRefs = uniqueStrings(step.source_anchor_refs);
      if (
        !stepId
        || !stageArchetype
        || sourceAnchorRefs.length === 0
        || !provenanceKind
        || !['source_derived', 'internal_synthesis'].includes(provenanceKind)
      ) {
        blockers.push(`source_derived_design_reference_design_packet_workflow_step_invalid:${patternId}/${stepId ?? stepIndex}`);
        return;
      }
      steps.push({
        key: `${patternId}\0${stepId}`,
        pattern_id: patternId,
        step_id: stepId,
        source_anchor_refs: sourceAnchorRefs,
      });
    });
  });

  const transferMapRef = machineString(transferMap?.transfer_map_ref);
  if (transferMap && (
    !hasTypedObjectIdentity(
      transferMap,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.transfer_map.surface_kind,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.transfer_map.version,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.transfer_map.identity_ref_field,
    )
    || !packetRef
    || transferMap.reference_design_packet_ref !== packetRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:TransferMap');
  }
  const mappings = recordArray(transferMap?.mappings);
  if (transferMap && mappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_mappings');
  }
  const workflowMappings = mappings.filter((mapping) => {
    const disposition = machineString(mapping.disposition);
    return machineString(mapping.pattern_id) !== null
      && machineString(mapping.step_id) !== null
      && machineString(mapping.source_anchor_ref) !== null
      && machineString(mapping.target_stage_or_capability_slot) !== null
      && machineString(mapping.transfer_rationale) !== null
      && uniqueStrings(mapping.known_limits).length > 0
      && disposition !== null
      && ['adopt', 'adapt'].includes(disposition);
  });
  if (transferMap && workflowMappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_typed_workflow_mappings');
  }
  const mappedStepKeys: string[] = [];
  const mappedStageRefs = new Map<string, string>();
  steps.forEach((step) => {
    const mapping = workflowMappings.find((candidate) => {
      const sourceAnchorRef = machineString(candidate.source_anchor_ref);
      return candidate.pattern_id === step.pattern_id
        && candidate.step_id === step.step_id
        && sourceAnchorRef !== null
        && step.source_anchor_refs.includes(sourceAnchorRef);
    });
    const mappedStageRef = machineString(mapping?.target_stage_or_capability_slot);
    if (mapping && mappedStageRef) {
      mappedStepKeys.push(step.key);
      mappedStageRefs.set(step.key, mappedStageRef);
    } else {
      blockers.push(`source_derived_design_transfer_map_missing_workflow_step_mapping:${step.pattern_id}/${step.step_id}`);
    }
  });

  const rejectedMappings = mappings.filter((mapping) => {
    const sourceAnchorRef = machineString(mapping.source_anchor_ref);
    return mapping.disposition === 'reject'
      && sourceAnchorRef !== null
      && sourceAnchorRef.startsWith('non-transferable:');
  });
  if (transferMap && rejectedMappings.length === 0) {
    blockers.push('source_derived_design_transfer_map_missing_non_transferable_rejection');
  }

  const agentPackPlanRef = machineString(agentPackPlan?.plan_ref);
  if (agentPackPlan && (
    !hasTypedObjectIdentity(
      agentPackPlan,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.agent_pack_plan.surface_kind,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.agent_pack_plan.version,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.agent_pack_plan.identity_ref_field,
    )
    || !packetRef
    || agentPackPlan.reference_design_packet_ref !== packetRef
    || !transferMapRef
    || agentPackPlan.transfer_map_ref !== transferMapRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:AgentPackPlan');
  }
  const plannedStages = recordArray(agentPackPlan?.planned_stage_refs);
  blockers.push(...validateReferenceSourcePacketPolicy(
    declaredReferenceSourceRefs,
    packet,
    plannedStages,
    stageEntries,
  ));
  if (agentPackPlan && plannedStages.length === 0) {
    blockers.push('source_derived_design_agent_pack_plan_missing_planned_stage_refs');
  }
  const workflowStagePlans = plannedStages.filter((stage) =>
    stage.origin === 'source_pattern_ref'
    && machineString(stage.stage_id) !== null
    && machineString(stage.pattern_id) !== null
    && machineString(stage.step_id) !== null
    && uniqueStrings(stage.source_anchor_refs).length > 0
    && machineString(stage.stage_ref) !== null
  );
  if (agentPackPlan && workflowStagePlans.length === 0) {
    blockers.push('source_derived_design_agent_pack_plan_missing_typed_workflow_stages');
  }
  const plannedStageRefs: string[] = [];
  const plannedStageIds: string[] = [];
  steps.forEach((step) => {
    const stage = workflowStagePlans.find((candidate) => {
      const sourceAnchorRefs = uniqueStrings(candidate.source_anchor_refs);
      const stageRef = machineString(candidate.stage_ref);
      return candidate.pattern_id === step.pattern_id
        && candidate.step_id === step.step_id
        && sourceAnchorRefs.some((ref) => step.source_anchor_refs.includes(ref))
        && stageRef !== null
        && stageRef === mappedStageRefs.get(step.key);
    });
    const stageRef = machineString(stage?.stage_ref);
    if (stageRef) {
      plannedStageRefs.push(stageRef);
      const stageId = machineString(stage?.stage_id);
      if (stageId) {
        plannedStageIds.push(stageId);
      } else {
        blockers.push(`source_derived_design_agent_pack_plan_missing_workflow_step_stage_id:${step.pattern_id}/${step.step_id}`);
      }
    } else {
      blockers.push(`source_derived_design_agent_pack_plan_missing_workflow_step_stage:${step.pattern_id}/${step.step_id}`);
    }
  });
  if (steps.length > 1 && uniqueStrings(plannedStageRefs).length < 2) {
    blockers.push('source_derived_design_agent_pack_plan_collapsed_workflow_stages');
  }
  uniqueStrings(plannedStageIds).forEach((stageId) => {
    if (!stageEntries.some((stage) => stage.stage_id === stageId)) {
      blockers.push(`source_derived_design_stage_control_plane_missing_planned_stage:${stageId}`);
    }
  });

  const allPlannedStageIds: string[] = [];
  const allPlannedStageRefs: string[] = [];
  const targetOnlyRequirementRefs: string[] = [];
  plannedStages.forEach((plannedStage, index) => {
    const stageId = machineString(plannedStage.stage_id);
    const stageRef = machineString(plannedStage.stage_ref);
    const origin = machineString(plannedStage.origin);
    if (!stageId || !stageRef || !origin) {
      blockers.push(`source_derived_design_agent_pack_plan_invalid_planned_stage:${index}`);
      return;
    }
    allPlannedStageIds.push(stageId);
    allPlannedStageRefs.push(stageRef);
    const actualStages = stageEntries.filter((stage) => stage.stage_id === stageId);
    if (actualStages.length !== 1) {
      blockers.push(`source_derived_design_stage_control_plane_planned_stage_count_invalid:${stageId}`);
      return;
    }
    const actualStage = actualStages[0];
    const actualOrigin = machineString(actualStage.stage_origin);
    if (actualOrigin !== origin) {
      blockers.push(`source_derived_design_stage_manifest_origin_mismatch:${stageId}`);
    }
    if (origin === 'target_only_requirement') {
      const targetOnlyRequirementRef = machineString(plannedStage.target_only_requirement_ref);
      if (!targetOnlyRequirementRef) {
        blockers.push(`source_derived_design_agent_pack_plan_missing_target_only_requirement_ref:${stageId}`);
        return;
      }
      targetOnlyRequirementRefs.push(targetOnlyRequirementRef);
      if (machineString(actualStage.target_only_requirement_ref) !== targetOnlyRequirementRef) {
        blockers.push(`source_derived_design_stage_manifest_target_only_requirement_ref_mismatch:${stageId}`);
      }
    } else if (origin === 'source_pattern_ref') {
      const plannedPatternId = machineString(plannedStage.pattern_id);
      const plannedStepId = machineString(plannedStage.step_id);
      const plannedSourcePatternRef = machineString(plannedStage.source_pattern_ref);
      if (!plannedPatternId || !plannedStepId || !plannedSourcePatternRef) {
        blockers.push(`source_derived_design_agent_pack_plan_invalid_source_provenance:${stageId}`);
        return;
      }
      if (machineString(actualStage.pattern_id) !== plannedPatternId) {
        blockers.push(`source_derived_design_stage_manifest_pattern_id_mismatch:${stageId}`);
      }
      if (machineString(actualStage.step_id) !== plannedStepId) {
        blockers.push(`source_derived_design_stage_manifest_step_id_mismatch:${stageId}`);
      }
      if (machineString(actualStage.source_pattern_ref) !== plannedSourcePatternRef) {
        blockers.push(`source_derived_design_stage_manifest_source_pattern_ref_mismatch:${stageId}`);
      }
    } else if (origin !== 'source_pattern_ref') {
      blockers.push(`source_derived_design_agent_pack_plan_invalid_stage_origin:${stageId}`);
    }
  });
  if (uniqueStrings(allPlannedStageIds).length !== allPlannedStageIds.length) {
    blockers.push('source_derived_design_agent_pack_plan_duplicate_stage_ids');
  }
  stageEntries.forEach((stage) => {
    const stageId = machineString(stage.stage_id);
    if (stageId && !allPlannedStageIds.includes(stageId)) {
      blockers.push(`source_derived_design_stage_control_plane_unplanned_stage:${stageId}`);
    }
  });

  if (admissionReceipt && (
    !hasTypedObjectIdentity(
      admissionReceipt,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.design_admission_receipt.surface_kind,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.design_admission_receipt.version,
      SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.design_admission_receipt.identity_ref_field,
    )
    || !packetRef
    || admissionReceipt.reference_design_packet_ref !== packetRef
    || !transferMapRef
    || admissionReceipt.transfer_map_ref !== transferMapRef
    || !agentPackPlanRef
    || admissionReceipt.agent_pack_plan_ref !== agentPackPlanRef
  )) {
    blockers.push('source_derived_design_typed_object_identity_invalid:DesignAdmissionReceipt');
  }
  const admittedStageRefs = uniqueStrings(
    recordArray(admissionReceipt?.design_derived_stage_refs).map((stage) => stage.stage_ref),
  );
  if (admissionReceipt && admittedStageRefs.length === 0) {
    blockers.push('source_derived_design_design_admission_receipt_missing_stage_refs');
  }
  uniqueStrings(plannedStageRefs).forEach((stageRef) => {
    if (!admittedStageRefs.includes(stageRef)) {
      blockers.push(`source_derived_design_design_admission_receipt_missing_planned_stage:${stageRef}`);
    }
  });
  const admittedTargetOnlyRequirementRefs = uniqueStrings(admissionReceipt?.target_only_requirement_refs);
  uniqueStrings(targetOnlyRequirementRefs).forEach((requirementRef) => {
    if (!admittedTargetOnlyRequirementRefs.includes(requirementRef)) {
      blockers.push(`source_derived_design_design_admission_receipt_missing_target_only_requirement:${requirementRef}`);
    }
  });

  const buildReceiptRef = machineString(buildReceipt?.receipt_ref);
  const materialization = isRecord(buildReceipt?.materialization) ? buildReceipt.materialization : null;
  const materializedReceiptStageIds = uniqueStrings(materialization?.materialized_stage_ids);
  const materializedFileDigests = recordArray(materialization?.materialized_file_digests);
  if (!buildReceipt || (
    buildReceipt.surface_kind !== SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.build_receipt.surface_kind
    || buildReceipt.version !== SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.build_receipt.version
    || buildReceipt.receipt_kind !== 'AgentBuildReceipt'
    || !buildReceiptRef
    || buildReceipt.receipt_timing !== 'post_materialization'
    || materialization?.status !== 'passed'
    || materialization?.all_planned_stages_materialized_exactly_once !== true
    || materialization?.all_planned_stage_files_present !== true
    || JSON.stringify(materializedReceiptStageIds) !== JSON.stringify(allPlannedStageIds)
    || materializedFileDigests.length === 0
    || materializedFileDigests.some((digest) =>
      machineString(digest.ref) === null
      || !/^[a-f0-9]{64}$/.test(machineString(digest.sha256) ?? '')
    )
  )) {
    blockers.push('source_derived_design_build_receipt_not_post_materialization_proof');
  }
  blockers.push(...validateReferenceBuildReceiptMaterialization(repoDir, agentPackPlan, buildReceipt));

  return {
    blockers: uniqueStrings(blockers),
    observed: {
      workflow_step_refs: steps.map((step) => `${step.pattern_id}/${step.step_id}`),
      mapped_workflow_step_count: mappedStepKeys.length,
      planned_stage_refs: uniqueStrings(plannedStageRefs),
      all_planned_stage_refs: allPlannedStageRefs,
      materialized_stage_ids: uniqueStrings(plannedStageIds),
      all_materialized_stage_ids: allPlannedStageIds,
      admitted_design_stage_refs: admittedStageRefs,
      admitted_target_only_requirement_refs: admittedTargetOnlyRequirementRefs,
      build_receipt_ref: buildReceiptRef,
    },
  };
}

export function buildAgentProfileConformance(args: string[]) {
  const { repoDir, profileId } = parseConformanceArgs(args);
  const capabilityMap = readJsonFileOrNull(path.join(repoDir, 'contracts', 'capability_map.json'));
  const repoContractReadout = buildStandardAgentRepoContractReadout(repoDir);
  const stageControlPlane = repoContractReadout.stage_control_plane;
  const profile = conformanceProfileFor(profileId, capabilityMap);
  if (!profile) {
    return {
      version: 'g2',
      profile_conformance: {
        surface_kind: 'opl_agent_profile_conformance',
        status: 'blocked',
        repo_dir: repoDir,
        profile_id: profileId,
        blockers: [`unknown_profile:${profileId}`],
      },
    };
  }

  const capabilities = capabilityEntries(capabilityMap);
  const stages = stageEntries(stageControlPlane);
  const capabilityProfileRefs = selectedProfileRefs(capabilityMap);
  const requirements = profileRequirements(capabilityMap);
  const sourceDerivedRoutePresent = matchesSourceDerivedProfileId(profileId)
    || hasSourceDerivedRoute(capabilityMap);
  const observedCapabilityKinds = uniqueStrings(capabilities.map((entry) => entry.capability_kind));
  const observedSurfaceRoles = uniqueStrings(capabilities.map((entry) => entry.surface_role));
  const requiredStageArchetypes = uniqueStrings((requirements as Record<string, unknown>).required_stage_archetypes);
  const requiredEvidenceObjects = uniqueStrings((requirements as Record<string, unknown>).required_evidence_objects);
  const stagesWithKnowledgeRefs = stages.filter((stage) => Array.isArray(stage.knowledge_refs) && stage.knowledge_refs.length > 0).length;
  const stagesWithToolRefs = stages.filter((stage) => Array.isArray(stage.tool_refs) && stage.tool_refs.length > 0).length;
  const stagesWithEvaluationRefs = stages.filter((stage) => Array.isArray(stage.evaluation) && stage.evaluation.length > 0).length;
  const sourceDerivedPayloads = [
    capabilityMap,
    isRecord(capabilityMap) ? capabilityMap.source_derived_design_receipt : null,
    isRecord(capabilityMap) ? capabilityMap.reference_design_packet : null,
    isRecord(capabilityMap) ? capabilityMap.transfer_map : null,
    isRecord(capabilityMap) ? capabilityMap.agent_pack_plan : null,
    isRecord(capabilityMap) ? capabilityMap.design_admission_receipt : null,
    isRecord(capabilityMap) ? capabilityMap.build_receipt : null,
    ...(isRecord(capabilityMap) && isRecord(capabilityMap.agent_pack_plan)
      ? recordArray(capabilityMap.agent_pack_plan.planned_stage_refs)
      : []),
  ];
  const sourceDerivedDeclarationPayloads = [
    capabilityMap,
    isRecord(capabilityMap) ? capabilityMap.source_derived_design_receipt : null,
  ];
  const declaredReferenceSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedDeclarationPayloads,
    REFERENCE_DESIGN_SOURCE_REF_FIELDS,
  );
  const typedObjectFloor = sourceDerivedRoutePresent
    ? buildSourceDerivedTypedObjectFloor(
        repoDir,
        capabilityMap,
        stages,
        declaredReferenceSourceRefs,
      )
    : null;
  const designConsumptionObjects = collectDirectMachineFieldStrings(sourceDerivedPayloads, [
    'required_design_consumption_objects',
    'design_consumption_objects',
    'source_derived_design_consumption_objects',
    'required_machine_objects',
  ]);
  const referenceDesignSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_SOURCE_REF_FIELDS,
  );
  const referenceDesignPacketRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_PACKET_REF_FIELDS,
  );
  const referenceDesignPacketRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    REFERENCE_DESIGN_PACKET_REQUIREMENT_FIELDS,
  );
  const transferMapRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, TRANSFER_MAP_REF_FIELDS);
  const transferMapRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    TRANSFER_MAP_REQUIREMENT_FIELDS,
  );
  const agentPackPlanRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, AGENT_PACK_PLAN_REF_FIELDS);
  const agentPackPlanRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    AGENT_PACK_PLAN_REQUIREMENT_FIELDS,
  );
  const designAdmissionReceiptRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REF_FIELDS,
  );
  const designAdmissionReceiptRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REQUIREMENT_FIELDS,
  );
  const designAdmissionReceiptSourceStageRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_SOURCE_STAGE_FIELDS,
  );
  const designAdmissionReceiptRejectedPatternRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_REJECTED_PATTERN_FIELDS,
  );
  const designAdmissionReceiptForbiddenClaims = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    DESIGN_ADMISSION_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  );
  const buildReceiptRefs = collectDirectMachineFieldStrings(sourceDerivedPayloads, BUILD_RECEIPT_REF_FIELDS);
  const buildReceiptRequirements = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_REQUIREMENT_FIELDS,
  );
  const buildReceiptSourceStageRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_SOURCE_STAGE_FIELDS,
  );
  const buildReceiptRejectedPatternRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_REJECTED_PATTERN_FIELDS,
  );
  const buildReceiptForbiddenClaims = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    BUILD_RECEIPT_FORBIDDEN_CLAIM_FIELDS,
  );
  const stagePatternSourceRefs = collectDirectMachineFieldStrings(
    sourceDerivedPayloads,
    STAGE_PATTERN_SOURCE_REF_FIELDS,
  );
  const hasTargetOnlyRequirement = hasDirectMachineField(sourceDerivedPayloads, TARGET_ONLY_REQUIREMENT_FIELDS);
  const hasReferenceDesignPacketConsumption = referenceDesignSourceRefs.length > 0
    && referenceDesignPacketRefs.length > 0;
  const hasTransferMapConsumption = transferMapRefs.length > 0;
  const hasAgentPackPlanConsumption = agentPackPlanRefs.length > 0;
  const hasDesignAdmissionReceiptConsumption = designAdmissionReceiptRefs.length > 0
    && designAdmissionReceiptSourceStageRefs.length > 0
    && designAdmissionReceiptRejectedPatternRefs.length > 0
    && designAdmissionReceiptForbiddenClaims.length > 0;

  const blockers = [
    fs.existsSync(path.join(repoDir, 'contracts', 'capability_map.json')) ? null : 'missing_contract:contracts/capability_map.json',
    fs.existsSync(path.join(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF))
      ? null
      : `missing_contract:${STANDARD_AGENT_STAGE_MANIFEST_REF}`,
    ...repoContractReadout.blockers,
    includesProfileRef(capabilityProfileRefs, profile)
      ? null
      : `capability_map_missing_selected_profile_ref:${profile.profile_id}`,
    ...missingRequired(observedCapabilityKinds, profile.required_capability_kinds)
      .map((kind) => `capability_map_missing_capability_kind:${kind}`),
    ...missingRequired(observedSurfaceRoles, profile.required_surface_roles)
      .map((role) => `capability_map_missing_surface_role:${role}`),
    ...missingRequired(requiredStageArchetypes, profile.required_stage_archetypes)
      .map((stage) => `profile_requirements_missing_stage_archetype:${stage}`),
    ...missingRequired(requiredEvidenceObjects, profile.required_evidence_objects)
      .map((object) => `profile_requirements_missing_evidence_object:${object}`),
    stagesWithKnowledgeRefs > 0 ? null : 'stage_control_plane_missing_knowledge_refs',
    stagesWithToolRefs > 0 ? null : 'stage_control_plane_missing_tool_refs',
    stagesWithEvaluationRefs > 0 ? null : 'stage_control_plane_missing_evaluation_refs',
    !sourceDerivedRoutePresent || hasReferenceDesignPacketConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:ReferenceDesignPacket',
    !sourceDerivedRoutePresent || hasTransferMapConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:TransferMap',
    !sourceDerivedRoutePresent || hasAgentPackPlanConsumption
      ? null
      : 'source_derived_design_missing_design_consumption_object:AgentPackPlan',
    !sourceDerivedRoutePresent || hasDesignAdmissionReceiptConsumption
      ? null
      : 'source_derived_design_missing_design_admission_receipt_refs',
    !sourceDerivedRoutePresent || referenceDesignSourceRefs.length > 0
      ? null
      : 'source_derived_design_missing_reference_design_source_refs',
    !sourceDerivedRoutePresent || referenceDesignPacketRefs.length > 0
      ? null
      : 'source_derived_design_missing_reference_design_packet_refs',
    !sourceDerivedRoutePresent || transferMapRefs.length > 0
      ? null
      : 'source_derived_design_missing_transfer_map_refs',
    !sourceDerivedRoutePresent || agentPackPlanRefs.length > 0
      ? null
      : 'source_derived_design_missing_agent_pack_plan_refs',
    !sourceDerivedRoutePresent || buildReceiptRefs.length > 0
      ? null
      : 'source_derived_design_missing_build_receipt_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptSourceStageRefs.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_stage_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptRejectedPatternRefs.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_rejected_source_pattern_refs',
    !sourceDerivedRoutePresent || designAdmissionReceiptForbiddenClaims.length > 0
      ? null
      : 'source_derived_design_missing_design_admission_forbidden_claims',
    !sourceDerivedRoutePresent || stagePatternSourceRefs.length > 0 || hasTargetOnlyRequirement
      ? null
      : 'source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement',
    ...(typedObjectFloor?.blockers ?? []),
  ].filter((blocker): blocker is string => Boolean(blocker));

  return {
    version: 'g2',
    profile_conformance: {
      surface_kind: 'opl_agent_profile_conformance',
      version: 'agent-profile-conformance.v1',
      repo_dir: repoDir,
      profile_id: profile.profile_id,
      profile_ref: profile.profile_ref,
      status: blockers.length === 0 ? 'passed' : 'blocked',
      observed: {
        capability_profile_refs: capabilityProfileRefs,
        profile_truth_source: 'contracts/capability_map.json',
        stage_source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
        capability_kinds: observedCapabilityKinds,
        surface_roles: observedSurfaceRoles,
        required_stage_archetypes: requiredStageArchetypes,
        required_evidence_objects: requiredEvidenceObjects,
        stages_with_knowledge_refs: stagesWithKnowledgeRefs,
        stages_with_tool_refs: stagesWithToolRefs,
        stages_with_evaluation_refs: stagesWithEvaluationRefs,
        source_derived_design: sourceDerivedRoutePresent
          ? {
              required_design_consumption_objects: designConsumptionObjects,
              reference_design_source_refs: referenceDesignSourceRefs,
              reference_design_packet_refs: referenceDesignPacketRefs,
              reference_design_packet_requirements: referenceDesignPacketRequirements,
              transfer_map_refs: transferMapRefs,
              transfer_map_requirements: transferMapRequirements,
              agent_pack_plan_refs: agentPackPlanRefs,
              agent_pack_plan_requirements: agentPackPlanRequirements,
              design_admission_receipt_refs: designAdmissionReceiptRefs,
              design_admission_receipt_requirements: designAdmissionReceiptRequirements,
              design_admission_receipt_stage_refs: designAdmissionReceiptSourceStageRefs,
              design_admission_receipt_rejected_source_pattern_refs: designAdmissionReceiptRejectedPatternRefs,
              design_admission_receipt_forbidden_claims: designAdmissionReceiptForbiddenClaims,
              build_receipt_refs: buildReceiptRefs,
              build_receipt_requirements: buildReceiptRequirements,
              build_receipt_source_stage_refs: buildReceiptSourceStageRefs,
              build_receipt_rejected_source_pattern_refs: buildReceiptRejectedPatternRefs,
              build_receipt_forbidden_claims: buildReceiptForbiddenClaims,
              stage_pattern_source_refs: stagePatternSourceRefs,
              has_target_only_requirement: hasTargetOnlyRequirement,
              typed_object_floor: typedObjectFloor?.observed ?? null,
            }
          : null,
      },
      blockers,
      authority_boundary: {
        refs_only: true,
        conformance_can_write_domain_truth: false,
        conformance_can_create_owner_receipt: false,
        conformance_can_claim_domain_ready: false,
        conformance_can_claim_production_ready: false,
      },
    },
  };
}
