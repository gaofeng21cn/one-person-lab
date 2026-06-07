import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT } from './standard-domain-agent-scaffold-constants-parts/foundry-series.ts';
import type { AgentWorkspaceNormContract } from './types.ts';
import type { WorkspaceAgentProfile } from './workspace-agent-defaults.ts';

export type WorkspaceModeInput = 'auto' | 'one_off' | 'series' | 'portfolio';
export type WorkspaceProfileId = 'one_off' | 'rca_series' | 'mas_portfolio';

export type TopologyProfile = {
  workspace_mode: 'one_off' | 'series' | 'portfolio';
  project_collection_path: string;
  series_capable_skeleton?: boolean;
  shared_resource_roots: string[];
  project_stage_outputs_root: string;
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
    status: 'active' | 'archived';
    archived_at: string | null;
    archive_reason: string | null;
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
  'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/new_agent_scaffold/foundry_agent_series_contract/workspace_topology_profile';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function topologyContract() {
  const value = STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT.workspace_topology_profile;
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
    shared_resource_roots: sharedRoots,
    project_stage_outputs_root: String(profile.project_stage_outputs_root),
  };
}

export function defaultWorkspaceProfileId(agent: WorkspaceAgentProfile): WorkspaceProfileId {
  const contract = topologyContract();
  const defaults = contract.domain_profile_defaults;
  if (!isRecord(defaults)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace topology profile domain_profile_defaults must be an object.',
      { contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF },
    );
  }
  const profileId = defaults[agent.agent_id];
  if (profileId === 'one_off' || profileId === 'rca_series' || profileId === 'mas_portfolio') {
    return profileId;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Workspace topology profile is missing the agent default profile.',
    { agent_id: agent.agent_id, profile_id: profileId },
  );
}

export function selectWorkspaceProfileId(
  agent: WorkspaceAgentProfile,
  requestedMode: WorkspaceModeInput,
  commandName: 'workspace init' | 'workspace ensure' | 'workspace adopt' = 'workspace init',
): WorkspaceProfileId {
  if (requestedMode === 'auto') {
    return defaultWorkspaceProfileId(agent);
  }
  if (requestedMode === 'one_off') {
    return 'one_off';
  }
  if (requestedMode === 'series') {
    return 'rca_series';
  }
  if (requestedMode === 'portfolio') {
    if (agent.agent_id !== 'mas') {
      throw new FrameworkContractError(
        'cli_usage_error',
        `${commandName} --mode portfolio is reserved for MAS study portfolio workspaces.`,
        { agent_id: agent.agent_id, mode: requestedMode },
      );
    }
    return 'mas_portfolio';
  }
  return defaultWorkspaceProfileId(agent);
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
    },
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
    project_collection: profile.project_collection_path,
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
  contract: AgentWorkspaceNormContract;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
}) {
  const projection = input.contract.domain_topology_profiles[input.agent.agent_id] ?? null;
  return {
    profile: input.profileId,
    workspace_mode: input.profile.workspace_mode,
    project_kind: input.agent.project_kind,
    project_collection_path: input.profile.project_collection_path,
    shared_resource_roots: input.profile.shared_resource_roots,
    projected_profile: projection,
  };
}
