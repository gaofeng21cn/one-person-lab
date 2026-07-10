import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  AGENT_WORKSPACE_NORM_CONTRACT_REF,
  buildAgentWorkspaceNormProjection,
} from './agent-workspace-norm.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import type { AgentWorkspaceNormContract, FrameworkContracts } from '../../kernel/types.ts';
import {
  buildWorkspaceLifecycle,
  CURRENT_STAGE_POINTER_BASENAME,
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  materializeWorkspaceGeneratedArtifacts,
  normalizeWorkspaceProjectEntry,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  STAGE_OUTPUTS_INDEX_BASENAME,
} from './workspace-artifacts.ts';
import {
  buildCanonicalTopology,
  buildWorkspaceProfileBinding,
  buildSharedResources,
  buildWorkspaceDisplayLabels,
  profileFromTopologyContract,
  expectedDomainTopologyProfile,
  isWorkspaceProfileId,
  selectWorkspaceProfileId,
  toWorkspaceRelative,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  workspaceProjectEntry,
  OPL_GENERATED_PROJECTIONS_ROOT,
  OPL_GENERATED_REPORTS_ROOT,
  type TopologyProfile,
  type WorkspaceModeInput,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import { bindWorkspace, getActiveWorkspaceBinding } from './workspace-registry.ts';
import { buildInterfaceProjection } from './workspace-initializer-parts/interfaces.ts';

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

function readExistingWorkspaceIndex(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
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
    .map((project) => normalizeWorkspaceProjectEntry(project))
    .filter((project) => project.project_id.trim().length > 0);
}

function profileIdFromWorkspaceIndex(index: Record<string, unknown> | null): WorkspaceProfileId | null {
  const profile = isRecord(index?.workspace_topology_profile) ? index.workspace_topology_profile : null;
  const profileId = profile?.profile_id;
  return isWorkspaceProfileId(profileId) ? profileId : null;
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

export function buildWorkspaceYaml(input: {
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

export { buildWorkspaceInitializeInterfaces } from './workspace-initializer-parts/interfaces.ts';

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

export function initializeWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceInitializeOptions,
) {
  const agent = findWorkspaceAgentProfile(options.agentId);
  const mode = normalizeMode(options.mode);
  const profileId = selectWorkspaceProfileId(agent, mode);
  const profile = profileFromTopologyContract(profileId);
  const workspacePath = resolveWorkspacePath(options, agent);
  const workspaceId = normalizeRequiredSegment(path.basename(workspacePath), 'workspace_id');
  const projectId = normalizeRequiredSegment(
    normalizeOptionalString(options.projectId) ?? agent.default_project_id,
    'project_id',
  );
  const title = normalizeOptionalString(options.title);
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const projectRoot = path.join(workspacePath, profile.project_collection_path, projectId);
  const stageOutputsRoot = path.join(projectRoot, profile.project_stage_outputs_root);
  const projectRootRef = toWorkspaceRelative(workspacePath, projectRoot);
  const stageOutputsRootRef = toWorkspaceRelative(workspacePath, stageOutputsRoot);
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
    updatedAt,
    projects: mergedProjects.projects,
    existingIndex,
    profileAppliedBy: 'opl_workspace_init',
    profileEvent: existingIndex
      ? mergedProjects.project_was_already_indexed ? 'ensured' : 'project_appended'
      : 'initialized',
  });
  if (existingIndex && typeof existingIndex.created_at === 'string') {
    workspaceIndex.created_at = existingIndex.created_at;
    workspaceIndex.updated_at = updatedAt;
  }

  let writtenGeneratedFiles: string[] = [];
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
      'inputs',
      profile.project_stage_outputs_root,
      'artifacts/exports',
      'artifacts/packages',
      'review',
      'handoff',
      'archive',
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
    writtenGeneratedFiles = materializeWorkspaceGeneratedArtifacts({
      workspaceId,
      title,
      workspacePath,
      agent,
      profile,
      projects: mergedProjects.projects,
      createdAt: workspaceIndex.created_at,
      updatedAt: workspaceIndex.updated_at,
    });
  }

  const shouldBind = options.bind !== false;
  const bindingPayload = !options.dryRun && shouldBind
    ? bindWorkspace(contracts, {
        projectId: agent.project_id,
        workspacePath,
        label: title ?? `${agent.label} ${workspaceId}`,
        workspaceRoot: agent.agent_id === 'rca' ? workspacePath : undefined,
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
      workspace_map_path: path.join(workspacePath, WORKSPACE_MAP_REF),
      workspace_health_path: path.join(workspacePath, WORKSPACE_HEALTH_REF),
      workspace_inspection_path: path.join(workspacePath, WORKSPACE_INSPECTION_REF),
      workspace_resource_inventory_path: path.join(workspacePath, WORKSPACE_RESOURCE_INVENTORY_REF),
      workspace_report_path: path.join(workspacePath, WORKSPACE_REPORT_REF),
      project_root: projectRoot,
      project_stage_outputs_root: stageOutputsRoot,
      created_directories: createdDirectories,
      written_generated_files: writtenGeneratedFiles,
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
        stage_outputs_manifest_ref: currentProject.stage_outputs_manifest_ref,
        lifecycle: currentProject.lifecycle,
      },
      indexed_projects: mergedProjects.projects,
      generated_refs: workspaceIndex.generated_refs,
      profile_binding: workspaceIndex.profile_binding,
      topology_events: workspaceIndex.topology_events,
      workspace_norm: workspaceIndex.workspace_norm,
      canonical_topology: workspaceIndex.canonical_topology,
      display_labels: workspaceIndex.display_labels,
      shared_resources: workspaceIndex.shared_resources,
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
    const refreshedIndex = readExistingWorkspaceIndex(activeWorkspaceIndexPath);
    const profileId = profileIdFromWorkspaceIndex(refreshedIndex) ?? selectWorkspaceProfileId(agent, 'auto');
    const profile = profileFromTopologyContract(profileId);
    if (refreshedIndex) {
      assertCompatibleExistingIndex({ existingIndex: refreshedIndex, agent, profileId, profile });
    }
    const projects = normalizeExistingProjects(refreshedIndex?.projects);
    const refreshedProject = projects.find((project) => project.project_id === projectId) ?? indexedProject;
    const workspaceId = normalizeRequiredSegment(path.basename(activeWorkspacePath), 'workspace_id');
    const updatedAt = new Date().toISOString();
    const title = typeof refreshedIndex?.title === 'string' && refreshedIndex.title.trim()
      ? refreshedIndex.title
      : null;
    const refreshedWorkspaceIndex = buildWorkspaceIndex({
      contracts,
      workspaceId,
      workspacePath: activeWorkspacePath,
      title,
      agent,
      profileId,
      profile,
      projectId,
      projectRootRef: refreshedProject.project_root,
      stageOutputsRootRef: refreshedProject.stage_outputs_root,
      createdAt: typeof refreshedIndex?.created_at === 'string' ? refreshedIndex.created_at : updatedAt,
      updatedAt,
      projects,
      existingIndex: refreshedIndex,
      profileAppliedBy: 'opl_workspace_ensure',
      profileEvent: 'ensured',
    });
    if (typeof refreshedIndex?.created_at === 'string') {
      refreshedWorkspaceIndex.created_at = refreshedIndex.created_at;
    }
    const createdDirectories: string[] = [];
    let writtenGeneratedFiles: string[] = [];
    if (!options.dryRun) {
      ensureDir(activeWorkspacePath, createdDirectories);
      for (const sharedRoot of profile.shared_resource_roots) {
        ensureDir(path.join(activeWorkspacePath, sharedRoot), createdDirectories);
      }
      ensureDir(path.join(activeWorkspacePath, profile.project_collection_path), createdDirectories);
      for (const project of projects) {
        const projectRoot = path.join(activeWorkspacePath, project.project_root);
        ensureDir(projectRoot, createdDirectories);
        for (const relativePath of [
          project.control_root,
          project.inputs_root,
          project.stage_outputs_root,
          project.exports_root,
          project.packages_root,
          project.review_root,
          project.handoff_root,
          project.archive_root,
        ]) {
          ensureDir(path.join(activeWorkspacePath, relativePath), createdDirectories);
        }
      }
      fs.writeFileSync(
        path.join(activeWorkspacePath, 'workspace.yaml'),
        buildWorkspaceYaml({
          workspaceId,
          title,
          agent,
          profileId,
          profile,
          projects,
        }),
      );
      fs.writeFileSync(activeWorkspaceIndexPath, `${JSON.stringify(refreshedWorkspaceIndex, null, 2)}\n`);
      writtenGeneratedFiles = materializeWorkspaceGeneratedArtifacts({
        workspaceId,
        title,
        workspacePath: activeWorkspacePath,
        agent,
        profile,
        projects,
        createdAt: refreshedWorkspaceIndex.created_at,
        updatedAt: refreshedWorkspaceIndex.updated_at,
      });
    }
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
        workspace_map_path: path.join(activeWorkspacePath, WORKSPACE_MAP_REF),
        workspace_health_path: path.join(activeWorkspacePath, WORKSPACE_HEALTH_REF),
        workspace_inspection_path: path.join(activeWorkspacePath, WORKSPACE_INSPECTION_REF),
        workspace_resource_inventory_path: path.join(activeWorkspacePath, WORKSPACE_RESOURCE_INVENTORY_REF),
        project_root: path.join(activeWorkspacePath, refreshedProject.project_root),
        project_stage_outputs_root: path.join(activeWorkspacePath, refreshedProject.stage_outputs_root),
        created_directories: createdDirectories,
        written_generated_files: writtenGeneratedFiles,
        agent: {
          agent_id: agent.agent_id,
          label: agent.label,
          project_id: agent.project_id,
          project: agent.project,
          workspace_kind: agent.workspace_kind,
          project_kind: agent.project_kind,
        },
        project: refreshedProject,
        indexed_projects: projects,
        generated_refs: refreshedWorkspaceIndex.generated_refs,
        profile_binding: refreshedWorkspaceIndex.profile_binding,
        topology_events: refreshedWorkspaceIndex.topology_events,
        user_inspection: refreshedWorkspaceIndex.user_inspection,
        binding: activeBinding,
        workspace_norm: refreshedWorkspaceIndex.workspace_norm,
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
    workspaceRoot: explicitWorkspacePath || activeWorkspacePath ? undefined : options.workspaceRoot,
    workspaceId: explicitWorkspacePath || activeWorkspacePath ? undefined : options.workspaceId,
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
