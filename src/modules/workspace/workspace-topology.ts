import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  WORKSPACE_PROFILE_FINGERPRINT,
  WORKSPACE_PROFILE_VERSION,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  WORKSPACE_TOPOLOGY_PROFILE_CONTRACT,
} from '../../kernel/workspace-topology-profile-contract.ts';
export {
  OPL_GENERATED_PROJECTIONS_ROOT,
  OPL_GENERATED_REPORTS_ROOT,
  OPL_GENERATED_ROOT,
  WORKSPACE_PROFILE_FINGERPRINT,
  WORKSPACE_PROFILE_VERSION,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  WORKSPACE_TOPOLOGY_PROFILE_CONTRACT,
} from '../../kernel/workspace-topology-profile-contract.ts';
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
  owner_answer_unit: 'progress_receipt_or_owner_answer_or_hard_stop';
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
    owner_answer_unit: 'progress_receipt_or_owner_answer_or_hard_stop',
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
