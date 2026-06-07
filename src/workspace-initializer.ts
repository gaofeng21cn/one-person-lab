import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import {
  AGENT_WORKSPACE_NORM_CONTRACT_REF,
  buildAgentWorkspaceNormProjection,
} from './agent-workspace-norm.ts';
import { STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT } from './standard-domain-agent-scaffold-constants-parts/foundry-series.ts';
import { readOplWorkspaceRoot } from './system-preferences.ts';
import type { AgentWorkspaceNormContract, FrameworkContracts } from './types.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import { bindWorkspace, getActiveWorkspaceBinding } from './workspace-registry.ts';

type WorkspaceModeInput = 'auto' | 'one_off' | 'series' | 'portfolio';
type WorkspaceProfileId = 'one_off' | 'rca_series' | 'mas_portfolio';

export type WorkspaceInitializeOptions = {
  agentId?: string;
  workspacePath?: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  title?: string;
  mode?: WorkspaceModeInput;
  bind?: boolean;
  dryRun?: boolean;
  force?: boolean;
};

export type WorkspaceEnsureOptions = WorkspaceInitializeOptions;

type TopologyProfile = {
  workspace_mode: 'one_off' | 'series' | 'portfolio';
  project_collection_path: string;
  series_capable_skeleton?: boolean;
  shared_resource_roots: string[];
  project_stage_outputs_root: string;
};

type WorkspaceProjectIndexEntry = {
  project_id: string;
  project_root: string;
  stage_outputs_root: string;
  control_root: string;
  review_root: string;
  handoff_root: string;
};

const WORKSPACE_TOPOLOGY_CONTRACT_REF =
  'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/new_agent_scaffold/foundry_agent_series_contract/workspace_topology_profile';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRequiredSegment(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new FrameworkContractError('cli_usage_error', `${field} cannot be empty.`, { field });
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${field} must be a single path segment, not a relative or nested path.`,
      { field, value },
    );
  }
  return trimmed;
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeMode(value: string | undefined): WorkspaceModeInput {
  const mode = normalizeOptionalString(value) ?? 'auto';
  if (mode === 'auto' || mode === 'one_off' || mode === 'series' || mode === 'portfolio') {
    return mode;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'workspace init --mode must be auto, one_off, series, or portfolio.',
    {
      mode,
      allowed_modes: ['auto', 'one_off', 'series', 'portfolio'],
    },
  );
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

function profileFromContract(profileId: WorkspaceProfileId): TopologyProfile {
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

function defaultProfileId(agent: WorkspaceAgentProfile): WorkspaceProfileId {
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

function selectProfileId(agent: WorkspaceAgentProfile, requestedMode: WorkspaceModeInput): WorkspaceProfileId {
  if (requestedMode === 'auto') {
    return defaultProfileId(agent);
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
        'workspace init --mode portfolio is reserved for MAS study portfolio workspaces.',
        { agent_id: agent.agent_id, mode: requestedMode },
      );
    }
    return 'mas_portfolio';
  }
  return defaultProfileId(agent);
}

function resolveWorkspacePath(options: WorkspaceInitializeOptions, agent: WorkspaceAgentProfile) {
  const explicitPath = normalizeOptionalString(options.workspacePath);
  const explicitRoot = normalizeOptionalString(options.workspaceRoot);
  if (explicitPath && explicitRoot) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace init accepts either --workspace or --workspace-root, not both.',
      { mutually_exclusive: ['--workspace', '--workspace-root'] },
    );
  }
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const configuredRoot = explicitRoot ?? readOplWorkspaceRoot().selected_path;
  if (!configuredRoot) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace init requires --workspace, --workspace-root, or a configured OPL workspace root.',
      { required_one_of: ['--workspace', '--workspace-root', 'opl workspace root set --path <dir>'] },
    );
  }
  const workspaceId = normalizeRequiredSegment(
    normalizeOptionalString(options.workspaceId) ?? agent.default_workspace_id,
    'workspace_id',
  );
  return path.resolve(configuredRoot, workspaceId);
}

function ensureDir(dirPath: string, created: string[]) {
  if (fs.existsSync(dirPath)) {
    if (!fs.statSync(dirPath).isDirectory()) {
      throw new FrameworkContractError('cli_usage_error', 'Workspace init path exists but is not a directory.', {
        path: dirPath,
      });
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  created.push(dirPath);
}

function assertWritableMetadataPath(filePath: string, force: boolean | undefined) {
  if (!fs.existsSync(filePath) || force) {
    return;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Workspace init would overwrite an existing OPL workspace metadata file; pass --force to refresh it.',
    { file: filePath },
  );
}

function workspaceProjectEntry(
  projectId: string,
  projectRootRef: string,
  stageOutputsRootRef: string,
): WorkspaceProjectIndexEntry {
  return {
    project_id: projectId,
    project_root: projectRootRef,
    stage_outputs_root: stageOutputsRootRef,
    control_root: `${projectRootRef}/control`,
    review_root: `${projectRootRef}/review`,
    handoff_root: `${projectRootRef}/handoff`,
  };
}

function readExistingWorkspaceIndex(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (parsed.surface_kind !== 'opl_workspace_index' || !Array.isArray(parsed.projects)) {
      throw new Error('Invalid OPL workspace_index shape.');
    }
    return parsed;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing workspace_index.json is invalid JSON or has an invalid OPL workspace shape.',
      {
        file: filePath,
        cause: error instanceof Error ? error.message : 'Unknown workspace_index parse failure.',
      },
    );
  }
}

function assertCompatibleExistingIndex(input: {
  existingIndex: Record<string, unknown>;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
}) {
  const existingAgent = isRecord(input.existingIndex.agent) ? input.existingIndex.agent : {};
  const existingProfile = isRecord(input.existingIndex.workspace_topology_profile)
    ? input.existingIndex.workspace_topology_profile
    : {};
  const blockers = [
    existingAgent.agent_id === input.agent.agent_id ? null : 'agent_id_mismatch',
    existingAgent.project_id === input.agent.project_id ? null : 'agent_project_id_mismatch',
    existingProfile.profile_id === input.profileId ? null : 'profile_id_mismatch',
    existingProfile.workspace_mode === input.profile.workspace_mode ? null : 'workspace_mode_mismatch',
    existingProfile.project_collection_path === input.profile.project_collection_path
      ? null
      : 'project_collection_path_mismatch',
    existingProfile.project_stage_outputs_root === input.profile.project_stage_outputs_root
      ? null
      : 'project_stage_outputs_root_mismatch',
  ].filter((entry): entry is string => Boolean(entry));

  if (blockers.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Workspace init cannot append to an existing workspace with a different OPL topology; use another workspace path.',
      {
        blockers,
        agent_id: input.agent.agent_id,
        profile_id: input.profileId,
      },
    );
  }
}

function normalizeExistingProjects(projects: unknown) {
  if (!Array.isArray(projects)) {
    return [];
  }
  return projects
    .filter(isRecord)
    .map((project) => ({
      project_id: String(project.project_id),
      project_root: String(project.project_root),
      stage_outputs_root: String(project.stage_outputs_root),
      control_root: String(project.control_root),
      review_root: String(project.review_root),
      handoff_root: String(project.handoff_root),
    }))
    .filter((project) => project.project_id.trim().length > 0);
}

function mergeWorkspaceProjects(
  existingProjects: WorkspaceProjectIndexEntry[],
  currentProject: WorkspaceProjectIndexEntry,
) {
  const projectIds = new Set<string>();
  const merged = [...existingProjects, currentProject]
    .reverse()
    .filter((project) => {
      if (projectIds.has(project.project_id)) {
        return false;
      }
      projectIds.add(project.project_id);
      return true;
    })
    .reverse();
  return {
    projects: merged,
    project_was_already_indexed: existingProjects.some((project) => (
      project.project_id === currentProject.project_id
    )),
  };
}

function toRelative(basePath: string, targetPath: string) {
  return path.relative(basePath, targetPath).split(path.sep).join('/');
}

function yamlScalar(value: string | boolean | number | null) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlList(values: string[], indent: string) {
  if (values.length === 0) {
    return [`${indent}[]`];
  }
  return values.map((value) => `${indent}- ${yamlScalar(value)}`);
}

function buildWorkspaceYaml(input: {
  workspaceId: string;
  title: string | null;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
}) {
  const lines = [
    'surface_kind: opl_workspace_config',
    'version: workspace-config.v1',
    `workspace_id: ${yamlScalar(input.workspaceId)}`,
    `title: ${yamlScalar(input.title)}`,
    `agent_id: ${yamlScalar(input.agent.agent_id)}`,
    `project_id: ${yamlScalar(input.agent.project_id)}`,
    `workspace_kind: ${yamlScalar(input.agent.workspace_kind)}`,
    `project_kind: ${yamlScalar(input.agent.project_kind)}`,
    'workspace_topology_profile:',
    `  contract_ref: ${yamlScalar(WORKSPACE_TOPOLOGY_CONTRACT_REF)}`,
    `  profile_id: ${yamlScalar(input.profileId)}`,
    `  workspace_mode: ${yamlScalar(input.profile.workspace_mode)}`,
    `  project_collection_path: ${yamlScalar(input.profile.project_collection_path)}`,
    `  project_stage_outputs_root: ${yamlScalar(input.profile.project_stage_outputs_root)}`,
    '  shared_resource_roots:',
    ...yamlList(input.profile.shared_resource_roots, '    '),
    'projects:',
  ];
  for (const project of input.projects) {
    lines.push(
      `  - project_id: ${yamlScalar(project.project_id)}`,
      `    project_root: ${yamlScalar(project.project_root)}`,
      `    stage_outputs_root: ${yamlScalar(project.stage_outputs_root)}`,
    );
  }
  lines.push(
    'authority_boundary:',
    '  opl_can_define_topology_contract: true',
    '  opl_can_project_workspace_refs: true',
    '  opl_can_write_domain_truth: false',
    '  opl_can_mutate_artifact_body: false',
    '  opl_can_create_owner_receipt: false',
    '  opl_can_create_typed_blocker: false',
  );
  return `${lines.join('\n')}\n`;
}

function buildInterfaceProjection(
  contract: AgentWorkspaceNormContract,
  agent: WorkspaceAgentProfile,
  workspacePath: string,
  projectId: string,
) {
  const initExample = `${contract.explicit_initialization.command} --agent ${agent.agent_id} --workspace ${workspacePath} --project-id ${projectId}`;
  const ensureExample = `${contract.default_workspace_precondition.command} --agent ${agent.agent_id} --project-id ${projectId}`;
  return {
    surface_kind: 'opl_workspace_initialize_interface_projection',
    owner: 'one-person-lab',
    action_id: contract.default_workspace_precondition.action_id,
    required_inputs: contract.default_workspace_precondition.required_inputs,
    optional_inputs: contract.default_workspace_precondition.optional_inputs,
    norm_contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
    cli: {
      command: contract.explicit_initialization.command,
      ensure_command: contract.default_workspace_precondition.command,
      example: initExample,
      ensure_example: ensureExample,
    },
    mcp: {
      ...contract.descriptor_delegates.mcp,
      command_contract_id: contract.default_workspace_precondition.action_id,
    },
    skill: {
      ...contract.descriptor_delegates.skill,
      instruction: 'Call the OPL workspace ensure action before running a MAS/MAG/RCA/OMA task.',
    },
    openai: {
      ...contract.descriptor_delegates.openai,
    },
    ai_sdk: {
      ...contract.descriptor_delegates.ai_sdk,
    },
  };
}

export function buildWorkspaceInitializeInterfaces(contracts: FrameworkContracts) {
  return {
    version: 'g2',
    workspace_interfaces: {
      surface_kind: 'opl_workspace_initialize_interfaces',
      owner: 'one-person-lab',
      boundary: {
        action_catalog_owner: 'opl_framework',
        is_domain_family_action_catalog: false,
        writes_opl_workspace_registry: true,
        writes_domain_truth: false,
        creates_owner_receipt: false,
        creates_typed_blocker: false,
        mutates_artifact_body: false,
      },
      workspace_norm: buildAgentWorkspaceNormProjection({
        contract: contracts.agentWorkspaceNorm,
        agentId: null,
      }),
      command_contract: {
        action_id: contracts.agentWorkspaceNorm.default_workspace_precondition.action_id,
        command: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
        initializer_command: contracts.agentWorkspaceNorm.explicit_initialization.command,
        required_inputs: contracts.agentWorkspaceNorm.default_workspace_precondition.required_inputs,
        optional_inputs: contracts.agentWorkspaceNorm.default_workspace_precondition.optional_inputs,
        norm_contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
      },
      supported_agents: contracts.agentWorkspaceNorm.supported_agents,
      surfaces: {
        cli: {
          command: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
          initializer_command: contracts.agentWorkspaceNorm.explicit_initialization.command,
          usage:
            'opl workspace ensure --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio]',
        },
        mcp: {
          ...contracts.agentWorkspaceNorm.descriptor_delegates.mcp,
          input_schema_ref: 'opl://workspace/ensure/input.schema.json',
          delegates_to: contracts.agentWorkspaceNorm.default_workspace_precondition.command,
          fallback_initializer: contracts.agentWorkspaceNorm.explicit_initialization.command,
        },
        skill: {
          ...contracts.agentWorkspaceNorm.descriptor_delegates.skill,
          instruction:
            'Use this OPL-owned ensure action before MAS/MAG/RCA/OMA task execution; it reuses an active workspace binding or initializes the default topology.',
        },
        app: {
          action_id: contracts.agentWorkspaceNorm.default_workspace_precondition.app_action_id,
          initializer_action_id: contracts.agentWorkspaceNorm.explicit_initialization.app_action_id,
          route: 'opl app action execute --action workspace_ensure --payload <json>',
        },
        openai: contracts.agentWorkspaceNorm.descriptor_delegates.openai,
        ai_sdk: contracts.agentWorkspaceNorm.descriptor_delegates.ai_sdk,
      },
    },
  };
}

function buildWorkspaceIndex(input: {
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
  projects: WorkspaceProjectIndexEntry[];
}) {
  return {
    surface_kind: 'opl_workspace_index',
    version: 'workspace-index.v1',
    workspace_id: input.workspaceId,
    title: input.title,
    workspace_path: input.workspacePath,
    created_at: input.createdAt,
    updated_at: input.createdAt,
    agent: {
      agent_id: input.agent.agent_id,
      label: input.agent.label,
      project_id: input.agent.project_id,
      project: input.agent.project,
      workspace_kind: input.agent.workspace_kind,
      project_kind: input.agent.project_kind,
    },
    workspace_topology_profile: {
      contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
      profile_id: input.profileId,
      workspace_mode: input.profile.workspace_mode,
      project_collection_path: input.profile.project_collection_path,
      shared_resource_roots: input.profile.shared_resource_roots,
      project_stage_outputs_root: input.profile.project_stage_outputs_root,
    },
    shared_resource_roots: input.profile.shared_resource_roots,
    projects: input.projects,
    user_inspection: {
      ordinary_user_default_surface: 'workspace_local_project_stage_outputs',
      default_stage_outputs: input.stageOutputsRootRef,
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
    }),
    interface_projection: buildInterfaceProjection(
      input.contracts.agentWorkspaceNorm,
      input.agent,
      input.workspacePath,
      input.projectId,
    ),
  };
}

export function initializeWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceInitializeOptions,
) {
  const agent = findWorkspaceAgentProfile(options.agentId);
  const mode = normalizeMode(options.mode);
  const profileId = selectProfileId(agent, mode);
  const profile = profileFromContract(profileId);
  const workspacePath = resolveWorkspacePath(options, agent);
  const workspaceId = normalizeRequiredSegment(path.basename(workspacePath), 'workspace_id');
  const projectId = normalizeRequiredSegment(
    normalizeOptionalString(options.projectId) ?? agent.default_project_id,
    'project_id',
  );
  const title = normalizeOptionalString(options.title);
  const createdAt = new Date().toISOString();
  const projectRoot = path.join(workspacePath, profile.project_collection_path, projectId);
  const stageOutputsRoot = path.join(projectRoot, profile.project_stage_outputs_root);
  const projectRootRef = toRelative(workspacePath, projectRoot);
  const stageOutputsRootRef = toRelative(workspacePath, stageOutputsRoot);
  const workspaceYamlPath = path.join(workspacePath, 'workspace.yaml');
  const workspaceIndexPath = path.join(workspacePath, 'workspace_index.json');
  const currentProject = workspaceProjectEntry(projectId, projectRootRef, stageOutputsRootRef);
  const existingIndex = options.force ? null : readExistingWorkspaceIndex(workspaceIndexPath);
  if (existingIndex) {
    assertCompatibleExistingIndex({ existingIndex, agent, profileId, profile });
  }
  const existingProjects = normalizeExistingProjects(existingIndex?.projects);
  const mergedProjects = mergeWorkspaceProjects(existingProjects, currentProject);
  const createdDirectories: string[] = [];

  const workspaceIndex = buildWorkspaceIndex({
    contracts,
    workspaceId,
    workspacePath,
    title,
    agent,
    profileId,
    profile,
    projectId,
    projectRootRef,
    stageOutputsRootRef,
    createdAt,
    projects: mergedProjects.projects,
  });
  if (existingIndex && typeof existingIndex.created_at === 'string') {
    workspaceIndex.created_at = existingIndex.created_at;
    workspaceIndex.updated_at = createdAt;
  }

  if (!options.dryRun) {
    if (!existingIndex) {
      assertWritableMetadataPath(workspaceYamlPath, options.force);
      assertWritableMetadataPath(workspaceIndexPath, options.force);
    }
    ensureDir(workspacePath, createdDirectories);
    for (const sharedRoot of profile.shared_resource_roots) {
      ensureDir(path.join(workspacePath, sharedRoot), createdDirectories);
    }
    ensureDir(path.join(workspacePath, profile.project_collection_path), createdDirectories);
    ensureDir(projectRoot, createdDirectories);
    for (const relativePath of [
      'control',
      profile.project_stage_outputs_root,
      'review',
      'handoff',
    ]) {
      ensureDir(path.join(projectRoot, relativePath), createdDirectories);
    }
    fs.writeFileSync(
      workspaceYamlPath,
      buildWorkspaceYaml({
        workspaceId,
        title,
        agent,
        profileId,
        profile,
        projects: mergedProjects.projects,
      }),
    );
    fs.writeFileSync(workspaceIndexPath, `${JSON.stringify(workspaceIndex, null, 2)}\n`);
  }

  const shouldBind = options.bind !== false;
  const bindingPayload = !options.dryRun && shouldBind
    ? bindWorkspace(contracts, {
        projectId: agent.project_id,
        workspacePath,
        label: title ?? `${agent.label} ${workspaceId}`,
        workspaceRoot: agent.agent_id === 'rca' ? workspacePath : undefined,
        deriveDirectEntry: false,
      })
    : null;

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_initialization: {
      surface_kind: 'opl_workspace_initialization',
      action: 'init',
      dry_run: options.dryRun === true,
      bind: shouldBind,
      metadata_action: existingIndex
        ? mergedProjects.project_was_already_indexed ? 'reused_existing_project' : 'appended_project'
        : 'created_workspace',
      project_was_already_indexed: mergedProjects.project_was_already_indexed,
      workspace_path: workspacePath,
      workspace_id: workspaceId,
      workspace_config_path: workspaceYamlPath,
      workspace_index_path: workspaceIndexPath,
      project_root: projectRoot,
      project_stage_outputs_root: stageOutputsRoot,
      created_directories: createdDirectories,
      agent: {
        agent_id: agent.agent_id,
        label: agent.label,
        project_id: agent.project_id,
        project: agent.project,
        workspace_kind: agent.workspace_kind,
        project_kind: agent.project_kind,
      },
      profile: {
        contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
        profile_id: profileId,
        workspace_mode: profile.workspace_mode,
        project_collection_path: profile.project_collection_path,
        shared_resource_roots: profile.shared_resource_roots,
        project_stage_outputs_root: profile.project_stage_outputs_root,
      },
      project: {
        project_id: projectId,
        project_root: projectRootRef,
        stage_outputs_root: stageOutputsRootRef,
      },
      indexed_projects: mergedProjects.projects,
      workspace_norm: workspaceIndex.workspace_norm,
      user_inspection: workspaceIndex.user_inspection,
      authority_boundary: workspaceIndex.authority_boundary,
      interface_projection: workspaceIndex.interface_projection,
      binding: bindingPayload?.workspace_catalog.binding ?? null,
    },
  };
}

function loadIndexedProject(indexPath: string, projectId: string) {
  const workspaceIndex = readExistingWorkspaceIndex(indexPath);
  const projects = normalizeExistingProjects(workspaceIndex?.projects);
  return projects.find((project) => project.project_id === projectId) ?? null;
}

export function ensureWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceEnsureOptions,
) {
  const agent = findWorkspaceAgentProfile(options.agentId);
  const projectId = normalizeRequiredSegment(
    normalizeOptionalString(options.projectId) ?? agent.default_project_id,
    'project_id',
  );
  const explicitWorkspacePath = normalizeOptionalString(options.workspacePath);
  const activeBinding = explicitWorkspacePath ? null : getActiveWorkspaceBinding(agent.project_id);
  const activeWorkspacePath = activeBinding?.workspace_path && fs.existsSync(activeBinding.workspace_path)
    ? activeBinding.workspace_path
    : null;
  const activeWorkspaceIndexPath = activeWorkspacePath
    ? path.join(activeWorkspacePath, 'workspace_index.json')
    : null;
  const indexedProject = activeWorkspaceIndexPath && fs.existsSync(activeWorkspaceIndexPath)
    ? loadIndexedProject(activeWorkspaceIndexPath, projectId)
    : null;

  if (activeWorkspacePath && activeWorkspaceIndexPath && indexedProject && !options.force) {
    return {
      version: 'g2',
      contracts_context: {
        contracts_dir: contracts.contractsDir,
        contracts_root_source: contracts.contractsRootSource,
      },
      workspace_initialization: {
        surface_kind: 'opl_workspace_initialization',
        action: 'ensure',
        ensure_status: 'reused_active_binding',
        dry_run: options.dryRun === true,
        bind: true,
        workspace_path: activeWorkspacePath,
        workspace_id: path.basename(activeWorkspacePath),
        workspace_config_path: path.join(activeWorkspacePath, 'workspace.yaml'),
        workspace_index_path: activeWorkspaceIndexPath,
        project_root: path.join(activeWorkspacePath, indexedProject.project_root),
        project_stage_outputs_root: path.join(activeWorkspacePath, indexedProject.stage_outputs_root),
        created_directories: [],
        agent: {
          agent_id: agent.agent_id,
          label: agent.label,
          project_id: agent.project_id,
          project: agent.project,
          workspace_kind: agent.workspace_kind,
          project_kind: agent.project_kind,
        },
        project: indexedProject,
        binding: activeBinding,
        workspace_norm: buildAgentWorkspaceNormProjection({
          contract: contracts.agentWorkspaceNorm,
          agentId: agent.agent_id,
        }),
        interface_projection: buildInterfaceProjection(
          contracts.agentWorkspaceNorm,
          agent,
          activeWorkspacePath,
          projectId,
        ),
      },
    };
  }

  const initialized = initializeWorkspace(contracts, {
    ...options,
    agentId: agent.agent_id,
    projectId,
    workspacePath: explicitWorkspacePath ?? activeWorkspacePath ?? options.workspacePath,
    bind: options.bind,
  });
  return {
    ...initialized,
    workspace_initialization: {
      ...initialized.workspace_initialization,
      action: 'ensure',
      ensure_status: activeWorkspacePath
        ? 'initialized_missing_project_in_active_binding'
        : 'initialized_default_workspace',
    },
  };
}
