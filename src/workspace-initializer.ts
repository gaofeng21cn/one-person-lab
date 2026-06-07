import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { STANDARD_FOUNDRY_AGENT_SERIES_CONTRACT } from './standard-domain-agent-scaffold-constants-parts/foundry-series.ts';
import { readOplWorkspaceRoot } from './system-preferences.ts';
import type { FrameworkContracts } from './types.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import { bindWorkspace } from './workspace-registry.ts';

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

type TopologyProfile = {
  workspace_mode: 'one_off' | 'series' | 'portfolio';
  project_collection_path: string;
  series_capable_skeleton?: boolean;
  shared_resource_roots: string[];
  project_stage_outputs_root: string;
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
  projectId: string;
  projectRootRef: string;
  stageOutputsRootRef: string;
}) {
  return `${[
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
    `  - project_id: ${yamlScalar(input.projectId)}`,
    `    project_root: ${yamlScalar(input.projectRootRef)}`,
    `    stage_outputs_root: ${yamlScalar(input.stageOutputsRootRef)}`,
    'authority_boundary:',
    '  opl_can_define_topology_contract: true',
    '  opl_can_project_workspace_refs: true',
    '  opl_can_write_domain_truth: false',
    '  opl_can_mutate_artifact_body: false',
    '  opl_can_create_owner_receipt: false',
    '  opl_can_create_typed_blocker: false',
  ].join('\n')}\n`;
}

function buildInterfaceProjection(agent: WorkspaceAgentProfile, workspacePath: string, projectId: string) {
  const example = [
    'opl',
    'workspace',
    'init',
    '--agent',
    agent.agent_id,
    '--workspace',
    workspacePath,
    '--project-id',
    projectId,
  ].join(' ');
  return {
    surface_kind: 'opl_workspace_initialize_interface_projection',
    owner: 'one-person-lab',
    action_id: 'opl_workspace_initialize',
    required_inputs: ['agent_id', 'workspace_path_or_workspace_root'],
    optional_inputs: ['workspace_id', 'project_id', 'mode', 'title', 'dry_run', 'force', 'bind'],
    cli: {
      command: 'opl workspace init',
      example,
    },
    mcp: {
      tool_name: 'opl_workspace_initialize',
      execution: 'delegate_to_opl_cli',
      command_contract_id: 'opl_workspace_initialize',
      descriptor_only: true,
      public_runtime: false,
    },
    skill: {
      intent: 'initialize_opl_workspace',
      command_contract_id: 'opl_workspace_initialize',
      instruction: 'Call the OPL workspace initializer before running a domain task when no active workspace binding exists.',
    },
    openai: {
      tool_name: 'opl_workspace_initialize',
    },
    ai_sdk: {
      tool_name: 'oplWorkspaceInitialize',
    },
  };
}

export function buildWorkspaceInitializeInterfaces() {
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
      command_contract: {
        action_id: 'opl_workspace_initialize',
        command: 'opl workspace init',
        required_inputs: ['agent_id'],
        optional_inputs: ['workspace_path_or_workspace_root', 'workspace_id', 'project_id', 'mode', 'title', 'dry_run', 'force', 'bind'],
      },
      supported_agents: ['mas', 'mag', 'rca', 'oma'],
      surfaces: {
        cli: {
          command: 'opl workspace init',
          usage:
            'opl workspace init --agent <mas|mag|rca|oma> [--workspace <path>|--workspace-root <dir>] [--workspace-id <id>] [--project-id <id>] [--mode auto|one_off|series|portfolio]',
        },
        mcp: {
          tool_name: 'opl_workspace_initialize',
          execution: 'delegate_to_opl_cli',
          descriptor_only: true,
          public_runtime: false,
          input_schema_ref: 'opl://workspace/initialize/input.schema.json',
        },
        skill: {
          intent: 'initialize_opl_workspace',
          command_contract_id: 'opl_workspace_initialize',
          instruction:
            'Use this OPL-owned initializer when a MAS/MAG/RCA/OMA task needs a workspace and no active binding exists.',
        },
        app: {
          action_id: 'workspace_initialize',
          route: 'opl app action execute --action workspace_initialize --payload <json>',
        },
        openai: {
          tool_name: 'opl_workspace_initialize',
        },
        ai_sdk: {
          tool_name: 'oplWorkspaceInitialize',
        },
      },
    },
  };
}

function buildWorkspaceIndex(input: {
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
}) {
  return {
    surface_kind: 'opl_workspace_index',
    version: 'workspace-index.v1',
    workspace_id: input.workspaceId,
    title: input.title,
    workspace_path: input.workspacePath,
    created_at: input.createdAt,
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
    projects: [
      {
        project_id: input.projectId,
        project_root: input.projectRootRef,
        stage_outputs_root: input.stageOutputsRootRef,
        control_root: `${input.projectRootRef}/control`,
        review_root: `${input.projectRootRef}/review`,
        handoff_root: `${input.projectRootRef}/handoff`,
      },
    ],
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
    interface_projection: buildInterfaceProjection(input.agent, input.workspacePath, input.projectId),
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
  const createdDirectories: string[] = [];

  const workspaceIndex = buildWorkspaceIndex({
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
  });

  if (!options.dryRun) {
    assertWritableMetadataPath(workspaceYamlPath, options.force);
    assertWritableMetadataPath(workspaceIndexPath, options.force);
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
        projectId,
        projectRootRef,
        stageOutputsRootRef,
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
      user_inspection: workspaceIndex.user_inspection,
      authority_boundary: workspaceIndex.authority_boundary,
      interface_projection: workspaceIndex.interface_projection,
      binding: bindingPayload?.workspace_catalog.binding ?? null,
    },
  };
}
