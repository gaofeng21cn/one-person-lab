import {
  resolveCanonicalManifestSurface,
  resolveGeneratedStageControlPlaneSurface,
} from './canonical-surfaces.ts';
import { normalizeRuntimeControl } from './runtime-control.ts';
import {
  normalizeRuntimeInventory,
  normalizeTaskLifecycle,
  normalizeSessionContinuity,
  normalizeProgressProjection,
} from './session-projections.ts';
import {
  validateFamilyDomainEntryContract,
  validateUserInteractionContract,
  validateSharedHandoff,
} from '../family-entry-contracts.ts';
import { normalizeFamilyActionCatalog } from '../../../kernel/family-action-catalog-contract.ts';
import { normalizeFamilyDomainMemoryRef } from '../family-domain-memory-contract.ts';
import { normalizeManagedRuntimeContract } from '../../../kernel/managed-runtime-contract.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  normalizeArtifactInventory,
  normalizeAutomationCatalog,
  normalizeSkillCatalog,
} from './artifact-skill-normalizers.ts';
import { normalizeFunctionalClosureSurfaces } from './functional-closure-surfaces.ts';
import {
  normalizeClearanceLane,
  normalizeDetailedReadinessSurface,
  normalizePlatformTarget,
  normalizeProductEntryGuardrails,
  normalizeProductEntryOverview,
  normalizeProductEntryPreflight,
  normalizeProductEntryQuickstart,
  normalizeProductEntryReadiness,
  normalizeProductEntryStart,
  normalizeSourceProvenanceSurface,
  normalizeShellSurface,
  unwrapManifestPayload,
} from './entry-surfaces.ts';
import {
  buildStandardDomainAgentSkeletonCandidate,
  normalizeDomainTransitionOracleSurface,
  normalizeProductEntryStatus,
} from './status-skeleton-normalizers.ts';
import type { NormalizedDomainManifest } from './types.ts';
import {
  isRecord,
  normalizeRecordList,
  normalizeRecordMap,
  readStringList,
  requireRecord,
  requireString,
} from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

type ManifestNormalizationOptions = {
  repoDir?: string;
};

export function normalizeManifest(
  payload: JsonRecord,
  options: ManifestNormalizationOptions = {},
): NormalizedDomainManifest {
  const manifest = unwrapManifestPayload(payload);
  const manifestWrapper = isRecord(payload.product_entry_manifest) ? payload : {};
  const manifestWithWrapperSidecars = {
    ...manifestWrapper,
    ...manifest,
  };
  const recordFromManifestOrWrapper = (key: string) => (
    isRecord(manifest[key])
      ? manifest[key]
      : isRecord(manifestWrapper[key])
        ? manifestWrapper[key]
        : null
  );
  const formalEntry = requireRecord(manifest.formal_entry, 'formal_entry');
  const productEntryShell = normalizeRecordMap(manifest.product_entry_shell, 'product_entry_shell');
  const sharedHandoff = validateSharedHandoff(manifest.shared_handoff, 'shared_handoff');
  const recommendedShell = optionalString(manifest.recommended_shell);
  const explicitRecommendedCommand = optionalString(manifest.recommended_command);
  const derivedRecommendedCommand = recommendedShell
    ? optionalString(productEntryShell[recommendedShell]?.command)
    : null;
  const productEntrySurface = normalizeShellSurface(manifest.product_entry_surface, {
    field: 'product_entry_surface',
    productEntryShell,
  });
  const operatorLoopSurface = normalizeShellSurface(manifest.operator_loop_surface, {
    field: 'operator_loop_surface',
    productEntryShell,
  });
  const operatorLoopActions = isRecord(manifest.operator_loop_actions)
    ? normalizeRecordMap(manifest.operator_loop_actions, 'operator_loop_actions')
    : {};
  const productEntryOverview = normalizeProductEntryOverview(manifest.product_entry_overview);
  const productEntryPreflight = normalizeProductEntryPreflight(manifest.product_entry_preflight);
  const productEntryReadiness = normalizeProductEntryReadiness(manifest.product_entry_readiness);
  const grantAuthoringReadiness = normalizeDetailedReadinessSurface(
    manifest.grant_authoring_readiness,
    'grant_authoring_readiness',
  );
  const productEntryGuardrails = normalizeProductEntryGuardrails(manifest.product_entry_guardrails);
  const phase3ClearanceLane = normalizeClearanceLane(
    manifest.phase3_clearance_lane,
    'phase3_host_clearance_lane',
  );
  const sourceProvenance = normalizeSourceProvenanceSurface(manifest.source_provenance);
  const phase5PlatformTarget = normalizePlatformTarget(manifest.phase5_platform_target);
  const productEntryStart = normalizeProductEntryStart(manifest.product_entry_start);
  const productEntryQuickstart = normalizeProductEntryQuickstart(manifest.product_entry_quickstart);
  const runtimeInventory = normalizeRuntimeInventory(manifest.runtime_inventory);
  const taskLifecycle = normalizeTaskLifecycle(manifest.task_lifecycle);
  const schemaRef = optionalString(manifest.schema_ref);
  const domainEntryContract = manifest.domain_entry_contract === undefined
    ? null
    : validateFamilyDomainEntryContract(manifest.domain_entry_contract, 'domain_entry_contract');
  const userInteractionContract = manifest.user_interaction_contract === undefined
    ? null
    : validateUserInteractionContract(
      manifest.user_interaction_contract,
      'user_interaction_contract',
    );
  const rawFamilyOrchestration = isRecord(manifest.family_orchestration)
    ? manifest.family_orchestration
    : null;
  const familyActionCatalogSurface = resolveCanonicalManifestSurface(
    manifest,
    'family_action_catalog',
    'family_action_catalog_ref',
    'contracts/action_catalog.json',
    options.repoDir,
    normalizeFamilyActionCatalog,
  );
  const familyStageControlPlaneSurface = resolveGeneratedStageControlPlaneSurface(
    manifest,
    options.repoDir,
  );
  const manifestTargetDomainId = requireString(manifest.target_domain_id, 'target_domain_id');
  const domainMemoryDescriptor = normalizeFamilyDomainMemoryRef(manifest.domain_memory_descriptor);
  const skeletonCandidateFields = ['standard_domain_agent_skeleton'];
  const directSkeletonSourceField =
    skeletonCandidateFields.find((field) => isRecord(manifestWithWrapperSidecars[field])) ?? null;
  const providerReadyContract = isRecord(manifest.opl_provider_ready_contract)
    ? manifest.opl_provider_ready_contract
    : null;
  const standardDomainAgentSkeletonSourceField =
    directSkeletonSourceField;
  const standardDomainAgentSkeleton = buildStandardDomainAgentSkeletonCandidate(
    manifestWithWrapperSidecars,
    directSkeletonSourceField,
    providerReadyContract,
  );
  const functionalClosureSurfaces = normalizeFunctionalClosureSurfaces(manifest);
  const remainingGaps = readStringList(manifest.remaining_gaps);
  const productEntryStatus = normalizeProductEntryStatus(manifest.product_entry_status, remainingGaps);
  const sessionContinuity = normalizeSessionContinuity(manifest.session_continuity, {
    domainAgentId: domainEntryContract?.domain_agent_entry_spec?.agent_id ?? null,
    runtimeInventory,
    taskLifecycle,
    productEntryOverview,
    productEntryStatus,
  });
  const progressProjection = normalizeProgressProjection(manifest.progress_projection, {
    runtimeInventory,
    taskLifecycle,
    productEntryOverview,
    productEntryStatus,
  });
  const artifactInventory = normalizeArtifactInventory(manifest.artifact_inventory, {
    progressProjection,
    sessionContinuity,
  });
  const runtimeControlSource =
    isRecord(manifest.runtime_control)
      ? manifest.runtime_control
      : isRecord(manifest.runtime_loop_closure)
        ? manifest.runtime_loop_closure
        : isRecord(manifest.progress_projection)
          && isRecord(manifest.progress_projection.domain_projection)
          && isRecord(manifest.progress_projection.domain_projection.research_runtime_control_projection)
          ? manifest.progress_projection.domain_projection.research_runtime_control_projection
          : isRecord(manifest.return_surface_contract)
            && isRecord(manifest.return_surface_contract.research_runtime_control_projection_contract)
            ? manifest.return_surface_contract.research_runtime_control_projection_contract
            : null;
  const runtimeControl = normalizeRuntimeControl(runtimeControlSource, {
    domainAgentId: domainEntryContract?.domain_agent_entry_spec?.agent_id ?? null,
    runtimeInventory,
    taskLifecycle,
    sessionContinuity,
    progressProjection,
    artifactInventory,
  });
  const skillCatalog = normalizeSkillCatalog(manifest.skill_catalog);
  const automation = normalizeAutomationCatalog(manifest.automation);

  if (recommendedShell && !productEntryShell[recommendedShell]) {
    throw new Error(`recommended_shell points at unknown shell key: ${recommendedShell}`);
  }
  if (
    recommendedShell
    && explicitRecommendedCommand
    && derivedRecommendedCommand
    && explicitRecommendedCommand !== derivedRecommendedCommand
  ) {
    throw new Error('recommended_command must match the command declared by recommended_shell.');
  }

  return {
    surface_kind: optionalString(manifest.surface_kind) ?? 'product_entry_manifest',
    manifest_version:
      typeof manifest.manifest_version === 'number' || typeof manifest.manifest_version === 'string'
        ? manifest.manifest_version
        : typeof manifest.schema_version === 'number' || typeof manifest.schema_version === 'string'
          ? manifest.schema_version
          : null,
    manifest_kind: requireString(manifest.manifest_kind, 'manifest_kind'),
    target_domain_id: manifestTargetDomainId,
    formal_entry: {
      default: requireString(formalEntry.default, 'formal_entry.default'),
      supported_protocols: readStringList(formalEntry.supported_protocols),
      internal_surface: optionalString(formalEntry.internal_surface),
    },
    workspace_locator: requireRecord(manifest.workspace_locator, 'workspace_locator'),
    runtime: isRecord(manifest.runtime) ? manifest.runtime : null,
    managed_runtime_contract: normalizeManagedRuntimeContract(manifest.managed_runtime_contract),
    repo_mainline: isRecord(manifest.repo_mainline) ? manifest.repo_mainline : null,
    product_entry_status: productEntryStatus,
    product_entry_surface: productEntrySurface,
    operator_loop_surface: operatorLoopSurface,
    operator_loop_actions: operatorLoopActions,
    recommended_shell: recommendedShell,
    recommended_command: explicitRecommendedCommand ?? derivedRecommendedCommand,
    schema_ref: schemaRef,
    domain_entry_contract: domainEntryContract,
    user_interaction_contract: userInteractionContract,
    product_entry_shell: productEntryShell,
    shared_handoff: sharedHandoff,
    product_entry_overview: productEntryOverview,
    product_entry_preflight: productEntryPreflight,
    product_entry_readiness: productEntryReadiness,
    grant_authoring_readiness: grantAuthoringReadiness,
    product_entry_guardrails: productEntryGuardrails,
    phase3_clearance_lane: phase3ClearanceLane,
    source_provenance: sourceProvenance,
    phase5_platform_target: phase5PlatformTarget,
    product_entry_start: productEntryStart,
    product_entry_quickstart: productEntryQuickstart,
    family_orchestration: rawFamilyOrchestration
      ? {
          action_graph_ref: isRecord(rawFamilyOrchestration.action_graph_ref)
            ? rawFamilyOrchestration.action_graph_ref
            : null,
          action_graph: isRecord(rawFamilyOrchestration.action_graph)
            ? rawFamilyOrchestration.action_graph
            : null,
          human_gates: normalizeRecordList(rawFamilyOrchestration.human_gates, 'family_orchestration.human_gates'),
          resume_contract: isRecord(rawFamilyOrchestration.resume_contract)
            ? rawFamilyOrchestration.resume_contract
            : null,
          event_envelope_surface: isRecord(rawFamilyOrchestration.event_envelope_surface)
            ? rawFamilyOrchestration.event_envelope_surface
            : null,
          checkpoint_lineage_surface: isRecord(rawFamilyOrchestration.checkpoint_lineage_surface)
            ? rawFamilyOrchestration.checkpoint_lineage_surface
            : null,
        }
      : null,
    family_action_catalog: familyActionCatalogSurface.value,
    family_action_catalog_source_ref: familyActionCatalogSurface.sourceRef,
    family_stage_control_plane: familyStageControlPlaneSurface.value,
    family_stage_control_plane_source_ref: familyStageControlPlaneSurface.sourceRef,
    domain_memory_descriptor: domainMemoryDescriptor,
    standard_domain_agent_skeleton: standardDomainAgentSkeleton,
    standard_domain_agent_skeleton_source_field: standardDomainAgentSkeletonSourceField,
    generated_surface_handoff: isRecord(manifest.generated_surface_handoff) ? manifest.generated_surface_handoff : null,
    ...functionalClosureSurfaces,
    owner_payload_response: recordFromManifestOrWrapper('owner_payload_response'),
    opl_owner_payload_response: recordFromManifestOrWrapper('opl_owner_payload_response'),
    mag_opl_owner_payload_response: recordFromManifestOrWrapper('mag_opl_owner_payload_response'),
    workspace_receipt_scaleout_evidence:
      recordFromManifestOrWrapper('workspace_receipt_scaleout_evidence'),
    runtime_inventory: runtimeInventory,
    task_lifecycle: taskLifecycle,
    runtime_control: runtimeControl,
    session_continuity: sessionContinuity,
    progress_projection: progressProjection,
    artifact_inventory: artifactInventory,
    skill_catalog: skillCatalog,
    automation,
    remaining_gaps: remainingGaps,
    notes: readStringList(manifest.notes),
  };
}
