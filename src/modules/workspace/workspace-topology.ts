import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import type { WorkspaceAgentProfile } from './workspace-agent-defaults.ts';

export type WorkspaceModeInput = 'auto' | 'one_off' | 'series' | 'portfolio';
export type WorkspaceProfileId = 'one_off' | 'series' | 'portfolio';

export type TopologyProfile = {
  workspace_mode: 'one_off' | 'series' | 'portfolio';
  project_collection_path: string;
  series_capable_skeleton?: boolean;
  profile_role?: 'canonical';
  canonical_profile_id?: 'one_off' | 'series' | 'portfolio';
  shared_resource_roots: string[];
  project_stage_outputs_root: string;
};

export type WorkspaceLifecycleStatus = 'active' | 'paused' | 'archived' | 'superseded' | 'locked';

export type WorkspaceProfileBinding = {
  profile_id: WorkspaceProfileId;
  profile_version: string;
  profile_contract_ref: string;
  profile_fingerprint: string;
  applied_at: string;
  applied_by: 'opl_workspace_init' | 'opl_workspace_ensure' | 'opl_workspace_adopt' | 'opl_workspace_upgrade';
  migration_history: Array<{
    event: 'initialized' | 'ensured' | 'adopted' | 'upgraded' | 'project_appended' | 'project_lifecycle_updated';
    profile_version: string;
    applied_at: string;
    project_roots_moved: false;
    note: string;
  }>;
};

export type WorkspaceProjectIndexEntry = {
  project_id: string;
  project_root: string;
  project_config_ref: string;
  project_index_ref: string;
  stage_outputs_root: string;
  stage_outputs_manifest_ref: string;
  stage_outputs_index_ref: string;
  current_stage_pointer_ref: string;
  control_root: string;
  inputs_root: string;
  exports_root: string;
  packages_root: string;
  review_root: string;
  handoff_root: string;
  archive_root: string;
  canonical_semantics: {
    unit: 'project_unit';
    collection_role: 'project_units';
    domain_alias_is_canonical: false;
  };
  lifecycle: {
    status: WorkspaceLifecycleStatus;
    archived_at: string | null;
    archive_reason: string | null;
    paused_at: string | null;
    pause_reason: string | null;
    superseded_at: string | null;
    superseded_by_project_id: string | null;
    locked_at: string | null;
    lock_reason: string | null;
    retention_policy: 'keep_until_explicit_archive' | 'keep_until_explicit_delete_receipt';
    safe_delete_gate: 'domain_owner_receipt_required';
  };
};

export type WorkspaceCanonicalTopology = {
  workspace_unit: 'workspace_group';
  project_collection_role: 'project_units';
  project_collection_path: string;
  project_unit_kind: string;
  stage_artifact_unit: 'stage_artifact_unit';
  stage_outputs_root: string;
  owner_answer_unit: 'owner_receipt_or_typed_blocker';
};

export type WorkspaceDisplayLabels = {
  workspace: string;
  project_collection: string;
  project_unit: string;
  stage_outputs: string;
  shared_resources: string;
};

export type WorkspaceSharedResourceEntry = {
  path: string;
  role: string;
  manifest_ref: string;
  owner: 'workspace_group' | 'opl_framework_projection';
  user_visible: boolean;
  domain_truth_owner: 'domain_agent';
};

export const WORKSPACE_TOPOLOGY_CONTRACT_REF =
  'contracts/opl-framework/foundry-agent-series-contract.json#/workspace_topology_profile';
export const WORKSPACE_PROFILE_VERSION = 'workspace-topology-profile.v2';
export const WORKSPACE_PROFILE_FINGERPRINT = 'opl-workspace-topology-profile-v2-projects-stage-outputs';
export const OPL_GENERATED_ROOT = 'control/opl';
export const OPL_GENERATED_PROJECTIONS_ROOT = `${OPL_GENERATED_ROOT}/projections`;
export const OPL_GENERATED_REPORTS_ROOT = `${OPL_GENERATED_ROOT}/reports`;
export const WORKSPACE_TOPOLOGY_PROFILE_CONTRACT = {
  surface_kind: 'opl_workspace_topology_profile',
  version: 'workspace-topology-profile.v1',
  profile_id: 'opl.workspace_topology_profile.v1',
  topology_model: [
    'workspace_group',
    'project_unit',
    'stage_artifact_unit',
    'owner_receipt_or_typed_blocker',
  ],
  workspace_modes: ['one_off', 'series', 'portfolio'],
  default_project_stage_outputs_root: 'artifacts/stage_outputs',
  default_profiles: {
    one_off: {
      workspace_mode: 'one_off',
      profile_role: 'canonical',
      canonical_profile_id: 'one_off',
      project_collection_path: 'projects',
      series_capable_skeleton: true,
      shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
    series: {
      workspace_mode: 'series',
      profile_role: 'canonical',
      canonical_profile_id: 'series',
      project_collection_path: 'projects',
      shared_resource_roots: [
        'shared/sources',
        'shared/brand',
        'shared/visual_memory',
        'shared/style_system',
        'shared/material_inventory',
      ],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
    portfolio: {
      workspace_mode: 'portfolio',
      profile_role: 'canonical',
      canonical_profile_id: 'portfolio',
      project_collection_path: 'projects',
      shared_resource_roots: ['data', 'literature', 'memory', 'shared/sources'],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
  },
  domain_profile_defaults: Object.fromEntries(STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => [entry.agent_id, entry.workspace_profile.default_profile_id])),
  default_user_inspection_surface: {
    ordinary_user_default_surface: 'workspace_local_project_stage_outputs',
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
  workspace_initialization_policy: {
    default_workspace_mode: 'one_off',
    default_project_collection_path: 'projects',
    infer_series_when_user_requests_multiple_related_projects: true,
    infer_portfolio_when_user_requests_shared_workspace_with_multiple_projects: true,
    upgrading_one_off_to_series_must_not_move_existing_project_roots: true,
    explicit_workspace_mode_declaration_preferred: true,
  },
  example_project_layouts: {
    one_off: {
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
    series: {
      shared_roots: [
        'shared/sources',
        'shared/brand',
        'shared/visual_memory',
        'shared/style_system',
        'shared/material_inventory',
      ],
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
    portfolio: {
      shared_roots: ['data', 'literature', 'memory'],
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
  },
} as const;

const WORKSPACE_PROFILE_IDS = ['one_off', 'series', 'portfolio'] as const;

export function isWorkspaceProfileId(value: unknown): value is WorkspaceProfileId {
  return typeof value === 'string' && WORKSPACE_PROFILE_IDS.includes(value as WorkspaceProfileId);
}

const SHARED_RESOURCE_ROLES: Record<string, string> = {
  data: 'dataset_root',
  literature: 'literature_root',
  memory: 'memory_root',
  'shared/memory': 'memory_root',
  'shared/sources': 'source_intake',
  'shared/brand': 'brand_assets',
  'shared/visual_memory': 'visual_memory',
  'shared/style_system': 'style_system',
  'shared/material_inventory': 'material_inventory',
};

function topologyContract() {
  const value = WORKSPACE_TOPOLOGY_PROFILE_CONTRACT;
  if (!isRecord(value) || value.surface_kind !== 'opl_workspace_topology_profile') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Standard Foundry Agent series contract is missing workspace_topology_profile.',
      { contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF },
    );
  }
  return value;
}

export function profileFromTopologyContract(profileId: WorkspaceProfileId): TopologyProfile {
  const contract = topologyContract();
  const defaultProfiles = contract.default_profiles;
  if (!isRecord(defaultProfiles)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace topology profile default_profiles must be an object.',
      { contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF },
    );
  }
  const profile = defaultProfiles[profileId];
  if (!isRecord(profile)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace topology profile is missing the requested default profile.',
      { profile_id: profileId, contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF },
    );
  }
  const sharedRoots = profile.shared_resource_roots;
  if (!Array.isArray(sharedRoots) || !sharedRoots.every((entry) => typeof entry === 'string')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace topology profile shared_resource_roots must be a string array.',
      { profile_id: profileId, contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF },
    );
  }
  const workspaceMode = profile.workspace_mode;
  if (workspaceMode !== 'one_off' && workspaceMode !== 'series' && workspaceMode !== 'portfolio') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace topology profile workspace_mode is invalid.',
      { profile_id: profileId, workspace_mode: workspaceMode },
    );
  }
  return {
    workspace_mode: workspaceMode,
    project_collection_path: String(profile.project_collection_path),
    series_capable_skeleton: (profile as Record<string, unknown>).series_capable_skeleton === true,
    profile_role: 'canonical',
    canonical_profile_id:
      profile.canonical_profile_id === 'series' || profile.canonical_profile_id === 'portfolio'
        ? profile.canonical_profile_id
        : workspaceMode,
    shared_resource_roots: sharedRoots,
    project_stage_outputs_root: String(profile.project_stage_outputs_root),
  };
}

export function selectWorkspaceProfileId(
  agent: WorkspaceAgentProfile,
  requestedMode: WorkspaceModeInput,
): WorkspaceProfileId {
  return requestedMode === 'auto' ? agent.default_profile_id : requestedMode;
}

export function workspaceProjectEntry(
  projectId: string,
  projectRootRef: string,
  stageOutputsRootRef: string,
): WorkspaceProjectIndexEntry {
  return {
    project_id: projectId,
    project_root: projectRootRef,
    project_config_ref: `${projectRootRef}/project.yaml`,
    project_index_ref: `${projectRootRef}/project_index.json`,
    stage_outputs_root: stageOutputsRootRef,
    stage_outputs_manifest_ref: `${stageOutputsRootRef}/opl_stage_outputs_manifest.json`,
    stage_outputs_index_ref: `${stageOutputsRootRef}/stage_outputs_index.json`,
    current_stage_pointer_ref: `${stageOutputsRootRef}/current_stage.json`,
    control_root: `${projectRootRef}/control`,
    inputs_root: `${projectRootRef}/inputs`,
    exports_root: `${projectRootRef}/artifacts/exports`,
    packages_root: `${projectRootRef}/artifacts/packages`,
    review_root: `${projectRootRef}/review`,
    handoff_root: `${projectRootRef}/handoff`,
    archive_root: `${projectRootRef}/archive`,
    canonical_semantics: {
      unit: 'project_unit',
      collection_role: 'project_units',
      domain_alias_is_canonical: false,
    },
    lifecycle: {
      status: 'active',
      archived_at: null,
      archive_reason: null,
      paused_at: null,
      pause_reason: null,
      superseded_at: null,
      superseded_by_project_id: null,
      locked_at: null,
      lock_reason: null,
      retention_policy: 'keep_until_explicit_archive',
      safe_delete_gate: 'domain_owner_receipt_required',
    },
  };
}

export function buildWorkspaceProfileBinding(input: {
  profileId: WorkspaceProfileId;
  appliedAt: string;
  appliedBy: WorkspaceProfileBinding['applied_by'];
  event: WorkspaceProfileBinding['migration_history'][number]['event'];
  existingBinding?: Partial<WorkspaceProfileBinding> | null;
  note: string;
}): WorkspaceProfileBinding {
  const existingHistory = Array.isArray(input.existingBinding?.migration_history)
    ? input.existingBinding.migration_history.filter((entry): entry is WorkspaceProfileBinding['migration_history'][number] => (
        Boolean(entry)
        && typeof entry.event === 'string'
        && typeof entry.profile_version === 'string'
        && typeof entry.applied_at === 'string'
      ))
    : [];
  return {
    profile_id: input.profileId,
    profile_version: WORKSPACE_PROFILE_VERSION,
    profile_contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
    profile_fingerprint: WORKSPACE_PROFILE_FINGERPRINT,
    applied_at: input.appliedAt,
    applied_by: input.appliedBy,
    migration_history: [
      ...existingHistory,
      {
        event: input.event,
        profile_version: WORKSPACE_PROFILE_VERSION,
        applied_at: input.appliedAt,
        project_roots_moved: false,
        note: input.note,
      },
    ],
  };
}

export function toWorkspaceRelative(basePath: string, targetPath: string) {
  return path.relative(basePath, targetPath).split(path.sep).join('/');
}

export function buildCanonicalTopology(
  agent: WorkspaceAgentProfile,
  profile: TopologyProfile,
): WorkspaceCanonicalTopology {
  return {
    workspace_unit: 'workspace_group',
    project_collection_role: 'project_units',
    project_collection_path: profile.project_collection_path,
    project_unit_kind: agent.project_kind,
    stage_artifact_unit: 'stage_artifact_unit',
    stage_outputs_root: profile.project_stage_outputs_root,
    owner_answer_unit: 'owner_receipt_or_typed_blocker',
  };
}

export function buildWorkspaceDisplayLabels(
  agent: WorkspaceAgentProfile,
  profile: TopologyProfile,
): WorkspaceDisplayLabels {
  return {
    workspace: agent.workspace_kind,
    project_collection: agent.project_collection_label,
    project_unit: agent.project_kind,
    stage_outputs: profile.project_stage_outputs_root,
    shared_resources: 'shared_resources',
  };
}

export function buildSharedResources(profile: TopologyProfile): WorkspaceSharedResourceEntry[] {
  return profile.shared_resource_roots.map((resourcePath) => ({
    path: resourcePath,
    role: SHARED_RESOURCE_ROLES[resourcePath] ?? 'shared_resource',
    manifest_ref: `${resourcePath}/opl_resource_manifest.json`,
    owner: 'workspace_group',
    user_visible: true,
    domain_truth_owner: 'domain_agent',
  }));
}

export function expectedDomainTopologyProfile(input: {
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
}) {
  return {
    profile: input.profileId,
    workspace_mode: input.profile.workspace_mode,
    project_kind: input.agent.project_kind,
    project_collection_path: input.profile.project_collection_path,
    canonical_project_collection_role: 'project_units' as const,
    user_inspection_roots: [
      `${input.profile.project_collection_path}/<project-id>/${input.profile.project_stage_outputs_root}`,
    ],
    shared_resource_roots: input.profile.shared_resource_roots,
  };
}
