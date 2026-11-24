import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildAgentWorkspaceNormProjection } from '../agent-workspace-norm.ts';
import type { WorkspaceAgentProfile } from '../workspace-agent-defaults.ts';
import {
  buildWorkspaceLifecycle,
  CURRENT_STAGE_POINTER_BASENAME,
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  STAGE_OUTPUTS_INDEX_BASENAME,
} from '../workspace-artifacts.ts';
import {
  buildCanonicalTopology,
  buildWorkspaceProfileBinding,
  buildSharedResources,
  buildWorkspaceDisplayLabels,
  expectedDomainTopologyProfile,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  OPL_GENERATED_PROJECTIONS_ROOT,
  OPL_GENERATED_REPORTS_ROOT,
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from '../workspace-topology.ts';
import { buildInterfaceProjection } from './interfaces.ts';

export function buildWorkspaceIndex(input: {
  contracts: FrameworkContracts;
  workspaceId: string;
  workspacePath: string;
  title: string | null;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
  projectId: string;
  projectRootRef: string;
  stageOutputsRootRef: string;
  createdAt: string;
  updatedAt: string;
  projects: WorkspaceProjectIndexEntry[];
  existingIndex?: Record<string, unknown> | null;
  profileAppliedBy?: 'opl_workspace_init' | 'opl_workspace_ensure' | 'opl_workspace_adopt' | 'opl_workspace_upgrade';
  profileEvent?: 'initialized' | 'ensured' | 'adopted' | 'upgraded' | 'project_appended' | 'project_lifecycle_updated';
}) {
  const existingProfileBinding = isRecord(input.existingIndex?.profile_binding)
    ? input.existingIndex.profile_binding
    : null;
  const profileEvent = input.profileEvent ?? (input.existingIndex ? 'ensured' : 'initialized');
  const inventory = input.agent.inventory_projection;
  const inventoryPointerSegment = inventory?.relative_path === 'workspace_index.json'
    ? inventory.items_pointer.match(/^\/([^/]+)$/u)?.[1] ?? null
    : null;
  const existingDomainItems = inventoryPointerSegment
    && Array.isArray(input.existingIndex?.[inventoryPointerSegment])
    ? input.existingIndex[inventoryPointerSegment].filter(isRecord)
    : [];
  const projectedDomainItems: Array<Record<string, unknown>> = inventory
    ? input.projects.map((project) => ({
        ...(inventoryPointerSegment === 'projects' ? {
          ...existingDomainItems.find((item) => item.project_id === project.project_id),
          ...project,
        } : {}),
        [inventory.field_map.work_item_id]: project.project_id,
        [inventory.field_map.work_item_root]: project.project_root,
      }))
    : [];
  const domainInventory = inventory && inventoryPointerSegment
    ? {
        [inventoryPointerSegment]: inventoryPointerSegment === 'projects' ? projectedDomainItems : [
          ...existingDomainItems.map((item) => {
            const projected = projectedDomainItems.find((candidate) => (
              candidate[inventory.field_map.work_item_id]
                === item[inventory.field_map.work_item_id]
            ));
            return projected ? { ...item, ...projected } : item;
          }),
          ...projectedDomainItems.filter((candidate) => !existingDomainItems.some((item) => (
            item[inventory.field_map.work_item_id]
              === candidate[inventory.field_map.work_item_id]
          ))),
        ],
      }
    : {};
  return {
    surface_kind: 'opl_workspace_index',
    version: 'workspace-index.v1',
    workspace_id: input.workspaceId,
    title: input.title,
    workspace_path: input.workspacePath,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    workspace_lifecycle: buildWorkspaceLifecycle({}),
    profile_binding: buildWorkspaceProfileBinding({
      profileId: input.profileId,
      appliedAt: input.updatedAt,
      appliedBy: input.profileAppliedBy ?? 'opl_workspace_init',
      event: profileEvent,
      existingBinding: existingProfileBinding,
      note: profileEvent === 'project_appended'
        ? 'Workspace topology refreshed while appending a project; existing project roots were not moved.'
        : 'Workspace topology projection refreshed; project roots were not moved.',
    }),
    topology_events: [
      ...(Array.isArray(input.existingIndex?.topology_events)
        ? input.existingIndex.topology_events.filter(isRecord)
        : []),
      {
        event: profileEvent,
        at: input.updatedAt,
        profile_id: input.profileId,
        workspace_mode: input.profile.workspace_mode,
        project_collection_path: input.profile.project_collection_path,
        project_roots_moved: false,
        triggered_by: input.profileAppliedBy ?? 'opl_workspace_init',
      },
    ],
    generated_refs: {
      workspace_config_ref: 'workspace.yaml',
      workspace_index_ref: 'workspace_index.json',
      workspace_map_ref: WORKSPACE_MAP_REF,
      workspace_health_ref: WORKSPACE_HEALTH_REF,
      workspace_inspection_ref: WORKSPACE_INSPECTION_REF,
      workspace_resource_inventory_ref: WORKSPACE_RESOURCE_INVENTORY_REF,
      workspace_report_ref: WORKSPACE_REPORT_REF,
      canonical_generated_root: 'control/opl',
      canonical_projection_root: OPL_GENERATED_PROJECTIONS_ROOT,
      canonical_report_root: OPL_GENERATED_REPORTS_ROOT,
      canonical_workspace_map_ref: GENERATED_WORKSPACE_MAP_REF,
      canonical_workspace_health_ref: GENERATED_WORKSPACE_HEALTH_REF,
      canonical_workspace_inspection_ref: GENERATED_WORKSPACE_INSPECTION_REF,
      canonical_workspace_resource_inventory_ref: GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
      canonical_workspace_report_ref: GENERATED_WORKSPACE_REPORT_REF,
      root_mirror_refs: [
        WORKSPACE_MAP_REF,
        WORKSPACE_HEALTH_REF,
        WORKSPACE_INSPECTION_REF,
        WORKSPACE_RESOURCE_INVENTORY_REF,
        WORKSPACE_REPORT_REF,
      ],
      project_config_basename: 'project.yaml',
      project_index_basename: 'project_index.json',
      shared_resource_manifest_basename: 'opl_resource_manifest.json',
      stage_outputs_manifest_basename: 'opl_stage_outputs_manifest.json',
      stage_outputs_index_basename: STAGE_OUTPUTS_INDEX_BASENAME,
      current_stage_pointer_basename: CURRENT_STAGE_POINTER_BASENAME,
    },
    agent: {
      agent_id: input.agent.agent_id,
      label: input.agent.label,
      project_id: input.agent.project_id,
      project: input.agent.project,
      workspace_kind: input.agent.workspace_kind,
      project_kind: input.agent.project_kind,
      project_collection_label: input.agent.project_collection_label,
      inventory_projection: input.agent.inventory_projection,
    },
    workspace_topology_profile: {
      contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
      profile_id: input.profileId,
      workspace_mode: input.profile.workspace_mode,
      project_collection_path: input.profile.project_collection_path,
      shared_resource_roots: input.profile.shared_resource_roots,
      project_stage_outputs_root: input.profile.project_stage_outputs_root,
    },
    canonical_topology: buildCanonicalTopology(input.agent, input.profile),
    display_labels: buildWorkspaceDisplayLabels(input.agent, input.profile),
    shared_resource_roots: input.profile.shared_resource_roots,
    shared_resources: buildSharedResources(input.profile),
    projects: input.projects,
    ...domainInventory,
    user_inspection: {
      ordinary_user_default_surface: 'workspace_local_project_stage_outputs',
      default_stage_outputs: input.stageOutputsRootRef,
      workspace_inspection_ref: WORKSPACE_INSPECTION_REF,
      workspace_resource_inventory_ref: WORKSPACE_RESOURCE_INVENTORY_REF,
      workspace_report_ref: WORKSPACE_REPORT_REF,
      default_stage_outputs_index_ref: `${input.stageOutputsRootRef}/${STAGE_OUTPUTS_INDEX_BASENAME}`,
      default_current_stage_pointer_ref: `${input.stageOutputsRootRef}/${CURRENT_STAGE_POINTER_BASENAME}`,
      project_stage_outputs_pattern: '<project-root>/artifacts/stage_outputs/<stage-id>/',
      runtime_state_is_default_user_surface: false,
      product_views_are_stage_outputs: false,
    },
    runtime_state_boundary: {
      role: 'provider_backing_provenance_restore_audit',
      runtime_state_can_be_canonical_project_root: false,
      runtime_state_can_close_stage: false,
      runtime_state_can_replace_owner_receipt_or_typed_blocker: false,
    },
    authority_boundary: {
      opl_can_define_topology_contract: true,
      opl_can_project_workspace_refs: true,
      opl_can_write_domain_truth: false,
      opl_can_mutate_artifact_body: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
      runtime_state_counts_as_user_default_surface: false,
    },
    workspace_norm: buildAgentWorkspaceNormProjection({
      contract: input.contracts.agentWorkspaceNorm,
      agentId: input.agent.agent_id,
      agentProfile: input.agent,
    }),
    expected_domain_topology_profile: expectedDomainTopologyProfile({
      agent: input.agent,
      profileId: input.profileId,
      profile: input.profile,
    }),
    interface_projection: buildInterfaceProjection(
      input.contracts.agentWorkspaceNorm,
      input.agent,
      input.workspacePath,
      input.projectId,
    ),
  };
}
